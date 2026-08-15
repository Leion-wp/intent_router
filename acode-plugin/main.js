/**
 * Leion Roots - Intent Router for Acode
 * Orchestration layer for human-centric automation on mobile.
 */

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
            if (val === undefined) return match;
            return typeof val === 'object' ? JSON.stringify(val) : val;
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

        this.registerCapability({
            intent: 'ui.prompt',
            handler: async (payload) => {
                const res = await acode.prompt(payload.title, payload.defaultValue || '', payload.type || 'text');
                return res;
            }
        });

        // --- FILE SYSTEM ---
        this.registerCapability({
            intent: 'fs.read',
            handler: async (payload) => {
                const content = await fs.readFile(payload.path);
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

        this.registerCapability({
            intent: 'fs.exists',
            handler: async (payload) => {
                return await fs.exists(payload.path);
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
            intent: 'editor.get_value',
            handler: async () => {
                return editorManager.editor.getValue();
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
                    headers: payload.headers || { 'Content-Type': 'application/json' },
                    body: payload.body ? (typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)) : undefined
                });
                const text = await response.text();
                try { return JSON.parse(text); } catch(e) { return text; }
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

        // --- DOCKER ---
        this.registerCapability({
            intent: 'docker.ps',
            handler: async () => this.route({ intent: 'terminal.exec', payload: { command: 'docker ps' } })
        });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                window.toast('AI Generating...', 2000);
                return "AI Simulation: " + payload.instruction;
            }
        });
    }

    async route(intent) {
        console.log('[IntentRouter] Routing:', intent.intent);
        
        if (intent.steps && Array.isArray(intent.steps)) {
            let lastResult;
            for (const step of intent.steps) {
                lastResult = await this.route(step);
                if (lastResult === false) break;
            }
            return lastResult;
        }

        const resolvedPayload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        
        if (handler) {
            try {
                const result = await handler(resolvedPayload);
                if (intent.var && result !== undefined) {
                    this.variableCache.set(intent.var, result);
                }
                return result;
            } catch (error) {
                window.toast(`Error: ${error.message}`, 5000);
                return false;
            }
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
            description: 'Run Leion Intent JSON',
            exec: async () => {
                const intentStr = await acode.prompt('Intent JSON', '', 'textarea');
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
        window.toast('Leion Cockpit Ready', 2000);
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
 * Leion Roots - Intent Router for Acode
 * Orchestration Layer for Android Mobile Development
 */

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
        if (typeof payload !== 'object') return payload;

        let str = JSON.stringify(payload);
        str = str.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const val = this.variableCache.get(key.trim());
            return val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : val) : match;
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

        // --- GIT ---
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

        this.registerCapability({
            intent: 'git.pull',
            handler: async () => this.route({ intent: 'terminal.exec', payload: { command: 'git pull' } })
        });

        // --- GITHUB (via gh CLI) ---
        this.registerCapability({
            intent: 'github.openPr',
            handler: async (payload) => this.route({ intent: 'terminal.exec', payload: { command: `gh pr create --title "${payload.title}" --body "${payload.body || ''}" --base ${payload.base} --head ${payload.head}` } })
        });

        this.registerCapability({
            intent: 'github.prChecks',
            handler: async (payload) => this.route({ intent: 'terminal.exec', payload: { command: `gh pr checks ${payload.number || ''}` } })
        });

        // --- DOCKER ---
        this.registerCapability({
            intent: 'docker.build',
            handler: async (payload) => this.route({ intent: 'terminal.exec', payload: { command: `docker build -t ${payload.tag} ${payload.path || '.'}` } })
        });

        this.registerCapability({
            intent: 'docker.run',
            handler: async (payload) => this.route({ intent: 'terminal.exec', payload: { command: `docker run ${payload.detach ? '-d' : ''} ${payload.image}` } })
        });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                window.toast('AI Generating...', 2000);
                // Placeholder for actual AI integration (e.g. Gemini API)
                return "AI Response for: " + payload.instruction;
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

 * Leion Roots - Intent Router for Acode
 * Orchestration Layer for Android Mobile Development
 */

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
                return "AI Response Simulation for: " + payload.instruction;
            }
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

/**
 * Leion Roots - Intent Router for Acode
 * Orchestration layer for human-centric automation on mobile.
 */

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
        // Match {{variableName}}
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

        this.registerCapability({
            intent: 'ui.prompt',
            handler: async (payload) => {
                const res = await acode.prompt(payload.title, payload.defaultValue || '', payload.type || 'text');
                if (payload.var) this.variableCache.set(payload.var, res);
                return res;
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
                const list = await fs.readdir(payload.path);
                if (payload.var) this.variableCache.set(payload.var, list);
                return list;
            }
        });

        this.registerCapability({
            intent: 'fs.exists',
            handler: async (payload) => {
                const exists = await fs.exists(payload.path);
                if (payload.var) this.variableCache.set(payload.var, exists);
                return exists;
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

        this.registerCapability({
            intent: 'editor.get_value',
            handler: async (payload) => {
                const val = editorManager.editor.getValue();
                if (payload.var) this.variableCache.set(payload.var, val);
                return val;
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
                        console.warn('Terminal API not found');
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
                    headers: payload.headers || { 'Content-Type': 'application/json' },
                    body: payload.body ? (typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)) : undefined
                });
                const text = await response.text();
                let data;
                try { data = JSON.parse(text); } catch(e) { data = text; }
                if (payload.var) this.variableCache.set(payload.var, data);
                return data;
            }
        });

        // --- GIT ---
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

        this.registerCapability({
            intent: 'git.pull',
            handler: async () => this.route({ intent: 'terminal.exec', payload: { command: 'git pull' } })
        });

        // --- GITHUB ---
        this.registerCapability({
            intent: 'github.openPr',
            handler: async (payload) => {
                const cmd = `gh pr create --title "${payload.title}" --body "${payload.body || ''}" --base ${payload.base} --head ${payload.head}`;
                return this.route({ intent: 'terminal.exec', payload: { command: cmd } });
            }
        });

        // --- AI (Generative) ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                window.toast('AI is thinking...', 2000);
                // Simple implementation using a generic AI endpoint if configured
                // Or fallback to a message
                const prompt = payload.instruction;
                if (payload.var) this.variableCache.set(payload.var, "AI Response for: " + prompt);
                return "AI Response for: " + prompt;
            }
        });
    }

    async route(intent) {
        console.log('[IntentRouter] Routing:', intent.intent);
        
        // Handle pipeline (steps)
        if (intent.steps && Array.isArray(intent.steps)) {
            let lastResult;
            for (const step of intent.steps) {
                lastResult = await this.route(step);
                if (lastResult === false) {
                    console.log('[IntentRouter] Pipeline stopped due to false result');
                    break;
                }
            }
            return lastResult;
        }

        // Resolve variables in payload
        const resolvedPayload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        
        if (handler) {
            try {
                const result = await handler(resolvedPayload);
                if (intent.var && result !== undefined) {
                    this.variableCache.set(intent.var, result);
                }
                return result;
            } catch (error) {
                window.toast(`Error in ${intent.intent}: ${error.message}`, 5000);
                return false;
            }
        } else {
            window.toast(`No capability found for: ${intent.intent}`, 3000);
            return false;
        }
    }
}

class LeionRootsPlugin {
    async init() {
        this.router = new IntentRouter();
        await this.router.init();

        // Add side button for the Cockpit
        acode.setSideButton({
            id: 'leion-roots-cockpit',
            icon: 'account_tree',
            name: 'Leion Cockpit',
            onclick: () => this.openCockpit()
        });

        // Register commands
        acode.addCommand({
            name: 'Leion: Run Intent',
            description: 'Execute a Leion Intent JSON payload',
            exec: async () => {
                const intentStr = await acode.prompt('Intent JSON', '', 'textarea');
                if (intentStr) {
                    try {
                        const intent = JSON.parse(intentStr);
                        await this.router.route(intent);
                    } catch (e) {
                        window.toast('Invalid JSON format', 3000);
                    }
                }
            }
        });

        acode.addCommand({
            name: 'Leion: Run Pipeline File',
            description: 'Run the current .intent.json file',
            exec: async () => {
                const { editor } = editorManager;
                const content = editor.getValue();
                try {
                    const pipeline = JSON.parse(content);
                    window.toast('Starting Pipeline...', 2000);
                    await this.router.route(pipeline);
                } catch (e) {
                    window.toast('Not a valid pipeline file', 3000);
                }
            }
        });
    }

    openCockpit() {
        // Here we would load the React/Vue webview-ui
        // For now, let's show a simple panel or a toast
        const $panel = document.createElement('div');
        $panel.style.padding = '10px';
        $panel.innerHTML = `
            <h3>Leion Cockpit</h3>
            <p>Status: Engine Ready</p>
            <button id="btn-test">Test Toast Intent</button>
        `;
        
        const sidePanel = acode.require('sidePanel'); // Assuming a sidePanel API or similar
        // Implementation of UI would go here
        window.toast('Cockpit UI coming soon...', 2000);
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
