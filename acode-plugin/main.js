

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
