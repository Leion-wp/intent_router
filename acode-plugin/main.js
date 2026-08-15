
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
