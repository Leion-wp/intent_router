/**
 * Intent Router for Acode - Android Edition
 * Version: 1.1.0
 * Developed by Rutex (Autonomous AI)
 */

// --- CONSTANTS ---
const PROVIDERS = {
    SYSTEM: 'system',
    AI: 'ai',
    GIT: 'git',
    HTTP: 'http',
    TERMINAL: 'terminal',
    DOCKER: 'docker'
};

const ERROR_CODES = {
    PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
    CAPABILITY_MISSING: 'CAPABILITY_MISSING',
    EXECUTION_FAILED: 'EXECUTION_FAILED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    TIMEOUT: 'TIMEOUT'
};

// --- BASE PROVIDER ---
class BaseProvider {
    constructor(name) {
        this.name = name;
    }

    async canHandle(intent) {
        return intent.scheme === this.name;
    }

    async execute(intent, context) {
        throw new Error('Method execute() must be implemented');
    }

    normalizeResponse(success, data = null, error = null, metadata = {}) {
        return {
            success,
            data,
            error: error ? {
                message: error.message || String(error),
                code: error.code || ERROR_CODES.EXECUTION_FAILED
            } : null,
            metadata: {
                ...metadata,
                provider: this.name,
                timestamp: Date.now()
            }
        };
    }
}

// --- SYSTEM PROVIDER ---
class SystemProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.SYSTEM);
    }

    async execute(intent, context) {
        try {
            switch (intent.action) {
                case 'toast':
                    if (window.toast) {
                        window.toast(intent.data?.message || 'No message', 3000);
                    }
                    return this.normalizeResponse(true, { displayed: true });
                case 'get_info':
                    return this.normalizeResponse(true, {
                        version: '1.1.0',
                        platform: 'android',
                        capabilities: context.capabilities
                    });
                case 'alert':
                    if (window.alert) {
                        window.alert(intent.data?.title || 'Alert', intent.data?.message || '');
                    }
                    return this.normalizeResponse(true, { displayed: true });
                default:
                    throw { message: `Action ${intent.action} not supported`, code: ERROR_CODES.VALIDATION_ERROR };
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }

// --- TERMINAL PROVIDER ---
class TerminalProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.TERMINAL);
    }

    async canHandle(intent) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        return intent.scheme === this.name && !!terminal;
    }

    async execute(intent, context) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        if (!terminal) {
            return this.normalizeResponse(false, null, {
                message: 'Terminal plugin not found',
                code: ERROR_CODES.CAPABILITY_MISSING
            });
        }

        try {
            if (intent.action === 'run') {
                const result = await terminal.run(intent.data.command);
                return this.normalizeResponse(true, { output: result });
            }
            throw { message: `Action ${intent.action} not supported`, code: ERROR_CODES.VALIDATION_ERROR };
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- GIT PROVIDER ---
class GitProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.GIT);
    }

    async canHandle(intent) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        return intent.scheme === this.name && !!terminal;
    }

    async execute(intent, context) {
        const terminal = window.terminal || (window.acode && window.acode.require('terminal'));
        try {
            const { action, data } = intent;
            let command = '';

            switch (action) {
                case 'status': command = 'git status'; break;
                case 'commit': command = `git commit -m "${data.message}"`; break;
                case 'push': command = 'git push'; break;
                default:
                    command = `git ${action} ${data?.args || ''}`;
            }

            const output = await terminal.run(command);
            return this.normalizeResponse(true, { output });
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}



// --- HTTP PROVIDER ---
class HttpProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.HTTP);
    }

    async execute(intent, context) {
        try {
            const { url, method = 'GET', headers = {}, body } = intent.data;
            const response = await fetch(url, {
                method,
                headers,
                body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
            });

            const responseData = await response.json().catch(() => null);
            return this.normalizeResponse(response.ok, responseData, response.ok ? null : {
                message: `HTTP Error: ${response.status}`,
                code: response.status
            });
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

// --- AI PROVIDER ---
class AIProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.AI);
    }

    async execute(intent, context) {
        return this.normalizeResponse(true, { 
            message: "AI Intent received. Integration pending.",
            intent_data: intent.data 
        });
    }
}

// --- DOCKER PROVIDER ---
class DockerProvider extends BaseProvider {
    constructor() {
        super(PROVIDERS.DOCKER);
    }

    async execute(intent, context) {
        return this.normalizeResponse(false, null, {
            message: 'Docker is not supported on Android natively.',
            code: ERROR_CODES.CAPABILITY_MISSING
        });
    }
}
