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

class BaseProvider {
    constructor(router) {
        this.router = router;
    }
    async canHandle(intent) {
        return false;
    }
    async execute(intent, context) {
        throw new Error('Method not implemented');
    }
    normalizeResponse(success, data, error = null, metadata = {}) {
        return {
            success,
            data,
            error: error ? (typeof error === 'string' ? error : error.message) : null,
            metadata: {
                ...metadata,
                timestamp: Date.now(),
                provider: this.constructor.name
            }
        };
    }
}

class SystemProvider extends BaseProvider {
    async canHandle(intent) {
        return intent.scheme === 'system';
    }
    async execute(intent, context) {
        try {
            switch (intent.action) {
                case 'alert':
                    window.alert(intent.data.message || 'System Alert');
                    return this.normalizeResponse(true, { message: 'Alert displayed' });
                case 'toast':
                    window.toast(intent.data.message || 'System Toast', 3000);
                    return this.normalizeResponse(true, { message: 'Toast displayed' });
                case 'confirm':
                    const result = window.confirm(intent.data.message || 'Are you sure?');
                    return this.normalizeResponse(true, { confirmed: result });
                default:
                    return this.normalizeResponse(false, null, `Action ${intent.action} not supported by SystemProvider`);
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}

class GitHubProvider extends BaseProvider {
    async canHandle(intent) {
        return intent.scheme === 'github';
    }
    async execute(intent, context) {
        const { action, data } = intent;
        const token = context.config?.github_token;
        
        try {
            switch (action) {
                case 'get_repo':
                    const repoRes = await fetch(`https://api.github.com/repos/${data.owner}/${data.repo}`, {
                        headers: token ? { 'Authorization': `token ${token}` } : {}
                    });
                    const repoData = await repoRes.json();
                    return this.normalizeResponse(true, repoData);
                case 'get_contents':
                    const contentRes = await fetch(`https://api.github.com/repos/${data.owner}/${data.repo}/contents/${data.path || ''}`, {
                        headers: token ? { 'Authorization': `token ${token}` } : {}
                    });
                    const contentData = await contentRes.json();
                    return this.normalizeResponse(true, contentData);
                default:
                    return this.normalizeResponse(false, null, `Action ${action} not supported by GitHubProvider`);
            }
        } catch (e) {
            return this.normalizeResponse(false, null, e);
        }
    }
}
