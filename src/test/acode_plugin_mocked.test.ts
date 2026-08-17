import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

class MockDOMNode {
  nodeType: number;
  private _text: string;

  constructor(nodeType: number, textContent: string = '') {
    this.nodeType = nodeType;
    this._text = textContent;
  }

  get textContent(): string {
    return this._text;
  }

  set textContent(val: string) {
    this._text = String(val);
  }
}

class MockElement extends MockDOMNode {
  tagName: string;
  style: Record<string, string>;
  children: MockElement[];
  childNodes: MockDOMNode[];
  disabled: boolean;
  onclick: (() => void) | null;
  title?: string;
  visible?: boolean;
  settitle?: (t: string) => void;
  show?: () => void;
  hide?: () => void;

  constructor(tagName: string) {
    super(1, '');
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.children = [];
    this.childNodes = [];
    this.disabled = false;
    this.onclick = null;
  }

  get textContent(): string {
    if (this.childNodes.length === 0) return '';
    return this.childNodes.map(n => n.textContent).join('');
  }

  set textContent(val: string) {
    this.children = [];
    const strVal = String(val);
    this.childNodes = [new MockDOMNode(3, strVal)];
  }

  appendChild(node: MockDOMNode | MockElement): MockDOMNode {
    if (node instanceof MockElement) {
      this.children.push(node);
    }
    this.childNodes.push(node);
    return node;
  }

  append(...nodes: (MockDOMNode | MockElement)[]): void {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  replaceChildren(...nodes: (MockDOMNode | MockElement)[]): void {
    this.children = [];
    this.childNodes = [];
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  querySelector(selector: string): MockElement | null {
    const sel = selector.toUpperCase();
    for (const child of this.children) {
      if (child.tagName === sel) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const sel = selector.toUpperCase();
    let results: MockElement[] = [];
    for (const child of this.children) {
      if (child.tagName === sel) results.push(child);
      results = results.concat(child.querySelectorAll(selector));
    }
    return results;
  }
}

function setupMockDOM() {
  const doc = {
    createElement(tag: string): MockElement {
      return new MockElement(tag);
    },
    createTextNode(text: string): MockDOMNode {
      return new MockDOMNode(3, String(text));
    }
  };

  const nav = { userAgent: 'MockAgent', platform: 'MockPlatform' };

  const win: any = {
    document: doc,
    navigator: nav,
    console: console,
    addedFolder: [{ url: 'file:///mock/project/' }]
  };

  (global as any).document = doc;
  (global as any).window = win;
  try {
    Object.defineProperty(global, 'navigator', {
      value: nav,
      writable: true,
      configurable: true
    });
  } catch (_) {}

  let pluginInitCb: ((baseUrl: string, $page: any, context: any) => Promise<void>) | null = null;
  win.acode = {
    require: (_modName: string) => null,
    setPluginInit: (_id: string, cb: any) => {
      pluginInitCb = cb;
    },
    setPluginUnmount: () => {}
  };

  // Load and execute main.js
  const mainJsPath = path.join(__dirname, '../../acode-plugin/main.js');
  const code = fs.readFileSync(mainJsPath, 'utf-8');
  const runInContext = new Function('window', 'document', 'navigator', 'acode', code);
  runInContext(win, doc, nav, win.acode);

  return { win, doc, getPluginInitCb: () => pluginInitCb };
}

suite('Acode Plugin Security & UI Tests (Mocked)', () => {
  let env: ReturnType<typeof setupMockDOM>;
  let router: any;
  let pageMock: any;

  setup(async () => {
    env = setupMockDOM();
    pageMock = new MockElement('DIV');
    pageMock.settitle = (title: string) => { pageMock.title = title; };
    pageMock.show = () => { pageMock.visible = true; };
    pageMock.hide = () => { pageMock.visible = false; };

    const initCb = env.getPluginInitCb();
    if (initCb) {
      await initCb('http://localhost/', pageMock, {});
    }
    router = (env.win as any).intentRouter;
  });

  test('PipelineRunner correctly converts dot-notated intents (file.read -> file:read)', async () => {
    let routedAction = '';
    router.route = async (intent: any) => {
      routedAction = intent.action;
      return { success: true };
    };

    const pipelineData = {
      steps: [
        { intent: 'file.read', payload: { path: '/test.txt' } }
      ]
    };

    const result = await router.pipelineRunner.runPipelineFromData(pipelineData);
    assert.strictEqual(result.success, true);
    assert.strictEqual(routedAction, 'file:read');
  });

  test('PipelineUI progress updates render malicious step.intent as literal text without HTML injection', async () => {
    const maliciousIntent = '<img src=x onerror=alert("XSS")><script>alert("HACK")</script>';
    const pipelineFile = {
      name: 'malicious.intent.json',
      url: 'file:///mock/project/pipeline/malicious.intent.json'
    };

    // Mock pipelineRunner.runPipelineFromFile to simulate progress callback
    router.pipelineRunner.runPipelineFromFile = async (_url: string, onProgress: Function) => {
      onProgress({
        step: 1,
        total: 2,
        status: 'running',
        intent: maliciousIntent
      });
      return { success: true, logs: [] };
    };

    const card = router.pipelineUI.createPipelineCard(pipelineFile);
    assert.ok(card instanceof MockElement);

    // Find run button and status area
    const buttons = card.querySelectorAll('BUTTON');
    const runBtn = buttons.find((b: MockElement) => b.textContent === 'Execute');
    assert.ok(runBtn, 'Execute button should exist');

    // Click execute
    assert.ok(runBtn.onclick);
    runBtn.onclick();

    // Verify status area element
    const statusArea = card.children[card.children.length - 1];
    assert.ok(statusArea);

    // Verify textContent contains the malicious intent literally
    assert.strictEqual(
      statusArea.textContent,
      `Step 1/2: ${maliciousIntent} - Running...`
    );

    // Ensure no <img> or <script> elements were created inside statusArea
    assert.strictEqual(statusArea.querySelector('img'), null);
    assert.strictEqual(statusArea.querySelector('script'), null);
    assert.strictEqual(statusArea.children.length, 0);
  });

  test('PipelineUI renders error progress with malicious HTML safely as literal text', async () => {
    const maliciousError = '<svg/onload=alert("XSS")>';
    const pipelineFile = {
      name: 'error.intent.json',
      url: 'file:///mock/project/pipeline/error.intent.json'
    };

    router.pipelineRunner.runPipelineFromFile = async (_url: string, onProgress: Function) => {
      onProgress({
        step: 1,
        total: 1,
        status: 'error',
        error: maliciousError
      });
      throw new Error(maliciousError);
    };

    const card = router.pipelineUI.createPipelineCard(pipelineFile);
    const buttons = card.querySelectorAll('BUTTON');
    const runBtn = buttons.find((b: MockElement) => b.textContent === 'Execute');
    assert.ok(runBtn && runBtn.onclick);
    runBtn.onclick();

    const statusArea = card.children[card.children.length - 1];
    assert.strictEqual(
      statusArea.textContent,
      `Failed at step 1: ${maliciousError}`
    );
    assert.strictEqual(statusArea.querySelector('svg'), null);
    assert.strictEqual(statusArea.children.length, 0);
  });

  test('PipelineUI renders success status cleanly', async () => {
    const pipelineFile = {
      name: 'ok.intent.json',
      url: 'file:///mock/project/pipeline/ok.intent.json'
    };

    router.pipelineRunner.runPipelineFromFile = async (_url: string, onProgress: Function) => {
      onProgress({ step: 2, total: 2, status: 'success' });
      return { success: true };
    };

    const card = router.pipelineUI.createPipelineCard(pipelineFile);
    const buttons = card.querySelectorAll('BUTTON');
    const runBtn = buttons.find((b: MockElement) => b.textContent === 'Execute');
    assert.ok(runBtn && runBtn.onclick);
    runBtn.onclick();

    const statusArea = card.children[card.children.length - 1];
    assert.strictEqual(statusArea.textContent, 'Success! (2/2 steps completed)');
    assert.strictEqual(statusArea.style.color, '#4caf50');
  });

  test('PipelineUI loadPipelines handles missing folder URL containing HTML tags without DOM injection', async () => {
    const maliciousFolder = 'file:///mock/project/<iframe/src=x>/';
    (env.win as any).addedFolder = [{ url: maliciousFolder }];

    router.requireFs = () => (_url: string) => ({
      exists: async () => false,
      lsDir: async () => []
    });

    await router.pipelineUI.render();

    const content = router.pipelineUI.$container.children[1];
    assert.ok(content);
    assert.ok(content.textContent.includes(`No pipeline directory found (${maliciousFolder}pipeline).`));
    assert.strictEqual(content.querySelector('iframe'), null);
  });

  test('PipelineUI loadPipelines handles errors with HTML tags without DOM injection', async () => {
    const maliciousMsg = 'FS Error: <img src=x onerror=alert(1)>';
    (env.win as any).addedFolder = [{ url: 'file:///mock/project/' }];

    router.requireFs = () => () => {
      throw new Error(maliciousMsg);
    };

    await router.pipelineUI.render();

    const content = router.pipelineUI.$container.children[1];
    assert.ok(content);
    assert.strictEqual(content.textContent, `Error loading pipelines: ${maliciousMsg}`);
    assert.strictEqual(content.querySelector('img'), null);
  });

  test('IntentRouter showLogs and showObject render contents as literal text in pre tag', () => {
    const maliciousLog = '<script>document.cookie="stolen"</script>';
    router.log(maliciousLog);
    router.showLogs();

    const pre = pageMock.querySelector('PRE');
    assert.ok(pre, '<pre> tag should be created');
    assert.ok(pre.textContent.includes(maliciousLog));
    assert.strictEqual(pageMock.querySelector('script'), null);
  });
});
