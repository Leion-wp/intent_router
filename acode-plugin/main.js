/**
 * Intent Router for Acode
 * Developed by Leion-wp & Rutex AI
 */

/**
 * @typedef {Object} Intent
 * @property {string} intent
 * @property {Object} [payload]
 * @property {Object} [meta]
 */

/**
 * @typedef {Object} IntentResponse
 * @property {boolean} success
 * @property {any} [data]
 * @property {Object} [error]
 * @property {Object} [metadata]
 */

class Registry {
  constructor() {
    this.providers = [];
  }

  register(provider) {
    this.providers.push(provider);
  }

  getProviderFor(intent) {
    return this.providers.find(p => p.canHandle(intent));
  }
}

class IntentRouter {
  constructor() {
    this.registry = new Registry();
    this.settings = {
      githubToken: null,
      logLevel: 'debug'
    };
    this.logs = [];
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.log("Intent Router Initializing...", "info");
    
    // 1. Register Providers
    this.registry.register(new SystemProvider(this));
    this.registry.register(new HttpProvider(this));
    this.registry.register(new TerminalProvider(this));
    this.registry.register(new AIProvider(this));
    this.registry.register(new GitProvider(this));
    this.registry.register(new DockerProvider(this));

    this.initialized = true;
    this.log("Intent Router Ready", "info");
  }

  log(msg, level = 'info') {
    const entry = { timestamp: new Date().toISOString(), level, message: msg };
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs.shift();
    
    const prefix = `[IntentRouter][${level.toUpperCase()}]`;
    if (level === 'error') console.error(prefix, msg);
    else console.log(prefix, msg);
  }

  /**
   * Capability Detection (Android/Acode specific)
   */
  async getCapabilities() {
    return {
      terminal: !!(window.terminal || (window.acode && acode.require('terminal'))),
      git: true, // Standard in Termux/Android
      github: !!this.settings.githubToken,
      docker: false, // Experimental
      termux: /Termux/.test(navigator.userAgent) || !!window.arguments,
      fs: true,
      http: true
    };
  }

  /**
   * Global Execution Engine
   * @param {Intent} intent 
   * @param {Object} context 
   * @returns {Promise<IntentResponse>}
   */
  async execute(intent, context = {}) {
    const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);
    this.log(`[${traceId}] Processing: ${intent.intent}`, 'info');

    try {
      // 1. Validation
      if (!intent || !intent.intent) {
        throw new Error('INVALID_INTENT: Intent URI/Name is required');
      }

      // 2. Resolution
      const provider = this.registry.getProviderFor(intent);
      if (!provider) {
        throw new Error(`PROVIDER_NOT_FOUND: No provider handles "${intent.intent}"`);
      }

      // 3. Capability Check
      const capabilities = await this.getCapabilities();
      const required = provider.getRequiredCapability ? provider.getRequiredCapability(intent) : null;
      
      if (required && !capabilities[required]) {
        throw new Error(`CAPABILITY_MISSING: Environment lacks "${required}" for this intent`);
      }

      // 4. Execution
      const result = await provider.execute(intent, { ...context, traceId, capabilities });

      // 5. Normalization
      const response = {
        success: result.success !== false,
        data: result.data || null,
        error: result.error || null,
        metadata: {
          ...result.metadata,
          traceId,
          provider: provider.id,
          timestamp: Date.now()
        }
      };

      if (!response.success) {
        this.log(`[${traceId}] Provider reported failure: ${JSON.stringify(response.error)}`, 'error');
      }

      return response;

    } catch (error) {
      // Global Error Handling
      const errorMsg = error.message || 'Unknown execution error';
      const [code, ...msgParts] = errorMsg.includes(':') ? errorMsg.split(':') : ['INTERNAL_ERROR', errorMsg];
      
      const cleanCode = code.trim();
      const cleanMsg = msgParts.join(':').trim();

      this.log(`[${traceId}] Critical Failure: ${cleanCode} - ${cleanMsg}`, 'error');
      
      if (typeof window.toast !== 'undefined') {
        window.toast(`Intent Error: ${cleanCode}`, 4000);
      }

      return {
        success: false,
        data: null,
        error: { message: cleanMsg, code: cleanCode },
        metadata: { traceId, timestamp: Date.now() }
      };
    }
  }
}

/**
 * PROVIDER IMPLEMENTATIONS
 */

class BaseProvider {
  constructor(router, id) {
    this.router = router;
    this.id = id;
  }
  canHandle(intent) { return false; }
  async execute(intent, context) { 
    return { success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Provider execute not implemented' } }; 
  }
}

class SystemProvider extends BaseProvider {
  constructor(router) { super(router, 'system'); }
  canHandle(intent) { return /^(file|system|share|open):/.test(intent.intent); }
  async execute(intent, context) {
    const uri = intent.intent;
    if (uri.startsWith('share://')) {
      if (window.system?.share) {
        await window.system.share(intent.payload?.text || uri.replace('share://', ''));
        return { success: true };
      }
      throw new Error('COMMAND_UNAVAILABLE: System share not supported');
    }
    if (uri.startsWith('file://')) {
      return { success: true, data: { action: 'open_file', path: uri.replace('file://', '') } };
    }
    return { success: false, error: { code: 'UNSUPPORTED_ACTION', message: 'System action not mapped' } };
  }
}

class HttpProvider extends BaseProvider {
  constructor(router) { super(router, 'http'); }
  canHandle(intent) { return /^https?:/.test(intent.intent); }
  async execute(intent, context) {
    try {
      const response = await fetch(intent.intent, {
        method: intent.payload?.method || 'GET',
        headers: intent.payload?.headers || {},
        body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
      });
      const data = await response.json().catch(() => null);
      return { success: response.ok, data, metadata: { status: response.status } };
    } catch (e) {
      throw new Error(`NETWORK_ERROR: ${e.message}`);
    }
  }
}

class TerminalProvider extends BaseProvider {
  constructor(router) { super(router, 'terminal'); }
  canHandle(intent) { return /^(term|exec|sh):/.test(intent.intent); }
  getRequiredCapability() { return 'terminal'; }
  async execute(intent, context) {
    const command = intent.payload?.command || intent.intent.split('://')[1];
    return { success: true, data: { stdout: `Simulated: ${command}` } };
  }
}

class AIProvider extends BaseProvider {
  constructor(router) { super(router, 'ai'); }
  canHandle(intent) { return /^(ai|prompt|codegen):/.test(intent.intent); }
  async execute(intent, context) {
    return { success: true, data: { response: "AI simulated response" } };
  }
}

class GitProvider extends BaseProvider {
  constructor(router) { super(router, 'git'); }
  canHandle(intent) { return /^(git|github):/.test(intent.intent); }
  getRequiredCapability(intent) { return intent.intent.startsWith('github') ? 'github' : 'git'; }
  async execute(intent, context) {
    return { success: true, data: { action: 'git_op_completed' } };
  }
}

class DockerProvider extends BaseProvider {
  constructor(router) { super(router, 'docker'); }
  canHandle(intent) { return /^docker:/.test(intent.intent); }
  getRequiredCapability() { return 'docker'; }
  async execute(intent, context) {
    return { success: false, error: { code: 'EXPERIMENTAL', message: 'Docker is not supported on this platform yet' } };
  }
}

// Acode Plugin Lifecycle
if (window.acode) {
  const router = new IntentRouter();
  acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFile, cacheFileUrl }) => {
    router.init();
    window.intentRouter = router;
    
    if (window.editorManager) {
        editorManager.editor.commands.addCommand({
            name: "intentRouter:test",
            exec: async () => {
                const results = [];
                const tests = [
                    { intent: 'ai://hello' },
                    { intent: 'file:///test.js' },
                    { intent: 'https://jsonplaceholder.typicode.com/todos/1' },
                    { intent: 'term://ls' },
                    { intent: 'git://status' },
                    { intent: 'docker://ps' }
                ];
                for (const t of tests) {
                    results.push(await router.execute(t));
                }
                console.log("Test Suite Results:", results);
                window.toast("Intent Router Tests Finished (Check Console)");
            }
        });
    }
  });
} else {
  const router = new IntentRouter();
  router.init();
  window.intentRouter = router;
}

 * Intent Router for Acode
 * Developed by Leion-wp & Rutex AI
 */

/**
 * @typedef {Object} Intent
 * @property {string} intent
 * @property {Object} [payload]
 * @property {Object} [meta]
 */

/**
 * @typedef {Object} IntentResponse
 * @property {boolean} success
 * @property {any} [data]
 * @property {Object} [error]
 * @property {Object} [metadata]
 */

class Registry {
  constructor() {
    this.providers = [];
  }

  register(provider) {
    this.providers.push(provider);
  }

  getProviderFor(intent) {
    return this.providers.find(p => p.canHandle(intent));
  }
}

class IntentRouter {
  constructor() {
    this.registry = new Registry();
    this.settings = {
      githubToken: null,
      logLevel: 'debug'
    };
    this.logs = [];
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.log("Intent Router Initializing...", "info");
    
    // Registration
    this.registry.register(new SystemProvider(this));
    this.registry.register(new HttpProvider(this));
    this.registry.register(new TerminalProvider(this));
    this.registry.register(new AIProvider(this));
    this.registry.register(new GitProvider(this));
    this.registry.register(new DockerProvider(this));

    this.initialized = true;
    this.log("Intent Router Ready", "info");
  }

  log(msg, level = 'info') {
    const entry = { timestamp: new Date().toISOString(), level, message: msg };
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs.shift();
    
    const prefix = `[IntentRouter][${level.toUpperCase()}]`;
    if (level === 'error') console.error(prefix, msg);
    else console.log(prefix, msg);
  }

  async getCapabilities() {
    return {
      terminal: !!(window.terminal || (window.acode && acode.require('terminal'))),
      git: true, 
      github: !!this.settings.githubToken,
      docker: false, // Experimental
      termux: /Termux/.test(navigator.userAgent) || !!window.arguments,
      fs: true,
      http: true
    };
  }

  async execute(intent, context = {}) {
    const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);
    this.log(`[${traceId}] Processing: ${intent.intent}`, 'info');

    try {
      if (!intent || !intent.intent) throw new Error('INVALID_INTENT: Intent URI is required');

      const provider = this.registry.getProviderFor(intent);
      if (!provider) throw new Error(`PROVIDER_NOT_FOUND: No handler for "${intent.intent}"`);

      const capabilities = await this.getCapabilities();
      const required = provider.getRequiredCapability ? provider.getRequiredCapability(intent) : null;
      
      if (required && !capabilities[required]) {
        throw new Error(`CAPABILITY_MISSING: Environment lacks "${required}"`);
      }

      const result = await provider.execute(intent, { ...context, traceId, capabilities });

      return {
        success: result.success !== false,
        data: result.data || null,
        error: result.error || null,
        metadata: {
          ...result.metadata,
          traceId,
          provider: provider.id,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      const [code, ...msgParts] = errorMsg.includes(':') ? errorMsg.split(':') : ['INTERNAL_ERROR', errorMsg];
      
      const cleanCode = code.trim();
      const cleanMsg = msgParts.join(':').trim();

      this.log(`[${traceId}] Error: ${cleanCode} - ${cleanMsg}`, 'error');
      if (typeof window.toast !== 'undefined') window.toast(`Intent Error: ${cleanCode}`);

      return {
        success: false,
        data: null,
        error: { message: cleanMsg, code: cleanCode },
        metadata: { traceId, timestamp: Date.now() }
      };
    }
  }
}

class BaseProvider {
  constructor(router, id) {
    this.router = router;
    this.id = id;
  }
  canHandle(intent) { return false; }
  async execute(intent, context) { 
    return { success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Provider execute not implemented' } }; 
  }
}

class SystemProvider extends BaseProvider {
  constructor(router) { super(router, 'system'); }
  canHandle(intent) { return /^(file|system|share|open):/.test(intent.intent); }
  async execute(intent, context) {
    const uri = intent.intent;
    if (uri.startsWith('share://')) {
      if (window.system?.share) {
        await window.system.share(intent.payload?.text || uri.replace('share://', ''));
        return { success: true };
      }
      throw new Error('COMMAND_UNAVAILABLE: System share not supported');
    }
    if (uri.startsWith('file://')) {
      return { success: true, data: { action: 'open_file', path: uri.replace('file://', '') } };
    }
    return { success: false, error: { code: 'UNSUPPORTED_ACTION', message: 'System action not mapped' } };
  }
}

class HttpProvider extends BaseProvider {
  constructor(router) { super(router, 'http'); }
  canHandle(intent) { return /^https?:/.test(intent.intent); }
  async execute(intent, context) {
    try {
      const response = await fetch(intent.intent, {
        method: intent.payload?.method || 'GET',
        headers: intent.payload?.headers || {},
        body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
      });
      const data = await response.json().catch(() => null);
      return { success: response.ok, data, metadata: { status: response.status } };
    } catch (e) {
      throw new Error(`NETWORK_ERROR: ${e.message}`);
    }
  }
}

class TerminalProvider extends BaseProvider {
  constructor(router) { super(router, 'terminal'); }
  canHandle(intent) { return /^(term|exec|sh):/.test(intent.intent); }
  getRequiredCapability() { return 'terminal'; }
  async execute(intent, context) {
    const command = intent.payload?.command || intent.intent.split('://')[1];
    return { success: true, data: { stdout: `Simulated: ${command}` } };
  }
}

class AIProvider extends BaseProvider {
  constructor(router) { super(router, 'ai'); }
  canHandle(intent) { return /^(ai|prompt|codegen):/.test(intent.intent); }
  async execute(intent, context) {
    return { success: true, data: { response: "AI simulated response" } };
  }
}

class GitProvider extends BaseProvider {
  constructor(router) { super(router, 'git'); }
  canHandle(intent) { return /^(git|github):/.test(intent.intent); }
  getRequiredCapability(intent) { return intent.intent.startsWith('github') ? 'github' : 'git'; }
  async execute(intent, context) {
    return { success: true, data: { action: 'git_op_completed' } };
  }
}

class DockerProvider extends BaseProvider {
  constructor(router) { super(router, 'docker'); }
  canHandle(intent) { return /^docker:/.test(intent.intent); }
  getRequiredCapability() { return 'docker'; }
  async execute(intent, context) {
    return { success: false, error: { code: 'EXPERIMENTAL', message: 'Docker is not supported on this platform yet' } };
  }
}

if (window.acode) {
  const router = new IntentRouter();
  acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFile, cacheFileUrl }) => {
    router.init();
    window.intentRouter = router;
    if (window.editorManager) {
        editorManager.editor.commands.addCommand({
            name: "intentRouter:test",
            exec: async () => {
                const results = [];
                const tests = [
                    { intent: 'ai://hello' },
                    { intent: 'file:///test.js' },
                    { intent: 'https://jsonplaceholder.typicode.com/todos/1' },
                    { intent: 'term://ls' },
                    { intent: 'git://status' }
                ];
                for (const t of tests) {
                    results.push(await router.execute(t));
                }
                console.log("Test Suite Results:", results);
                window.toast("Intent Router Tests Finished (Check Console)");
            }
        });
    }
  });
} else {
  const router = new IntentRouter();
  router.init();
  window.intentRouter = router;
}

 * Intent Router for Acode
 * Developed by Leion-wp & Rutex AI
 */

/**
 * @typedef {Object} Intent
 * @property {string} intent
 * @property {Object} [payload]
 * @property {Object} [meta]
 */

/**
 * @typedef {Object} IntentResponse
 * @property {boolean} success
 * @property {any} [data]
 * @property {Object} [error]
 * @property {Object} [metadata]
 */

class Registry {
  constructor() {
    this.providers = [];
  }

  register(provider) {
    this.providers.push(provider);
  }

  getProviderFor(intent) {
    return this.providers.find(p => p.canHandle(intent));
  }
}

class IntentRouter {
  constructor() {
    this.registry = new Registry();
    this.settings = {
      githubToken: null,
      logLevel: 'debug'
    };
    this.logs = [];
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.log("Intent Router Initializing...", "info");
    
    // Registration
    this.registry.register(new SystemProvider(this));
    this.registry.register(new HttpProvider(this));
    this.registry.register(new TerminalProvider(this));
    this.registry.register(new AIProvider(this));
    this.registry.register(new GitProvider(this));
    this.registry.register(new DockerProvider(this));

    this.initialized = true;
    this.log("Intent Router Ready", "info");
  }

  log(msg, level = 'info') {
    const entry = { timestamp: new Date().toISOString(), level, message: msg };
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs.shift();
    
    const prefix = `[IntentRouter][${level.toUpperCase()}]`;
    if (level === 'error') console.error(prefix, msg);
    else console.log(prefix, msg);
  }

  async getCapabilities() {
    return {
      terminal: !!(window.terminal || (window.acode && acode.require('terminal'))),
      git: true, 
      github: !!this.settings.githubToken,
      docker: false, // Experimental
      termux: /Termux/.test(navigator.userAgent) || !!window.arguments,
      fs: true,
      http: true
    };
  }

  async execute(intent, context = {}) {
    const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);
    this.log(`[${traceId}] Processing: ${intent.intent}`, 'info');

    try {
      if (!intent || !intent.intent) throw new Error('INVALID_INTENT: Intent URI is required');

      const provider = this.registry.getProviderFor(intent);
      if (!provider) throw new Error(`PROVIDER_NOT_FOUND: No handler for "${intent.intent}"`);

      const capabilities = await this.getCapabilities();
      const required = provider.getRequiredCapability ? provider.getRequiredCapability(intent) : null;
      
      if (required && !capabilities[required]) {
        throw new Error(`CAPABILITY_MISSING: Environment lacks "${required}"`);
      }

      const result = await provider.execute(intent, { ...context, traceId, capabilities });

      return {
        success: result.success !== false,
        data: result.data || null,
        error: result.error || null,
        metadata: {
          ...result.metadata,
          traceId,
          provider: provider.id,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      const [code, ...msgParts] = errorMsg.includes(':') ? errorMsg.split(':') : ['INTERNAL_ERROR', errorMsg];
      
      const cleanCode = code.trim();
      const cleanMsg = msgParts.join(':').trim();

      this.log(`[${traceId}] Error: ${cleanCode} - ${cleanMsg}`, 'error');
      if (typeof window.toast !== 'undefined') window.toast(`Intent Error: ${cleanCode}`);

      return {
        success: false,
        data: null,
        error: { message: cleanMsg, code: cleanCode },
        metadata: { traceId, timestamp: Date.now() }
      };
    }
  }
}

 * Intent Router for Acode
 * Developed by Leion-wp & Rutex AI
 */

/**
 * @typedef {Object} Intent
 * @property {string} intent
 * @property {Object} [payload]
 * @property {Object} [meta]
 */

/**
 * @typedef {Object} IntentResponse
 * @property {boolean} success
 * @property {any} [data]
 * @property {Object} [error]
 * @property {Object} [metadata]
 */

class Registry {
  constructor() {
    this.providers = [];
  }

  register(provider) {
    this.providers.push(provider);
  }

  getProviderFor(intent) {
    return this.providers.find(p => p.canHandle(intent));
  }
}

class IntentRouter {
  constructor() {
    this.registry = new Registry();
    this.settings = {
      githubToken: null,
      logLevel: 'debug'
    };
    this.logs = [];
  }

  async init() {
    this.log("Intent Router Initializing...", "info");
    
    // 1. Load settings (Acode specific)
    this.loadSettings();

    // 2. Register Providers
    this.registry.register(new SystemProvider(this));
    this.registry.register(new HttpProvider(this));
    this.registry.register(new TerminalProvider(this));
    this.registry.register(new AIProvider(this));
    this.registry.register(new GitProvider(this));
    this.registry.register(new DockerProvider(this)); // Marked experimental

    this.log("Intent Router Ready", "info");
  }

  loadSettings() {
    // Integration with Acode settings would go here
    // For now, using defaults
  }

  log(msg, level = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: msg
    };
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs.shift();
    
    const prefix = `[IntentRouter][${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(prefix, msg);
    } else {
      console.log(prefix, msg);
    }
  }

  /**
   * Capability Detection (Android/Acode specific)
   */
  async getCapabilities() {
    return {
      terminal: !!(window.terminal || (window.acode && acode.require('terminal'))),
      git: true, // Usually available in Termux/Android environments where Acode runs
      github: !!this.settings.githubToken,
      docker: false, // Experimental, likely false on native Android
      termux: /Termux/.test(navigator.userAgent) || !!window.arguments,
      fs: true,
      http: true
    };
  }

  /**
   * Global Execution Engine
   * @param {Intent} intent 
   * @param {Object} context 
   * @returns {Promise<IntentResponse>}
   */
  async execute(intent, context = {}) {
    const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);
    this.log(`[${traceId}] Processing: ${intent.intent}`, 'info');

    try {
      // 1. Validation
      if (!intent || !intent.intent) {
        throw new Error('INVALID_INTENT: Intent URI/Name is required');
      }

      // 2. Resolution
      const provider = this.registry.getProviderFor(intent);
      if (!provider) {
        throw new Error(`PROVIDER_NOT_FOUND: No provider handles "${intent.intent}"`);
      }

      // 3. Capability Check
      const capabilities = await this.getCapabilities();
      const required = provider.getRequiredCapability ? provider.getRequiredCapability(intent) : null;
      
      if (required && !capabilities[required]) {
        throw new Error(`CAPABILITY_MISSING: Environment lacks "${required}" for this intent`);
      }

      // 4. Execution
      const result = await provider.execute(intent, { ...context, traceId, capabilities });

      // 5. Normalization (Ensuring standard response format)
      const response = {
        success: result.success !== false,
        data: result.data || null,
        error: result.error || null,
        metadata: {
          ...result.metadata,
          traceId,
          provider: provider.id,
          timestamp: Date.now()
        }
      };

      if (!response.success) {
        this.log(`[${traceId}] Provider reported failure: ${JSON.stringify(response.error)}`, 'error');
      }

      return response;

    } catch (error) {
      // Global Error Handling
      const errorMsg = error.message || 'Unknown execution error';
      const [code, ...msgParts] = errorMsg.includes(':') ? errorMsg.split(':') : ['INTERNAL_ERROR', errorMsg];
      
      const cleanCode = code.trim();
      const cleanMsg = msgParts.join(':').trim();

      this.log(`[${traceId}] Critical Failure: ${cleanCode} - ${cleanMsg}`, 'error');
      
      if (typeof window.toast !== 'undefined') {
        window.toast(`Intent Error: ${cleanCode}`, 4000);
      }

      return {
        success: false,
        data: null,
        error: {
          message: cleanMsg,
          code: cleanCode
        },
        metadata: { traceId, timestamp: Date.now() }
      };
    }
  }
}

/**
 * PROVIDER IMPLEMENTATIONS
 */

class BaseProvider {
  constructor(router, id) {
    this.router = router;
    this.id = id;
  }
  canHandle(intent) { return false; }
  async execute(intent, context) { 
    return { success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Provider execute not implemented' } }; 
  }
}

class SystemProvider extends BaseProvider {
  constructor(router) { super(router, 'system'); }
  canHandle(intent) { return /^(file|system|share|open):/.test(intent.intent); }
  async execute(intent, context) {
    const uri = intent.intent;
    if (uri.startsWith('share://')) {
      if (window.system?.share) {
        await window.system.share(intent.payload?.text || uri.replace('share://', ''));
        return { success: true };
      }
      throw new Error('COMMAND_UNAVAILABLE: System share not supported');
    }
    if (uri.startsWith('file://')) {
      return { success: true, data: { action: 'open_file', path: uri.replace('file://', '') } };
    }
    return { success: false, error: { code: 'UNSUPPORTED_ACTION', message: 'System action not mapped' } };
  }
}

class HttpProvider extends BaseProvider {
  constructor(router) { super(router, 'http'); }
  canHandle(intent) { return /^https?:/.test(intent.intent); }
  async execute(intent, context) {
    try {
      const response = await fetch(intent.intent, {
        method: intent.payload?.method || 'GET',
        headers: intent.payload?.headers || {},
        body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
      });
      const data = await response.json().catch(() => null);
      return { success: response.ok, data, metadata: { status: response.status } };
    } catch (e) {
      throw new Error(`NETWORK_ERROR: ${e.message}`);
    }
  }
}

class TerminalProvider extends BaseProvider {
  constructor(router) { super(router, 'terminal'); }
  canHandle(intent) { return /^(term|exec|sh):/.test(intent.intent); }
  getRequiredCapability() { return 'terminal'; }
  async execute(intent, context) {
    const command = intent.payload?.command || intent.intent.split('://')[1];
    return { success: true, data: { stdout: `Simulated: ${command}` } };
  }
}

class AIProvider extends BaseProvider {
  constructor(router) { super(router, 'ai'); }
  canHandle(intent) { return /^(ai|prompt|codegen):/.test(intent.intent); }
  async execute(intent, context) {
    return { success: true, data: { response: "AI simulated response" } };
  }
}

class GitProvider extends BaseProvider {
  constructor(router) { super(router, 'git'); }
  canHandle(intent) { return /^(git|github):/.test(intent.intent); }
  getRequiredCapability(intent) { return intent.intent.startsWith('github') ? 'github' : 'git'; }
  async execute(intent, context) {
    return { success: true, data: { action: 'git_op_completed' } };
  }
}

class DockerProvider extends BaseProvider {
  constructor(router) { super(router, 'docker'); }
  canHandle(intent) { return /^docker:/.test(intent.intent); }
  getRequiredCapability() { return 'docker'; }
  async execute(intent, context) {
    return { success: false, error: { code: 'EXPERIMENTAL', message: 'Docker is not supported on this platform yet' } };
  }
}

// Acode Plugin Lifecycle
if (window.acode) {
  const router = new IntentRouter();
  acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFile, cacheFileUrl }) => {
    router.init();
    window.intentRouter = router;
    
    if (window.editorManager) {
        editorManager.editor.commands.addCommand({
            name: "intentRouter:test",
            exec: async () => {
                const results = [];
                const tests = [
                    { intent: 'ai://hello' },
                    { intent: 'file:///test.js' },
                    { intent: 'https://jsonplaceholder.typicode.com/todos/1' },
                    { intent: 'term://ls' },
                    { intent: 'git://status' }
                ];
                for (const t of tests) {
                    results.push(await router.execute(t));
                }
                console.log("Test Suite Results:", results);
                window.toast("Intent Router Tests Finished (Check Console)");
            }
        });
    }
  });
} else {
  const router = new IntentRouter();
  router.init();
  window.intentRouter = router;
}

 * Intent Router for Acode
 * Developed by Leion-wp & Rutex AI
 * 
 * Clean Architecture Implementation
 */

/**
 * @typedef {Object} Intent
 * @property {string} intent - The URI or name of the intent (e.g., 'file:///path', 'ai://prompt')
 * @property {Object} [payload] - Optional data for the intent
 * @property {Object} [meta] - Metadata like traceId
 */

/**
 * @typedef {Object} IntentResponse
 * @property {boolean} success - Whether the execution was successful
 * @property {any} [data] - The result data
 * @property {Object} [error] - Error details { message, code }
 * @property {Object} [metadata] - Execution metadata (traceId, provider, timestamp)
 */

class Registry {
    constructor() {
        this.providers = [];
    }

    register(provider) {
        this.providers.push(provider);
    }

    getProviderFor(intent) {
        return this.providers.find(p => p.canHandle(intent));
    }
}

class IntentRouter {
    constructor() {
        this.registry = new Registry();
        this.settings = {
            githubToken: null,
            logLevel: 'debug'
        };
        this.logs = [];
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        this.log("Intent Router Initializing...", "info");
        
        // 1. Register Providers in order of priority
        this.registry.register(new SystemProvider(this));
        this.registry.register(new HttpProvider(this));
        this.registry.register(new TerminalProvider(this));
        this.registry.register(new AIProvider(this));
        this.registry.register(new GitProvider(this));
        this.registry.register(new DockerProvider(this)); // Experimental

        this.initialized = true;
        this.log("Intent Router Ready", "info");
    }

    log(msg, level = 'info') {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message: msg
        };
        this.logs.push(entry);
        if (this.logs.length > 500) this.logs.shift();
        
        const prefix = `[IntentRouter][${level.toUpperCase()}]`;
        if (level === 'error') {
            console.error(prefix, msg);
        } else {
            console.log(prefix, msg);
        }
    }

    /**
     * Capability Detection (Android/Acode specific)
     */
    async getCapabilities() {
        return {
            terminal: !!(window.terminal || (window.acode && acode.require('terminal'))),
            git: true, // Standard in many Android/Termux setups
            github: !!this.settings.githubToken,
            docker: false, // Experimental, likely false on native Android
            termux: /Termux/.test(navigator.userAgent) || !!window.arguments,
            fs: true,
            http: true
        };
    }

    /**
     * Global Execution Engine
     * @param {Intent} intent 
     * @param {Object} context 
     * @returns {Promise<IntentResponse>}
     */
    async execute(intent, context = {}) {
        const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);
        this.log(`[${traceId}] Processing: ${intent.intent}`, 'info');

        try {
            // 1. Validation
            if (!intent || !intent.intent) {
                throw new Error('INVALID_INTENT: Intent URI/Name is required');
            }

            // 2. Resolution
            const provider = this.registry.getProviderFor(intent);
            if (!provider) {
                throw new Error(`PROVIDER_NOT_FOUND: No provider handles "${intent.intent}"`);
            }

            // 3. Capability Check
            const capabilities = await this.getCapabilities();
            const required = provider.getRequiredCapability ? provider.getRequiredCapability(intent) : null;
            
            if (required && !capabilities[required]) {
                throw new Error(`CAPABILITY_MISSING: Environment lacks "${required}" for this intent`);
            }

            // 4. Execution
            const result = await provider.execute(intent, { ...context, traceId, capabilities });

            // 5. Normalization
            const response = {
                success: result.success !== false,
                data: result.data || null,
                error: result.error || null,
                metadata: {
                    ...result.metadata,
                    traceId,
                    provider: provider.id,
                    timestamp: Date.now()
                }
            };

            if (!response.success) {
                this.log(`[${traceId}] Provider failure: ${JSON.stringify(response.error)}`, 'error');
            }

            return response;

        } catch (error) {
            // Global Error Handling
            const errorMsg = error.message || 'Unknown execution error';
            const [code, ...msgParts] = errorMsg.includes(':') ? errorMsg.split(':') : ['INTERNAL_ERROR', errorMsg];
            
            const cleanCode = code.trim();
            const cleanMsg = msgParts.join(':').trim();

            this.log(`[${traceId}] Critical Failure: ${cleanCode} - ${cleanMsg}`, 'error');
            
            if (typeof window.toast !== 'undefined') {
                window.toast(`Intent Error: ${cleanCode}`, 4000);
            }

            return {
                success: false,
                data: null,
                error: {
                    message: cleanMsg,
                    code: cleanCode
                },
                metadata: { traceId, timestamp: Date.now() }
            };
        }
    }
}

/**
 * PROVIDER IMPLEMENTATIONS
 */

class BaseProvider {
    constructor(router, id) {
        this.router = router;
        this.id = id;
    }
    canHandle(intent) { return false; }
    async execute(intent, context) { 
        return { success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Provider execute not implemented' } }; 
    }
}

class SystemProvider extends BaseProvider {
    constructor(router) { super(router, 'system'); }
    canHandle(intent) { return /^(file|system|share|open):/.test(intent.intent); }
    async execute(intent, context) {
        const uri = intent.intent;
        if (uri.startsWith('share://')) {
            if (window.system?.share) {
                await window.system.share(intent.payload?.text || uri.replace('share://', ''));
                return { success: true };
            }
            throw new Error('COMMAND_UNAVAILABLE: System share not supported');
        }
        if (uri.startsWith('file://')) {
            // Placeholder for Acode file open
            return { success: true, data: { action: 'open_file', path: uri.replace('file://', '') } };
        }
        return { success: false, error: { code: 'UNSUPPORTED_ACTION', message: 'System action not mapped' } };
    }
}

class HttpProvider extends BaseProvider {
    constructor(router) { super(router, 'http'); }
    canHandle(intent) { return /^https?:/.test(intent.intent); }
    async execute(intent, context) {
        try {
            const response = await fetch(intent.intent, {
                method: intent.payload?.method || 'GET',
                headers: intent.payload?.headers || {},
                body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
            });
            const data = await response.json().catch(() => null);
            return { success: response.ok, data, metadata: { status: response.status } };
        } catch (e) {
            throw new Error(`NETWORK_ERROR: ${e.message}`);
        }
    }
}

class TerminalProvider extends BaseProvider {
    constructor(router) { super(router, 'terminal'); }
    canHandle(intent) { return /^(term|exec|sh):/.test(intent.intent); }
    getRequiredCapability() { return 'terminal'; }
    async execute(intent, context) {
        const command = intent.payload?.command || intent.intent.split('://')[1];
        // In Acode, we would use the terminal plugin API here
        return { success: true, data: { stdout: `Executed: ${command}` } };
    }
}

class AIProvider extends BaseProvider {
    constructor(router) { super(router, 'ai'); }
    canHandle(intent) { return /^(ai|prompt|codegen):/.test(intent.intent); }
    async execute(intent, context) {
        return { success: true, data: { response: "AI result placeholder" } };
    }
}

class GitProvider extends BaseProvider {
    constructor(router) { super(router, 'git'); }
    canHandle(intent) { return /^(git|github):/.test(intent.intent); }
    getRequiredCapability(intent) { return intent.intent.startsWith('github') ? 'github' : 'git'; }
    async execute(intent, context) {
        return { success: true, data: { action: 'git_operation_completed' } };
    }
}

class DockerProvider extends BaseProvider {
    constructor(router) { super(router, 'docker'); }
    canHandle(intent) { return /^docker:/.test(intent.intent); }
    getRequiredCapability() { return 'docker'; }
    async execute(intent, context) {
        return { success: false, error: { code: 'EXPERIMENTAL', message: 'Docker is not supported on this platform' } };
    }
}

// Plugin Lifecycle
const router = new IntentRouter();

if (window.acode) {
    acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFile, cacheFileUrl }) => {
        router.init();
        window.intentRouter = router;
        
        // Add Test Command
        if (window.editorManager) {
            editorManager.editor.commands.addCommand({
                name: "intentRouter:test",
                exec: async () => {
                    const results = [];
                    const tests = [
                        { intent: 'ai://hello' },
                        { intent: 'file:///test.js' },
                        { intent: 'https://jsonplaceholder.typicode.com/todos/1' },
                        { intent: 'term://ls' },
                        { intent: 'git://status' }
                    ];
                    for (const t of tests) {
                        results.push(await router.execute(t));
                    }
                    console.log("Test Suite Results:", results);
                    window.toast("Intent Router Tests Finished (Check Console)");
                }
            });
        }
    });
} else {
    router.init();
    window.intentRouter = router;
}

 * Intent Router for Acode
 * Developed by Leion-wp & Rutex AI
 */

/**
 * @typedef {Object} Intent
 * @property {string} intent
 * @property {Object} [payload]
 * @property {Object} [meta]
 */

/**
 * @typedef {Object} IntentResponse
 * @property {boolean} success
 * @property {any} [data]
 * @property {Object} [error]
 * @property {Object} [metadata]
 */

class Registry {
  constructor() {
    this.providers = [];
  }

  register(provider) {
    this.providers.push(provider);
  }

  getProviderFor(intent) {
    return this.providers.find(p => p.canHandle(intent));
  }
}

class IntentRouter {
  constructor() {
    this.registry = new Registry();
    this.settings = {
      githubToken: null,
      logLevel: 'debug'
    };
    this.logs = [];
  }

  async init() {
    this.log("Intent Router Initializing...", "info");
    
    // 1. Load settings (Acode specific)
    this.loadSettings();

    // 2. Register Providers
    this.registry.register(new SystemProvider(this));
    this.registry.register(new HttpProvider(this));
    this.registry.register(new TerminalProvider(this));
    this.registry.register(new AIProvider(this));
    this.registry.register(new GitProvider(this));
    this.registry.register(new DockerProvider(this)); // Marked experimental

    this.log("Intent Router Ready", "info");
  }

  loadSettings() {
    // Integration with Acode settings would go here
    // For now, using defaults or window object if injected
  }

  log(msg, level = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: msg
    };
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs.shift();
    
    const prefix = `[IntentRouter][${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(prefix, msg);
    } else {
      console.log(prefix, msg);
    }
  }

  /**
   * Capability Detection (Android/Acode specific)
   */
  async getCapabilities() {
    return {
      terminal: !!(window.terminal || (window.acode && acode.require('terminal'))),
      git: true, // Usually available in Termux/Android environments where Acode runs
      github: !!this.settings.githubToken,
      docker: false, // Experimental, likely false on native Android
      termux: /Termux/.test(navigator.userAgent) || !!window.arguments,
      fs: true,
      http: true
    };
  }

  /**
   * Global Execution Engine
   * @param {Intent} intent 
   * @param {Object} context 
   * @returns {Promise<IntentResponse>}
   */
  async execute(intent, context = {}) {
    const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);
    this.log(`[${traceId}] Processing: ${intent.intent}`, 'info');

    try {
      // 1. Validation
      if (!intent || !intent.intent) {
        throw new Error('INVALID_INTENT: Intent URI/Name is required');
      }

      // 2. Resolution
      const provider = this.registry.getProviderFor(intent);
      if (!provider) {
        throw new Error(`PROVIDER_NOT_FOUND: No provider handles "${intent.intent}"`);
      }

      // 3. Capability Check
      const capabilities = await this.getCapabilities();
      const required = provider.getRequiredCapability ? provider.getRequiredCapability(intent) : null;
      
      if (required && !capabilities[required]) {
        throw new Error(`CAPABILITY_MISSING: Environment lacks "${required}" for this intent`);
      }

      // 4. Execution
      const result = await provider.execute(intent, { ...context, traceId, capabilities });

      // 5. Normalization (Ensuring standard response format)
      const response = {
        success: result.success !== false,
        data: result.data || null,
        error: result.error || null,
        metadata: {
          ...result.metadata,
          traceId,
          provider: provider.id,
          timestamp: Date.now()
        }
      };

      if (!response.success) {
        this.log(`[${traceId}] Provider reported failure: ${JSON.stringify(response.error)}`, 'error');
      }

      return response;

    } catch (error) {
      // Global Error Handling
      const errorMsg = error.message || 'Unknown execution error';
      const [code, ...msgParts] = errorMsg.includes(':') ? errorMsg.split(':') : ['INTERNAL_ERROR', errorMsg];
      
      const cleanCode = code.trim();
      const cleanMsg = msgParts.join(':').trim();

      this.log(`[${traceId}] Critical Failure: ${cleanCode} - ${cleanMsg}`, 'error');
      
      if (typeof window.toast !== 'undefined') {
        window.toast(`Intent Error: ${cleanCode}`, 4000);
      }

      return {
        success: false,
        data: null,
        error: {
          message: cleanMsg,
          code: cleanCode
        },
        metadata: { traceId, timestamp: Date.now() }
      };
    }
  }
}

/**
 * PROVIDER IMPLEMENTATIONS
 */

class BaseProvider {
  constructor(router, id) {
    this.router = router;
    this.id = id;
  }
  canHandle(intent) { return false; }
  async execute(intent, context) { 
    return { success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Provider execute not implemented' } }; 
  }
}

class SystemProvider extends BaseProvider {
  constructor(router) { super(router, 'system'); }
  canHandle(intent) { return /^(file|system|share|open):/.test(intent.intent); }
  async execute(intent, context) {
    const uri = intent.intent;
    if (uri.startsWith('share://')) {
      if (window.system?.share) {
        await window.system.share(intent.payload?.text || uri.replace('share://', ''));
        return { success: true };
      }
      throw new Error('COMMAND_UNAVAILABLE: System share not supported');
    }
    if (uri.startsWith('file://')) {
      // Mocking Acode file open
      return { success: true, data: { action: 'open_file', path: uri.replace('file://', '') } };
    }
    return { success: false, error: { code: 'UNSUPPORTED_ACTION', message: 'System action not mapped' } };
  }
}

class HttpProvider extends BaseProvider {
  constructor(router) { super(router, 'http'); }
  canHandle(intent) { return /^https?:/.test(intent.intent); }
  async execute(intent, context) {
    try {
      const response = await fetch(intent.intent, {
        method: intent.payload?.method || 'GET',
        headers: intent.payload?.headers || {},
        body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined
      });
      const data = await response.json().catch(() => null);
      return { success: response.ok, data, metadata: { status: response.status } };
    } catch (e) {
      throw new Error(`NETWORK_ERROR: ${e.message}`);
    }
  }
}

class TerminalProvider extends BaseProvider {
  constructor(router) { super(router, 'terminal'); }
  canHandle(intent) { return /^(term|exec|sh):/.test(intent.intent); }
  getRequiredCapability() { return 'terminal'; }
  async execute(intent, context) {
    const command = intent.payload?.command || intent.intent.split('://')[1];
    return { success: true, data: { stdout: `Simulated: ${command}` } };
  }
}

class AIProvider extends BaseProvider {
  constructor(router) { super(router, 'ai'); }
  canHandle(intent) { return /^(ai|prompt|codegen):/.test(intent.intent); }
  async execute(intent, context) {
    return { success: true, data: { response: "AI simulated response" } };
  }
}

class GitProvider extends BaseProvider {
  constructor(router) { super(router, 'git'); }
  canHandle(intent) { return /^(git|github):/.test(intent.intent); }
  getRequiredCapability(intent) { return intent.intent.startsWith('github') ? 'github' : 'git'; }
  async execute(intent, context) {
    return { success: true, data: { action: 'git_op_completed' } };
  }
}

class DockerProvider extends BaseProvider {
  constructor(router) { super(router, 'docker'); }
  canHandle(intent) { return /^docker:/.test(intent.intent); }
  getRequiredCapability() { return 'docker'; }
  async execute(intent, context) {
    // Experimental: would check for remote API or local termux proot
    return { success: false, error: { code: 'EXPERIMENTAL', message: 'Docker is not supported on this platform yet' } };
  }
}

// Acode Plugin Lifecycle
if (window.acode) {
  const router = new IntentRouter();
  acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFile, cacheFileUrl }) => {
    router.init();
    window.intentRouter = router;
    
    // Add a test command to Acode
    if (window.editorManager) {
        editorManager.editor.commands.addCommand({
            name: "intentRouter:test",
            exec: async () => {
                const results = [];
                const tests = [
                    { intent: 'ai://hello' },
                    { intent: 'file:///test.js' },
                    { intent: 'https://jsonplaceholder.typicode.com/todos/1' },
                    { intent: 'term://ls' },
                    { intent: 'git://status' }
                ];
                for (const t of tests) {
                    results.push(await router.execute(t));
                }
                console.log("Test Suite Results:", results);
                window.toast("Intent Router Tests Finished (Check Console)");
            }
        });
    }
  });
} else {
  // Standalone/Dev mode
  const router = new IntentRouter();
  router.init();
  window.intentRouter = router;
}

 * Intent Router for Acode
 * Developed by Leion-wp & Rutex AI
 */

class Registry {
  constructor() {
    this.providers = [];
  }

  register(provider) {
    this.providers.push(provider);
  }

  getProviderFor(intent) {
    return this.providers.find(p => p.canHandle(intent));
  }
}

class IntentRouter {
  constructor() {
    this.registry = new Registry();
    this.settings = {
      githubToken: null,
      logLevel: 'debug'
    };
    this.logs = [];
  }

  async init() {
    this.log("Intent Router Initialized", "info");
    // Load settings from Acode if available
  }

  log(msg, level = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: msg
    };
    this.logs.push(entry);
    if (this.logs.length > 1000) this.logs.shift();
    
    console[level === 'error' ? 'error' : 'log'](`[IntentRouter] ${msg}`);
  }

  async getCapabilities() {
    return {
      terminal: typeof window.terminal !== 'undefined' || !!window.acode?.require('terminal'),
      git: true, // Assuming git is available in environment
      github: !!this.settings.githubToken,
      docker: false, // Experimental/Disabled for now
      termux: typeof window.arguments !== 'undefined', // Rough check for termux environment
      fs: true,
      http: true
    };
  }

  /**
   * Main Execution Engine
   * @param {Object} intent { intent: string, payload: object, meta: object }
   */
  async execute(intent, context = {}) {
    const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);
    this.log(`[${traceId}] Executing: ${intent.intent}`, 'info');

    try {
      // 1. Validation
      if (!intent || !intent.intent) {
        throw new Error('INVALID_INTENT: Intent URI/Name is required');
      }

      // 2. Resolution
      const provider = this.registry.getProviderFor(intent);
      if (!provider) {
        throw new Error(`PROVIDER_NOT_FOUND: No provider handles "${intent.intent}"`);
      }

      // 3. Capability Check
      const capabilities = await this.getCapabilities();
      const required = provider.getRequiredCapability ? provider.getRequiredCapability(intent) : null;
      
      if (required && !capabilities[required]) {
        throw new Error(`CAPABILITY_MISSING: Environment lacks "${required}" for this intent`);
      }

      // 4. Execution
      const result = await provider.execute(intent, { ...context, traceId, capabilities });

      // 5. Normalization
      const response = {
        success: result.success !== false,
        data: result.data || null,
        error: result.error || null,
        metadata: {
          ...result.metadata,
          traceId,
          provider: provider.id,
          timestamp: Date.now()
        }
      };

      if (!response.success) {
        this.log(`[${traceId}] Provider Error: ${JSON.stringify(response.error)}`, 'error');
      }

      return response;

    } catch (error) {
      const errorMsg = error.message || 'Unknown execution error';
      this.log(`[${traceId}] Critical Failure: ${errorMsg}`, 'error');
      
      // User feedback
      if (typeof window.toast !== 'undefined') {
        window.toast(`Intent Error: ${errorMsg.split(':')[0]}`, 4000);
      }

      return {
        success: false,
        data: null,
        error: {
          message: errorMsg,
          code: errorMsg.includes(':') ? errorMsg.split(':')[1].trim() : 'INTERNAL_ERROR'
        },
        metadata: { traceId, timestamp: Date.now() }
      };
    }
  }
}


/**
 * Base Provider Logic & Default Providers
 */

class SystemProvider {
    canHandle(intent) {
        return intent.intent.startsWith('system://') || intent.intent.startsWith('file://');
    }

    async execute(intent, context) {
        try {
            if (intent.intent.startsWith('file://')) {
                // Handle file operations via Acode API
                return { success: true, data: { action: 'file_handled' } };
            }
            
            // Example system action
            window.toast(`System action: ${intent.intent}`);
            return { success: true, data: { action: intent.intent } };
        } catch (e) {
            return { success: false, error: { code: 'SYSTEM_ERROR', message: e.message } };
        }
    }
}

class HttpProvider {
    canHandle(intent) {
        return intent.intent.startsWith('http://') || intent.intent.startsWith('https://');
    }

    async execute(intent, context) {
        try {
            const response = await fetch(intent.intent, {
                method: intent.payload?.method || 'GET',
                body: intent.payload?.body ? JSON.stringify(intent.payload.body) : undefined,
                headers: intent.payload?.headers || {}
            });
            const data = await response.json();
            return { success: true, data };
        } catch (e) {
            return { success: false, error: { code: 'HTTP_ERROR', message: e.message } };
        }
    }
}

class TerminalProvider {
    canHandle(intent) {
        return intent.intent.startsWith('terminal://') || intent.intent.startsWith('sh://');
    }

    async execute(intent, context) {
        if (!context.capabilities.terminal) {
            return { success: false, error: { code: 'CAPABILITY_MISSING', message: 'Terminal not available' } };
        }
        
        try {
            // Placeholder for Acode terminal execution
            // const result = await acode.exec(intent.payload.command);
            return { success: true, data: { stdout: 'Command executed (simulated)' } };
        } catch (e) {
            return { success: false, error: { code: 'TERMINAL_ERROR', message: e.message } };
        }
    }
}


// Acode Plugin Entry Point
let router;

function init() {
    router = new IntentRouter();
    router.init().then(() => {
        // Registering to Acode (if applicable)
        // For example, adding a command to the command palette
        if (typeof editorManager !== 'undefined') {
            editorManager.editor.commands.addCommand({
                name: "intentRouter:execute",
                bindKey: { win: "Ctrl-Shift-I", mac: "Command-Shift-I" },
                exec: async () => {
                    const input = await window.prompt("Enter Intent (JSON or URI):");
                    if (input) {
                        try {
                            const intent = input.startsWith('{') ? JSON.parse(input) : { intent: input };
                            const result = await router.execute(intent);
                            console.log("Intent Result:", result);
                        } catch (e) {
                            window.toast("Invalid Intent format");
                        }
                    }
                }
            });
        }
    });
}

if (window.acode) {
    acode.setPluginInit(init);
} else {
    // Fallback or dev environment
    init();
}


  /**
   * Core execution engine with global error handling
   * @param {Intent} intent 
   * @param {Object} context 
   * @returns {Promise<IntentResponse>}
   */
  async execute(intent, context = {}) {
    const traceId = intent.meta?.traceId || Math.random().toString(36).substring(7);
    this.log(`[${traceId}] Executing intent: ${intent.intent}`, 'info');

    try {
      // 1. Validation
      if (!intent || !intent.intent) {
        throw new Error('INVALID_INTENT: Intent name is required');
      }

      // 2. Resolution
      const provider = this.registry.getProviderFor(intent);
      if (!provider) {
        throw new Error(`PROVIDER_NOT_FOUND: No provider found for intent "${intent.intent}"`);
      }

      // 3. Capability Check
      const capabilities = await this.getCapabilities();
      const requiredCapability = provider.getRequiredCapability ? provider.getRequiredCapability(intent) : null;
      
      if (requiredCapability && !capabilities[requiredCapability]) {
        throw new Error(`CAPABILITY_MISSING: Environment does not support "${requiredCapability}"`);
      }

      // 4. Execution
      const result = await provider.execute(intent, { ...context, traceId, capabilities });

      // 5. Normalization & Logging
      const response = {
        success: result.success ?? true,
        data: result.data || null,
        error: result.error || null,
        metadata: {
          ...result.metadata,
          traceId,
          provider: provider.id,
          timestamp: Date.now()
        }
      };

      if (!response.success) {
        this.log(`[${traceId}] Execution failed: ${response.error}`, 'error');
      }

      return response;

    } catch (error) {
      const errorResponse = {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          traceId,
          code: error.code || 'UNKNOWN_ERROR',
          timestamp: Date.now()
        }
      };

      this.log(`[${traceId}] Critical error: ${error.message}`, 'error');
      window.toast(error.message, 4000);
      return errorResponse;
    }
  }

  async getCapabilities() {
    // Dynamic capability detection for Android/Acode
    return {
      terminal: typeof window.terminal !== 'undefined',
      git: await this.checkBinary('git'),
      github: !!this.settings.githubToken,
      docker: false, // Marked as false/experimental for now
      termux: await this.checkBinary('termux-info'),
      fs: true,
      http: true
    };
  }

  async checkBinary(name) {
    try {
      if (typeof window.terminal === 'undefined') return false;
      // Simple check via terminal if available
      return true; // Simplified for now
    } catch (e) {
      return false;
    }
  }

  log(msg, level = 'info') {
    console[level](`[IntentRouter] ${msg}`);
  }
}


/**
 * SYSTEM PROVIDER
 * Handles: file://, http://, system://, share://
 */
class SystemProvider {
  constructor(router) {
    this.id = 'system';
    this.router = router;
  }

  canHandle(intent) {
    return /^(file|http|https|system|share|open):/.test(intent.intent);
  }

  async execute(intent, context) {
    const uri = intent.intent;
    
    if (uri.startsWith('share://')) {
      const text = intent.payload?.text || uri.replace('share://', '');
      if (window.system && window.system.share) {
        await window.system.share(text);
        return { success: true };
      }
      throw new Error('COMMAND_UNAVAILABLE: System share not supported');
    }

    if (uri.startsWith('http')) {
      // Logic for opening URL or fetching
      window.open(uri, '_blank');
      return { success: true, data: { url: uri } };
    }

    if (uri.startsWith('file://')) {
      // Logic for opening file in Acode
      const path = uri.replace('file://', '');
      this.router.log(`Opening file: ${path}`);
      // Acode specific file opening logic would go here
      return { success: true };
    }

    return { success: false, error: 'UNSUPPORTED_SYSTEM_INTENT' };
  }
}

/**
 * TERMINAL PROVIDER
 * Handles: term://, exec://
 */
class TerminalProvider {
  constructor(router) {
    this.id = 'terminal';
    this.router = router;
  }

  canHandle(intent) {
    return /^(term|exec):/.test(intent.intent);
  }

  getRequiredCapability() {
    return 'terminal';
  }

  async execute(intent, context) {
    const command = intent.payload?.command || intent.intent.split('://')[1];
    
    if (!context.capabilities.terminal) {
      throw new Error('COMMAND_UNAVAILABLE: Terminal plugin not installed');
    }

    // Execute in Acode terminal
    this.router.log(`Executing: ${command}`);
    // Mocking execution for now
    return { success: true, data: { command, output: 'Command sent to terminal' } };
  }
}


/**
 * AI PROVIDER
 * Handles: ai://, prompt://, codegen://
 */
class AIProvider {
  constructor(router) {
    this.id = 'ai';
    this.router = router;
  }

  canHandle(intent) {
    return /^(ai|prompt|codegen):/.test(intent.intent);
  }

  async execute(intent, context) {
    const prompt = intent.payload?.prompt || intent.intent.split('://')[1];
    this.router.log(`AI Prompt: ${prompt}`);
    
    // Here we would integrate with an AI service or another Acode plugin
    return { 
      success: true, 
      data: { response: "AI processing not yet fully linked to a backend" },
      metadata: { model: "mock-v1" }
    };
  }
}

/**
 * GIT PROVIDER
 * Handles: git://, github://
 */
class GitProvider {
  constructor(router) {
    this.id = 'git';
    this.router = router;
  }

  canHandle(intent) {
    return /^(git|github):/.test(intent.intent);
  }

  getRequiredCapability(intent) {
    return intent.intent.startsWith('github') ? 'github' : 'git';
  }

  async execute(intent, context) {
    const action = intent.intent.split('://')[1];
    
    if (intent.intent.startsWith('github')) {
      if (!context.capabilities.github) {
        throw new Error('PERMISSION_DENIED: GitHub token missing in settings');
      }
      // GitHub API Logic
      return { success: true, data: { action, status: 'github_action_initiated' } };
    }

    // Local Git Logic
    return { success: true, data: { action, status: 'git_action_queued' } };
  }
}

// Initialization
if (window.acode) {
  const router = new IntentRouter();
  
  // Registering providers in order
  router.registry.register(new SystemProvider(router));
  router.registry.register(new TerminalProvider(router));
  router.registry.register(new AIProvider(router));
  router.registry.register(new GitProvider(router));

  acode.setPluginInit('com.leion.roots', (baseUrl, $page, { cacheFile, cacheFileUrl }) => {
    router.init();
    window.intentRouter = router; // Expose for other plugins
  });
}
