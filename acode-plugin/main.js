/**
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
