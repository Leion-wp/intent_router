/**
 * Intent Router for Acode
 * Orchestration layer for mobile automation.
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
            system: true,
            http: true,
            ai: true
        };
        this.logger = console;
    }

    async init() {
        this.detectCapabilities();
        this.registerDefaultProviders();
        this.logger.log("Intent Router initialized");
    }

    detectCapabilities() {
        // Basic detection for Acode environment
        this.capabilities.terminal = typeof acode !== 'undefined' && !!acode.exec;
        this.capabilities.termux = typeof window.termux !== 'undefined';
        
        // Check for git/github via terminal or specific plugins
        if (this.capabilities.terminal) {
            this.capabilities.git = true; // Assume git if terminal is there for now
            this.capabilities.github = true;
        }

        this.logger.log("Capabilities detected:", this.capabilities);
    }

    registerProvider(name, provider) {
        if (!provider.canHandle || !provider.execute) {
            throw new Error(`Provider ${name} does not follow the contract.`);
        }
        this.providers.set(name, provider);
    }

    async execute(intent, context = {}) {
        const startTime = Date.now();
        const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);

        this.logger.log(`[${traceId}] Executing intent: ${intent.intent}`);

        try {
            // 1. Resolution
            const provider = this.resolveProvider(intent);
            if (!provider) {
                return this.errorResponse("PROVIDER_NOT_FOUND", `No provider found for intent: ${intent.intent}`, traceId);
            }

            // 2. Execution
            const result = await provider.execute(intent, { ...context, traceId, capabilities: this.capabilities });

            // 3. Normalization & Validation
            return this.normalizeResponse(result, traceId, startTime);

        } catch (error) {
            this.logger.error(`[${traceId}] Critical execution error:`, error);
            return this.errorResponse("EXECUTION_FAILED", error.message, traceId);
        }
    }

    resolveProvider(intent) {
        for (const [name, provider] of this.providers) {
            if (provider.canHandle(intent)) {
                return provider;
            }
        }
        return null;
    }

    normalizeResponse(result, traceId, startTime) {
        const duration = Date.now() - startTime;
        return {
            success: result.success ?? false,
            data: result.data ?? null,
            error: result.error ?? null,
            metadata: {
                ...result.metadata,
                traceId,
                duration,
                timestamp: new Date().toISOString()
            }
        };
    }

    errorResponse(code, message, traceId) {
        window.toast(`Intent Error: ${message}`, 4000);
        return {
            success: false,
            data: null,
            error: { code, message },
            metadata: { traceId, timestamp: new Date().toISOString() }
        };
    }

    registerDefaultProviders() {
        this.registerProvider('system', new SystemProvider());
        this.registerProvider('http', new HttpProvider());
        this.registerProvider('terminal', new TerminalProvider());
        // More to be added
    }
}
