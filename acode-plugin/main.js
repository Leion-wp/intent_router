
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
                } catch (e) {
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
