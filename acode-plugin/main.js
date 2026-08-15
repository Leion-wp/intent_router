
class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
    }

    async init() {
        console.log('Intent Router for Acode initialized');
        this.registerInternalProviders();
    }

    registerCapability(cap) {
        this.capabilities.set(cap.intent, cap.handler);
    }

    async resolveVariables(payload) {
        if (!payload) return payload;
        let str = JSON.stringify(payload);
        str = str.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const val = this.variableCache.get(key.trim());
            return val !== undefined ? val : match;
        });
        try {
            return JSON.parse(str);
        } catch (e) {
            return str;
        }
    }

    registerInternalProviders() {
        const fs = acode.require('fs');

        // --- SYSTEM & UI ---
        this.registerCapability({
            intent: 'system.pause',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Intent Router', payload.message || 'Pause for human validation', (res) => {
                        resolve(res);
                    });
                });
            }
        });

        this.registerCapability({
            intent: 'ui.toast',
            handler: async (payload) => {
                window.toast(payload.message, 3000);
                return true;
            }
        });

        // --- FILE SYSTEM ---
        this.registerCapability({
            intent: 'fs.read',
            handler: async (payload) => {
                const content = await fs.readFile(payload.path);
                if (payload.var) this.variableCache.set(payload.var, content);
                return content;
            }
        });

        this.registerCapability({
            intent: 'fs.write',
            handler: async (payload) => {
                await fs.writeFile(payload.path, payload.content);
                return true;
            }
        });

        this.registerCapability({
            intent: 'fs.list',
            handler: async (payload) => {
                return await fs.readdir(payload.path);
            }
        });

        // --- EDITOR ---
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (payload) => {
                editorManager.editor.insert(payload.text);
                return true;
            }
        });

        this.registerCapability({
            intent: 'editor.set_value',
            handler: async (payload) => {
                editorManager.editor.setValue(payload.value);
                return true;
            }
        });

        // --- TERMINAL / SHELL ---
        this.registerCapability({
            intent: 'terminal.exec',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    if (window.acode && acode.exec) {
                        acode.exec(payload.command, (res) => resolve(res));
                    } else {
                        // Fallback: try to find a terminal plugin or use a mock
                        console.warn('Terminal not available');
                        window.toast('Terminal API not found', 3000);
                        resolve(null);
                    }
                });
            }
        });

        // --- HTTP ---
        this.registerCapability({
            intent: 'http.request',
            handler: async (payload) => {
                const response = await fetch(payload.url, {
                    method: payload.method || 'GET',
                    headers: payload.headers || {},
                    body: payload.body ? (typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)) : undefined
                });
                const data = await response.json();
                if (payload.var) this.variableCache.set(payload.var, data);
                return data;
            }
        });

        // --- GIT (via Terminal) ---
        this.registerCapability({
            intent: 'git.status',
            handler: async () => this.route({ intent: 'terminal.exec', payload: { command: 'git status' } })
        });
        
        this.registerCapability({
            intent: 'git.commit',
            handler: async (payload) => this.route({ intent: 'terminal.exec', payload: { command: `git commit -m "${payload.message}"` } })
        });

        this.registerCapability({
            intent: 'git.push',
            handler: async () => this.route({ intent: 'terminal.exec', payload: { command: 'git push' } })
        });

        // --- AI (Mapping to a generic provider for Acode) ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                window.toast('AI Generating...', 2000);
                // Implementation would typically call an API (OpenAI/Gemini)
                // For now, we simulate or use a configured endpoint
                return "AI Response Simulation for: " + payload.instruction;
            }
        });
    }

    async route(intent) {
        console.log('Routing:', intent.intent);
        if (intent.steps && Array.isArray(intent.steps)) {
            let lastResult;
            for (const step of intent.steps) {
                lastResult = await this.route(step);
                if (lastResult === false) break;
            }
            return lastResult;
        }

        const payload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        
        if (handler) {
            const result = await handler(payload);
            if (intent.var && result !== undefined) {
                this.variableCache.set(intent.var, result);
            }
            return result;
        } else {
            window.toast(`Missing handler: ${intent.intent}`, 3000);
            return false;
        }
    }
}

class LeionRootsPlugin {
    async init() {
        this.router = new IntentRouter();
        await this.router.init();

        acode.setSideButton({
            id: 'leion-roots-cockpit',
            icon: 'account_tree',
            name: 'Leion Cockpit',
            onclick: () => this.openCockpit()
        });

        acode.addCommand({
            name: 'Leion: Run Intent',
            description: 'Run a Leion Intent JSON',
            exec: async () => {
                const intentStr = await acode.prompt('Enter Intent JSON', '', 'textarea');
                if (intentStr) {
                    try {
                        const intent = JSON.parse(intentStr);
                        await this.router.route(intent);
                    } catch (e) {
                        window.toast('Invalid JSON', 3000);
                    }
                }
            }
        });
    }

    openCockpit() {
        window.toast('Cockpit opening...', 2000);
        // UI logic for the drag-and-drop builder
    }

    async destroy() {
        acode.unSetSideButton('leion-roots-cockpit');
    }
}

if (window.acode) {
    const leionPlugin = new LeionRootsPlugin();
    acode.define('leion-roots', {
        init: async () => await leionPlugin.init(),
        destroy: () => leionPlugin.destroy()
    });
}

class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
    }

    async init() {
        console.log('Intent Router for Acode initialized');
        this.registerInternalProviders();
    }

    registerCapability(cap) {
        this.capabilities.set(cap.intent, cap.handler);
    }

    async resolveVariables(payload) {
        if (!payload) return payload;
        let str = JSON.stringify(payload);
        str = str.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const val = this.variableCache.get(key.trim());
            return val !== undefined ? val : match;
        });
        try {
            return JSON.parse(str);
        } catch (e) {
            return str;
        }
    }

    registerInternalProviders() {
        // --- SYSTEM ---
        this.registerCapability({
            intent: 'system.pause',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Intent Router', payload.message || 'Pause for human validation', (res) => {
                        resolve(res);
                    });
                });
            }
        });

        // --- FILE SYSTEM ---
        const fs = acode.require('fs');
        this.registerCapability({
            intent: 'fs.read',
            handler: async (payload) => {
                const content = await fs.readFile(payload.path);
                if (payload.var) this.variableCache.set(payload.var, content);
                return content;
            }
        });

        this.registerCapability({
            intent: 'fs.write',
            handler: async (payload) => {
                await fs.writeFile(payload.path, payload.content);
                return true;
            }
        });

        this.registerCapability({
            intent: 'fs.list',
            handler: async (payload) => {
                return await fs.readdir(payload.path);
            }
        });

        // --- EDITOR ---
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (payload) => {
                editorManager.editor.insert(payload.text);
                return true;
            }
        });

        this.registerCapability({
            intent: 'editor.set_value',
            handler: async (payload) => {
                editorManager.editor.setValue(payload.value);
                return true;
            }
        });

        // --- UI ---
        this.registerCapability({
            intent: 'ui.toast',
            handler: async (payload) => {
                window.toast(payload.message, 3000);
                return true;
            }
        });

        // --- TERMINAL / SHELL ---
        this.registerCapability({
            intent: 'terminal.exec',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    // Assuming acode.exec or similar exists via a terminal plugin
                    if (window.acode && acode.exec) {
                        acode.exec(payload.command, (res) => resolve(res));
                    } else {
                        window.toast('Terminal not available', 3000);
                        resolve(null);
                    }
                });
            }
        });

        // --- HTTP ---
        this.registerCapability({
            intent: 'http.request',
            handler: async (payload) => {
                const response = await fetch(payload.url, {
                    method: payload.method || 'GET',
                    headers: payload.headers || {},
                    body: payload.body ? JSON.stringify(payload.body) : undefined
                });
                const data = await response.json();
                if (payload.var) this.variableCache.set(payload.var, data);
                return data;
            }
        });

        // --- GIT (via Terminal) ---
        this.registerCapability({
            intent: 'git.status',
            handler: async () => this.route({ intent: 'terminal.exec', payload: { command: 'git status' } })
        });
        
        this.registerCapability({
            intent: 'git.commit',
            handler: async (payload) => this.route({ intent: 'terminal.exec', payload: { command: `git commit -m "${payload.message}"` } })
        });
    }

    async route(intent) {
        if (intent.steps && Array.isArray(intent.steps)) {
            let lastResult;
            for (const step of intent.steps) {
                lastResult = await this.route(step);
                if (lastResult === false) break;
            }
            return lastResult;
        }

        const payload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        
        if (handler) {
            const result = await handler(payload);
            if (intent.var && result !== undefined) {
                this.variableCache.set(intent.var, result);
            }
            return result;
        } else {
            window.toast(`Missing handler: ${intent.intent}`, 3000);
            return false;
        }
    }
}

class LeionRootsPlugin {
    async init() {
        this.router = new IntentRouter();
        await this.router.init();

        acode.setSideButton({
            id: 'leion-roots-cockpit',
            icon: 'account_tree',
            name: 'Leion Cockpit',
            onclick: () => this.openCockpit()
        });

        acode.addCommand({
            name: 'Leion: Run Intent',
            description: 'Run a Leion Intent JSON',
            exec: async () => {
                const intentStr = await acode.prompt('Enter Intent JSON', '', 'textarea');
                if (intentStr) {
                    try {
                        const intent = JSON.parse(intentStr);
                        await this.router.route(intent);
                    } catch (e) {
                        window.toast('Invalid JSON', 3000);
                    }
                }
            }
        });
    }

    openCockpit() {
        window.toast('Cockpit opening...', 2000);
        // UI logic for the drag-and-drop builder will go here
    }

    async destroy() {}
}

if (window.acode) {
    const leionPlugin = new LeionRootsPlugin();
    acode.define('leion-roots', {
        init: async () => await leionPlugin.init(),
        destroy: () => leionPlugin.destroy()
    });
}

class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
    }

    async init() {
        console.log('Intent Router for Acode initialized');
        this.registerInternalProviders();
    }

    registerInternalProviders() {
        // System Provider
        this.registerCapability({
            intent: 'system.pause',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Intent Router', payload.message || 'Pause for human validation', (res) => {
                        resolve(res);
                    });
                });
            }
        });

        // File System Provider (Acode specific)
        this.registerCapability({
            intent: 'fs.read',
            handler: async (payload) => {
                try {
                    const fs = acode.require('fs');
                    return await fs.readFile(payload.path);
                } catch (e) {
                    window.toast(e.message, 3000);
                    return null;
                }
            }
        });
        // Editor Provider
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (payload) => {
                const { text } = payload;
                const { editor } = editorManager;
                editor.insert(text);
                return true;
            }
        });

        this.registerCapability({
            intent: 'editor.set_value',
            handler: async (payload) => {
                const { value } = payload;
                const { editor } = editorManager;
                editor.setValue(value);
                return true;
            }
        });

        this.registerCapability({
            intent: 'ui.toast',
            handler: async (payload) => {
                window.toast(payload.message, 3000);
                return true;
            }
        });

    }

    async resolveVariables(payload) {
        if (!payload) return payload;
        let str = JSON.stringify(payload);
        // Replace {{var}} with values from cache
        str = str.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            return this.variableCache.has(key.trim()) ? this.variableCache.get(key.trim()) : match;
        });
        return JSON.parse(str);
    }

    registerInternalProviders() {
        // System Provider
        this.registerCapability({
            intent: 'system.pause',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Intent Router', payload.message || 'Pause for human validation', (res) => {
                        resolve(res);
                    });
                });
            }
        });

        // File System Provider (Acode specific)
        this.registerCapability({
            intent: 'fs.read',
            handler: async (payload) => {
                try {
                    const fs = acode.require('fs');
                    const content = await fs.readFile(payload.path);
                    if (payload.var) this.variableCache.set(payload.var, content);
                    return content;
                } catch (e) {
                    window.toast(e.message, 3000);
                    return null;
                }
            }
        });

        this.registerCapability({
            intent: 'fs.write',
            handler: async (payload) => {
                try {
                    const fs = acode.require('fs');
                    await fs.writeFile(payload.path, payload.content);
                    return true;
            exec: async () => {
                const intentStr = await acode.prompt('Enter Intent JSON', '{"intent": "ui.toast", "payload": {"message": "Hello from Acode"}}', 'textarea');
                if (intentStr) {
                    try {
                        const intent = JSON.parse(intentStr);
                        await this.router.route(intent);
                    } catch (e) {
                        window.toast('Invalid JSON', 3000);
                    }
                }
            }

                    window.toast(e.message, 3000);
                    return false;
                }
            }
        });

        // Editor Provider
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (payload) => {
                const { text } = payload;
                const { editor } = editorManager;
                editor.insert(text);
                return true;
            }
        });

        this.registerCapability({
            intent: 'editor.set_value',
            handler: async (payload) => {
                const { value } = payload;
                const { editor } = editorManager;
                editor.setValue(value);
                return true;
            }
        });

        this.registerCapability({
            intent: 'ui.toast',
            handler: async (payload) => {
                window.toast(payload.message, 3000);
                return true;
            }
        });

        // Git Provider (Simulation via Terminal for now, or basic git if available)
        this.registerCapability({
            intent: 'git.commit',
            handler: async (payload) => {
                // In Acode, we might need to use a terminal plugin or execute shell if available
                window.toast(`Git Commit: ${payload.message}`, 2000);
                return true;
            }
        });
    }


    registerCapability(cap) {
        this.capabilities.set(cap.intent, cap.handler);
    }

    async route(intent) {
        console.log('Routing intent:', intent.intent);
        
        // Resolve variables in payload before execution
        if (intent.payload) {
            intent.payload = await this.resolveVariables(intent.payload);
        }

        // Composite Intent Logic (Steps)
        if (intent.steps && Array.isArray(intent.steps)) {
            let lastResult = true;
            for (const step of intent.steps) {
                lastResult = await this.route(step);
                if (!lastResult) break;
            }
            return lastResult;
        }

        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            try {
                const result = await handler(intent.payload);
                // Auto-capture result if 'var' is specified in the intent (extension of the protocol)
                if (intent.var && result !== undefined) {
                    this.variableCache.set(intent.var, result);
                }
                return result;
            } catch (err) {
                console.error(`Error executing ${intent.intent}:`, err);
                return false;
            }
        } else {
            console.warn('No handler for intent:', intent.intent);
            window.toast(`Missing handler: ${intent.intent}`, 3000);
            return false;
        }
    }

        console.log('Routing intent:', intent.intent);
        
        // Composite Intent Logic (Steps)
        if (intent.steps && Array.isArray(intent.steps)) {
            let lastResult = true;
            for (const step of intent.steps) {
                lastResult = await this.route(step);
                if (!lastResult) break;
            }
            return lastResult;
        }

        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            return await handler(intent.payload);
        } else {
            console.warn('No handler for intent:', intent.intent);
            window.toast(`Missing handler: ${intent.intent}`, 3000);
            return false;
        }
    }
}

class LeionRootsPlugin {
    async init() {
        this.router = new IntentRouter();
        await this.router.init();

        acode.setSideButton({
            id: 'leion-roots-cockpit',
            icon: 'account_tree',
            name: 'Leion Cockpit',
            onclick: () => this.openCockpit()
        });

        this.registerCommands();
    }

    registerCommands() {
        editorManager.editor.commands.addCommand({
            name: 'leion:run_intent',
            description: 'Run Intent',
            exec: async () => {
                const intentStr = await acode.prompt('Enter Intent JSON', '{"intent": "system.pause", "payload": {"message": "Hello from Acode"}}', 'textarea');
                if (intentStr) {
                    try {
                        const intent = JSON.parse(intentStr);
                        await this.router.route(intent);
                    } catch (e) {
                        acode.alert('Error', 'Invalid JSON');
                    }
                }
            }
        });
    }

    openCockpit() {
        acode.alert('Leion Cockpit', 'Visual Pipeline Builder coming soon to Acode!');
    }

    async destroy() {
        // Cleanup if needed
    }
}

if (window.acode) {
    const plugin = new LeionRootsPlugin();
    acode.define('leion-roots', {
        init: () => plugin.init(),
        destroy: () => plugin.destroy(),
    });
}

        });
    }

    registerCapability(cap) {
        this.capabilities.set(cap.intent, cap.handler);
    }

    async route(intent) {
        console.log('Routing intent:', intent.intent);
        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            return await handler(intent.payload);
        } else {
            console.warn('No handler for intent:', intent.intent);
            return false;
        }
    }

    destroy() {
        console.log('Intent Router destroyed');
    }
}

if (window.acode) {
    const intentRouter = new IntentRouter();
    acode.setSideButton({
        id: 'intent-router',
        icon: 'play_arrow',
        name: 'Intent Router',
        onclick: () => {
            acode.alert('Intent Router', 'Ready for orchestration');
        }
    });

    intentRouter.init();
}

class LeionRoots {
    async init() {
        console.log('Leion Roots initialized');
        // TODO: Charger le moteur d'intention ici
        this.registerCommands();
    }

    registerCommands() {
        editorManager.editor.commands.addCommand({
            name: 'leionRoots:route',
            description: 'Leion Roots: Route Intent',
            exec: () => this.routeIntentPrompt(),
        });
    }

    async routeIntentPrompt() {
        const intent = await prompt('Enter Intent', 'e.g. terminal.run', 'text');
        if (intent) {
            window.toast(`Routing intent: ${intent}`, 3000);
            // Appel au moteur
        }
    }

    async destroy() {
        // Cleanup
    }
}

if (window.acode) {
    const leionRoots = new LeionRoots();
    acode.setPluginInit('com.leion.roots', async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
        leionRoots.baseUrl = baseUrl;
        await leionRoots.init();
    });
    acode.setPluginUnmount('com.leion.roots', () => {
        leionRoots.destroy();
    });
}
