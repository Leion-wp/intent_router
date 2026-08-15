/**
 * Intent Router for Acode - Android Edition
 * Version: 1.2.0 (Consolidated)
 * Developed by Rutex (Autonomous AI)
 */

// --- CONSTANTS ---
const PROVIDERS = {
    SYSTEM: 'system',
    AI: 'ai',
    GIT: 'git',
    GITHUB: 'github',
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

// --- BASE PROVIDER ---
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
                message: typeof error === 'string' ? error : (error.message || String(error)),
                code: error.code || ERROR_CODES.EXECUTION_FAILED
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
        super(PROVIDERS.SYSTEM);
    }

    async execute(intent, context) {
        try {
            switch (intent.action) {
                case 'toast':
                    if (window.toast) {
                        window.toast(intent.data?.message || 'No message', 3000);
                    }
                    return this.normalizeResponse(true, { displayed: true });
                case 'get_info':
                    return this.normalizeResponse(true, {
                        version: '1.2.0',
                        platform: 'android',
                        capabilities: context.capabilities
                    });
                case 'alert':
                    if (window.alert) {
                        window.alert(intent.data?.title || 'Alert', intent.data?.message || '');
                    }
                    return this.normalizeResponse(true, { displayed: true });
                default:
                    throw { message: `Action ${intent.action} not supported`, code: ERROR_CODES.VALIDATION_ERROR };
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- TERMINAL PROVIDER ---
class TerminalProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.TERMINAL);
    }

    async canHandle(intent) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        return intent.scheme === this.name && !!terminal;
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
            if (intent.action === 'run') {
                const result = await terminal.run(intent.data.command);
                return this.normalizeResponse(true, { output: result });
            }
            throw { message: `Action ${intent.action} not supported`, code: ERROR_CODES.VALIDATION_ERROR };
        } catch (e) {
            return this.normalizeResponse(false, null, e);

// --- GIT PROVIDER ---
class GitProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.GIT);
    }

    async canHandle(intent) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        return intent.scheme === this.name && !!terminal;
    }

    async execute(intent, context) {
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

// --- GITHUB PROVIDER ---
class GitHubProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.GITHUB);
    }

    async execute(intent, context) {
        const { action, data } = intent;
        try {
            switch (action) {
                case 'get-repo':
                    const repoRes = await fetch(`https://api.github.com/repos/${data.owner}/${data.repo}`);
                    const repoData = await repoRes.json();
                    return this.normalizeResponse(true, repoData);
                case 'list-files':
                    const filesRes = await fetch(`https://api.github.com/repos/${data.owner}/${data.repo}/contents/${data.path || ''}`);
                    const filesData = await filesRes.json();
                    return this.normalizeResponse(true, filesData);
                default:
                    throw { message: `GitHub action '${action}' not supported`, code: ERROR_CODES.VALIDATION_ERROR };
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- HTTP PROVIDER ---
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

    }
}

 * Intent Router for Acode - Android Edition
 * Version: 1.1.0
 * Developed by Rutex (Autonomous AI)
 */

// --- CONSTANTS ---
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

// --- BASE PROVIDER ---
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
                code: error.code || ERROR_CODES.EXECUTION_FAILED
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
        super(PROVIDERS.SYSTEM);
    }

    async execute(intent, context) {
        try {
            switch (intent.action) {
                case 'toast':
                    if (window.toast) {
                        window.toast(intent.data?.message || 'No message', 3000);
                    }
                    return this.normalizeResponse(true, { displayed: true });
                case 'get_info':
                    return this.normalizeResponse(true, {
                        version: '1.1.0',
                        platform: 'android',
                        capabilities: context.capabilities
                    });
                case 'alert':
                    if (window.alert) {
                        window.alert(intent.data?.title || 'Alert', intent.data?.message || '');
                    }
                    return this.normalizeResponse(true, { displayed: true });
                default:
                    throw { message: `Action ${intent.action} not supported`, code: ERROR_CODES.VALIDATION_ERROR };
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }

// --- TERMINAL PROVIDER ---
class TerminalProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.TERMINAL);
    }

    async canHandle(intent) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        return intent.scheme === this.name && !!terminal;
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
            if (intent.action === 'run') {
                const result = await terminal.run(intent.data.command);
                return this.normalizeResponse(true, { output: result });
            }
            throw { message: `Action ${intent.action} not supported`, code: ERROR_CODES.VALIDATION_ERROR };
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- GIT PROVIDER ---
class GitProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.GIT);
    }

    async canHandle(intent) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        return intent.scheme === this.name && !!terminal;
    }

    async execute(intent, context) {
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



// --- HTTP PROVIDER ---
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

// --- AI PROVIDER ---
class AIProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.AI);
    }

    async execute(intent, context) {
        return this.normalizeResponse(true, { 
            message: "AI Intent received. Integration pending.",
            intent_data: intent.data 
        });
    }
}

// --- DOCKER PROVIDER ---
class DockerProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.DOCKER);
    }

    async execute(intent, context) {
        return this.normalizeResponse(false, null, {
            message: 'Docker is not supported on Android natively.',

// --- INTENT ROUTER CORE ---
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
            termux: /Termux/.test(navigator.userAgent)
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



/**
 * AI Provider
 * Handles AI-related intents like prompt generation
 */
class AIProvider extends BaseProvider {
  canHandle(intent) {
    return intent.scheme === 'ai';
  }

  async execute(intent) {
    const { action, data } = intent;
    
    switch (action) {
      case 'prompt':
        // This is a placeholder. In a real scenario, this would call an AI API.
        // For now, we simulate a response.
        return this.normalizeResponse(true, {
          answer: `AI response to: ${data.prompt}`,
          model: data.model || 'default'
        });
      default:
        return this.normalizeResponse(false, null, `AI action '${action}' not supported`);
    }
  }
}

/**
 * GitHub Provider
 * Handles GitHub-related intents using the GitHub API
 */
class GitHubProvider extends BaseProvider {
  canHandle(intent) {
    return intent.scheme === 'github';
  }

  async execute(intent) {
    const { action, data } = intent;
    const token = data.token;

    if (!token && action !== 'get-repo') {
       // some actions might not need token if public, but let's assume we want it for now
    }

    try {
      switch (action) {
        case 'get-repo':
          const repoRes = await fetch(`https://api.github.com/repos/${data.owner}/${data.repo}`);
          const repoData = await repoRes.json();
          return this.normalizeResponse(true, repoData);
        
        case 'list-files':
          const filesRes = await fetch(`https://api.github.com/repos/${data.owner}/${data.repo}/contents/${data.path || ''}`);
          const filesData = await filesRes.json();
          return this.normalizeResponse(true, filesData);

        default:
          return this.normalizeResponse(false, null, `GitHub action '${action}' not supported`);
      }
    } catch (error) {
      return this.normalizeResponse(false, null, error.message);
    }

/**
 * Docker Provider (Stub/Experimental)
 */
class DockerProvider extends BaseProvider {
  canHandle(intent) {
    return intent.scheme === 'docker';
  }

  async execute(intent) {
    return this.normalizeResponse(false, null, "Docker is not supported on Android environment yet.");
  }
}

}

  constructor() {
    this.providers = [];
    this.logs = [];
    this.capabilities = this._detectCapabilities();
  }

  registerProvider(provider) {
    this.providers.push(provider);
  }

  _detectCapabilities() {
    return {
      terminal: !!window.terminal,
      git: !!window.terminal, // Simplified check
      filesystem: true,
      network: navigator.onLine,
      android: /Android/i.test(navigator.userAgent)
    };
  }

  async execute(intent) {
    const startTime = Date.now();
    try {
      const provider = this.providers.find(p => p.canHandle(intent));
      
      if (!provider) {
        return this._normalizeResponse(false, null, `No provider found for scheme: ${intent.scheme}`, startTime);
      }

      // Check for required capabilities if any (future proofing)
      const context = { capabilities: this.capabilities, timestamp: new Date() };
      const result = await provider.execute(intent, context);
      
      return this._normalizeResponse(result.success, result.data, result.error, startTime, result.metadata);
    } catch (error) {
      console.error("[IntentRouter] Execution error:", error);
      return this._normalizeResponse(false, null, error.message, startTime);
    }
  }

  _normalizeResponse(success, data, error, startTime, metadata = {}) {
    return {
      success,
      data,
      error: error || null,
      metadata: {
        ...metadata,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()

/**
 * Acode Plugin Entry Point
 */
class IntentRouterPlugin {
  constructor() {
    this.router = new IntentRouter();
  }

  async init() {
    // Register the router globally so other plugins can use it
    window.intentRouter = this.router;
    
    // Add a command to Acode to show capabilities
    editorManager.editor.commands.addCommand({
      name: "intent-router:capabilities",
      description: "Show Intent Router Capabilities",
      exec: () => {
        const caps = this.router.getCapabilities();
        window.alert("Intent Router Capabilities:\n" + JSON.stringify(caps, null, 2));
      }
    });

    window.toast("Intent Router Initialized", 2000);
  }

  async destroy() {
    delete window.intentRouter;
  }
}

if (window.acode) {
  const plugin = new IntentRouterPlugin();
  acode.setPluginInit(plugin.init.bind(plugin));
  acode.setPluginUnmount(plugin.destroy.bind(plugin));
}

    };
  }
}

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
                metadata: { timestamp: Date.now(), duration, provider: intent?.scheme || 'unknown' }
            };
            this.logExecution(intent, errorResponse, duration);
            return errorResponse;
        }
    }

    logExecution(intent, response, duration) {
        this.logs.push({ intent, response, duration, timestamp: new Date().toISOString() });
        if (this.logs.length > 50) this.logs.shift();

// --- PLUGIN INTEGRATION ---
class IntentRouterPlugin {
    constructor() {
        this.router = new IntentRouter();
    }

    async init() {
        window.intentRouter = this.router;
        
        if (window.acode) {
            acode.addCommand({
                name: 'intent_router:status',
                description: 'Show Intent Router Status',
                exec: async () => {
                    const info = await this.router.execute({ scheme: 'system', action: 'get_info' });
                    window.alert('Intent Router Status', JSON.stringify(info.data, null, 2));
                }
            });
        }
        console.log('Intent Router Plugin Initialized');
    }

    async destroy() {
        delete window.intentRouter;
    }
}

if (window.acode) {
    const plugin = new IntentRouterPlugin();
    acode.setPluginInit('com.leion.roots', () => plugin.init());
    acode.setPluginUnmount('com.leion.roots', () => plugin.destroy());
} else {
    const plugin = new IntentRouterPlugin();
    plugin.init();
}

// --- GLOBAL TEST SUITE ---
window.runIntentTests = async () => {
    console.log('--- STARTING INTENT ROUTER TESTS ---');
    const router = window.intentRouter;
    if (!router) return console.error('Router not found');

    const tests = [
        { name: 'System Toast', intent: { scheme: 'system', action: 'toast', data: { message: 'Test Success!' } } },
        { name: 'System Info', intent: { scheme: 'system', action: 'get_info' } },
        { name: 'Invalid Scheme', intent: { scheme: 'invalid', action: 'test' } }
    ];

    for (const test of tests) {
        console.log(`Running: ${test.name}...`);
        const res = await router.execute(test.intent);
        console.log(`Result:`, res);
    }
    console.log('--- TESTS COMPLETE ---');
};

}

        });
    }
}
