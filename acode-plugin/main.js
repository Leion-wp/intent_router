/**
 * Intent Router for Acode - Android Edition
 * Developed by Rutex (AI Agent)
 */

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
                message: error.message || String(error),
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
                    if (window.toast) {
                        window.toast(intent.data.message, 3000);
                    } else {
                        console.log('TOAST:', intent.data.message);
                    }
                    return this.normalizeResponse(true, { displayed: true });
                case 'get_info':
                    return this.normalizeResponse(true, {
                        version: '1.0.0',
                        platform: 'android',
                        acode_version: window.acode?.version || 'unknown',
                        capabilities: context.capabilities
                    });
                default:
                    throw new Error(`Action ${intent.action} not supported by SystemProvider`);
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- AI Provider (Stub/Adapter) ---
class AIProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.AI);
    }

    async execute(intent, context) {
        try {
            if (intent.action === 'prompt') {
                return this.normalizeResponse(true, { 
                    answer: "AI capability is routed. Android integration pending specific AI plugin hooks." 
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
        const hasTerminal = !!(window.terminal || (window.acode && window.acode.require('terminal')));
        return intent.scheme === this.name && hasTerminal;
    }

    async execute(intent, context) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        if (!terminal) {
            return this.normalizeResponse(false, null, {
                message: 'Terminal plugin not found',
                code: ERROR_CODES.CAPABILITY_MISSING
            });
        }

        try {
            const result = await terminal.run(intent.data.command);
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

    async canHandle(intent) {
        const hasTerminal = !!(window.terminal || (window.acode && window.acode.require('terminal')));
        return intent.scheme === this.name && hasTerminal;
    }

    async execute(intent, context) {
        if (!context.capabilities.terminal) {
            return this.normalizeResponse(false, null, {
                message: 'Git requires terminal capability',
                code: ERROR_CODES.CAPABILITY_MISSING
            });
        }

        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        try {
            const { action, data } = intent;
            let command = '';

            switch (action) {
                case 'status': command = 'git status'; break;
                case 'commit': command = `git commit -m "${data.message}"`; break;
                case 'push': command = 'git push'; break;
                default:
                    command = `git ${action} ${data?.args || ''}`;
            }

            const output = await terminal.run(command);
            return this.normalizeResponse(true, { output });
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- HTTP Provider ---
class HttpProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.HTTP);
    }

    async execute(intent, context) {
        try {
            const { url, method = 'GET', headers = {}, body } = intent.data;
            const response = await fetch(url, {
                method,
                headers,
                body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
            });

            const responseData = await response.json().catch(() => null);
            return this.normalizeResponse(response.ok, responseData, response.ok ? null : {
                message: `HTTP Error: ${response.status}`,
                code: response.status
            });
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- Docker Provider (Stub) ---
class DockerProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.DOCKER);
    }

    async execute(intent, context) {
        return this.normalizeResponse(false, null, {
            message: 'Docker is not supported on Android natively yet. Use a remote bridge.',
            code: ERROR_CODES.CAPABILITY_MISSING
        });
    }
}

// --- Intent Router (Main Engine) ---
class IntentRouter {
    constructor() {
        this.providers = [
            new SystemProvider(),
            new AIProvider(),
            new TerminalProvider(),
            new GitProvider(),
            new HttpProvider(),
            new DockerProvider()
        ];
        this.logs = [];
    }

    async getCapabilities() {
        const terminalAvailable = !!(window.terminal || (window.acode && window.acode.require('terminal')));
        return {
            terminal: terminalAvailable,
            git: terminalAvailable,
            network: navigator.onLine,
            docker: false,
            android: true,
            termux: navigator.userAgent.toLowerCase().includes('termux')
        };
    }

    async execute(intent) {
        const startTime = Date.now();
        try {
            if (!intent || !intent.scheme || !intent.action) {
                throw { message: 'Invalid intent format', code: ERROR_CODES.VALIDATION_ERROR };
            }

            let targetProvider = null;
            for (const p of this.providers) {
                if (await p.canHandle(intent)) {
                    targetProvider = p;
                    break;
                }
            }

            if (!targetProvider) {
                throw { message: `No provider found for scheme: ${intent.scheme}`, code: ERROR_CODES.PROVIDER_NOT_FOUND };
            }

            const context = { 
                capabilities: await this.getCapabilities(),
                timestamp: startTime
            };

            const result = await Promise.race([
                targetProvider.execute(intent, context),
                new Promise((_, reject) => 
                    setTimeout(() => reject({ message: 'Execution timeout', code: ERROR_CODES.TIMEOUT }), 30000)
                )
            ]);

            const duration = Date.now() - startTime;
            if (result.metadata) result.metadata.duration = duration;
            this.logExecution(intent, result, duration);
            
            return result;

        } catch (e) {
            const duration = Date.now() - startTime;
            const errorResponse = {
                success: false,
                data: null,
                error: {
                    message: e.message || String(e),
                    code: e.code || ERROR_CODES.EXECUTION_FAILED
                },
                metadata: { 
                    timestamp: Date.now(), 
                    duration,
                    provider: intent?.scheme || 'unknown'
                }
            };
            this.logExecution(intent, errorResponse, duration);
            return errorResponse;
        }
    }

    logExecution(intent, response, duration) {
        this.logs.push({
            intent,
            response,
            duration,
            timestamp: new Date().toISOString()
        });
        if (this.logs.length > 50) this.logs.shift();
    }
}

// --- Plugin Integration ---
class IntentRouterPlugin {
    constructor() {
        this.router = new IntentRouter();
    }

    async init() {
        console.log('Intent Router Plugin Initialized');
        
        // Export to global scope
        window.intentRouter = this.router;
        
        if (window.acode) {
            acode.addCommand({
                name: 'intent_router:test_toast',
                description: 'Test Intent Router Toast',
                exec: async () => {
                    await this.router.execute({
                        scheme: 'system',
                        action: 'toast',
                        data: { message: 'Intent Router System Test Success!' }
                    });
                }
            });

            acode.addCommand({
                name: 'intent_router:status',
                description: 'Show Intent Router Status',
                exec: async () => {
                    const info = await this.router.execute({ scheme: 'system', action: 'get_info' });
                    window.alert(JSON.stringify(info.data, null, 2));
                }
            });
        }
    }

    async destroy() {
        delete window.intentRouter;
    }
}

if (window.acode) {
    const plugin = new IntentRouterPlugin();
    acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFile, cacheFileUrl }) => {
        plugin.init();
    });
    acode.setPluginUnmount('com.leion.roots', () => {
        plugin.destroy();
    });
} else {
    // Non-acode environment (e.g. testing)
    const plugin = new IntentRouterPlugin();
    plugin.init();
}

// --- Test Suite ---
window.runIntentTests = async () => {
    console.log('--- STARTING INTENT ROUTER TESTS ---');
    if (!window.intentRouter) {
        console.error('Intent Router not initialized!');
        return;
    }

    const tests = [
        {
            name: 'System Toast',
            intent: { scheme: 'system', action: 'toast', data: { message: 'Test Success!' } }
        },
        {
            name: 'System Info',
            intent: { scheme: 'system', action: 'get_info' }
        },
        {
            name: 'Invalid Scheme',
            intent: { scheme: 'invalid', action: 'test' }
        }
    ];

    for (const test of tests) {
        console.log(`Running: ${test.name}...`);
        const res = await window.intentRouter.execute(test.intent);
        console.log(`Result for ${test.name}:`, res);
    }
    console.log('--- TESTS COMPLETE ---');
};

 * Intent Router for Acode - Android Edition
 * Version: 1.0.0
 * Author: Rutex (Autonomous AI)
 */

// --- TYPES & CONSTANTS ---
const IntentScheme = {
  SYSTEM: 'system',
  AI: 'ai',
  GIT: 'git',
  HTTP: 'http',
  TERMINAL: 'terminal',
  DOCKER: 'docker'
};

const ErrorCodes = {
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  CAPABILITY_MISSING: 'CAPABILITY_MISSING',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  INVALID_INTENT: 'INVALID_INTENT',
  TIMEOUT: 'TIMEOUT'
};

// --- BASE PROVIDER ---
class BaseProvider {
  constructor(name, capabilities = []) {
    this.name = name;
    this.capabilities = capabilities;
  }

  async canHandle(intent) {
    return false;
  }

  async execute(intent, context) {
    throw new Error('Method not implemented');
  }

  normalizeResponse(success, data = null, error = null, metadata = {}) {
    return {
      success,
      data,
      error: error ? (typeof error === 'string' ? error : error.message) : null,
      metadata: {
        provider: this.name,
        timestamp: Date.now(),
        ...metadata
      }
    };
  }
}

// --- SYSTEM PROVIDER ---
class SystemProvider extends BaseProvider {
  constructor() {
    super('system', ['ui', 'fs']);
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
          return this.normalizeResponse(true, { displayed: true });
        case 'alert':
          window.alert(params.title, params.message);
          return this.normalizeResponse(true, { displayed: true });
        default:
          return this.normalizeResponse(false, null, `Action ${action} not supported by SystemProvider`);
      }
    } catch (e) {
      return this.normalizeResponse(false, null, e);
    }
  }
}

// --- TERMINAL PROVIDER ---
class TerminalProvider extends BaseProvider {
  constructor() {
    super('terminal', ['shell']);
  }

  async canHandle(intent) {
    return intent.scheme === IntentScheme.TERMINAL;
  }

  async execute(intent, context) {
    if (!context.capabilities.terminal) {
      return this.normalizeResponse(false, null, ErrorCodes.CAPABILITY_MISSING);
    }
    try {
      // Integration with Acode Terminal Plugin if available
      const terminal = window.acode?.require('terminal');
      if (terminal) {
        terminal.run(intent.params.command);
        return this.normalizeResponse(true, { status: 'sent_to_terminal' });
      }
      return this.normalizeResponse(false, null, 'Acode Terminal plugin not found');
    } catch (e) {
      return this.normalizeResponse(false, null, e);
    }
  }
}

// --- INTENT ROUTER CORE ---
class IntentRouter {
  constructor() {
    this.providers = [];
    this.capabilities = {
      terminal: !!window.acode?.require('terminal'),
      git: false, // Will be checked dynamically
      android: true,
      termux: false
    };
    this.logs = [];
  }

  registerProvider(provider) {
    this.providers.push(provider);
    console.log(`[IntentRouter] Registered: ${provider.name}`);
  }

  async init() {
    // Detect environment
    this.capabilities.termux = await this.checkTermux();
    this.capabilities.git = await this.checkGit();
  }

  async checkTermux() {
    return /Termux/.test(navigator.userAgent) || !!window.termux;
  }

  async checkGit() {
    // Simplified check for Android environment
    return this.capabilities.terminal; 
  }

  async execute(intent) {
    const logEntry = { intent, startTime: Date.now() };
    
    try {
      if (!intent || !intent.scheme) {
        throw new Error(ErrorCodes.INVALID_INTENT);
      }

      const provider = this.providers.find(p => p.canHandle(intent));
      
      if (!provider) {
        const errorRes = { success: false, error: ErrorCodes.PROVIDER_NOT_FOUND };
        this.log(logEntry, errorRes);
        return errorRes;
      }

      const response = await provider.execute(intent, { capabilities: this.capabilities });
      this.log(logEntry, response);
      return response;

    } catch (error) {
      const errorRes = { success: false, error: error.message || ErrorCodes.EXECUTION_FAILED };
      this.log(logEntry, errorRes);
      return errorRes;
    }
  }

  log(entry, response) {
    entry.endTime = Date.now();
    entry.duration = entry.endTime - entry.startTime;
    entry.response = response;
    this.logs.push(entry);
    if (this.logs.length > 50) this.logs.shift();
  }
}

// --- PLUGIN INTEGRATION ---
let router;

async function initPlugin() {
  router = new IntentRouter();
  
  // Register default providers
  router.registerProvider(new SystemProvider());
  router.registerProvider(new TerminalProvider());
  
  await router.init();

  // Export to global scope for other plugins/scripts
  window.intentRouter = router;
  
  window.toast('Intent Router Ready', 2000);
}

if (window.acode) {
  acode.setPluginInit(initPlugin);
} else {
  initPlugin();
}

// --- TEST SUITE ---
window.testIntentRouter = async () => {
  console.log('--- STARTING INTENT ROUTER TESTS ---');
  
  // Test 1: System Toast
  console.log('Test 1: System Toast...');
  const res1 = await router.execute({
    scheme: 'system',
    action: 'toast',
    params: { message: 'Test Success!' }
  });
  console.log('Result 1:', res1);

  // Test 2: Invalid Provider
  console.log('Test 2: Invalid Provider...');
  const res2 = await router.execute({
    scheme: 'unknown',
    action: 'none'
  });
  console.log('Result 2 (Should fail):', res2);

  console.log('--- TESTS COMPLETE ---');
};

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
                message: error.message || String(error),
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
                    if (window.toast) {
                        window.toast(intent.data.message, 3000);
                    } else {
                        console.log('TOAST:', intent.data.message);
                    }
                    return this.normalizeResponse(true, { displayed: true });
                case 'get_info':
                    return this.normalizeResponse(true, {
                        version: '1.0.0',
                        platform: 'android',
                        acode_version: window.acode?.version || 'unknown',
                        capabilities: context.capabilities
                    });
                default:
                    throw new Error(`Action ${intent.action} not supported by SystemProvider`);
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- AI Provider (Stub/Adapter) ---
class AIProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.AI);
    }

    async execute(intent, context) {
        try {
            if (intent.action === 'prompt') {
                return this.normalizeResponse(true, { 
                    answer: "AI capability is routed. Android integration pending specific AI plugin hooks." 
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

    async canHandle(intent) {
        return intent.scheme === this.name && !!window.terminal;
    }

    async execute(intent, context) {
        if (!context.capabilities.terminal) {
            return this.normalizeResponse(false, null, {
                message: 'Git requires terminal capability',
                code: ERROR_CODES.CAPABILITY_MISSING
            });
        }

        try {
            const { action, data } = intent;
            let command = '';

            switch (action) {
                case 'status': command = 'git status'; break;
                case 'commit': command = `git commit -m "${data.message}"`; break;
                case 'push': command = 'git push'; break;
                default:
                    command = `git ${action} ${data?.args || ''}`;
            }

            const output = await window.terminal.run(command);
            return this.normalizeResponse(true, { output });
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- HTTP Provider ---
class HttpProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.HTTP);
    }

    async execute(intent, context) {
        try {
            const { url, method = 'GET', headers = {}, body } = intent.data;
            const response = await fetch(url, {
                method,
                headers,
                body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
            });

            const responseData = await response.json().catch(() => null);
            return this.normalizeResponse(response.ok, responseData, response.ok ? null : {
                message: `HTTP Error: ${response.status}`,
                code: response.status
            });
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- Docker Provider (Stub) ---
class DockerProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.DOCKER);
    }

    async execute(intent, context) {
        return this.normalizeResponse(false, null, {
            message: 'Docker is not supported on Android natively yet. Use a remote bridge.',
            code: ERROR_CODES.CAPABILITY_MISSING
        });
    }
}

// --- Intent Router (Main Engine) ---
class IntentRouter {
    constructor() {
        this.providers = [
            new SystemProvider(),
            new AIProvider(),
            new TerminalProvider(),
            new GitProvider(),
            new HttpProvider(),
            new DockerProvider()
        ];
        this.logs = [];
    }

    async getCapabilities() {
        return {
            terminal: !!window.terminal,
            git: !!window.terminal,
            network: navigator.onLine,
            docker: false,
            android: true,
            termux: navigator.userAgent.toLowerCase().includes('termux')
        };
    }

    async execute(intent) {
        const startTime = Date.now();
        try {
            if (!intent || !intent.scheme || !intent.action) {
                throw { message: 'Invalid intent format', code: ERROR_CODES.VALIDATION_ERROR };
            }

            let targetProvider = null;
            for (const p of this.providers) {
                if (await p.canHandle(intent)) {
                    targetProvider = p;
                    break;
                }
            }

            if (!targetProvider) {
                throw { message: `No provider found for scheme: ${intent.scheme}`, code: ERROR_CODES.PROVIDER_NOT_FOUND };
            }

            const context = { 
                capabilities: await this.getCapabilities(),
                timestamp: startTime
            };

            const result = await Promise.race([
                targetProvider.execute(intent, context),
                new Promise((_, reject) => 
                    setTimeout(() => reject({ message: 'Execution timeout', code: ERROR_CODES.TIMEOUT }), 30000)
                )
            ]);

            const duration = Date.now() - startTime;
            if (result.metadata) result.metadata.duration = duration;
            this.logExecution(intent, result, duration);
            
            return result;

        } catch (e) {
            const duration = Date.now() - startTime;
            const errorResponse = {
                success: false,
                data: null,
                error: {
                    message: e.message || String(e),
                    code: e.code || ERROR_CODES.EXECUTION_FAILED
                },
                metadata: { 
                    timestamp: Date.now(), 
                    duration,
                    provider: intent?.scheme || 'unknown'
                }
            };
            this.logExecution(intent, errorResponse, duration);
            return errorResponse;
        }
    }

    logExecution(intent, response, duration) {
        this.logs.push({
            intent,
            response,
            duration,
            timestamp: new Date().toISOString()
        });
        if (this.logs.length > 50) this.logs.shift();
    }
}

// --- Plugin Integration ---
class IntentRouterPlugin {
    constructor() {
        this.router = new IntentRouter();
    }

    async init() {
        console.log('Intent Router Plugin Initialized');
        
        if (window.acode) {
            acode.addCommand({
                name: 'intent_router:test_toast',
                description: 'Test Intent Router Toast',
                exec: async () => {
                    await this.router.execute({
                        scheme: 'system',
                        action: 'toast',
                        data: { message: 'Intent Router System Test Success!' }
                    });
                }
            });

            acode.addCommand({
                name: 'intent_router:status',
                description: 'Show Intent Router Status',
                exec: async () => {
                    const info = await this.router.execute({ scheme: 'system', action: 'get_info' });
                    window.alert(JSON.stringify(info.data, null, 2));
                }
            });
        }
    }

    async destroy() {}

    async sendIntent(intent) {
        return await this.router.execute(intent);
    }
}

if (window.acode) {
    const plugin = new IntentRouterPlugin();
    acode.setPluginInit('intent_router', (baseUrl, $page, { cacheFile, cacheFileUrl }) => {
        plugin.init();
    });
    acode.setPluginUnmount('intent_router', () => {
        plugin.destroy();
    });
}
