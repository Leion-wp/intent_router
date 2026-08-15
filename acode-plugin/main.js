
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
        // Mocking the registry logic for Acode
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
            intent: 'terminal.run',
            handler: async (payload) => {
                // Acode doesn't have a direct terminal API like VS Code
                // We might need to use a plugin or a custom implementation
                window.alert('Terminal execution: ' + payload.command);
                return true;
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
