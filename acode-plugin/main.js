(function () {
  'use strict';

  const PLUGIN_ID = 'com.leion.intentrouter';
  const PLUGIN_VERSION = '1.2.1';
  const MAX_PIPELINE_BYTES = 5 * 1024 * 1024; // 5 MB default limit
  const DEFAULT_EDITOR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB default limit for editor open
  const DEFAULT_PIPELINE_BATCH_SIZE = 25; // 25 cards per batch

  const ALLOWED_OPEN_URL_SCHEMES = new Set(['https:', 'http:']);

  function validateOpenUrl(rawUrl) {
    if (rawUrl === undefined || rawUrl === null) {
      throw new Error('url is required');
    }
    const trimmed = String(rawUrl).trim();
    if (!trimmed) {
      throw new Error('url is required');
    }

    let parsedUrl = null;
    try {
      parsedUrl = new URL(trimmed);
    } catch (_) {
      const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
      const rejectedScheme = schemeMatch ? schemeMatch[1].toLowerCase() : 'none';
      const err = new Error(`URL scheme '${rejectedScheme}' is not allowed`);
      err.code = 'url_scheme_not_allowed';
      err.scheme = rejectedScheme;
      throw err;
    }

    const scheme = parsedUrl.protocol ? parsedUrl.protocol.slice(0, -1).toLowerCase() : 'none';
    if (!ALLOWED_OPEN_URL_SCHEMES.has(parsedUrl.protocol.toLowerCase())) {
      const err = new Error(`URL scheme '${scheme}' is not allowed`);
      err.code = 'url_scheme_not_allowed';
      err.scheme = scheme;
      throw err;
    }

    return parsedUrl.href;
  }

  function validateMaxBytes(maxBytes) {
    if (maxBytes === undefined) {
      return null;
    }
    let num;
    if (typeof maxBytes === 'number') {
      num = maxBytes;
    } else if (typeof maxBytes === 'string' && maxBytes.trim() !== '') {
      num = Number(maxBytes);
    } else {
      const err = new Error('Invalid maxBytes: must be a positive finite number');
      err.code = 'invalid_max_bytes';
      throw err;
    }

    if (isNaN(num) || !Number.isFinite(num) || num <= 0) {
      const err = new Error('Invalid maxBytes: must be a positive finite number');
      err.code = 'invalid_max_bytes';
      throw err;
    }

    return num;
  }

  function getByteLength(content) {
    if (typeof content === 'string') {
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(content).length;
      }
      if (typeof Buffer !== 'undefined') {
        return Buffer.byteLength(content, 'utf-8');
      }
      let bytes = 0;
      for (let i = 0; i < content.length; i++) {
        const code = content.charCodeAt(i);
        if (code <= 0x7f) {
          bytes += 1;
        } else if (code <= 0x7ff) {
          bytes += 2;
        } else if (code >= 0xd800 && code <= 0xdbff) {
          if (i + 1 < content.length) {
            const next = content.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
              bytes += 4;
              i++;
              continue;
            }
          }
          bytes += 3;
        } else {
          bytes += 3;
        }
      }
      return bytes;
    }
    if (content && typeof content.byteLength === 'number') {
      return content.byteLength;
    }
    if (content && typeof content.length === 'number') {
      return content.length;
    }
    return 0;
  }

  async function readBoundedFile(fsHandle, encoding, limit, errorCode = 'file_too_large') {
    if (limit !== null && limit !== undefined) {
      if (typeof fsHandle.stat === 'function') {
        try {
          const stats = await fsHandle.stat();
          if (stats && typeof stats === 'object') {
            const rawSize = stats.size ?? stats.length ?? stats.bytes;
            if (typeof rawSize === 'number' && Number.isFinite(rawSize) && rawSize >= 0) {
              if (rawSize > limit) {
                const err = new Error(`File size (${rawSize} bytes) exceeds limit (${limit} bytes) [${errorCode}]`);
                err.code = errorCode;
                err.limit = limit;
                err.size = rawSize;
                throw err;
              }
            }
          }
        } catch (err) {
          if (err && err.code === errorCode) {
            throw err;
          }
        }
      }
    }

    const content = await fsHandle.readFile(encoding || 'utf-8');

    if (limit !== null && limit !== undefined) {
      const byteLength = getByteLength(content);
      if (byteLength > limit) {
        const err = new Error(`File content size (${byteLength} bytes) exceeds limit (${limit} bytes) [${errorCode}]`);
        err.code = errorCode;
        err.limit = limit;
        err.size = byteLength;
        throw err;
      }
    }

    return content;
  }

  function computePipelineSignature(pipelineData) {
    if (!pipelineData) return '';
    let parsed = pipelineData;
    if (typeof pipelineData === 'string') {
      try {
        parsed = JSON.parse(pipelineData);
      } catch (_) {
        return '';
      }
    }
    const rawSteps = Array.isArray(parsed?.steps) ? parsed.steps : [];
    const normalized = {
      name: parsed?.name || '',
      steps: rawSteps.map(s => ({
        id: s?.id || null,
        intent: s?.intent || s?.action || '',
        payload: s?.payload || s?.data || {},
        continueOnError: !!s?.continueOnError
      }))
    };
    const jsonStr = JSON.stringify(normalized);
    let hash = 0x811c9dc5;
    for (let i = 0; i < jsonStr.length; i++) {
      hash ^= jsonStr.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return 'sig_' + hash.toString(16).padStart(8, '0');
  }

  class RunHistoryStore {
    constructor(router, options = {}) {
      this.router = router;
      this.maxRuns = (options && typeof options.maxRuns === 'number' && options.maxRuns > 0) ? options.maxRuns : 50;
      this.runs = [];
      this.persistenceUri = options.persistenceUri || null;
      this.writePromise = Promise.resolve();
    }

    addRun(run) {
      if (!run || !run.id) return null;
      const normalizedRun = {
        id: String(run.id),
        parentRunId: run.parentRunId ? String(run.parentRunId) : null,
        source: run.source || (run.parentRunId ? 'resume' : 'direct'),
        pipelineUrl: run.pipelineUrl || null,
        pipelineName: run.pipelineName || null,
        pipelineSignature: run.pipelineSignature || null,
        status: run.status || 'running',
        startTime: run.startTime || Date.now(),
        endTime: run.endTime || null,
        logs: Array.isArray(run.logs) ? run.logs : [],
        checkpoint: run.checkpoint || null,
        error: run.error || null
      };

      const existingIndex = this.runs.findIndex(r => r.id === normalizedRun.id);
      if (existingIndex >= 0) {
        this.runs[existingIndex] = normalizedRun;
      } else {
        this.runs.unshift(normalizedRun);
        if (this.runs.length > this.maxRuns) {
          this.runs = this.runs.slice(0, this.maxRuns);
        }
      }
      this.scheduleSave();
      return normalizedRun;
    }

    updateRun(runId, updates = {}) {
      const run = this.getRun(runId);
      if (!run) return null;
      Object.assign(run, updates);
      this.scheduleSave();
      return run;
    }

    updateCheckpoint(runId, checkpoint) {
      const run = this.getRun(runId);
      if (!run) return null;
      run.checkpoint = checkpoint ? Object.assign({}, checkpoint, { timestamp: Date.now() }) : null;
      this.scheduleSave();
      return run;
    }

    getRun(runId) {
      if (!runId) return null;
      return this.runs.find(r => r.id === String(runId)) || null;
    }

    getHistory() {
      return this.runs.slice();
    }

    clearHistory() {
      this.runs = [];
      this.scheduleSave();
    }

    scheduleSave() {
      if (!this.persistenceUri || !this.router) return;
      this.writePromise = this.writePromise.then(async () => {
        try {
          const fsOperation = this.router.requireFs();
          if (!fsOperation) return;
          const jsonContent = JSON.stringify(this.runs, null, 2);
          await fsOperation(this.persistenceUri).writeFile(jsonContent);
        } catch (_) {
          // Ignore persistence errors
        }
      });
    }
  }


  class PipelineRunner {
    constructor(router, options = {}) {
      this.router = router;
      this.maxPipelineBytes = (options && typeof options.maxPipelineBytes === 'number')
        ? options.maxPipelineBytes
        : MAX_PIPELINE_BYTES;
    }

    async runPipelineFromFile(fileUrl, onProgress, options = {}) {
      try {
        const fsOperation = this.router.requireFs();
        if (!fsOperation) throw new Error('File system API unavailable');

        const limit = (options && typeof options.maxPipelineBytes === 'number')
          ? options.maxPipelineBytes
          : (this.maxPipelineBytes || MAX_PIPELINE_BYTES);

        const fsHandle = fsOperation(fileUrl);
        const fileContent = await readBoundedFile(fsHandle, 'utf-8', limit, 'pipeline_too_large');

        const pipelineData = JSON.parse(fileContent);
        const runOptions = Object.assign({ pipelineUrl: fileUrl }, options);
        return await this.runPipelineFromData(pipelineData, onProgress, runOptions);
      } catch (err) {
        this.router.log(`Pipeline run error: ${err.message}`);
        throw err;
      }
    }

    async runPipelineFromData(pipelineData, onProgress, options = {}) {
      if (!pipelineData || !Array.isArray(pipelineData.steps)) {
        throw new Error('Invalid pipeline format: steps array is missing');
      }

      const historyStore = options.historyStore || (this.router && this.router.historyStore);
      const pipelineSignature = computePipelineSignature(pipelineData);
      const runId = options.runId || ('run_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
      const parentRunId = options.parentRunId ? String(options.parentRunId) : null;
      const source = options.source || (parentRunId ? 'resume' : 'direct');
      const pipelineUrl = options.pipelineUrl || null;
      const pipelineName = options.pipelineName || (pipelineUrl ? String(pipelineUrl).split('/').pop() : (pipelineData.name || 'pipeline.intent.json'));
      const startStepIndex = (typeof options.startStepIndex === 'number' && options.startStepIndex >= 0)
        ? options.startStepIndex
        : 0;

      if (historyStore) {
        historyStore.addRun({
          id: runId,
          parentRunId,
          source,
          pipelineUrl,
          pipelineName,
          pipelineSignature,
          status: 'running',
          startTime: Date.now(),
          logs: []
        });
      }

      const totalSteps = pipelineData.steps.length;
      const logs = [];
      const completedSteps = [];
      let lastCompletedStepIndex = null;
      let lastCompletedStepId = null;

      for (let stepIndex = startStepIndex; stepIndex < totalSteps; stepIndex++) {
        const step = pipelineData.steps[stepIndex];
        const intentName = step.intent || step.action;
        const payload = step.payload || step.data || {};
        const stepDisplayNumber = stepIndex + 1;

        if (onProgress) {
          onProgress({ step: stepDisplayNumber, total: totalSteps, status: 'running', intent: intentName, runId });
        }

        const action = intentName ? intentName.replace(/\./g, ':') : '';

        let stepSuccess = false;
        let stepError = null;
        let stepResultData = null;

        try {
          const result = await this.router.route({ action, data: payload });
          if (result && result.success) {
            stepSuccess = true;
            stepResultData = result.data;
          } else {
            stepSuccess = false;
            stepError = (result && result.error) ? result.error : `Step ${stepDisplayNumber} failed`;
            stepResultData = result ? result.data : null;
          }
        } catch (err) {
          stepSuccess = false;
          stepError = err && err.message ? err.message : String(err);
        }

        const stepLog = {
          step: stepDisplayNumber,
          stepIndex,
          stepId: step.id || null,
          intent: intentName,
          success: stepSuccess,
          data: stepResultData,
          error: stepError
        };
        logs.push(stepLog);

        if (stepSuccess) {
          lastCompletedStepIndex = stepIndex;
          lastCompletedStepId = step.id || null;
          completedSteps.push(stepLog);

          const checkpoint = {
            runId,
            parentRunId,
            source,
            pipelineSignature,
            pipelineUrl,
            lastCompletedStepIndex,
            lastCompletedStepId,
            completedStepsCount: completedSteps.length,
            timestamp: Date.now(),
            completedSteps: completedSteps.slice()
          };

          if (historyStore) {
            historyStore.updateCheckpoint(runId, checkpoint);
            historyStore.updateRun(runId, { logs: logs.slice() });
          }
        } else {
          if (historyStore) {
            historyStore.updateRun(runId, {
              status: 'failure',
              endTime: Date.now(),
              logs: logs.slice(),
              error: stepError
            });
          }

          if (!step.continueOnError) {
            if (onProgress) {
              onProgress({ step: stepDisplayNumber, total: totalSteps, status: 'error', error: stepError, runId });
            }
            throw new Error(`Pipeline aborted at step ${stepDisplayNumber} (${intentName}): ${stepError}`);
          }
        }
      }

      if (historyStore) {
        historyStore.updateRun(runId, {
          status: 'success',
          endTime: Date.now(),
          logs: logs.slice()
        });
      }

      if (onProgress) {
        onProgress({ step: totalSteps, total: totalSteps, status: 'success', runId });
      }

      const finalRun = historyStore ? historyStore.getRun(runId) : null;
      return {
        runId,
        parentRunId,
        source,
        success: true,
        logs,
        checkpoint: finalRun ? finalRun.checkpoint : null
      };
    }
  }


  class PipelineUI {
    constructor(router, options = {}) {
      this.router = router;
      this.batchSize = (options && typeof options.batchSize === 'number' && options.batchSize > 0)
        ? options.batchSize
        : DEFAULT_PIPELINE_BATCH_SIZE;
      this.$container = null;
      this.$cardsContainer = null;
      this.$counter = null;
      this.$loadMoreBtn = null;
      this.pipelineFiles = [];
      this.renderedCount = 0;
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
      if (window.addedFolder && window.addedFolder.length > 0) {
        return window.addedFolder[0].url;
      }
      return null;
    }

    async loadPipelines() {
      this.pipelineFiles = [];
      this.renderedCount = 0;

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

      const headerLeft = document.createElement('div');
      headerLeft.style.display = 'flex';
      headerLeft.style.flexDirection = 'column';
      headerLeft.style.gap = '4px';

      const title = document.createElement('h3');
      title.textContent = 'Project Pipelines';
      title.style.margin = '0';

      this.$counter = document.createElement('span');
      this.$counter.style.fontSize = '0.85em';
      this.$counter.style.color = 'var(--text-color, #ccc)';

      headerLeft.appendChild(title);
      headerLeft.appendChild(this.$counter);

      header.appendChild(headerLeft);
      header.appendChild(refreshBtn);

      this.$cardsContainer = document.createElement('div');
      this.$cardsContainer.style.display = 'flex';
      this.$cardsContainer.style.flexDirection = 'column';
      this.$cardsContainer.style.gap = '12px';

      this.$loadMoreBtn = document.createElement('button');
      this.$loadMoreBtn.textContent = 'Load More';
      this.$loadMoreBtn.style.padding = '8px 16px';
      this.$loadMoreBtn.style.background = 'transparent';
      this.$loadMoreBtn.style.border = '1px solid var(--primary-color)';
      this.$loadMoreBtn.style.color = 'var(--primary-color)';
      this.$loadMoreBtn.style.borderRadius = '4px';
      this.$loadMoreBtn.style.alignSelf = 'center';
      this.$loadMoreBtn.style.display = 'none';
      this.$loadMoreBtn.onclick = () => this.renderNextBatch();

      this.$container.innerHTML = '';
      this.$container.appendChild(header);
      this.$container.appendChild(this.$cardsContainer);
      this.$container.appendChild(this.$loadMoreBtn);

      try {
        const fsOperation = this.router.requireFs();
        if (!fsOperation) throw new Error('File system API unavailable');

        const folder = fsOperation(pipelineFolderUrl);
        const exists = await folder.exists();

        if (!exists) {
          this.$cardsContainer.innerHTML = `<div style="padding: 16px; background: rgba(0,0,0,0.1); border-radius: 4px;">
            No pipeline directory found (${pipelineFolderUrl}).
          </div>`;
          return;
        }

        const files = await folder.lsDir();
        const pipelineFiles = files.filter(f => f.name && f.name.endsWith('.intent.json'))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        this.pipelineFiles = pipelineFiles;

        if (pipelineFiles.length === 0) {
          this.$cardsContainer.innerHTML = '<div style="padding: 16px; background: rgba(0,0,0,0.1); border-radius: 4px;">No *.intent.json files found in pipeline directory.</div>';
          return;
        }

        this.renderNextBatch();

      } catch (err) {
        this.$cardsContainer.innerHTML = `<div style="padding: 16px; color: #f44336; background: rgba(244,67,54,0.1); border-radius: 4px;">
          Error loading pipelines: ${this.router.escapeHtml(err.message)}
        </div>`;
      }
    }

    renderNextBatch() {
      if (!this.$cardsContainer || this.renderedCount >= this.pipelineFiles.length) {
        if (this.$loadMoreBtn) this.$loadMoreBtn.style.display = 'none';
        return;
      }

      const start = this.renderedCount;
      const end = Math.min(start + this.batchSize, this.pipelineFiles.length);
      const batch = this.pipelineFiles.slice(start, end);

      const fragment = document.createDocumentFragment();
      for (const file of batch) {
        fragment.appendChild(this.createPipelineCard(file));
      }

      this.$cardsContainer.appendChild(fragment);
      this.renderedCount = end;

      this.updatePaginationUI();
    }

    updatePaginationUI() {
      const total = this.pipelineFiles.length;
      if (this.$counter) {
        this.$counter.textContent = total > 0 ? `Showing ${this.renderedCount} of ${total} pipelines` : '';
      }
      if (this.$loadMoreBtn) {
        if (this.renderedCount < total) {
          this.$loadMoreBtn.style.display = 'block';
          this.$loadMoreBtn.textContent = `Load More (${total - this.renderedCount} remaining)`;
        } else {
          this.$loadMoreBtn.style.display = 'none';
        }
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

      const nameContainer = document.createElement('div');
      nameContainer.style.display = 'flex';
      nameContainer.style.alignItems = 'center';

      const name = document.createElement('strong');
      name.textContent = file.name;
      nameContainer.appendChild(name);

      const historyStore = this.router && this.router.historyStore;
      const historyRuns = historyStore ? historyStore.getHistory() : [];
      const resumableRun = historyRuns.find(r =>
        (r.pipelineUrl === file.url || r.pipelineName === file.name) &&
        r.status !== 'success' &&
        r.checkpoint &&
        typeof r.checkpoint.lastCompletedStepIndex === 'number' &&
        r.checkpoint.lastCompletedStepIndex >= 0
      );

      if (resumableRun) {
        const badge = document.createElement('span');
        badge.textContent = 'Resumable';
        badge.style.background = 'var(--warning-color, #ff9800)';
        badge.style.color = '#000';
        badge.style.fontSize = '0.75em';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '3px';
        badge.style.marginLeft = '8px';
        badge.style.fontWeight = 'bold';
        nameContainer.appendChild(badge);
      }

      header.appendChild(nameContainer);

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

      const statusArea = document.createElement('div');
      statusArea.style.fontSize = '0.9em';
      statusArea.style.color = 'var(--text-color, #ccc)';
      statusArea.style.display = 'none';

      if (resumableRun) {
        const resumeBtn = document.createElement('button');
        resumeBtn.textContent = 'Resume';
        resumeBtn.style.padding = '6px 12px';
        resumeBtn.style.background = 'var(--warning-color, #ff9800)';
        resumeBtn.style.border = 'none';
        resumeBtn.style.color = '#000';
        resumeBtn.style.borderRadius = '4px';
        resumeBtn.style.fontWeight = 'bold';

        resumeBtn.onclick = () => {
          runBtn.disabled = true;
          openBtn.disabled = true;
          resumeBtn.disabled = true;
          runBtn.style.opacity = '0.5';
          resumeBtn.style.opacity = '0.5';
          statusArea.style.display = 'block';
          statusArea.style.color = '#fff';
          statusArea.innerHTML = `Resuming from step ${resumableRun.checkpoint.lastCompletedStepIndex + 2} (Parent: ${resumableRun.id})...`;

          this.router.route({
            action: 'router:resume_run',
            data: {
              runId: resumableRun.id,
              onProgress: (progress) => {
                if (progress.status === 'running') {
                  statusArea.innerHTML = `Resumed Step ${progress.step}/${progress.total}: ${progress.intent} - Running...`;
                } else if (progress.status === 'success') {
                  statusArea.style.color = '#4caf50';
                  statusArea.innerHTML = `Success! (${progress.total}/${progress.total} steps completed)`;
                } else if (progress.status === 'error') {
                  statusArea.style.color = '#f44336';
                  statusArea.innerHTML = `Failed at step ${progress.step}: ${this.router.escapeHtml(progress.error)}`;
                }
              }
            }
          }).then(res => {
            runBtn.disabled = false;
            openBtn.disabled = false;
            resumeBtn.disabled = false;
            runBtn.style.opacity = '1';
            resumeBtn.style.opacity = '1';
            if (!res || !res.success) {
              statusArea.style.color = '#f44336';
              statusArea.innerHTML = `Resume error: ${this.router.escapeHtml(res ? res.error : 'Unknown error')}`;
            }
          }).catch(err => {
            runBtn.disabled = false;
            openBtn.disabled = false;
            resumeBtn.disabled = false;
            runBtn.style.opacity = '1';
            resumeBtn.style.opacity = '1';
            statusArea.style.color = '#f44336';
            statusArea.innerHTML = `Resume error: ${this.router.escapeHtml(err.message)}`;
          });
        };
        controls.appendChild(resumeBtn);
      }

      controls.appendChild(runBtn);

      header.appendChild(controls);
      card.appendChild(header);
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
      this.historyStore = new RunHistoryStore(this);
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
        if (typeof window.toast === 'function') return window.toast(String(message), timeout);
      } catch (_) {}
    }

    alert(title, message) {
      try {
        if (typeof this.modules.alert === 'function') return this.modules.alert(String(title), String(message));
      } catch (_) {}
      window.alert(`${title}\n\n${message}`);
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
              value = window.prompt(`Value for ${promptText}`);
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
        const meta = { action };
        if (error && typeof error === 'object') {
          if (error.code) meta.code = error.code;
          if (error.limit !== undefined) meta.limit = error.limit;
          if (error.size !== undefined) meta.size = error.size;
          if (error.scheme !== undefined) meta.scheme = error.scheme;
        }
        return this.fail(message, meta);
      }
    }

    requireFs() {
      if (!this.modules.fs) throw new Error('Acode fs API is unavailable');
      return this.modules.fs;
    }

    getEditor() {
      if (!window.editorManager || !editorManager.editor) throw new Error('Editor unavailable');
      return editorManager.editor;
    }

    setupCommands() {
      this.commands.clear();

      this.register('router:list', () => Array.from(this.commands.keys()).sort());
      this.register('router:logs', () => this.logs.slice());
      this.register('router:clear_logs', () => { this.logs = []; return { cleared: true }; });
      this.register('router:capabilities', () => ({
        pluginId: PLUGIN_ID,
        version: PLUGIN_VERSION,
        fs: !!this.modules.fs,
        commands: !!this.modules.commands,
        terminal: !!this.modules.terminal,
        editor: !!(window.editorManager && editorManager.editor),
        network: typeof fetch === 'function'
      }));

      this.register('router:run_history', (data = {}) => {
        if (data.runId) {
          const run = this.historyStore.getRun(data.runId);
          if (!run) {
            const err = new Error(`Run not found: ${data.runId}`);
            err.code = 'run_not_found';
            throw err;
          }
          return run;
        }
        return this.historyStore.getHistory();
      });

      const resumeHandler = async (data = {}) => {
        const runId = data.runId || data.parentRunId;
        if (!runId) {
          const err = new Error('runId is required to resume a pipeline run');
          err.code = 'resume_missing_run_id';
          throw err;
        }

        const parentRun = this.historyStore.getRun(runId);
        if (!parentRun) {
          const err = new Error(`Run not found in history: ${runId}`);
          err.code = 'resume_run_not_found';
          throw err;
        }

        if (parentRun.status === 'success') {
          const err = new Error(`Run ${runId} already completed successfully and cannot be resumed`);
          err.code = 'resume_not_eligible';
          throw err;
        }

        const checkpoint = parentRun.checkpoint;
        if (!checkpoint || typeof checkpoint.lastCompletedStepIndex !== 'number' || checkpoint.lastCompletedStepIndex < 0) {
          const err = new Error(`Run ${runId} has no valid checkpoint to resume from`);
          err.code = 'resume_invalid_checkpoint';
          throw err;
        }

        const pipelineUrl = checkpoint.pipelineUrl || parentRun.pipelineUrl || data.pipelineUrl;
        if (!pipelineUrl) {
          const err = new Error(`Pipeline URL missing in run checkpoint for ${runId}`);
          err.code = 'resume_pipeline_url_missing';
          throw err;
        }

        let currentContent;
        try {
          const fsOperation = this.requireFs();
          if (!fsOperation) throw new Error('File system API unavailable');
          const fsHandle = fsOperation(pipelineUrl);
          const limit = data.maxPipelineBytes || this.pipelineRunner.maxPipelineBytes || MAX_PIPELINE_BYTES;
          currentContent = await readBoundedFile(fsHandle, 'utf-8', limit, 'pipeline_too_large');
        } catch (err) {
          const error = new Error(`Failed to read pipeline file for resume (${pipelineUrl}): ${err.message}`);
          error.code = 'resume_pipeline_not_found';
          throw error;
        }

        let currentPipelineData;
        try {
          currentPipelineData = JSON.parse(currentContent);
        } catch (err) {
          const error = new Error(`Failed to parse pipeline file for resume: ${err.message}`);
          error.code = 'resume_invalid_pipeline_json';
          throw error;
        }

        const currentSignature = computePipelineSignature(currentPipelineData);
        if (currentSignature !== checkpoint.pipelineSignature) {
          const err = new Error(`Pipeline content changed since checkpoint (expected ${checkpoint.pipelineSignature}, got ${currentSignature})`);
          err.code = 'resume_pipeline_changed';
          err.expectedSignature = checkpoint.pipelineSignature;
          err.actualSignature = currentSignature;
          throw err;
        }

        const lastIndex = checkpoint.lastCompletedStepIndex;
        const steps = currentPipelineData.steps;
        if (!Array.isArray(steps) || lastIndex >= steps.length) {
          const err = new Error(`Checkpoint last completed step index (${lastIndex}) is out of bounds for pipeline steps (${steps ? steps.length : 0})`);
          err.code = 'resume_step_not_found';
          throw err;
        }

        if (checkpoint.lastCompletedStepId) {
          const stepAtLastIndex = steps[lastIndex];
          if (!stepAtLastIndex || stepAtLastIndex.id !== checkpoint.lastCompletedStepId) {
            const err = new Error(`Checkpoint step ID mismatch at index ${lastIndex} (expected ${checkpoint.lastCompletedStepId}, got ${stepAtLastIndex ? stepAtLastIndex.id : 'null'})`);
            err.code = 'resume_step_not_found';
            throw err;
          }
        }

        const nextStepIndex = lastIndex + 1;
        if (nextStepIndex >= steps.length) {
          const err = new Error(`No remaining steps to execute in pipeline (completed ${lastIndex + 1}/${steps.length})`);
          err.code = 'resume_no_remaining_steps';
          throw err;
        }

        const runOptions = {
          parentRunId: parentRun.id,
          source: 'resume',
          pipelineUrl,
          startStepIndex: nextStepIndex,
          historyStore: this.historyStore
        };

        if (this.runQueue && typeof this.runQueue.enqueue === 'function') {
          return await this.runQueue.enqueue(() =>
            this.pipelineRunner.runPipelineFromData(currentPipelineData, data.onProgress, runOptions)
          );
        }

        return await this.pipelineRunner.runPipelineFromData(currentPipelineData, data.onProgress, runOptions);
      };

      this.register('router:resume_run', resumeHandler);
      this.register('router:resume', resumeHandler);

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
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
          return { copied: true, method: 'navigator.clipboard' };
        }
        const clipboard = window.cordova?.plugins?.clipboard;
        if (!clipboard || typeof clipboard.copy !== 'function') throw new Error('Clipboard API unavailable');
        await new Promise((resolve, reject) => clipboard.copy(value, resolve, reject));
        return { copied: true, method: 'cordova' };
      });

      this.register('system:open_url', (data) => {
        if (!data || !data.url) throw new Error('url is required');
        const validUrl = validateOpenUrl(data.url);
        window.open(validUrl, '_system');
        return { opened: true };
      });

      this.register('file:read', async (data) => {
        if (!data.path) throw new Error('path is required');
        const limit = validateMaxBytes(data.maxBytes);
        const fsHandle = this.requireFs()(data.path);
        return await readBoundedFile(fsHandle, data.encoding || 'utf-8', limit, 'file_too_large');
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

      this.register('editor:list_files', () => (editorManager.files || []).map((file) => ({
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
        const limit = data.maxBytes !== undefined ? validateMaxBytes(data.maxBytes) : DEFAULT_EDITOR_MAX_BYTES;
        const fsHandle = this.requireFs()(data.path);
        const text = await readBoundedFile(fsHandle, data.encoding || 'utf-8', limit, 'editor_file_too_large');
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
      if (window.intentRouter === this) delete window.intentRouter;
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
      MAX_PIPELINE_BYTES,
      DEFAULT_EDITOR_MAX_BYTES,
      DEFAULT_PIPELINE_BATCH_SIZE,
      computePipelineSignature,
      RunHistoryStore,
      PipelineRunner,
      PipelineUI,
      IntentRouter,
      validateMaxBytes,
      validateOpenUrl,
      getByteLength,
      readBoundedFile
    };
  }
})();
