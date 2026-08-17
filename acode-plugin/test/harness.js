const fs = require('fs');
const path = require('path');
const vm = require('vm');

class MockElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.style = {};
    this._innerHTML = '';
    this._textContent = '';
    this.onclick = null;
    this.disabled = false;
  }

  get innerHTML() {
    if (this._innerHTML) return this._innerHTML;
    return this.children.map(c => typeof c === 'string' ? c : (c.outerHTML || c.toString())).join('');
  }

  set innerHTML(html) {
    this._innerHTML = String(html);
    this.children = [];
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => typeof c === 'string' ? c : c.textContent).join('');
  }

  set textContent(text) {
    this._textContent = String(text);
    this._innerHTML = '';
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    if (this._innerHTML) return `<${tag}>${this._innerHTML}</${tag}>`;
    return `<${tag}>${this.innerHTML}</${tag}>`;
  }
}

function createAcodeEnvironment(customMocks = {}) {
  const fileStore = customMocks.fileStore || new Map();
  const dirStore = customMocks.dirStore || new Set(['file:///sdcard/project', 'file:///sdcard/project/pipeline']);

  const mockFs = (fileUrl) => {
    const normalizedUrl = String(fileUrl);
    return {
      async readFile(encoding = 'utf-8') {
        if (!fileStore.has(normalizedUrl)) {
          throw new Error(`File not found: ${normalizedUrl}`);
        }
        return fileStore.get(normalizedUrl);
      },
      async writeFile(content) {
        fileStore.set(normalizedUrl, String(content));
        return { written: true };
      },
      async lsDir() {
        const results = [];
        const prefix = normalizedUrl.endsWith('/') ? normalizedUrl : normalizedUrl + '/';
        for (const [key] of fileStore.entries()) {
          if (key.startsWith(prefix)) {
            const rel = key.slice(prefix.length);
            if (!rel.includes('/')) {
              results.push({ name: rel, url: key, isFile: true });
            }
          }
        }
        return results;
      },
      async exists() {
        return fileStore.has(normalizedUrl) || dirStore.has(normalizedUrl);
      },
      async stat() {
        if (fileStore.has(normalizedUrl)) {
          return { isFile: true, isDirectory: false, size: fileStore.get(normalizedUrl).length };
        }
        if (dirStore.has(normalizedUrl)) {
          return { isFile: false, isDirectory: true, size: 0 };
        }
        throw new Error(`Path not found: ${normalizedUrl}`);
      },
      async delete() {
        fileStore.delete(normalizedUrl);
        dirStore.delete(normalizedUrl);
        return { deleted: true };
      },
      async createFile(name, content = '') {
        const targetUrl = normalizedUrl.endsWith('/') ? normalizedUrl + name : normalizedUrl + '/' + name;
        fileStore.set(targetUrl, content);
        return targetUrl;
      },
      async createDirectory(name) {
        const targetUrl = normalizedUrl.endsWith('/') ? normalizedUrl + name : normalizedUrl + '/' + name;
        dirStore.add(targetUrl);
        return targetUrl;
      },
      async renameTo(newName) {
        const content = fileStore.get(normalizedUrl);
        fileStore.delete(normalizedUrl);
        const parent = normalizedUrl.substring(0, normalizedUrl.lastIndexOf('/'));
        const newUrl = `${parent}/${newName}`;
        if (content !== undefined) fileStore.set(newUrl, content);
        return newUrl;
      },
      async moveTo(destination) {
        const content = fileStore.get(normalizedUrl);
        fileStore.delete(normalizedUrl);
        const filename = normalizedUrl.split('/').pop();
        const newUrl = destination.endsWith('/') ? destination + filename : destination + '/' + filename;
        if (content !== undefined) fileStore.set(newUrl, content);
        return newUrl;
      },
      async copyTo(destination) {
        const content = fileStore.get(normalizedUrl);
        const filename = normalizedUrl.split('/').pop();
        const newUrl = destination.endsWith('/') ? destination + filename : destination + '/' + filename;
        if (content !== undefined) fileStore.set(newUrl, content);
        return newUrl;
      }
    };
  };

  const registeredCommands = customMocks.registeredCommands || new Map();
  const mockCommands = {
    addCommand: (def) => registeredCommands.set(def.name, def),
    removeCommand: (name) => registeredCommands.delete(name)
  };

  const terminals = customMocks.terminals || new Map();
  const terminalExecutions = customMocks.terminalExecutions || [];
  const mockTerminal = {
    getAll: () => terminals,
    get: (id) => terminals.get(id),
    createServer: async ({ name }) => {
      const id = 'term_' + Math.random().toString(36).substr(2, 6);
      const inst = { id, name };
      terminals.set(id, inst);
      return inst;
    },
    write: (id, cmd) => {
      terminalExecutions.push({ id, cmd });
    }
  };

  const toasts = [];
  const mockToast = (msg, timeout) => toasts.push({ msg, timeout });

  const alerts = [];
  const mockAlert = (title, msg) => alerts.push({ title, msg });

  const mockPrompt = customMocks.prompt || (async (msg) => 'mocked_prompt_value');

  const modules = {
    fs: mockFs,
    fsOperation: mockFs,
    commands: mockCommands,
    terminal: mockTerminal,
    toast: mockToast,
    alert: mockAlert,
    prompt: mockPrompt,
    openFolder: () => {}
  };

  let pluginInitCb = null;
  let pluginUnmountCb = null;

  const mockAcode = {
    require: (name) => modules[name] || null,
    setPluginInit: (id, cb) => { pluginInitCb = cb; },
    setPluginUnmount: (id, cb) => { pluginUnmountCb = cb; }
  };

  const mockDocument = {
    createElement: (tag) => new MockElement(tag)
  };

  const mockPage = {
    title: '',
    innerHTML: '',
    children: [],
    settitle(t) { this.title = t; },
    append(child) { this.children.push(child); },
    show() { this.visible = true; },
    hide() { this.visible = false; }
  };

  const mockEditor = {
    state: {
      doc: {
        toString: () => 'sample editor content',
        length: 21,
        lines: 1,
        lineAt: () => ({ number: 1, from: 0 }),
        line: () => ({ number: 1, from: 0, length: 21 })
      },
      selection: { main: { from: 0, to: 0, head: 0 } },
      sliceDoc: (from, to) => 'sample editor content'.slice(from, to)
    },
    dispatch: (action) => {},
    focus: () => {}
  };

  const openFiles = [];
  const mockEditorManager = {
    editor: mockEditor,
    files: openFiles,
    activeFile: null,
    getFile: (uri) => openFiles.find(f => f.uri === uri),
    addNewFile: async (filename, options) => {
      const fileObj = { id: 'file_' + openFiles.length, filename, ...options };
      openFiles.push(fileObj);
      return fileObj;
    }
  };

  const mockWindow = {
    acode: mockAcode,
    addedFolder: [{ url: 'file:///sdcard/project' }],
    editorManager: mockEditorManager,
    alert: (msg) => alerts.push({ title: 'window.alert', msg }),
    prompt: (msg) => 'mocked_window_prompt',
    toast: mockToast,
    open: () => {},
    cordova: null
  };

  const mockNavigator = {
    userAgent: 'Node-AcodeTestHarness/1.0',
    platform: 'Android',
    vibrate: () => true,
    clipboard: {
      writeText: async (text) => { mockNavigator._copied = text; }
    }
  };

  const sandboxContext = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    Math,
    Date,
    RegExp,
    Error,
    Map,
    Set,
    acode: mockAcode,
    window: mockWindow,
    document: mockDocument,
    navigator: mockNavigator,
    editorManager: mockEditorManager,
    fetch: customMocks.fetch || (async () => ({ ok: true, status: 200, headers: new Map(), json: async () => ({}), text: async () => '' }))
  });

  const mainJsPath = path.join(__dirname, '..', 'main.js');
  const mainJsCode = fs.readFileSync(mainJsPath, 'utf-8');

  vm.runInContext(mainJsCode, sandboxContext);

  if (pluginInitCb) {
    pluginInitCb('file:///plugin_base/', mockPage, {});
  }

  const router = sandboxContext.window.intentRouter;

  return {
    router,
    sandboxContext,
    mocks: {
      acode: mockAcode,
      window: mockWindow,
      document: mockDocument,
      page: mockPage,
      fileStore,
      dirStore,
      registeredCommands,
      terminals,
      terminalExecutions,
      toasts,
      alerts
    },
    destroy: async () => {
      if (router && typeof router.destroy === 'function') {
        await router.destroy();
      }
      if (pluginUnmountCb) {
        pluginUnmountCb();
      }
    }
  };
}

module.exports = {
  createAcodeEnvironment,
  MockElement
};
