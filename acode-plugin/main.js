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

class AIProvider extends BaseProvider {
  constructor() {
    super('AIProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.AI;
  }

  async execute(intent) {
    const { action, data } = intent;
    return this.normalizeResponse(true, { 
      answer: `AI Response to ${action}: ${data.prompt || 'No prompt provided'}` 
    }, null, { model: data.model || 'gpt-3.5-turbo' });
  }
}

class GitHubProvider extends BaseProvider {
  constructor() {
    super('GitHubProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.GITHUB;
  }

  async execute(intent) {
    const { action, data } = intent;
    const baseUrl = 'https://api.github.com';
    const headers = data.token ? { 'Authorization': `token ${data.token}` } : {};

    try {
      let response;
      switch (action) {
        case 'get_repo':
          response = await fetch(`${baseUrl}/repos/${data.owner}/${data.repo}`, { headers });
          break;
        case 'get_file':
          response = await fetch(`${baseUrl}/repos/${data.owner}/${data.repo}/contents/${data.path}`, { headers });
          break;
        default:
          return this.normalizeResponse(false, null, `Action ${action} not supported`);
      }

      if (!response.ok) throw new Error(`GitHub API: ${response.statusText}`);
      const result = await response.json();
      return this.normalizeResponse(true, result);
    } catch (e) {
      return this.normalizeResponse(false, null, e.message);
    }
  }
}

class TerminalProvider extends BaseProvider {
  constructor() {
    super('TerminalProvider');
  }

  canHandle(intent) {
    return intent.scheme === SCHEMES.TERMINAL;
  }

  async execute(intent, context) {
    if (!context.capabilities.terminal) {
      return this.normalizeResponse(false, null, 'Terminal capability not available');
    }

    const { action, data } = intent;
    if (action === 'exec') {
      if (window.terminal && typeof window.terminal.exec === 'function') {
        const output = await window.terminal.exec(data.command);
        return this.normalizeResponse(true, { output });
      }
      return this.normalizeResponse(false, null, 'Terminal plugin found but exec function missing');
    }
    return this.normalizeResponse(false, null, `Action ${action} not supported`);
  }
}
