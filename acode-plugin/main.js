
class IntentRouter {
    constructor() {
        this.capabilities = [];
        this.compositeCapabilities = [];
        this.providers = new Map();
        this.variableCache = new Map();
        this.outputChannel = null;
    }

    async init($page, cacheFile, cacheFileUrl) {
        this.$page = $page;
        this.setupCommands();
        this.setupSidebar();
        this.registerDefaultProviders();
        
        window.toast('Intent Router Initialized', 3000);
    }

    setupCommands() {
        acode.addCommand({
            name: 'intent-router:route',
            description: 'Route Intent',
            exec: this.promptRouteIntent.bind(this),
        });

        acode.addCommand({
            name: 'intent-router:register-capability',
            description: 'Register Capability',
            exec: this.promptRegisterCapability.bind(this),
        });
    }

    setupSidebar() {
        // Implement sidebar logic here
    }

    registerDefaultProviders() {
        this.registerProvider('system', {
            invoke: async (entry, payload, intent) => {
                switch (entry.capability) {
                    case 'system.pause':
                        return await acode.confirm(payload.message || 'Pipeline paused for review.');
                    case 'system.setVar':
                        if (payload.name) {
                            this.variableCache.set(payload.name, payload.value);
                        }
                        return true;
                    case 'system.setCwd':
                        // Acode doesn't have a global CWD in the same way, but we can store it
                        this.variableCache.set('cwd', payload.path);
                        return true;
                    case 'system.alert':
                        window.alert(payload.message || 'Alert');
                        return true;
                    case 'system.toast':
                        window.toast(payload.message || 'Toast', payload.duration || 3000);
                        return true;
                    default:
                        console.log('System Provider Invoked', { entry, payload, intent });
                        return true;
                }
            }
        });

        this.registerProvider('ai', {
            invoke: async (entry, payload, intent) => {
                // For now, let's mock AI or use a prompt if no real AI adapter is available
                const result = await acode.prompt(`AI Instruction: ${payload.instruction}`, 'Simulated AI Response');
                if (payload.outputVar) {
                    this.variableCache.set(payload.outputVar, result);
                }
                return result;
            }
        });
        this.registerProvider('git', {
            invoke: async (entry, payload, intent) => {
                console.log('Git Provider Invoked', { entry, payload, intent });
                return true;
            }
        });

        this.registerProvider('terminal', {
            invoke: async (entry, payload, intent) => {
                const command = payload.command || payload.script;
                if (!command) return false;
                console.log('Terminal Provider Executing:', command);
                // Acode doesn't have a direct terminal API for plugins easily, but we can log it
                return true;
            }
        });
    }
    }
    async routeIntent(intent, variableCache = new Map()) {
        const normalized = this.normalizeIntent(intent);
        
        if (intent.steps && intent.steps.length > 0) {
            let lastResult = true;
            for (const childStep of intent.steps) {
                const childIntent = {
                    ...childStep,
                    meta: {
                        ...(normalized.meta || {}),
                        ...(childStep.meta || {})
                    }
                };
                lastResult = await this.routeIntent(childIntent, variableCache);
                if (!lastResult && lastResult !== "") return false;
            }
            return lastResult;
        }

        const resolved = this.resolveCapabilities(normalized);
        if (resolved.length === 0) {
            window.alert(`No capabilities resolved for intent: ${normalized.intent}`);
            return false;
        }

        // Simplified filtering for Acode
        const filtered = resolved; 

        let finalResult = true;
        for (const entry of filtered) {
            const result = await this.executeResolution(normalized, entry, variableCache);
            if (result === false) return false;
            finalResult = result;
        }

        return finalResult;
    }

    normalizeIntent(intent) {
        if (typeof intent === 'string') {
            return { intent };
        }
        return intent;
    }

    resolveCapabilities(intent) {
        // Simple registry lookup
        return this.capabilities.filter(c => c.capability === intent.intent).map(c => ({
            ...c,
            source: 'registry',
            capabilityType: 'atomic'
        }));
    }

    async executeResolution(intent, entry, variableCache) {
        const provider = this.providers.get(entry.provider || 'system');
        if (!provider) {
            console.error(`Provider not found: ${entry.provider}`);
            return false;
        }

        const payload = this.mapPayload(intent, entry);
        try {
            return await provider.invoke(entry, payload, intent);
        } catch (error) {
            console.error('Execution failed', error);
            return false;
        }
    }

    mapPayload(intent, entry) {
        if (entry.mapPayload) return entry.mapPayload(intent);
        return intent.payload;
    }

    async promptRouteIntent() {
        const intentStr = await acode.prompt('Enter Intent (JSON or string)', '');
        if (!intentStr) return;

        try {
            const intent = intentStr.startsWith('{') ? JSON.parse(intentStr) : intentStr;
            await this.routeIntent(this.normalizeIntent(intent));
        } catch (e) {
            window.alert('Invalid Intent Format');
        }
    }

    async promptRegisterCapability() {
        // Implementation for registering from UI
    }

    async destroy() {
        // Cleanup
    }
}

if (window.acode) {
    const intentRouter = new IntentRouter();
    acode.setPluginInit(intentRouter.init.bind(intentRouter), intentRouter.destroy.bind(intentRouter));
}
