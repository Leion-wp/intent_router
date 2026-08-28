const assert = require('assert');
const {
  actionToIntent,
  intentToAction,
  filterRoutableActions,
  sanitizePipelineFilename,
  validatePipelineStructure,
  PipelineBuilderUI,
  PipelineUI,
  PipelineRunner
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
    this.placeholder = '';
    this.options = [];
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => typeof c === 'string' ? c : (c.textContent || '')).join('');
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
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION') {
      this.options.push(child);
    }
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
        const tag = selector.toUpperCase();
        if (child.tagName === tag) {
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

describe('Acode Sequential Pipeline Builder Tests', () => {
  beforeEach(() => {
    setupMockDocument();
    global.window = {
      addedFolder: [{ url: 'file:///workspace' }]
    };
  });

  afterEach(() => {
    teardownMockDocument();
    delete global.window;
  });

  describe('Pure Helper Functions', () => {
    it('1. actionToIntent converts colons to dots (e.g. file:read -> file.read)', () => {
      assert.strictEqual(actionToIntent('file:read'), 'file.read');
      assert.strictEqual(actionToIntent('terminal:run:cmd'), 'terminal.run.cmd');
      assert.strictEqual(actionToIntent(''), '');
      assert.strictEqual(actionToIntent(null), '');
    });

    it('2. intentToAction converts dots to colons (e.g. file.read -> file:read)', () => {
      assert.strictEqual(intentToAction('file.read'), 'file:read');
      assert.strictEqual(intentToAction('terminal.run.cmd'), 'terminal:run:cmd');
      assert.strictEqual(intentToAction(''), '');
      assert.strictEqual(intentToAction(null), '');
    });

    it('3. filterRoutableActions excludes internal router:* commands and sorts actions', () => {
      const keys = ['system:toast', 'router:list', 'file:read', 'router:capabilities', 'terminal:exec', 'editor:open_file'];
      const filtered = filterRoutableActions(keys);
      assert.deepStrictEqual(filtered, ['editor:open_file', 'file:read', 'system:toast', 'terminal:exec']);
    });

    it('4. sanitizePipelineFilename validates and normalizes pipeline names', () => {
      assert.strictEqual(sanitizePipelineFilename('my_pipeline'), 'my_pipeline.intent.json');
      assert.strictEqual(sanitizePipelineFilename('build-app.intent.json'), 'build-app.intent.json');
      assert.strictEqual(sanitizePipelineFilename('  test_123  '), 'test_123.intent.json');
      assert.strictEqual(sanitizePipelineFilename('my pipeline!'), 'my_pipeline_.intent.json');

      assert.throws(() => sanitizePipelineFilename(''), { code: 'invalid_pipeline_name' });
      assert.throws(() => sanitizePipelineFilename('../evil'), { code: 'invalid_pipeline_name' });
      assert.throws(() => sanitizePipelineFilename('folder/name'), { code: 'invalid_pipeline_name' });
      assert.throws(() => sanitizePipelineFilename('folder\\name'), { code: 'invalid_pipeline_name' });
    });

    it('5. validatePipelineStructure rejects invalid pipeline structures', () => {
      assert.strictEqual(validatePipelineStructure({ name: 'test', steps: [{ id: 's1', intent: 'file.read', payload: {} }] }), true);

      assert.throws(() => validatePipelineStructure(null), { code: 'invalid_pipeline_structure' });
      assert.throws(() => validatePipelineStructure({ steps: 'not_array' }), { code: 'invalid_pipeline_structure' });
      assert.throws(() => validatePipelineStructure({ steps: [{ id: '', intent: 'file.read', payload: {} }] }), { code: 'invalid_pipeline_structure' });
      assert.throws(() => validatePipelineStructure({ steps: [{ id: 's1', intent: '', payload: {} }] }), { code: 'invalid_pipeline_structure' });
      assert.throws(() => validatePipelineStructure({ steps: [{ id: 's1', intent: 'file.read', payload: null }] }), { code: 'invalid_pipeline_structure' });
      assert.throws(() => validatePipelineStructure({ steps: [
        { id: 's1', intent: 'file.read', payload: {} },
        { id: 's1', intent: 'system.toast', payload: {} }
      ] }), { code: 'invalid_pipeline_structure' });
    });
  });

  describe('PipelineBuilderUI Integration & DOM Controls', () => {
    function createMockRouter(existingFiles = {}) {
      const commands = new Map([
        ['file:read', async () => ({ content: 'hello' })],
        ['terminal:run', async () => ({ exitCode: 0 })],
        ['network:request', async () => ({ status: 200 })],
        ['router:list', async () => []],
        ['router:logs', async () => []]
      ]);

      const mockFs = existingFiles;

      const router = {
        commands,
        $page: {
          settitle: () => {},
          innerHTML: '',
          append: function (child) { this.children = this.children || []; this.children.push(child); },
          show: () => {},
          hide: () => {}
        },
        requireFs: () => (url) => ({
          exists: async () => url in mockFs,
          readFile: async () => mockFs[url] || '',
          writeFile: async (content) => { mockFs[url] = content; },
          createDirectory: async () => {}
        }),
        toast: (msg) => { router.lastToast = msg; },
        alert: (title, msg) => { router.lastAlert = { title, msg }; },
        route: async (intent) => {
          const action = intent.action;
          const handler = commands.get(action);
          if (handler) return { success: true, data: await handler(intent.data) };
          return { success: false, error: 'Command not found' };
        }
      };

      router.pipelineRunner = new PipelineRunner(router);
      router.pipelineUI = new PipelineUI(router);

      return router;
    }

    it('6. Uses runtime registered commands (excluding router:*) as options in dropdowns', () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      const actions = builder.getAvailableActions();

      assert.deepStrictEqual(actions, ['file:read', 'network:request', 'terminal:run']);
      assert.ok(!actions.includes('router:list'));
      assert.ok(!actions.includes('router:logs'));
    });

    it('7. Interactive step manipulation: add, move up/down, remove', async () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      // Starts with 1 step by default
      assert.strictEqual(builder.steps.length, 1);
      assert.strictEqual(builder.steps[0].action, 'file:read');

      // Add 2 more steps
      builder.steps.push({ id: 'step_2', action: 'terminal:run', payloadText: '{"command":"ls"}' });
      builder.steps.push({ id: 'step_3', action: 'network:request', payloadText: '{"url":"https://example.com"}' });
      builder.renderForm();

      assert.strictEqual(builder.steps.length, 3);
      assert.strictEqual(builder.steps[0].action, 'file:read');
      assert.strictEqual(builder.steps[1].action, 'terminal:run');
      assert.strictEqual(builder.steps[2].action, 'network:request');

      // Move Step 3 up -> order becomes: file:read, network:request, terminal:run
      const cards = builder.$stepsContainer.children;
      const step3Card = cards[2];
      const moveUpBtn = step3Card.querySelectorAll('BUTTON').find(b => b.textContent === '↑');
      moveUpBtn.onclick();

      assert.strictEqual(builder.steps[0].action, 'file:read');
      assert.strictEqual(builder.steps[1].action, 'network:request');
      assert.strictEqual(builder.steps[2].action, 'terminal:run');

      // Move Step 1 down -> order becomes: network:request, file:read, terminal:run
      const step1Card = builder.$stepsContainer.children[0];
      const moveDownBtn = step1Card.querySelectorAll('BUTTON').find(b => b.textContent === '↓');
      moveDownBtn.onclick();

      assert.strictEqual(builder.steps[0].action, 'network:request');
      assert.strictEqual(builder.steps[1].action, 'file:read');
      assert.strictEqual(builder.steps[2].action, 'terminal:run');

      // Remove middle step (file:read)
      const middleCard = builder.$stepsContainer.children[1];
      const removeBtn = middleCard.querySelectorAll('BUTTON').find(b => b.textContent === '✕');
      removeBtn.onclick();

      assert.strictEqual(builder.steps.length, 2);
      assert.strictEqual(builder.steps[0].action, 'network:request');
      assert.strictEqual(builder.steps[1].action, 'terminal:run');
    });

    it('8. Invalid JSON payload displays error diagnostic and prevents save', async () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      builder.pipelineName = 'invalid_payload_test';
      builder.steps[0].payloadText = '{ invalid json: }';
      builder.updatePreview();

      assert.ok(builder.$errorMsg.style.display !== 'none');
      assert.ok(builder.$errorMsg.textContent.includes('invalid JSON'));

      await builder.handleSave();
      assert.ok(builder.$errorMsg.textContent.includes('JSON syntax error'));
    });

    it('9. Non-object JSON payload (e.g. array or primitive) displays error and prevents save', async () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      builder.pipelineName = 'array_payload_test';
      builder.steps[0].payloadText = '[1, 2, 3]';
      builder.updatePreview();

      assert.ok(builder.$errorMsg.style.display !== 'none');
      assert.ok(builder.$errorMsg.textContent.includes('must be a JSON object'));

      await builder.handleSave();
      assert.ok(builder.$errorMsg.textContent.includes('must be a JSON object'));
    });

    it('10. Path traversal in pipeline name is rejected', async () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      builder.pipelineName = '../evil_pipeline';
      await builder.handleSave();

      assert.ok(builder.$errorMsg.textContent.includes('invalid path characters or path traversal'));
    });

    it('11. Successful save creates file strictly under <workspace>/pipeline/<safe-name>.intent.json and passes validation', async () => {
      const existingFiles = {};
      const router = createMockRouter(existingFiles);
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      builder.pipelineName = 'my_awesome_pipeline';
      builder.steps = [
        { id: 'step_1', action: 'file:read', payloadText: '{"path":"file:///workspace/data.txt"}' },
        { id: 'step_2', action: 'terminal:run', payloadText: '{"command":"echo done"}' }
      ];
      builder.renderForm();

      const expectedJsonPreview = builder.$previewContainer.textContent;
      assert.ok(expectedJsonPreview.includes('"intent": "file.read"'));
      assert.ok(expectedJsonPreview.includes('"intent": "terminal.run"'));

      await builder.handleSave();

      const savedUrl = 'file:///workspace/pipeline/my_awesome_pipeline.intent.json';
      assert.ok(savedUrl in existingFiles, 'File was written to workspace pipeline directory');

      const savedContent = existingFiles[savedUrl];
      const parsed = JSON.parse(savedContent);

      assert.strictEqual(parsed.name, 'my_awesome_pipeline');
      assert.strictEqual(parsed.steps.length, 2);
      assert.strictEqual(parsed.steps[0].id, 'step_1');
      assert.strictEqual(parsed.steps[0].intent, 'file.read');
      assert.deepStrictEqual(parsed.steps[0].payload, { path: 'file:///workspace/data.txt' });
      assert.strictEqual(parsed.steps[1].id, 'step_2');
      assert.strictEqual(parsed.steps[1].intent, 'terminal.run');
      assert.deepStrictEqual(parsed.steps[1].payload, { command: 'echo done' });

      // Ensure created file passes validation
      assert.strictEqual(validatePipelineStructure(parsed), true);
    });

    it('12. Created pipeline can be immediately executed by PipelineRunner', async () => {
      const existingFiles = {};
      const router = createMockRouter(existingFiles);

      // Create pipeline file
      const pipelineData = {
        name: 'test_exec',
        steps: [
          { id: 's1', intent: 'file.read', payload: { path: 'file:///workspace/test.txt' } },
          { id: 's2', intent: 'terminal.run', payload: { command: 'pwd' } }
        ]
      };
      const fileUrl = 'file:///workspace/pipeline/test_exec.intent.json';
      existingFiles[fileUrl] = JSON.stringify(pipelineData);

      // Run pipeline from saved file
      const result = await router.pipelineRunner.runPipelineFromFile(fileUrl);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.logs.length, 2);
      assert.strictEqual(result.logs[0].intent, 'file.read');
      assert.strictEqual(result.logs[1].intent, 'terminal.run');
    });

    it('13. Overwrite protection: prompts confirmation if file already exists', async () => {
      const fileUrl = 'file:///workspace/pipeline/existing_pipeline.intent.json';
      const existingFiles = {
        [fileUrl]: '{"name":"old"}'
      };
      const router = createMockRouter(existingFiles);
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      builder.pipelineName = 'existing_pipeline';
      builder.steps = [{ id: 'step_1', action: 'file:read', payloadText: '{}' }];

      let confirmPromptMessage = null;
      global.confirm = (msg) => {
        confirmPromptMessage = msg;
        return false; // User cancels overwrite
      };

      await builder.handleSave();

      assert.ok(confirmPromptMessage.includes("already exists"));
      assert.strictEqual(existingFiles[fileUrl], '{"name":"old"}', 'File was NOT overwritten because user canceled');

      global.confirm = () => true; // User accepts overwrite
      await builder.handleSave();

      assert.notStrictEqual(existingFiles[fileUrl], '{"name":"old"}');
      assert.ok(existingFiles[fileUrl].includes('file.read'));

      delete global.confirm;
    });
  });
});
