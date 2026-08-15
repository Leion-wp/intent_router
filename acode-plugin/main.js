/**
 * Intent Router for Acode
 * Version: 1.0.0
 * Developed by Rutex (Hall Of Codes)
 */

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

class BaseProvider {
  constructor(name) {
    this.name = name;
  }
  
  canHandle(intent) {
    return false;
  }

  async execute(intent, context) {
    return this.normalizeResponse(false, null, 'Not implemented');
  }

  normalizeResponse(success, data = null, error = null, metadata = {}) {
    return {
      success,
      data,
      error,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        provider: this.name
      }
    };
  }
}

class SystemProvider extends BaseProvider {
  constructor() {
    super('SystemProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.SYSTEM;
  }

  async execute(intent) {
    const { action, data } = intent;
    try {
      switch (action) {
        case 'toast':
          window.toast(data.message || 'Default Toast', 3000);
          return this.normalizeResponse(true, { status: 'sent' });
        case 'alert':
          window.alert(data.message || 'Default Alert');
          return this.normalizeResponse(true, { status: 'displayed' });
        case 'confirm':
          const result = window.confirm(data.message || 'Confirm?');
          return this.normalizeResponse(true, result);
        default:
          return this.normalizeResponse(false, null, `Action ${action} not supported`);
      }
    } catch (e) {
      return this.normalizeResponse(false, null, e.message);
    }
  }
}
