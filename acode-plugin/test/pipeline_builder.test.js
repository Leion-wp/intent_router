const assert = require('assert');
const {
  actionToIntent,
  intentToAction,
  filterRoutableActions,
  sanitizePipelineFilename,
  validatePipelineStructure,
  PipelineBuilderUI,
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
    this.value = '';
    this.type = 'text';
    this.placeholder = '';
    this.rows = 0;
    this.disabled = false;
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
        const tag = child.tagName ? child.tagName.toLowerCase() : '';
        if (tag === selector.toLowerCase()) {
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
      addedFolder: [{ url: 'file:///workspace' }],
      confirm: () => true
    };
  });

  afterEach(() => {
    teardownMockDocument();
    delete global.window;
  });

  describe('1. Pure Helper Functions', () => {
    it('converts action names to intent names and vice-versa', () => {
      assert.strictEqual(actionToIntent('file:read'), 'file.read');
      assert.strictEqual(actionToIntent('terminal:exec'), 'terminal.exec');
      assert.strictEqual(intentToAction('file.read'), 'file:read');
      assert.strictEqual(intentToAction('network.request'), 'network:request');
    });

    it('filters out internal router:* commands and sorts routable actions', () => {
      const actions = [
        'router:list',
        'file:read',
        'router:logs',
        'terminal:exec',
        'router:capabilities',
        'network:request'
      ];
      const filtered = filterRoutableActions(actions);
      assert.deepStrictEqual(filtered, ['file:read', 'network:request', 'terminal:exec']);
    });

    it('sanitizes pipeline filenames and protects against path traversal', () => {
      const res1 = sanitizePipelineFilename('my-test-pipeline');
      assert.strictEqual(res1.fileName, 'my-test-pipeline.intent.json');
      assert.strictEqual(res1.relativePath, 'pipeline/my-test-pipeline.intent.json');

      const res2 = sanitizePipelineFilename('my-test-pipeline.intent.json');
      assert.strictEqual(res2.fileName, 'my-test-pipeline.intent.json');

      const res3 = sanitizePipelineFilename('../../evil/path/hack');
      assert.strictEqual(res3.fileName, 'hack.intent.json');
      assert.strictEqual(res3.relativePath, 'pipeline/hack.intent.json');

      assert.throws(() => sanitizePipelineFilename('  '), { code: 'invalid_pipeline_filename' });
    });

    it('validates pipeline structure according to specification contract', () => {
      const validPipeline = {
        name: 'test-pipeline',
        steps: [
          { id: 'step_1', intent: 'file.read', payload: { path: 'file.txt' } },
          { id: 'step_2', intent: 'system.toast', payload: { message: 'Done' }, continueOnError: true }
        ]
      };
      assert.strictEqual(validatePipelineStructure(validPipeline), true);

      // Invalid: missing steps
      assert.throws(() => validatePipelineStructure({ name: 'bad' }), { code: 'invalid_pipeline_structure' });

      // Invalid: step payload is array
      assert.throws(() => validatePipelineStructure({
        steps: [{ id: 'step_1', intent: 'file.read', payload: [1, 2] }]
      }), { code: 'invalid_pipeline_structure' });

      // Invalid: step payload is non-object
      assert.throws(() => validatePipelineStructure({
        steps: [{ id: 'step_1', intent: 'file.read', payload: "invalid" }]
      }), { code: 'invalid_pipeline_structure' });

      // Invalid: duplicate step ID
      assert.throws(() => validatePipelineStructure({
        steps: [
          { id: 'dup_id', intent: 'file.read', payload: {} },
          { id: 'dup_id', intent: 'file.write', payload: {} }
        ]
      }), { code: 'invalid_pipeline_structure' });
    });
  });

  describe('2. PipelineBuilderUI Tactile Controls & File Operations', () => {
    function createMockRouter(existingFiles = {}) {
      const commandsMap = new Map([
        ['router:list', () => {}],
        ['router:logs', () => {}],
        ['file:read', () => {}],
        ['file:write', () => {}],
        ['terminal:exec', () => {}]
      ]);

      const toastLogs = [];
      const alertLogs = [];
      const writtenFiles = {};

      const mockFs = (url) => ({
        exists: async () => url in existingFiles || url in writtenFiles,
        createDirectory: async () => {},
        writeFile: async (content) => {
          writtenFiles[url] = content;
        }
      });

      const router = {
        $page: {
          settitle: () => {},
          innerHTML: '',
          append: function (child) { this.children = this.children || []; this.children.push(child); },
          show: () => {}
        },
        commands: commandsMap,
        requireFs: () => mockFs,
        toast: (msg) => toastLogs.push(msg),
        alert: (title, msg) => alertLogs.push({ title, msg }),
        pipelineUI: {
          getProjectRoot: async () => 'file:///workspace',
          loadPipelines: async () => {},
          render: async () => {}
        },
        toastLogs,
        alertLogs,
        writtenFiles
      };

      return router;
    }

    it('renders initial step and tactile buttons in PipelineBuilderUI', async () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      assert.strictEqual(builder.steps.length, 1);
      assert.strictEqual(builder.steps[0].action, 'file:read');

      const buttons = builder.$container.querySelectorAll('button');
      const addStepBtn = buttons.find(b => b.textContent === '+ Add Step');
      const saveBtn = buttons.find(b => b.textContent === 'Save Pipeline');

      assert.ok(addStepBtn, '+ Add Step button exists');
      assert.ok(saveBtn, 'Save Pipeline button exists');
    });

    it('supports adding, reordering (↑/↓) and removing steps', async () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      // Add 2 steps
      const addStepBtn = builder.$container.querySelectorAll('button').find(b => b.textContent === '+ Add Step');
      addStepBtn.onclick();
      addStepBtn.onclick();

      assert.strictEqual(builder.steps.length, 3);
      builder.steps[0].action = 'file:read';
      builder.steps[1].action = 'terminal:exec';
      builder.steps[2].action = 'file:write';
      builder.buildUI();

      // Verify order before swap
      assert.strictEqual(builder.steps[0].action, 'file:read');
      assert.strictEqual(builder.steps[1].action, 'terminal:exec');
      assert.strictEqual(builder.steps[2].action, 'file:write');

      // Click Move Up on Step 2 (index 1) to swap with Step 1
      const stepCards = builder.$container.querySelectorAll('strong').filter(s => s.textContent.startsWith('Step '));
      assert.strictEqual(stepCards.length, 3);

      const step2Card = stepCards[1].parentNode.parentNode;
      const moveUpBtn = step2Card.querySelectorAll('button').find(b => b.textContent === '↑');
      moveUpBtn.onclick();

      // Order should now be terminal:exec, file:read, file:write
      assert.strictEqual(builder.steps[0].action, 'terminal:exec');
      assert.strictEqual(builder.steps[1].action, 'file:read');
      assert.strictEqual(builder.steps[2].action, 'file:write');

      // Click Delete on Step 3 (index 2)
      const step3Card = builder.$container.querySelectorAll('strong').find(s => s.textContent === 'Step 3').parentNode.parentNode;
      const deleteBtn = step3Card.querySelectorAll('button').find(b => b.textContent === '✕');
      deleteBtn.onclick();

      assert.strictEqual(builder.steps.length, 2);
      assert.strictEqual(builder.steps[0].action, 'terminal:exec');
      assert.strictEqual(builder.steps[1].action, 'file:read');
    });

    it('rejects save when JSON payload is invalid and displays error diagnostic', async () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      await builder.render();

      builder.steps[0].rawPayload = '{ invalid_json: ';
      await builder.savePipeline();

      assert.strictEqual(router.writtenFiles['file:///workspace/pipeline/new-pipeline.intent.json'], undefined);
      assert.strictEqual(router.alertLogs.length, 1);
      assert.ok(router.alertLogs[0].msg.includes('invalid JSON payload'));
    });

    it('validates pipeline structure and saves .intent.json file under workspace pipeline/', async () => {
      const router = createMockRouter();
      const builder = new PipelineBuilderUI(router);
      builder.pipelineName = 'mobile-build-pipeline';
      await builder.render();

      builder.steps = [
        { id: 'step_1', action: 'file:read', rawPayload: '{\n  "path": "src/main.js"\n}' },
        { id: 'step_2', action: 'terminal:exec', rawPayload: '{\n  "command": "npm test"\n}' }
      ];
      builder.buildUI();

      await builder.savePipeline();

      const savedUrl = 'file:///workspace/pipeline/mobile-build-pipeline.intent.json';
      assert.ok(savedUrl in router.writtenFiles, 'File written at correct URL');

      const savedContent = JSON.parse(router.writtenFiles[savedUrl]);
      assert.strictEqual(savedContent.name, 'mobile-build-pipeline');
      assert.strictEqual(savedContent.steps.length, 2);
      assert.strictEqual(savedContent.steps[0].intent, 'file.read');
      assert.strictEqual(savedContent.steps[1].intent, 'terminal.exec');
      assert.deepStrictEqual(savedContent.steps[0].payload, { path: 'src/main.js' });
      assert.deepStrictEqual(savedContent.steps[1].payload, { command: 'npm test' });
    });

    it('executes generated pipeline with PipelineRunner', async () => {
      const routedCalls = [];
      const mockRouter = {
        route: async (params) => {
          routedCalls.push(params);
          return { success: true, data: { ok: true } };
        },
        log: () => {}
      };

      const runner = new PipelineRunner(mockRouter);
      const generatedPipeline = {
        name: 'mobile-build-pipeline',
        steps: [
          { id: 'step_1', intent: 'file.read', payload: { path: 'src/main.js' } },
          { id: 'step_2', intent: 'terminal.exec', payload: { command: 'npm test' } }
        ]
      };

      const res = await runner.runPipelineFromData(generatedPipeline);
      assert.strictEqual(res.success, true);
      assert.strictEqual(routedCalls.length, 2);
      assert.strictEqual(routedCalls[0].action, 'file:read');
      assert.strictEqual(routedCalls[1].action, 'terminal:exec');
    });
  });
});
