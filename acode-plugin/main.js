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


  function actionToIntent(action) {
    if (typeof action !== 'string') return '';
    return action.trim().replace(/:/g, '.');
  }

  function intentToAction(intent) {
    if (typeof intent !== 'string') return '';
    return intent.trim().replace(/\./g, ':');
  }

  function filterRoutableActions(actions) {
    if (!actions) return [];
    const list = Array.isArray(actions)
      ? actions
      : (actions instanceof Map || actions instanceof Set ? Array.from(actions.keys()) : Object.keys(actions));

    return list
      .filter(action => typeof action === 'string' && !action.startsWith('router:'))
      .sort((a, b) => a.localeCompare(b));
  }

  function sanitizePipelineFilename(rawName) {
    if (typeof rawName !== 'string') {
      const err = new Error('Pipeline filename must be a non-empty string');
      err.code = 'invalid_pipeline_filename';
      throw err;
    }

    let trimmed = rawName.trim();
    if (!trimmed) {
      const err = new Error('Pipeline filename cannot be empty');
      err.code = 'invalid_pipeline_filename';
      throw err;
    }

    // Detect path traversal or path separators
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
      // Strip path directories to extract base name
      const parts = trimmed.split(/[/\\]/);
      trimmed = parts[parts.length - 1].replace(/\.\./g, '');
    }

    // Sanitize unsafe filename characters
    let safeBase = trimmed.replace(/[^\w\.-]/g, '_').replace(/^_+|_+$/g, '');
    if (!safeBase) safeBase = 'pipeline';

    // Strip existing .intent.json suffix if present before appending
    if (safeBase.endsWith('.intent.json')) {
      safeBase = safeBase.slice(0, -12);
    } else if (safeBase.endsWith('.json')) {
      safeBase = safeBase.slice(0, -5);
    }

    if (!safeBase) safeBase = 'pipeline';

    const fileName = `${safeBase}.intent.json`;
    return {
      safeName: safeBase,
      fileName,
      relativePath: `pipeline/${fileName}`
    };
  }

  function validatePipelineStructure(pipelineData) {
    const errors = [];

    if (!pipelineData || typeof pipelineData !== 'object' || Array.isArray(pipelineData)) {
      const err = new Error('Invalid pipeline structure: pipelineData must be a non-null object');
      err.code = 'invalid_pipeline_structure';
      err.errors = ['pipelineData must be a non-null object'];
      throw err;
    }

    if (!Array.isArray(pipelineData.steps)) {
      errors.push('pipelineData.steps must be an array');
    } else {
      const stepIds = new Set();
      pipelineData.steps.forEach((step, idx) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
          errors.push(`step[${idx}] must be a non-null object`);
          return;
        }

        if (typeof step.id !== 'string' || !step.id.trim()) {
          step.id = `step_${idx + 1}`;
        }

        if (stepIds.has(step.id)) {
          errors.push(`step[${idx}].id "${step.id}" is duplicate`);
        } else {
          stepIds.add(step.id);
        }

        if (typeof step.intent !== 'string' || !step.intent.trim()) {
          errors.push(`step[${idx}].intent must be a non-empty string`);
        }

        if (!step.payload || typeof step.payload !== 'object' || Array.isArray(step.payload)) {
          errors.push(`step[${idx}].payload must be a non-null non-array object`);
        }

        if (step.continueOnError !== undefined && typeof step.continueOnError !== 'boolean') {
          errors.push(`step[${idx}].continueOnError must be a boolean`);
        }

        if (step.onFailure !== undefined && step.onFailure !== null) {
          if (typeof step.onFailure !== 'string') {
            errors.push(`step[${idx}].onFailure must be a string step ID`);
          }
        }
      });

      // Second pass for onFailure targets validation
      if (errors.length === 0) {
        pipelineData.steps.forEach((step, idx) => {
          if (step && step.onFailure && !stepIds.has(step.onFailure)) {
            errors.push(`step[${idx}].onFailure target ID "${step.onFailure}" does not exist in pipeline steps`);
          }
        });
      }
    }

    if (errors.length > 0) {
      const err = new Error(`Invalid pipeline structure: ${errors.join('; ')}`);
      err.code = 'invalid_pipeline_structure';
      err.errors = errors;
      throw err;
    }

    return true;
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
      validatePipelineStructure(pipelineData);

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


  class PipelineBuilderUI {
    constructor(router) {
      this.router = router;
      this.$container = null;
      this.pipelineName = 'new-pipeline';
      this.steps = [
        { id: 'step_1', action: 'file:read', rawPayload: '{\n  "path": "package.json"\n}' }
      ];
      this.previewElement = null;
      this.validationErrorElement = null;
    }

    async render() {
      if (!this.router.$page) {
        this.router.alert('Error', 'UI page is not initialized.');
        return;
      }

      this.router.$page.settitle('New Pipeline');
      this.router.$page.innerHTML = '';

      this.$container = document.createElement('div');
      this.$container.style.padding = '16px';
      this.$container.style.color = 'var(--primary-text-color, #fff)';
      this.$container.style.display = 'flex';
      this.$container.style.flexDirection = 'column';
      this.$container.style.gap = '16px';
      this.$container.style.height = '100%';
      this.$container.style.overflow = 'auto';

      this.router.$page.append(this.$container);
      this.buildUI();

      if (typeof this.router.$page.show === 'function') {
        this.router.$page.show();
      }
    }

    buildUI() {
      if (!this.$container) return;
      this.$container.innerHTML = '';

      // Header
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const title = document.createElement('h3');
      title.textContent = 'Pipeline Builder';
      title.style.margin = '0';

      const backBtn = document.createElement('button');
      backBtn.textContent = 'Back to Pipelines';
      backBtn.style.padding = '6px 12px';
      backBtn.style.background = 'transparent';
      backBtn.style.border = '1px solid var(--primary-color, #2196f3)';
      backBtn.style.color = 'var(--primary-color, #2196f3)';
      backBtn.style.borderRadius = '4px';
      backBtn.onclick = () => this.router.pipelineUI.render();

      header.appendChild(title);
      header.appendChild(backBtn);
      this.$container.appendChild(header);

      // Name Input Field
      const nameSection = document.createElement('div');
      nameSection.style.display = 'flex';
      nameSection.style.flexDirection = 'column';
      nameSection.style.gap = '6px';

      const nameLabel = document.createElement('label');
      nameLabel.textContent = 'Pipeline Name:';
      nameLabel.style.fontWeight = 'bold';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = this.pipelineName;
      nameInput.placeholder = 'my-pipeline-name';
      nameInput.style.padding = '8px';
      nameInput.style.borderRadius = '4px';
      nameInput.style.border = '1px solid var(--border-color, #444)';
      nameInput.style.background = 'var(--secondary-color, #222)';
      nameInput.style.color = 'inherit';
      nameInput.oninput = (e) => {
        this.pipelineName = e.target.value;
        this.updatePreview();
      };

      nameSection.appendChild(nameLabel);
      nameSection.appendChild(nameInput);
      this.$container.appendChild(nameSection);

      // Steps Header & Add Button
      const stepsHeader = document.createElement('div');
      stepsHeader.style.display = 'flex';
      stepsHeader.style.justifyContent = 'space-between';
      stepsHeader.style.alignItems = 'center';

      const stepsTitle = document.createElement('h4');
      stepsTitle.textContent = 'Steps Sequence';
      stepsTitle.style.margin = '0';

      const addStepBtn = document.createElement('button');
      addStepBtn.textContent = '+ Add Step';
      addStepBtn.style.padding = '6px 12px';
      addStepBtn.style.background = 'var(--primary-color, #2196f3)';
      addStepBtn.style.color = '#fff';
      addStepBtn.style.border = 'none';
      addStepBtn.style.borderRadius = '4px';
      addStepBtn.onclick = () => {
        const availableActions = filterRoutableActions(this.router.commands);
        const defaultAction = availableActions.length > 0 ? availableActions[0] : 'file:read';
        this.steps.push({
          id: `step_${this.steps.length + 1}`,
          action: defaultAction,
          rawPayload: '{}'
        });
        this.buildUI();
      };

      stepsHeader.appendChild(stepsTitle);
      stepsHeader.appendChild(addStepBtn);
      this.$container.appendChild(stepsHeader);

      // Steps Container
      const stepsContainer = document.createElement('div');
      stepsContainer.style.display = 'flex';
      stepsContainer.style.flexDirection = 'column';
      stepsContainer.style.gap = '12px';

      const availableActions = filterRoutableActions(this.router.commands);

      this.steps.forEach((step, index) => {
        stepsContainer.appendChild(this.createStepCard(step, index, availableActions));
      });

      this.$container.appendChild(stepsContainer);

      // Live JSON Preview Section
      const previewSection = document.createElement('div');
      previewSection.style.display = 'flex';
      previewSection.style.flexDirection = 'column';
      previewSection.style.gap = '6px';

      const previewLabel = document.createElement('label');
      previewLabel.textContent = 'Generated JSON Preview:';
      previewLabel.style.fontWeight = 'bold';

      this.previewElement = document.createElement('pre');
      this.previewElement.style.padding = '12px';
      this.previewElement.style.background = 'rgba(0,0,0,0.3)';
      this.previewElement.style.borderRadius = '4px';
      this.previewElement.style.overflow = 'auto';
      this.previewElement.style.maxHeight = '200px';
      this.previewElement.style.fontSize = '0.85em';
      this.previewElement.style.whiteSpace = 'pre-wrap';

      previewSection.appendChild(previewLabel);
      previewSection.appendChild(this.previewElement);
      this.$container.appendChild(previewSection);

      // Validation Diagnostic Area
      this.validationErrorElement = document.createElement('div');
      this.validationErrorElement.style.padding = '10px';
      this.validationErrorElement.style.borderRadius = '4px';
      this.validationErrorElement.style.background = 'rgba(244,67,54,0.15)';
      this.validationErrorElement.style.border = '1px solid #f44336';
      this.validationErrorElement.style.color = '#f44336';
      this.validationErrorElement.style.display = 'none';
      this.$container.appendChild(this.validationErrorElement);

      // Action Footer (Save Button)
      const footer = document.createElement('div');
      footer.style.display = 'flex';
      footer.style.justifyContent = 'flex-end';
      footer.style.gap = '12px';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save Pipeline';
      saveBtn.style.padding = '10px 20px';
      saveBtn.style.background = '#4caf50';
      saveBtn.style.color = '#fff';
      saveBtn.style.border = 'none';
      saveBtn.style.borderRadius = '4px';
      saveBtn.style.fontWeight = 'bold';
      saveBtn.onclick = () => this.savePipeline();

      footer.appendChild(saveBtn);
      this.$container.appendChild(footer);

      this.updatePreview();
    }

    createStepCard(step, index, availableActions) {
      const card = document.createElement('div');
      card.style.background = 'var(--secondary-color, rgba(0,0,0,0.2))';
      card.style.padding = '12px';
      card.style.borderRadius = '6px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '8px';
      card.style.border = '1px solid var(--border-color, rgba(255,255,255,0.1))';

      // Card Header (Step Index & Reorder / Remove Controls)
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const stepTitle = document.createElement('strong');
      stepTitle.textContent = `Step ${index + 1}`;

      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '6px';

      const moveUpBtn = document.createElement('button');
      moveUpBtn.textContent = '↑';
      moveUpBtn.style.padding = '4px 8px';
      moveUpBtn.disabled = index === 0;
      moveUpBtn.onclick = () => {
        if (index > 0) {
          const temp = this.steps[index];
          this.steps[index] = this.steps[index - 1];
          this.steps[index - 1] = temp;
          this.buildUI();
        }
      };

      const moveDownBtn = document.createElement('button');
      moveDownBtn.textContent = '↓';
      moveDownBtn.style.padding = '4px 8px';
      moveDownBtn.disabled = index === this.steps.length - 1;
      moveDownBtn.onclick = () => {
        if (index < this.steps.length - 1) {
          const temp = this.steps[index];
          this.steps[index] = this.steps[index + 1];
          this.steps[index + 1] = temp;
          this.buildUI();
        }
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.style.padding = '4px 8px';
      deleteBtn.style.background = '#f44336';
      deleteBtn.style.color = '#fff';
      deleteBtn.style.border = 'none';
      deleteBtn.style.borderRadius = '3px';
      deleteBtn.onclick = () => {
        this.steps.splice(index, 1);
        this.buildUI();
      };

      controls.appendChild(moveUpBtn);
      controls.appendChild(moveDownBtn);
      controls.appendChild(deleteBtn);

      header.appendChild(stepTitle);
      header.appendChild(controls);
      card.appendChild(header);

      // Action Capability Select
      const actionRow = document.createElement('div');
      actionRow.style.display = 'flex';
      actionRow.style.flexDirection = 'column';
      actionRow.style.gap = '4px';

      const actionLabel = document.createElement('label');
      actionLabel.textContent = 'Action / Capability:';
      actionLabel.style.fontSize = '0.9em';

      const select = document.createElement('select');
      select.style.padding = '6px';
      select.style.borderRadius = '4px';
      select.style.background = 'var(--secondary-color, #222)';
      select.style.color = 'inherit';
      select.style.border = '1px solid var(--border-color, #444)';

      const actionsList = availableActions.length > 0 ? availableActions : ['file:read', 'file:write', 'terminal:exec', 'network:request'];

      // Ensure step.action is in actionsList or added
      if (!actionsList.includes(step.action)) {
        actionsList.unshift(step.action);
      }

      actionsList.forEach(act => {
        const option = document.createElement('option');
        option.value = act;
        option.textContent = `${act} → (${actionToIntent(act)})`;
        if (act === step.action) option.selected = true;
        select.appendChild(option);
      });

      select.onchange = (e) => {
        step.action = e.target.value;
        this.updatePreview();
      };

      actionRow.appendChild(actionLabel);
      actionRow.appendChild(select);
      card.appendChild(actionRow);

      // Payload Textarea
      const payloadRow = document.createElement('div');
      payloadRow.style.display = 'flex';
      payloadRow.style.flexDirection = 'column';
      payloadRow.style.gap = '4px';

      const payloadLabel = document.createElement('label');
      payloadLabel.textContent = 'Payload (JSON object):';
      payloadLabel.style.fontSize = '0.9em';

      const textarea = document.createElement('textarea');
      textarea.value = step.rawPayload || '{}';
      textarea.rows = 3;
      textarea.style.padding = '6px';
      textarea.style.borderRadius = '4px';
      textarea.style.background = 'var(--secondary-color, #222)';
      textarea.style.color = 'inherit';
      textarea.style.border = '1px solid var(--border-color, #444)';
      textarea.style.fontFamily = 'monospace';
      textarea.style.fontSize = '0.85em';

      textarea.oninput = (e) => {
        step.rawPayload = e.target.value;
        this.updatePreview();
      };

      payloadRow.appendChild(payloadLabel);
      payloadRow.appendChild(textarea);
      card.appendChild(payloadRow);

      return card;
    }

    generatePipelineObject() {
      const compiledSteps = this.steps.map((step, idx) => {
        let parsedPayload = {};
        try {
          parsedPayload = JSON.parse(step.rawPayload || '{}');
        } catch (_) {
          parsedPayload = null;
        }

        return {
          id: `step_${idx + 1}`,
          intent: actionToIntent(step.action),
          payload: parsedPayload
        };
      });

      return {
        name: this.pipelineName.trim() || 'new-pipeline',
        steps: compiledSteps
      };
    }

    updatePreview() {
      if (!this.previewElement) return;

      const pipelineData = this.generatePipelineObject();
      this.previewElement.textContent = JSON.stringify(pipelineData, null, 2);

      // Realtime validation feedback
      try {
        validatePipelineStructure(pipelineData);
        if (this.validationErrorElement) {
          this.validationErrorElement.style.display = 'none';
          this.validationErrorElement.textContent = '';
        }
      } catch (err) {
        if (this.validationErrorElement) {
          this.validationErrorElement.style.display = 'block';
          this.validationErrorElement.textContent = `Validation Diagnostic: ${err.message}`;
        }
      }
    }

    async savePipeline() {
      try {
        if (this.steps.length === 0) {
          throw new Error('Pipeline must contain at least one step');
        }

        // Validate payload JSON string formatting for each step
        this.steps.forEach((step, idx) => {
          try {
            const parsed = JSON.parse(step.rawPayload || '{}');
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('Payload must be a non-null object');
            }
          } catch (e) {
            throw new Error(`Step ${idx + 1} has invalid JSON payload: ${e.message}`);
          }
        });

        const sanitizeResult = sanitizePipelineFilename(this.pipelineName);
        const pipelineData = this.generatePipelineObject();

        validatePipelineStructure(pipelineData);

        const projectRoot = await this.router.pipelineUI.getProjectRoot();
        if (!projectRoot) {
          throw new Error('No project folder is currently open in Acode sidebar.');
        }

        const fsOperation = this.router.requireFs();
        if (!fsOperation) throw new Error('File system API unavailable');

        const pipelineFolderUrl = projectRoot.endsWith('/') ? `${projectRoot}pipeline` : `${projectRoot}/pipeline`;
        const folder = fsOperation(pipelineFolderUrl);
        const folderExists = await folder.exists();

        if (!folderExists) {
          const rootFolder = fsOperation(projectRoot);
          if (typeof rootFolder.createDirectory === 'function') {
            await rootFolder.createDirectory('pipeline');
          }
        }

        const targetFileUrl = `${pipelineFolderUrl}/${sanitizeResult.fileName}`;
        const fileHandle = fsOperation(targetFileUrl);
        const fileExists = await fileHandle.exists();

        if (fileExists) {
          const confirmOverwrite = typeof window !== 'undefined' && window.confirm
            ? window.confirm(`File "${sanitizeResult.fileName}" already exists. Do you want to overwrite it?`)
            : true;

          if (!confirmOverwrite) {
            this.router.toast('Save cancelled: file already exists');
            return;
          }
        }

        const jsonString = JSON.stringify(pipelineData, null, 2);
        await fsOperation(targetFileUrl).writeFile(jsonString);

        this.router.toast(`Pipeline saved to pipeline/${sanitizeResult.fileName}`);

        // Refresh PipelineUI and navigate back
        await this.router.pipelineUI.loadPipelines();
        await this.router.pipelineUI.render();

      } catch (err) {
        if (this.validationErrorElement) {
          this.validationErrorElement.style.display = 'block';
          this.validationErrorElement.textContent = `Save Error: ${err.message}`;
        }
        this.router.alert('Pipeline Save Failed', err.message);
      }
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

      const newPipelineBtn = document.createElement('button');
      newPipelineBtn.textContent = '+ New Pipeline';
      newPipelineBtn.style.padding = '8px 16px';
      newPipelineBtn.style.background = '#4caf50';
      newPipelineBtn.style.color = '#fff';
      newPipelineBtn.style.border = 'none';
      newPipelineBtn.style.borderRadius = '4px';
      newPipelineBtn.onclick = () => this.router.pipelineBuilderUI.render();

      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh Pipelines';
      refreshBtn.style.padding = '8px 16px';
      refreshBtn.style.background = 'var(--primary-color)';
      refreshBtn.style.color = '#fff';
      refreshBtn.style.border = 'none';
      refreshBtn.style.borderRadius = '4px';
      refreshBtn.onclick = () => this.loadPipelines();

      const headerButtons = document.createElement('div');
      headerButtons.style.display = 'flex';
      headerButtons.style.gap = '8px';
      headerButtons.appendChild(newPipelineBtn);
      headerButtons.appendChild(refreshBtn);

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
      header.appendChild(headerButtons);

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
      this.logs = [];
      this.isInitialized = false;
      this.$page = null;
      this.baseUrl = null;
      this.context = null;
      this.modules = {};
      this.registeredAcodeCommands = [];
      this.pipelineRunner = new PipelineRunner(this);
      this.pipelineUI = new PipelineUI(this);
      this.pipelineBuilderUI = new PipelineBuilderUI(this);
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
        { name: 'leion.intentRouter.newPipeline', description: 'Intent Router: New Pipeline', exec: () => this.pipelineBuilderUI.render() },
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
      actionToIntent,
      intentToAction,
      filterRoutableActions,
      sanitizePipelineFilename,
      validatePipelineStructure,
      PipelineRunner,
      PipelineUI,
      PipelineBuilderUI,
      IntentRouter,
      validateMaxBytes,
      validateOpenUrl,
      getByteLength,
      readBoundedFile
    };
  }
})();
