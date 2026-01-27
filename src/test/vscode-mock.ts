
const terminals: any[] = [];
let webviewPanel: any = null;

const Uri = {
    file: (path: string) => ({ fsPath: path, path, scheme: 'file' }),
    parse: (path: string) => ({ fsPath: path, path, scheme: 'file' }),
    joinPath: (base: any, ...parts: string[]) => ({
        path: base.path + '/' + parts.join('/'),
        scheme: 'file'
    })
};

module.exports = {
  Uri,
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
          show: () => {},
          sendText: () => {},
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
    createOutputChannel: () => ({ appendLine: () => {} }),
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
      executeCommand: async () => {}
  },
  workspace: {
      getConfiguration: () => ({
          get: (key: string, def: any) => def,
          update: async () => {}
      }),
      workspaceFolders: [{ uri: { path: '/root' } }],
      fs: {
          createDirectory: async () => {},
          writeFile: async () => {},
          readFile: async () => Buffer.from('[]')
      }
  },
  ExtensionMode: { Development: 1, Test: 2, Production: 3 },
  ViewColumn: { Active: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 }
};
