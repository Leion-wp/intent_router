const assert = require('assert');
const { createAcodeEnvironment } = require('./harness');

async function testUiXssProtection() {
  const env = createAcodeEnvironment();
  const { router, mocks } = env;

  try {
    // 1. Verify escapeHtml escaping logic directly
    const unsafeText = '<script>alert("xss")</script>&"\'';
    const escaped = router.escapeHtml(unsafeText);
    assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&quot;&#039;');
    assert.ok(!escaped.includes('<script>'));

    // 2. Setup mock pipeline folder with a file that errors out
    const fileUrl = 'file:///sdcard/project/pipeline/bad.intent.json';
    mocks.fileStore.set(fileUrl, JSON.stringify({
      steps: [{ intent: 'test.fail' }]
    }));

    router.register('test:fail', () => {
      throw new Error('<img src=x onerror=alert(1)>');
    });

    // Render pipeline UI
    await router.pipelineUI.render();

    const container = router.pipelineUI.$container;
    assert.ok(container, 'UI container should be rendered');

    // Load pipeline cards
    await router.pipelineUI.loadPipelines();

    // Verify card creation for bad.intent.json
    const card = container.children[1].children[0];
    assert.ok(card, 'Pipeline card should be created');

    // Trigger runBtn.onclick
    const header = card.children[0];
    const controls = header.children[1];
    const runBtn = controls.children[1];
    const statusArea = card.children[1];

    runBtn.onclick();

    // Wait for async pipeline execution in UI
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check innerHTML of statusArea to ensure error message was safely escaped using escapeHtml
    assert.ok(statusArea.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!statusArea.innerHTML.includes('<img src=x onerror=alert(1)>'));

  } finally {
    await env.destroy();
  }
}

module.exports = testUiXssProtection;
