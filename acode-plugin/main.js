(function () {
  'use strict';

  const PLUGIN_ID = 'com.leion.intentrouter';
  const PLUGIN_VERSION = '1.2.1';


  function asBoolean(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return fallback;
  }

  function asPositiveInt(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }

  function parseWatchEvents(raw) {
    const output = new Set();
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const text = String(item || '').trim().toLowerCase();
        if (text === 'create' || text === 'change' || text === 'delete') output.add(text);
      }
    } else {
      const text = String(raw || 'change').trim().toLowerCase();
      const parts = text.split(',').map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (part === 'create' || part === 'change' || part === 'delete') output.add(part);
      }
    }
    if (!output.size) output.add('change');
    return output;
  }

  function isWorkspacePathSafe(relPath) {
    const normalized = String(relPath || '').trim().replace(/\\/g, '/');
    if (!normalized) return false;
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith('file://')) {
      return false;
    }
    const parts = normalized.split('/');
    let depth = 0;
    for (const part of parts) {
      if (part === '..') {
        depth--;
        if (depth < 0) return false;
      } else if (part !== '.' && part !== '') {
        depth++;
      }
    }
    return true;
  }

  function matchGlob(filePath, pattern) {
    const normFile = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const normPattern = String(pattern || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (normFile === normPattern) return true;

    let regexStr = '^';
    let i = 0;
    while (i < normPattern.length) {
      const c = normPattern[i];
      if (c === '*') {
        if (normPattern[i + 1] === '*') {
          if (normPattern[i + 2] === '/') {
            regexStr += '(?:.*/)?';
            i += 3;
            continue;
          } else {
            regexStr += '.*';
            i += 2;
            continue;
          }
        } else {
          regexStr += '[^/]*';
          i++;
          continue;
        }
      } else if (c === '?') {
        regexStr += '[^/]';
        i++;
      } else if ('+?.()^$|{}[]\\'.includes(c)) {
        regexStr += '\\' + c;
        i++;
      } else {
        regexStr += c;
        i++;
      }
    }
    regexStr += '$';
    try {
      return new RegExp(regexStr).test(normFile);
    } catch (_) {
      return normFile === normPattern;
    }
  }

  async function scanDirectory(fsOperation, rootUrl, currentUrl, depth = 0, maxDepth = 5, results = [], maxFiles = 200) {
    if (depth > maxDepth || results.length >= maxFiles) return results;
    try {
      const folder = fsOperation(currentUrl);
      if (!(await folder.exists())) return results;
      const items = await folder.lsDir();
      for (const item of items) {
        if (results.length >= maxFiles) break;
        const itemUrl = item.url || (currentUrl.endsWith('/') ? currentUrl + item.name : currentUrl + '/' + item.name);
        const isDir = item.isDirectory || item.type === 'directory' || item.isDir;
        if (isDir) {
          if (item.name.startsWith('.') || item.name === 'node_modules') continue;
          await scanDirectory(fsOperation, rootUrl, itemUrl, depth + 1, maxDepth, results, maxFiles);
        } else {
          let relPath = itemUrl;
          if (rootUrl && itemUrl.startsWith(rootUrl)) {
            relPath = itemUrl.substring(rootUrl.length).replace(/^\/+/, '');
          }
          let mtime = 0;
          let size = 0;
          try {
            const stat = await fsOperation(itemUrl).stat();
            mtime = stat.mtime || stat.lastModified || 0;
            size = stat.size || 0;
          } catch (_) {
            if (item.stat) {
              mtime = item.stat.mtime || item.stat.lastModified || 0;
              size = item.stat.size || 0;
            }
          }
          results.push({ relPath, fullUrl: itemUrl, mtime, size });
        }
      }
    } catch (_) {}
    return results;
  }

  class PipelineRunner {
    constructor(router) {
      this.router = router;
    }

    async runPipelineFromFile(fileUrl, onProgress, options = {}) {
      try {
        const fsOperation = this.router.requireFs();
        if (!fsOperation) throw new Error('File system API unavailable');
        const fileContent = await fsOperation(fileUrl).readFile('utf-8');
        const pipelineData = JSON.parse(fileContent);
        return await this.runPipelineFromData(pipelineData, onProgress, options);
      } catch (err) {
        this.router.log(`Pipeline run error: ${err.message}`);
        throw err;
      }
    }

    async runPipelineFromData(pipelineData, onProgress, options = {}) {
      if (!pipelineData || !Array.isArray(pipelineData.steps)) {
        throw new Error('Invalid pipeline format: steps array is missing');
      }

      let stepIndex = 0;
      const totalSteps = pipelineData.steps.length;
      const logs = [];

      for (const step of pipelineData.steps) {
        stepIndex++;
        const intentName = step.intent;
        const payload = step.payload || {};

        if (onProgress) {
          onProgress({ step: stepIndex, total: totalSteps, status: 'running', intent: intentName });
        }

        // Roots compatibility: file.read -> action: file:read, data: payload
        const action = intentName.replace(/\./g, ':');

        try {
          const result = await this.router.route(
            { action, data: payload, runtimeVariables: options.runtimeVariables },
            null,
            options.runtimeVariables
          );
          logs.push({ step: stepIndex, intent: intentName, success: result.success, data: result.data, error: result.error });

          if (!result.success) {
             throw new Error(result.error || `Step ${stepIndex} failed`);
          }
        } catch (err) {
          logs.push({ step: stepIndex, intent: intentName, success: false, error: err.message });
          if (!step.continueOnError) {
            if (onProgress) {
              onProgress({ step: stepIndex, total: totalSteps, status: 'error', error: err.message });
            }
            throw new Error(`Pipeline aborted at step ${stepIndex} (${intentName}): ${err.message}`);
          }
        }
      }

      if (onProgress) {
        onProgress({ step: stepIndex, total: totalSteps, status: 'success' });
      }

      return {
        success: true,
        logs,
        source: options.source || 'manual',
        triggerStepId: options.triggerStepId,
        event: options.event
      };
    }
  }

  class AcodeTriggerManager {
    constructor(router) {
      this.router = router;
      this.registrations = new Map();
      this.snapshots = new Map();
      this.pollIntervals = new Map();
      this.debounceTimers = new Map();
      this.cooldowns = new Map();
      this.isRefreshing = false;
      this.refreshPending = false;
    }

    async start() {
      await this.refresh();
    }

    async refresh() {
      if (this.isRefreshing) {
        this.refreshPending = true;
        return;
      }
      this.isRefreshing = true;
      try {
        this.clearRegistrations();
        await this.loadRegistrations();
      } finally {
        this.isRefreshing = false;
        if (this.refreshPending) {
          this.refreshPending = false;
          await this.refresh();
        }
      }
    }

    clearRegistrations() {
      for (const interval of this.pollIntervals.values()) {
        clearInterval(interval);
      }
      this.pollIntervals.clear();

      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();

      this.registrations.clear();
      this.snapshots.clear();
      this.cooldowns.clear();
    }

    destroy() {
      this.clearRegistrations();
    }

    async loadRegistrations() {
      const projectRoot = await this.router.getProjectRoot();
      if (!projectRoot) return;

      const fsOperation = this.router.requireFsSilently();
      if (!fsOperation) return;

      const pipelineFolderUrl = projectRoot.endsWith('/') ? projectRoot + 'pipeline' : projectRoot + '/pipeline';
      const folder = fsOperation(pipelineFolderUrl);
      if (!(await folder.exists())) return;

      const files = await folder.lsDir();
      const pipelineFiles = files.filter(f => f.name && f.name.endsWith('.intent.json'));

      for (const file of pipelineFiles) {
        try {
          const fileContent = await fsOperation(file.url).readFile('utf-8');
          const pipelineData = JSON.parse(fileContent);
          if (!pipelineData || !Array.isArray(pipelineData.steps)) continue;

          for (let stepIndex = 0; stepIndex < pipelineData.steps.length; stepIndex++) {
            const step = pipelineData.steps[stepIndex];
            const intent = String(step?.intent || '').trim();
            if (intent !== 'system.trigger.watch' && intent !== 'system:trigger:watch') continue;

            const payload = step?.payload || {};
            if (!asBoolean(payload.enabled, true)) continue;

            const stepId = String(step?.id || '').trim() || `trigger_${stepIndex}`;
            await this.registerWatchTrigger(file.url, stepId, payload, projectRoot);
          }
        } catch (err) {
          this.router.log(`Error parsing trigger from ${file.name}: ${err.message}`);
        }
      }
    }

    async registerWatchTrigger(pipelineUrl, stepId, payload, projectRoot) {
      const pattern = String(payload.glob || payload.path || '').trim();
      if (!pattern) return;

      if (!isWorkspacePathSafe(pattern)) {
        this.router.log(`Watch trigger rejected unsafe/external path: ${pattern}`);
        return;
      }

      const id = `watch:${pipelineUrl}:${stepId}`;
      const events = parseWatchEvents(payload.events);
      const debounceMs = asPositiveInt(payload.debounceMs, 800);
      const cooldownMs = asPositiveInt(payload.cooldownMs, 2500);
      const pollIntervalMs = payload.pollIntervalMs === 0 ? 0 : Math.min(60000, Math.max(1000, asPositiveInt(payload.pollIntervalMs, 3000)));

      const registration = {
        id,
        kind: 'watch',
        pipelineUrl,
        stepId,
        payload,
        pattern,
        events,
        debounceMs,
        cooldownMs,
        pollIntervalMs,
        lastTriggered: 0,
        enabled: true
      };

      this.registrations.set(id, registration);

      const snapshot = new Map();
      const fsOperation = this.router.requireFsSilently();
      if (fsOperation) {
        const matches = await this.getMatchingFiles(fsOperation, projectRoot, pattern);
        for (const f of matches) {
          snapshot.set(f.relPath, { mtime: f.mtime, size: f.size, exists: true });
        }
      }
      this.snapshots.set(id, snapshot);

      if (pollIntervalMs > 0) {
        const timer = setInterval(() => {
          void this.pollTick(id, projectRoot);
        }, pollIntervalMs);
        this.pollIntervals.set(id, timer);
      }
      this.router.log(`Registered watch trigger: ${id} on '${pattern}' (poll: ${pollIntervalMs}ms)`);
    }

    async getMatchingFiles(fsOperation, projectRoot, pattern) {
      if (!pattern.includes('*') && !pattern.includes('?')) {
        const relPath = pattern.replace(/^\/+/, '');
        if (!isWorkspacePathSafe(relPath)) return [];
        const fullUrl = projectRoot.endsWith('/') ? projectRoot + relPath : projectRoot + '/' + relPath;
        try {
          const handle = fsOperation(fullUrl);
          if (await handle.exists()) {
            const stat = await handle.stat();
            return [{
              relPath,
              fullUrl,
              mtime: stat.mtime || stat.lastModified || 0,
              size: stat.size || 0
            }];
          }
        } catch (_) {}
        return [];
      } else {
        const allFiles = await scanDirectory(fsOperation, projectRoot, projectRoot, 0, 5, [], 200);
        return allFiles.filter(f => matchGlob(f.relPath, pattern) && isWorkspacePathSafe(f.relPath));
      }
    }

    async pollTick(registrationId, projectRoot) {
      const reg = this.registrations.get(registrationId);
      if (!reg) return;

      const fsOperation = this.router.requireFsSilently();
      if (!fsOperation) return;

      const currentMatches = await this.getMatchingFiles(fsOperation, projectRoot, reg.pattern);
      const snapshot = this.snapshots.get(registrationId) || new Map();
      const currentMap = new Map();

      for (const file of currentMatches) {
        currentMap.set(file.relPath, file);
        const prev = snapshot.get(file.relPath);

        if (!prev) {
          if (reg.events.has('create')) {
            this.emitWatchEvent(reg, file.relPath, file.fullUrl, 'create');
          }
        } else if (prev.mtime !== file.mtime || prev.size !== file.size) {
          if (reg.events.has('change')) {
            this.emitWatchEvent(reg, file.relPath, file.fullUrl, 'change');
          }
        }
      }

      for (const [relPath, prevStat] of snapshot.entries()) {
        if (!currentMap.has(relPath) && prevStat.exists) {
          if (reg.events.has('delete')) {
            const fullUrl = projectRoot.endsWith('/') ? projectRoot + relPath : projectRoot + '/' + relPath;
            this.emitWatchEvent(reg, relPath, fullUrl, 'delete');
          }
        }
      }

      const newSnapshot = new Map();
      for (const [relPath, file] of currentMap.entries()) {
        newSnapshot.set(relPath, { mtime: file.mtime, size: file.size, exists: true });
      }
      this.snapshots.set(registrationId, newSnapshot);
    }

    shouldCooldown(registrationId, cooldownMs) {
      const now = Date.now();
      const last = this.cooldowns.get(registrationId) || 0;
      if (now - last < cooldownMs) {
        return true;
      }
      this.cooldowns.set(registrationId, now);
      return false;
    }

    emitWatchEvent(reg, relPath, fullUrl, changeType) {
      if (this.shouldCooldown(reg.id, reg.cooldownMs)) {
        return;
      }

      const timerKey = `${reg.id}:${relPath}:${changeType}`;
      if (this.debounceTimers.has(timerKey)) {
        clearTimeout(this.debounceTimers.get(timerKey));
      }

      reg.lastRunPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.debounceTimers.delete(timerKey);
          reg.lastTriggered = Date.now();

          const options = {
            source: 'watch',
            triggerStepId: reg.stepId,
            event: {
              changeType,
              path: relPath,
              uri: fullUrl,
              timestamp: Date.now()
            },
            runtimeVariables: {
              trigger_source: 'watch',
              trigger_step_id: reg.stepId,
              trigger_changeType: changeType,
              trigger_path: relPath,
              trigger_uri: fullUrl,
              trigger_timestamp: String(Date.now()),
              trigger_event_json: JSON.stringify({
                changeType,
                path: relPath,
                uri: fullUrl,
                timestamp: Date.now()
              })
            }
          };

          this.router.log(`[Watch Trigger] ${changeType} on ${relPath} -> executing ${reg.pipelineUrl}`);

          this.router.pipelineRunner.runPipelineFromFile(reg.pipelineUrl, null, options)
            .then(async (result) => {
              if (result && result.success && reg.payload.onSuccessPipeline) {
                const onSuccessRef = String(reg.payload.onSuccessPipeline).trim();
                if (onSuccessRef) {
                  const projectRoot = await this.router.getProjectRoot();
                  if (projectRoot) {
                    const targetUrl = projectRoot.endsWith('/') ? projectRoot + onSuccessRef : projectRoot + '/' + onSuccessRef;
                    await this.router.pipelineRunner.runPipelineFromFile(targetUrl, null, {
                      source: 'watch_chain',
                      triggerStepId: reg.stepId,
                      runtimeVariables: options.runtimeVariables
                    });
                  }
                }
              }
              resolve(result);
            })
            .catch((err) => {
              this.router.log(`[Watch Trigger Error] ${err.message}`);
              reject(err);
            });
        }, reg.debounceMs);

        this.debounceTimers.set(timerKey, timer);
      });
    }

    getRegistrations() {
      return Array.from(this.registrations.values()).map(r => ({
        id: r.id,
        kind: r.kind,
        pipelineUrl: r.pipelineUrl,
        stepId: r.stepId,
        pattern: r.pattern,
        events: Array.from(r.events),
        debounceMs: r.debounceMs,
        cooldownMs: r.cooldownMs,
        pollIntervalMs: r.pollIntervalMs,
        lastTriggered: r.lastTriggered,
        enabled: r.enabled
      }));
    }
  }


  class PipelineUI {
    constructor(router) {
      this.router = router;
      this.$container = null;
    }

    async render() {
      if (!this.router.$page) {
        this.router.alert('Error', 'UI page is not initialized.');
        return;
      }

      this.router.$page.settitle('Pipelines');
      this.router.$page.innerHTML = '';

      this.$container = document.createElement('div');
      this.$container.style.padding = '16px';
      this.$container.style.color = 'var(--primary-text-color)';
      this.$container.style.display = 'flex';
      this.$container.style.flexDirection = 'column';
      this.$container.style.gap = '16px';
      this.$container.style.height = '100%';
      this.$container.style.overflow = 'auto';

      this.router.$page.append(this.$container);

      await this.loadPipelines();

      if (typeof this.router.$page.show === 'function') {
        this.router.$page.show();
      }
    }

    async getProjectRoot() {
      if (typeof window !== 'undefined' && window.addedFolder && window.addedFolder.length > 0) {
        return window.addedFolder[0].url;
      }
      return null;
    }

    async loadPipelines() {
      this.$container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading pipelines...</div>';

      const projectRoot = await this.getProjectRoot();

      if (!projectRoot) {
        this.$container.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #f44336;">
            No project folder is currently open.<br><br>
            Please open a folder in the sidebar to view its pipelines.
          </div>
          `;
        return;
      }

      const pipelineFolderUrl = projectRoot.endsWith('/') ? projectRoot + 'pipeline' : projectRoot + '/pipeline';

      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh Pipelines';
      refreshBtn.style.padding = '8px 16px';
      refreshBtn.style.background = 'var(--primary-color)';
      refreshBtn.style.color = '#fff';
      refreshBtn.style.border = 'none';
      refreshBtn.style.borderRadius = '4px';
      refreshBtn.style.alignSelf = 'flex-end';
      refreshBtn.onclick = () => this.loadPipelines();

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const title = document.createElement('h3');
      title.textContent = 'Project Pipelines';
      title.style.margin = '0';

      header.appendChild(title);
      header.appendChild(refreshBtn);

      const content = document.createElement('div');
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.gap = '12px';

      this.$container.innerHTML = '';
      this.$container.appendChild(header);
      this.$container.appendChild(content);

      try {
        const fsOperation = this.router.requireFs();
        if (!fsOperation) throw new Error('File system API unavailable');

        const folder = fsOperation(pipelineFolderUrl);
        const exists = await folder.exists();

        if (!exists) {
          content.innerHTML = `<div style="padding: 16px; background: rgba(0,0,0,0.1); border-radius: 4px;">
            No pipeline directory found (${pipelineFolderUrl}).
          </div>`;
          return;
        }

        const files = await folder.lsDir();
        const pipelineFiles = files.filter(f => f.name && f.name.endsWith('.intent.json'));

        if (pipelineFiles.length === 0) {
          content.innerHTML = '<div style="padding: 16px; background: rgba(0,0,0,0.1); border-radius: 4px;">No *.intent.json files found in pipeline directory.</div>';
          return;
        }

        for (const file of pipelineFiles) {
          content.appendChild(this.createPipelineCard(file));
        }

      } catch (err) {
        content.innerHTML = `<div style="padding: 16px; color: #f44336; background: rgba(244,67,54,0.1); border-radius: 4px;">
          Error loading pipelines: ${this.router.escapeHtml(err.message)}
        </div>`;
      }
    }

    createPipelineCard(file) {
      const card = document.createElement('div');
      card.style.background = 'var(--secondary-color, rgba(0,0,0,0.2))';
      card.style.padding = '12px';
      card.style.borderRadius = '6px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '8px';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const name = document.createElement('strong');
      name.textContent = file.name;
      header.appendChild(name);

      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';

      const openBtn = document.createElement('button');
      openBtn.textContent = 'Open';
      openBtn.style.padding = '6px 12px';
      openBtn.style.background = 'transparent';
      openBtn.style.border = '1px solid var(--primary-color)';
      openBtn.style.color = 'var(--primary-color)';
      openBtn.style.borderRadius = '4px';
      openBtn.onclick = async () => {
         try {
            await this.router.route({ action: 'editor:open_file', data: { path: file.url, name: file.name }});
            // Try to hide the page to show the editor if it has hide method
            if (typeof this.router.$page.hide === 'function') this.router.$page.hide();
         } catch(e) {
            this.router.toast('Error opening file: ' + e.message);
         }
      };

      const runBtn = document.createElement('button');
      runBtn.textContent = 'Execute';
      runBtn.style.padding = '6px 12px';
      runBtn.style.background = 'var(--primary-color)';
      runBtn.style.border = 'none';
      runBtn.style.color = '#fff';
      runBtn.style.borderRadius = '4px';

      controls.appendChild(openBtn);
      controls.appendChild(runBtn);

      header.appendChild(controls);
      card.appendChild(header);

      const statusArea = document.createElement('div');
      statusArea.style.fontSize = '0.9em';
      statusArea.style.color = 'var(--text-color, #ccc)';
      statusArea.style.display = 'none';
      card.appendChild(statusArea);

      runBtn.onclick = () => {
        runBtn.disabled = true;
        openBtn.disabled = true;
        runBtn.style.opacity = '0.5';
        statusArea.style.display = 'block';
        statusArea.style.color = '#fff';
        statusArea.innerHTML = 'Starting pipeline...';

        this.router.pipelineRunner.runPipelineFromFile(file.url, (progress) => {
           if (progress.status === 'running') {
              statusArea.innerHTML = `Step ${progress.step}/${progress.total}: ${progress.intent} - Running...`;
           } else if (progress.status === 'success') {
              statusArea.style.color = '#4caf50';
              statusArea.innerHTML = `Success! (${progress.total}/${progress.total} steps completed)`;
           } else if (progress.status === 'error') {
              statusArea.style.color = '#f44336';
              statusArea.innerHTML = `Failed at step ${progress.step}: ${this.router.escapeHtml(progress.error)}`;
           }
        }).then(result => {
           runBtn.disabled = false;
           openBtn.disabled = false;
           runBtn.style.opacity = '1';
        }).catch(err => {
           runBtn.disabled = false;
           openBtn.disabled = false;
           runBtn.style.opacity = '1';
        });
      };

      return card;
    }
  }

  class IntentRouter {
    constructor() {
      this.commands = new Map();
      this.logs = [];
      this.isInitialized = false;
      this.$page = null;
      this.baseUrl = null;
      this.context = null;
      this.modules = {};
      this.registeredAcodeCommands = [];
      this.workspaceRoot = null;
      this.pipelineRunner = new PipelineRunner(this);
      this.pipelineUI = new PipelineUI(this);
      this.triggerManager = new AcodeTriggerManager(this);
    }

    safeRequire(name) {
      try { return typeof acode !== 'undefined' ? acode.require(name) : null; } catch (_) { return null; }
    }

    async getProjectRoot() {
      if (this.workspaceRoot) return this.workspaceRoot;
      if (typeof window !== 'undefined' && window.addedFolder && window.addedFolder.length > 0) {
        return window.addedFolder[0].url;
      }
      return null;
    }

    requireFsSilently() {
      return this.modules.fs || null;
    }

    async init(baseUrl, $page, context) {
      if (this.isInitialized) return;
      this.baseUrl = baseUrl;
      this.$page = $page;
      this.context = context || {};
      this.modules.fs = this.safeRequire('fs') || this.safeRequire('fsOperation');
      this.modules.commands = this.safeRequire('commands');
      this.modules.toast = this.safeRequire('toast');
      this.modules.alert = this.safeRequire('alert');
      this.modules.terminal = this.safeRequire('terminal');
      this.modules.openFolder = this.safeRequire('openFolder');

      this.setupCommands();
      this.registerAcodeCommands();
      if (typeof window !== 'undefined') {
        window.intentRouter = this;
      }
      this.isInitialized = true;
      await this.triggerManager.start();
      this.log('Intent Router initialized');
      this.toast('Intent Router Active');
    }

    toast(message, timeout = 3000) {
      try {
        if (typeof this.modules.toast === 'function') return this.modules.toast(String(message), timeout);
        if (typeof window !== 'undefined' && typeof window.toast === 'function') return window.toast(String(message), timeout);
      } catch (_) {}
    }

    alert(title, message) {
      try {
        if (typeof this.modules.alert === 'function') return this.modules.alert(String(title), String(message));
      } catch (_) {}
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`${title}\n\n${message}`);
      }
    }

    log(message) {
      const entry = `[${new Date().toISOString()}] ${message}`;
      this.logs.push(entry);
      if (this.logs.length > 200) this.logs.shift();
      console.log(`[Intent Router] ${message}`);
    }

    normalizeAction(intent = {}) {
      const actionName = intent.intent || intent.action;
      if (typeof actionName === 'string' && actionName.includes(':')) return actionName;
      if (typeof actionName === 'string' && actionName.includes('.')) {
        return actionName.replace(/\./g, ':');
      }
      if (intent.scheme && actionName) return `${intent.scheme}:${actionName}`;
      return typeof actionName === 'string' ? actionName : '';
    }

    ok(data = null, metadata = {}) {
      return { success: true, status: 'success', data, result: data, error: null, metadata };
    }

    fail(message, metadata = {}) {
      return { success: false, status: 'error', data: null, result: null, error: String(message), message: String(message), metadata };
    }

    register(name, handler) {
      this.commands.set(name, handler);
      this.log(`Registered command: ${name}`);
    }

    async resolveVariables(input, cache, runtimeVars) {
      if (!cache) cache = new Map();
      if (typeof input === 'string') {
        let result = input;
        if (runtimeVars && typeof runtimeVars === 'object') {
          for (const [k, v] of Object.entries(runtimeVars)) {
            if (v !== undefined && v !== null) {
              const valStr = String(v);
              result = result.replace(new RegExp(`\\$\\{var:${k}\\}`, 'g'), valStr);
              result = result.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), valStr);
            }
          }
        }
        const regex = /\$\{input:([^}]+)\}/g;
        let match;
        while ((match = regex.exec(input)) !== null) {
          const fullMatch = match[0];
          const promptText = match[1];
          let value = cache.get(promptText);
          if (value === undefined) {
            const prompt = this.safeRequire('prompt');
            if (!prompt) {
              value = typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(`Value for ${promptText}`) : '';
            } else {
              value = await prompt(promptText, '', 'text', { required: true });
            }
            if (value === undefined || value === null) throw new Error(`Input cancelled for variable: ${promptText}`);
            cache.set(promptText, value);
          }
          result = result.replace(fullMatch, value);
        }
        return result;
      } else if (Array.isArray(input)) {
        return Promise.all(input.map(item => this.resolveVariables(item, cache, runtimeVars)));
      } else if (typeof input === 'object' && input !== null) {
        const resolved = {};
        for (const key of Object.keys(input)) {
          resolved[key] = await this.resolveVariables(input[key], cache, runtimeVars);
        }
        return resolved;
      }
      return input;
    }

    async route(intent = {}, variableCache, runtimeVars) {
      if (!variableCache) variableCache = new Map();
      const rVars = runtimeVars || intent.runtimeVariables;

      if (intent.steps && Array.isArray(intent.steps) && intent.steps.length > 0) {
        this.log(`Routing composite intent with ${intent.steps.length} steps`);
        let lastResult = true;
        for (const childStep of intent.steps) {
          const childIntent = Object.assign({}, childStep, {
            meta: Object.assign({}, intent.meta || {}, childStep.meta || {})
          });
          lastResult = await this.route(childIntent, variableCache, rVars);
          if (!lastResult || (lastResult && lastResult.success === false)) {
            this.log('Composite step failed');
            return lastResult;
          }
        }
        return lastResult;
      }

      const action = this.normalizeAction(intent);
      let data = intent.payload !== undefined ? intent.payload : (intent.data || {});

      if (!action) return this.fail('intent.action or intent.intent is required');
      const handler = this.commands.get(action);
      if (!handler) return this.fail(`Command ${action} not found`, { action });

      try {
        data = await this.resolveVariables(data, variableCache, rVars);
      } catch (error) {
        return this.fail(error.message, { action });
      }

      try {
        this.log(`Routing action: ${action}`);
        const output = await handler(data, intent);
        return this.ok(output === undefined ? null : output, { action });
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        this.log(`Error executing ${action}: ${message}`);
        return this.fail(message, { action });
      }
    }

    requireFs() {
      if (!this.modules.fs) throw new Error('Acode fs API is unavailable');
      return this.modules.fs;
    }

    getEditor() {
      if (typeof window === 'undefined' || !window.editorManager || !window.editorManager.editor) {
        throw new Error('Editor unavailable');
      }
      return window.editorManager.editor;
    }

    setupCommands() {
      this.commands.clear();

      this.register('router:list', () => Array.from(this.commands.keys()).sort());
      this.register('router:logs', () => this.logs.slice());
      this.register('router:clear_logs', () => { this.logs = []; return { cleared: true }; });
      this.register('router:triggers', () => this.triggerManager.getRegistrations());
      this.register('router:refresh_triggers', async () => {
        await this.triggerManager.refresh();
        return { refreshed: true, activeCount: this.triggerManager.registrations.size };
      });
      this.register('router:capabilities', () => ({
        pluginId: PLUGIN_ID,
        version: PLUGIN_VERSION,
        fs: !!this.modules.fs,
        commands: !!this.modules.commands,
        terminal: !!this.modules.terminal,
        editor: !!(typeof window !== 'undefined' && window.editorManager && window.editorManager.editor),
        network: typeof fetch === 'function'
      }));

      this.register('system:trigger:watch', (data) => ({ trigger: 'watch', active: true, payload: data }));
      this.register('system:trigger:cron', (data) => ({ trigger: 'cron', active: true, payload: data }));
      this.register('system:trigger:webhook', (data) => ({ trigger: 'webhook', active: true, payload: data }));

      this.register('system:toast', (data) => {
        this.toast(data.message || 'No message', Number(data.timeout) || 3000);
        return { shown: true };
      });

      this.register('system:alert', (data) => {
        this.alert(data.title || 'Intent Router', data.message || '');
        return { shown: true };
      });

      this.register('system:info', () => ({
        pluginId: PLUGIN_ID,
        version: PLUGIN_VERSION,
        userAgent: navigator.userAgent,
        platform: navigator.platform || 'unknown',
        baseUrl: this.baseUrl
      }));

      this.register('system:vibrate', (data) => {
        if (typeof navigator.vibrate !== 'function') throw new Error('Vibration not supported');
        navigator.vibrate(Number(data.ms) || 200);
        return { vibrated: true };
      });

      this.register('system:copy_to_clipboard', async (data) => {
        if (data.text === undefined) throw new Error('text is required');
        const value = String(data.text);
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
          return { copied: true, method: 'navigator.clipboard' };
        }
        const clipboard = typeof window !== 'undefined' ? window.cordova?.plugins?.clipboard : null;
        if (!clipboard || typeof clipboard.copy !== 'function') throw new Error('Clipboard API unavailable');
        await new Promise((resolve, reject) => clipboard.copy(value, resolve, reject));
        return { copied: true, method: 'cordova' };
      });

      this.register('system:open_url', (data) => {
        if (!data.url) throw new Error('url is required');
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(String(data.url), '_system');
        }
        return { opened: true };
      });

      this.register('file:read', async (data) => {
        if (!data.path) throw new Error('path is required');
        return await this.requireFs()(data.path).readFile(data.encoding || 'utf-8');
      });

      this.register('file:write', async (data) => {
        if (!data.path) throw new Error('path is required');
        if (data.content === undefined) throw new Error('content is required');
        await this.requireFs()(data.path).writeFile(data.content);
        return { written: true, path: data.path };
      });

      this.register('file:list', async (data) => {
        if (!data.path) throw new Error('path is required');
        return await this.requireFs()(data.path).lsDir();
      });

      this.register('file:exists', async (data) => {
        if (!data.path) throw new Error('path is required');
        return { exists: await this.requireFs()(data.path).exists() };
      });

      this.register('file:stat', async (data) => {
        if (!data.path) throw new Error('path is required');
        return await this.requireFs()(data.path).stat();
      });

      this.register('file:delete', async (data) => {
        if (!data.path) throw new Error('path is required');
        await this.requireFs()(data.path).delete();
        return { deleted: true, path: data.path };
      });

      this.register('file:create', async (data) => {
        if (!data.directory || !data.name) throw new Error('directory and name are required');
        const url = await this.requireFs()(data.directory).createFile(data.name, data.content || '');
        return { created: true, url };
      });

      this.register('file:mkdir', async (data) => {
        if (!data.directory || !data.name) throw new Error('directory and name are required');
        const url = await this.requireFs()(data.directory).createDirectory(data.name);
        return { created: true, url };
      });

      this.register('file:rename', async (data) => {
        if (!data.path || !data.newName) throw new Error('path and newName are required');
        const url = await this.requireFs()(data.path).renameTo(data.newName);
        return { renamed: true, url };
      });

      this.register('file:move', async (data) => {
        if (!data.path || !data.destination) throw new Error('path and destination are required');
        const url = await this.requireFs()(data.path).moveTo(data.destination);
        return { moved: true, url };
      });

      this.register('file:copy', async (data) => {
        if (!data.path || !data.destination) throw new Error('path and destination are required');
        const url = await this.requireFs()(data.path).copyTo(data.destination);
        return { copied: true, url };
      });

      this.register('editor:get_content', () => this.getEditor().state.doc.toString());

      this.register('editor:set_content', (data) => {
        const view = this.getEditor();
        const content = data.content === undefined ? '' : String(data.content);
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
        return { updated: true };
      });

      this.register('editor:insert_text', (data) => {
        const view = this.getEditor();
        const text = data.text === undefined ? '' : String(data.text);
        const from = view.state.selection.main.from;
        const to = view.state.selection.main.to;
        view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
        return { inserted: true };
      });

      this.register('editor:get_selected_text', () => {
        const view = this.getEditor();
        const sel = view.state.selection.main;
        return view.state.sliceDoc(sel.from, sel.to);
      });

      this.register('editor:get_cursor', () => {
        const view = this.getEditor();
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        return { offset: pos, line: line.number, column: pos - line.from };
      });

      this.register('editor:goto_line', (data) => {
        const view = this.getEditor();
        const requested = Math.max(1, Number(data.line) || 1);
        const lineNumber = Math.min(requested, view.state.doc.lines);
        const line = view.state.doc.line(lineNumber);
        const column = Math.max(0, Math.min(Number(data.column) || 0, line.length));
        const pos = line.from + column;
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        view.focus();
        return { line: lineNumber, column };
      });

      this.register('editor:list_files', () => ((typeof window !== 'undefined' && window.editorManager && window.editorManager.files) || []).map((file) => ({
        id: file.id,
        name: file.filename,
        uri: file.uri,
        isUnsaved: !!file.isUnsaved,
        readOnly: !!file.readOnly
      })));

      this.register('editor:save_file', async (data) => {
        const mgr = typeof window !== 'undefined' ? window.editorManager : null;
        const file = data.uri ? mgr?.getFile(data.uri, 'uri') : mgr?.activeFile;
        if (!file || typeof file.save !== 'function') throw new Error('File not found or cannot be saved');
        await file.save();
        return { saved: true, uri: file.uri };
      });

      this.register('editor:close_file', async (data) => {
        const mgr = typeof window !== 'undefined' ? window.editorManager : null;
        const file = data.uri ? mgr?.getFile(data.uri, 'uri') : mgr?.activeFile;
        if (!file || typeof file.remove !== 'function') throw new Error('File not found');
        await file.remove(!!data.force);
        return { closed: true };
      });

      this.register('editor:open_file', async (data) => {
        if (!data.path) throw new Error('path is required');
        const text = await this.requireFs()(data.path).readFile(data.encoding || 'utf-8');
        const filename = data.name || String(data.path).split('/').filter(Boolean).pop() || 'file';
        const mgr = typeof window !== 'undefined' ? window.editorManager : null;
        if (!mgr || typeof mgr.addNewFile !== 'function') throw new Error('Editor manager unavailable');
        const file = await mgr.addNewFile(filename, {
          text: String(text), uri: data.path, render: true, isUnsaved: false, readOnly: !!data.readOnly
        });
        return { opened: true, id: file?.id || null, uri: data.path };
      });

      this.register('network:request', async (data) => {
        if (!data.url) throw new Error('url is required');
        const options = { method: data.method || 'GET', headers: data.headers || {} };
        if (data.body !== undefined && data.body !== null) {
          options.body = typeof data.body === 'string' ? data.body : JSON.stringify(data.body);
        }
        const response = await fetch(data.url, options);
        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json') ? await response.json() : await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
        return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
      });

      this.register('github:request', async (data) => {
        if (!data.path) throw new Error('GitHub API path is required');
        const headers = Object.assign({ Accept: 'application/vnd.github+json' }, data.headers || {});
        if (data.token) headers.Authorization = `Bearer ${data.token}`;
        const routed = await this.route({
          action: 'network:request',
          data: { url: `https://api.github.com${String(data.path).startsWith('/') ? '' : '/'}${data.path}`, method: data.method || 'GET', headers, body: data.body }
        });
        if (!routed.success) throw new Error(routed.error || 'GitHub request failed');
        return routed.data;
      });

      this.register('github:fetch_repo', async (data) => {
        if (!data.repo) throw new Error('repo is required (owner/repo)');
        const suffix = data.path ? `/contents/${String(data.path).replace(/^\/+/, '')}` : '';
        const routed = await this.route({ action: 'github:request', data: { path: `/repos/${data.repo}${suffix}`, token: data.token } });
        if (!routed.success) throw new Error(routed.error || 'GitHub request failed');
        return routed.data;
      });

      this.register('terminal:list', () => {
        const terminal = this.modules.terminal;
        if (!terminal) throw new Error('Acode terminal API unavailable');
        return Array.from(terminal.getAll()).map(([id, inst]) => ({ id, name: inst.name }));
      });

      this.register('terminal:exec', async (data) => {
        const terminal = this.modules.terminal;
        if (!terminal) throw new Error('Acode terminal API unavailable');
        if (!data.command) throw new Error('command is required');
        let instance = data.id ? terminal.get(data.id) : null;
        if (!instance) instance = await terminal.createServer({ name: data.name || 'Intent Router' });
        terminal.write(instance.id, `${data.command}\r`);
        return { submitted: true, terminalId: instance.id, command: data.command };
      });
    }

    registerAcodeCommands() {
      const commands = this.modules.commands;
      if (!commands || typeof commands.addCommand !== 'function') {
        this.log('Acode commands API unavailable');
        return;
      }
      const defs = [
        { name: 'leion.intentRouter.pipelines', description: 'Intent Router: Show Pipelines', exec: () => this.pipelineUI.render() },
        { name: 'leion.intentRouter.triggers', description: 'Intent Router: Show Active Triggers', exec: () => this.showActiveTriggers() },
        { name: 'leion.intentRouter.test', description: 'Intent Router: Run smoke test', exec: () => this.runTest() },
        { name: 'leion.intentRouter.logs', description: 'Intent Router: View logs', exec: () => this.showLogs() },
        { name: 'leion.intentRouter.capabilities', description: 'Intent Router: Show capabilities', exec: () => this.showCapabilities() }
      ];
      for (const def of defs) {
        commands.addCommand(def);
        this.registeredAcodeCommands.push(def.name);
      }
    }

    async runTest() {
      const checks = {};
      checks.toast = await this.route({ action: 'system:toast', data: { message: 'Intent Router test successful' } });
      checks.capabilities = await this.route({ action: 'router:capabilities' });
      checks.editor = await this.route({ action: 'editor:get_cursor' });
      this.log(`Smoke test complete: ${JSON.stringify(checks)}`);
      this.showObject('Intent Router Test', checks);
      return checks;
    }

    async showCapabilities() {
      const result = await this.route({ action: 'router:capabilities' });
      this.showObject('Intent Router Capabilities', result.data || result);
    }

    showActiveTriggers() {
      const list = this.triggerManager.getRegistrations();
      this.showObject('Active Triggers', list);
    }

    showObject(title, value) {
      const text = JSON.stringify(value, null, 2);
      if (this.$page) {
        try {
          this.$page.innerHTML = `<pre style="padding:12px;white-space:pre-wrap;overflow:auto">${this.escapeHtml(text)}</pre>`;
          if (typeof this.$page.show === 'function') this.$page.show();
          return;
        } catch (_) {}
      }
      this.alert(title, text);
    }

    showLogs() {
      const text = this.logs.join('\n') || 'No logs yet.';
      if (this.$page) {
        try {
          this.$page.innerHTML = `<pre style="padding:12px;white-space:pre-wrap;overflow:auto">${this.escapeHtml(text)}</pre>`;
          if (typeof this.$page.show === 'function') this.$page.show();
          return;
        } catch (_) {}
      }
      this.alert('Intent Router Logs', text);
    }

    escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async destroy() {
      if (this.triggerManager) {
        this.triggerManager.destroy();
      }
      const commands = this.modules.commands;
      if (commands && typeof commands.removeCommand === 'function') {
        for (const name of this.registeredAcodeCommands) {
          try { commands.removeCommand(name); } catch (_) {}
        }
      }
      this.registeredAcodeCommands = [];
      if (typeof window !== 'undefined' && window.intentRouter === this) delete window.intentRouter;
      this.commands.clear();
      this.isInitialized = false;
      this.$page = null;
      this.context = null;
      this.modules = {};
      this.log('Intent Router destroyed');
    }
  }

  if (typeof window !== 'undefined' && typeof window.acode !== 'undefined') {
    const router = new IntentRouter();
    acode.setPluginInit(PLUGIN_ID, async (baseUrl, $page, context) => {
      await router.init(baseUrl, $page, context);
    });
    acode.setPluginUnmount(PLUGIN_ID, () => router.destroy());
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      PLUGIN_ID,
      PLUGIN_VERSION,
      PipelineRunner,
      PipelineUI,
      IntentRouter,
      AcodeTriggerManager,
      asBoolean,
      asPositiveInt,
      parseWatchEvents,
      isWorkspacePathSafe,
      matchGlob
    };
  }
})();
