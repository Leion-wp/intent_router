import './style.scss';

/**
 * @typedef {Object} IntentResult
 * @property {boolean} success
 * @property {any} [data]
 * @property {string} [error]
 * @property {Object} [metadata]
 */

class IntentRouter {
    constructor() {
        this.registry = [];
        this.compositeRegistry = [];
        this.providers = new Map();
        this.variableCache = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: true,
            docker: false,
            termux: false,
            ai: true,
            http: true,
            system: true
        };
        this.logs = [];
    }

    async init($page) {
        this.$page = $page;
        await this.detectCapabilities();
        this.setupCommands();
        this.registerDefaultProviders();
        this.log('Intent Router Initialized', 'INFO', this.capabilities);
    }

    async detectCapabilities() {
        // In Acode/Android environment, we check for common tools
        // This is a placeholder for actual bridge calls if available
        if (window.cordova) {
            // Check for Termux or internal terminal availability
            this.capabilities.termux = await this.checkCommand('termux-info');
            this.capabilities.git = await this.checkCommand('git --version');
            this.capabilities.terminal = this.capabilities.termux;
        }
    }

    async checkCommand(cmd) {
        // Simulated command check
        return false; 
    }

    setupCommands() {
        acode.addCommand({
            name: 'intent-router:route',
            description: 'Route Intent',
            exec: this.promptRouteIntent.bind(this),
        });

        acode.addCommand({
            name: 'intent-router:view-logs',
            description: 'View Logs',
            exec: this.showLogs.bind(this),
        });

        acode.addCommand({
            name: 'intent-router:test-suite',
            description: 'Run Test Suite',
            exec: this.runTestSuite.bind(this),
        });
    }

    registerDefaultProviders() {
        // SYSTEM PROVIDER
        this.registerProvider('system', {
            canHandle: (intent) => intent.intent.startsWith('system.'),
            invoke: async (entry, payload) => {
                const cmd = entry.command || entry.capability;
                try {
                    switch (cmd) {
                        case 'system.pause':
                            const ok = await acode.confirm(payload.message || 'Paused');
                            return { success: ok, data: ok };
                        case 'system.setVar':
                            if (payload.name) this.variableCache.set(payload.name, payload.value);
                            return { success: true };
                        case 'system.alert':
                            window.alert(payload.message || 'Alert');
                            return { success: true };
                        case 'system.toast':
                            window.toast(payload.message || 'Toast', payload.duration || 3000);
                            return { success: true };
                        default:
                            return { success: false, error: `Command not found: ${cmd}` };
                    }
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });

        // AI PROVIDER
        this.registerProvider('ai', {
            canHandle: (intent) => intent.intent.startsWith('ai://') || intent.provider === 'ai',
            invoke: async (entry, payload) => {
                try {
                    const res = await acode.prompt(`AI: ${payload.instruction}`, '');
                    if (res && payload.outputVar) this.variableCache.set(payload.outputVar, res);
                    return { success: !!res, data: res };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });

        // TERMINAL PROVIDER
        this.registerProvider('terminal', {
            canHandle: (intent) => intent.intent.startsWith('terminal://') || intent.provider === 'terminal',
            invoke: async (entry, payload) => {
                if (!this.capabilities.terminal) return { success: false, error: 'Terminal unavailable' };
                this.log(`Terminal Exec: ${payload.command || payload.script}`);
                return { success: true, data: 'Executed' };
            }
        });

        // HTTP PROVIDER
        this.registerProvider('http', {
            canHandle: (intent) => intent.intent.startsWith('http://') || intent.intent.startsWith('https://'),
            invoke: async (entry, payload, intent) => {
                try {
                    const response = await fetch(intent.intent, {
                        method: payload.method || 'GET',
                        body: payload.body ? JSON.stringify(payload.body) : null
                    });
                    const data = await response.json();
                    return { success: response.ok, data };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });
    }

    registerProvider(name, provider) {
        this.providers.set(name, provider);
    }

    async routeIntent(intent) {
        const normalized = this.normalizeIntent(intent);
        this.log(`Routing: ${normalized.intent}`, 'DEBUG');

        if (normalized.steps?.length > 0) {
            let lastResult = { success: true };
            for (const step of normalized.steps) {
                lastResult = await this.routeIntent(step);
                if (!lastResult.success && !normalized.continueOnError) return lastResult;
            }
            return lastResult;
        }

        const resolutions = this.resolveCapabilities(normalized);
        if (resolutions.length === 0) {
            const err = `No provider for: ${normalized.intent}`;
            this.log(err, 'ERROR');
            return { success: false, error: err };
        }

        let finalResult = { success: true };
        for (const res of resolutions) {
            finalResult = await this.executeResolution(normalized, res);
            if (!finalResult.success && !normalized.continueOnError) break;
        }
        return finalResult;
    }

    normalizeIntent(intent) {
        if (typeof intent === 'string') return { intent, capabilities: [intent] };
        if (!intent.capabilities && intent.intent) intent.capabilities = [intent.intent];
        return intent;
    }

    resolveCapabilities(intent) {
        const resolved = [];
        const caps = intent.capabilities || [intent.intent];

        for (const cap of caps) {
            // 1. Registry lookup
            const matches = this.registry.filter(r => r.capability === cap);
            matches.forEach(m => resolved.push({ ...m, type: 'atomic', source: 'registry' }));

            // 2. Composite lookup
            const comp = this.compositeRegistry.find(c => c.capability === cap);
            if (comp) resolved.push({ ...comp, type: 'composite', source: 'registry' });

            // 3. Fallback to providers canHandle
            if (resolved.length === 0) {
                for (const [name, p] of this.providers) {
                    if (p.canHandle && p.canHandle(intent)) {
                        resolved.push({ capability: cap, command: cap, provider: name, type: 'atomic', source: 'fallback' });
                        break;
                    }
                }
            }
        }
        return resolved;
    }

    async executeResolution(intent, res) {
        const providerName = res.provider || 'system';
        const provider = this.providers.get(providerName);
        if (!provider) return { success: false, error: `Provider ${providerName} missing` };

        const payload = this.preparePayload(intent, res);
        try {
            const result = await provider.invoke(res, payload, intent);
            const normalized = (result && typeof result === 'object' && 'success' in result) 
                ? result 
                : { success: !!result, data: result };
            
            if (!normalized.success) this.log(`Failed: ${normalized.error}`, 'ERROR');
            return normalized;
        } catch (e) {
            this.log(`Panic: ${e.message}`, 'ERROR');
            return { success: false, error: e.message };
        }
    }

    preparePayload(intent, res) {
        let p = res.mapPayload ? (typeof res.mapPayload === 'function' ? res.mapPayload(intent) : intent.payload) : (intent.payload || {});
        if (typeof p === 'object' && p !== null) {
            try {
                let s = JSON.stringify(p);
                s = s.replace(/\${(\w+)}/g, (_, name) => this.variableCache.get(name) || `\${${name}}`);
                return JSON.parse(s);
            } catch (e) { return p; }
        }
        return p;
    }

    log(message, level = 'INFO', data = null) {
        const entry = { timestamp: new Date().toISOString(), message, level, data };
        this.logs.push(entry);
        if (this.logs.length > 200) this.logs.shift();
        console.log(`[IntentRouter] [${level}] ${message}`, data || '');
    }

    async showLogs() {
        const html = this.logs.map(l => `<div style="margin-bottom:5px"><b>[${l.level}]</b> ${l.message}</div>`).join('');
        acode.alert('Intent Router Logs', `<div style="font-family:monospace; font-size:12px">${html}</div>`);
    }

    async runTestSuite() {
        const tests = [
            { name: 'System Toast', intent: { intent: 'system.toast', payload: { message: 'Test Success' } } },
            { name: 'Variable Sync', intent: { steps: [{ intent: 'system.setVar', payload: { name: 't', value: 'Hello' } }, { intent: 'system.toast', payload: { message: '${t} World' } }] } },
            { name: 'AI Prompt', intent: 'ai://test' },
            { name: 'HTTP Get', intent: 'https://jsonplaceholder.typicode.com/todos/1' }
        ];

        for (const t of tests) {
            this.log(`Running test: ${t.name}`);
            const res = await this.routeIntent(t.intent);
            if (!res.success) window.toast(`Test ${t.name} failed: ${res.error}`);
        }
        window.toast('Test suite finished. Check logs.');
    }

    async promptRouteIntent() {
        const str = await acode.prompt('Intent (JSON/URI)', '');
        if (!str) return;
        try {
            const intent = str.startsWith('{') ? JSON.parse(str) : str;
            const res = await this.routeIntent(intent);
            if (res.success) window.toast('Success');
            else acode.alert('Error', res.error);
        } catch (e) { acode.alert('Invalid Format', e.message); }
    }

    destroy() {}
}

if (window.acode) {
    const router = new IntentRouter();
    acode.setPluginInit(router.init.bind(router), router.destroy.bind(router));
}


/**
 * @typedef {Object} IntentResult
 * @property {boolean} success
 * @property {any} [data]
 * @property {string} [error]
 * @property {Object} [metadata]
 */

class IntentRouter {
    constructor() {
        this.registry = [];
        this.compositeRegistry = [];
        this.providers = new Map();
        this.variableCache = new Map();
        this.capabilities = {
            terminal: false,
            git: false,
            github: true,
            docker: false,
            termux: false,
            ai: true,
            http: true,
            system: true
        };
        this.logs = [];
    }

    async init($page) {
        this.$page = $page;
        await this.detectCapabilities();
        this.setupCommands();
        this.registerDefaultProviders();
        this.log('Intent Router Initialized', 'INFO', this.capabilities);
    }

    async detectCapabilities() {
        // In Acode/Android environment, we check for common tools
        // This is a placeholder for actual bridge calls if available
        if (window.cordova) {
            // Check for Termux or internal terminal availability
            this.capabilities.termux = await this.checkCommand('termux-info');
            this.capabilities.git = await this.checkCommand('git --version');
            this.capabilities.terminal = this.capabilities.termux;
        }
    }

    async checkCommand(cmd) {
        // Simulated command check
        return false; 
    }

    setupCommands() {
        acode.addCommand({
            name: 'intent-router:route',
            description: 'Route Intent',
            exec: this.promptRouteIntent.bind(this),
        });

        acode.addCommand({
            name: 'intent-router:view-logs',
            description: 'View Logs',
            exec: this.showLogs.bind(this),
        });

        acode.addCommand({
            name: 'intent-router:test-suite',
            description: 'Run Test Suite',
            exec: this.runTestSuite.bind(this),
        });
    }

    registerDefaultProviders() {
        // SYSTEM PROVIDER
        this.registerProvider('system', {
            canHandle: (intent) => intent.intent.startsWith('system.'),
            invoke: async (entry, payload) => {
                const cmd = entry.command || entry.capability;
                try {
                    switch (cmd) {
                        case 'system.pause':
                            const ok = await acode.confirm(payload.message || 'Paused');
                            return { success: ok, data: ok };
                        case 'system.setVar':
                            if (payload.name) this.variableCache.set(payload.name, payload.value);
                            return { success: true };
                        case 'system.alert':
                            window.alert(payload.message || 'Alert');
                            return { success: true };
                        case 'system.toast':
                            window.toast(payload.message || 'Toast', payload.duration || 3000);
                            return { success: true };
                        default:
                            return { success: false, error: `Command not found: ${cmd}` };
                    }
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });

        // AI PROVIDER
        this.registerProvider('ai', {
            canHandle: (intent) => intent.intent.startsWith('ai://') || intent.provider === 'ai',
            invoke: async (entry, payload) => {
                try {
                    const res = await acode.prompt(`AI: ${payload.instruction}`, '');
                    if (res && payload.outputVar) this.variableCache.set(payload.outputVar, res);
                    return { success: !!res, data: res };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });

        // TERMINAL PROVIDER
        this.registerProvider('terminal', {
            canHandle: (intent) => intent.intent.startsWith('terminal://') || intent.provider === 'terminal',
            invoke: async (entry, payload) => {
                if (!this.capabilities.terminal) return { success: false, error: 'Terminal unavailable' };
                this.log(`Terminal Exec: ${payload.command || payload.script}`);
                return { success: true, data: 'Executed' };
            }
        });

        // HTTP PROVIDER
        this.registerProvider('http', {
            canHandle: (intent) => intent.intent.startsWith('http://') || intent.intent.startsWith('https://'),
            invoke: async (entry, payload, intent) => {
                try {
                    const response = await fetch(intent.intent, {
                        method: payload.method || 'GET',
                        body: payload.body ? JSON.stringify(payload.body) : null
                    });
                    const data = await response.json();
                    return { success: response.ok, data };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });
    }

    registerProvider(name, provider) {
        this.providers.set(name, provider);
    }

    async routeIntent(intent) {
        const normalized = this.normalizeIntent(intent);
        this.log(`Routing: ${normalized.intent}`, 'DEBUG');

        if (normalized.steps?.length > 0) {
            let lastResult = { success: true };
            for (const step of normalized.steps) {
                lastResult = await this.routeIntent(step);
                if (!lastResult.success && !normalized.continueOnError) return lastResult;
            }
            return lastResult;
        }

        const resolutions = this.resolveCapabilities(normalized);
        if (resolutions.length === 0) {
            const err = `No provider for: ${normalized.intent}`;
            this.log(err, 'ERROR');
            return { success: false, error: err };
        }

        let finalResult = { success: true };
        for (const res of resolutions) {
            finalResult = await this.executeResolution(normalized, res);
            if (!finalResult.success && !normalized.continueOnError) break;
        }
        return finalResult;
    }

    normalizeIntent(intent) {
        if (typeof intent === 'string') return { intent, capabilities: [intent] };
        if (!intent.capabilities && intent.intent) intent.capabilities = [intent.intent];
        return intent;
    }

    resolveCapabilities(intent) {
        const resolved = [];
        const caps = intent.capabilities || [intent.intent];

        for (const cap of caps) {
            // 1. Registry lookup
            const matches = this.registry.filter(r => r.capability === cap);
            matches.forEach(m => resolved.push({ ...m, type: 'atomic', source: 'registry' }));

            // 2. Composite lookup
            const comp = this.compositeRegistry.find(c => c.capability === cap);
            if (comp) resolved.push({ ...comp, type: 'composite', source: 'registry' });

            // 3. Fallback to providers canHandle
            if (resolved.length === 0) {
                for (const [name, p] of this.providers) {
                    if (p.canHandle && p.canHandle(intent)) {
                        resolved.push({ capability: cap, command: cap, provider: name, type: 'atomic', source: 'fallback' });
                        break;
                    }
                }
            }
        }
        return resolved;
    }

    async executeResolution(intent, res) {
        const providerName = res.provider || 'system';
        const provider = this.providers.get(providerName);
        if (!provider) return { success: false, error: `Provider ${providerName} missing` };

        const payload = this.preparePayload(intent, res);
        try {
            const result = await provider.invoke(res, payload, intent);
            const normalized = (result && typeof result === 'object' && 'success' in result) 
                ? result 
                : { success: !!result, data: result };
            
            if (!normalized.success) this.log(`Failed: ${normalized.error}`, 'ERROR');
            return normalized;
        } catch (e) {
            this.log(`Panic: ${e.message}`, 'ERROR');
            return { success: false, error: e.message };
        }
    }

    preparePayload(intent, res) {
        let p = res.mapPayload ? (typeof res.mapPayload === 'function' ? res.mapPayload(intent) : intent.payload) : (intent.payload || {});
        if (typeof p === 'object' && p !== null) {
            try {
                let s = JSON.stringify(p);
                s = s.replace(/\${(\w+)}/g, (_, name) => this.variableCache.get(name) || `\${${name}}`);
                return JSON.parse(s);
            } catch (e) { return p; }
        }
        return p;
    }

    log(message, level = 'INFO', data = null) {
        const entry = { timestamp: new Date().toISOString(), message, level, data };
        this.logs.push(entry);
        if (this.logs.length > 200) this.logs.shift();
        console.log(`[IntentRouter] [${level}] ${message}`, data || '');
    }

    async showLogs() {
        const html = this.logs.map(l => `<div style="margin-bottom:5px"><b>[${l.level}]</b> ${l.message}</div>`).join('');
        acode.alert('Intent Router Logs', `<div style="font-family:monospace; font-size:12px">${html}</div>`);
    }

    async runTestSuite() {
        const tests = [
            { name: 'System Toast', intent: { intent: 'system.toast', payload: { message: 'Test Success' } } },
            { name: 'Variable Sync', intent: { steps: [{ intent: 'system.setVar', payload: { name: 't', value: 'Hello' } }, { intent: 'system.toast', payload: { message: '${t} World' } }] } },
            { name: 'AI Prompt', intent: 'ai://test' },
            { name: 'HTTP Get', intent: 'https://jsonplaceholder.typicode.com/todos/1' }
        ];

        for (const t of tests) {
            this.log(`Running test: ${t.name}`);
            const res = await this.routeIntent(t.intent);
            if (!res.success) window.toast(`Test ${t.name} failed: ${res.error}`);
        }
        window.toast('Test suite finished. Check logs.');
    }

    async promptRouteIntent() {
        const str = await acode.prompt('Intent (JSON/URI)', '');
        if (!str) return;
        try {
            const intent = str.startsWith('{') ? JSON.parse(str) : str;
            const res = await this.routeIntent(intent);
            if (res.success) window.toast('Success');
            else acode.alert('Error', res.error);
        } catch (e) { acode.alert('Invalid Format', e.message); }
    }

    destroy() {}
}

if (window.acode) {
    const router = new IntentRouter();
    acode.setPluginInit(router.init.bind(router), router.destroy.bind(router));
}


/**
 * @typedef {Object} IntentResult
 * @property {boolean} success
 * @property {any} [data]
 * @property {string} [error]
 * @property {Object} [metadata]
 */

class IntentRouter {
    constructor() {
        this.registry = [];
        this.compositeRegistry = [];
        this.providers = new Map();
        this.variableCache = new Map();
        this.systemCapabilities = {
            terminal: false,
            git: false,
            github: true,
            docker: false,
            termux: false,
            ai: true,
            http: true,
            system: true
        };
        this.logs = [];
    }

    async init($page) {
        this.$page = $page;
        await this.detectSystemCapabilities();
        this.setupCommands();
        this.registerDefaultProviders();
        console.log('Intent Router Initialized with capabilities:', this.systemCapabilities);
    }

    async detectSystemCapabilities() {
        // Simple detection logic for Android/Acode environment
        if (window.cordova) {
            this.systemCapabilities.termux = await this.checkCommand('termux-info');
            this.systemCapabilities.git = await this.checkCommand('git --version');
            this.systemCapabilities.terminal = this.systemCapabilities.termux;
        }
    }

    async checkCommand(cmd) {
        // Placeholder for actual command check logic
        return false; 
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
        
        acode.addCommand({
            name: 'intent-router:view-logs',
            description: 'View Intent Router Logs',
            exec: () => {
                const logStr = this.logs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n');
                acode.alert('Intent Router Logs', `<pre>${logStr}</pre>`);
            }
        });
    }

    registerDefaultProviders() {
        this.registerProvider('system', {
            canHandle: (intent) => intent.intent.startsWith('system.'),
            invoke: async (entry, payload, intent) => {
                try {
                    switch (entry.command || entry.capability) {
                        case 'system.pause':
                            const confirmed = await acode.confirm(payload.message || 'Pipeline paused for review.');
                            return { success: confirmed, data: confirmed };
                        case 'system.setVar':
                            if (payload.name) {
                                this.variableCache.set(payload.name, payload.value);
                            }
                            return { success: true };
                        case 'system.alert':
                            window.alert(payload.message || 'Alert');
                            return { success: true };
                        case 'system.toast':
                            window.toast(payload.message || 'Toast', payload.duration || 3000);
                            return { success: true };
                        default:
                            return { success: false, error: `Unknown system command: ${entry.command}` };
                    }
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });

        this.registerProvider('ai', {
            canHandle: (intent) => intent.intent.startsWith('ai://') || intent.provider === 'ai',
            invoke: async (entry, payload, intent) => {
                try {
                    const result = await acode.prompt(`AI Instruction: ${payload.instruction}`, '');
                    if (result && payload.outputVar) {
                        this.variableCache.set(payload.outputVar, result);
                    }
                    return { success: !!result, data: result };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });

        this.registerProvider('terminal', {
            canHandle: (intent) => intent.intent.startsWith('terminal://') || intent.provider === 'terminal',
            invoke: async (entry, payload, intent) => {
                if (!this.systemCapabilities.terminal) {
                    return { success: false, error: 'Terminal capability not available on this device' };
                }
                const command = payload.command || payload.script;
                this.log(`Executing terminal command: ${command}`);
                // Implementation would go here
                return { success: true, data: 'Command sent to terminal' };
            }
        });
    }

    registerProvider(name, provider) {
        this.providers.set(name, provider);
    }

    registerCapability(args) {
        if (!args || !args.capabilities) return;
        const base = {
            provider: args.provider || 'system',
            target: args.target,
        };

        for (const cap of args.capabilities) {
            const entry = typeof cap === 'string' ? { capability: cap, command: args.command } : cap;
            if (entry.capabilityType === 'composite') {
                this.compositeRegistry.push({ ...entry, ...base });
            } else {
                this.registry.push({ ...entry, ...base });
            }
        }
    }

    async routeIntent(intent) {
        const normalized = this.normalizeIntent(intent);
        this.log(`Routing intent: ${normalized.intent}`, 'DEBUG');

        if (normalized.steps && normalized.steps.length > 0) {
            let lastResult = { success: true };
            for (const step of normalized.steps) {
                lastResult = await this.routeIntent(step);
                if (!lastResult.success && !normalized.continueOnError) {
                    return lastResult;
                }
            }
            return lastResult;
        }

        const resolved = this.resolveCapabilities(normalized);
        if (resolved.length === 0) {
            const err = `No provider found for: ${normalized.intent}`;
            this.log(err, 'ERROR');
            window.toast(err, 3000);
            return { success: false, error: err };
        }

        let finalResult = { success: true };
        for (const entry of resolved) {
            const result = await this.executeResolution(normalized, entry);
            if (!result.success && !normalized.continueOnError) {
                return result;
            }
            finalResult = result;
        }

        return finalResult;
    }

    normalizeIntent(intent) {
        if (typeof intent === 'string') {
            return { intent, capabilities: [intent] };
        }
        if (!intent.capabilities && intent.intent) {
            intent.capabilities = [intent.intent];
        }
        return intent;
    }

    resolveCapabilities(intent) {
        const resolved = [];
        const capsToResolve = intent.capabilities || [intent.intent];

        for (const cap of capsToResolve) {
            const matches = this.registry.filter(c => c.capability === cap);
            for (const match of matches) {
                resolved.push({ ...match, capabilityType: 'atomic', source: 'registry' });
            }

            const composite = this.compositeRegistry.find(c => c.capability === cap);
            if (composite) {
                resolved.push({ ...composite, capabilityType: 'composite', source: 'registry' });
            }

            if (matches.length === 0 && !composite) {
                // Try to find a provider that can handle it directly
                for (const [name, provider] of this.providers) {
                    if (provider.canHandle && provider.canHandle(intent)) {
                        resolved.push({ capability: cap, command: cap, provider: name, capabilityType: 'atomic', source: 'fallback' });
                        break;
                    }
                }
            }
        }
        return resolved;
    }

    async executeResolution(intent, entry) {
        const providerName = entry.provider || 'system';
        const provider = this.providers.get(providerName);
        
        if (!provider) {
            return { success: false, error: `Provider not found: ${providerName}` };
        }

        const payload = this.preparePayload(intent, entry);
        
        try {
            this.log(`Invoking provider ${providerName} for ${entry.capability}`);
            const result = await provider.invoke(entry, payload, intent);
            
            // Normalize result if it's not already in the correct format
            const normalizedResult = (result && typeof result === 'object' && 'success' in result) 
                ? result 
                : { success: !!result, data: result };

            if (!normalizedResult.success) {
                this.log(`Execution failed: ${normalizedResult.error}`, 'ERROR');
            }

            return normalizedResult;
        } catch (error) {
            const errMessage = `Panic during execution: ${error.message}`;
            this.log(errMessage, 'ERROR');
            return { success: false, error: errMessage };
        }
    }

    preparePayload(intent, entry) {
        let payload = entry.mapPayload ? (typeof entry.mapPayload === 'function' ? entry.mapPayload(intent) : intent.payload) : (intent.payload || {});
        
        if (typeof payload === 'object' && payload !== null) {
            try {
                const str = JSON.stringify(payload);
                const substituted = str.replace(/\${(\w+)}/g, (_, name) => {
                    return this.variableCache.get(name) || `\${${name}}`;
                });
                return JSON.parse(substituted);
            } catch (e) {
                return payload;
            }
        }
        return payload;
    }

    log(message, level = 'INFO') {
        const entry = { timestamp: new Date().toISOString(), message, level };
        this.logs.push(entry);
        if (this.logs.length > 100) this.logs.shift();
        console.log(`[IntentRouter] [${level}] ${message}`);
    }

    async promptRouteIntent() {
        const intentStr = await acode.prompt('Enter Intent (JSON or string)', '');
        if (!intentStr) return;

        try {
            const intent = intentStr.startsWith('{') ? JSON.parse(intentStr) : intentStr;
            const result = await this.routeIntent(intent);
            if (result.success) {
                window.toast('Intent executed successfully', 2000);
            } else {
                acode.alert('Intent Failed', result.error || 'Unknown error');
            }
        } catch (e) {
            acode.alert('Invalid Intent Format', e.message);
        }
    }

    async promptRegisterCapability() {
        const capStr = await acode.prompt('Register Capability (JSON)', '');
        if (!capStr) return;
        try {
            const args = JSON.parse(capStr);
            this.registerCapability(args);
            window.toast('Capability Registered', 2000);
        } catch (e) {
            acode.alert('Invalid JSON', e.message);
        }
    }

    destroy() {
        this.providers.clear();
        this.variableCache.clear();
    }
}

if (window.acode) {
    const router = new IntentRouter();
    acode.setPluginInit(router.init.bind(router), router.destroy.bind(router));
}


class IntentRouter {
    constructor() {
        this.capabilities = [];
        this.compositeCapabilities = [];
        this.providers = new Map();
        this.variableCache = new Map();
        this.$sidebar = null;
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
        // Acode sidebar implementation
    }

    registerDefaultProviders() {
        this.registerProvider('system', {
            invoke: async (entry, payload, intent) => {
                switch (entry.command || entry.capability) {
                    case 'system.pause':
                        return await acode.confirm(payload.message || 'Pipeline paused for review.');
                    case 'system.setVar':
                        if (payload.name) {
                            this.variableCache.set(payload.name, payload.value);
                        }
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
                const result = await acode.prompt(`AI Instruction: ${payload.instruction}`, 'Simulated AI Response');
                if (payload.outputVar) {
                    this.variableCache.set(payload.outputVar, result);
                }
                return result;
            }
        });

        this.registerProvider('terminal', {
            invoke: async (entry, payload, intent) => {
                const command = payload.command || payload.script;
                if (!command) return false;
                console.log('Terminal Provider Executing:', command);
                return true;
            }
        });
    }

    registerProvider(name, provider) {
        this.providers.set(name, provider);
    }

    registerCapability(args) {
        if (!args || !args.capabilities) return;
        const base = {
            provider: args.provider || 'system',
            target: args.target,
        };

        for (const cap of args.capabilities) {
            const entry = typeof cap === 'string' ? { capability: cap, command: args.command } : cap;
            if (entry.capabilityType === 'composite') {
                this.compositeCapabilities.push({ ...entry, ...base });
            } else {
                this.capabilities.push({ ...entry, ...base });
            }
        }
    }

    async routeIntent(intent) {
        const normalized = this.normalizeIntent(intent);
        
        // Recursive steps
        if (normalized.steps && normalized.steps.length > 0) {
            let lastResult = true;
            for (const childStep of normalized.steps) {
                lastResult = await this.routeIntent(childStep);
                if (!lastResult && lastResult !== "") return false;
            }
            return lastResult;
        }

        // Resolve capabilities
        const resolved = this.resolveCapabilities(normalized);
        if (resolved.length === 0) {
            window.toast(`No capabilities resolved for ${normalized.intent}`, 3000);
            return false;
        }

        // Expand composites
        const expanded = this.expandCompositeResolutions(normalized, resolved);

        let finalResult = true;
        for (const entry of expanded) {
            const result = await this.executeResolution(normalized, entry);
            if (result === false) return false;
            finalResult = result;
        }

        return finalResult;
    }

    normalizeIntent(intent) {
        if (typeof intent === 'string') {
            return { intent, capabilities: [intent] };
        }
        if (!intent.capabilities && intent.intent) {
            intent.capabilities = [intent.intent];
        }
        return intent;
    }

    resolveCapabilities(intent) {
        const resolved = [];
        for (const cap of (intent.capabilities || [])) {
            // Check atomic
            const atomicMatches = this.capabilities.filter(c => c.capability === cap);
            for (const match of atomicMatches) {
                resolved.push({ ...match, capabilityType: 'atomic', source: 'registry' });
            }

            // Check composite
            const compositeMatch = this.compositeCapabilities.find(c => c.capability === cap);
            if (compositeMatch) {
                resolved.push({ ...compositeMatch, capabilityType: 'composite', source: 'registry' });
            }

            if (atomicMatches.length === 0 && !compositeMatch) {
                resolved.push({ capability: cap, command: cap, capabilityType: 'atomic', source: 'fallback' });
            }
        }
        return resolved;
    }

    expandCompositeResolutions(intent, resolutions) {
        const expanded = [];
        for (const res of resolutions) {
            if (res.capabilityType === 'composite' && res.steps) {
                for (const step of res.steps) {
                    expanded.push({
                        ...step,
                        capabilityType: 'atomic',
                        source: 'composite'
                    });
                }
            } else {
                expanded.push(res);
            }
        }
        return expanded;
    }

    async executeResolution(intent, entry) {
        const provider = this.providers.get(entry.provider || 'system');
        if (!provider) {
            console.error(`Provider not found: ${entry.provider}`);
            return false;
        }

        const payload = this.preparePayload(intent, entry);
        try {
            return await provider.invoke(entry, payload, intent);
        } catch (error) {
            console.error('Execution failed', error);
            return false;
        }
    }

    preparePayload(intent, entry) {
        let payload = entry.mapPayload ? (typeof entry.mapPayload === 'function' ? entry.mapPayload(intent) : intent.payload) : (intent.payload || {});
        
        // Variable substitution
        if (typeof payload === 'object') {
            const str = JSON.stringify(payload);
            const substituted = str.replace(/\${(\w+)}/g, (_, name) => {
                return this.variableCache.get(name) || `\${${name}}`;
            });
            return JSON.parse(substituted);
        }
        return payload;
    }

    async promptRouteIntent() {
        const intentStr = await acode.prompt('Enter Intent (JSON or string)', '');
        if (!intentStr) return;

        try {
            const intent = intentStr.startsWith('{') ? JSON.parse(intentStr) : intentStr;
            await this.routeIntent(intent);
        } catch (e) {
            window.alert('Invalid Intent Format: ' + e.message);
        }
    }

    async promptRegisterCapability() {
        const capStr = await acode.prompt('Register Capability (JSON)', '{"capabilities":["test.hello"],"command":"system.alert","provider":"system"}');
        if (!capStr) return;
        try {
            const args = JSON.parse(capStr);
            this.registerCapability(args);
            window.toast('Capability Registered', 2000);
        } catch (e) {
            window.alert('Invalid JSON');
        }
    }

    async destroy() {
        // Cleanup
    }
}

if (window.acode) {
    const intentRouter = new IntentRouter();
    acode.setPluginInit(intentRouter.init.bind(intentRouter), intentRouter.destroy.bind(intentRouter));
}

class IntentRouter {
    constructor() {
        this.capabilities = [];
        this.compositeCapabilities = [];
        this.providers = new Map();
        this.variableCache = new Map();
        this.$sidebar = null;
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
        // Acode sidebar implementation
    }

    registerDefaultProviders() {
        this.registerProvider('system', {
            invoke: async (entry, payload, intent) => {
                switch (entry.command || entry.capability) {
                    case 'system.pause':
                        return await acode.confirm(payload.message || 'Pipeline paused for review.');
                    case 'system.setVar':
                        if (payload.name) {
                            this.variableCache.set(payload.name, payload.value);
                        }
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
                const result = await acode.prompt(`AI Instruction: ${payload.instruction}`, 'Simulated AI Response');
                if (payload.outputVar) {
                    this.variableCache.set(payload.outputVar, result);
                }
                return result;
            }
        });

        this.registerProvider('terminal', {
            invoke: async (entry, payload, intent) => {
                const command = payload.command || payload.script;
                if (!command) return false;
                console.log('Terminal Provider Executing:', command);
                return true;
            }
        });
    }

    registerProvider(name, provider) {
        this.providers.set(name, provider);
    }

    registerCapability(args) {
        if (!args || !args.capabilities) return;
        const base = {
            provider: args.provider || 'system',
            target: args.target,
        };

        for (const cap of args.capabilities) {
            const entry = typeof cap === 'string' ? { capability: cap, command: args.command } : cap;
            if (entry.capabilityType === 'composite') {
                this.compositeCapabilities.push({ ...entry, ...base });
            } else {
                this.capabilities.push({ ...entry, ...base });
            }
        }
    }

    async routeIntent(intent) {
        const normalized = this.normalizeIntent(intent);
        
        // Recursive steps
        if (normalized.steps && normalized.steps.length > 0) {
            let lastResult = true;
            for (const childStep of normalized.steps) {
                lastResult = await this.routeIntent(childStep);
                if (!lastResult && lastResult !== "") return false;
            }
            return lastResult;
        }

        // Resolve capabilities
        const resolved = this.resolveCapabilities(normalized);
        if (resolved.length === 0) {
            window.toast(`No capabilities resolved for ${normalized.intent}`, 3000);
            return false;
        }

        // Expand composites
        const expanded = this.expandCompositeResolutions(normalized, resolved);

        let finalResult = true;
        for (const entry of expanded) {
            const result = await this.executeResolution(normalized, entry);
            if (result === false) return false;
            finalResult = result;
        }

        return finalResult;
    }

    normalizeIntent(intent) {
        if (typeof intent === 'string') {
            return { intent, capabilities: [intent] };
        }
        if (!intent.capabilities && intent.intent) {
            intent.capabilities = [intent.intent];
        }
        return intent;
    }

    resolveCapabilities(intent) {
        const resolved = [];
        for (const cap of (intent.capabilities || [])) {
            // Check atomic
            const atomicMatches = this.capabilities.filter(c => c.capability === cap);
            for (const match of atomicMatches) {
                resolved.push({ ...match, capabilityType: 'atomic', source: 'registry' });
            }

            // Check composite
            const compositeMatch = this.compositeCapabilities.find(c => c.capability === cap);
            if (compositeMatch) {
                resolved.push({ ...compositeMatch, capabilityType: 'composite', source: 'registry' });
            }

            if (atomicMatches.length === 0 && !compositeMatch) {
                resolved.push({ capability: cap, command: cap, capabilityType: 'atomic', source: 'fallback' });
            }
        }
        return resolved;
    }

    expandCompositeResolutions(intent, resolutions) {
        const expanded = [];
        for (const res of resolutions) {
            if (res.capabilityType === 'composite' && res.steps) {
                for (const step of res.steps) {
                    expanded.push({
                        ...step,
                        capabilityType: 'atomic',
                        source: 'composite'
                    });
                }
            } else {
                expanded.push(res);
            }
        }
        return expanded;
    }

    async executeResolution(intent, entry) {
        const provider = this.providers.get(entry.provider || 'system');
        if (!provider) {
            console.error(`Provider not found: ${entry.provider}`);
            return false;
        }

        const payload = this.preparePayload(intent, entry);
        try {
            return await provider.invoke(entry, payload, intent);
        } catch (error) {
            console.error('Execution failed', error);
            return false;
        }
    }

    preparePayload(intent, entry) {
        let payload = entry.mapPayload ? entry.mapPayload(intent) : (intent.payload || {});
        
        // Variable substitution
        if (typeof payload === 'object') {
            const str = JSON.stringify(payload);
            const substituted = str.replace(/\${(\w+)}/g, (_, name) => {
                return this.variableCache.get(name) || `\${${name}}`;
            });
            return JSON.parse(substituted);
        }
        return payload;
    }

    async promptRouteIntent() {
        const intentStr = await acode.prompt('Enter Intent (JSON or string)', '');
        if (!intentStr) return;

        try {
            const intent = intentStr.startsWith('{') ? JSON.parse(intentStr) : intentStr;
            await this.routeIntent(intent);
        } catch (e) {
            window.alert('Invalid Intent Format: ' + e.message);
        }
    }

    async promptRegisterCapability() {
        const capStr = await acode.prompt('Register Capability (JSON)', '{"capabilities":["test.hello"],"command":"system.alert","provider":"system"}');
        if (!capStr) return;
        try {
            const args = JSON.parse(capStr);
            this.registerCapability(args);
            window.toast('Capability Registered', 2000);
        } catch (e) {
            window.alert('Invalid JSON');
        }
    }

    async destroy() {
        // Cleanup
    }
}

if (window.acode) {
    const intentRouter = new IntentRouter();
    acode.setPluginInit(intentRouter.init.bind(intentRouter), intentRouter.destroy.bind(intentRouter));
}

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
    registerProvider(name, provider) {
        this.providers.set(name, provider);
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
