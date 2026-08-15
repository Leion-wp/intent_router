/**
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
