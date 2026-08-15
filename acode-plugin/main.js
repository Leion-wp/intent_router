/**
 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 */

class BaseProvider {
  constructor(name) {
    this.name = name;
  }
  async canHandle(intent) { return false; }
  async execute(intent, context) {
    return { success: false, error: 'Not implemented' };
  }
}

class IntentRouter {
  constructor() {
    this.providers = [];
    this.capabilities = {};
    this.logs = [];
  }

  registerProvider(provider) {
    this.providers.push(provider);
    console.log(`[IntentRouter] Registered: ${provider.name}`);
  }

  async getCapabilities() {
    return {
      terminal: !!window.terminal,
      git: await this.checkGit(),
      termux: /Termux/.test(navigator.userAgent),
      android: /Android/.test(navigator.userAgent),
      docker: false // Not supported on Android/Acode yet
    };
  }

  async checkGit() {
    if (!window.terminal) return false;
    try {
      // Mock check for now, in real scenario we'd run 'git --version'
      return true;
    } catch (e) { return false; }
  }

  async execute(intent) {
    const context = { capabilities: await this.getCapabilities() };
    this.logs.push({ intent, timestamp: Date.now() });

    try {
      const provider = await this.resolveProvider(intent);
      if (!provider) {
        throw new Error(`No provider found for scheme: ${intent.scheme}`);
      }

      const result = await provider.execute(intent, context);
      return this.normalizeResponse(result);
    } catch (err) {
      console.error('[IntentRouter] Execution Error:', err);
      return { success: false, error: err.message };
    }
  }

  async resolveProvider(intent) {
    for (const p of this.providers) {
      if (await p.canHandle(intent)) return p;
    }
    return null;
  }

  normalizeResponse(res) {
    return {
      success: res.success ?? false,

class SystemProvider extends BaseProvider {
  constructor() { super('System'); }
  async canHandle(i) { return i.scheme === 'system'; }
  async execute(i) {
    switch(i.action) {
      case 'alert':
        window.alert(i.data.message);
        return { success: true };
      case 'toast':
        window.toast(i.data.message, 3000);
        return { success: true };
      default:
        return { success: false, error: 'Unknown action' };
    }
  }
}

class AIProvider extends BaseProvider {
  constructor() { super('AI'); }
  async canHandle(i) { return i.scheme === 'ai'; }
  async execute(i) {
    // Integration with Acode AI or external API
    return { success: true, data: { response: "AI Intent Received: " + i.data.prompt } };
  }
}

class GitHubProvider extends BaseProvider {
  constructor() { super('GitHub'); }
  async canHandle(i) { return i.scheme === 'github'; }
  async execute(i) {
    const { repo, path } = i.data;
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`);
      const data = await res.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}


class TerminalProvider extends BaseProvider {
  constructor() { super('Terminal'); }
  async canHandle(i) { return i.scheme === 'terminal'; }
  async execute(i, ctx) {
    if (!ctx.capabilities.terminal) {
      return { success: false, error: 'Terminal capability missing' };
    }
    // Execution logic via window.terminal
    return { success: true, data: { output: `Executed: ${i.data.command}` } };
  }
}

class DockerProvider extends BaseProvider {
  constructor() { super('Docker'); }
  async canHandle(i) { return i.scheme === 'docker'; }
  async execute() {
    return { success: false, error: 'Docker is not supported on this environment' };
  }
}

// Plugin Initialization
class IntentRouterPlugin {
  async init() {
    this.router = new IntentRouter();
    this.router.registerProvider(new SystemProvider());
    this.router.registerProvider(new AIProvider());
    this.router.registerProvider(new GitHubProvider());
    this.router.registerProvider(new TerminalProvider());
    this.router.registerProvider(new DockerProvider());

    window.intentRouter = this.router;
    window.toast('Intent Router Initialized', 2000);
  }

  async destroy() {
    delete window.intentRouter;
  }
}

if (window.acode) {
  const plugin = new IntentRouterPlugin();
  acode.setPluginInit('com.leion.intentrouter', (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    plugin.init();
  });
  acode.setPluginUnmount('com.leion.intentrouter', () => {
    plugin.destroy();
  });
}

// Test Function for Console
window.testIntentRouter = async () => {
  if (!window.intentRouter) return console.error('Router not ready');
  
  console.log('--- Starting Intent Router Tests ---');
  
  const tests = [
    { scheme: 'system', action: 'toast', data: { message: 'Test Toast' } },
    { scheme: 'ai', action: 'prompt', data: { prompt: 'Hello AI' } },
    { scheme: 'docker', action: 'run', data: { image: 'nginx' } }
  ];

  for (const t of tests) {
    const res = await window.intentRouter.execute(t);
    console.log(`Result for ${t.scheme}:`, res);
  }
};

      metadata: {
        ...res.metadata,
        timestamp: Date.now(),
        routerVersion: "1.0.0"
      }
    };
  }
}

 * Intent Router for Acode

class GitHubProvider extends BaseProvider {
  canHandle(intent) {
    return intent.scheme === 'github';
  }

  async execute(intent) {
    const { action, repo, path: filePath, token } = intent.payload;
    const headers = token ? { Authorization: `token ${token}` } : {};

    try {
      if (action === 'get_file') {
        const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`GitHub API error: ${response.statusText}`);
        const data = await response.json();
        return this.normalizeResponse(true, {
          content: atob(data.content.replace(/\n/g, '')),
          sha: data.sha
        });
      }
      
      if (action === 'list_repo') {
        const url = `https://api.github.com/repos/${repo}/contents/`;
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`GitHub API error: ${response.statusText}`);
        const data = await response.json();
        return this.normalizeResponse(true, data);
      }

      return this.normalizeResponse(false, null, `Action ${action} not supported by GitHubProvider`);
    } catch (error) {
      return this.normalizeResponse(false, null, error.message);
    }
  }
}

class TerminalProvider extends BaseProvider {
  canHandle(intent) {
    return intent.scheme === 'terminal';
  }

  async execute(intent, context) {
    if (!context.capabilities.terminal) {
      return this.normalizeResponse(false, null, 'Terminal capability not available');
    }

    const { command, args = [] } = intent.payload;
    try {
      // Logic to interact with Acode terminal or Termux
      // This usually involves window.acode.exec(command) or similar
      const fullCommand = `${command} ${args.join(' ')}`;
      const result = await window.acode.exec(fullCommand); 
      return this.normalizeResponse(true, result);
    } catch (error) {
      return this.normalizeResponse(false, null, error.message);
    }
  }
}

 */

// --- Constants & Types ---
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

// --- Base Provider ---
class BaseProvider {
  constructor(name) {
    this.name = name;
  }
  canHandle(intent) { return false; }
  async execute(intent, context) {
    return this.normalizeResponse(false, null, 'Not implemented');
  }
  normalizeResponse(success, data = null, error = null, metadata = {}) {
    return { success, data, error, metadata, timestamp: Date.now(), provider: this.name };
  }
}

// --- System Provider ---
class SystemProvider extends BaseProvider {
  constructor() { super('SystemProvider'); }
  canHandle(intent) { return intent.scheme === SCHEMES.SYSTEM; }
  async execute(intent, context) {
    try {
      switch (intent.action) {
        case 'toast':
          window.toast(intent.data.message, 3000);
          return this.normalizeResponse(true, { status: 'sent' });
        case 'alert':
          await window.alert(intent.data.title || 'Alert', intent.data.message);
          return this.normalizeResponse(true, { status: 'confirmed' });
        default:
          return this.normalizeResponse(false, null, `Action ${intent.action} not found`);
      }
    } catch (e) {
      return this.normalizeResponse(false, null, e.message);
    }
  }
}
