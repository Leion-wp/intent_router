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
