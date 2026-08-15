/**
 * Intent Router for Acode
 * Developed by Rutex (Dave Conco & Hall Of Codes)
 */

// --- Types & Constants ---
const IntentScheme = {
  SYSTEM: 'system',
  AI: 'ai',
  GIT: 'git',
  HTTP: 'http',
  TERMINAL: 'terminal',
  DOCKER: 'docker'
};

// --- Base Provider ---
class BaseProvider {
  constructor(name) {
    this.name = name;
  }

  async canHandle(intent) {
    return false;
  }

  async execute(intent, context) {
    throw new Error('Method not implemented');
  }

  normalizeResponse(data, success = true, error = null, metadata = {}) {
    return {
      success,
      data,
      error,
      metadata: {
        provider: this.name,
        timestamp: Date.now(),
        ...metadata
      }
    };
  }
}

// --- Concrete Providers ---

class SystemProvider extends BaseProvider {
  constructor() {
    super('SystemProvider');
  }

  async canHandle(intent) {
    return intent.scheme === IntentScheme.SYSTEM;
  }

  async execute(intent, context) {
    try {
      const { action, params } = intent;
      switch (action) {
        case 'toast':
          window.toast(params.message, 3000);
          return this.normalizeResponse({ toasted: true });
        case 'open_file':
          if (window.editorManager) {
            await window.editorManager.addNewFile(params.filename, {
              content: params.content || '',
              isUnsaved: true
            });
            return this.normalizeResponse({ opened: true });
          }
          throw new Error('EditorManager not available');
        default:
          throw new Error(`Unknown system action: ${action}`);
      }
    } catch (e) {
      return this.normalizeResponse(null, false, e.message);
    }
  }
}

class GitProvider extends BaseProvider {
  constructor() {
    super('GitProvider');
  }

  async canHandle(intent) {
    return intent.scheme === IntentScheme.GIT && context.capabilities.git;
  }

  async execute(intent, context) {
    if (!context.capabilities.terminal) {
      return this.normalizeResponse(null, false, 'Terminal capability required for Git');
    }
    // Implementation would use context.terminal to run git commands
    return this.normalizeResponse({ message: 'Git operation simulated' });
  }
}

class AIProvider extends BaseProvider {
  constructor() {
    super('AIProvider');
  }

  async canHandle(intent) {
    return intent.scheme === IntentScheme.AI;
  }

  async execute(intent, context) {
    // Integration with Acode AI or external API
    return this.normalizeResponse({ answer: "I'm your AI assistant in Acode." });
  }
}

// --- Intent Router ---

class IntentRouter {
  constructor() {
    this.providers = [];
    this.capabilities = {
      terminal: false,
      git: false,
      termux: false,
      docker: false
    };
    this.logs = [];
  }

  async init() {
    this.detectCapabilities();
    this.registerProvider(new SystemProvider());
    this.registerProvider(new AIProvider());
    this.registerProvider(new GitProvider());
    console.log('IntentRouter initialized with capabilities:', this.capabilities);
  }

  detectCapabilities() {
    this.capabilities.terminal = !!window.terminal || !!window.acode?.exec;
    this.capabilities.termux = /com.termux/.test(navigator.userAgent);
    // Rough check for git if terminal exists
    if (this.capabilities.terminal) {
      this.capabilities.git = true; // Assume for now, or run 'git --version'
    }
  }

  registerProvider(provider) {
    this.providers.push(provider);
  }

  async execute(intent) {
    const context = { capabilities: this.capabilities, router: this };
    
    try {
      for (const provider of this.providers) {
        if (await provider.canHandle(intent)) {
          return await provider.execute(intent, context);
        }
      }
      return {
        success: false,
        error: `No provider found for scheme: ${intent.scheme}`,
        metadata: { timestamp: Date.now() }
      };
    } catch (error) {
      console.error('[IntentRouter] Execution error:', error);
      return {
        success: false,
        error: error.message,
        metadata: { timestamp: Date.now() }
      };
    }
  }
}

// --- Acode Plugin Entry ---

class AcodeIntentRouter {
  async init() {
    this.router = new IntentRouter();
    await this.router.init();

    // Expose to global for other plugins or scripts
    window.intentRouter = this.router;

    window.toast('Intent Router Ready', 2000);
    
    // Run E2E Test
    this.runTests();
  }

  async runTests() {
    console.log('--- Intent Router E2E Tests ---');
    
    const testIntent = {
      scheme: 'system',
      action: 'toast',
      params: { message: 'Test Intent Successful!' }
    };

    const result = await this.router.execute(testIntent);
    console.log('Test Result:', result);
  }

  async destroy() {
    delete window.intentRouter;
  }
}

if (window.acode) {
  const plugin = new AcodeIntentRouter();
  acode.setPluginInit('com.hallofcodes.intentrouter', (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    plugin.init();
  });
  acode.setPluginUnmount('com.hallofcodes.intentrouter', () => {
    plugin.destroy();
  });
}
