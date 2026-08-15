(function() {
  "use strict";

  const SCHEMES = {
    SYSTEM: 'system',
    AI: 'ai',
    GITHUB: 'github',
    TERMINAL: 'terminal',
    FS: 'fs'
  };

  class BaseProvider {
    constructor(name) {
      this.name = name;
    }
    canHandle(intent) { return false; }
    async execute(intent, context) {
      return this.normalizeResponse(false, null, 'Not implemented');
    }
    normalizeResponse(success, data = null, error = null, metadata = {}) {
      return {
        success,
        data,
        error,
        metadata: { ...metadata, timestamp: Date.now(), provider: this.name }
      };
    }
  }

  class SystemProvider extends BaseProvider {
    constructor() { super('SystemProvider'); }
    canHandle(intent) { return intent.scheme === SCHEMES.SYSTEM; }
    async execute(intent) {
      const { action, data = {} } = intent;
      try {
        switch (action) {
          case 'toast':
            if (window.acode && acode.toast) acode.toast(data.message || 'Default Toast');
            return this.normalizeResponse(true, { status: 'sent' });
          case 'alert':
            if (window.acode && acode.alert) acode.alert('System', data.message || 'Default Alert');
            return this.normalizeResponse(true, { status: 'displayed' });
          case 'confirm':
            let res = window.confirm(data.message || 'Confirm?');
            return this.normalizeResponse(true, res);
          case 'copy':
            if (navigator.clipboard && data.text) {
              await navigator.clipboard.writeText(data.text);
              return this.normalizeResponse(true, { status: 'copied' });
            }
            return this.normalizeResponse(false, null, 'Clipboard API not supported');
          default:
            return this.normalizeResponse(false, null, `Action ${action} not supported`);
        }
      } catch (e) { return this.normalizeResponse(false, null, e.message); }
    }
  }

  class FileProvider extends BaseProvider {
    constructor() { super('FileProvider'); }
    canHandle(intent) { return intent.scheme === SCHEMES.FS; }
    async execute(intent) {
      const { action, data = {} } = intent;
      const fs = window.acode ? acode.require('fsOperation') : null;
      if (!fs) return this.normalizeResponse(false, null, 'fsOperation not available');
      try {
        let result;
        switch (action) {
          case 'read':
            result = await fs(data.path).readFile('utf-8');
            return this.normalizeResponse(true, { content: result });
          case 'write':
            await fs(data.path).writeFile(data.content || '');
            return this.normalizeResponse(true, { status: 'written' });
          case 'list':
            result = await fs(data.path).lsDir();
            return this.normalizeResponse(true, { files: result });
          default:
            return this.normalizeResponse(false, null, `Action ${action} not supported`);
        }
      } catch (e) { return this.normalizeResponse(false, null, e.message); }
    }
  }

  class AIProvider extends BaseProvider {
    constructor() { super('AIProvider'); }
    canHandle(intent) { return intent.scheme === SCHEMES.AI; }
    async execute(intent) {
      const { action, data = {} } = intent;
      return this.normalizeResponse(true, { 
        answer: `AI Response to ${action}: ${data.prompt || 'No prompt provided'}` 
      }, null, { model: data.model || 'gpt-4o' });
    }
  }

  class GitHubProvider extends BaseProvider {
    constructor() { super('GitHubProvider'); }
    canHandle(intent) { return intent.scheme === SCHEMES.GITHUB; }
    async execute(intent) {
      const { action, data = {} } = intent;
      const baseUrl = 'https://api.github.com';
      const headers = data.token ? { 'Authorization': `token ${data.token}` } : {};
      try {
        let response;
        switch (action) {
          case 'get_repo':
            response = await fetch(`${baseUrl}/repos/${data.owner}/${data.repo}`, { headers });
            break;
          case 'get_file':
            response = await fetch(`${baseUrl}/repos/${data.owner}/${data.repo}/contents/${data.path}`, { headers });
            break;
          default:
            return this.normalizeResponse(false, null, `Action ${action} not supported`);
        }
        if (!response.ok) throw new Error(`GitHub API: ${response.statusText}`);
        const result = await response.json();
        if (action === 'get_file' && result.encoding === 'base64' && result.content) {
          try { result.decodedContent = atob(result.content.replace(/\n/g, '')); } catch (e) { result.decodeError = 'Failed to decode base64'; }
        }
        return this.normalizeResponse(true, result);
      } catch (e) { return this.normalizeResponse(false, null, e.message); }
    }
  }

  class TerminalProvider extends BaseProvider {
    constructor() { super('TerminalProvider'); }
    canHandle(intent) { return intent.scheme === SCHEMES.TERMINAL; }
    async execute(intent) {
      const { action, data = {} } = intent;
      if (action === 'exec') {
        if (window.terminal && typeof window.terminal.exec === 'function') {
          const output = await window.terminal.exec(data.command);
          return this.normalizeResponse(true, { output });
        }
        return this.normalizeResponse(false, null, 'Terminal plugin not found or exec missing');
      }
      return this.normalizeResponse(false, null, `Action ${action} not supported`);
    }
  }

  class IntentRouter {
    constructor() {
      this.providers = [
        new SystemProvider(), 
        new FileProvider(), 
        new AIProvider(), 
        new GitHubProvider(), 
        new TerminalProvider()
      ];
      this.logs = [];
    }
    async execute(intent) {
      if (!intent || !intent.scheme) return { success: false, error: 'Invalid intent' };
      const provider = this.providers.find(p => p.canHandle(intent));
      if (!provider) return { success: false, error: `No provider for scheme: ${intent.scheme}` };
      const result = await provider.execute(intent);
      this.logs.push({ intent, result, time: new Date().toISOString() });
      if (this.logs.length > 50) this.logs.shift();
      return result;
    }
    getLogs() { return this.logs; }
  }

  class IntentRouterPlugin {
    constructor() {
      this.router = new IntentRouter();
    }
    async init(baseUrl) {
      window.intentRouter = this.router;
      window.runIntentTests = async () => {
        if (window.acode) acode.toast('Starting Tests...');
        const tests = [
          { scheme: 'system', action: 'toast', data: { message: 'Test Success!' } },
          { scheme: 'ai', action: 'prompt', data: { prompt: 'Test' } }
        ];
        for (const test of tests) {
          await this.router.execute(test);
        }
      };
      if (window.acode) {
        acode.addCommand({
          name: 'Intent Router: Run Tests',
          description: 'Execute internal test suite',
          exec: () => window.runIntentTests()
        });
        acode.addCommand({
          name: 'Intent Router: About',
          description: 'Plugin Information',
          exec: () => acode.alert('Intent Router', 'v1.1.6 - Stable')
        });
        acode.addCommand({
          name: 'Intent Router: View Logs',
          description: 'Show execution history',
          exec: () => console.table(this.router.getLogs())
        });
      }
    }
    destroy() {
      delete window.intentRouter;
      delete window.runIntentTests;
    }
  }

  if (typeof window.acode !== 'undefined') {
    const plugin = new IntentRouterPlugin();
    acode.setPluginInit('com.leion.intentrouter', async (baseUrl) => {
      await plugin.init(baseUrl);
    });
    acode.setPluginUnmount('com.leion.intentrouter', () => {
      plugin.destroy();
    });
  }
})();
