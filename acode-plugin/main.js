/**
 * Intent Router for Acode
 * Developed by Rutex (Hall Of Codes)
 */

class BaseProvider {
  constructor(name) {
    this.name = name;
  }
  async canHandle(intent) { return false; }
  async execute(intent, context) {
    return { success: false, error: 'Not implemented' };
  }
}

class IntentRouter {
  constructor() {
    this.providers = [];
    this.capabilities = {};
    this.logs = [];
  }

  registerProvider(provider) {
    this.providers.push(provider);
    console.log(`[IntentRouter] Registered: ${provider.name}`);
  }

  async getCapabilities() {
    return {
      terminal: !!window.terminal,
      git: await this.checkGit(),
      termux: /Termux/.test(navigator.userAgent),
      android: /Android/.test(navigator.userAgent),
      docker: false // Not supported on Android/Acode yet
    };
  }

  async checkGit() {
    if (!window.terminal) return false;
    try {
      // Mock check for now, in real scenario we'd run 'git --version'
      return true;
    } catch (e) { return false; }
  }

  async execute(intent) {
    const context = { capabilities: await this.getCapabilities() };
    this.logs.push({ intent, timestamp: Date.now() });

    try {
      const provider = await this.resolveProvider(intent);
      if (!provider) {
        throw new Error(`No provider found for scheme: ${intent.scheme}`);
      }

      const result = await provider.execute(intent, context);
      return this.normalizeResponse(result);
    } catch (err) {
      console.error('[IntentRouter] Execution Error:', err);
      return { success: false, error: err.message };
    }
  }

  async resolveProvider(intent) {
    for (const p of this.providers) {
      if (await p.canHandle(intent)) return p;
    }
    return null;
  }

  normalizeResponse(res) {
    return {
      success: res.success ?? false,
      data: res.data ?? null,
      error: res.error ?? null,
      metadata: {
        ...res.metadata,
        timestamp: Date.now(),
        routerVersion: "1.0.0"
      }
    };
  }
}

 * Intent Router for Acode
 * Clean Architecture Implementation
 */

// --- Constants & Types ---
const SCHEMES = {
  SYSTEM: 'system',
  AI: 'ai',
  GITHUB: 'github',
  TERMINAL: 'terminal',
  DOCKER: 'docker'
};

const ERROR_CODES = {
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  CAPABILITY_MISSING: 'CAPABILITY_MISSING',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  INVALID_INTENT: 'INVALID_INTENT'
};

// --- Base Provider ---
class BaseProvider {
  constructor(name) {
    this.name = name;
  }
  canHandle(intent) { return false; }
  async execute(intent, context) {
    return this.normalizeResponse(false, null, 'Not implemented');
  }
  normalizeResponse(success, data = null, error = null, metadata = {}) {
    return { success, data, error, metadata, timestamp: Date.now(), provider: this.name };
  }
}

// --- System Provider ---
class SystemProvider extends BaseProvider {
  constructor() { super('SystemProvider'); }
  canHandle(intent) { return intent.scheme === SCHEMES.SYSTEM; }
  async execute(intent, context) {
    try {
      switch (intent.action) {
        case 'toast':
          window.toast(intent.data.message, 3000);
          return this.normalizeResponse(true, { status: 'sent' });
        case 'alert':
          await window.alert(intent.data.title || 'Alert', intent.data.message);
          return this.normalizeResponse(true, { status: 'confirmed' });
        default:
          return this.normalizeResponse(false, null, `Action ${intent.action} not found`);
      }
    } catch (e) {
      return this.normalizeResponse(false, null, e.message);
    }
  }
}
