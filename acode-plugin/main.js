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
\n