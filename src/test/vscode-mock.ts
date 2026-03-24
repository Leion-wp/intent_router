const fs = require('fs');
const terminals: any[] = [];
let webviewPanel: any = null;
const outputLines: string[] = [];
const openedExternalUris: any[] = [];
const clipboardWrites: string[] = [];
const openedTextDocuments: any[] = [];
const shownTextDocuments: any[] = [];
const commandHandlers = new Map<string, (...args: any[]) => any>();
const configurationChangeListeners: Array<(event: { affectsConfiguration: (section: string) => boolean }) => void> = [];

const configStore = new Map<string, any>();
configStore.set('intentRouter.logLevel', 'debug');
configStore.set('intentRouter.debug', false);
configStore.set('intentRouter.mappings', []);
configStore.set('intentRouter.profiles', []);
configStore.set('intentRouter.activeProfile', '');
configStore.set('intentRouter.environment', {});

function normalizePathForUri(input: string) {
  return String(input || '').replace(/\\/g, '/');
}

function joinFsPath(base: string, part: string) {
  if (!base) return String(part || '');
  const trimmedBase = String(base || '').replace(/[\\/]+$/, '');
  const trimmedPart = String(part || '').replace(/^[\\/]+/, '');
  const separator = trimmedBase.includes('\\') ? '\\' : '/';
  return `${trimmedBase}${separator}${trimmedPart}`;
}

function makeDisposable(fn: () => void) {
  return { dispose: fn };
}

function fireConfigurationChange(changedKey: string) {
  const section = changedKey.startsWith('intentRouter.')
    ? changedKey
    : `intentRouter.${changedKey}`;
  const event = {
    affectsConfiguration: (candidate: string) => candidate === section || section.startsWith(`${candidate}.`)
  };
  configurationChangeListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // best-effort in mock
    }
  });
}

const Uri = {
    file: (path: string) => ({ fsPath: path, path: normalizePathForUri(path), scheme: 'file' }),
    parse: (value: string) => {
        const raw = String(value || '');
        const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+\-.]*):/.exec(raw);
        const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : 'file';
        return { fsPath: raw, path: normalizePathForUri(raw), scheme };
    },
    joinPath: (base: any, ...parts: string[]) => ({
        fsPath: parts.reduce((acc, part) => joinFsPath(acc, part), String(base.fsPath || base.path || '')),
        path: parts.reduce((acc, part) => `${String(acc || '').replace(/\/+$/, '')}/${String(part || '').replace(/^\/+/, '')}`, normalizePathForUri(String(base.path || base.fsPath || ''))),
        scheme: 'file'
    })
};

class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];
  event = (listener: (value: T) => void) => {
    this.listeners.push(listener);
    return makeDisposable(() => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    });
  };
  fire(value: T) {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }
  dispose() {
    this.listeners.length = 0;
  }
}

module.exports = {
  Uri,
  EventEmitter,
  window: {
    createTerminal: (nameOrOptions: any) => {
      let name = nameOrOptions;
      let creationOptions = {};
      if (typeof nameOrOptions === 'object') {
          name = nameOrOptions.name;
          creationOptions = nameOrOptions;
      }
      const t: any = {
          name,
          creationOptions,
          sentText: [] as string[],
          show: () => {},
          sendText: (text: string) => {
              t.sentText.push(String(text));
          },
          dispose: () => {
              const idx = terminals.indexOf(t);
              if (idx !== -1) terminals.splice(idx, 1);
          }
      };
      terminals.push(t);
      return t;
    },
    terminals: terminals,
    showInputBox: async (options: any) => {
        return 'mocked-value';
    },
    showInformationMessage: async () => {},
    showTextDocument: async (doc: any, options?: any) => {
      shownTextDocuments.push({ doc, options });
      return doc;
    },
    createOutputChannel: () => ({
      appendLine: (line: string) => outputLines.push(String(line)),
      clear: () => { outputLines.length = 0; }
    }),
    showWarningMessage: () => {},
    showErrorMessage: () => {},
    createWebviewPanel: (viewType: string, title: string, showOptions: any, options: any) => {
        webviewPanel = {
            title,
            visible: true,
            webview: {
                html: '',
                asWebviewUri: (uri: any) => uri,
                onDidReceiveMessage: (callback: any) => {
                    webviewPanel.postMessageCallback = callback;
                },
                postMessage: async (msg: any) => {
                    if (webviewPanel.onMessageReceived) {
                        webviewPanel.onMessageReceived(msg);
                    }
                },
                cspSource: 'mock-csp'
            },
            onDidDispose: () => {},
            reveal: () => {},
            dispose: () => { webviewPanel.visible = false; }
        };
        return webviewPanel;
    },
    // Test helper to access the last created panel
    getLastWebviewPanel: () => webviewPanel
  },
  commands: {
      registerCommand: (id: string, handler: (...args: any[]) => any) => {
          commandHandlers.set(id, handler);
          return makeDisposable(() => commandHandlers.delete(id));
      },
      executeCommand: async (id: string, ...args: any[]) => {
          const handler = commandHandlers.get(id);
          if (handler) {
            return await handler(...args);
          }
          return undefined;
      },
      getCommands: async () => Array.from(commandHandlers.keys())
  },
  workspace: {
      getConfiguration: (section?: string) => ({
          get: (key: string, def: any) => {
              const fullKey = section ? `${section}.${key}` : key;
              return configStore.has(fullKey) ? configStore.get(fullKey) : def;
          },
          update: async (key: string, value: any) => {
              const fullKey = section ? `${section}.${key}` : key;
              configStore.set(fullKey, value);
              fireConfigurationChange(fullKey);
          }
      }),
      onDidChangeConfiguration: (listener: (event: { affectsConfiguration: (section: string) => boolean }) => void) => {
          configurationChangeListeners.push(listener);
          return makeDisposable(() => {
              const index = configurationChangeListeners.indexOf(listener);
              if (index >= 0) configurationChangeListeners.splice(index, 1);
          });
      },
      createFileSystemWatcher: (_globPattern: string) => {
          const onDidChangeListeners: Array<(...args: any[]) => void> = [];
          const onDidCreateListeners: Array<(...args: any[]) => void> = [];
          const onDidDeleteListeners: Array<(...args: any[]) => void> = [];
          return {
              onDidChange: (listener: (...args: any[]) => void) => {
                  onDidChangeListeners.push(listener);
                  return makeDisposable(() => {});
              },
              onDidCreate: (listener: (...args: any[]) => void) => {
                  onDidCreateListeners.push(listener);
                  return makeDisposable(() => {});
              },
              onDidDelete: (listener: (...args: any[]) => void) => {
                  onDidDeleteListeners.push(listener);
                  return makeDisposable(() => {});
              },
              dispose: () => {}
          };
      },
      workspaceFolders: [{ uri: { path: '/root' } }],
      fs: {
          createDirectory: async (uri: any) => {
              const target = String(uri?.fsPath || uri?.path || '');
              if (!target) return;
              fs.mkdirSync(target, { recursive: true });
          },
          writeFile: async (uri: any, data: Uint8Array) => {
              const target = String(uri?.fsPath || uri?.path || '');
              if (!target) return;
              fs.writeFileSync(target, Buffer.from(data));
          },
          readFile: async (uri: any) => {
              const target = String(uri?.fsPath || uri?.path || '');
              if (target && fs.existsSync(target)) {
                  return fs.readFileSync(target);
              }
              return Buffer.from('[]');
          }
      },
      openTextDocument: async (uri: any) => {
          const doc = { uri };
          openedTextDocuments.push(doc);
          return doc;
      }
  },
  env: {
    openExternal: async (uri: any) => {
      openedExternalUris.push(uri);
      return true;
    },
    clipboard: {
      writeText: async (text: string) => {
        clipboardWrites.push(String(text));
      },
      readText: async () => clipboardWrites[clipboardWrites.length - 1] || ''
    }
  },
  __mock: {
    outputLines,
    openedExternalUris,
    clipboardWrites,
    openedTextDocuments,
    shownTextDocuments,
    commandHandlers,
    configStore,
    reset: () => {
      terminals.length = 0;
      outputLines.length = 0;
      openedExternalUris.length = 0;
      clipboardWrites.length = 0;
      openedTextDocuments.length = 0;
      shownTextDocuments.length = 0;
      commandHandlers.clear();
      configurationChangeListeners.length = 0;
      configStore.clear();
      configStore.set('intentRouter.logLevel', 'debug');
      configStore.set('intentRouter.debug', false);
      configStore.set('intentRouter.mappings', []);
      configStore.set('intentRouter.profiles', []);
      configStore.set('intentRouter.activeProfile', '');
      configStore.set('intentRouter.environment', {});
    }
  },
  ExtensionMode: { Development: 1, Test: 2, Production: 3 },
  ViewColumn: { Active: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 }
};
