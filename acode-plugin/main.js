(function () {
  'use strict';

  const PLUGIN_ID = 'com.leion.intentrouter';
  const PLUGIN_VERSION = '1.2.1';

  class IntentRouter {
    constructor() {
      this.commands = new Map();
      this.logs = [];
      this.isInitialized = false;
      this.$page = null;
      this.baseUrl = null;
      this.context = null;
      this.modules = {};
      this.registeredAcodeCommands = [];
    }

    safeRequire(name) {
      try { return acode.require(name); } catch (_) { return null; }
    }

    async init(baseUrl, $page, context) {
      if (this.isInitialized) return;
      this.baseUrl = baseUrl;
      this.$page = $page;
      this.context = context || {};
      this.modules.fs = this.safeRequire('fs') || this.safeRequire('fsOperation');
      this.modules.commands = this.safeRequire('commands');
      this.modules.toast = this.safeRequire('toast');
      this.modules.alert = this.safeRequire('alert');
      this.modules.terminal = this.safeRequire('terminal');
      this.modules.openFolder = this.safeRequire('openFolder');

      this.setupCommands();
      this.registerAcodeCommands();
      window.intentRouter = this;
      this.isInitialized = true;
      this.log('Intent Router initialized');
      this.toast('Intent Router Active');
    }

    toast(message, timeout = 3000) {
      try {
        if (typeof this.modules.toast === 'function') return this.modules.toast(String(message), timeout);
        if (typeof window.toast === 'function') return window.toast(String(message), timeout);
      } catch (_) {}
    }

    alert(title, message) {
      try {
        if (typeof this.modules.alert === 'function') return this.modules.alert(String(title), String(message));
      } catch (_) {}
      window.alert(`${title}\n\n${message}`);
    }

    log(message) {
      const entry = `[${new Date().toISOString()}] ${message}`;
      this.logs.push(entry);
      if (this.logs.length > 200) this.logs.shift();
      console.log(`[Intent Router] ${message}`);
    }

    normalizeAction(intent = {}) {
      const actionName = intent.intent || intent.action;
      if (typeof actionName === 'string' && actionName.includes(':')) return actionName;
      if (typeof actionName === 'string' && actionName.includes('.')) {
        return actionName.replace(/\./g, ':');
      }
      if (intent.scheme && actionName) return `${intent.scheme}:${actionName}`;
      return typeof actionName === 'string' ? actionName : '';
    }

    ok(data = null, metadata = {}) {
      return { success: true, status: 'success', data, result: data, error: null, metadata };
    }

    fail(message, metadata = {}) {
      return { success: false, status: 'error', data: null, result: null, error: String(message), message: String(message), metadata };
    }

    register(name, handler) {
      this.commands.set(name, handler);
      this.log(`Registered command: ${name}`);
    }

    async resolveVariables(input, cache) {
      if (!cache) cache = new Map();
      if (typeof input === 'string') {
        const regex = /\$\{input:([^}]+)\}/g;
        let match;
        let result = input;
        while ((match = regex.exec(input)) !== null) {
          const fullMatch = match[0];
          const promptText = match[1];
          let value = cache.get(promptText);
          if (value === undefined) {
            const prompt = this.safeRequire('prompt');
            if (!prompt) {
              value = window.prompt(`Value for ${promptText}`);
            } else {
              value = await prompt(promptText, '', 'text', { required: true });
            }
            if (value === undefined || value === null) throw new Error(`Input cancelled for variable: ${promptText}`);
            cache.set(promptText, value);
          }
          result = result.replace(fullMatch, value);
        }
        return result;
      } else if (Array.isArray(input)) {
        return Promise.all(input.map(item => this.resolveVariables(item, cache)));
      } else if (typeof input === 'object' && input !== null) {
        const resolved = {};
        for (const key of Object.keys(input)) {
          resolved[key] = await this.resolveVariables(input[key], cache);
        }
        return resolved;
      }
      return input;
    }

    async route(intent = {}, variableCache) {
      if (!variableCache) variableCache = new Map();

      if (intent.steps && Array.isArray(intent.steps) && intent.steps.length > 0) {
        this.log(`Routing composite intent with ${intent.steps.length} steps`);
        let lastResult = true;
        for (const childStep of intent.steps) {
          const childIntent = Object.assign({}, childStep, {
            meta: Object.assign({}, intent.meta || {}, childStep.meta || {})
          });
          lastResult = await this.route(childIntent, variableCache);
          if (!lastResult || (lastResult && lastResult.success === false)) {
            this.log('Composite step failed');
            return lastResult;
          }
        }
        return lastResult;
      }

      const action = this.normalizeAction(intent);
      let data = intent.payload !== undefined ? intent.payload : (intent.data || {});

      if (!action) return this.fail('intent.action or intent.intent is required');
      const handler = this.commands.get(action);
      if (!handler) return this.fail(`Command ${action} not found`, { action });

      try {
        data = await this.resolveVariables(data, variableCache);
      } catch (error) {
        return this.fail(error.message, { action });
      }

      try {
        this.log(`Routing action: ${action}`);
        const output = await handler(data, intent);
        return this.ok(output === undefined ? null : output, { action });
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        this.log(`Error executing ${action}: ${message}`);
        return this.fail(message, { action });
      }
    }

    requireFs() {
      if (!this.modules.fs) throw new Error('Acode fs API is unavailable');
      return this.modules.fs;
    }

    getEditor() {
      if (!window.editorManager || !editorManager.editor) throw new Error('Editor unavailable');
      return editorManager.editor;
    }

    setupCommands() {
      this.commands.clear();

      this.register('router:list', () => Array.from(this.commands.keys()).sort());
      this.register('router:logs', () => this.logs.slice());
      this.register('router:clear_logs', () => { this.logs = []; return { cleared: true }; });
      this.register('router:capabilities', () => ({
        pluginId: PLUGIN_ID,
        version: PLUGIN_VERSION,
        fs: !!this.modules.fs,
        commands: !!this.modules.commands,
        terminal: !!this.modules.terminal,
        editor: !!(window.editorManager && editorManager.editor),
        network: typeof fetch === 'function'
      }));

      this.register('system:toast', (data) => {
        this.toast(data.message || 'No message', Number(data.timeout) || 3000);
        return { shown: true };
      });

      this.register('system:alert', (data) => {
        this.alert(data.title || 'Intent Router', data.message || '');
        return { shown: true };
      });

      this.register('system:info', () => ({
        pluginId: PLUGIN_ID,
        version: PLUGIN_VERSION,
        userAgent: navigator.userAgent,
        platform: navigator.platform || 'unknown',
        baseUrl: this.baseUrl
      }));

      this.register('system:vibrate', (data) => {
        if (typeof navigator.vibrate !== 'function') throw new Error('Vibration not supported');
        navigator.vibrate(Number(data.ms) || 200);
        return { vibrated: true };
      });

      this.register('system:copy_to_clipboard', async (data) => {
        if (data.text === undefined) throw new Error('text is required');
        const value = String(data.text);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
          return { copied: true, method: 'navigator.clipboard' };
        }
        const clipboard = window.cordova?.plugins?.clipboard;
        if (!clipboard || typeof clipboard.copy !== 'function') throw new Error('Clipboard API unavailable');
        await new Promise((resolve, reject) => clipboard.copy(value, resolve, reject));
        return { copied: true, method: 'cordova' };
      });

      this.register('system:open_url', (data) => {
        if (!data.url) throw new Error('url is required');
        window.open(String(data.url), '_system');
        return { opened: true };
      });

      this.register('file:read', async (data) => {
        if (!data.path) throw new Error('path is required');
        return await this.requireFs()(data.path).readFile(data.encoding || 'utf-8');
      });

      this.register('file:write', async (data) => {
        if (!data.path) throw new Error('path is required');
        if (data.content === undefined) throw new Error('content is required');
        await this.requireFs()(data.path).writeFile(data.content);
        return { written: true, path: data.path };
      });

      this.register('file:list', async (data) => {
        if (!data.path) throw new Error('path is required');
        return await this.requireFs()(data.path).lsDir();
      });

      this.register('file:exists', async (data) => {
        if (!data.path) throw new Error('path is required');
        return { exists: await this.requireFs()(data.path).exists() };
      });

      this.register('file:stat', async (data) => {
        if (!data.path) throw new Error('path is required');
        return await this.requireFs()(data.path).stat();
      });

      this.register('file:delete', async (data) => {
        if (!data.path) throw new Error('path is required');
        await this.requireFs()(data.path).delete();
        return { deleted: true, path: data.path };
      });

      this.register('file:create', async (data) => {
        if (!data.directory || !data.name) throw new Error('directory and name are required');
        const url = await this.requireFs()(data.directory).createFile(data.name, data.content || '');
        return { created: true, url };
      });

      this.register('file:mkdir', async (data) => {
        if (!data.directory || !data.name) throw new Error('directory and name are required');
        const url = await this.requireFs()(data.directory).createDirectory(data.name);
        return { created: true, url };
      });

      this.register('file:rename', async (data) => {
        if (!data.path || !data.newName) throw new Error('path and newName are required');
        const url = await this.requireFs()(data.path).renameTo(data.newName);
        return { renamed: true, url };
      });

      this.register('file:move', async (data) => {
        if (!data.path || !data.destination) throw new Error('path and destination are required');
        const url = await this.requireFs()(data.path).moveTo(data.destination);
        return { moved: true, url };
      });

      this.register('file:copy', async (data) => {
        if (!data.path || !data.destination) throw new Error('path and destination are required');
        const url = await this.requireFs()(data.path).copyTo(data.destination);
        return { copied: true, url };
      });

      this.register('editor:get_content', () => this.getEditor().state.doc.toString());

      this.register('editor:set_content', (data) => {
        const view = this.getEditor();
        const content = data.content === undefined ? '' : String(data.content);
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
        return { updated: true };
      });

      this.register('editor:insert_text', (data) => {
        const view = this.getEditor();
        const text = data.text === undefined ? '' : String(data.text);
        const from = view.state.selection.main.from;
        const to = view.state.selection.main.to;
        view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
        return { inserted: true };
      });

      this.register('editor:get_selected_text', () => {
        const view = this.getEditor();
        const sel = view.state.selection.main;
        return view.state.sliceDoc(sel.from, sel.to);
      });

      this.register('editor:get_cursor', () => {
        const view = this.getEditor();
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        return { offset: pos, line: line.number, column: pos - line.from };
      });

      this.register('editor:goto_line', (data) => {
        const view = this.getEditor();
        const requested = Math.max(1, Number(data.line) || 1);
        const lineNumber = Math.min(requested, view.state.doc.lines);
        const line = view.state.doc.line(lineNumber);
        const column = Math.max(0, Math.min(Number(data.column) || 0, line.length));
        const pos = line.from + column;
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        view.focus();
        return { line: lineNumber, column };
      });

      this.register('editor:list_files', () => (editorManager.files || []).map((file) => ({
        id: file.id,
        name: file.filename,
        uri: file.uri,
        isUnsaved: !!file.isUnsaved,
        readOnly: !!file.readOnly
      })));

      this.register('editor:save_file', async (data) => {
        const file = data.uri ? editorManager.getFile(data.uri, 'uri') : editorManager.activeFile;
        if (!file || typeof file.save !== 'function') throw new Error('File not found or cannot be saved');
        await file.save();
        return { saved: true, uri: file.uri };
      });

      this.register('editor:close_file', async (data) => {
        const file = data.uri ? editorManager.getFile(data.uri, 'uri') : editorManager.activeFile;
        if (!file || typeof file.remove !== 'function') throw new Error('File not found');
        await file.remove(!!data.force);
        return { closed: true };
      });

      this.register('editor:open_file', async (data) => {
        if (!data.path) throw new Error('path is required');
        const text = await this.requireFs()(data.path).readFile(data.encoding || 'utf-8');
        const filename = data.name || String(data.path).split('/').filter(Boolean).pop() || 'file';
        const file = await editorManager.addNewFile(filename, {
          text: String(text), uri: data.path, render: true, isUnsaved: false, readOnly: !!data.readOnly
        });
        return { opened: true, id: file?.id || null, uri: data.path };
      });

      this.register('network:request', async (data) => {
        if (!data.url) throw new Error('url is required');
        const options = { method: data.method || 'GET', headers: data.headers || {} };
        if (data.body !== undefined && data.body !== null) {
          options.body = typeof data.body === 'string' ? data.body : JSON.stringify(data.body);
        }
        const response = await fetch(data.url, options);
        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json') ? await response.json() : await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
        return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
      });

      this.register('github:request', async (data) => {
        if (!data.path) throw new Error('GitHub API path is required');
        const headers = Object.assign({ Accept: 'application/vnd.github+json' }, data.headers || {});
        if (data.token) headers.Authorization = `Bearer ${data.token}`;
        const routed = await this.route({
          action: 'network:request',
          data: { url: `https://api.github.com${String(data.path).startsWith('/') ? '' : '/'}${data.path}`, method: data.method || 'GET', headers, body: data.body }
        });
        if (!routed.success) throw new Error(routed.error || 'GitHub request failed');
        return routed.data;
      });

      this.register('github:fetch_repo', async (data) => {
        if (!data.repo) throw new Error('repo is required (owner/repo)');
        const suffix = data.path ? `/contents/${String(data.path).replace(/^\/+/, '')}` : '';
        const routed = await this.route({ action: 'github:request', data: { path: `/repos/${data.repo}${suffix}`, token: data.token } });
        if (!routed.success) throw new Error(routed.error || 'GitHub request failed');
        return routed.data;
      });

      this.register('terminal:list', () => {
        const terminal = this.modules.terminal;
        if (!terminal) throw new Error('Acode terminal API unavailable');
        return Array.from(terminal.getAll()).map(([id, inst]) => ({ id, name: inst.name }));
      });

      this.register('terminal:exec', async (data) => {
        const terminal = this.modules.terminal;
        if (!terminal) throw new Error('Acode terminal API unavailable');
        if (!data.command) throw new Error('command is required');
        let instance = data.id ? terminal.get(data.id) : null;
        if (!instance) instance = await terminal.createServer({ name: data.name || 'Intent Router' });
        terminal.write(instance.id, `${data.command}\r`);
        return { submitted: true, terminalId: instance.id, command: data.command };
      });
    }

    registerAcodeCommands() {
      const commands = this.modules.commands;
      if (!commands || typeof commands.addCommand !== 'function') {
        this.log('Acode commands API unavailable');
        return;
      }
      const defs = [
        { name: 'leion.intentRouter.test', description: 'Intent Router: Run smoke test', exec: () => this.runTest() },
        { name: 'leion.intentRouter.logs', description: 'Intent Router: View logs', exec: () => this.showLogs() },
        { name: 'leion.intentRouter.capabilities', description: 'Intent Router: Show capabilities', exec: () => this.showCapabilities() }
      ];
      for (const def of defs) {
        commands.addCommand(def);
        this.registeredAcodeCommands.push(def.name);
      }
    }

    async runTest() {
      const checks = {};
      checks.toast = await this.route({ action: 'system:toast', data: { message: 'Intent Router test successful' } });
      checks.capabilities = await this.route({ action: 'router:capabilities' });
      checks.editor = await this.route({ action: 'editor:get_cursor' });
      this.log(`Smoke test complete: ${JSON.stringify(checks)}`);
      this.showObject('Intent Router Test', checks);
      return checks;
    }

    async showCapabilities() {
      const result = await this.route({ action: 'router:capabilities' });
      this.showObject('Intent Router Capabilities', result.data || result);
    }

    showObject(title, value) {
      const text = JSON.stringify(value, null, 2);
      if (this.$page) {
        try {
          this.$page.innerHTML = `<pre style="padding:12px;white-space:pre-wrap;overflow:auto">${this.escapeHtml(text)}</pre>`;
          if (typeof this.$page.show === 'function') this.$page.show();
          return;
        } catch (_) {}
      }
      this.alert(title, text);
    }

    showLogs() {
      const text = this.logs.join('\n') || 'No logs yet.';
      if (this.$page) {
        try {
          this.$page.innerHTML = `<pre style="padding:12px;white-space:pre-wrap;overflow:auto">${this.escapeHtml(text)}</pre>`;
          if (typeof this.$page.show === 'function') this.$page.show();
          return;
        } catch (_) {}
      }
      this.alert('Intent Router Logs', text);
    }

    escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async destroy() {
      const commands = this.modules.commands;
      if (commands && typeof commands.removeCommand === 'function') {
        for (const name of this.registeredAcodeCommands) {
          try { commands.removeCommand(name); } catch (_) {}
        }
      }
      this.registeredAcodeCommands = [];
      if (window.intentRouter === this) delete window.intentRouter;
      this.commands.clear();
      this.isInitialized = false;
      this.$page = null;
      this.context = null;
      this.modules = {};
      this.log('Intent Router destroyed');
    }
  }

  if (typeof window.acode !== 'undefined') {
    const router = new IntentRouter();
    acode.setPluginInit(PLUGIN_ID, async (baseUrl, $page, context) => {
      await router.init(baseUrl, $page, context);
    });
    acode.setPluginUnmount(PLUGIN_ID, () => router.destroy());
  }
})();
