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

  function buildOpenAiCompatibleUrl(baseUrl) {
    if (!baseUrl || typeof baseUrl !== 'string') {
      throw new Error('baseUrl is required and must be a string');
    }
    let url = baseUrl.trim();
    if (url.endsWith('/chat/completions') || url.endsWith('/chat/completions/')) {
      return url.replace(/\/+$/, '');
    }
    url = url.replace(/\/+$/, '');
    return `${url}/chat/completions`;
  }

  function buildOpenAiCompatibleRequest(providerConfig, payload) {
    if (!providerConfig || typeof providerConfig !== 'object') {
      throw new Error('providerConfig is required');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('payload is required');
    }
    const url = buildOpenAiCompatibleUrl(providerConfig.baseUrl);
    const headers = { 'Content-Type': 'application/json' };

    if (providerConfig.secret && typeof providerConfig.secret === 'string' && providerConfig.secret.trim() !== '') {
      headers.Authorization = `Bearer ${providerConfig.secret.trim()}`;
    }

    const model = payload.model || providerConfig.model;
    const bodyObj = {
      model,
      messages: payload.messages
    };

    if (typeof payload.temperature === 'number') {
      bodyObj.temperature = payload.temperature;
    }
    const maxTok = payload.maxTokens !== undefined ? payload.maxTokens : payload.max_tokens;
    if (typeof maxTok === 'number') {
      bodyObj.max_tokens = maxTok;
    }

    return {
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj)
    };
  }

  function normalizeOpenAiCompatibleResponse(rawResponse, providerId) {
    let data = rawResponse;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (_) {
        const err = new Error('Invalid JSON response from AI provider');
        err.code = 'ai_invalid_response';
        err.provider = providerId;
        throw err;
      }
    }

    if (data && typeof data === 'object' && data.body !== undefined && data.status !== undefined) {
      data = data.body;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (_) {
          const err = new Error('Invalid JSON response from AI provider');
          err.code = 'ai_invalid_response';
          err.provider = providerId;
          throw err;
        }
      }
    }

    if (!data || typeof data !== 'object' || !Array.isArray(data.choices) || data.choices.length === 0) {
      const err = new Error('AI provider response missing choices array');
      err.code = 'ai_invalid_response';
      err.provider = providerId;
      throw err;
    }

    const choice = data.choices[0];
    const messageObj = choice ? (choice.message || choice.delta) : null;
    const content = messageObj ? messageObj.content : null;

    if (content === null || content === undefined) {
      const err = new Error('AI provider response missing message content');
      err.code = 'ai_invalid_response';
      err.provider = providerId;
      throw err;
    }

    const result = {
      provider: providerId || 'unknown',
      model: data.model || 'unknown',
      content: String(content)
    };

    if (data.usage && typeof data.usage === 'object') {
      result.usage = data.usage;
    }

    const finishReason = choice.finish_reason || choice.finishReason;
    if (finishReason) {
      result.finishReason = finishReason;
    }

    return result;
  }

  function redactSensitiveData(input, secrets = []) {
    if (!input) return input;
    const secretList = (Array.isArray(secrets) ? secrets : [secrets])
      .filter(s => typeof s === 'string' && s.trim().length > 0);

    if (secretList.length === 0) return input;

    if (typeof input === 'string') {
      let result = input;
      for (const secret of secretList) {
        if (secret) {
          result = result.split(secret).join('[REDACTED]');
        }
      }
      return result;
    }

    if (typeof input === 'object' && input !== null) {
      if (Array.isArray(input)) {
        return input.map(item => redactSensitiveData(item, secretList));
      }
      const copy = {};
      for (const key of Object.keys(input)) {
        if (['secret', 'token', 'apiKey', 'authorization', 'Authorization'].includes(key)) {
          copy[key] = '[REDACTED]';
        } else {
          copy[key] = redactSensitiveData(input[key], secretList);
        }
      }
      return copy;
    }

    return input;
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
        return await this.runPipelineFromData(pipelineData, onProgress);
      } catch (err) {
        this.router.log(`Pipeline run error: ${err.message}`);
        throw err;
      }
    }

    async runPipelineFromData(pipelineData, onProgress) {
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

        let stepSuccess = false;
        let stepError = null;

        try {
          const result = await this.router.route({ action, data: payload });
          if (result && result.success) {
            stepSuccess = true;
            logs.push({ step: stepIndex, intent: intentName, success: true, data: result.data, error: result.error || null });
          } else {
            stepSuccess = false;
            stepError = (result && result.error) ? result.error : `Step ${stepIndex} failed`;
            logs.push({ step: stepIndex, intent: intentName, success: false, data: result ? result.data : null, error: stepError });
          }
        } catch (err) {
          stepSuccess = false;
          stepError = err && err.message ? err.message : String(err);
          logs.push({ step: stepIndex, intent: intentName, success: false, data: null, error: stepError });
        }

        if (!stepSuccess && !step.continueOnError) {
          if (onProgress) {
            onProgress({ step: stepIndex, total: totalSteps, status: 'error', error: stepError });
          }
          throw new Error(`Pipeline aborted at step ${stepIndex} (${intentName}): ${stepError}`);
        }
      }

      if (onProgress) {
        onProgress({ step: stepIndex, total: totalSteps, status: 'success' });
      }

      return { success: true, logs };
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
      this.aiProviders = new Map();
      this.logs = [];
      this.isInitialized = false;
      this.$page = null;
      this.baseUrl = null;
      this.context = null;
      this.modules = {};
      this.registeredAcodeCommands = [];
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

    registerAiProvider(id, config = {}) {
      if (!id || typeof id !== 'string') throw new Error('AI provider id is required');
      if (!config.baseUrl || typeof config.baseUrl !== 'string') throw new Error('AI provider baseUrl is required');
      if (!config.model || typeof config.model !== 'string') throw new Error('AI provider model is required');

      const secret = config.secret || config.apiKey || config.token || '';
      const providerProfile = {
        id,
        baseUrl: config.baseUrl,
        model: config.model,
        secret: String(secret),
        enabled: config.enabled !== false
      };
      this.aiProviders.set(id, providerProfile);
      this.log(`Registered AI provider: ${id}`);
      return { id, registered: true };
    }

    unregisterAiProvider(id) {
      const existed = this.aiProviders.delete(id);
      if (existed) this.log(`Unregistered AI provider: ${id}`);
      return existed;
    }

    getAiProvider(id) {
      return this.aiProviders.get(id) || null;
    }

    listAiProviders() {
      const list = [];
      for (const profile of this.aiProviders.values()) {
        list.push({
          id: profile.id,
          baseUrl: profile.baseUrl,
          model: profile.model,
          enabled: profile.enabled
        });
      }
      return list;
    }

    log(message) {
      const secrets = Array.from(this.aiProviders.values())
        .map(p => p.secret)
        .filter(s => Boolean(s));
      const redactedMessage = redactSensitiveData(String(message), secrets);
      const entry = `[${new Date().toISOString()}] ${redactedMessage}`;
      this.logs.push(entry);
      if (this.logs.length > 200) this.logs.shift();
      console.log(`[Intent Router] ${redactedMessage}`);
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
        const secrets = Array.from(this.aiProviders.values()).map(p => p.secret).filter(Boolean);
        const safeMessage = redactSensitiveData(message, secrets);
        this.log(`Error executing ${action}: ${safeMessage}`);
        const meta = { action };
        if (error && typeof error === 'object') {
          if (error.code) meta.code = error.code;
          if (error.provider) meta.provider = error.provider;
          if (error.limit !== undefined) meta.limit = error.limit;
          if (error.size !== undefined) meta.size = error.size;
          if (error.scheme !== undefined) meta.scheme = error.scheme;
        }
        return this.fail(safeMessage, meta);
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

      this.register('router:ai_providers', () => this.listAiProviders());

      this.register('ai:chat', async (data) => {
        if (!data || typeof data !== 'object') {
          const err = new Error('Payload is required');
          err.code = 'invalid_ai_payload';
          throw err;
        }
        const providerId = data.provider;
        if (!providerId || typeof providerId !== 'string') {
          const err = new Error('provider is required');
          err.code = 'ai_provider_unavailable';
          throw err;
        }
        const provider = this.getAiProvider(providerId);
        if (!provider || !provider.enabled) {
          const err = new Error(`AI provider "${providerId}" is unavailable or disabled`);
          err.code = 'ai_provider_unavailable';
          err.provider = providerId;
          throw err;
        }
        if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
          const err = new Error('messages must be a non-empty array');
          err.code = 'invalid_ai_payload';
          err.provider = providerId;
          throw err;
        }

        const reqData = buildOpenAiCompatibleRequest(provider, data);
        let routed;
        try {
          routed = await this.route({
            action: 'network:request',
            data: reqData
          });
        } catch (networkErr) {
          const err = new Error(`Network error calling AI provider ${providerId}: ${networkErr.message}`);
          err.code = networkErr.code || 'ai_provider_unavailable';
          err.provider = providerId;
          throw err;
        }

        if (!routed || !routed.success) {
          const errMsg = (routed && routed.error) ? routed.error : 'Network request failed';
          if (errMsg.includes('HTTP 401') || errMsg.includes('HTTP 403')) {
            const err = new Error(`Authentication failed for AI provider ${providerId}`);
            err.code = 'ai_auth_failed';
            err.provider = providerId;
            throw err;
          }
          const err = new Error(`AI provider ${providerId} request failed: ${errMsg}`);
          err.code = (routed && routed.metadata && routed.metadata.code) || 'ai_provider_unavailable';
          err.provider = providerId;
          throw err;
        }

        return normalizeOpenAiCompatibleResponse(routed.data, providerId);
      });

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
      PipelineRunner,
      PipelineUI,
      IntentRouter,
      validateMaxBytes,
      validateOpenUrl,
      buildOpenAiCompatibleUrl,
      buildOpenAiCompatibleRequest,
      normalizeOpenAiCompatibleResponse,
      redactSensitiveData,
      getByteLength,
      readBoundedFile
    };
  }
})();
