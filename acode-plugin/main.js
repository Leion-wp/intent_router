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
