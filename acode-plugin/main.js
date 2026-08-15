

/**
 * Base Provider Logic & Default Providers
 */

class SystemProvider {
    canHandle(intent) {
        return intent.intent.startsWith('system://') || intent.intent.startsWith('file://');
    }

    async execute(intent, context) {
        try {
            if (intent.intent.startsWith('file://')) {
                // Handle file operations via Acode API
                return { success: true, data: { action: 'file_handled' } };
            }
            
            // Example system action
            window.toast(`System action: ${intent.intent}`);
            return { success: true, data: { action: intent.intent } };
        } catch (e) {
            return { success: false, error: { code: 'SYSTEM_ERROR', message: e.message } };
        }
    }
}

class HttpProvider {
    canHandle(intent) {
        return intent.intent.startsWith('http://') || intent.intent.startsWith('https://');
    }

    async execute(intent, context) {
        try {
            const response = await fetch(intent.intent, {
                method: intent.payload?.method || 'GET',
                body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined,
                headers: intent.payload?.headers || {}
            });
            const data = await response.json();
            return { success: true, data };
        } catch (e) {
            return { success: false, error: { code: 'HTTP_ERROR', message: e.message } };
        }
    }
}

class TerminalProvider {
    canHandle(intent) {
        return intent.intent.startsWith('terminal://') || intent.intent.startsWith('sh://');
    }

    async execute(intent, context) {
        if (!context.capabilities.terminal) {
            return { success: false, error: { code: 'CAPABILITY_MISSING', message: 'Terminal not available' } };
        }
        
        try {
            // Placeholder for Acode terminal execution
            // const result = await acode.exec(intent.payload.command);
            return { success: true, data: { stdout: 'Command executed (simulated)' } };
        } catch (e) {
            return { success: false, error: { code: 'TERMINAL_ERROR', message: e.message } };
        }
    }
}


// Acode Plugin Entry Point
let router;

function init() {
    router = new IntentRouter();
    router.init().then(() => {
        // Registering to Acode (if applicable)
        // For example, adding a command to the command palette
        if (typeof editorManager !== 'undefined') {
            editorManager.editor.commands.addCommand({
                name: "intentRouter:execute",
                bindKey: { win: "Ctrl-Shift-I", mac: "Command-Shift-I" },
                exec: async () => {
                    const input = await window.prompt("Enter Intent (JSON or URI):");
                    if (input) {
                        try {
                            const intent = input.startsWith('{') ? JSON.parse(input) : { intent: input };
                            const result = await router.execute(intent);
                            console.log("Intent Result:", result);
                        } catch (e) {
                            window.toast("Invalid Intent format");
                        }
                    }
                }
            });
        }
    });
}

if (window.acode) {
    acode.setPluginInit(init);
} else {
    // Fallback or dev environment
    init();
}
