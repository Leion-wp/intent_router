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
          window.toast(data.message || 'Notification', 3000);
          return this.normalizeResponse(true, { status: 'displayed' });
        case 'alert':
          window.alert(data.message || 'System Alert');
          return this.normalizeResponse(true, { status: 'acknowledged' });
        case 'confirm':
          const result = window.confirm(data.message || 'Are you sure?');
          return this.normalizeResponse(true, { confirmed: result });
        default:
          return this.normalizeResponse(false, null, `Action ${action} not supported`);
      }
    } catch (e) {
      return this.normalizeResponse(false, null, e.message);
    }
  }
}

class AIProvider extends BaseProvider {
  constructor() {
    super('AIProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.AI;
  }

  async execute(intent) {
    const { action, data } = intent;
    // Mock AI response
    return this.normalizeResponse(true, {
      response: `AI simulated response for ${action}: "${data.prompt || data.text || ''}"`,
      model: data.model || 'gpt-3.5-turbo'
    });
  }
}
\n
  }
}
\n