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
            if (intent.action === 'prompt') {
                // Mocking AI response for Android
                return this.normalizeResponse(true, { 
                    answer: "AI logic for Android: Integration with local or remote LLM." 
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
                default: throw new Error(`Git action ${action} not implemented`);
            }

            const output = await window.terminal.run(command);
            return this.normalizeResponse(true, { output });
        } catch (e) {
            return this.normalizeResponse(false, null, e);
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
                body: body ? JSON.stringify(body) : undefined
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
            message: 'Docker is not supported on Android natively yet.',
            code: ERROR_CODES.CAPABILITY_MISSING
        });
    }
}


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
                        acode_version: window.acode?.version || 'unknown',
                        capabilities: context.capabilities
                    });
                default:
                    throw new Error(`Action ${intent.action} not supported by SystemProvider`);
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }

// --- AI Provider ---
class AIProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.AI);
    }

    async execute(intent, context) {
        try {
            if (intent.action === 'prompt') {
                // Mocking AI response for Android
                return this.normalizeResponse(true, { 
                    answer: "AI logic for Android: Integration with Acode AI or external API needed." 
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
                default: throw new Error(`Git action ${action} not implemented`);
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
                body: body ? JSON.stringify(body) : undefined
            });

            const responseData = await response.json().catch(() => null);

// --- Docker Provider (Stub) ---
class DockerProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.DOCKER);
    }

    async execute(intent, context) {
        return this.normalizeResponse(false, null, {
            message: 'Docker is not supported on Android natively yet.',
            code: ERROR_CODES.CAPABILITY_MISSING
        });
    }
}

// --- Intent Router Core ---
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
            android: true
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

            const context = { capabilities: await this.getCapabilities() };
            const result = await Promise.race([
                targetProvider.execute(intent, context),
                new Promise((_, reject) => setTimeout(() => reject({ message: 'Execution timeout', code: ERROR_CODES.TIMEOUT }), 30000))
            ]);

            this.logExecution(intent, result, Date.now() - startTime);
            return result;

        } catch (e) {
            const errorResponse = {
                success: false,
                error: {
                    message: e.message || e,
                    code: e.code || ERROR_CODES.EXECUTION_FAILED
                },
                metadata: { timestamp: Date.now(), duration: Date.now() - startTime }
            };
            this.logExecution(intent, errorResponse, Date.now() - startTime);
            return errorResponse;
        }

// --- Plugin Integration ---
class IntentRouterPlugin {
    async init() {
        this.router = new IntentRouter();
        
        if (window.acode) {
            window.acode.registerPlugin('intent_router', this);
            
            acode.addCommand({
                name: 'intent_router:test',
                description: 'Test Intent Router',
                exec: async () => {
                    const result = await this.router.execute({
                        scheme: 'system',
                        action: 'toast',
                        data: { message: 'Intent Router is Active!' }
                    });
                    console.log('Test Result:', result);
                }
            });
        }
    }

    async destroy() {
        // Cleanup if necessary
    }

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


    logExecution(intent, response, duration) {
        this.logs.push({ intent, response, duration, timestamp: new Date().toISOString() });
        if (this.logs.length > 50) this.logs.shift();
    }
}

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
            result.metadata.duration = duration;
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
} else {
    window.intentRouter = new IntentRouter();
}
