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

const { createSoftwareFactoryPreset, createSoftwareFactoryBranchPreset } = require('../../out/pipelineBuilder');
Module.prototype.require = originalRequire;

suite('Software Factory Preset (Mocked)', () => {
  test('creates expected team/review sequence', () => {
    const preset = createSoftwareFactoryPreset();
    assert.ok(preset);
    assert.strictEqual(preset.name, 'Software Factory Template');
    assert.ok(Array.isArray(preset.steps));
    assert.ok(preset.steps.length >= 15);

    const intents = preset.steps.map((step: any) => step.intent);
    const teamCount = intents.filter((intent: string) => intent === 'ai.team').length;
    const reviewCount = intents.filter((intent: string) => intent === 'vscode.reviewDiff').length;

    assert.ok(teamCount >= 6, `Expected at least 6 ai.team steps. Got: ${teamCount}`);
    assert.ok(reviewCount >= 6, `Expected at least 6 review steps. Got: ${reviewCount}`);
    assert.strictEqual(preset.steps[0].intent, 'ai.team');
    assert.strictEqual(preset.steps[1].intent, 'vscode.reviewDiff');
  });

  test('includes FE/BE implementation and PR handoff steps', () => {
    const preset = createSoftwareFactoryPreset();
    const byId = new Map<string, any>();
    for (const step of preset.steps) byId.set(step.id, step);

    assert.ok(byId.has('team.frontend'));
    assert.ok(byId.has('approve.frontend'));
    assert.ok(byId.has('team.backend'));
    assert.ok(byId.has('approve.backend'));
    assert.ok(byId.has('factory.capture_pr_targets'));
    assert.ok(byId.has('factory.open_frontend_pr'));
    assert.ok(byId.has('factory.open_backend_pr'));

    assert.strictEqual(byId.get('factory.open_frontend_pr').intent, 'github.openPr');
    assert.strictEqual(byId.get('factory.open_backend_pr').intent, 'github.openPr');
  });

  test('team members include role metadata', () => {
    const preset = createSoftwareFactoryPreset();
    const teamSteps = preset.steps.filter((step: any) => step.intent === 'ai.team');
    assert.ok(teamSteps.length > 0);
    for (const step of teamSteps) {
      const members = Array.isArray(step.payload?.members) ? step.payload.members : [];
      assert.ok(members.length > 0);
      for (const member of members) {
        assert.ok(member.role === 'writer' || member.role === 'reviewer');
      }
    }
  });

  test('creates FE/BE branch mode preset with git and github.openPr steps', () => {
    const preset = createSoftwareFactoryBranchPreset();
    assert.ok(preset);
    assert.strictEqual(preset.name, 'Software Factory FE-BE Branch Mode');
    assert.ok(Array.isArray(preset.steps));
    assert.ok(preset.steps.length >= 12);

    const byId = new Map<string, any>();
    for (const step of preset.steps) byId.set(step.id, step);

    assert.ok(byId.has('factory.capture_release_config'));
    assert.ok(byId.has('factory.push_frontend_branch'));
    assert.ok(byId.has('factory.open_frontend_pr'));
    assert.ok(byId.has('factory.push_backend_branch'));
    assert.ok(byId.has('factory.open_backend_pr'));

    assert.strictEqual(byId.get('factory.push_frontend_branch').intent, 'terminal.run');
    assert.strictEqual(byId.get('factory.open_frontend_pr').intent, 'github.openPr');
    assert.strictEqual(byId.get('factory.open_backend_pr').intent, 'github.openPr');
    assert.strictEqual(byId.get('factory.open_frontend_pr').payload?.head, 'feature/${var:ticketId}-frontend');
    assert.strictEqual(byId.get('factory.open_backend_pr').payload?.head, 'feature/${var:ticketId}-backend');
  });
});
