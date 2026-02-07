import * as assert from 'assert';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const { runPipelineFromData } = require('../../out/pipelineRunner');
const { pipelineEventBus } = require('../../out/eventBus');
Module.prototype.require = originalRequire;

type TestPipeline = {
  name: string;
  steps: any[];
  meta?: any;
};

function buildSwitchPipeline(routes: any[], modeValue: string): TestPipeline {
  return {
    name: 'switch-conditions',
    steps: [
      { id: 'set_mode', intent: 'system.setVar', payload: { name: 'mode', value: modeValue } },
      { id: 'switch_1', intent: 'system.switch', payload: { variableKey: 'mode', routes, defaultStepId: 'hit_default' } },
      { id: 'hit_contains', intent: 'system.setVar', payload: { name: 'hit_contains', value: '1' } },
      { id: 'hit_exists', intent: 'system.setVar', payload: { name: 'hit_exists', value: '1' } },
      { id: 'hit_regex', intent: 'system.setVar', payload: { name: 'hit_regex', value: '1' } },
      { id: 'hit_default', intent: 'system.setVar', payload: { name: 'hit_default', value: '1' } }
    ],
    meta: {
      ui: {
        nodes: [],
        edges: [
          { source: 'start', target: 'set_mode' },
          { source: 'set_mode', target: 'switch_1' },
          { source: 'switch_1', sourceHandle: 'route_0', target: 'hit_contains' },
          { source: 'switch_1', sourceHandle: 'route_1', target: 'hit_exists' },
          { source: 'switch_1', sourceHandle: 'route_2', target: 'hit_regex' },
          { source: 'switch_1', sourceHandle: 'default', target: 'hit_default' }
        ]
      }
    }
  };
}

async function runAndCollectStepIds(pipeline: TestPipeline): Promise<string[]> {
  const stepIds: string[] = [];
  const sub = pipelineEventBus.on((event: any) => {
    if (event.type === 'stepStart' && event.stepId) {
      stepIds.push(String(event.stepId));
    }
  });

  try {
    await runPipelineFromData(pipeline, true);
  } finally {
    sub.dispose();
  }
  return stepIds;
}

suite('Switch Conditions (Mocked)', () => {
  suiteTeardown(() => {
    Module.prototype.require = originalRequire;
  });

  test('contains route wins before exists', async () => {
    const pipeline = buildSwitchPipeline(
      [
        { label: 'contains-dev', condition: 'contains', value: 'dev', targetStepId: 'hit_contains' },
        { label: 'exists', condition: 'exists', value: '', targetStepId: 'hit_exists' },
        { label: 'regex', condition: 'regex', value: '^prod$', targetStepId: 'hit_regex' }
      ],
      'devops'
    );

    const stepIds = await runAndCollectStepIds(pipeline);
    assert.ok(stepIds.includes('hit_contains'), `Expected contains route. Got: ${stepIds.join(', ')}`);
    assert.ok(!stepIds.includes('hit_exists'), `Exists route should be blocked. Got: ${stepIds.join(', ')}`);
    assert.ok(!stepIds.includes('hit_default'), `Default route should be blocked. Got: ${stepIds.join(', ')}`);
  });

  test('regex route matches when valid', async () => {
    const pipeline = buildSwitchPipeline(
      [
        { label: 'contains-dev', condition: 'contains', value: 'dev', targetStepId: 'hit_contains' },
        { label: 'regex-prod', condition: 'regex', value: '^prod-\\d+$', targetStepId: 'hit_regex' },
        { label: 'exists', condition: 'exists', value: '', targetStepId: 'hit_exists' }
      ],
      'prod-123'
    );

    const stepIds = await runAndCollectStepIds(pipeline);
    assert.ok(stepIds.includes('hit_regex'), `Expected regex route. Got: ${stepIds.join(', ')}`);
    assert.ok(!stepIds.includes('hit_default'), `Default route should be blocked. Got: ${stepIds.join(', ')}`);
  });

  test('invalid regex falls back to default', async () => {
    const pipeline = buildSwitchPipeline(
      [
        { label: 'bad-regex', condition: 'regex', value: '(', targetStepId: 'hit_regex' }
      ],
      'anything'
    );

    const stepIds = await runAndCollectStepIds(pipeline);
    assert.ok(stepIds.includes('hit_default'), `Expected default route. Got: ${stepIds.join(', ')}`);
    assert.ok(!stepIds.includes('hit_regex'), `Invalid regex route should not match. Got: ${stepIds.join(', ')}`);
  });
});
