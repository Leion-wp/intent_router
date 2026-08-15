/**
 * Intent Router for Acode
 * Version: 1.0.0
 * Developed by Rutex (Hall Of Codes)
 */

const SCHEMES = {
  SYSTEM: 'system',
  AI: 'ai',
  GITHUB: 'github',
  TERMINAL: 'terminal',
  DOCKER: 'docker'
};

const ERROR_CODES = {
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  CAPABILITY_MISSING: 'CAPABILITY_MISSING',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  INVALID_INTENT: 'INVALID_INTENT'
};

class BaseProvider {
  constructor(name) {
    this.name = name;
  }
  
  canHandle(intent) {
    return false;
  }

  async execute(intent, context) {
    return this.normalizeResponse(false, null, 'Not implemented');
  }

  normalizeResponse(success, data = null, error = null, metadata = {}) {
    return {
      success,
      data,
      error,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        provider: this.name
      }
    };
  }
}

class SystemProvider extends BaseProvider {
  constructor() {
    super('SystemProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.SYSTEM;
  }

  async execute(intent) {
    const { action, data } = intent;
    try {
      switch (action) {
        case 'toast':
          window.toast(data.message || 'Default Toast', 3000);
          return this.normalizeResponse(true, { status: 'sent' });
        case 'alert':
          window.alert(data.message || 'Default Alert');
          return this.normalizeResponse(true, { status: 'displayed' });
        case 'confirm':
          const result = window.confirm(data.message || 'Confirm?');
          return this.normalizeResponse(true, result);
        case 'open_file':
          if (window.editorManager && data.path) {
            window.editorManager.addNewFile(data.path, {
              text: data.content || '',
              isUnsaved: !!data.isUnsaved
            });
            return this.normalizeResponse(true, { status: 'opened' });
          }
          return this.normalizeResponse(false, null, 'editorManager or path missing');
        default:
          return this.normalizeResponse(false, null, `Action ${action} not supported`);
      }
    } catch (e) {
      return this.normalizeResponse(false, null, e.message);
    }
    }
  }


class AIProvider extends BaseProvider {
  constructor() {
    super('AIProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.AI;
  }

  async execute(intent) {
    const { action, data } = intent;
    return this.normalizeResponse(true, { 
      answer: `AI Response to ${action}: ${data.prompt || 'No prompt provided'}` 
    }, null, { model: data.model || 'gpt-3.5-turbo' });
  }
}

class GitHubProvider extends BaseProvider {
  constructor() {
    super('GitHubProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.GITHUB;
  }

  async execute(intent) {
    const { action, data } = intent;
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
      
      // Auto-decode base64 for file contents
      if (action === 'get_file' && result.encoding === 'base64' && result.content) {
        try {
          result.decodedContent = atob(result.content.replace(/\n/g, ''));
        } catch (e) {
          result.decodeError = 'Failed to decode base64';
        }
      }
      
      return this.normalizeResponse(true, result);
    } catch (e) {
      return this.normalizeResponse(false, null, e.message);
    }
  }
}

class TerminalProvider extends BaseProvider {
  constructor() {
    super('TerminalProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.TERMINAL;
  }

  async execute(intent, context) {
    if (!context.capabilities.terminal) {
      return this.normalizeResponse(false, null, 'Terminal capability not available');
    }

    const { action, data } = intent;
    if (action === 'exec') {
      if (window.terminal && typeof window.terminal.exec === 'function') {
        const output = await window.terminal.exec(data.command);
        return this.normalizeResponse(true, { output });
      }
      return this.normalizeResponse(false, null, 'Terminal plugin found but exec function missing');
    }
    return this.normalizeResponse(false, null, `Action ${action} not supported`);
  }
}

class DockerProvider extends BaseProvider {
  constructor() {
    super('DockerProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.DOCKER;
  }

  async execute() {
    return this.normalizeResponse(false, null, 'Docker is not supported on Android/Acode environment');
  }
}

class IntentRouter {
  constructor() {
    this.providers = [
      new SystemProvider(),
      new AIProvider(),
      new GitHubProvider(),
      new TerminalProvider(),
      new DockerProvider()
    ];
    this.logs = [];
  }

  async getCapabilities() {
    const isAndroid = /Android/i.test(navigator.userAgent || '');
    const hasTerminal = !!window.terminal;
    
    return {
      terminal: hasTerminal,
      git: hasTerminal,
      android: isAndroid,
      docker: false
    };
  }

  async execute(intent) {
    if (!intent || !intent.scheme) {
      return { success: false, error: 'Invalid intent structure', code: ERROR_CODES.INVALID_INTENT };
    }

    const context = {
      capabilities: await this.getCapabilities(),
      timestamp: Date.now()
    };

    const provider = this.providers.find(p => p.canHandle(intent));
    
    if (!provider) {
      const error = `No provider found for scheme: ${intent.scheme}`;
      this.logs.push({ intent, error, timestamp: Date.now() });
      return { success: false, error, code: ERROR_CODES.PROVIDER_NOT_FOUND };
    }

    try {
      const response = await provider.execute(intent, context);
      this.logs.push({ intent, response, timestamp: Date.now() });
      return response;
    } catch (e) {
      const error = `Execution failed: ${e.message}`;
      this.logs.push({ intent, error, timestamp: Date.now() });
      return { success: false, error, code: ERROR_CODES.EXECUTION_FAILED };
    }
  }

  getHelp() {
    return {
      version: '1.0.0',
      schemes: Object.values(SCHEMES),
      capabilities: this.getCapabilities()
    };
  }

  getLogs() {
    return this.logs;
  }
}
class IntentRouterPlugin {
  constructor() {
    this.router = new IntentRouter();
  }

  async init() {
    window.intentRouter = this.router;
    
    window.runIntentTests = async () => {
      console.log('--- Intent Router Test Suite ---');
      const tests = [
        { scheme: 'system', action: 'toast', data: { message: 'Hello from Intent Router!' } },
        { scheme: 'ai', action: 'prompt', data: { prompt: 'Explain quantum physics' } },
        { scheme: 'docker', action: 'ps', data: {} }
      ];

      for (const test of tests) {
        console.log(`Testing ${test.scheme}...`);
        const res = await this.router.execute(test);
        console.log(`Result [${test.scheme}]:`, res);
      }
    };

    if (window.toast) {
      window.toast('Intent Router Ready', 2000);
    }
    console.log('Intent Router Plugin Initialized');
    
    // Ajout des commandes à Acode
    if (window.acode) {
      acode.addCommand({
        name: 'Intent Router: Run Tests',
        description: 'Execute internal test suite',
        exec: () => window.runIntentTests()
      });
      
      acode.addCommand({
        name: 'Intent Router: View Logs',
        description: 'Show execution history in console',
        exec: () => console.table(this.router.getLogs())
      });
    }
  }


  async destroy() {
    delete window.intentRouter;
    delete window.runIntentTests;
    console.log('Intent Router Plugin Unmounted');
  }
}

if (window.acode) {
  const plugin = new IntentRouterPlugin();
  acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    plugin.init();
  });
  acode.setPluginUnmount('com.leion.roots', () => {
    plugin.destroy();
  });
}