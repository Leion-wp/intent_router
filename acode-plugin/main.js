/**
 * Leion Roots - Intent Router for Acode
 * Orchestration Layer for Android Mobile Development
 * Created by Dave Conco & Hall Of Codes Team
 */

class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
        this.cwd = '/';
    }

    async init() {
        console.log('[Leion Router] Initializing...');
        this.registerInternalProviders();
    }

    registerCapability(cap) {
        this.capabilities.set(cap.intent, cap.handler);
    }

    async resolveVariables(payload) {
        if (!payload) return payload;
        if (typeof payload !== 'object' && typeof payload !== 'string') return payload;

        let str = typeof payload === 'string' ? payload : JSON.stringify(payload);
        
        // Resolve {{var}}
        str = str.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const val = this.variableCache.get(key.trim());
            if (val === undefined) return match;
            return typeof val === 'object' ? JSON.stringify(val) : val;
        });

        // Resolve ${workspaceRoot} and ${cwd}
        const workspace = (window.addedFolder && window.addedFolder[0]) ? window.addedFolder[0].url : '/';
        str = str.replace(/\$\{workspaceRoot\}/g, workspace);
        str = str.replace(/\$\{cwd\}/g, this.cwd);

        try {
            return JSON.parse(str);
        } catch (e) {
            return str;
        }
    }

    registerInternalProviders() {
        const fs = acode.require('fs');

        // --- SYSTEM ---
        this.registerCapability({
            intent: 'system.pause',
            handler: async (p) => new Promise(r => acode.confirm('Leion Roots', p.message || 'Paused', res => r(res)))
        });
        this.registerCapability({
            intent: 'system.setVar',
            handler: async (p) => { this.variableCache.set(p.name, p.value); return true; }
        });
        this.registerCapability({
            intent: 'system.setCwd',
            handler: async (p) => { this.cwd = p.path; return true; }
        });
        this.registerCapability({
            intent: 'system.wait',
            handler: async (p) => new Promise(r => setTimeout(r, p.ms || 1000))
        });
        this.registerCapability({
            intent: 'system.form',
            handler: async (p) => {
                const results = {};
                for (const field of p.fields || []) {
                    const res = await acode.prompt(field.label || field.name, field.defaultValue || '', field.type || 'text');
                    results[field.name] = res;
                    if (field.var) this.variableCache.set(field.var, res);
                }
                return results;
            }
        });
        this.registerCapability({
            intent: 'system.subPipeline',
            handler: async (p) => {
                const content = await fs.readFile(p.path);
                const pipeline = JSON.parse(content);
                return await this.runPipeline(pipeline);
            }
        });
        this.registerCapability({
            intent: 'system.loop',
            handler: async (p) => {
                const iterations = p.iterations || 1;
                let lastRes;
                for (let i = 0; i < iterations; i++) {
                    this.variableCache.set(p.indexVar || 'i', i);
                    lastRes = await this.route({ steps: p.steps });
                }
                return lastRes;
            }
        });
        this.registerCapability({
            intent: 'system.switch',
            handler: async (p) => {
                const value = await this.resolveVariables(p.value);
                const caseStep = p.cases[value] || p.default;
                if (caseStep) return await this.route(caseStep);
                return null;
            }
        });

        // --- UI ---
        this.registerCapability({
            intent: 'ui.toast',
            handler: async (p) => { window.toast(p.message, 3000); return true; }
        });
        this.registerCapability({
            intent: 'ui.prompt',
            handler: async (p) => {
                const res = await acode.prompt(p.title || 'Input', p.defaultValue || '', p.type || 'text');
                if (p.var) this.variableCache.set(p.var, res);
                return res;
            }
        });
        this.registerCapability({
            intent: 'ui.select',
            handler: async (p) => {
                const res = await acode.select(p.title || 'Select', p.options);
                if (p.var) this.variableCache.set(p.var, res);
                return res;
            }
        });

        // --- FILE SYSTEM ---
        this.registerCapability({
            intent: 'fs.read',
            handler: async (p) => {
                const content = await fs.readFile(p.path);
                if (p.var) this.variableCache.set(p.var, content);
                return content;
            }
        });
        this.registerCapability({
            intent: 'fs.write',
            handler: async (p) => { await fs.writeFile(p.path, p.content); return true; }
        });
        this.registerCapability({
            intent: 'fs.list',
            handler: async (p) => {
                const list = await fs.readdir(p.path);
                if (p.var) this.variableCache.set(p.var, list);
                return list;
            }
        });
        this.registerCapability({
            intent: 'fs.exists',
            handler: async (p) => await fs.exists(p.path)
        });
        this.registerCapability({
            intent: 'fs.delete',
            handler: async (p) => { await fs.delete(p.path); return true; }
        });

        // --- EDITOR ---
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (p) => { editorManager.editor.insert(p.text); return true; }
        });
        this.registerCapability({
            intent: 'editor.get_value',
            handler: async (p) => {
                const val = editorManager.editor.getValue();
                if (p.var) this.variableCache.set(p.var, val);
                return val;
            }
        });
        this.registerCapability({
            intent: 'editor.set_value',
            handler: async (p) => { editorManager.editor.setValue(p.value); return true; }
        });
        this.registerCapability({
            intent: 'editor.open',
            handler: async (p) => { await acode.openFile(p.path); return true; }
        });

        // --- TERMINAL ---
        this.registerCapability({
            intent: 'terminal.exec',
            handler: async (p) => new Promise(r => {
                if (acode.exec) acode.exec(p.command, res => r(res));
                else { window.toast('Terminal not available', 3000); r(null); }
            })
        });

        // --- HTTP ---
        this.registerCapability({
            intent: 'http.request',
            handler: async (p) => {
                const res = await fetch(p.url, {
                    method: p.method || 'GET',
                    headers: p.headers || { 'Content-Type': 'application/json' },
                    body: p.body ? (typeof p.body === 'string' ? p.body : JSON.stringify(p.body)) : undefined
                });
                const text = await res.text();
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (p.var) this.variableCache.set(p.var, data);
                return data;
            }
        });

        // --- GIT & GITHUB ---
        const term = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: cmd } });
        this.registerCapability({ intent: 'git.status', handler: () => term('git status') });
        this.registerCapability({ intent: 'git.add', handler: (p) => term(`git add ${p.path || '.'}`) });
                        }
                    });
                    if (member.outputVar) this.variableCache.set(member.outputVar, lastResult);
                }
                return lastResult;
            }
        });

        // --- PIPELINE MANAGEMENT ---
        this.registerCapability({
            intent: 'pipeline.run',
            handler: async (p) => {
                const res = await fetch(p.url);
                const pipeline = await res.json();
                return await this.runPipeline(pipeline);
            }
        });

        this.registerCapability({ intent: 'git.push', handler: (p) => term(`git push ${p.remote || 'origin'} ${p.branch || 'main'}`) });
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => term(`gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => term(`gh pr checks ${p.url || p.number || ''}`)
        });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (p) => {
                const loader = acode.require('loader');
                if (loader) loader.show('AI Thinking...');
                try {
                    const res = await acode.prompt('AI Instruction', p.instruction, 'textarea');
                    if (p.var) this.variableCache.set(p.var, res);
                    return res;
                } finally {
                    if (loader) loader.hide();
                }
            }
        });

        this.registerCapability({
            intent: 'ai.team',
            handler: async (p) => {
                const { members = [] } = p;
                let lastResult = null;
                for (const member of members) {
                    window.toast(`Agent ${member.role || 'member'} working...`, 2000);
                    lastResult = await this.route({
                        intent: 'ai.generate',
                        payload: {
                            instruction: member.instruction || p.instruction,
                            role: member.role,
                            contextFiles: member.contextFiles || p.contextFiles
                        }
                    });
                    if (member.outputVar) this.variableCache.set(member.outputVar, lastResult);
                }
                return lastResult;
            }
        });

        // --- VSCODE COMPAT ---
        this.registerCapability({
            intent: 'vscode.runCommand',
            handler: async (p) => {
                if (p.commandId === 'editor.action.formatDocument') {
                    acode.exec('format');
                    return true;
                }
                return acode.exec(p.commandId);
            }
        });
        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (p) => {
                const confirmed = await new Promise(resolve => {
                    acode.confirm('Review Changes', `Apply changes to ${p.path}?\n\nPROPOSAL:\n${p.proposal.substring(0, 100)}...`, resolve);
                });
                if (confirmed) {
                    await fs.writeFile(p.path, p.proposal);
                    return true;
                }
                return false;
            }
        });

        // --- DOCKER ---
        this.registerCapability({ intent: 'docker.build', handler: (p) => term(`docker build -t ${p.tag} ${p.path || '.'}`) });
        this.registerCapability({ intent: 'docker.run', handler: (p) => term(`docker run ${p.detach ? '-d' : ''} ${p.image}`) });
    }

    async route(intent) {
        if (!intent) return false;
        if (intent.steps && Array.isArray(intent.steps)) {
            let res;
            for (const s of intent.steps) {
                res = await this.route(s);
                if (res === false) break;
            }
            return res;
        }

        const payload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            try {
                const res = await handler(payload);
                if (intent.var && res !== undefined) this.variableCache.set(intent.var, res);
                return res;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
    }

    async runPipeline(pipeline) {
        window.toast(`Starting: ${pipeline.name || 'Pipeline'}`, 2000);
        return await this.route({ steps: pipeline.steps });
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
            description: 'Run Intent JSON',
            exec: async () => {
                const str = await acode.prompt('Intent JSON', '', 'textarea');
                if (str) {
                    try { await this.router.route(JSON.parse(str)); }
                    catch (e) { window.toast('Invalid JSON', 3000); }
                }
            }
        });

        acode.addCommand({
            name: 'Leion: Run Pipeline File',
            description: 'Run .intent.json file',
            exec: () => this.runActiveFile()
        });
    }

    async runActiveFile() {
        const { editor } = editorManager;
        const content = editor.getValue();
        try {
            const pipeline = JSON.parse(content);
            await this.router.runPipeline(pipeline);
        } catch (e) {
            window.toast('Invalid pipeline JSON', 3000);
        }
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Status: <b>Active</b></p><hr/><p>Capabilities: <b>' + this.router.capabilities.size + '</b></p></div>');
            sidePanel.open();
        } else {
            window.toast('Leion Cockpit Ready', 2000);
        }
    }

    destroy() {
        acode.unSetSideButton('leion-roots-cockpit');
    }
}

if (window.acode) {
    const plugin = new LeionRootsPlugin();
    acode.define('leion.roots', {
        init: async () => await plugin.init(),
        destroy: () => plugin.destroy()
    });
}

            intent: 'fs.write',
            handler: async (p) => { await fs.writeFile(p.path, p.content); return true; }
        });
        this.registerCapability({
            intent: 'fs.list',
            handler: async (p) => {
                const list = await fs.readdir(p.path);
                if (p.var) this.variableCache.set(p.var, list);
                return list;
            }
        });
        this.registerCapability({
            intent: 'fs.exists',
            handler: async (p) => await fs.exists(p.path)
        });
        this.registerCapability({
            intent: 'fs.delete',
            handler: async (p) => { await fs.delete(p.path); return true; }
        });

        // --- EDITOR ---
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (p) => { editorManager.editor.insert(p.text); return true; }
        });
        this.registerCapability({
            intent: 'editor.get_value',
            handler: async (p) => {
                const val = editorManager.editor.getValue();
                if (p.var) this.variableCache.set(p.var, val);
                return val;
            }
        });
        this.registerCapability({
            intent: 'editor.set_value',
            handler: async (p) => { editorManager.editor.setValue(p.value); return true; }
        });
        this.registerCapability({
            intent: 'editor.open',
            handler: async (p) => { await acode.openFile(p.path); return true; }
        });

        // --- TERMINAL ---
        this.registerCapability({
            intent: 'terminal.exec',
            handler: async (p) => new Promise(r => {
                if (acode.exec) acode.exec(p.command, res => r(res));
                else { window.toast('Terminal not available', 3000); r(null); }
            })
        });

        // --- HTTP ---
        this.registerCapability({
            intent: 'http.request',
            handler: async (p) => {
                const res = await fetch(p.url, {
                    method: p.method || 'GET',
                    headers: p.headers || { 'Content-Type': 'application/json' },
                    body: p.body ? (typeof p.body === 'string' ? p.body : JSON.stringify(p.body)) : undefined
                });
                const text = await res.text();
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (p.var) this.variableCache.set(p.var, data);
                return data;
            }
        });

        // --- GIT & GITHUB ---
        const term = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: cmd } });
        this.registerCapability({ intent: 'git.status', handler: () => term('git status') });
        this.registerCapability({ intent: 'git.add', handler: (p) => term(`git add ${p.path || '.'}`) });
        this.registerCapability({ intent: 'git.commit', handler: (p) => term(`git commit -m "${p.message}"`) });
        this.registerCapability({ intent: 'git.push', handler: (p) => term(`git push ${p.remote || 'origin'} ${p.branch || 'main'}`) });
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => term(`gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => term(`gh pr checks ${p.url || p.number || ''}`)
        });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (p) => {
                const loader = acode.require('loader');
                if (loader) loader.show('AI Thinking...');
                try {
                    const res = await acode.prompt('AI Instruction', p.instruction, 'textarea');
                    if (p.var) this.variableCache.set(p.var, res);
                    return res;
                } finally {
                    if (loader) loader.hide();
                }
            }
        });

        this.registerCapability({
            intent: 'ai.team',
            handler: async (p) => {
                const { members = [] } = p;
                let lastResult = null;
                for (const member of members) {
                    window.toast(`Agent ${member.role || 'member'} working...`, 2000);
                    lastResult = await this.route({
                        intent: 'ai.generate',
                        payload: {
                            instruction: member.instruction || p.instruction,
                            role: member.role,
                            contextFiles: member.contextFiles || p.contextFiles
                        }
                    });
                    if (member.outputVar) this.variableCache.set(member.outputVar, lastResult);
                }
                return lastResult;
            }
        });

        // --- VSCODE COMPAT ---
        this.registerCapability({
            intent: 'vscode.runCommand',
            handler: async (p) => {
                if (p.commandId === 'editor.action.formatDocument') {
                    acode.exec('format');
                    return true;
                }
                return acode.exec(p.commandId);
            }
        });
        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (p) => {
                const confirmed = await new Promise(resolve => {
                    acode.confirm('Review Changes', `Apply changes to ${p.path}?\n\nPROPOSAL:\n${p.proposal.substring(0, 100)}...`, resolve);
                });
                if (confirmed) {
                    await fs.writeFile(p.path, p.proposal);
                    return true;
                }
                return false;
            }
        });

        // --- DOCKER ---
        this.registerCapability({ intent: 'docker.build', handler: (p) => term(`docker build -t ${p.tag} ${p.path || '.'}`) });
        this.registerCapability({ intent: 'docker.run', handler: (p) => term(`docker run ${p.detach ? '-d' : ''} ${p.image}`) });
    }

    async route(intent) {
        if (!intent) return false;
        if (intent.steps && Array.isArray(intent.steps)) {
            let res;
            for (const s of intent.steps) {
                res = await this.route(s);
                if (res === false) break;
            }
            return res;
        }

        const payload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            try {
                const res = await handler(payload);
                if (intent.var && res !== undefined) this.variableCache.set(intent.var, res);
                return res;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
    }

    async runPipeline(pipeline) {
        window.toast(`Starting: ${pipeline.name || 'Pipeline'}`, 2000);
        return await this.route({ steps: pipeline.steps });
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
            description: 'Run Intent JSON',
            exec: async () => {
                const str = await acode.prompt('Intent JSON', '', 'textarea');
                if (str) {
                    try { await this.router.route(JSON.parse(str)); }
                    catch (e) { window.toast('Invalid JSON', 3000); }
                }
            }
        });

        acode.addCommand({
            name: 'Leion: Run Pipeline File',
            description: 'Run .intent.json file',
            exec: () => this.runActiveFile()
        });
    }

    async runActiveFile() {
        const { editor } = editorManager;
        const content = editor.getValue();
        try {
            const pipeline = JSON.parse(content);
            await this.router.runPipeline(pipeline);
        } catch (e) {
            window.toast('Invalid pipeline JSON', 3000);
        }
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Status: <b>Active</b></p><hr/><p>Capabilities: <b>' + this.router.capabilities.size + '</b></p></div>');
            sidePanel.open();
        } else {
            window.toast('Leion Cockpit Ready', 2000);
        }
    }

    destroy() {
        acode.unSetSideButton('leion-roots-cockpit');
    }
}

if (window.acode) {
    const plugin = new LeionRootsPlugin();
    acode.define('leion.roots', {
        init: async () => await plugin.init(),
        destroy: () => plugin.destroy()
    });
}

 * Leion Roots - Intent Router for Acode
 * Orchestration Layer for Android Mobile Development
 * Created by Dave Conco & Hall Of Codes Team
 */

class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
        this.cwd = '/';
    }

    async init() {
        console.log('[Leion Router] Initializing...');
        this.registerInternalProviders();
    }

    registerCapability(cap) {
        this.capabilities.set(cap.intent, cap.handler);
    }

    async resolveVariables(payload) {
        if (!payload) return payload;
        if (typeof payload !== 'object' && typeof payload !== 'string') return payload;

        let str = typeof payload === 'string' ? payload : JSON.stringify(payload);
        
        // Resolve {{var}}
        str = str.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const val = this.variableCache.get(key.trim());
            if (val === undefined) return match;
            return typeof val === 'object' ? JSON.stringify(val) : val;
        });

        // Resolve ${workspaceRoot} and ${cwd}
        const workspace = (window.addedFolder && window.addedFolder[0]) ? window.addedFolder[0].url : '/';
        str = str.replace(/\$\{workspaceRoot\}/g, workspace);
        str = str.replace(/\$\{cwd\}/g, this.cwd);

        try {
            return JSON.parse(str);
        } catch (e) {
            return str;
        }
    }

    registerInternalProviders() {
        const fs = acode.require('fs');

        // --- SYSTEM ---
        this.registerCapability({
            intent: 'system.pause',
            handler: async (p) => new Promise(r => acode.confirm('Leion Roots', p.message || 'Paused', res => r(res)))
        });
        this.registerCapability({
            intent: 'system.setVar',
            handler: async (p) => { this.variableCache.set(p.name, p.value); return true; }
        });
        this.registerCapability({
            intent: 'system.setCwd',
            handler: async (p) => { this.cwd = p.path; return true; }
        });
        this.registerCapability({
            intent: 'system.wait',
            handler: async (p) => new Promise(r => setTimeout(r, p.ms || 1000))
        });

        // --- UI ---
        this.registerCapability({
            intent: 'ui.toast',
            handler: async (p) => { window.toast(p.message, 3000); return true; }
        });
        this.registerCapability({
            intent: 'ui.prompt',
            handler: async (p) => {
                const res = await acode.prompt(p.title || 'Input', p.defaultValue || '', p.type || 'text');
                if (p.var) this.variableCache.set(p.var, res);
                return res;
            }
        });
        this.registerCapability({
            intent: 'ui.select',
            handler: async (p) => {
                const res = await acode.select(p.title || 'Select', p.options);
                if (p.var) this.variableCache.set(p.var, res);
                return res;
            }
        });

        // --- FILE SYSTEM ---
        this.registerCapability({
            intent: 'fs.read',
            handler: async (p) => {
                const content = await fs.readFile(p.path);
                if (p.var) this.variableCache.set(p.var, content);
                return content;
            }
        });
        this.registerCapability({
            intent: 'fs.write',
            handler: async (p) => { await fs.writeFile(p.path, p.content); return true; }
        });
        this.registerCapability({
            intent: 'fs.list',
            handler: async (p) => {
                const list = await fs.readdir(p.path);
                if (p.var) this.variableCache.set(p.var, list);
                return list;
            }
        });
        this.registerCapability({
            intent: 'fs.exists',
            handler: async (p) => await fs.exists(p.path)
        });
        this.registerCapability({
            intent: 'fs.delete',
            handler: async (p) => { await fs.delete(p.path); return true; }
        });

        // --- EDITOR ---
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (p) => { editorManager.editor.insert(p.text); return true; }
        });
        this.registerCapability({
            intent: 'editor.get_value',
            handler: async (p) => {
                const val = editorManager.editor.getValue();
                if (p.var) this.variableCache.set(p.var, val);
                return val;
            }
        });
        this.registerCapability({
            intent: 'editor.set_value',
            handler: async (p) => { editorManager.editor.setValue(p.value); return true; }
        });
        this.registerCapability({
            intent: 'editor.open',
            handler: async (p) => { await acode.openFile(p.path); return true; }
        });

        // --- TERMINAL ---
        this.registerCapability({
            intent: 'terminal.exec',
            handler: async (p) => new Promise(r => {
                if (acode.exec) acode.exec(p.command, res => r(res));
                else { window.toast('Terminal not available', 3000); r(null); }
            })
        });

        // --- HTTP ---
        this.registerCapability({
            intent: 'http.request',
            handler: async (p) => {
                const res = await fetch(p.url, {
                    method: p.method || 'GET',
                    headers: p.headers || { 'Content-Type': 'application/json' },
                    body: p.body ? (typeof p.body === 'string' ? p.body : JSON.stringify(p.body)) : undefined
                });
                const text = await res.text();
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (p.var) this.variableCache.set(p.var, data);
                return data;
            }
        });

        // --- GIT & GITHUB ---
        const term = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: cmd } });
        this.registerCapability({ intent: 'git.status', handler: () => term('git status') });
        this.registerCapability({ intent: 'git.add', handler: (p) => term(`git add ${p.path || '.'}`) });
        this.registerCapability({ intent: 'git.commit', handler: (p) => term(`git commit -m "${p.message}"`) });
        this.registerCapability({ intent: 'git.push', handler: (p) => term(`git push ${p.remote || 'origin'} ${p.branch || 'main'}`) });
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => term(`gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => term(`gh pr checks ${p.url || p.number || ''}`)
        });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (p) => {
                const loader = acode.require('loader');
                if (loader) loader.show('AI Thinking...');
                try {
                    const res = await acode.prompt('AI Instruction', p.instruction, 'textarea');
                    if (p.var) this.variableCache.set(p.var, res);
                    return res;
                } finally {
                    if (loader) loader.hide();
                }
            }
        });

        this.registerCapability({
            intent: 'ai.team',
            handler: async (p) => {
                const { members = [] } = p;
                let lastResult = null;
                for (const member of members) {
                    window.toast(`Agent ${member.role || 'member'} working...`, 2000);
                    lastResult = await this.route({
                        intent: 'ai.generate',
                        payload: {
                            instruction: member.instruction || p.instruction,
                            role: member.role,
                            contextFiles: member.contextFiles || p.contextFiles
                        }
                    });
                    if (member.outputVar) this.variableCache.set(member.outputVar, lastResult);
                }
                return lastResult;
            }
        });

        // --- VSCODE COMPAT ---
        this.registerCapability({
            intent: 'vscode.runCommand',
            handler: async (p) => {
                if (p.commandId === 'editor.action.formatDocument') {
                    acode.exec('format');
                    return true;
                }
                return acode.exec(p.commandId);
            }
        });
        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (p) => {
                const confirmed = await new Promise(resolve => {
                    acode.confirm('Review Changes', `Apply changes to ${p.path}?\n\nPROPOSAL:\n${p.proposal.substring(0, 100)}...`, resolve);
                });
                if (confirmed) {
                    await fs.writeFile(p.path, p.proposal);
                    return true;
                }
                return false;
            }
        });

        // --- DOCKER ---
        this.registerCapability({ intent: 'docker.build', handler: (p) => term(`docker build -t ${p.tag} ${p.path || '.'}`) });
        this.registerCapability({ intent: 'docker.run', handler: (p) => term(`docker run ${p.detach ? '-d' : ''} ${p.image}`) });
    }

    async route(intent) {
        if (!intent) return false;
        if (intent.steps && Array.isArray(intent.steps)) {
            let res;
            for (const s of intent.steps) {
                res = await this.route(s);
                if (res === false) break;
            }
            return res;
        }

        const payload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            try {
                const res = await handler(payload);
                if (intent.var && res !== undefined) this.variableCache.set(intent.var, res);
                return res;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
    }

    async runPipeline(pipeline) {
        window.toast(`Starting: ${pipeline.name || 'Pipeline'}`, 2000);
        return await this.route({ steps: pipeline.steps });
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
            description: 'Run Intent JSON',
            exec: async () => {
                const str = await acode.prompt('Intent JSON', '', 'textarea');
                if (str) {
                    try { await this.router.route(JSON.parse(str)); }
                    catch (e) { window.toast('Invalid JSON', 3000); }
                }
            }
        });

        acode.addCommand({
            name: 'Leion: Run Pipeline File',
            description: 'Run .intent.json file',
            exec: () => this.runActiveFile()
        });
    }

    async runActiveFile() {
        const { editor } = editorManager;
        const content = editor.getValue();
        try {
            const pipeline = JSON.parse(content);
            await this.router.runPipeline(pipeline);
        } catch (e) {
            window.toast('Invalid pipeline JSON', 3000);
        }
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Status: <b>Active</b></p><hr/><p>Capabilities: <b>' + this.router.capabilities.size + '</b></p></div>');
            sidePanel.open();
        } else {
            window.toast('Leion Cockpit Ready', 2000);
        }
    }

    destroy() {
        acode.unSetSideButton('leion-roots-cockpit');
    }
}

if (window.acode) {
    const plugin = new LeionRootsPlugin();
    acode.define('leion.roots', {
        init: async () => await plugin.init(),
        destroy: () => plugin.destroy()
    });
}
            intent: 'fs.write',
        });
        this.registerCapability({
            intent: 'fs.list',
            handler: async (p) => {
                const list = await fs.readdir(p.path);
                if (p.var) this.variableCache.set(p.var, list);
                return list;
            }
        });
        this.registerCapability({
            intent: 'fs.exists',
            handler: async (p) => await fs.exists(p.path)
        });

        // --- EDITOR ---
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (p) => { editorManager.editor.insert(p.text); return true; }
        });
        this.registerCapability({
            intent: 'editor.get_value',
            handler: async (p) => {
                const val = editorManager.editor.getValue();
                if (p.var) this.variableCache.set(p.var, val);
                return val;
            }
        });
        this.registerCapability({
            intent: 'editor.open',
            handler: async (p) => { await acode.openFile(p.path); return true; }
        });

        // --- TERMINAL ---
        this.registerCapability({
            intent: 'terminal.exec',
            handler: async (p) => new Promise(r => {
                if (acode.exec) acode.exec(p.command, res => r(res));
                else { window.toast('Terminal not available', 3000); r(null); }
            })
        });

        // --- HTTP ---
        this.registerCapability({
            intent: 'http.request',
            handler: async (p) => {
                const res = await fetch(p.url, {
                    method: p.method || 'GET',
                    headers: p.headers || { 'Content-Type': 'application/json' },
                    body: p.body ? (typeof p.body === 'string' ? p.body : JSON.stringify(p.body)) : undefined
                });
                const text = await res.text();
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (p.var) this.variableCache.set(p.var, data);
                return data;
            }
        });

        // --- GIT & GITHUB (githubAdapter.ts equivalent) ---
        const term = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: cmd } });
        this.registerCapability({ intent: 'git.status', handler: () => term('git status') });
        this.registerCapability({ intent: 'git.commit', handler: (p) => term(`git commit -m "${p.message}"`) });
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => term(`gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => term(`gh pr checks ${p.url || p.number || ''}`)
        });

        // --- AI (aiAdapter.ts equivalent) ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (p) => {
                const loader = acode.require('loader');
                if (loader) loader.show('AI Thinking...');
                try {
                    // Integration with Acode AI or mock
                    const res = await acode.prompt('AI Instruction', p.instruction, 'textarea');
                    if (p.var) this.variableCache.set(p.var, res);
                    return res;
                } finally {
                    if (loader) loader.hide();
                }
            }
        });

        // --- VSCODE COMPAT (vscodeAdapter.ts equivalent) ---
        this.registerCapability({
            intent: 'vscode.runCommand',
            handler: async (p) => {
                if (p.commandId === 'editor.action.formatDocument') {
                    acode.exec('format');
                    return true;
                }
                return acode.exec(p.commandId);
            }
        });
        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (p) => {
                const confirmed = await new Promise(resolve => {
                    acode.confirm('Review Changes', `Apply changes to ${p.path}?\n\nPROPOSAL:\n${p.proposal.substring(0, 100)}...`, resolve);
                });
                if (confirmed) {
                    await fs.writeFile(p.path, p.proposal);
                    return true;
                }
                return false;
            }
        });

        // --- DOCKER (dockerAdapter.ts equivalent) ---
        const docker = (cmd) => term(`docker ${cmd}`);
        this.registerCapability({ intent: 'docker.build', handler: (p) => docker(`build -t ${p.tag} ${p.path || '.'}`) });
        this.registerCapability({ intent: 'docker.run', handler: (p) => docker(`run ${p.detach ? '-d' : ''} ${p.image}`) });
    }

    async route(intent) {
        if (!intent) return false;
        if (intent.steps && Array.isArray(intent.steps)) {
            let res;
            for (const s of intent.steps) {
                res = await this.route(s);
                if (res === false) break;
            }
            return res;
        }

        const payload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            try {
                const res = await handler(payload);
                if (intent.var && res !== undefined) this.variableCache.set(intent.var, res);
                return res;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
    }

    async runPipeline(pipeline) {
        window.toast(`Starting: ${pipeline.name || 'Pipeline'}`, 2000);
        return await this.route({ steps: pipeline.steps });
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
            description: 'Run Intent JSON',
            exec: async () => {
                const str = await acode.prompt('Intent JSON', '', 'textarea');
                if (str) {
                    try { await this.router.route(JSON.parse(str)); }
                    catch (e) { window.toast('Invalid JSON', 3000); }
                }
            }
        });

        acode.addCommand({
            name: 'Leion: Run Pipeline File',
            description: 'Run .intent.json file',
            exec: () => this.runActiveFile()
        });
    }

    async runActiveFile() {
        const { editor } = editorManager;
        const content = editor.getValue();
        try {
            const pipeline = JSON.parse(content);
            await this.router.runPipeline(pipeline);
        } catch (e) {
            window.toast('Invalid pipeline JSON', 3000);
        }
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Status: <b>Active</b></p><hr/><p>Capabilities: <b>' + this.router.capabilities.size + '</b></p></div>');
            sidePanel.open();
        } else {
            window.toast('Leion Cockpit Ready', 2000);
        }
    }

    destroy() {
        acode.unSetSideButton('leion-roots-cockpit');
    }
}

if (window.acode) {
    const plugin = new LeionRootsPlugin();
    acode.define('leion.roots', {
        init: async () => await plugin.init(),
        destroy: () => plugin.destroy()
    });
}
            intent: 'fs.write',
            handler: async (p) => { await fs.writeFile(p.path, p.content); return true; }
        });
        this.registerCapability({
            intent: 'fs.list',
            handler: async (p) => {
                const list = await fs.readdir(p.path);
                if (p.var) this.variableCache.set(p.var, list);
                return list;
            }
        });
        this.registerCapability({
            intent: 'fs.exists',
            handler: async (p) => await fs.exists(p.path)
        });

        // --- EDITOR ---
        this.registerCapability({
            intent: 'editor.insert',
            handler: async (p) => { editorManager.editor.insert(p.text); return true; }
        });
        this.registerCapability({
            intent: 'editor.get_value',
            handler: async (p) => {
                const val = editorManager.editor.getValue();
                if (p.var) this.variableCache.set(p.var, val);
                return val;
            }
        });
        this.registerCapability({
            intent: 'editor.open',
            handler: async (p) => { await acode.openFile(p.path); return true; }
        });

        // --- TERMINAL ---
        this.registerCapability({
            intent: 'terminal.exec',
            handler: async (p) => new Promise(r => {
                if (acode.exec) acode.exec(p.command, res => r(res));
                else { window.toast('Terminal not available', 3000); r(null); }
            })
        });

        // --- HTTP ---
        this.registerCapability({
            intent: 'http.request',
            handler: async (p) => {
                const res = await fetch(p.url, {
                    method: p.method || 'GET',
                    headers: p.headers || { 'Content-Type': 'application/json' },
                    body: p.body ? (typeof p.body === 'string' ? p.body : JSON.stringify(p.body)) : undefined
                });
                const text = await res.text();
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (p.var) this.variableCache.set(p.var, data);
                return data;
            }
        });

        // --- GIT & GITHUB (githubAdapter.ts equivalent) ---
        const term = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: cmd } });
        this.registerCapability({ intent: 'git.status', handler: () => term('git status') });
        this.registerCapability({ intent: 'git.commit', handler: (p) => term(`git commit -m "${p.message}"`) });
        this.registerCapability({ 
            intent: 'github.openPr', 
            handler: (p) => term(`gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`) 
        });

        // --- AI (aiAdapter.ts equivalent) ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (p) => {
                const loader = acode.require('loader');
                if (loader) loader.show('AI Thinking...');
                try {
                    // Fallback to prompt for now, or mock
                    const res = await acode.prompt('AI Instruction', p.instruction, 'textarea');
                    if (p.var) this.variableCache.set(p.var, res);
                    return res;
                } finally {
                    if (loader) loader.hide();
                }
            }
        });

        this.registerCapability({
            intent: 'ai.team',
            handler: async (p) => {
                const { members = [] } = p;
                let lastResult = null;
                for (const member of members) {
                    window.toast(`Agent ${member.role || 'member'} working...`, 2000);
                    lastResult = await this.route({
                        intent: 'ai.generate',
                        payload: {
                            instruction: member.instruction || p.instruction,
                            role: member.role,
                            contextFiles: member.contextFiles || p.contextFiles
                        }
                    });
                    if (member.outputVar) this.variableCache.set(member.outputVar, lastResult);
                }
                return lastResult;
            }
        });

        // --- VSCODE COMPAT (vscodeAdapter.ts equivalent) ---
        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (p) => {
                const confirmed = await new Promise(resolve => {
                    acode.confirm('Review Changes', `Apply changes to ${p.path}?\n\nPROPOSAL:\n${p.proposal.substring(0, 100)}...`, resolve);
                });
                if (confirmed) {
                    await fs.writeFile(p.path, p.proposal);
                    return true;
                }
                return false;
            }
        });

        this.registerCapability({
            intent: 'vscode.runCommand',
            handler: async (p) => {
                if (p.commandId === 'editor.action.formatDocument') {
                    acode.exec('format');
                    return true;
                }
                return acode.exec(p.commandId);
            }
        });

        // --- DOCKER (dockerAdapter.ts equivalent) ---
        const docker = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `docker ${cmd}` } });
        this.registerCapability({ intent: 'docker.ps', handler: () => docker('ps') });
        this.registerCapability({ intent: 'docker.build', handler: (p) => docker(`build -t ${p.tag} ${p.path || '.'}`) });
        this.registerCapability({ intent: 'docker.run', handler: (p) => docker(`run ${p.detach ? '-d' : ''} ${p.image}`) });
    }

    async route(intent) {
        if (!intent) return false;
        if (intent.steps && Array.isArray(intent.steps)) {
            let res;
            for (const s of intent.steps) {
                res = await this.route(s);
                if (res === false) break;
            }
            return res;
        }

        const payload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            try {
                const res = await handler(payload);
                if (intent.var && res !== undefined) this.variableCache.set(intent.var, res);
                return res;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
    }

    async runPipeline(pipeline) {
        window.toast(`Starting: ${pipeline.name || 'Pipeline'}`, 2000);
        return await this.route({ steps: pipeline.steps });
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
            description: 'Run Intent JSON',
            exec: async () => {
                const str = await acode.prompt('Intent JSON', '', 'textarea');
                if (str) {
                    try { await this.router.route(JSON.parse(str)); }
                    catch (e) { window.toast('Invalid JSON', 3000); }
                }
            }
        });

        acode.addCommand({
            name: 'Leion: Run Pipeline File',
            description: 'Run .intent.json file',
            exec: () => this.runActiveFile()
        });
    }

    async runActiveFile() {
        const { editor } = editorManager;
        const content = editor.getValue();
        try {
            const pipeline = JSON.parse(content);
            await this.router.runPipeline(pipeline);
        } catch (e) {
            window.toast('Invalid pipeline JSON', 3000);
        }
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Status: <b>Active</b></p><hr/><p>Capabilities: <b>' + this.router.capabilities.size + '</b></p></div>');
            sidePanel.open();
        } else {
            window.toast('Leion Cockpit Ready', 2000);
        }
    }

    destroy() {
        acode.unSetSideButton('leion-roots-cockpit');
    }
}

if (window.acode) {
    const plugin = new LeionRootsPlugin();
    acode.define('leion.roots', {
        init: async () => await plugin.init(),
        destroy: () => plugin.destroy()
    });
}
