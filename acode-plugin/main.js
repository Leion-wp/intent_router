(function () {
  'use strict';

  const PLUGIN_ID = 'com.leion.intentrouter';
  const PLUGIN_VERSION = '1.2.0';

  class IntentRouter {
    constructor() {
      this.commands = new Map();
      this.logs = [];
      this.isInitialized = false;
      this.$page = null;
      this.baseUrl = null;
      this.context = null;
      this.fsOperation = null;
    }

    async init(baseUrl, $page, context) {
      if (this.isInitialized) return;
      this.baseUrl = baseUrl;
      this.$page = $page;
      this.context = context || {};

      try {
        this.fsOperation = acode.require('fsOperation');
      } catch (_) {
        this.fsOperation = null;
      }

      this.setupCommands();
      this.registerAcodeCommands();
      window.intentRouter = this;
      this.isInitialized = true;
      this.log('Intent Router initialized');
      this.toast('Intent Router Active');
    }

    toast(message, timeout = 3000) {
      try {
        if (window.acode && typeof acode.toast === 'function') {
          acode.toast(message, timeout);
          return;
        }
      } catch (_) {}
      try {
        if (typeof window.toast === 'function') window.toast(message, timeout);
      } catch (_) {}
    }

    log(message) {
      const entry = `[${new Date().toISOString()}] ${message}`;
      this.logs.push(entry);
      if (this.logs.length > 100) this.logs.shift();
      console.log(`[Intent Router] ${message}`);
    }

    register(name, handler) {
      this.commands.set(name, handler);
      this.log(`Registered command: ${name}`);
    }

    async route(intent = {}) {
      const action = intent.action;
      const data = intent.data || {};
      if (!action || typeof action !== 'string') {
        return { status: 'error', message: 'intent.action is required' };
      }
      const handler = this.commands.get(action);
      if (!handler) {
        this.log(`Command not found: ${action}`);
        return { status: 'error', message: `Command ${action} not found` };
      }
      try {
        this.log(`Routing action: ${action}`);
        const result = await handler(data, intent);
        return { status: 'success', result: result === undefined ? null : result };
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        this.log(`Error executing ${action}: ${message}`);
        return { status: 'error', message };
      }
    }

    requireFs() {
      if (!this.fsOperation) throw new Error('Acode fsOperation API is unavailable');
      return this.fsOperation;
    }

    setupCommands() {
      this.commands.clear();

      this.register('system:toast', (data) => {
        this.toast(data.message || 'No message', data.timeout || 3000);
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
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(String(data.text));
          return { copied: true, method: 'navigator.clipboard' };
        }
        const clipboard = window.cordova && window.cordova.plugins && window.cordova.plugins.clipboard;
        if (!clipboard || typeof clipboard.copy !== 'function') throw new Error('Clipboard API unavailable');
        await new Promise((resolve, reject) => clipboard.copy(String(data.text), resolve, reject));
        return { copied: true, method: 'cordova' };
      });

      this.register('system:open_url', (data) => {
        if (!data.url) throw new Error('url is required');
        window.open(data.url, '_system');
        return { opened: true };
      });

      this.register('file:read', async (data) => {
        if (!data.path) throw new Error('path is required');
        return await this.requireFs()(data.path).readFile(data.encoding || 'utf8');
      });

      this.register('file:write', async (data) => {
        if (!data.path) throw new Error('path is required');
        if (data.content === undefined) throw new Error('content is required');
        await this.requireFs()(data.path).writeFile(data.content);
        return { written: true };
      });

      this.register('file:list', async (data) => {
        if (!data.path) throw new Error('path is required');
        return await this.requireFs()(data.path).lsDir();
      });

      this.register('file:exists', async (data) => {
        if (!data.path) throw new Error('path is required');
        return { exists: await this.requireFs()(data.path).exists() };
      });

      this.register('file:delete', async (data) => {
        if (!data.path) throw new Error('path is required');
        await this.requireFs()(data.path).delete();
        return { deleted: true };
      });

      this.register('editor:get_content', () => {
        if (!window.editorManager || !editorManager.editor) throw new Error('Editor unavailable');
        return editorManager.editor.getValue();
      });

      this.register('editor:set_content', (data) => {
        if (!window.editorManager || !editorManager.editor) throw new Error('Editor unavailable');
        editorManager.editor.setValue(data.content || '', -1);
        return { updated: true };
      });

      this.register('editor:get_selected_text', () => {
        if (!window.editorManager || !editorManager.editor) throw new Error('Editor unavailable');
        return editorManager.editor.getSelectedText();
      });

      this.register('editor:get_cursor', () => {
        if (!window.editorManager || !editorManager.editor) throw new Error('Editor unavailable');
        return editorManager.editor.getCursorPosition();
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
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
        }
        return { status: response.status, body };
      });

      this.register('github:fetch_repo', async (data) => {
        if (!data.repo) throw new Error('repo is required (owner/repo)');
        const path = data.path ? `/${String(data.path).replace(/^\/+/, '')}` : '';
        const routed = await this.route({
          action: 'network:request',
          data: {
            url: `https://api.github.com/repos/${data.repo}/contents${path}`,
            headers: data.token ? { Authorization: `Bearer ${data.token}` } : {}
          }
        });
        if (routed.status !== 'success') throw new Error(routed.message || 'GitHub request failed');
        return routed.result;
      });
    }

    registerAcodeCommands() {
      try {
        if (typeof acode.addCommand === 'function') {
          acode.addCommand({
            name: 'Intent Router: Test',
            description: 'Run Intent Router smoke test',
            exec: () => this.runTest()
          });
          acode.addCommand({
            name: 'Intent Router: Logs',
            description: 'Show Intent Router logs',
            exec: () => this.showLogs()
          });
          return;
        }
      } catch (error) {
        this.log(`acode.addCommand unavailable: ${error.message || error}`);
      }
      try {
        if (window.editorManager && editorManager.editor && editorManager.editor.commands) {
          editorManager.editor.commands.addCommand({ name: 'intent_router:test', exec: () => this.runTest() });
        }
      } catch (error) {
        this.log(`Editor command registration skipped: ${error.message || error}`);
      }
    }

    async runTest() {
      const result = await this.route({ action: 'system:toast', data: { message: 'Intent Router test successful' } });
      console.log('[Intent Router] smoke test:', result);
      return result;
    }

    showLogs() {
      const text = this.logs.join('\n') || 'No logs yet.';
      try {
        if (this.$page) {
          if (this.$page.header) this.$page.header.title = 'Intent Router Logs';
          this.$page.content = `<pre style="padding:12px;white-space:pre-wrap;overflow:auto">${this.escapeHtml(text)}</pre>`;
          if (typeof this.$page.show === 'function') this.$page.show();
          return;
        }
      } catch (_) {}
      console.log(text);
      this.toast('Intent Router logs written to console');
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
      if (window.intentRouter === this) delete window.intentRouter;
      this.commands.clear();
      this.isInitialized = false;
      this.$page = null;
      this.context = null;
      this.log('Intent Router destroyed');
    }
  }

  if (typeof window.acode !== 'undefined') {
    const router = new IntentRouter();
    acode.setPluginInit(PLUGIN_ID, async (baseUrl, $page, context) => {
      await router.init(baseUrl, $page, context);
    });
    acode.setPluginUnmount(PLUGIN_ID, () => {
      router.destroy();
    });
  }
})();
