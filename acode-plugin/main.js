/**
 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 */

class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: true, // Web-based always possible
            docker: false,
            termux: false,
            system: true,
            http: true,
            ai: true
        };
        this.logs = [];
    }

    async init() {
        await this.detectCapabilities();
        this.registerDefaultProviders();
        this.log('info', 'Intent Router initialized', { capabilities: this.capabilities });
    }

    async detectCapabilities() {
        // Detect Termux/Terminal
        try {
            this.capabilities.termux = !!(window.cordova && cordova.plugins && cordova.plugins.termux);
            this.capabilities.terminal = !!(window.acode && window.acode.terminal) || this.capabilities.termux;
            this.capabilities.git = this.capabilities.terminal; // Git usually depends on terminal
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
        if (this.logs.length > 200) this.logs.shift();
        
        if (level === 'error') {
            console.error(`[IntentRouter] ${message}`, details);
        } else {
            console.log(`[IntentRouter] ${message}`, details || '');
        }
    }

    registerProvider(name, provider) {
        if (typeof provider.canHandle !== 'function' || typeof provider.execute !== 'function') {
            this.log('error', `Provider ${name} failed contract validation.`);
            return;
        }
        this.providers.set(name, provider);
        this.log('info', `Provider registered: ${name}`);
    }

    async execute(intent) {
        const traceId = Math.random().toString(36).substring(7);
        this.log('info', `Executing intent: ${intent.intent}`, { traceId, intent });

        try {
            // 1. Validation
            if (!intent || !intent.intent) {
                return this.createErrorResponse('INVALID_INTENT', 'Intent is missing or malformed', traceId);
            }

            // 2. Provider Resolution
            let targetProvider = null;
            let providerName = null;

            for (const [name, provider] of this.providers) {
                if (await provider.canHandle(intent)) {
                    targetProvider = provider;
                    providerName = name;
                    break;
                }
            }

            if (!targetProvider) {
                return this.createErrorResponse('PROVIDER_NOT_FOUND', `No provider found for: ${intent.intent}`, traceId);
            }

            // 3. Capability Check
            if (targetProvider.requiredCapability && !this.capabilities[targetProvider.requiredCapability]) {
                return this.createErrorResponse('CAPABILITY_MISSING', `Capability '${targetProvider.requiredCapability}' required by ${providerName} is unavailable.`, traceId);
            }

            // 4. Execution with Timeout
            const timeout = intent.timeout || 30000;
            const context = {
                traceId,
                capabilities: this.capabilities,
                router: this
            };

            const result = await Promise.race([
                targetProvider.execute(intent, context),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeout))
            ]);

            // 5. Normalization
            return this.normalizeResponse(result, providerName, traceId);

        } catch (error) {
            const code = error.message === 'TIMEOUT' ? 'TIMEOUT' : 'EXECUTION_FAILED';
            this.log('error', `Execution failed: ${error.message}`, { traceId, error });
            return this.createErrorResponse(code, error.message, traceId);
        }
    }

    normalizeResponse(result, providerName, traceId) {
        const response = {
            success: result.success ?? true,
            data: result.data ?? null,
            error: result.error ? (typeof result.error === 'string' ? { message: result.error } : result.error) : null,
            metadata: {
                provider: providerName,
                traceId,
                timestamp: new Date().toISOString(),
                ...result.metadata
            }
        };

        if (!response.success && !response.error) {
            response.error = { message: 'Unknown error during provider execution', code: 'UNKNOWN_PROVIDER_ERROR' };
        }

        if (response.error) {
            window.toast(`Intent Error: ${response.error.message}`, 4000);
        }

        return response;
    }

    createErrorResponse(code, message, traceId) {
        window.toast(`Intent Error: ${message}`, 4000);
        return {
            success: false,

// --- Provider Implementations ---

class SystemProvider {
    constructor() {
        this.requiredCapability = 'system';
    }

    async canHandle(intent) {
        return intent.intent.startsWith('system://') || intent.intent.startsWith('acode://');
    }

    async execute(intent, context) {
        const action = intent.intent.split('://')[1];
        const { payload } = intent;

        switch (action) {
            case 'open-url':
                window.open(payload.url, '_system');
                return { success: true, data: { opened: true } };
            case 'toast':
                window.toast(payload.message, 3000);
                return { success: true };
            case 'copy':
                if (window.cordova && cordova.plugins.clipboard) {
                    await new Promise((res, rej) => cordova.plugins.clipboard.copy(payload.text, res, rej));
                    return { success: true };
                }
                throw new Error('Clipboard API not available');
            default:
                throw new Error(`Unsupported system action: ${action}`);
        }
    }
}

class HttpProvider {
    constructor() {
        this.requiredCapability = 'http';
    }

    async canHandle(intent) {
        return intent.intent.startsWith('http://') || intent.intent.startsWith('https://');
    }

    async execute(intent, context) {
        const response = await fetch(intent.intent, {
            method: intent.payload?.method || 'GET',
            headers: intent.payload?.headers || {},
            body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
        });
        
        const contentType = response.headers.get('content-type');
        const data = contentType && contentType.includes('application/json') 
            ? await response.json() 
            : await response.text();

        return {
            success: response.ok,
            data,
            metadata: { status: response.status, statusText: response.statusText }
        };
    }
}

class TerminalProvider {
    constructor() {
        this.requiredCapability = 'terminal';
    }

    async canHandle(intent) {
        return intent.intent.startsWith('terminal://') || intent.intent.startsWith('shell://');
    }

    async execute(intent, context) {
        const { command } = intent.payload;
        if (!command) throw new Error('Command is required for terminal intent');

        if (window.acode && window.acode.terminal) {
            const result = await window.acode.terminal.run(command);
            return { success: true, data: result };
        } else if (context.capabilities.termux) {
            // Placeholder for Termux-specific execution via cordova-plugin-termux
            return { success: false, error: 'Termux execution not yet fully implemented' };
        }
        
        throw new Error('No terminal environment found');
    }
}

class AIProvider {
    constructor() {
        this.requiredCapability = 'ai';
    }

    async canHandle(intent) {
        return intent.intent.startsWith('ai://');
    }

    async execute(intent, context) {
        // AI implementation logic (mocked for now)
        return { success: true, data: { response: "AI Processed: " + (intent.payload?.prompt || "") } };
    }
}

class GitProvider {
    constructor() {
        this.requiredCapability = 'git';
    }

    async canHandle(intent) {
        return intent.intent.startsWith('git://') || intent.intent.startsWith('github://');
    }

    async execute(intent, context) {
        // Git logic usually delegates to terminal or a git plugin
        return { success: true, data: { message: "Git intent received" } };
    }
}

// --- Plugin Entry ---

if (window.acode) {
    const router = new IntentRouter();
    
    acode.setPluginInit('com.hallofcodes.intentrouter', async (data) => {
        await router.init();
        window.intentRouter = {
            execute: (intent) => router.execute(intent),
            getLogs: () => router.logs,
            getCapabilities: () => router.capabilities
        };
    });

    acode.setPluginUnmount('com.hallofcodes.intentrouter', () => {
        delete window.intentRouter;
    });
}

            error: { code, message },
            metadata: {
                traceId,
                timestamp: new Date().toISOString()
            }
        };
    }

    registerDefaultProviders() {
        this.registerProvider('system', new SystemProvider());
        this.registerProvider('http', new HttpProvider());
        this.registerProvider('ai', new AIProvider());
        this.registerProvider('terminal', new TerminalProvider());
        this.registerProvider('git', new GitProvider());
    }
}

            }

            // 4. Execution with Timeout
            const timeoutMs = intent.timeout || 30000;
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
            );

            const context = {
                traceId,
                capabilities: this.capabilities,
                router: this
            };

            const result = await Promise.race([
                targetProvider.execute(intent, context),
                timeoutPromise
            ]);

            // 5. Normalization
            return this.normalizeResponse(result, providerName, traceId);

        } catch (error) {
            const code = error.message === 'TIMEOUT' ? 'TIMEOUT' : 'EXECUTION_FAILED';
            this.log(`Execution failed: ${error.message}`, error, 'error');
            return this.createErrorResponse(code, error.message, error, traceId);
        }
    }

    normalizeResponse(result, providerName, traceId) {
        const response = {
            success: result.success ?? true,
            data: result.data ?? null,
            error: result.error ? (typeof result.error === 'string' ? { message: result.error } : result.error) : null,
            metadata: {
                provider: providerName,
                traceId,
                timestamp: new Date().toISOString(),
                ...result.metadata
            }
        };

        if (!response.success && !response.error) {
            response.error = { message: 'Unknown provider error', code: 'UNKNOWN_PROVIDER_ERROR' };
        }

        if (!response.success) {
            window.toast(`Intent Error: ${response.error.message}`, 4000);
        }

        return response;
    }

    createErrorResponse(code, message, details = null, traceId) {
        const response = {
            success: false,
            data: null,
            error: {
                code,
                message,
                details: details?.message || details
            },
            metadata: {
                traceId,
                timestamp: new Date().toISOString()
            }
        };
        window.toast(`Intent Error: ${message}`, 4000);
        return response;
    }

    registerDefaultProviders() {
        this.registerProvider('system', new SystemProvider());
        this.registerProvider('http', new HttpProvider());
        this.registerProvider('ai', new AIProvider());
        this.registerProvider('terminal', new TerminalProvider());
        this.registerProvider('git', new GitProvider());
        this.registerProvider('docker', new DockerProvider());
    }
}

// --- Providers ---

class BaseProvider {
    constructor(name, requiredCapability = null) {
        this.name = name;
        this.requiredCapability = requiredCapability;
    }
    async canHandle(intent) { return false; }
    async execute(intent, context) { throw new Error('Not implemented'); }
}

class SystemProvider extends BaseProvider {
    constructor() { super('system'); }
    async canHandle(intent) {
        return intent.intent.startsWith('system://') || intent.intent.startsWith('acode://');
    }
    async execute(intent, context) {
        const action = intent.intent.split('://')[1];
        const payload = intent.payload || {};
        
        switch (action) {
            case 'open-url':
                window.open(payload.url, '_blank');
                return { success: true };
            case 'toast':
                window.toast(payload.message, payload.duration || 3000);
                return { success: true };
            case 'copy':
                if (!payload.text) throw new Error('Missing text to copy');
                await cordova.plugins.clipboard.copy(payload.text);
                return { success: true };
            default:
                throw new Error(`Unsupported system action: ${action}`);
        }
    }
}

class HttpProvider extends BaseProvider {
    constructor() { super('http'); }
    async canHandle(intent) {
        return intent.intent.startsWith('http://') || intent.intent.startsWith('https://');
    }
    async execute(intent, context) {
        const response = await fetch(intent.intent, {
            method: intent.payload?.method || 'GET',
            headers: intent.payload?.headers || {},
            body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
        });
        const data = await response.json();
        return { success: response.ok, data, metadata: { status: response.status } };
    }
}

class AIProvider extends BaseProvider {
    constructor() { super('ai'); }
    async canHandle(intent) { return intent.intent.startsWith('ai://'); }
    async execute(intent, context) {
        // Mock AI implementation
        return { success: true, data: { response: "AI processing not fully implemented in Acode yet." } };
    }
}

class TerminalProvider extends BaseProvider {
    constructor() { super('terminal', 'terminal'); }
    async canHandle(intent) {
        return intent.intent.startsWith('terminal://') || intent.intent.startsWith('shell://');
    }
    async execute(intent, context) {
        const command = intent.payload?.command || intent.intent.split('://')[1];
        if (!command) throw new Error('No command provided');
        
        const result = await (window.acode.terminal || window.terminal).run(command);
        return { success: true, data: result };
    }
}

class GitProvider extends BaseProvider {
    constructor() { super('git', 'git'); }
    async canHandle(intent) {
        return intent.intent.startsWith('git://') || intent.intent.startsWith('github://');
    }
    async execute(intent, context) {
        // Implementation via terminal commands
        const command = intent.payload?.command || 'status';
        const result = await (window.acode.terminal || window.terminal).run(`git ${command}`);
        return { success: true, data: result };
    }
}

class DockerProvider extends BaseProvider {
    constructor() { super('docker'); } // requiredCapability is null because we handle it internally
    async canHandle(intent) { return intent.intent.startsWith('docker://'); }
    async execute(intent, context) {
        if (context.capabilities.docker) {
            // Local docker execution
            return { success: true, data: "Docker local execution (mock)" };
        } else if (intent.payload?.ssh) {
            // Remote docker execution via SSH
            return { success: true, data: "Docker remote execution via SSH (mock)" };
        } else {
            throw new Error("Docker is not available locally and no SSH config provided.");
        }
    }
}

// --- Entry Point ---

if (window.acode) {
    const router = new IntentRouter();
    acode.setPluginInit('com.hallofcodes.intentrouter', async () => {
        await router.init();
        window.intentRouter = {
            execute: (intent) => router.execute(intent),
            getLogs: () => router.logs,
            getCapabilities: () => router.capabilities
        };
        window.toast('Intent Router Ready', 2000);
    });
    acode.setPluginUnmount('com.hallofcodes.intentrouter', () => {
        delete window.intentRouter;
    });
}

 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 *
 * This plugin provides a unified interface for executing intents (actions) 
 * across different providers (System, Git, AI, Terminal, etc.) on Android.
 */

class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: true, // Generally available via API
            docker: false,
            termux: false,
            system: true,
            network: navigator.onLine
        };
        this.logs = [];
        this.maxLogs = 100;
    }

    async init() {
        this.log('info', 'Initializing Intent Router...');
        await this.detectCapabilities();
        this.registerDefaultProviders();
        this.log('info', 'Intent Router initialized', { capabilities: this.capabilities });
    }

    async detectCapabilities() {
        // 1. Network status
        window.addEventListener('online', () => {
            this.capabilities.network = true;
            this.log('info', 'Network is online');
        });
        window.addEventListener('offline', () => {
            this.capabilities.network = false;
            this.log('warn', 'Network is offline');
        });

        // 2. Terminal & Termux detection
        // In Acode, terminal is often provided by a plugin or internal API
        this.capabilities.terminal = !!(window.acode && (window.acode.terminal || window.terminal));
        
        // Check for Termux specifically if possible (e.g., via cordova-plugin-termux)
        this.capabilities.termux = !!(window.cordova && window.cordova.plugins && window.cordova.plugins.termux);

        // 3. Git detection
        // If terminal is available, we assume git might be available
        this.capabilities.git = this.capabilities.terminal || this.capabilities.termux;

        // 4. Docker detection
        // Usually false on Android, but could be true if a remote backend or specialized proot is used
        this.capabilities.docker = false; 
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
        const traceId = Math.random().toString(36).substring(7);
        this.log('info', `Executing intent: ${intent?.intent}`, { traceId, intent });

        try {
            // 1. Validation
            if (!intent || typeof intent.intent !== 'string') {
                return this.createErrorResponse('INVALID_INTENT', 'Intent is missing or not a string', traceId);
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
            const context = {
                traceId,
                capabilities: this.capabilities,
                router: this
            };

            const executionPromise = targetProvider.execute(intent, context);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
            );

            const result = await Promise.race([executionPromise, timeoutPromise]);

            // 5. Normalization & Validation of result
            return this.normalizeResponse(result, providerName, traceId);

        } catch (error) {
            let code = 'EXECUTION_FAILED';
            let message = error.message;

            if (message === 'TIMEOUT') {
                code = 'TIMEOUT';
                message = `Execution timed out after ${intent.timeout || 30000}ms`;
            }

            this.log('error', `Execution error for ${intent?.intent}`, { code, message, error });
            return this.createErrorResponse(code, message, traceId, error);
        }
    }

    normalizeResponse(result, providerName, traceId) {
        // Ensure the result follows the contract
        const normalized = {
            success: result && typeof result.success === 'boolean' ? result.success : false,
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
            normalized.error = { code: 'UNKNOWN_ERROR', message: 'Provider returned failure without error details' };
        }

        if (!normalized.success) {
            const errorMsg = normalized.error.message || normalized.error.code || 'Unknown error';
            window.toast(`Intent Error (${providerName}): ${errorMsg}`, 4000);
        }

        return normalized;
    }

    createErrorResponse(code, message, traceId, details = null) {
        const response = {
            success: false,
            data: null,
            error: {
                code,
                message,
                details: details?.stack || details
            },
            metadata: {
                traceId,
                timestamp: new Date().toISOString()
            }
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
        this.registerProvider('docker', new DockerProvider());
    }

    getLogs() {
        return this.logs;
    }

    getCapabilities() {
        return { ...this.capabilities };
    }
}

// --- Base Provider Class ---

class BaseProvider {
    constructor(name, requiredCapability = null) {
        this.name = name;
        this.requiredCapability = requiredCapability;
    }

    async canHandle(intent) {
        return false;
    }

    async execute(intent, context) {
        throw new Error("Method 'execute' must be implemented");
    }

    success(data = null, metadata = {}) {
        return { success: true, data, metadata };
    }

    fail(code, message, metadata = {}) {
        return { success: false, error: { code, message }, metadata };
    }
}

// --- Specific Providers ---

class SystemProvider extends BaseProvider {
    constructor() {
        super('system', 'system');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('system.') || intent.intent.startsWith('acode.');
    }

    async execute(intent, context) {
        const action = intent.intent.replace(/^(system|acode)\./, '');
        const payload = intent.payload || {};

        try {
            switch (action) {
                case 'toast':
                    window.toast(payload.message || 'No message', payload.duration || 3000);
                    return this.success();
                case 'openUrl':
                    if (!payload.url) return this.fail('MISSING_PARAM', 'URL is required');
                    window.open(payload.url, '_system');
                    return this.success();
                case 'copyToClipboard':
                    if (!payload.text) return this.fail('MISSING_PARAM', 'Text is required');
                    if (window.cordova && cordova.plugins && cordova.plugins.clipboard) {
                        await new Promise((res, rej) => cordova.plugins.clipboard.copy(payload.text, res, rej));
                        return this.success({ copied: true });
                    }
                    throw new Error('Clipboard API not available');
                case 'share':
                    if (!payload.text) return this.fail('MISSING_PARAM', 'Text is required');
                    if (navigator.share) {
                        await navigator.share({
                            title: payload.title || 'Share',
                            text: payload.text,
                            url: payload.url
                        });
                        return this.success({ shared: true });
                    }
                    throw new Error('Web Share API not supported');
                default:
                    return this.fail('UNKNOWN_ACTION', `System action '${action}' not supported`);
            }
        } catch (e) {
            return this.fail('SYSTEM_ERROR', e.message);
        }
    }
}

class HttpProvider extends BaseProvider {
    constructor() {
        super('http', 'network');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('http.') || intent.intent.startsWith('https.');
    }

    async execute(intent, context) {
        const url = intent.payload?.url || intent.intent.replace('http.', 'http://').replace('https.', 'https://');
        const options = {
            method: intent.payload?.method || 'GET',
            headers: intent.payload?.headers || {},
            body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
        };

        try {
            const response = await fetch(url, options);
            const data = await response.json().catch(() => null);
            
            if (!response.ok) {
                return this.fail('HTTP_ERROR', `Request failed with status ${response.status}`, { status: response.status, data });
            }
            
            return this.success(data, { status: response.status });
        } catch (e) {
            return this.fail('NETWORK_ERROR', e.message);
        }
    }
}

class AIProvider extends BaseProvider {
    constructor() {
        super('ai');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('ai.');
    }

    async execute(intent, context) {
        // Mock AI implementation for now
        return this.success({ response: "AI features are coming soon to Intent Router Acode!" });
    }
}

class TerminalProvider extends BaseProvider {
    constructor() {
        super('terminal', 'terminal');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('terminal.') || intent.intent.startsWith('shell.');
    }

    async execute(intent, context) {
        const command = intent.payload?.command;
        if (!command) return this.fail('MISSING_PARAM', 'Command is required');

        try {
            // Acode terminal integration
            const term = window.acode.terminal || window.terminal;
            const result = await term.run(command);
            return this.success(result);
        } catch (e) {
            return this.fail('TERMINAL_ERROR', e.message);
        }
    }
}

class GitProvider extends BaseProvider {
    constructor() {
        super('git', 'git');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('git.') || intent.intent.startsWith('github.');
    }

    async execute(intent, context) {
        // Implementation would use TerminalProvider or a specialized git plugin
        return this.fail('NOT_IMPLEMENTED', 'Git provider is being finalized');
    }
}

class DockerProvider extends BaseProvider {
    constructor() {
        super('docker', 'docker');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('docker.');
    }

    async execute(intent, context) {
        // Docker is experimental and usually requires a remote backend on Android
        return this.fail('EXPERIMENTAL', 'Docker support is experimental and capability not detected.');
    }
}

// --- Plugin Entry Point ---

if (window.acode) {
    const router = new IntentRouter();
    
    acode.setPluginInit('com.hallofcodes.intentrouter', async (data) => {
        await router.init();
        window.intentRouter = router;
        
        // Example test intent
        // router.execute({ intent: 'system.toast', payload: { message: 'Intent Router Active' } });
    });

    acode.setPluginUnmount('com.hallofcodes.intentrouter', () => {
        delete window.intentRouter;
    });
}

 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 * Version: 1.0.0
 */

class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: true, // Network dependent
            docker: false,
            termux: false,
            system: true,
            ai: true
        };
        this.logs = [];
    }

    async init() {
        await this.detectCapabilities();
        this.registerDefaultProviders();
        this.log('info', 'Intent Router Initialized', { capabilities: this.capabilities });
    }

    async detectCapabilities() {
        // 1. Terminal & Termux detection
        this.capabilities.terminal = !!(window.acode && window.acode.terminal);
        
        // Check for Termux via cordova if available
        if (typeof cordova !== 'undefined' && cordova.plugins && cordova.plugins.termux) {
            this.capabilities.termux = true;
        }

        // 2. Git detection
        // On Android, git is usually available if terminal/termux is available
        this.capabilities.git = this.capabilities.terminal || this.capabilities.termux;

        // 3. Docker detection (usually false on Android)
        this.capabilities.docker = false; 

        // 4. Network/GitHub (Basic check)
        this.capabilities.github = navigator.onLine;
    }

    log(level, message, details = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            details
        };
        this.logs.push(entry);
        if (this.logs.length > 200) this.logs.shift();
        
        const logMsg = `[IntentRouter][${level.toUpperCase()}] ${message}`;
        if (level === 'error') {
            console.error(logMsg, details);
        } else {
            console.log(logMsg, details);
        }
    }

    registerProvider(name, provider) {
        if (typeof provider.canHandle !== 'function' || typeof provider.execute !== 'function') {
            this.log('error', `Provider ${name} does not follow the contract.`);
            return;
        }
        this.providers.set(name, provider);
        this.log('info', `Provider registered: ${name}`);
    }

    async execute(intent) {
        const traceId = Math.random().toString(36).substring(7);
        this.log('info', `Executing intent: ${intent.intent}`, { traceId, intent });

        try {
            // 1. Validation
            if (!intent || !intent.intent) {
                return this.formatError("Invalid intent object", "INVALID_INTENT", traceId);
            }

            // 2. Provider Resolution
            let targetProvider = null;
            let providerName = null;

            for (const [name, provider] of this.providers) {
                if (await provider.canHandle(intent)) {
                    targetProvider = provider;
                    providerName = name;
                    break;
                }
            }

            if (!targetProvider) {
                return this.formatError(`No provider found for intent: ${intent.intent}`, "PROVIDER_NOT_FOUND", traceId);
            }

            // 3. Capability Check
            if (targetProvider.requiredCapability && !this.capabilities[targetProvider.requiredCapability]) {
                return this.formatError(`Capability '${targetProvider.requiredCapability}' is not available in this environment.`, "CAPABILITY_MISSING", traceId);
            }

            // 4. Execution with Timeout
            const timeoutMs = intent.timeout || 30000;
            const context = {
                traceId,
                capabilities: this.capabilities,
                router: this
            };

            const result = await Promise.race([
                targetProvider.execute(intent, context),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
            ]);

            // 5. Normalization & Validation of output
            return this.normalizeResult(result, traceId, providerName);

        } catch (error) {
            const code = error.message === 'TIMEOUT' ? 'TIMEOUT' : 'EXECUTION_FAILED';
            this.log('error', `Execution error: ${error.message}`, { traceId, error });
            
            const response = this.formatError(error.message, code, traceId);
            window.toast(`Intent Error: ${error.message}`, 4000);
            return response;
        }
    }

    normalizeResult(result, traceId, providerName) {
        if (!result || typeof result !== 'object') {
            return this.formatError("Provider returned an invalid response format", "INVALID_RESPONSE", traceId);
        }

        const normalized = {
            success: !!result.success,
            data: result.data || null,
            error: result.error || null,
            metadata: {
                traceId,
                provider: providerName,
                timestamp: new Date().toISOString(),
                ...(result.metadata || {})
            }
        };

        if (!normalized.success && !normalized.error) {
            normalized.error = { message: "Unknown error occurred during execution", code: "UNKNOWN_ERROR" };
        }

        return normalized;
    }

    formatError(message, code, traceId) {
        return {
            success: false,
            data: null,
            error: { message, code },
            metadata: { traceId, timestamp: new Date().toISOString() }
        };
    }

    registerDefaultProviders() {
        this.registerProvider('system', new SystemProvider());
        this.registerProvider('terminal', new TerminalProvider());
        this.registerProvider('http', new HttpProvider());
        this.registerProvider('ai', new AIProvider());
        this.registerProvider('git', new GitProvider());
    }
}

/**
 * Base class for all providers to ensure contract compliance.
 */
class BaseProvider {
    constructor(name, requiredCapability = null) {
        this.name = name;
        this.requiredCapability = requiredCapability;
    }

    async canHandle(intent) {
        throw new Error("Method 'canHandle' must be implemented");
    }

    async execute(intent, context) {
        throw new Error("Method 'execute' must be implemented");
    }

    success(data = null, metadata = {}) {
        return { success: true, data, metadata };
    }

    error(message, code = "PROVIDER_ERROR") {
        return { success: false, error: { message, code } };
    }
}

// --- Specific Provider Implementations ---

class SystemProvider extends BaseProvider {
    constructor() {
        super('system');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('system://') || intent.intent.startsWith('acode://');
    }

    async execute(intent, context) {
        try {
            const action = intent.intent.split('://')[1];
            const { payload } = intent;

            switch (action) {
                case 'open-url':
                    if (!payload.url) return this.error("URL missing", "MISSING_PARAM");
                    window.open(payload.url, '_blank');
                    return this.success({ opened: true });

                case 'toast':
                    window.toast(payload.message || "No message", 3000);
                    return this.success();

                case 'copy':
                    if (!payload.text) return this.error("Text missing", "MISSING_PARAM");
                    if (typeof cordova !== 'undefined' && cordova.plugins.clipboard) {
                        cordova.plugins.clipboard.copy(payload.text);
                    } else {
                        await navigator.clipboard.writeText(payload.text);
                    }
                    return this.success({ copied: true });

                default:
                    return this.error(`Unknown system action: ${action}`, "UNKNOWN_ACTION");
            }
        } catch (e) {
            return this.error(e.message, "SYSTEM_EXEC_ERROR");
        }
    }
}

class TerminalProvider extends BaseProvider {
    constructor() {
        super('terminal', 'terminal');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('terminal://') || intent.intent.startsWith('shell://');
    }

    async execute(intent, context) {
        try {
            const command = intent.payload?.command;
            if (!command) return this.error("Command missing", "MISSING_PARAM");

            // Acode terminal integration
            const result = await window.acode.terminal.run(command);
            return this.success(result);
        } catch (e) {
            return this.error(e.message, "TERMINAL_EXEC_ERROR");
        }
    }
}

class HttpProvider extends BaseProvider {
    constructor() {
        super('http');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('http://') || intent.intent.startsWith('https://');
    }

    async execute(intent, context) {
        try {
            const { intent: url, payload } = intent;
            const response = await fetch(url, {
                method: payload?.method || 'GET',
                headers: payload?.headers || {},
                body: payload?.body ? JSON.stringify(payload.body) : undefined
            });

            if (!response.ok) {
                return this.error(`HTTP Error: ${response.status}`, "HTTP_ERROR");
            }

            const data = await response.json();
            return this.success(data);
        } catch (e) {
            return this.error(e.message, "NETWORK_ERROR");
        }
    }
}

class AIProvider extends BaseProvider {
    constructor() {
        super('ai');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('ai://');
    }

    async execute(intent, context) {
        // Placeholder for AI logic (integration with Acode AI or external API)
        return this.success({ message: "AI process simulation complete" });
    }
}

class GitProvider extends BaseProvider {
    constructor() {
        super('git', 'git');
    }

    async canHandle(intent) {
        return intent.intent.startsWith('git://') || intent.intent.startsWith('github://');
    }

    async execute(intent, context) {
        // Logic for git commands via terminal/termux
        return this.success({ status: "Git command executed" });
    }
}

// --- Plugin Entry Point ---

let router;

if (window.acode) {
    acode.setPluginInit('com.hallofcodes.intentrouter', async (data) => {
        router = new IntentRouter();
        await router.init();
        
        // Expose API
        window.intentRouter = {
            execute: (intent) => router.execute(intent),
            getLogs: () => router.logs,
            getCapabilities: () => router.capabilities,
            registerProvider: (name, provider) => router.registerProvider(name, provider)
        };

        window.toast('Intent Router Ready', 2000);
    });

    acode.setPluginUnmount('com.hallofcodes.intentrouter', () => {
        delete window.intentRouter;
    });
}

 * Intent Router for Acode
 * Developed by Dave Conco & Hall Of Codes
 */

class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: true, // Always true if network is up
            http: true,
            system: true,
            ai: true,
            docker: false
        };
        this.logs = [];
    }

    async init() {
        await this.detectCapabilities();
        this.registerDefaultProviders();
        console.log("Intent Router: Initialized with capabilities", this.capabilities);
    }

    async detectCapabilities() {
        // Terminal detection
        try {
            this.capabilities.terminal = !!(window.acode && window.acode.terminal);
        } catch (e) {
            this.capabilities.terminal = false;
        }

        // Git detection (assuming git is available via terminal or internal plugin)
        // For now, we check if a git provider is registered or if we can run git --version
        this.capabilities.git = this.capabilities.terminal; 

        // Docker detection (usually false on Android unless specific proot/ssh)
        this.capabilities.docker = false; 
    }

    log(level, message, details = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            details
        };
        this.logs.push(entry);
        if (this.logs.length > 100) this.logs.shift();
        
        if (level === 'error') {
            console.error(`[IntentRouter] ${message}`, details);
        } else {
            console.log(`[IntentRouter] ${message}`, details);
        }
    }

    registerProvider(name, provider) {
        if (!provider.canHandle || !provider.execute) {
            this.log('error', `Provider ${name} does not follow the required contract.`);
            return;
        }
        this.providers.set(name, provider);
        this.log('info', `Provider registered: ${name}`);
    }

    async execute(intent) {
        const traceId = Math.random().toString(36).substring(7);
        this.log('info', `Executing intent: ${intent.intent}`, { traceId, intent });

        try {
            // 1. Validation
            if (!intent || !intent.intent) {
                return this.formatError("Invalid intent object", "INVALID_INTENT", traceId);
            }

            // 2. Provider Resolution
            let targetProvider = null;
            let providerName = null;

            for (const [name, provider] of this.providers) {
                if (provider.canHandle(intent)) {
                    targetProvider = provider;
                    providerName = name;
                    break;
                }
            }

            if (!targetProvider) {
                return this.formatError(`No provider found for intent: ${intent.intent}`, "PROVIDER_NOT_FOUND", traceId);
            }

            // 3. Execution
            const context = {
                traceId,
                capabilities: this.capabilities,
                router: this
            };

            const result = await targetProvider.execute(intent, context);

            // 4. Normalization
            return this.normalizeResult(result, traceId, providerName);

        } catch (error) {
            this.log('error', `Critical execution failure`, { error: error.message, stack: error.stack });
            return this.formatError(error.message, "CRITICAL_FAILURE", traceId);
        }
    }

    normalizeResult(result, traceId, providerName) {
        const normalized = {
            success: !!result.success,
            data: result.data || null,
            error: result.error || null,
            metadata: {
                traceId,
                provider: providerName,
                timestamp: new Date().toISOString(),
                ...(result.metadata || {})
            }
        };

        if (!normalized.success && !normalized.error) {
            normalized.error = { message: "Unknown error occurred during execution", code: "UNKNOWN_ERROR" };
        }

        return normalized;
    }

    formatError(message, code, traceId) {
        return {
            success: false,
            data: null,
            error: { message, code },
            metadata: { traceId, timestamp: new Date().toISOString() }
        };
    }

    registerDefaultProviders() {
        this.registerProvider('system', new SystemProvider());
        this.registerProvider('terminal', new TerminalProvider());
        this.registerProvider('http', new HttpProvider());
        this.registerProvider('ai', new AIProvider());
        this.registerProvider('git', new GitProvider());
    }
}

// --- Provider Implementations ---

class SystemProvider {
    canHandle(intent) {
        return intent.intent.startsWith('system://') || intent.intent.startsWith('acode://');
    }

    async execute(intent, context) {
        try {
            const action = intent.intent.split('://')[1];
            switch (action) {
                case 'open-url':
                    window.open(intent.payload.url, '_blank');
                    return { success: true };
                case 'toast':
                    window.toast(intent.payload.message, 3000);
                    return { success: true };
                case 'share':
                    if (navigator.share) {
                        await navigator.share(intent.payload);
                        return { success: true };
                    }
                    throw new Error("Share API not supported");
                default:
                    return { success: false, error: { message: `Unknown system action: ${action}`, code: "UNKNOWN_ACTION" } };
            }
        } catch (e) {
            return { success: false, error: { message: e.message, code: "SYSTEM_EXEC_ERROR" } };
        }
    }
}

class TerminalProvider {
    canHandle(intent) {
        return intent.intent.startsWith('terminal://') || intent.intent.startsWith('shell://');
    }

    async execute(intent, context) {
        if (!context.capabilities.terminal) {
            return { success: false, error: { message: "Terminal capability not available", code: "CAPABILITY_MISSING" } };
        }
        try {
            const command = intent.payload.command;
            const result = await window.acode.terminal.run(command);
            return { success: true, data: result };
        } catch (e) {
            return { success: false, error: { message: e.message, code: "TERMINAL_EXEC_ERROR" } };
        }
    }
}

class HttpProvider {
    canHandle(intent) {
        return intent.intent.startsWith('http://') || intent.intent.startsWith('https://');
    }

    async execute(intent, context) {
        try {
            const response = await fetch(intent.intent, {
                method: intent.payload?.method || 'GET',
                headers: intent.payload?.headers || {},
                body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
            });
            const data = await response.json();
            return { success: true, data };
        } catch (e) {
            return { success: false, error: { message: e.message, code: "HTTP_EXEC_ERROR" } };
        }
    }
}

class AIProvider {
    canHandle(intent) {
        return intent.intent.startsWith('ai://');
    }

    async execute(intent, context) {
        // Placeholder for AI logic
        return { success: true, data: { message: "AI Intent processed (Mock)" } };
    }
}

class GitProvider {
    canHandle(intent) {
        return intent.intent.startsWith('git://') || intent.intent.startsWith('github://');
    }

    async execute(intent, context) {
        if (!context.capabilities.git) {
            return { success: false, error: { message: "Git capability not available (Terminal required)", code: "CAPABILITY_MISSING" } };
        }
        // Logic for git commands via terminal
        return { success: true, data: { message: "Git command executed" } };
    }
}

// --- Plugin Entry Point ---

let router;

if (window.acode) {
    acode.setPluginInit('com.hallofcodes.intentrouter', async (data) => {
        router = new IntentRouter();
        await router.init();
        
        // Expose API
        window.intentRouter = {
            execute: (intent) => router.execute(intent),
            getLogs: () => router.logs,
            getCapabilities: () => router.capabilities
        };

        window.toast('Intent Router Ready', 2000);
    });

    acode.setPluginUnmount('com.hallofcodes.intentrouter', () => {
        delete window.intentRouter;
    });
}

class BaseProvider {
    constructor(name) {
        this.name = name;
        this.capabilities = new Map();
    }

    async canHandle(intent) {
        return this.capabilities.has(intent.intent);
    }

    async execute(intent, context) {
        try {
            const capability = this.capabilities.get(intent.intent);
            if (!capability) {
                throw new Error(`Capability ${intent.intent} not found in provider ${this.name}`);
            }
            const result = await this.handle(intent, context);
            return this.normalizeResponse(true, result);
        } catch (error) {
            return this.normalizeResponse(false, null, error.message);
        }
    }

    normalizeResponse(success, data = null, error = null, metadata = {}) {
        return {
            success,
            data,
            error,
            metadata: {
                ...metadata,
                provider: this.name,
                timestamp: Date.now()
            }
        };
    }

    async handle(intent, context) {
        throw new Error("Method 'handle' must be implemented");
    }
}

class SystemProvider extends BaseProvider {
    constructor() {
        super('system');
        this.capabilities.set('system.openUrl', { command: 'openUrl' });
        this.capabilities.set('system.share', { command: 'share' });
        this.capabilities.set('system.copyToClipboard', { command: 'copyToClipboard' });
    }

    async handle(intent, context) {
        const { intent: action, payload } = intent;
        switch (action) {
            case 'system.openUrl':
                if (!payload.url) throw new Error("URL is required");
                window.open(payload.url, '_system');
                return { opened: true };
            case 'system.share':
                if (!payload.text) throw new Error("Text is required");
                // Acode doesn't have a direct share API, but we can use web share if available
                if (navigator.share) {
                    await navigator.share({
                        title: payload.title || 'Share',
                        text: payload.text,
                        url: payload.url
                    });
                } else {
                    throw new Error("Web Share API not supported");
                }
                return { shared: true };
            case 'system.copyToClipboard':
                if (!payload.text) throw new Error("Text is required");
                await cordova.plugins.clipboard.copy(payload.text);
                return { copied: true };
            default:
                throw new Error(`Unsupported system action: ${action}`);
        }
    }
}

class AIProvider extends BaseProvider {
    constructor() {
        super('ai');
        this.capabilities.set('ai.prompt', { command: 'prompt' });
    }

    async handle(intent, context) {
        // Implementation for AI prompt
        // This would typically call an AI service
        return { message: "AI response simulation" };
    }
}

class GitProvider extends BaseProvider {
    constructor() {

class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.logs = [];
        this.capabilities = {
            terminal: false,
            git: false,
            github: true, // Assuming web-based interaction
            docker: false,
            termux: false,
            system: true
        };
    }

    async init() {
        this.registerProvider(new SystemProvider());
        this.registerProvider(new AIProvider());
        this.registerProvider(new GitProvider());
        this.registerProvider(new TerminalProvider());
        
        await this.detectCapabilities();
    }

    registerProvider(provider) {
        this.providers.set(provider.name, provider);
    }

    async detectCapabilities() {
        // Check for Termux
        try {
            // Simple check if we can reach termux-api or similar
            // For now, we'll use a placeholder logic
            this.capabilities.termux = typeof cordova !== 'undefined' && cordova.plugins && cordova.plugins.termux;
            this.capabilities.terminal = this.capabilities.termux;
            this.capabilities.git = this.capabilities.termux; // Often git is used via termux
        } catch (e) {
            this.log('Capability detection failed', e);
        }
    }

    log(message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            message,
            data
        };
        this.logs.push(entry);
        console.log(`[IntentRouter] ${message}`, data);
    }

    async execute(intent) {
        this.log('Executing intent', intent);
        
        try {
            // 1. Validation
            if (!intent || !intent.intent) {
                throw new Error("Invalid intent object");
            }

            // 2. Resolution
            let targetProvider = null;
            if (intent.provider) {
                targetProvider = this.providers.get(intent.provider);
            } else {
                // Find provider that can handle the intent
                for (const provider of this.providers.values()) {
                    if (await provider.canHandle(intent)) {
                        targetProvider = provider;
                        break;
                    }
                }
            }

            if (!targetProvider) {
                const error = `No provider found for intent: ${intent.intent}`;
                this.log(error);
                return { success: false, error, code: 'PROVIDER_NOT_FOUND' };
            }

            // 3. Execution
            const response = await targetProvider.execute(intent, { capabilities: this.capabilities });
            
            if (!response.success) {
                this.log(`Intent execution failed: ${response.error}`, response);
                window.toast(`Error: ${response.error}`, 4000);
            } else {
                this.log(`Intent execution success`, response.data);
            }

            return response;

        } catch (error) {
            const errorMsg = `Global error during execution: ${error.message}`;
            this.log(errorMsg, error);
            window.toast(errorMsg, 5000);
            return { success: false, error: errorMsg, code: 'INTERNAL_ERROR' };
        }
    }

    getLogs() {
        return this.logs;
    }
}

if (window.acode) {
    const intentRouter = new IntentRouter();
    
    acode.setPluginInit('com.hallofcodes.intentrouter', async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
        await intentRouter.init();
        window.intentRouter = intentRouter;
        window.toast('Intent Router Initialized', 2000);
    });

    acode.setPluginUnmount('com.hallofcodes.intentrouter', () => {
        delete window.intentRouter;
    });
}

        this.capabilities.set('git.status', { command: 'status' });
        this.capabilities.set('git.commit', { command: 'commit' });
    }

    async handle(intent, context) {
        // Implementation for Git
        return { message: "Git command execution simulation" };
    }
}

class TerminalProvider extends BaseProvider {
    constructor() {
        super('terminal');
        this.capabilities.set('terminal.exec', { command: 'exec' });
    }

    async handle(intent, context) {
        // Implementation for Terminal
        return { message: "Terminal command execution simulation" };
    }
}

 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 */

class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: false,
            docker: false,
            termux: false,
            system: true, // Always true on Android
            http: true    // Always true
        };
        this.logs = [];
    }

    async init() {
        await this.detectCapabilities();
        this.registerDefaultProviders();
        console.log('Intent Router: Initialized with capabilities', this.capabilities);
    }

    async detectCapabilities() {
        // 1. Check for Termux (via common paths or intent availability)
        // In Acode, we often check if certain plugins or commands are available
        try {
            // Check if 'git' is available in the environment
            // This is a placeholder for actual detection logic in Acode
            this.capabilities.git = true; 
            this.capabilities.terminal = true;
            this.capabilities.termux = true; // Assuming environment supports it
            this.capabilities.github = true;
            
            // Docker is false by default on Android unless specific backend is found
            this.capabilities.docker = false;
        } catch (e) {
            this.log('Capability detection failed', e);
        }
    }

    log(message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            message,
            data,
            id: Math.random().toString(36).substr(2, 9)
        };
        this.logs.push(entry);
        if (this.logs.length > 100) this.logs.shift();
        console.log(`[IntentRouter] ${message}`, data || '');
    }

    registerProvider(name, provider) {
        // Contract validation
        if (typeof provider.canHandle !== 'function' || typeof provider.execute !== 'function') {
            throw new Error(`Provider ${name} does not follow the contract.`);
        }
        this.providers.set(name, provider);
        this.log(`Provider registered: ${name}`);
    }

    async execute(intent) {
        this.log('Executing intent', intent);
        
        try {
            // 1. Validation
            if (!intent || !intent.intent) {
                return this.createErrorResponse('INVALID_INTENT', 'Intent is missing or malformed');
            }

            // 2. Find Provider
            let targetProvider = null;
            let providerName = '';

            for (const [name, provider] of this.providers) {
                if (await provider.canHandle(intent)) {
                    targetProvider = provider;
                    providerName = name;
                    break;
                }
            }

            if (!targetProvider) {
                return this.createErrorResponse('PROVIDER_NOT_FOUND', `No provider found for intent: ${intent.intent}`);
            }

            // 3. Check Capabilities
            if (targetProvider.requiredCapability && !this.capabilities[targetProvider.requiredCapability]) {
                return this.createErrorResponse('CAPABILITY_MISSING', `Capability '${targetProvider.requiredCapability}' is not available in this environment.`);
            }

            // 4. Execution with Timeout
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT')), intent.timeout || 30000)
            );

            const result = await Promise.race([
                targetProvider.execute(intent, { capabilities: this.capabilities, router: this }),
                timeoutPromise
            ]);

            // 5. Normalize Response
            return this.normalizeResponse(result, providerName);

        } catch (error) {
            this.log('Execution error', error);
            return this.createErrorResponse(
                error.message === 'TIMEOUT' ? 'TIMEOUT' : 'EXECUTION_FAILED',
                error.message,
                error
            );
        }
    }

    normalizeResponse(result, providerName) {
        return {
            success: result.success ?? true,
            data: result.data ?? null,
            error: result.error ?? null,
            metadata: {
                provider: providerName,
                timestamp: new Date().toISOString(),
                ...result.metadata
            }
        };
    }

    createErrorResponse(code, message, details = null) {
        const response = {
            success: false,
            data: null,
            error: {
                code,
                message,
                details: details?.message || details
            },
            metadata: {
                timestamp: new Date().toISOString()
            }
        };
        
        // User feedback for critical errors
        window.toast(`Intent Error: ${message}`, 4000);
        return response;
    }

    registerDefaultProviders() {
        // To be implemented in next step
    }
}

if (window.acode) {
    const intentRouter = new IntentRouter();
    
    acode.setPluginInit('com.hallofcodes.intentrouter', async (data) => {
        await intentRouter.init();
        window.intentRouter = intentRouter;
    });

    acode.setPluginUnmount('com.hallofcodes.intentrouter', () => {
        delete window.intentRouter;
    });
}
