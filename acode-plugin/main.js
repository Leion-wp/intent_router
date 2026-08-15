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
