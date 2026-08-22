const assert = require('assert');
const { IntentRouter, PipelineRunner, redactSensitiveData } = require('../main.js');

describe('Acode Plugin - Dry-Run Planning Mode', () => {
  let router;
  let runner;
  let handlerCounts;

  beforeEach(() => {
    router = new IntentRouter();
    runner = new PipelineRunner(router);
    handlerCounts = {
      'file:read': 0,
      'file:write': 0,
      'terminal:exec': 0,
      'network:request': 0
    };

    router.setupCommands();

    router.register('file:read', async (data) => {
      handlerCounts['file:read']++;
      return 'file content';
    });
    router.register('file:write', async (data) => {
      handlerCounts['file:write']++;
      return { written: true, path: data.path };
    });
    router.register('terminal:exec', async (data) => {
      handlerCounts['terminal:exec']++;
      return { submitted: true, command: data.command };
    });
    router.register('network:request', async (data) => {
      handlerCounts['network:request']++;
      return { status: 200, body: 'ok' };
    });
  });

  it('redactSensitiveData correctly redacts sensitive keys and preserves safe data', () => {
    const input = {
      url: 'https://api.example.com',
      token: 'secret_token_123',
      headers: {
        Authorization: 'Bearer my_token'
      },
      nested: {
        apiKey: 'key_xyz',
        secret: 'shh_123',
        normalField: 'hello'
      },
      list: [
        { password: 'p1', name: 'user1' },
        { auth: 'token2', name: 'user2' }
      ]
    };

    const redacted = redactSensitiveData(input);
    assert.strictEqual(redacted.url, 'https://api.example.com');
    assert.strictEqual(redacted.token, '[REDACTED]');
    assert.strictEqual(redacted.headers.Authorization, '[REDACTED]');
    assert.strictEqual(redacted.nested.apiKey, '[REDACTED]');
    assert.strictEqual(redacted.nested.secret, '[REDACTED]');
    assert.strictEqual(redacted.nested.normalField, 'hello');
    assert.strictEqual(redacted.list[0].password, '[REDACTED]');
    assert.strictEqual(redacted.list[0].name, 'user1');
    assert.strictEqual(redacted.list[1].auth, '[REDACTED]');
    assert.strictEqual(redacted.list[1].name, 'user2');
  });

  it('meta.dryRun === true in route() prevents side-effects and returns planned step', async () => {
    const res = await router.route({
      intent: 'file.write',
      payload: { path: '/tmp/test.txt', content: 'hello', token: 'secret_123' },
      meta: { dryRun: true }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.planned, true);
    assert.strictEqual(res.data.action, 'file:write');
    assert.strictEqual(res.data.data.path, '/tmp/test.txt');
    assert.strictEqual(res.data.data.token, '[REDACTED]');
    assert.strictEqual(handlerCounts['file:write'], 0, 'file:write handler must NOT be invoked in dry-run');
  });

  it('runs 3-step pipeline in dry-run mode: generates ordered plan and invokes zero side-effect handlers', async () => {
    const pipelineData = {
      meta: { dryRun: true },
      steps: [
        { intent: 'file.read', payload: { path: '/tmp/input.txt' } },
        { intent: 'file.write', payload: { path: '/tmp/output.txt', content: 'test', secret: 'my_secret' } },
        { intent: 'terminal.exec', payload: { command: 'echo done' } }
      ]
    };

    const result = await runner.runPipelineFromData(pipelineData);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.plan.length, 3);

    assert.strictEqual(result.plan[0].step, 1);
    assert.strictEqual(result.plan[0].action, 'file:read');
    assert.strictEqual(result.plan[0].status, 'planned');

    assert.strictEqual(result.plan[1].step, 2);
    assert.strictEqual(result.plan[1].action, 'file:write');
    assert.strictEqual(result.plan[1].payload.secret, '[REDACTED]');
    assert.strictEqual(result.plan[1].status, 'planned');

    assert.strictEqual(result.plan[2].step, 3);
    assert.strictEqual(result.plan[2].action, 'terminal:exec');
    assert.strictEqual(result.plan[2].status, 'planned');

    assert.strictEqual(handlerCounts['file:read'], 0);
    assert.strictEqual(handlerCounts['file:write'], 0);
    assert.strictEqual(handlerCounts['terminal:exec'], 0);
  });

  it('resolves ${input:...} variables in dry-run mode without side effects', async () => {
    const pipelineData = {
      steps: [
        { intent: 'terminal.exec', payload: { command: 'echo ${input:Greeting}' } }
      ]
    };

    const variableCache = new Map();
    variableCache.set('Greeting', 'Hello World');

    const result = await runner.runPipelineFromData(pipelineData, null, { dryRun: true, variableCache });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.plan[0].payload.command, 'echo Hello World');
    assert.strictEqual(handlerCounts['terminal:exec'], 0);
  });

  it('preserves onFailure targets in plan metadata without executing them', async () => {
    const pipelineData = {
      steps: [
        {
          intent: 'network.request',
          payload: { url: 'https://example.com/api', token: 'bearer_123' },
          onFailure: 'step_cleanup'
        }
      ]
    };

    const result = await runner.runPipelineFromData(pipelineData, null, { dryRun: true });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.plan[0].onFailure, 'step_cleanup');
    assert.strictEqual(result.plan[0].payload.token, '[REDACTED]');
    assert.strictEqual(handlerCounts['network:request'], 0);
  });

  it('fails dry-run planning when an unknown action is present without executing side effects', async () => {
    const pipelineData = {
      steps: [
        { intent: 'unknown.action.does.not.exist', payload: { foo: 'bar' } },
        { intent: 'file.write', payload: { path: '/tmp/should_never_run.txt', content: 'no' } }
      ]
    };

    await assert.rejects(
      async () => {
        await runner.runPipelineFromData(pipelineData, null, { dryRun: true });
      },
      /Pipeline planning failed at step 1/
    );

    assert.strictEqual(handlerCounts['file:write'], 0);
  });

  it('executes pipeline normally when dryRun is false', async () => {
    const pipelineData = {
      steps: [
        { intent: 'file.write', payload: { path: '/tmp/real.txt', content: 'real execution' } }
      ]
    };

    const result = await runner.runPipelineFromData(pipelineData, null, { dryRun: false });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.dryRun, false);
    assert.strictEqual(handlerCounts['file:write'], 1);
  });

  it('supports pipeline:dry_run registered action in router', async () => {
    const pipeline = {
      steps: [
        { intent: 'file.read', payload: { path: '/tmp/test.txt' } }
      ]
    };

    const res = await router.route({
      action: 'pipeline:dry_run',
      data: { pipeline }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.dryRun, true);
    assert.strictEqual(res.data.plan.length, 1);
    assert.strictEqual(handlerCounts['file:read'], 0);
  });
});
