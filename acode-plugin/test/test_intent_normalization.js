const assert = require('assert');
const { createAcodeEnvironment } = require('./harness');

async function testIntentNormalization() {
  const env = createAcodeEnvironment();
  const { router } = env;

  try {
    // Test IntentRouter.normalizeAction directly
    assert.strictEqual(router.normalizeAction({ intent: 'file.read' }), 'file:read');
    assert.strictEqual(router.normalizeAction({ intent: 'editor.goto_line' }), 'editor:goto_line');
    assert.strictEqual(router.normalizeAction({ action: 'editor:open_file' }), 'editor:open_file');
    assert.strictEqual(router.normalizeAction({ scheme: 'system', intent: 'toast' }), 'system:toast');
    assert.strictEqual(router.normalizeAction({ scheme: 'file', action: 'read' }), 'file:read');

    // Test pipeline runner routing dotted intents (regression check for #120)
    let toastReceived = null;
    router.register('system:toast', (data) => {
      toastReceived = data.message;
      return { shown: true };
    });

    const pipelineData = {
      steps: [
        {
          intent: 'system.toast',
          payload: { message: 'Normalized successfully' }
        }
      ]
    };

    const result = await router.pipelineRunner.runPipelineFromData(pipelineData);
    assert.strictEqual(result.success, true);
    assert.strictEqual(toastReceived, 'Normalized successfully');
    assert.strictEqual(result.logs[0].intent, 'system.toast');
    assert.strictEqual(result.logs[0].success, true);

  } finally {
    await env.destroy();
  }
}

module.exports = testIntentNormalization;
