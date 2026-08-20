import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

suite('Acode Plugin Runner & UI Mocked Tests', () => {
  function setupPluginContext(mockFsHandler?: any, mockRouteHandler?: any) {
    const code = fs.readFileSync(path.resolve(__dirname, '../../acode-plugin/main.js'), 'utf-8');

    function createMockElement(tagName: string): any {
      const children: any[] = [];
      const el: any = {
        tagName: tagName.toUpperCase(),
        style: {},
        children,
        disabled: false,
        textContent: '',
        innerHTML: '',
        onclick: null,
        appendChild(child: any) {
          children.push(child);
        }
      };
      return el;
    }

    const mockDocument = {
      createElement: createMockElement
    };

    const mockAcode = {
      setPluginInit: (id: string, initFn: any) => {
        initFn('http://localhost', {}, {});
      },
      setPluginUnmount: () => {},
      require: (name: string) => {
        if (name === 'fs' || name === 'fsOperation') {
          return mockFsHandler;
        }
        return null;
      }
    };

    const mockWindow: any = {
      document: mockDocument,
      acode: mockAcode
    };

    const context = vm.createContext({
      window: mockWindow,
      document: mockDocument,
      acode: mockAcode,
      console,
      setTimeout,
      clearTimeout,
      Promise,
      Array,
      JSON,
      Error,
      String,
      Number
    });

    vm.runInContext(code, context);

    const router = mockWindow.intentRouter;
    if (mockRouteHandler) {
      router.route = mockRouteHandler;
    }

    return { context, router };
  }

  test('FS read failure before parse displays Failed to load on card and re-enables buttons', async () => {
    const mockFs = (url: string) => ({
      readFile: async () => {
        throw new Error('ENOENT: file deleted');
      }
    });

    const { router } = setupPluginContext(mockFs);
    const card = router.pipelineUI.createPipelineCard({ name: 'missing.intent.json', url: '/pipeline/missing.intent.json' });

    const header = card.children[0];
    const controls = header.children[1];
    const openBtn = controls.children[0];
    const runBtn = controls.children[1];
    const statusArea = card.children[1];

    assert.strictEqual(statusArea.style.display, 'none');

    runBtn.onclick();

    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(runBtn.disabled, false);
    assert.strictEqual(openBtn.disabled, false);
    assert.strictEqual(runBtn.style.opacity, '1');
    assert.strictEqual(statusArea.style.display, 'block');
    assert.strictEqual(statusArea.style.color, '#f44336');
    assert.strictEqual(statusArea.textContent, 'Failed to load pipeline: File read error: ENOENT: file deleted');
  });

  test('Invalid JSON file content displays Failed to load on card and re-enables buttons', async () => {
    const mockFs = (url: string) => ({
      readFile: async () => '{ malformed json <bad> }'
    });

    const { router } = setupPluginContext(mockFs);
    const card = router.pipelineUI.createPipelineCard({ name: 'invalid.intent.json', url: '/pipeline/invalid.intent.json' });

    const header = card.children[0];
    const controls = header.children[1];
    const openBtn = controls.children[0];
    const runBtn = controls.children[1];
    const statusArea = card.children[1];

    runBtn.onclick();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(runBtn.disabled, false);
    assert.strictEqual(openBtn.disabled, false);
    assert.strictEqual(statusArea.style.color, '#f44336');
    assert.ok(statusArea.textContent.includes('Failed to load pipeline: Invalid JSON format:'));
  });

  test('Valid pipeline whose first step fails preserves step progress error message', async () => {
    const validPipelineJson = JSON.stringify({
      steps: [
        { intent: 'file.read', payload: { path: '/tmp/test.txt' } }
      ]
    });

    const mockFs = (url: string) => ({
      readFile: async () => validPipelineJson
    });

    const mockRoute = async (intent: any) => {
      return { success: false, error: 'File <not_found> error' };
    };

    const { router } = setupPluginContext(mockFs, mockRoute);
    const card = router.pipelineUI.createPipelineCard({ name: 'step_fail.intent.json', url: '/pipeline/step_fail.intent.json' });

    const header = card.children[0];
    const controls = header.children[1];
    const openBtn = controls.children[0];
    const runBtn = controls.children[1];
    const statusArea = card.children[1];

    runBtn.onclick();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(runBtn.disabled, false);
    assert.strictEqual(openBtn.disabled, false);
    assert.strictEqual(statusArea.style.color, '#f44336');
    assert.strictEqual(statusArea.textContent, 'Failed at step 1: File <not_found> error');
  });

  test('Valid pipeline succeeds and displays success message', async () => {
    const validPipelineJson = JSON.stringify({
      steps: [
        { intent: 'system.toast', payload: { message: 'hello' } }
      ]
    });

    const mockFs = (url: string) => ({
      readFile: async () => validPipelineJson
    });

    const mockRoute = async (intent: any) => {
      return { success: true, data: { done: true } };
    };

    const { router } = setupPluginContext(mockFs, mockRoute);
    const card = router.pipelineUI.createPipelineCard({ name: 'success.intent.json', url: '/pipeline/success.intent.json' });

    const header = card.children[0];
    const controls = header.children[1];
    const openBtn = controls.children[0];
    const runBtn = controls.children[1];
    const statusArea = card.children[1];

    runBtn.onclick();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(runBtn.disabled, false);
    assert.strictEqual(openBtn.disabled, false);
    assert.strictEqual(statusArea.style.color, '#4caf50');
    assert.strictEqual(statusArea.textContent, 'Success! (1/1 steps completed)');
  });

  test('Error text containing <tag> remains unexecuted text via textContent', async () => {
    const mockFs = (url: string) => ({
      readFile: async () => {
        throw new Error('Error with <script>alert("xss")</script> tag');
      }
    });

    const { router } = setupPluginContext(mockFs);
    const card = router.pipelineUI.createPipelineCard({ name: 'xss.intent.json', url: '/pipeline/xss.intent.json' });

    const statusArea = card.children[1];
    const runBtn = card.children[0].children[1].children[1];

    runBtn.onclick();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(statusArea.textContent, 'Failed to load pipeline: File read error: Error with <script>alert("xss")</script> tag');
  });
});
