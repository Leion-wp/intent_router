
const terminals: any[] = [];

module.exports = {
  window: {
    createTerminal: (name: string) => {
      const t = { name, show: () => {}, sendText: () => {}, dispose: () => {} };
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
    showErrorMessage: () => {}
  },
  commands: {
      executeCommand: async () => {}
  },
  workspace: {
      getConfiguration: () => ({
          get: (key: string, def: any) => def
      })
  }
};
