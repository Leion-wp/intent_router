(function () {
  'use strict';

  const PLUGIN_ID = 'com.leion.intentrouter';
  const PLUGIN_VERSION = '1.2.1';

  class RunHistoryStore {
    constructor(router) {
      this.router = router;
      this.maxRuns = 50;
      this.memoryRuns = [];
      this.projectRootOverride = null;
    }

    async getProjectRoot() {
      if (this.projectRootOverride) return this.projectRootOverride;
      if (typeof window !== 'undefined' && window.addedFolder && window.addedFolder.length > 0) {
        return window.addedFolder[0].url;
      }
      return null;
    }

    async getHistoryFilePath() {
      const projectRoot = await this.getProjectRoot();
      if (!projectRoot) return null;
      const base = projectRoot.endsWith('/') ? projectRoot : projectRoot + '/';
      return base + '.intent-router/runs.json';
    }

    async getHistoryDirPath() {
      const projectRoot = await this.getProjectRoot();
      if (!projectRoot) return null;
      const base = projectRoot.endsWith('/') ? projectRoot : projectRoot + '/';
      return base + '.intent-router';
    }

    async loadRuns() {
      try {
        const filePath = await this.getHistoryFilePath();
        if (!filePath) return this.memoryRuns.slice();

        const fsOperation = this.router.requireFs();
        if (!fsOperation) return this.memoryRuns.slice();

        const file = fsOperation(filePath);
        if (typeof file.exists === 'function') {
          const exists = await file.exists();
          if (!exists) return this.memoryRuns.slice();
        }

        const content = await file.readFile('utf-8');
        if (!content || !content.trim()) return [];

        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          this.memoryRuns = parsed;
          return parsed.slice();
        }
      } catch (err) {
        this.router.log(`Error loading run history: ${err.message}`);
      }
      return this.memoryRuns.slice();
    }

    async addRun(runRecord) {
      try {
        let runs = await this.loadRuns();
        runs.unshift(runRecord);

        if (runs.length > this.maxRuns) {
          runs = runs.slice(0, this.maxRuns);
        }
        this.memoryRuns = runs;

        await this.saveRuns(runs);
        return runRecord;
      } catch (err) {
        this.router.log(`Error saving run history: ${err.message}`);
        return runRecord;
      }
    }

    async saveRuns(runs) {
      const dirPath = await this.getHistoryDirPath();
      const filePath = await this.getHistoryFilePath();
      if (!dirPath || !filePath) return;

      const fsOperation = this.router.requireFs();
      if (!fsOperation) return;

      try {
        const dir = fsOperation(dirPath);
        let dirExists = true;
        if (typeof dir.exists === 'function') {
          dirExists = await dir.exists();
        }
        if (!dirExists) {
          const projectRoot = await this.getProjectRoot();
          const root = fsOperation(projectRoot);
          if (typeof root.createDirectory === 'function') {
            await root.createDirectory('.intent-router');
          }
        }
        const file = fsOperation(filePath);
        await file.writeFile(JSON.stringify(runs, null, 2));
      } catch (err) {
        this.router.log(`Failed to write runs.json: ${err.message}`);
      }
    }

    async clearRuns() {
      this.memoryRuns = [];
      try {
        const filePath = await this.getHistoryFilePath();
        if (filePath) {
          const fsOperation = this.router.requireFs();
          if (fsOperation) {
            const file = fsOperation(filePath);
            if (typeof file.exists === 'function') {
              if (await file.exists()) {
                await file.delete();
              }
            } else {
              await file.delete();
            }
          }
        }
      } catch (err) {
        this.router.log(`Error clearing run history: ${err.message}`);
      }
      return { cleared: true };
    }
  }


  class PipelineRunner {
    constructor(router) {
      this.router = router;
    }

    async runPipelineFromFile(fileUrl, onProgress) {
      const startedAt = new Date().toISOString();
      const startTime = Date.now();
      const runId = 'run_' + startTime + '_' + Math.random().toString(36).substring(2, 8);
      const pipelineName = fileUrl ? fileUrl.split('/').pop() : 'pipeline.json';

      let pipelineData = null;
      let stepCount = 0;
      let completedSteps = 0;
      let failedStep = null;
      let runError = null;
      let logs = [];
      let status = 'error';

      try {
        const fsOperation = this.router.requireFs();
        if (!fsOperation) throw new Error('File system API unavailable');
        const fileContent = await fsOperation(fileUrl).readFile('utf-8');
        pipelineData = JSON.parse(fileContent);

        const result = await this.runPipelineFromData(pipelineData, onProgress, { runId });
        status = result.success ? 'success' : 'error';
        logs = result.logs || [];
        stepCount = pipelineData && Array.isArray(pipelineData.steps) ? pipelineData.steps.length : 0;
        completedSteps = logs.filter(l => l.success).length;
        if (!result.success) {
          const lastLog = logs[logs.length - 1];
          failedStep = lastLog ? lastLog.step : null;
          runError = result.error || 'Pipeline execution failed';
        }
        return result;
      } catch (err) {
        this.router.log(`Pipeline run error: ${err.message}`);
        runError = err.message;
        status = 'error';
        logs = err.logs || logs;
        if (err.failedStep !== undefined) {
          failedStep = err.failedStep;
        } else if (logs.length > 0) {
          const lastLog = logs[logs.length - 1];
          if (lastLog && !lastLog.success) {
            failedStep = lastLog.step;
          }
        }
        if (pipelineData && Array.isArray(pipelineData.steps)) {
          stepCount = pipelineData.steps.length;
        }
        completedSteps = logs.filter(l => l.success).length;
        throw err;
      } finally {
        const finishedAt = new Date().toISOString();
        const durationMs = Date.now() - startTime;
        const runRecord = {
          runId,
          pipelineName: (pipelineData && pipelineData.name) || pipelineName,
          pipelinePath: fileUrl,
          startedAt,
          finishedAt,
          status,
          durationMs,
          stepCount,
          completedSteps,
          failedStep,
          error: runError,
          logs
        };
        try {
          if (this.router && this.router.runHistoryStore) {
            await this.router.runHistoryStore.addRun(runRecord);
          }
        } catch (saveErr) {
          this.router.log(`Failed to save run history: ${saveErr.message}`);
        }
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
          const result = await this.router.route({ action, data: payload });
          logs.push({ step: stepIndex, intent: intentName, success: result.success, data: result.data, error: result.error });

          if (!result.success) {
            const stepErr = new Error(result.error || `Step ${stepIndex} failed`);
            stepErr.logs = logs;
            stepErr.failedStep = stepIndex;
            throw stepErr;
          }
        } catch (err) {
          if (!logs.some(l => l.step === stepIndex)) {
            logs.push({ step: stepIndex, intent: intentName, success: false, error: err.message });
          }
          if (!step.continueOnError) {
            if (onProgress) {
              onProgress({ step: stepIndex, total: totalSteps, status: 'error', error: err.message });
            }
            const abortErr = new Error(`Pipeline aborted at step ${stepIndex} (${intentName}): ${err.message}`);
            abortErr.logs = logs;
            abortErr.failedStep = stepIndex;
            throw abortErr;
          }
        }
      }

      if (onProgress) {
        onProgress({ step: stepIndex, total: totalSteps, status: 'success' });
      }

      return { success: true, logs };
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
      // Trying to get current project root
      // window.addedFolder is the array of open folders in Acode sidebar
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


  class RunHistoryUI {
    constructor(router) {
      this.router = router;
      this.$container = null;
    }

    async render() {
      if (!this.router.$page) {
        this.router.alert('Error', 'UI page is not initialized.');
        return;
      }

      this.router.$page.settitle('Run History');
      this.router.$page.innerHTML = '';

      this.$container = document.createElement('div');
      this.$container.style.padding = '16px';
      this.$container.style.color = 'var(--primary-text-color, #ffffff)';
      this.$container.style.display = 'flex';
      this.$container.style.flexDirection = 'column';
      this.$container.style.gap = '16px';
      this.$container.style.height = '100%';
      this.$container.style.overflow = 'auto';

      this.router.$page.append(this.$container);

      await this.loadHistoryView();

      if (typeof this.router.$page.show === 'function') {
        this.router.$page.show();
      }
    }

    async loadHistoryView() {
      this.$container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading history...</div>';

      const runs = await this.router.runHistoryStore.loadRuns();

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const title = document.createElement('h3');
      title.textContent = `Run History (${runs.length})`;
      title.style.margin = '0';

      const btnGroup = document.createElement('div');
      btnGroup.style.display = 'flex';
      btnGroup.style.gap = '8px';

      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh';
      refreshBtn.style.padding = '6px 12px';
      refreshBtn.style.background = 'var(--primary-color, #2196f3)';
      refreshBtn.style.color = '#fff';
      refreshBtn.style.border = 'none';
      refreshBtn.style.borderRadius = '4px';
      refreshBtn.onclick = () => this.loadHistoryView();

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear History';
      clearBtn.style.padding = '6px 12px';
      clearBtn.style.background = '#f44336';
      clearBtn.style.color = '#fff';
      clearBtn.style.border = 'none';
      clearBtn.style.borderRadius = '4px';
      clearBtn.onclick = async () => {
        const confirmClear = (typeof window !== 'undefined' && window.confirm)
          ? window.confirm('Are you sure you want to clear the run history?')
          : true;
        if (confirmClear) {
          await this.router.route({ action: 'router:clear_run_history' });
          await this.loadHistoryView();
        }
      };

      btnGroup.appendChild(refreshBtn);
      if (runs.length > 0) {
        btnGroup.appendChild(clearBtn);
      }

      header.appendChild(title);
      header.appendChild(btnGroup);

      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '12px';

      this.$container.innerHTML = '';
      this.$container.appendChild(header);
      this.$container.appendChild(list);

      if (runs.length === 0) {
        list.innerHTML = '<div style="padding: 16px; background: rgba(0,0,0,0.1); border-radius: 4px; text-align: center;">No pipeline runs recorded yet.</div>';
        return;
      }

      for (const run of runs) {
        list.appendChild(this.createRunCard(run));
      }
    }

    createRunCard(run) {
      const card = document.createElement('div');
      card.style.background = 'var(--secondary-color, rgba(0,0,0,0.2))';
      card.style.padding = '12px';
      card.style.borderRadius = '6px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '8px';
      card.style.borderLeft = run.status === 'success' ? '4px solid #4caf50' : '4px solid #f44336';

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'space-between';
      topRow.style.alignItems = 'center';

      const name = document.createElement('strong');
      name.textContent = run.pipelineName || 'Pipeline';

      const statusBadge = document.createElement('span');
      statusBadge.style.padding = '2px 8px';
      statusBadge.style.borderRadius = '4px';
      statusBadge.style.fontSize = '0.85em';
      statusBadge.style.fontWeight = 'bold';
      statusBadge.style.textTransform = 'uppercase';
      if (run.status === 'success') {
        statusBadge.style.background = 'rgba(76, 175, 80, 0.2)';
        statusBadge.style.color = '#4caf50';
        statusBadge.textContent = 'SUCCESS';
      } else {
        statusBadge.style.background = 'rgba(244, 67, 54, 0.2)';
        statusBadge.style.color = '#f44336';
        statusBadge.textContent = 'FAILED';
      }

      topRow.appendChild(name);
      topRow.appendChild(statusBadge);
      card.appendChild(topRow);

      const detailsRow = document.createElement('div');
      detailsRow.style.fontSize = '0.85em';
      detailsRow.style.color = 'var(--text-color, #ccc)';
      detailsRow.style.display = 'flex';
      detailsRow.style.flexWrap = 'wrap';
      detailsRow.style.gap = '12px';

      const dateStr = run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Unknown date';
      const durationStr = typeof run.durationMs === 'number' ? `${(run.durationMs / 1000).toFixed(1)}s` : '0s';
      const stepsStr = `${run.completedSteps || 0}/${run.stepCount || 0} steps`;

      detailsRow.innerHTML = `
        <span>📅 ${dateStr}</span>
        <span>⏱️ ${durationStr}</span>
        <span>⚙️ ${stepsStr}</span>
        ${run.failedStep ? `<span style="color:#f44336;">Failed step: ${run.failedStep}</span>` : ''}
      `;
      card.appendChild(detailsRow);

      if (run.error) {
        const errBox = document.createElement('div');
        errBox.style.fontSize = '0.85em';
        errBox.style.color = '#f44336';
        errBox.style.background = 'rgba(244, 67, 54, 0.1)';
        errBox.style.padding = '6px 8px';
        errBox.style.borderRadius = '4px';
        errBox.textContent = `Error: ${run.error}`;
        card.appendChild(errBox);
      }

      const toggleLogsBtn = document.createElement('button');
      toggleLogsBtn.textContent = 'Show Details / Logs';
      toggleLogsBtn.style.padding = '4px 8px';
      toggleLogsBtn.style.fontSize = '0.85em';
      toggleLogsBtn.style.background = 'transparent';
      toggleLogsBtn.style.border = '1px solid var(--primary-color, #2196f3)';
      toggleLogsBtn.style.color = 'var(--primary-color, #2196f3)';
      toggleLogsBtn.style.borderRadius = '4px';
      toggleLogsBtn.style.alignSelf = 'flex-start';

      const logsContainer = document.createElement('div');
      logsContainer.style.display = 'none';
      logsContainer.style.flexDirection = 'column';
      logsContainer.style.gap = '6px';
      logsContainer.style.marginTop = '8px';
      logsContainer.style.padding = '8px';
      logsContainer.style.background = 'rgba(0, 0, 0, 0.3)';
      logsContainer.style.borderRadius = '4px';
      logsContainer.style.fontSize = '0.85em';

      if (run.logs && run.logs.length > 0) {
        run.logs.forEach(log => {
          const logItem = document.createElement('div');
          logItem.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
          logItem.style.paddingBottom = '4px';
          const logStatus = log.success ? '<span style="color:#4caf50;">✓</span>' : '<span style="color:#f44336;">✗</span>';
          logItem.innerHTML = `
            <div>${logStatus} <strong>Step ${log.step}:</strong> ${this.router.escapeHtml(log.intent)}</div>
            ${log.error ? `<div style="color:#f44336; margin-left: 16px;">${this.router.escapeHtml(log.error)}</div>` : ''}
          `;
          logsContainer.appendChild(logItem);
        });
      } else {
        logsContainer.innerHTML = '<div style="color:#888;">No step logs available.</div>';
      }

      toggleLogsBtn.onclick = () => {
        if (logsContainer.style.display === 'none') {
          logsContainer.style.display = 'flex';
          toggleLogsBtn.textContent = 'Hide Details';
        } else {
          logsContainer.style.display = 'none';
          toggleLogsBtn.textContent = 'Show Details / Logs';
        }
      };

      card.appendChild(toggleLogsBtn);
      card.appendChild(logsContainer);

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
      this.runHistoryStore = new RunHistoryStore(this);
      this.runHistoryUI = new RunHistoryUI(this);
      this.pipelineRunner = new PipelineRunner(this);
      this.pipelineUI = new PipelineUI(this);
    }

    safeRequire(name) {
      try { return acode.require(name); } catch (_) { return null; }
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
      window.intentRouter = this;
      this.isInitialized = true;
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

    async resolveVariables(input, cache) {
      if (!cache) cache = new Map();
      if (typeof input === 'string') {
        const regex = /\$\{input:([^}]+)\}/g;
        let match;
        let result = input;
        while ((match = regex.exec(input)) !== null) {
          const fullMatch = match[0];
          const promptText = match[1];
          let value = cache.get(promptText);
          if (value === undefined) {
            const prompt = this.safeRequire('prompt');
            if (!prompt) {
              value = typeof window !== 'undefined' && window.prompt ? window.prompt(`Value for ${promptText}`) : undefined;
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
        return Promise.all(input.map(item => this.resolveVariables(item, cache)));
      } else if (typeof input === 'object' && input !== null) {
        const resolved = {};
        for (const key of Object.keys(input)) {
          resolved[key] = await this.resolveVariables(input[key], cache);
        }
        return resolved;
      }
      return input;
    }

    async route(intent = {}, variableCache) {
      if (!variableCache) variableCache = new Map();

      if (intent.steps && Array.isArray(intent.steps) && intent.steps.length > 0) {
        this.log(`Routing composite intent with ${intent.steps.length} steps`);
        let lastResult = true;
        for (const childStep of intent.steps) {
          const childIntent = Object.assign({}, childStep, {
            meta: Object.assign({}, intent.meta || {}, childStep.meta || {})
          });
          lastResult = await this.route(childIntent, variableCache);
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
        data = await this.resolveVariables(data, variableCache);
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
      if (typeof window === 'undefined' || !window.editorManager || !editorManager.editor) throw new Error('Editor unavailable');
      return editorManager.editor;
    }

    setupCommands() {
      this.commands.clear();

      this.register('router:list', () => Array.from(this.commands.keys()).sort());
      this.register('router:logs', () => this.logs.slice());
      this.register('router:clear_logs', () => { this.logs = []; return { cleared: true }; });
      this.register('router:run_history', async () => await this.runHistoryStore.loadRuns());
      this.register('router:clear_run_history', async () => await this.runHistoryStore.clearRuns());
      this.register('router:capabilities', () => ({
        pluginId: PLUGIN_ID,
        version: PLUGIN_VERSION,
        fs: !!this.modules.fs,
        commands: !!this.modules.commands,
        terminal: !!this.modules.terminal,
        editor: !!(typeof window !== 'undefined' && window.editorManager && editorManager.editor),
        network: typeof fetch === 'function'
      }));

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
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
        platform: typeof navigator !== 'undefined' ? (navigator.platform || 'unknown') : process.platform,
        baseUrl: this.baseUrl
      }));

      this.register('system:vibrate', (data) => {
        if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') throw new Error('Vibration not supported');
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
        if (typeof window !== 'undefined' && window.open) {
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

      this.register('editor:list_files', () => (typeof editorManager !== 'undefined' && editorManager.files ? editorManager.files : []).map((file) => ({
        id: file.id,
        name: file.filename,
        uri: file.uri,
        isUnsaved: !!file.isUnsaved,
        readOnly: !!file.readOnly
      })));

      this.register('editor:save_file', async (data) => {
        const file = data.uri ? editorManager.getFile(data.uri, 'uri') : editorManager.activeFile;
        if (!file || typeof file.save !== 'function') throw new Error('File not found or cannot be saved');
        await file.save();
        return { saved: true, uri: file.uri };
      });

      this.register('editor:close_file', async (data) => {
        const file = data.uri ? editorManager.getFile(data.uri, 'uri') : editorManager.activeFile;
        if (!file || typeof file.remove !== 'function') throw new Error('File not found');
        await file.remove(!!data.force);
        return { closed: true };
      });

      this.register('editor:open_file', async (data) => {
        if (!data.path) throw new Error('path is required');
        const text = await this.requireFs()(data.path).readFile(data.encoding || 'utf-8');
        const filename = data.name || String(data.path).split('/').filter(Boolean).pop() || 'file';
        const file = await editorManager.addNewFile(filename, {
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
        { name: 'leion.intentRouter.history', description: 'Intent Router: Run History', exec: () => this.runHistoryUI.render() },
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
    module.exports = { RunHistoryStore, PipelineRunner, PipelineUI, RunHistoryUI, IntentRouter };
  }
})();
