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

        // --- GIT & GITHUB ---
        const term = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: cmd } });
        this.registerCapability({ intent: 'git.status', handler: () => term('git status') });
        this.registerCapability({ intent: 'git.commit', handler: (p) => term(`git commit -m "${p.message}"`) });
        this.registerCapability({ intent: 'github.openPr', handler: (p) => term(`gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`) });

        // --- AI ---
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

        // --- VSCODE COMPAT ---
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
    }

    async route(intent) {
        if (!intent) return false;
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
        let str = JSON.stringify(payload);
        
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
            intent: 'system.notification',
            handler: async (p) => {
                if (window.Notification && Notification.permission === "granted") {
                    new Notification(p.title, { body: p.message });
                } else {
                    window.toast(`${p.title}: ${p.message}`, 4000);
                }
                return true;
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
                const res = await acode.prompt(p.title, p.defaultValue || '', p.type || 'text');
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

        // --- GIT & GITHUB ---
        const term = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: cmd } });
        this.registerCapability({ intent: 'git.status', handler: () => term('git status') });
        this.registerCapability({ intent: 'git.commit', handler: (p) => term(`git commit -m "${p.message}"`) });
        this.registerCapability({ intent: 'github.openPr', handler: (p) => term(`gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`) });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (p) => {
                window.toast('AI Thinking...', 2000);
                const res = "[AI Result] for: " + p.instruction; // Mock
                if (p.var) this.variableCache.set(p.var, res);
                return res;
            }
        });
    }

    async route(intent) {
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
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Status: <b>Active</b></p></div>');
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

101:         });
102: 
103:         this.registerCapability({
104:             intent: 'fs.write',
105:             handler: async (payload) => {
106:                 await fs.writeFile(payload.path, payload.content);
107:                 return true;
108:             }
109:         });
110: 
111:         this.registerCapability({
112:             intent: 'fs.list',
113:             handler: async (payload) => {
114:                 const list = await fs.readdir(payload.path);
115:                 if (payload.var) this.variableCache.set(payload.var, list);
116:                 return list;
117:             }
118:         });
119: 
120:         this.registerCapability({
121:             intent: 'fs.exists',
122:             handler: async (payload) => {
123:                 return await fs.exists(payload.path);
124:             }
125:         });
126: 
127:         // --- EDITOR ---
128:         this.registerCapability({
129:             intent: 'editor.insert',
130:             handler: async (payload) => {
131:                 editorManager.editor.insert(payload.text);
132:                 return true;
133:             }
134:         });
135: 
136:         this.registerCapability({
137:             intent: 'editor.get_value',
138:             handler: async (payload) => {
139:                 const val = editorManager.editor.getValue();
140:                 if (payload.var) this.variableCache.set(payload.var, val);
141:                 return val;
142:             }
143:         });
144: 
145:         // --- TERMINAL ---
146:         this.registerCapability({
147:             intent: 'terminal.exec',
148:             handler: async (payload) => {
149:                 return new Promise((resolve) => {
150:                     if (window.acode && acode.exec) {
151:                         acode.exec(payload.command, (res) => resolve(res));
152:                     } else {
153:                         window.toast('Terminal API not found', 3000);
154:                         resolve(null);
155:                     }
156:                 });
157:             }
158:         });
159: 
160:         // --- HTTP ---
161:         this.registerCapability({
162:             intent: 'http.request',
163:             handler: async (payload) => {
164:                 const response = await fetch(payload.url, {
165:                     method: payload.method || 'GET',
166:                     headers: payload.headers || { 'Content-Type': 'application/json' },
167:                     body: payload.body ? (typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)) : undefined
168:                 });
169:                 const text = await response.text();
170:                 let data; try { data = JSON.parse(text); } catch(e) { data = text; }
171:                 if (payload.var) this.variableCache.set(payload.var, data);
172:                 return data;
173:             }
174:         });
175: 
176:         // --- GIT ---
177:         const git = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `git ${cmd}` } });
178:         this.registerCapability({ intent: 'git.status', handler: () => git('status') });
179:         this.registerCapability({ intent: 'git.push', handler: () => git('push') });
180:         this.registerCapability({ intent: 'git.pull', handler: () => git('pull') });
181:         this.registerCapability({ intent: 'git.commit', handler: (p) => git(`commit -m "${p.message}"`) });
182:         this.registerCapability({ intent: 'git.add', handler: (p) => git(`add ${p.path || '.'}`) });
183: 
184:         // --- GITHUB ---
185:         const gh = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `gh ${cmd}` } });
186:         this.registerCapability({
187:             intent: 'github.openPr',
188:             handler: (p) => gh(`pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
189:         });
190:         this.registerCapability({
191:             intent: 'github.prChecks',
192:             handler: (p) => gh(`pr checks ${p.number || ''}`)
193:         });
194: 
195:         // --- DOCKER ---
196:         const docker = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `docker ${cmd}` } });
197:         this.registerCapability({ intent: 'docker.ps', handler: () => docker('ps') });
198:         this.registerCapability({ intent: 'docker.run', handler: (p) => docker(`run ${p.detach ? '-d' : ''} ${p.image}`) });
199: 
200:         // --- AI ---
201:         this.registerCapability({
202:             intent: 'ai.generate',
203:             handler: async (payload) => {
204:                 window.toast('AI thinking...', 2000);
205:                 const res = "[AI Simulation] Response for: " + payload.instruction;
206:                 if (payload.var) this.variableCache.set(payload.var, res);
207:                 return res;
208:             }
209:         });
210: 
211:         // --- VSCODE COMPAT ---
212:         this.registerCapability({
213:             intent: 'vscode.reviewDiff',
214:             handler: async (p) => {
215:                 const confirmed = await new Promise(resolve => {
216:                     acode.confirm('Review Changes', `Apply changes to ${p.path}?\n\nPROPOSAL:\n${p.proposal.substring(0, 100)}...`, resolve);
217:                 });
218:                 if (confirmed) {
219:                     await fs.writeFile(p.path, p.proposal);
220:                     return true;
221:                 }
222:                 return false;
223:             }
224:         });
225:     }
226: 
227:     async route(intent) {
228:         if (intent.steps && Array.isArray(intent.steps)) {
229:             let lastResult;
230:             for (const step of intent.steps) {
231:                 lastResult = await this.route(step);
232:                 if (lastResult === false) break;
233:             }
234:             return lastResult;
235:         }
236: 
237:         const resolvedPayload = await this.resolveVariables(intent.payload);
238:         const handler = this.capabilities.get(intent.intent);
239:         
240:         if (handler) {
241:             try {
242:                 const result = await handler(resolvedPayload);
243:                 if (intent.var && result !== undefined) this.variableCache.set(intent.var, result);
244:                 return result;
245:             } catch (e) {
246:                 window.toast(`Error: ${e.message}`, 5000);
247:                 return false;
248:             }
249:         }
250:         window.toast(`Unknown intent: ${intent.intent}`, 3000);
251:         return false;
252:     }
253: }
254: 
255: class LeionRootsPlugin {
256:     async init() {
257:         this.router = new IntentRouter();
258:         await this.router.init();
259: 
260:         acode.setSideButton({
261:             id: 'leion-roots-cockpit',
262:             icon: 'account_tree',
263:             name: 'Leion Cockpit',
264:             onclick: () => this.openCockpit()
265:         });
266: 
267:         acode.addCommand({
268:             name: 'Leion: Run Intent',
269:             description: 'Run Intent JSON',
270:             exec: async () => {
271:                 const str = await acode.prompt('Intent JSON', '', 'textarea');
272:                 if (str) {
273:                     try { await this.router.route(JSON.parse(str)); }
274:                     catch (e) { window.toast('Invalid JSON', 3000); }
275:                 }
276:             }
277:         });
278:     }
279: 
280:     openCockpit() {
281:         const sidePanel = acode.require('sidePanel');
282:         if (sidePanel) {
283:             sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Engine: <b>Active</b></p><hr/><p>Ready to orchestrate.</p></div>');
284:             sidePanel.open();
285:         } else {
286:             window.toast('Leion Cockpit Ready', 2000);
287:         }
288:     }
289: 
290:     async destroy() {
291:         acode.unSetSideButton('leion-roots-cockpit');
292:     }
293: }
294: 
295: if (window.acode) {
296:     const plugin = new LeionRootsPlugin();
297:     acode.define('leion.roots', {
298:         init: async () => await plugin.init(),
299:         destroy: () => plugin.destroy()
300:     });
301: }

 * Leion Roots - Intent Router for Acode
 * Orchestration layer for human-centric automation on mobile.
 */

class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
        this.cwd = '/';
    }

    async init() {
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
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Leion Roots', payload.message || 'Pause for human validation', (res) => resolve(res));
                });
            }
        });

        this.registerCapability({
            intent: 'system.setVar',
            handler: async (payload) => {
                this.variableCache.set(payload.name, payload.value);
                return true;
            }
        });

        this.registerCapability({
            intent: 'system.setCwd',
            handler: async (payload) => {
                this.cwd = payload.path;
                return true;
            }
        });

        this.registerCapability({
            intent: 'system.wait',
            handler: async (payload) => {
                await new Promise(r => setTimeout(r, payload.ms || 1000));
                return true;
            }
        });

        this.registerCapability({
            intent: 'system.notification',
            handler: async (payload) => {
                if (window.Notification && Notification.permission === "granted") {
                    new Notification(payload.title, { body: payload.message });
                } else {
                    window.toast(`${payload.title}: ${payload.message}`, 4000);
                }
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

        this.registerCapability({
            intent: 'ui.alert',
            handler: async (payload) => {
                await acode.alert(payload.title || 'Leion', payload.message);
                return true;
            }
        });

        this.registerCapability({
            intent: 'ui.confirm',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm(payload.title || 'Leion', payload.message, (res) => resolve(res));
                });
            }
        });

        this.registerCapability({
            intent: 'ui.prompt',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.prompt(payload.message, payload.defaultValue || '', payload.type || 'text', (res) => resolve(res));
                });
            }
        });

        this.registerCapability({
            intent: 'ui.select',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.select(payload.title || 'Select', payload.options, (res) => resolve(res));
                });
            }
        });

        // --- FS (File System) ---
        this.registerCapability({
            intent: 'fs.read',
            handler: async (payload) => {
                const content = await fs(payload.path).readFile('utf-8');
                if (payload.outputVar) this.variableCache.set(payload.outputVar, content);
                return content;
            }
        });

        this.registerCapability({
            intent: 'fs.write',
            handler: async (payload) => {
                await fs(payload.path).writeFile(payload.content);
                return true;
            }
        });

        this.registerCapability({
            intent: 'fs.exists',
            handler: async (payload) => {
                return await fs(payload.path).exists();
            }
        });

        this.registerCapability({
            intent: 'fs.list',
            handler: async (payload) => {
                const list = await fs(payload.path).lsDir();
                return list;
            }
        });

        this.registerCapability({
            intent: 'fs.mkdir',
            handler: async (payload) => {
                await fs(payload.path).mkdir();
                return true;
            }
        });

        this.registerCapability({
            intent: 'fs.delete',
            handler: async (payload) => {
                await fs(payload.path).delete();
                return true;
            }
        });

        // --- TERMINAL / EXEC ---
        this.registerCapability({
            intent: 'terminal.exec',
            handler: async (payload) => {
                if (typeof acode.exec === 'function') {
                    const result = await acode.exec(payload.command);
                    if (payload.outputVar) this.variableCache.set(payload.outputVar, result);
                    return result;
                } else {
                    window.toast('Terminal API not available', 4000);
                    return null;
                }
            }
        });

        // --- GIT ---
        this.registerCapability({
            intent: 'git.status',
            handler: async (payload) => {
                const res = await acode.exec(`git -C ${payload.cwd || this.cwd} status`);
                return res;
            }
        });

        this.registerCapability({
            intent: 'git.commit',
            handler: async (payload) => {
                await acode.exec(`git -C ${payload.cwd || this.cwd} add .`);
                const res = await acode.exec(`git -C ${payload.cwd || this.cwd} commit -m "${payload.message}"`);
                return res;
            }
        });

        this.registerCapability({
            intent: 'git.push',
            handler: async (payload) => {
                const res = await acode.exec(`git -C ${payload.cwd || this.cwd} push ${payload.remote || 'origin'} ${payload.branch || 'main'}`);
                return res;
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
                if (payload.outputVar) this.variableCache.set(payload.outputVar, data);
                return data;
            }
        });

        // --- AI (Acode Implementation) ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                // On Android/Acode, we might want to use a specific AI plugin if available
                // or fall back to a configured API endpoint.
                window.toast(`AI generating: ${payload.instruction.substring(0, 30)}...`, 2000);
                
                // Fallback: Using a mock for now, or calling a hosted Leion AI bridge
                const response = await fetch('https://api.leion.io/v1/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: payload.instruction,
                        context: payload.contextFiles,
                        model: payload.model || 'gemini-1.5-flash'
                    })
                }).then(r => r.json()).catch(() => ({ error: 'AI Bridge unavailable' }));

                if (payload.outputVar) this.variableCache.set(payload.outputVar, response.content);
                return response;
            }
        });

        // --- GITHUB (Acode Implementation via gh CLI if available) ---
        this.registerCapability({
            intent: 'github.openPr',
            handler: async (payload) => {
                const cmd = `gh pr create --title "${payload.title}" --body "${payload.body || ''}" --base ${payload.base} --head ${payload.head}`;
                return await acode.exec(cmd);
            }
        });

        // --- VSCODE / ACODE COMMANDS ---
        this.registerCapability({
            intent: 'vscode.runCommand',
            handler: async (payload) => {
                // Map VSCode commands to Acode commands where possible
                if (payload.commandId === 'editor.action.formatDocument') {
                    return acode.exec('format');
                }
                // Generic execution of Acode commands
                return acode.exec(payload.commandId);
            }
        });

        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (payload) => {
                // Acode doesn't have a native diff view API like VSCode's side-by-side
                // We'll show a confirm dialog with the proposed change
                return new Promise((resolve) => {
                    acode.confirm('Review Change', `Apply changes to ${payload.path}?`, (res) => {
                        if (res) {
                            fs(payload.path).writeFile(payload.proposal).then(() => resolve(true));
                        } else {
                            resolve(false);
                        }
                    });
                });
            }
        });
    }

    async runPipeline(pipeline) {
        window.toast(`Running pipeline: ${pipeline.name || 'Unnamed'}`, 3000);
        const steps = pipeline.steps || [];
        
        for (const step of steps) {
            const resolvedPayload = await this.resolveVariables(step.payload);
            const handler = this.capabilities.get(step.intent);
            
            if (handler) {
                try {
                    const result = await handler(resolvedPayload);
                    console.log(`Step ${step.intent} finished:`, result);
                } catch (err) {
                    window.toast(`Error in ${step.intent}: ${err.message}`, 5000);
                    if (step.onFailure === 'stop') break;
                }
            } else {
                window.toast(`Unknown intent: ${step.intent}`, 4000);
            }
        }
        window.toast('Pipeline finished.', 2000);
    }
}

class LeionPlugin {
    async init() {
        this.router = new IntentRouter();
        await this.router.init();

        const $btn = tag('span', {
            className: 'icon leion-cockpit',
            dataset: { action: 'leion-menu' },
            onclick: () => this.showMenu()
        });

        const $header = document.querySelector('header');
        if ($header) {
            $header.insertBefore($btn, $header.lastChild);
        }

        editorManager.editor.commands.addCommand({
            name: 'leion:run-pipeline',
            description: 'Leion: Run Pipeline File',
            bindKey: { win: 'Ctrl-Shift-P', mac: 'Command-Shift-P' },
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

    showMenu() {
        acode.select('Leion Cockpit', [
            ['run', 'Run Active Pipeline', 'play_arrow'],
            ['list', 'My Pipelines', 'list'],
            ['settings', 'Settings', 'settings']
        ], (res) => {
            if (res === 'run') this.runActiveFile();
        });
    }

    async destroy() {
        const $btn = document.querySelector('.leion-cockpit');
        if ($btn) $btn.remove();
    }
}

if (window.acode) {
    const leion = new LeionPlugin();
    acode.setPluginInit('com.leion.intent.router', (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
        leion.baseUrl = baseUrl;
        leion.init();
    });
    acode.setPluginUnmount('com.leion.intent.router', () => {
        leion.destroy();
    });
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

        this.registerCapability({
            intent: 'ui.select',
            handler: async (payload) => {
                const res = await acode.select(payload.title, payload.options);
                if (payload.var) this.variableCache.set(payload.var, res);
                return res;
            }
        });

        this.registerCapability({
            intent: 'ui.reviewDiff',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    const content = `
                        <div style="display:flex; flex-direction:column; height:100%;">
                            <div style="flex:1; overflow:auto; padding:10px; background:#1d1d1d; color:#fff; font-family:monospace; white-space:pre-wrap;">
                                ${payload.proposal}
                            </div>
                            <div style="padding:10px; border-top:1px solid #444; display:flex; justify-content:flex-end; gap:10px;">
                                <button id="leion-diff-cancel" style="padding:8px 16px; background:#444; color:white; border:none; border-radius:4px;">Reject</button>
                                <button id="leion-diff-apply" style="padding:8px 16px; background:#4caf50; color:white; border:none; border-radius:4px;">Apply Change</button>
                            </div>
                        </div>
                    `;
                    const dialog = acode.require('box')(payload.title || 'Review Changes', content);
                    dialog.onhide = () => resolve(false);
                    
                    const $apply = dialog.querySelector('#leion-diff-apply');
                    const $cancel = dialog.querySelector('#leion-diff-cancel');
                    
                    $apply.onclick = () => {
                        dialog.hide();
                        resolve(true);
                    };
                    $cancel.onclick = () => {
                        dialog.hide();
                        resolve(false);
                    };
                });
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
                return await fs.exists(payload.path);
            }
        });

        this.registerCapability({
            intent: 'fs.delete',
            handler: async (payload) => {
                await fs.delete(payload.path);
                return true;
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

        this.registerCapability({
            intent: 'editor.open',
            handler: async (payload) => {
                await acode.openFile(payload.path);
                return true;
            }
        });

        this.registerCapability({
            intent: 'editor.close',
            handler: async (payload) => {
                const file = editorManager.getFile(payload.path || editorManager.activeFile.uri);
                if (file) file.close();
                return true;
            }
        });

        // --- TERMINAL ---
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
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (payload.var) this.variableCache.set(payload.var, data);
                return data;
            }
        });

        // --- GIT ---
        const git = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `git ${cmd}` } });
        this.registerCapability({ intent: 'git.status', handler: () => git('status') });
        this.registerCapability({ intent: 'git.push', handler: () => git('push') });
        this.registerCapability({ intent: 'git.pull', handler: () => git('pull') });
        this.registerCapability({ intent: 'git.add', handler: (p) => git(`add ${p.path || '.'}`) });
        this.registerCapability({ intent: 'git.commit', handler: (p) => git(`commit -m "${p.message}"`) });
        this.registerCapability({ intent: 'git.checkout', handler: (p) => git(`checkout ${p.branch}`) });
        this.registerCapability({ intent: 'git.branch', handler: (p) => git(`branch ${p.args || ''}`) });

        // --- GITHUB ---
        const gh = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `gh ${cmd}` } });
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => gh(`pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => gh(`pr checks ${p.number || ''}`)
        });
        this.registerCapability({
            intent: 'github.prComment',
            handler: (p) => gh(`pr comment ${p.number} --body "${p.body}"`)
        });
        this.registerCapability({
            intent: 'github.prRerunFailedChecks',
            handler: (p) => gh(`pr rerun-failed ${p.number || ''}`)
        });
        this.registerCapability({
            intent: 'github.repoClone',
            handler: (p) => gh(`repo clone ${p.repo} ${p.path || ''}`)
        });
        this.registerCapability({
            intent: 'github.listIssues',
            handler: (p) => gh(`issue list --limit ${p.limit || 10}`)
        });

        // --- DOCKER ---
        const docker = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `docker ${cmd}` } });
        this.registerCapability({ intent: 'docker.ps', handler: (p) => docker(`ps ${p?.all ? '-a' : ''}`) });
        this.registerCapability({ intent: 'docker.build', handler: (p) => docker(`build -t ${p.tag} ${p.path || '.'}`) });
        this.registerCapability({ intent: 'docker.run', handler: (p) => docker(`run ${p.detach ? '-d' : ''} ${p.image}`) });
        this.registerCapability({ intent: 'docker.stop', handler: (p) => docker(`stop ${p.container}`) });
        this.registerCapability({ intent: 'docker.rm', handler: (p) => docker(`rm ${p.container}`) });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                const loader = acode.require('loader');
                if (loader) loader.show('AI is thinking...');
                try {
                    // Simulation/Mock for AI
                    await new Promise(r => setTimeout(r, 1500));
                    const res = `[AI Simulation] Result for: ${payload.instruction}`;
                    if (payload.var) this.variableCache.set(payload.var, res);
                    return res;
                } finally {
                    if (loader) loader.hide();
                }
            }
        });

        this.registerCapability({
            intent: 'ai.team',
            handler: async (payload) => {
                const { members = [] } = payload;
                let lastResult = null;
                for (const member of members) {
                    window.toast(`Agent ${member.role || 'member'} working...`, 2000);
                    lastResult = await this.route({
                        intent: 'ai.generate',
                        payload: {
                            instruction: member.instruction || payload.instruction,
                            role: member.role,
                            contextFiles: member.contextFiles || payload.contextFiles
                        }
                    });
                    if (member.outputVar) this.variableCache.set(member.outputVar, lastResult);
                }
                return lastResult;
            }
        });

        // --- ACODE / VSCODE BRIDGE ---
        this.registerCapability({
            intent: 'acode.runCommand',
            handler: async (payload) => {
                acode.exec(payload.command);
                return true;
            }
        });
        
        this.registerCapability({
            intent: 'vscode.runCommand',
            handler: async (payload) => this.route({ intent: 'acode.runCommand', payload: { command: payload.commandId } })
        });

        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (payload) => {
                const confirmed = await this.route({ intent: 'ui.reviewDiff', payload });
                if (confirmed) {
                    await fs.writeFile(payload.path, payload.proposal);
                    return true;
                }
                return false;
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

        const resolvedPayload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        
        if (handler) {
            try {
                const result = await handler(resolvedPayload);
                if (intent.var && result !== undefined) this.variableCache.set(intent.var, result);
                return result;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
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
            exec: async () => {
                const fs = acode.require('fs');
                const file = await acode.selectFile();
                if (file) {
                    const content = await fs.readFile(file);
                    try { await this.router.route(JSON.parse(content)); }
                    catch (e) { window.toast('Invalid Intent File', 3000); }
                }
            }
        });
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Engine: <b>Active</b></p><hr/><p>Capabilities: <b>' + this.router.capabilities.size + '</b></p></div>');
            sidePanel.open();
        } else {
            window.toast('Leion Cockpit Ready', 2000);
        }
    }

    async destroy() {
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
 * Orchestration layer for human-centric automation on mobile.
 */

class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
        this.cwd = '/';
    }

    async init() {
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
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Leion Roots', payload.message || 'Pause for human validation', (res) => resolve(res));
                });
            }
        });

        this.registerCapability({
            intent: 'system.setVar',
            handler: async (payload) => {
                this.variableCache.set(payload.name, payload.value);
                return true;
            }
        });

        this.registerCapability({
            intent: 'system.setCwd',
            handler: async (payload) => {
                this.cwd = payload.path;
                return true;
            }
        });

        this.registerCapability({
            intent: 'system.wait',
            handler: async (payload) => {
                await new Promise(r => setTimeout(r, payload.ms || 1000));
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

        this.registerCapability({
            intent: 'ui.prompt',
            handler: async (payload) => {
                const res = await acode.prompt(payload.title, payload.defaultValue || '', payload.type || 'text');
                if (payload.var) this.variableCache.set(payload.var, res);
                return res;
            }
        });

        this.registerCapability({
            intent: 'ui.select',
            handler: async (payload) => {
                const res = await acode.select(payload.title, payload.options);
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
                return await fs.exists(payload.path);
            }
        });

        this.registerCapability({
            intent: 'fs.delete',
            handler: async (payload) => {
                await fs.delete(payload.path);
                return true;
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

        this.registerCapability({
            intent: 'editor.open',
            handler: async (payload) => {
                await acode.openFile(payload.path);
                return true;
            }
        });

        // --- TERMINAL ---
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
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (payload.var) this.variableCache.set(payload.var, data);
                return data;
            }
        });

        // --- GIT ---
        const git = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `git ${cmd}` } });
        this.registerCapability({ intent: 'git.status', handler: () => git('status') });
        this.registerCapability({ intent: 'git.push', handler: () => git('push') });
        this.registerCapability({ intent: 'git.pull', handler: () => git('pull') });
        this.registerCapability({ intent: 'git.add', handler: (p) => git(`add ${p.path || '.'}`) });
        this.registerCapability({ intent: 'git.commit', handler: (p) => git(`commit -m "${p.message}"`) });
        this.registerCapability({ intent: 'git.checkout', handler: (p) => git(`checkout ${p.branch}`) });

        // --- GITHUB ---
        const gh = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `gh ${cmd}` } });
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => gh(`pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => gh(`pr checks ${p.number || ''}`)
        });
        this.registerCapability({
            intent: 'github.prComment',
            handler: (p) => gh(`pr comment ${p.number} --body "${p.body}"`)
        });
1002: 
1003:         // --- AI (Acode AI Bridge) ---
1004:         this.registerCapability({
1005:             intent: 'ai.generate',
1006:             handler: async (payload) => {
1007:                 // We try to use Acode's AI capabilities if available, or fallback to an HTTP API (e.g., Gemini)
1008:                 // For now, let's implement a prompt-based simulation or a direct API call if keys are provided
1009:                 const systemPrompt = payload.systemPrompt || "You are an AI assistant integrated into Acode editor.";
1010:                 const instruction = payload.instruction;
1011:                 
1012:                 window.toast("AI: Generating...", 2000);
1013:                 
1014:                 // Example using a generic HTTP endpoint (placeholder)
1015:                 // In a real scenario, this would use the user's configured provider
1016:                 try {
1017:                     const result = await this.route({
1018:                         intent: 'http.request',
1019:                         payload: {
1020:                             url: 'https://api.leion.io/v1/ai/generate', // Placeholder
1021:                             method: 'POST',
1022:                             body: { instruction, systemPrompt, model: payload.model || 'gemini' }
1023:                         }
1024:                     });
1025:                     if (payload.outputVar) this.variableCache.set(payload.outputVar, result);
1026:                     return result;
1027:                 } catch (e) {
1028:                     console.error("AI Generation failed", e);
1029:                     const manualInput = await acode.prompt("AI Error - Manual Input Required", "Paste AI response here");
1030:                     if (payload.outputVar) this.variableCache.set(payload.outputVar, manualInput);
1031:                     return manualInput;
1032:                 }
1033:             }
1034:         });
1035: 
1036:         // --- DOCKER (Mobile Limitation) ---
1037:         this.registerCapability({
1038:             intent: 'docker.run',
1039:             handler: async (payload) => {
1040:                 window.toast("Docker is not natively supported on Android. Attempting remote execution...", 5000);
1041:                 // This could be implemented via a remote SSH connection or a cloud builder
1042:                 return { error: "Native Docker not available on mobile", status: "failed" };
1043:             }
1044:         });
1045:     }
1046: 
1047:     async route(intentObj) {
1048:         const { intent, payload } = intentObj;
1049:         const handler = this.capabilities.get(intent);
1050:         
1051:         if (!handler) {
1052:             throw new Error(`Capability not found: ${intent}`);
1053:         }
1054: 
1055:         const resolvedPayload = await this.resolveVariables(payload);
1056:         console.log(`[Leion Router] Executing: ${intent}`, resolvedPayload);
1057:         
1058:         try {
1059:             return await handler(resolvedPayload);
1060:         } catch (error) {
1061:             console.error(`[Leion Router] Error in ${intent}:`, error);
1062:             throw error;
1063:         }
1064:     }
1065: 
1066:     async runPipeline(pipeline) {
1067:         const { name, steps } = pipeline;
1068:         window.toast(`Starting Pipeline: ${name}`, 2000);
1069:         
1070:         const results = [];
1071:         for (const step of steps) {
1072:             try {
1073:                 const result = await this.route(step);
1074:                 results.push({ step: step.intent, status: 'success', result });
1075:             } catch (error) {
1076:                 results.push({ step: step.intent, status: 'failed', error: error.message });
1077:                 const resume = await new Promise(resolve => {
1078:                     acode.confirm("Pipeline Error", `Step ${step.intent} failed: ${error.message}. Continue?`, (res) => resolve(res));
1079:                 });
1080:                 if (!resume) break;
1081:             }
1082:         }
1083:         
1084:         window.toast(`Pipeline Finished: ${name}`, 3000);
1085:         return results;
1086:     }
1087: }
1088: 
1089: class LeionRootsPlugin {
1090:     async init() {
1091:         this.router = new IntentRouter();
1092:         await this.router.init();
1093: 
1094:         this.addCommands();
1095:         this.addIcon();
1096:     }
1097: 
1098:     addCommands() {
1099:         editorManager.editor.commands.addCommand({
1100:             name: 'leion:run_pipeline',
1101:             description: 'Leion: Run Pipeline File',
1102:             exec: async () => {
1103:                 const file = await acode.fileBrowser('file', 'Select .intent.json');
1104:                 if (file) {
1105:                     const content = await acode.require('fs').readFile(file.url);
1106:                     const pipeline = JSON.parse(content);
1107:                     await this.router.runPipeline(pipeline);
1108:                 }
1109:             }
1110:         });
1111: 
1112:         editorManager.editor.commands.addCommand({
1113:             name: 'leion:cockpit',
1114:             description: 'Leion: Open Cockpit',
1115:             exec: () => this.openCockpit()
1116:         });
1117:     }
1118: 
1119:     addIcon() {
1120:         const $header = document.querySelector('header');
1121:         if (!$header) return;
1122: 
1123:         const $icon = document.createElement('span');
1124:         $icon.className = 'icon leion-roots-icon';
1125:         $icon.innerHTML = '&#xe900;'; // Replace with actual Leion icon font code if available
1126:         $icon.style.fontSize = '1.5rem';
1127:         $icon.onclick = () => this.openCockpit();
1128:         
1129:         $header.insertBefore($icon, $header.firstChild);
1130:     }
1131: 
1132:     openCockpit() {
1133:         const page = acode.require('page');
1134:         const cockpitPage = page('Leion Cockpit', () => {
1135:             console.log('Cockpit closed');
1136:         });
1137: 
1138:         cockpitPage.content = `
1139:             <div style="padding: 20px; color: white;">
1140:                 <h1>Leion Cockpit</h1>
1141:                 <p>Welcome to the mobile automation hub.</p>
1142:                 <div id="pipeline-list">
1143:                     <h3>Active Pipelines</h3>
1144:                     <ul>
1145:                         <li>No active pipelines</li>
1146:                     </ul>
1147:                 </div>
1148:                 <button class="btn" onclick="editorManager.editor.execCommand('leion:run_pipeline')">Run New Pipeline</button>
1149:             </div>
1150:         `;
1151:         
1152:         cockpitPage.show();
1153:     }
1154: 
1155:     async destroy() {
1156:         // Cleanup
1157:         const $icon = document.querySelector('.leion-roots-icon');
1158:         if ($icon) $icon.remove();
1159:     }
1160: }
1161: 
1162: if (window.acode) {
1163:     const leionPlugin = new LeionRootsPlugin();
1164:     acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
1165:         leionPlugin.baseUrl = baseUrl;
1166:         leionPlugin.init();
1167:     });
1168:     acode.setPluginUnmount('com.leion.roots', () => {
1169:         leionPlugin.destroy();
1170:     });
1171: }

        this.registerCapability({
            intent: 'github.repoClone',
            handler: (p) => gh(`repo clone ${p.repo} ${p.path || ''}`)
        });

        // --- DOCKER ---
        const docker = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `docker ${cmd}` } });
        this.registerCapability({ intent: 'docker.ps', handler: () => docker('ps') });
        this.registerCapability({ intent: 'docker.build', handler: (p) => docker(`build -t ${p.tag} ${p.path || '.'}`) });
        this.registerCapability({ intent: 'docker.run', handler: (p) => docker(`run ${p.detach ? '-d' : ''} ${p.image}`) });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                const loader = acode.require('loader');
                if (loader) loader.show('AI is thinking...');
                try {
                    // Integration with potential AI plugins or mock
                    await new Promise(r => setTimeout(r, 1000));
                    const res = `[AI] Content for: ${payload.instruction}`;
                    if (payload.var) this.variableCache.set(payload.var, res);
                    return res;
                } finally {
                    if (loader) loader.hide();
                }
            }
        });

        // --- VSCODE COMPAT (Acode Bridge) ---
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

        const resolvedPayload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        
        if (handler) {
            try {
                const result = await handler(resolvedPayload);
                if (intent.var && result !== undefined) this.variableCache.set(intent.var, result);
                return result;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
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
            exec: async () => {
                const fs = acode.require('fs');
                const file = await acode.selectFile();
                if (file) {
                    const content = await fs.readFile(file);
                    try { await this.router.route(JSON.parse(content)); }
                    catch (e) { window.toast('Invalid Intent File', 3000); }
                }
            }
        });
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots</h3><p>Engine: <b>Active</b></p><hr/><p>Ready to orchestrate.</p></div>');
            sidePanel.open();
        } else {
            window.toast('Leion Cockpit Ready', 2000);
        }
    }

    async destroy() {
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
 * Orchestration layer for human-centric automation on mobile.
 */

class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
        this.cwd = '/';
    }

    async init() {
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

        // Resolve ${workspaceRoot}
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
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Leion Roots', payload.message || 'Pause for human validation', (res) => resolve(res));
                });
            }
        });

        this.registerCapability({
            intent: 'system.setVar',
            handler: async (payload) => {
                this.variableCache.set(payload.name, payload.value);
                return true;
            }
        });

        this.registerCapability({
            intent: 'system.setCwd',
            handler: async (payload) => {
                this.cwd = payload.path;
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

        // --- GITHUB ---
        this.registerCapability({
            intent: 'github.openPr',
            handler: async (payload) => {
                const { head, base, title, body, cwd } = payload;
                const command = `gh pr create --head "${head}" --base "${base}" --title "${title}" --body "${body || ''}"`;
                return await this.capabilities.get('terminal.exec')({ command, cwd });
            }
        });

        this.registerCapability({
            intent: 'github.prChecks',
            handler: async (payload) => {
                const { url, cwd } = payload;
                const command = `gh pr checks ${url || ''}`;
                return await this.capabilities.get('terminal.exec')({ command, cwd });
            }
        });

        // --- AI (Acode AI equivalent) ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                const { instruction, contextFiles, model } = payload;
                // Check if an AI plugin is installed (like Acode AI)
                if (window.acodeAi) {
                    return await window.acodeAi.generate({ prompt: instruction, context: contextFiles, model });
                }
                
                // Fallback to a generic prompt if no AI plugin
                return new Promise((resolve) => {
                    acode.prompt('AI Instruction (No AI Plugin Found)', instruction, (res) => {
                        resolve(res);
                    });
                });
            }
        });

        // --- VSCODE / ACODE UI ---
        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (payload) => {
                const { path: filePath, proposal } = payload;
                const fs = acode.require('fs');
                const content = await fs(filePath).readFile('utf-8');
                
                return new Promise((resolve) => {
                    const sideBySide = `
                        <div style="display:flex; height:100%; overflow:auto;">
                            <div style="flex:1; border-right:1px solid #ccc; padding:10px;">
                                <h4>Current</h4>
                                <pre>${content}</pre>
                            </div>
                            <div style="flex:1; padding:10px;">
                                <h4>Proposal</h4>
                                <pre>${proposal}</pre>
                            </div>
                        </div>
                    `;
                    
                    const dialog = acode.confirm('Review Changes', sideBySide, (res) => {
                        resolve(res);
                    });
                });
            }
        });

        this.registerCapability({
            intent: 'vscode.runCommand',
            handler: async (payload) => {
                const { commandId, argsJson } = payload;
                const args = argsJson ? JSON.parse(argsJson) : [];
                // Map VSCode commands to Acode commands where possible
                if (commandId === 'editor.action.formatDocument') {
                    acode.exec('format');
                    return true;
                }
                return acode.exec(commandId, ...args);
            }
        });

                const list = await fs.readdir(payload.path);
                if (payload.var) this.variableCache.set(payload.var, list);
                return list;
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

        // --- TERMINAL ---
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
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (payload.var) this.variableCache.set(payload.var, data);
                return data;
            }
        });

        // --- GIT (via Terminal) ---
        const git = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `git ${cmd}` } });
        this.registerCapability({ intent: 'git.status', handler: () => git('status') });
        this.registerCapability({ intent: 'git.push', handler: () => git('push') });
        this.registerCapability({ intent: 'git.pull', handler: () => git('pull') });
        this.registerCapability({ intent: 'git.commit', handler: (p) => git(`commit -m "${p.message}"`) });
        this.registerCapability({ intent: 'git.checkout', handler: (p) => git(`checkout ${p.branch}`) });
        this.registerCapability({ intent: 'git.checkout', handler: (p) => git(`checkout ${p.branch}`) });
        this.registerCapability({ intent: 'git.add', handler: (p) => git(`add ${p.path || '.'}`) });
        this.registerCapability({ intent: 'git.branch', handler: (p) => git(`branch ${p.args || ''}`) });

        // --- GITHUB (via gh CLI) ---
        const gh = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `gh ${cmd}` } });
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => gh(`pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
            handler: (p) => gh(`pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => gh(`pr checks ${p.number || ''}`)
        });
        this.registerCapability({
            intent: 'github.listIssues',
            handler: (p) => gh(`issue list --limit ${p.limit || 10}`)
        });
        this.registerCapability({
            intent: 'github.createIssue',
            handler: (p) => gh(`issue create --title "${p.title}" --body "${p.body || ''}"`)
        });

        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => gh(`pr checks ${p.number || ''}`)
        });

        // --- DOCKER ---
        const docker = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `docker ${cmd}` } });
        this.registerCapability({
            intent: 'docker.build',
            handler: (p) => docker(`build -t ${p.tag} ${p.path || '.'}`)

        this.registerCapability({
            intent: 'ai.team',
            handler: async (payload) => {
                const { strategy = 'sequential', members = [] } = payload;
                window.toast(`Starting AI Team (${strategy})...`, 2000);
                let lastResult = null;
                for (const member of members) {
                    window.toast(`Agent ${member.role || 'member'} working...`, 2000);
                    lastResult = await this.route({
                        intent: 'ai.generate',
                        payload: {
                            instruction: member.instruction || payload.instruction,
                            role: member.role,
                            model: member.model || payload.model,
                            systemPrompt: member.systemPrompt || payload.systemPrompt
                        }
                    });
                    if (member.outputVar) this.variableCache.set(member.outputVar, lastResult);
                }
                return lastResult;
            }
        });

        // --- EXTENDED EDITOR ---
        this.registerCapability({
            intent: 'editor.open',
            handler: async (payload) => {
                await acode.openFile(payload.path);
                return true;
            }
        });

        this.registerCapability({
            intent: 'editor.close',
            handler: async (payload) => {
                const file = editorManager.getFile(payload.path || editorManager.activeFile.uri);
                if (file) file.close();
                return true;
            }
        });

        // --- ADVANCED UI ---
        this.registerCapability({
            intent: 'ui.reviewDiff',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    const content = `
                        <div style="display:flex; flex-direction:column; height:100%;">
                            <div style="flex:1; overflow:auto; padding:10px; background:#1d1d1d; color:#fff; font-family:monospace; white-space:pre-wrap;">
                                ${payload.proposal}
                            </div>
                            <div style="padding:10px; border-top:1px solid #444; display:flex; justify-content:flex-end; gap:10px;">
                                <button id="leion-diff-cancel" style="padding:8px 16px;">Reject</button>
                                <button id="leion-diff-apply" style="padding:8px 16px; background:#4caf50; color:white; border:none;">Apply Change</button>
                            </div>
                        </div>
                    `;
                    const dialog = acode.require('box')(payload.title || 'Review Changes', content);
                    dialog.onhide = () => resolve(false);
                    
                    const $apply = dialog.querySelector('#leion-diff-apply');
                    const $cancel = dialog.querySelector('#leion-diff-cancel');
                    
                    $apply.onclick = () => {
                        dialog.hide();
                        resolve(true);
                    };
                    $cancel.onclick = () => {
                        dialog.hide();
                        resolve(false);
                    };
                });
            }
        });

        this.registerCapability({
            intent: 'docker.run',
            handler: (p) => docker(`run ${p.detach ? '-d' : ''} ${p.image}`)
            handler: (p) => docker(`run ${p.detach ? '-d' : ''} ${p.image}`)
        });
        this.registerCapability({ intent: 'docker.stop', handler: (p) => docker(`stop ${p.container}`) });
        this.registerCapability({ intent: 'docker.ps', handler: (p) => docker(`ps ${p.all ? '-a' : ''}`) });
        this.registerCapability({ intent: 'docker.rm', handler: (p) => docker(`rm ${p.container}`) });
        this.registerCapability({ intent: 'docker.logs', handler: (p) => docker(`logs ${p.container}`) });


        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                window.toast('AI is thinking...', 2000);
                // Simple simulation for now, can be expanded to call Gemini/OpenAI
                const res = "AI Generated content based on: " + payload.instruction;
                if (payload.var) this.variableCache.set(payload.var, res);
                return res;
            }
                return res;
            }
        });

        this.registerCapability({
            intent: 'ai.team',
            handler: async (payload) => {
                let results = [];
                for (const member of payload.members) {
                    window.toast(`Agent ${member.role} is working...`, 2000);
                    const res = await this.route({
                        intent: 'ai.generate',
                        payload: {
                            instruction: member.instruction,
                            role: member.role,
                            contextFiles: member.contextFiles || payload.contextFiles
                        }
                    });
                    results.push({ role: member.role, output: res });
                }
                return results;
            }
        });

        // --- ACODE SPECIFIC ---
        this.registerCapability({
            intent: 'acode.runCommand',
            handler: async (payload) => {
                acode.exec(payload.command);
                return true;
            }
        });

        this.registerCapability({
            intent: 'acode.openFile',
            handler: async (payload) => {
                acode.require('editorManager').addNewFile(payload.filename, {
                    isUnsaved: false,
                    render: true,
                    uri: payload.path
                });
                return true;
            }
        });

        this.registerCapability({
            intent: 'system.wait',
            handler: async (payload) => {
                return new Promise(resolve => setTimeout(resolve, payload.ms || 1000));
            }
        });

        this.registerCapability({
            intent: 'system.notification',
            handler: async (payload) => {
                if (window.Notification && Notification.permission === "granted") {
                    new Notification(payload.title, { body: payload.message });
                } else {
                    window.toast(`${payload.title}: ${payload.message}`, 4000);
                }
                return true;
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

        const resolvedPayload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        
        if (handler) {
            try {
                const result = await handler(resolvedPayload);
                if (intent.var && result !== undefined) this.variableCache.set(intent.var, result);
                return result;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
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
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div style="padding:10px;"><h3>Leion Roots Cockpit</h3><p>Engine status: <b>Active</b></p><hr/><p>Ready to orchestrate your intentions.</p></div>');
            sidePanel.open();
        } else {
            window.toast('Leion Cockpit Ready', 2000);
        }
    }

    async destroy() {
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
 * Orchestration layer for human-centric automation on mobile.
 */

class IntentRouter {
    constructor() {
        this.capabilities = new Map();
        this.variableCache = new Map();
    }

    async init() {
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
            return val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : val) : match;
        });
        try { return JSON.parse(str); } catch (e) { return str; }
    }

    registerInternalProviders() {
        const fs = acode.require('fs');

        // --- SYSTEM & UI ---
        this.registerCapability({
            intent: 'system.pause',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Leion Roots', payload.message || 'Pause for human validation', (res) => resolve(res));
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
            handler: async (payload) => {
                const val = editorManager.editor.getValue();
                if (payload.var) this.variableCache.set(payload.var, val);
                return val;
            }
        });

        // --- TERMINAL ---
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
        // --- GITHUB (via gh CLI) ---
        const gh = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `gh ${cmd}` } });
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => gh(`pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}`)
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => gh(`pr checks ${p.number || ''}`)
        });
        this.registerCapability({
            intent: 'github.repoClone',
            handler: (p) => gh(`repo clone ${p.repo} ${p.path || ''}`)
        });

        // --- DOCKER ---
        const docker = (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `docker ${cmd}` } });
        this.registerCapability({
            intent: 'docker.build',
            handler: (p) => docker(`build -t ${p.tag} ${p.path || '.'}`)
        });
        this.registerCapability({
            intent: 'docker.run',
            handler: (p) => docker(`run ${p.detach ? '-d' : ''} ${p.image}`)
        });
        this.registerCapability({
            intent: 'docker.ps',
            handler: () => docker('ps')
        });

        // --- AI (Enhanced) ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                const loader = acode.require('loader');
                if (loader) loader.show('AI is thinking...');
                
                try {
                    // Try to use a global AI provider if available, otherwise fallback to mock
                    if (window.leionAI) {
                        const res = await window.leionAI.generate(payload);
                        if (payload.var) this.variableCache.set(payload.var, res);
                        return res;
                    }
                    
                    // Fallback simulation
                    await new Promise(r => setTimeout(r, 1500));
                    const res = `[AI Mock] Response to: ${payload.instruction}\nContext files: ${payload.contextFiles?.join(', ') || 'none'}`;
                    if (payload.var) this.variableCache.set(payload.var, res);
                    return res;
                } finally {
                    if (loader) loader.hide();
                }
            }
        });

        // --- VSCODE COMPATIBILITY (Acode Bridge) ---
        this.registerCapability({
            intent: 'vscode.reviewDiff',
            handler: async (p) => {
                const fs = acode.require('fs');
                const original = await fs.readFile(p.path);
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

                    method: payload.method || 'GET',
                    headers: payload.headers || { 'Content-Type': 'application/json' },
                    body: payload.body ? (typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)) : undefined
                });
                const text = await response.text();
                let data; try { data = JSON.parse(text); } catch(e) { data = text; }
                if (payload.var) this.variableCache.set(payload.var, data);
                return data;
            }
        });

        // --- GIT ---
        const gitCmd = async (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `git ${cmd}` } });
        this.registerCapability({ intent: 'git.status', handler: () => gitCmd('status') });
        this.registerCapability({ intent: 'git.push', handler: () => gitCmd('push') });
        this.registerCapability({ intent: 'git.pull', handler: () => gitCmd('pull') });
        this.registerCapability({ intent: 'git.commit', handler: (p) => gitCmd(`commit -m "${p.message}"`) });

        // --- GITHUB ---
        this.registerCapability({
            intent: 'github.openPr',
            handler: (p) => this.route({ intent: 'terminal.exec', payload: { command: `gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}` } })
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: (p) => this.route({ intent: 'terminal.exec', payload: { command: `gh pr checks ${p.number || ''}` } })
        });

        // --- DOCKER ---
        this.registerCapability({
            intent: 'docker.build',
            handler: (p) => this.route({ intent: 'terminal.exec', payload: { command: `docker build -t ${p.tag} ${p.path || '.'}` } })
        });
        this.registerCapability({
            intent: 'docker.run',
            handler: (p) => this.route({ intent: 'terminal.exec', payload: { command: `docker run ${p.detach ? '-d' : ''} ${p.image}` } })
        });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                window.toast('AI is thinking...', 2000);
                const res = "AI Response: " + payload.instruction;
                if (payload.var) this.variableCache.set(payload.var, res);
                return res;
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
        const resolvedPayload = await this.resolveVariables(intent.payload);
        const handler = this.capabilities.get(intent.intent);
        if (handler) {
            try {
                const result = await handler(resolvedPayload);
                if (intent.var && result !== undefined) this.variableCache.set(intent.var, result);
                return result;
            } catch (e) {
                window.toast(`Error: ${e.message}`, 5000);
                return false;
            }
        }
        window.toast(`Unknown intent: ${intent.intent}`, 3000);
        return false;
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
    }

    openCockpit() {
        const sidePanel = acode.require('sidePanel');
        if (sidePanel) {
            sidePanel.set('Leion Cockpit', '<div><p>Engine: Ready</p><button id="test-btn">Test</button></div>');
            sidePanel.open();
        } else {
            window.toast('Cockpit UI (Coming Soon)', 2000);
        }
    }

    async destroy() {
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

    registerInternalProviders() {
        const fs = acode.require('fs');

        // --- SYSTEM & UI ---
        this.registerCapability({
            intent: 'system.pause',
            handler: async (payload) => {
                return new Promise((resolve) => {
                    acode.confirm('Intent Router', payload.message || 'Pause for human validation', (res) => resolve(res));
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
                    headers: payload.headers || { 'Content-Type': 'application/json' },
                    body: payload.body ? (typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)) : undefined
                });
                const text = await response.text();
                try { return JSON.parse(text); } catch(e) { return text; }
            }
        });

        // --- GIT (via Terminal) ---
        const gitCmd = async (cmd) => this.route({ intent: 'terminal.exec', payload: { command: `git ${cmd}` } });
        this.registerCapability({ intent: 'git.status', handler: () => gitCmd('status') });
        this.registerCapability({ intent: 'git.commit', handler: (p) => gitCmd(`commit -m "${p.message}"`) });
        this.registerCapability({ intent: 'git.push', handler: () => gitCmd('push') });
        this.registerCapability({ intent: 'git.pull', handler: () => gitCmd('pull') });
        this.registerCapability({ intent: 'git.add', handler: (p) => gitCmd(`add ${p.path || '.'}`) });
        this.registerCapability({ intent: 'git.checkout', handler: (p) => gitCmd(`checkout ${p.branch}`) });

        // --- GITHUB (via gh CLI) ---
        this.registerCapability({
            intent: 'github.openPr',
            handler: async (p) => this.route({ intent: 'terminal.exec', payload: { command: `gh pr create --title "${p.title}" --body "${p.body || ''}" --base ${p.base} --head ${p.head}` } })
        });
        this.registerCapability({
            intent: 'github.prChecks',
            handler: async (p) => this.route({ intent: 'terminal.exec', payload: { command: `gh pr checks ${p.number || ''}` } })
        });

        // --- DOCKER (via terminal) ---
        this.registerCapability({
            intent: 'docker.build',
            handler: async (p) => this.route({ intent: 'terminal.exec', payload: { command: `docker build -t ${p.tag} ${p.path || '.'}` } })
        });
        this.registerCapability({
            intent: 'docker.run',
            handler: async (p) => this.route({ intent: 'terminal.exec', payload: { command: `docker run ${p.detach ? '-d' : ''} ${p.image}` } })
        });
        this.registerCapability({
            intent: 'docker.ps',
            handler: async () => this.route({ intent: 'terminal.exec', payload: { command: 'docker ps' } })
        });

        // --- AI ---
        this.registerCapability({
            intent: 'ai.generate',
            handler: async (payload) => {
                window.toast('AI Thinking...', 2000);
                // In Acode, we might want to integrate with a specific provider or another plugin
                return "AI Simulation: " + payload.instruction;
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
            try {
                const result = await handler(payload);
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
