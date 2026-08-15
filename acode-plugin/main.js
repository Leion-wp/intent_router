/**
 * Intent Router for Acode - Android Edition
 * Developed by Rutex (AI Agent)
 */

// --- Constants & Types ---
const PROVIDERS = {
    SYSTEM: 'system',
    AI: 'ai',
    GIT: 'git',
    HTTP: 'http',
    TERMINAL: 'terminal',
    DOCKER: 'docker'
};

const ERROR_CODES = {
    PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
    CAPABILITY_MISSING: 'CAPABILITY_MISSING',
    EXECUTION_FAILED: 'EXECUTION_FAILED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    TIMEOUT: 'TIMEOUT'
};

// --- Base Provider Class ---
class BaseProvider {
    constructor(name) {
        this.name = name;
    }

    async canHandle(intent) {
        return intent.scheme === this.name;
    }

    async execute(intent, context) {
        throw new Error('Method execute() must be implemented');
    }

    normalizeResponse(success, data = null, error = null, metadata = {}) {
        return {
            success,
            data,
            error: error ? {
                message: error.message || error,
                code: error.code || ERROR_CODES.EXECUTION_FAILED,
                stack: error.stack
            } : null,
            metadata: {
                ...metadata,
                provider: this.name,
                timestamp: Date.now()
            }
        };
    }
}

// --- System Provider ---
class SystemProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.SYSTEM);
    }

    async execute(intent, context) {
        try {
            switch (intent.action) {
                case 'toast':
                    window.toast(intent.data.message, 3000);
                    return this.normalizeResponse(true, { displayed: true });
                case 'get_info':
                    return this.normalizeResponse(true, {
                        version: '1.0.0',
                        platform: 'android',
                        acode_version: window.acode?.version || 'unknown'
                    });
                default:
                default:
                    throw new Error(`Action ${intent.action} not supported by SystemProvider`);
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- AI Provider ---
class AIProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.AI);
    }

    async execute(intent, context) {
        try {
            // Logic to interface with Acode AI or external API
            // For now, let's assume we use a prompt-based action
            if (intent.action === 'prompt') {
                // Mocking AI response for now
                return this.normalizeResponse(true, { 
                    answer: "AI logic for Android would go here. Check connectivity or Acode AI plugin." 
                });
            }
            throw new Error(`Action ${intent.action} not supported by AIProvider`);
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- Terminal Provider ---
class TerminalProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.TERMINAL);
    }

    async canHandle(intent) {
        return intent.scheme === this.name && !!window.terminal;
    }

    async execute(intent, context) {
        if (!window.terminal) {
            return this.normalizeResponse(false, null, {
                message: 'Terminal plugin not found',
                code: ERROR_CODES.CAPABILITY_MISSING
            });
        }

        try {
            const result = await window.terminal.run(intent.data.command);
            return this.normalizeResponse(true, { output: result });
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- Git Provider ---
class GitProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.GIT);
    }

    async execute(intent, context) {
        if (!context.capabilities.terminal) {
            return this.normalizeResponse(false, null, {
                message: 'Git requires terminal capability',
                code: ERROR_CODES.CAPABILITY_MISSING
            });
        }

        try {
            // Simplified git check for demo
            const command = intent.action === 'status' ? 'git status' : `git ${intent.action}`;
            const output = await window.terminal.run(command);
            return this.normalizeResponse(true, { output });
        } catch (e) {
            return this.normalizeResponse(false, null, e);

// --- Intent Router Core ---
class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.logs = [];
        this.init();
    }

    init() {
        this.registerProvider(new SystemProvider());
        this.registerProvider(new TerminalProvider());
        this.registerProvider(new GitProvider());
    }

    registerProvider(provider) {
        this.providers.set(provider.name, provider);
    }

    async getCapabilities() {
        return {
            terminal: !!window.terminal,
            git: !!window.terminal, // Simplified
            termux: navigator.userAgent.toLowerCase().includes('termux'),
            docker: false
        };
    }

    async execute(intent) {
        const context = {
            capabilities: await this.getCapabilities(),
            startTime: Date.now()
        };

        const provider = this.providers.get(intent.scheme);

        if (!provider) {
            const err = { message: `No provider found for scheme: ${intent.scheme}`, code: ERROR_CODES.PROVIDER_NOT_FOUND };
            this.logError(err, intent);
            return { success: false, error: err };
        }

        if (!(await provider.canHandle(intent))) {
            const err = { message: `Provider ${intent.scheme} cannot handle this intent (missing capabilities)`, code: ERROR_CODES.CAPABILITY_MISSING };
            this.logError(err, intent);
            return provider.normalizeResponse(false, null, err);
        }

        try {
            console.log(`[IntentRouter] Executing ${intent.scheme}:${intent.action}`);
            const response = await provider.execute(intent, context);
            this.logResponse(response, intent);
            return response;
        } catch (e) {
            const err = { message: e.message || 'Internal Router Error', code: ERROR_CODES.EXECUTION_FAILED };
            this.logError(err, intent);
            return provider.normalizeResponse(false, null, err);
        }
    }

    logError(err, intent) {
        this.logs.push({ type: 'error', intent, err, time: Date.now() });
        console.error(`[IntentRouter Error]`, err, intent);
    }

    logResponse(res, intent) {
        this.logs.push({ type: 'response', intent, res, time: Date.now() });
    }
}

    }

// --- Acode Plugin Lifecycle ---
class IntentRouterPlugin {
    async init() {
        window.intentRouter = new IntentRouter();
        
        // Add a command to test the router
        editorManager.editor.commands.addCommand({
            name: 'intent-router:test',
            bindKey: { win: 'Ctrl-Shift-I', mac: 'Command-Shift-I' },
            exec: () => this.runTests()
        });

        window.toast('Intent Router Initialized', 2000);
    }

    async destroy() {
        delete window.intentRouter;
    }

    async runTests() {
        const tests = [
            { scheme: 'system', action: 'toast', data: { message: 'Hello from Router!' } },
            { scheme: 'system', action: 'get_info', data: {} },
            { scheme: 'invalid', action: 'none', data: {} }
        ];

        window.toast('Running Intent Router Tests...', 2000);

        for (const intent of tests) {
            const res = await window.intentRouter.execute(intent);
            console.log(`Test Result for ${intent.scheme}:`, res);
            if (!res.success) {
                window.toast(`Test Failed: ${res.error.message}`, 4000);
            }
        }
    }
}

if (window.acode) {
    const plugin = new IntentRouterPlugin();
    acode.setPluginInit(plugin.init.bind(plugin));
    acode.setPluginUnmount(plugin.destroy.bind(plugin));
}


            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

 * Intent Router for Acode (Android)
 * Created by Rutex (AI Agent)
 */

const { toast, alert } = window;

// --- TYPES & CONSTANTS ---

const IntentScheme = {
  SYSTEM: 'system',
  AI: 'ai',
  GIT: 'git',
  HTTP: 'http',
  TERMINAL: 'terminal',
  DOCKER: 'docker'
};

const ErrorCode = {
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  CAPABILITY_MISSING: 'CAPABILITY_MISSING',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  TIMEOUT: 'TIMEOUT',
  INVALID_INTENT: 'INVALID_INTENT'
};

// --- BASE PROVIDER ---

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

  normalizeResponse(success, data, error = null, metadata = {}) {
    return {
      success,
      data,
      error: error ? {
        message: typeof error === 'string' ? error : error.message,
        code: error.code || ErrorCode.EXECUTION_FAILED
      } : null,
      metadata: {
        ...metadata,
        provider: this.name,
        timestamp: Date.now()
      }
    };
  }
}

// --- SYSTEM PROVIDER ---

class SystemProvider extends BaseProvider {
  constructor() {
    super('system');
  }

  async canHandle(intent) {
    return intent.scheme === IntentScheme.SYSTEM;
  }

  async execute(intent, context) {
    try {
      const { action, params } = intent;
      
      switch (action) {
        case 'toast':
          toast(params.message || 'No message');
          return this.normalizeResponse(true, { status: 'shown' });
        
        case 'alert':
          await alert(params.title || 'Alert', params.message || '');
          return this.normalizeResponse(true, { status: 'dismissed' });

        case 'get_info':
          return this.normalizeResponse(true, {
            version: '1.0.0',
            platform: 'android',
            acode: typeof acode !== 'undefined' ? 'available' : 'unavailable'
          });

        default:
          throw { message: `Unknown system action: ${action}`, code: ErrorCode.INVALID_INTENT };
      }
    } catch (err) {
      return this.normalizeResponse(false, null, err);
    }
  }
}

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
