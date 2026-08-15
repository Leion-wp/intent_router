/**
 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 * Version: 1.0.0
 * 
 * A unified orchestration layer for mobile automation on Android.
 */

class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: true, 
            docker: false,
            termux: false,
            system: true,
            network: navigator.onLine,
            clipboard: false
        };
        this.logs = [];
        this.maxLogs = 200;
    }

    async init() {
        this.log('info', 'Initializing Intent Router...');
        await this.detectCapabilities();
        this.registerDefaultProviders();
        this.log('info', 'Intent Router initialized', { capabilities: this.capabilities });
    }

    async detectCapabilities() {
        try {
            // 1. Network status
            this.capabilities.network = navigator.onLine;
            window.addEventListener('online', () => {
                this.capabilities.network = true;
                this.log('info', 'Network is online');
            });
            window.addEventListener('offline', () => {
                this.capabilities.network = false;
                this.log('warn', 'Network is offline');
            });

            // 2. Terminal & Termux detection
            this.capabilities.termux = !!(window.cordova && cordova.plugins && cordova.plugins.termux);
            this.capabilities.terminal = !!(window.acode && (window.acode.terminal || window.terminal)) || this.capabilities.termux;
            
            // 3. Git detection
            this.capabilities.git = this.capabilities.terminal;

            // 4. Clipboard detection
            this.capabilities.clipboard = !!(window.cordova && cordova.plugins && cordova.plugins.clipboard);
            
            // 5. Docker detection (Disabled by default on Android)
            this.capabilities.docker = false; 

        } catch (e) {
            this.log('warn', 'Capability detection partially failed', e.message);
        }
    }

    log(level, message, details = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            details,
            id: Math.random().toString(36).substr(2, 9)
        };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        
        const logMsg = `[IntentRouter][${level.toUpperCase()}] ${message}`;
        if (level === 'error') console.error(logMsg, details || '');
        else if (level === 'warn') console.warn(logMsg, details || '');
        else console.log(logMsg, details || '');
    }

    registerProvider(name, provider) {
        if (typeof provider.canHandle !== 'function' || typeof provider.execute !== 'function') {
            this.log('error', `Provider '${name}' rejected: Missing required methods (canHandle/execute).`);
            return;
        }
        this.providers.set(name, provider);
        this.log('info', `Provider registered: ${name}`);
    }

    async execute(intent) {
        const traceId = intent?.meta?.traceId || Math.random().toString(36).substring(7);
        this.log('info', `Executing intent: ${intent?.intent}`, { traceId, intent });

        try {
            // 1. Basic Validation
            if (!intent || typeof intent.intent !== 'string') {
                return this.createErrorResponse('INVALID_INTENT', 'Intent is missing or malformed', traceId);
            }

            // 2. Provider Resolution
            let targetProvider = null;
            let providerName = intent.provider;

            if (providerName) {
                targetProvider = this.providers.get(providerName);
            } else {
                for (const [name, provider] of this.providers) {
                    if (await provider.canHandle(intent)) {
                        targetProvider = provider;
                        providerName = name;
                        break;
                    }
                }
            }

            if (!targetProvider) {
                return this.createErrorResponse('PROVIDER_NOT_FOUND', `No provider found for intent: ${intent.intent}`, traceId);
            }

            // 3. Capability Check
            if (targetProvider.requiredCapability && !this.capabilities[targetProvider.requiredCapability]) {
                return this.createErrorResponse('CAPABILITY_MISSING', `Capability '${targetProvider.requiredCapability}' required by provider '${providerName}' is not available.`, traceId);
            }

            // 4. Execution with Timeout
            const timeoutMs = intent.timeout || 30000;
            const context = { traceId, capabilities: this.capabilities, router: this };

            const result = await Promise.race([
                targetProvider.execute(intent, context),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
            ]);

            // 5. Normalization
            return this.normalizeResponse(result, providerName, traceId);

        } catch (error) {
            let code = 'EXECUTION_FAILED';
            let message = error.message;

            if (error.message === 'TIMEOUT') code = 'TIMEOUT';
            else if (error.name === 'TypeError' && error.message.includes('fetch')) code = 'NETWORK_ERROR';

            this.log('error', `Execution error for ${intent?.intent}`, { code, message, stack: error.stack });
            return this.createErrorResponse(code, message, traceId, error);
        }
    }

    normalizeResponse(result, providerName, traceId) {
        const normalized = {
            success: !!result?.success,
            data: result?.data ?? null,
            error: result?.error ?? null,
            metadata: {
                provider: providerName,
                traceId,
                timestamp: new Date().toISOString(),
                ...(result?.metadata || {})
            }
        };

        if (!normalized.success && !normalized.error) {
            normalized.error = { code: 'UNKNOWN_ERROR', message: 'Provider failed without error details' };
        }

        if (!normalized.success) {
            const msg = normalized.error.message || normalized.error.code || 'Unknown error';
            this.log('warn', `Intent failed (${providerName}): ${msg}`, normalized.error);
        }

        return normalized;
    }

    createErrorResponse(code, message, traceId, details = null) {
        const response = {
            success: false,
            data: null,
            error: { code, message, details: details?.stack || (typeof details === 'string' ? details : JSON.stringify(details)) },
            metadata: { traceId, timestamp: new Date().toISOString() }
        };
        window.toast(`Intent Router: ${message}`, 5000);
        return response;
    }

    registerDefaultProviders() {
        this.registerProvider('system', new SystemProvider());
        this.registerProvider('http', new HttpProvider());
        this.registerProvider('ai', new AIProvider());
        this.registerProvider('terminal', new TerminalProvider());
        this.registerProvider('git', new GitProvider());
        this.registerProvider('vscode', new VSCodeProvider());
        this.registerProvider('docker', new DockerProvider());
    }
}

class BaseProvider {
    constructor(name, requiredCapability = null) {
        this.name = name;
        this.requiredCapability = requiredCapability;
    }
    async canHandle(intent) { return false; }
    async execute(intent, context) { throw new Error("Not implemented"); }
    success(data = null, metadata = {}) { return { success: true, data, metadata }; }
    fail(code, message, metadata = {}) { return { success: false, error: { code, message }, metadata }; }
}

class SystemProvider extends BaseProvider {
    constructor() { super('system', 'system'); }
    async canHandle(intent) { return intent.intent.startsWith('system://') || intent.intent.startsWith('acode://'); }
    async execute(intent, context) {
        const action = intent.intent.split('://')[1];
        const payload = intent.payload || {};
        try {
            switch (action) {
                case 'toast':
                    window.toast(payload.message || 'No message', payload.duration || 3000);
                    return this.success();
                case 'open-url':
                    if (!payload.url) return this.fail('MISSING_PARAM', 'URL is required');
                    window.open(payload.url, '_system');
                    return this.success();
                case 'copy':
                    if (!payload.text) return this.fail('MISSING_PARAM', 'Text is required');
                    if (context.capabilities.clipboard) {
                        await new Promise((res, rej) => cordova.plugins.clipboard.copy(payload.text, res, rej));
                        return this.success({ copied: true });
                    }
                    return this.fail('CAPABILITY_MISSING', 'Clipboard API not available');
                default:
                    return this.fail('UNKNOWN_ACTION', `Action '${action}' not supported`);
            }
        } catch (e) { return this.fail('SYSTEM_ERROR', e.message); }
    }
}

class HttpProvider extends BaseProvider {
    constructor() { super('http', 'network'); }
    async canHandle(intent) { return intent.intent.startsWith('http://') || intent.intent.startsWith('https://'); }
    async execute(intent, context) {
        const url = intent.intent;
        try {
            const response = await fetch(url, {
                method: intent.payload?.method || 'GET',
                headers: intent.payload?.headers || {},
                body: intent.payload?.body ? (typeof intent.payload.body === 'string' ? intent.payload.body : JSON.stringify(intent.payload.body)) : undefined
            });
            const contentType = response.headers.get('content-type');
            const data = contentType && contentType.includes('application/json') ? await response.json() : await response.text();
            if (!response.ok) return this.fail('HTTP_ERROR', `Status ${response.status}`, { status: response.status, data });
            return this.success(data, { status: response.status });
        } catch (e) { return this.fail('NETWORK_ERROR', e.message); }
    }
}

class TerminalProvider extends BaseProvider {
    constructor() { super('terminal', 'terminal'); }
    async canHandle(intent) { return intent.intent.startsWith('terminal://') || intent.intent.startsWith('shell://'); }
    async execute(intent, context) {
        const command = intent.payload?.command;
        if (!command) return this.fail('MISSING_PARAM', 'Command is required');
        try {
            const term = window.acode.terminal || window.terminal;
            if (!term) throw new Error('Terminal API not found');
            const result = await term.run(command);
            return this.success(result);
        } catch (e) { return this.fail('TERMINAL_ERROR', e.message); }
    }
}

class AIProvider extends BaseProvider {
    constructor() { super('ai'); }
    async canHandle(intent) { return intent.intent.startsWith('ai://'); }
    async execute(intent, context) {
        return this.success({ response: "AI Processed: " + (intent.payload?.prompt || "") });
    }
}

class GitProvider extends BaseProvider {
    constructor() { super('git', 'git'); }
    async canHandle(intent) { return intent.intent.startsWith('git://') || intent.intent.startsWith('github://'); }
    async execute(intent, context) {
        const action = intent.intent.split('://')[1];
        if (context.capabilities.terminal) {
            const command = `git ${action} ${intent.payload?.args || ''}`;
            return context.router.execute({ intent: 'terminal://run', payload: { command } });
        }
        return this.fail('NOT_IMPLEMENTED', 'Git provider requires terminal access');
    }
}

class VSCodeProvider extends BaseProvider {
    constructor() { super('vscode'); }
    async canHandle(intent) { return intent.intent.startsWith('vscode://'); }
    async execute(intent, context) {
        try {
            const url = new URL(intent.intent);
            const command = url.hostname + url.pathname;
            switch (command) {
                case 'extension/install':
                    return this.success({ action: 'mock_install', id: url.searchParams.get('id') });
                default:
                    return this.fail('NOT_SUPPORTED', `VS Code intent '${command}' not supported on mobile.`);
            }
        } catch (e) { return this.fail('INVALID_URL', e.message); }
    }
}

class DockerProvider extends BaseProvider {
    constructor() { super('docker'); }
    async canHandle(intent) { return intent.intent.startsWith('docker://'); }
    async execute(intent, context) {
        const action = intent.intent.split('://')[1];
        if (context.capabilities.docker) {
             return this.success(`Executed ${action} on local docker (mocked)`);
        }
        if (intent.payload?.ssh) {
             return this.success(`Executed ${action} on remote docker via SSH (mocked)`);
        }
        return this.fail('CAPABILITY_MISSING', 'Docker is not natively supported on Android. Use a remote host or Termux setup.');
    }
}

async function runTests() {
    console.log("--- Starting Intent Router E2E Tests ---");
    const router = window.intentRouter;
    if (!router) return console.error("Intent Router not found in window");

    const tests = [
        { name: 'System Toast', intent: { intent: 'system://toast', payload: { message: 'Test Success!' } } },
        { name: 'HTTP Get (JSON)', intent: { intent: 'https://jsonplaceholder.typicode.com/todos/1' } },
        { name: 'AI Mock', intent: { intent: 'ai://prompt', payload: { prompt: 'Hello Rutex' } } },
        { name: 'VSCode Extension Mock', intent: { intent: 'vscode://extension/install?id=rutex.intent-router' } },
        { name: 'Terminal Missing Command', intent: { intent: 'terminal://run', payload: {} } },
        { name: 'Docker Missing Capability', intent: { intent: 'docker://ps' } },
        { name: 'Invalid Scheme', intent: { intent: 'unknown://action' } },
        { name: 'Timeout Test', intent: { intent: 'https://httpbin.org/delay/5', timeout: 1000 } }
    ];

    for (const test of tests) {
        console.log(`[TEST] Running: ${test.name}`);
        try {
            const res = await router.execute(test.intent);
            console.log(`[TEST] Result for ${test.name}:`, JSON.stringify(res, null, 2));
        } catch (e) {
            console.error(`[TEST] Critical failure in test ${test.name}:`, e);
        }
    }
    console.log("--- E2E Tests Completed ---");
}

if (window.acode) {
    const router = new IntentRouter();
    acode.setPluginInit('com.leion.roots', async () => {
        await router.init();
        window.intentRouter = router;
        window.intentRouter.runTests = runTests;
        window.intentRouter.getLogs = () => router.logs;
        acode.addCommand('Intent Router: Run Tests', 'run_intent_tests', () => window.intentRouter.runTests());
        window.toast('Intent Router Ready', 2000);
    });
    acode.setPluginUnmount('com.leion.roots', () => { 
        delete window.intentRouter; 
    });
}

 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 * Version: 1.1.0
 */

class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: true,
            docker: false,
            termux: false,
            system: true,
            network: navigator.onLine,
            clipboard: false
        };
        this.logs = [];
        this.maxLogs = 200;
    }

    async init() {
        this.log('info', 'Initializing Intent Router...');
        await this.detectCapabilities();
        this.registerDefaultProviders();
        this.log('info', 'Intent Router initialized', { capabilities: this.capabilities });
    }

    async detectCapabilities() {
        try {
            // Network
            window.addEventListener('online', () => { this.capabilities.network = true; this.log('info', 'Network online'); });
            window.addEventListener('offline', () => { this.capabilities.network = false; this.log('warn', 'Network offline'); });

            // Terminal & Termux
            this.capabilities.termux = !!(window.cordova && cordova.plugins && cordova.plugins.termux);
            this.capabilities.terminal = !!(window.acode && (window.acode.terminal || window.terminal)) || this.capabilities.termux;
            
            // Git (depends on terminal for now)
            this.capabilities.git = this.capabilities.terminal;

            // Clipboard
            this.capabilities.clipboard = !!(window.cordova && cordova.plugins && cordova.plugins.clipboard);
            
            // Docker (Always false unless we add a specific check later)
            this.capabilities.docker = false;

        } catch (e) {
            this.log('warn', 'Capability detection error', e.message);
        }
    }

    log(level, message, details = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            details,
            id: Math.random().toString(36).substr(2, 9)
        };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        
        const logMsg = `[IntentRouter][${level.toUpperCase()}] ${message}`;
        if (level === 'error') console.error(logMsg, details || '');
        else if (level === 'warn') console.warn(logMsg, details || '');
        else console.log(logMsg, details || '');
    }

    registerProvider(name, provider) {
        if (typeof provider.canHandle !== 'function' || typeof provider.execute !== 'function') {
            this.log('error', `Provider '${name}' rejected: Missing methods.`);
            return;
        }
        this.providers.set(name, provider);
        this.log('info', `Provider registered: ${name}`);
    }

    async execute(intent) {
        const traceId = intent?.meta?.traceId || Math.random().toString(36).substring(7);
        this.log('info', `Executing intent: ${intent?.intent}`, { traceId, intent });

        try {
            if (!intent || typeof intent.intent !== 'string') {
                return this.createErrorResponse('INVALID_INTENT', 'Intent is missing or malformed', traceId);
            }

            let targetProvider = null;
            let providerName = intent.provider;

            if (providerName) {
                targetProvider = this.providers.get(providerName);
            } else {
                for (const [name, provider] of this.providers) {
                    if (await provider.canHandle(intent)) {
                        targetProvider = provider;
                        providerName = name;
                        break;
                    }
                }
            }

            if (!targetProvider) {
                return this.createErrorResponse('PROVIDER_NOT_FOUND', `No provider found for: ${intent.intent}`, traceId);
            }

            if (targetProvider.requiredCapability && !this.capabilities[targetProvider.requiredCapability]) {
                return this.createErrorResponse('CAPABILITY_MISSING', `Capability '${targetProvider.requiredCapability}' missing for ${providerName}`, traceId);
            }

            const timeoutMs = intent.timeout || 30000;
            const context = { traceId, capabilities: this.capabilities, router: this };

            const result = await Promise.race([
                targetProvider.execute(intent, context),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
            ]);

            return this.normalizeResponse(result, providerName, traceId);

        } catch (error) {
            let code = 'EXECUTION_FAILED';
            if (error.message === 'TIMEOUT') code = 'TIMEOUT';
            this.log('error', `Execution error`, { code, message: error.message, intent: intent?.intent });
            return this.createErrorResponse(code, error.message, traceId, error);
        }
    }

    normalizeResponse(result, providerName, traceId) {
        const normalized = {
            success: !!result?.success,
            data: result?.data ?? null,
            error: result?.error ?? null,
            metadata: {
                provider: providerName,
                traceId,
                timestamp: new Date().toISOString(),
                ...(result?.metadata || {})
            }
        };

        if (!normalized.success && !normalized.error) {
            normalized.error = { code: 'UNKNOWN_ERROR', message: 'Provider failed silently' };
        }

        if (!normalized.success) {
            this.log('warn', `Intent failed (${providerName})`, normalized.error);
        }

        return normalized;
    }

    createErrorResponse(code, message, traceId, details = null) {
        const response = {
            success: false,
            data: null,
            error: { code, message, details: details?.stack || details },
            metadata: { traceId, timestamp: new Date().toISOString() }
        };
        window.toast(`Intent Router: ${message}`, 5000);
        return response;
    }

    registerDefaultProviders() {
        this.registerProvider('system', new SystemProvider());
        this.registerProvider('http', new HttpProvider());
        this.registerProvider('terminal', new TerminalProvider());
        this.registerProvider('git', new GitProvider());
        this.registerProvider('ai', new AIProvider());
        this.registerProvider('vscode', new VSCodeProvider());
        this.registerProvider('docker', new DockerProvider());
    }
}
