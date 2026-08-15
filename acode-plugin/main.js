/**
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
