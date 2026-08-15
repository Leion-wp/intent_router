/**
 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 */

const PLUGIN_ID = 'com.leionwp.intentrouter';

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
        return intent.provider === this.name || intent.intent.startsWith(`${this.name}:`);
    }

    async execute(intent, context) {
        throw new Error(`Execute not implemented for ${this.name}`);
    }

    normalizeResponse(success, data = null, error = null, metadata = {}) {
        return {
            success,
            data,
            error: error ? (error.message || error) : null,
            metadata: {
                ...metadata,
                provider: this.name,
                timestamp: Date.now()
            }
        };
    }
}


class AIProvider extends BaseProvider {
    async canHandle(intent) {
        return intent.scheme === 'ai';
    }
    async execute(intent, context) {
        const { action, data } = intent;
        try {
            switch (action) {
                case 'prompt':
                    // Simulation d'appel AI (à connecter à un service réel plus tard)
                    console.log('AI Prompt:', data.prompt);
                    return this.normalizeResponse(true, { 
                        response: `Simulated AI response for: ${data.prompt}`,
                        model: data.model || 'default'
                    });
                default:
                    return this.normalizeResponse(false, null, `Action ${action} not supported by AIProvider`);
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

class TerminalProvider extends BaseProvider {
    async canHandle(intent) {
        return intent.scheme === 'terminal' && this.router.capabilities.terminal;
    }
    async execute(intent, context) {
        const { action, data } = intent;
        if (!this.router.capabilities.terminal) {
            return this.normalizeResponse(false, null, 'Terminal capability not available');
        }
        
        try {
            switch (action) {
                case 'exec':
                    const result = await window.terminal.run(data.command);
                    return this.normalizeResponse(true, { output: result });
                default:
                    return this.normalizeResponse(false, null, `Action ${action} not supported by TerminalProvider`);
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

class DockerProvider extends BaseProvider {
    async canHandle(intent) {
        return intent.scheme === 'docker';
    }
    async execute(intent, context) {
        return this.normalizeResponse(false, null, 'Docker is not supported on Android environment yet');
    }
}


class IntentRouter {
    constructor() {
        this.providers = [];
        this.capabilities = {
            terminal: typeof window.terminal !== 'undefined',
            git: false,
            android: true,
            docker: false
        };
        this.logs = [];
    }

    registerProvider(provider) {
        this.providers.push(provider);
    }

    async checkCapabilities() {
        if (this.capabilities.terminal) {
            try {
                const gitCheck = await window.terminal.run('git --version');
                this.capabilities.git = gitCheck.includes('git version');
            } catch (e) {
                this.capabilities.git = false;
            }
        }
    }

    async execute(intent, context = {}) {
        this.logs.push({ t: Date.now(), intent });
        
        try {
            for (const provider of this.providers) {
                if (await provider.canHandle(intent)) {
                    return await provider.execute(intent, { ...context, config: this.config });
                }
            }
            return {
                success: false,
                error: `No provider found for scheme: ${intent.scheme}`,
                metadata: { timestamp: Date.now() }
            };
        } catch (e) {
            console.error('[IntentRouter] Execution error:', e);
            return {
                success: false,
                error: e.message,
                metadata: { timestamp: Date.now() }
            };
        }
    }
}

const router = new IntentRouter();
router.registerProvider(new SystemProvider(router));
router.registerProvider(new GitHubProvider(router));
router.registerProvider(new AIProvider(router));
router.registerProvider(new TerminalProvider(router));
router.registerProvider(new DockerProvider(router));

async function runTests() {
    console.log('--- Intent Router Test Suite ---');
    
    const tests = [
        { scheme: 'system', action: 'toast', data: { message: 'Test Toast' } },
        { scheme: 'github', action: 'get_repo', data: { owner: 'Leion-wp', repo: 'intent_router' } },
        { scheme: 'ai', action: 'prompt', data: { prompt: 'Hello AI' } },
        { scheme: 'docker', action: 'ps', data: {} }
    ];

    for (const test of tests) {
        console.log(`Testing ${test.scheme}:${test.action}...`);
        const res = await router.execute(test);
        console.log('Result:', res);
    }
    
    window.toast('Tests completed. Check console.', 3000);
}

window.intentRouter = router;
window.runIntentTests = runTests;

acode.setPluginInit('com.leion.intent_router', async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    await router.checkCapabilities();
    console.log('Intent Router Initialized with capabilities:', router.capabilities);
    window.toast('Intent Router Ready', 2000);
});

acode.setPluginUnmount('com.leion.intent_router', () => {
    delete window.intentRouter;
    delete window.runIntentTests;
});


// --- Terminal Provider ---
class TerminalProvider extends BaseProvider {
    constructor() {
        super(IntentScheme.TERMINAL);
    }

    async execute(intent, context) {
        try {
            const { command, args = [], cwd } = intent.params;
            
            if (!context.capabilities.terminal) {
                return this.normalizeResponse(false, null, 'Terminal capability not available');
            }

            // Check for Acode Terminal plugin
            if (window.terminal) {
                const fullCommand = `${command} ${args.join(' ')}`;
                window.terminal.run(fullCommand); // Assuming Acode terminal API
                return this.normalizeResponse(true, { message: 'Command sent to terminal' });
            }

            return this.normalizeResponse(false, null, 'No terminal plugin found');
        } catch (error) {
            return this.normalizeResponse(false, null, error);
        }
    }
}

// --- Docker Provider (Experimental/Stub) ---
class DockerProvider extends BaseProvider {
    constructor() {
        super(IntentScheme.DOCKER);
    }

    async execute(intent, context) {
        return this.normalizeResponse(false, null, 'Docker is not supported on this platform yet.');
    }
}

// --- Main Router ---
class IntentRouter {
    constructor() {
        this.providers = new Map();
        this.logs = [];
        this.capabilities = {
            terminal: !!window.terminal,
            git: false, // Will be checked
            android: true
        };
    }

    registerProvider(provider) {
        this.providers.set(provider.name, provider);
        console.log(`[IntentRouter] Registered provider: ${provider.name}`);
    }

    async init() {
        this.registerProvider(new SystemProvider());
        this.registerProvider(new AIProvider());
        this.registerProvider(new GitHubProvider());
        this.registerProvider(new TerminalProvider());
        this.registerProvider(new DockerProvider());
        
        await this.checkCapabilities();
    }

    async checkCapabilities() {
        // Check for Git
        if (this.capabilities.terminal && window.terminal) {
            // Logic to check git version via terminal if possible
            // For now, we assume false until verified
        }
    }

    async execute(intent) {
        const startTime = Date.now();
        try {
            const providerName = intent.provider || intent.intent.split(':')[0];
            const provider = this.providers.get(providerName);

            if (!provider) {
                throw new Error(`Provider not found: ${providerName}`);
            }

            const response = await provider.execute(intent, { capabilities: this.capabilities });
            
            this.logs.push({
                intent,
                response,
                duration: Date.now() - startTime
            });

            return response;
        } catch (error) {
            const errorResponse = {
                success: false,
                error: error.message,
                metadata: { timestamp: Date.now(), provider: 'router' }
            };
            this.logs.push({ intent, response: errorResponse, duration: Date.now() - startTime });
            return errorResponse;
        }
    }
}


// --- Acode Plugin Entry Point ---
class AcodeIntentRouter {
    async init() {
        this.router = new IntentRouter();
        await this.router.init();

        // Expose to global window for other plugins to use
        window.intentRouter = this.router;

        window.toast('Intent Router Initialized', 2000);
        console.log('Intent Router Plugin Loaded');
    }

    async destroy() {
        delete window.intentRouter;
    }
}

if (window.acode) {
    const plugin = new AcodeIntentRouter();
    acode.setPluginInit(PLUGIN_ID, (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
        plugin.init();
    });
    acode.setPluginUnmount(PLUGIN_ID, () => {
        plugin.destroy();
    });
}
