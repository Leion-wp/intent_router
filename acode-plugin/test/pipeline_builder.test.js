const assert = require('assert');
const {
  actionToIntent,
  intentToAction,
  filterRoutableActions,
  sanitizePipelineFilename,
  validatePipelineStructure,
  PipelineBuilderUI,
  PipelineUI,
  PipelineRunner,
  IntentRouter
} = require('../main.js');

class MockDOMNode {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this._textContent = '';
    this._innerHTML = '';
    this.onclick = null;
    this.oninput = null;
    this.onchange = null;
    this.disabled = false;
    this.value = '';
    this.type = '';
    this.rows = 0;
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => typeof c === 'string' ? c : c.textContent).join('');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML || this.children.map(c => typeof c === 'string' ? c : (c.outerHTML || '')).join('');
  }

  set innerHTML(val) {
    this._innerHTML = String(val);
    if (val === '') {
      this.children = [];
    }
  }

  appendChild(child) {
    if (child instanceof MockDocumentFragment) {
      const fragmentChildren = [...child.children];
      child.children = [];
      for (const fc of fragmentChildren) {
        fc.parentNode = this;
        this.children.push(fc);
      }
      return child;
    }
    if (child && typeof child === 'object') {
      child.parentNode = this;
    }
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  querySelectorAll(selector) {
    const results = [];
    const search = (node) => {
      for (const child of node.children) {
        if (typeof child !== 'object' || !child) continue;
        if (selector === 'button' && child.tagName === 'BUTTON') {
          results.push(child);
        } else if (selector === 'input' && child.tagName === 'INPUT') {
          results.push(child);
        } else if (selector === 'select' && child.tagName === 'SELECT') {
          results.push(child);
        } else if (selector === 'option' && child.tagName === 'OPTION') {
          results.push(child);
        } else if (selector === 'textarea' && child.tagName === 'TEXTAREA') {
          results.push(child);
        } else if (selector === 'pre' && child.tagName === 'PRE') {
          results.push(child);
        } else if (selector === 'strong' && child.tagName === 'STRONG') {
          results.push(child);
        }
        search(child);
      }
    };
    search(this);
    return results;
  }
}

class MockDocumentFragment {
  constructor() {
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function setupMockDocument() {
  global.document = {
    createElement: (tag) => new MockDOMNode(tag),
    createDocumentFragment: () => new MockDocumentFragment()
  };
}

function teardownMockDocument() {
  delete global.document;
}

describe('Tactile Sequential Pipeline Builder Tests', () => {
  beforeEach(() => {
    setupMockDocument();
    global.window = {
      addedFolder: [{ url: 'file:///workspace' }],
      confirm: () => true
    };
  });

  afterEach(() => {
    teardownMockDocument();
    delete global.window;
  });

  describe('Pure Helper Functions', () => {
    it('1. actionToIntent & intentToAction conversions', () => {
      assert.strictEqual(actionToIntent('file:read'), 'file.read');
      assert.strictEqual(actionToIntent('terminal:exec'), 'terminal.exec');
      assert.strictEqual(actionToIntent('custom:module:sub'), 'custom.module.sub');
      assert.strictEqual(actionToIntent(''), '');
      assert.strictEqual(actionToIntent(null), '');

      assert.strictEqual(intentToAction('file.read'), 'file:read');
      assert.strictEqual(intentToAction('terminal.exec'), 'terminal:exec');
      assert.strictEqual(intentToAction(''), '');
      assert.strictEqual(intentToAction(null), '');
    });

    it('2. filterRoutableActions filters out router:* commands', () => {
      const commands = [
        'router:list',
        'router:logs',
        'file:read',
        'file:write',
        'system:toast',
        'router:capabilities',
        'network:request'
      ];

      const routable = filterRoutableActions(commands);
      assert.deepStrictEqual(routable, [
        'file:read',
        'file:write',
        'system:toast',
        'network:request'
      ]);
    });

    it('3. sanitizePipelineFilename validates and normalizes filenames', () => {
      assert.strictEqual(sanitizePipelineFilename('my_pipeline'), 'my_pipeline.intent.json');
      assert.strictEqual(sanitizePipelineFilename('  deploy_job  '), 'deploy_job.intent.json');
      assert.strictEqual(sanitizePipelineFilename('test_run.intent.json'), 'test_run.intent.json');
      assert.strictEqual(sanitizePipelineFilename('test_run.json'), 'test_run.intent.json');
      assert.strictEqual(sanitizePipelineFilename('Build & Run!'), 'Build___Run.intent.json');

      assert.throws(() => sanitizePipelineFilename(''), /Pipeline name cannot be empty/);
      assert.throws(() => sanitizePipelineFilename(null), /Pipeline name is required/);
      assert.throws(() => sanitizePipelineFilename('../evil'), /path separators or traversal not allowed/);
      assert.throws(() => sanitizePipelineFilename('dir/file'), /path separators or traversal not allowed/);
      assert.throws(() => sanitizePipelineFilename('dir\\file'), /path separators or traversal not allowed/);
    });

    it('4. validatePipelineStructure schema validation', () => {
      const validDoc = {
        name: 'test_pipeline',
        steps: [
          { id: 'step_1', intent: 'file.read', payload: { path: '/tmp/test.txt' } },
          { id: 'step_2', intent: 'system.toast', payload: { message: 'Done' } }
        ]
      };
      assert.strictEqual(validatePipelineStructure(validDoc), true);

      assert.throws(() => validatePipelineStructure(null), /root must be an object/);
      assert.throws(() => validatePipelineStructure({ name: '', steps: [] }), /name must be a non-empty string/);
      assert.throws(() => validatePipelineStructure({ steps: 'not_array' }), /steps must be an array/);
      assert.throws(() => validatePipelineStructure({ steps: [{ id: '', intent: 'file.read' }] }), /must have a non-empty string id/);
      assert.throws(() => validatePipelineStructure({ steps: [{ id: '1', intent: '' }] }), /must have a non-empty string intent/);
      assert.throws(() => validatePipelineStructure({ steps: [{ id: '1', intent: 'file.read', payload: 'string' }] }), /payload must be a non-null object/);
      assert.throws(() => validatePipelineStructure({ steps: [{ id: 's1', intent: 'a' }, { id: 's1', intent: 'b' }] }), /Duplicate step id/);
    });
  });

  describe('PipelineBuilderUI Integration & Workflow', () => {
    function createMockRouter(existingFiles = {}) {
      const commands = new Map([
        ['router:list', () => {}],
        ['router:logs', () => {}],
        ['file:read', () => {}],
        ['file:write', () => {}],
        ['system:toast', () => {}],
        ['terminal:exec', () => {}]
      ]);

      const alerts = [];
      const toasts = [];

      const router = {
        commands,
        $page: {
          settitle: () => {},
          innerHTML: '',
          append: function (child) { this.children = this.children || []; this.children.push(child); },
          show: () => {}
        },
        alert: (title, msg) => alerts.push({ title, msg }),
        toast: (msg) => toasts.push(msg),
        requireFs: () => (url) => ({
          exists: async () => url in existingFiles || url === 'file:///workspace/pipeline',
          createDirectory: async () => {},
          writeFile: async (content) => { existingFiles[url] = content; }
        }),
        alerts,
        toasts,
        existingFiles
      };

      router.pipelineUI = new PipelineUI(router);
      router.pipelineBuilderUI = new PipelineBuilderUI(router);
      router.pipelineRunner = new PipelineRunner(router);
      return router;
    }

    it('5. Renders Builder UI with default step and dynamic capability list', async () => {
      const router = createMockRouter();
      const builder = router.pipelineBuilderUI;

      await builder.render();

      const inputs = router.$page.children[0].querySelectorAll('input');
      const selects = router.$page.children[0].querySelectorAll('select');
      const textareas = router.$page.children[0].querySelectorAll('textarea');
      const pre = router.$page.children[0].querySelectorAll('pre')[0];

      assert.strictEqual(inputs[0].value, 'my_pipeline');
      assert.strictEqual(selects.length, 1);

      // Verify options came from runtime router commands (excluding router:*)
      const options = selects[0].querySelectorAll('option').map(o => o.value);
      assert.deepStrictEqual(options, ['file:read', 'file:write', 'system:toast', 'terminal:exec']);

      const previewObj = JSON.parse(pre.textContent);
      assert.strictEqual(previewObj.name, 'my_pipeline');
      assert.strictEqual(previewObj.steps.length, 1);
      assert.strictEqual(previewObj.steps[0].id, 'step_1');
      assert.strictEqual(previewObj.steps[0].intent, 'file.read');
    });

    it('6. Add, Delete, and Reorder steps (Move Up / Down)', async () => {
      const router = createMockRouter();
      const builder = router.pipelineBuilderUI;

      await builder.render();

      // Tap + Add Step twice -> 3 steps total
      const addStepBtn = router.$page.children[0].querySelectorAll('button').find(b => b.textContent === '+ Add Step');
      addStepBtn.onclick();
      addStepBtn.onclick();

      assert.strictEqual(builder.steps.length, 3);
      assert.strictEqual(builder.steps[0].id, 'step_1');
      assert.strictEqual(builder.steps[1].id, 'step_2');
      assert.strictEqual(builder.steps[2].id, 'step_3');

      // Change action of step 2 to system:toast
      const selects = router.$page.children[0].querySelectorAll('select');
      selects[1].onchange({ target: { value: 'system:toast' } });
      assert.strictEqual(builder.steps[1].action, 'system:toast');

      // Reorder: Move step 2 UP to step 1
      const stepCards = builder.$stepsContainer.children;
      const step2Card = stepCards[1];
      const moveUpBtn = step2Card.querySelectorAll('button').find(b => b.textContent === '↑');
      moveUpBtn.onclick();

      assert.strictEqual(builder.steps[0].action, 'system:toast');
      assert.strictEqual(builder.steps[0].id, 'step_1');
      assert.strictEqual(builder.steps[1].action, 'file:read');
      assert.strictEqual(builder.steps[1].id, 'step_2');

      // Delete step 3 (which is now at index 2 in stepCards)
      const step3Card = builder.$stepsContainer.children[2];
      const deleteBtn = step3Card.querySelectorAll('button').find(b => b.textContent === 'Delete');
      deleteBtn.onclick();

      assert.strictEqual(builder.steps.length, 2);
      assert.strictEqual(builder.steps[0].id, 'step_1');
      assert.strictEqual(builder.steps[1].id, 'step_2');
    });

    it('7. Rejects save on invalid JSON payload with diagnostic alert', async () => {
      const router = createMockRouter();
      const builder = router.pipelineBuilderUI;
      await builder.render();

      const textarea = router.$page.children[0].querySelectorAll('textarea')[0];
      textarea.oninput({ target: { value: '{ invalid json }' } });

      await builder.savePipeline();

      assert.strictEqual(router.alerts.length, 1);
      assert.strictEqual(router.alerts[0].title, 'Validation Error');
      assert.ok(router.alerts[0].msg.includes('invalid JSON in payload'));
      assert.strictEqual(Object.keys(router.existingFiles).length, 0);
    });

    it('8. Rejects save on invalid path traversal name', async () => {
      const router = createMockRouter();
      const builder = router.pipelineBuilderUI;
      await builder.render();

      const nameInput = router.$page.children[0].querySelectorAll('input')[0];
      nameInput.oninput({ target: { value: '../hack_pipeline' } });

      await builder.savePipeline();

      assert.strictEqual(router.alerts.length, 1);
      assert.strictEqual(router.alerts[0].title, 'Validation Error');
      assert.ok(router.alerts[0].msg.includes('path separators or traversal not allowed'));
      assert.strictEqual(Object.keys(router.existingFiles).length, 0);
    });

    it('9. Overwrite protection: prompts on existing file and respects cancellation', async () => {
      const existingUrl = 'file:///workspace/pipeline/existing_pipe.intent.json';
      const existingFiles = { [existingUrl]: '{}' };
      const router = createMockRouter(existingFiles);
      const builder = router.pipelineBuilderUI;
      await builder.render();

      builder.pipelineName = 'existing_pipe';

      // User cancels overwrite prompt
      global.window.confirm = () => false;
      await builder.savePipeline();

      assert.strictEqual(router.toasts.includes('Save cancelled'), true);
      assert.strictEqual(existingFiles[existingUrl], '{}');

      // User accepts overwrite prompt
      global.window.confirm = () => true;
      await builder.savePipeline();

      assert.strictEqual(router.toasts.includes('Pipeline saved to pipeline/existing_pipe.intent.json'), true);
      assert.notStrictEqual(existingFiles[existingUrl], '{}');
    });

    it('10. Saves valid pipeline to workspace pipeline/ folder and enables execution via runner', async () => {
      const existingFiles = {};
      const router = createMockRouter(existingFiles);

      // Add route handler to mock actual execution
      let executedActions = [];
      router.route = async (intent) => {
        executedActions.push(intent);
        return { success: true, data: { status: 'ok' } };
      };

      const builder = router.pipelineBuilderUI;
      await builder.render();

      builder.pipelineName = 'custom_flow';
      builder.steps = [
        { id: 'step_1', action: 'file:read', payloadStr: '{"path": "foo.txt"}' },
        { id: 'step_2', action: 'system:toast', payloadStr: '{"message": "Hello!"}' }
      ];

      await builder.savePipeline();

      const targetUrl = 'file:///workspace/pipeline/custom_flow.intent.json';
      assert.ok(targetUrl in existingFiles, 'File was written to correct pipeline/ path');

      const savedJson = JSON.parse(existingFiles[targetUrl]);
      assert.strictEqual(savedJson.name, 'custom_flow');
      assert.strictEqual(savedJson.steps.length, 2);
      assert.strictEqual(savedJson.steps[0].intent, 'file.read');
      assert.strictEqual(savedJson.steps[0].payload.path, 'foo.txt');
      assert.strictEqual(savedJson.steps[1].intent, 'system.toast');
      assert.strictEqual(savedJson.steps[1].payload.message, 'Hello!');

      // Verify the generated pipeline can be executed directly by PipelineRunner
      const runResult = await router.pipelineRunner.runPipelineFromData(savedJson);
      assert.strictEqual(runResult.success, true);
      assert.strictEqual(executedActions.length, 2);
      assert.strictEqual(executedActions[0].action, 'file:read');
      assert.strictEqual(executedActions[1].action, 'system:toast');
    });
  });
});
