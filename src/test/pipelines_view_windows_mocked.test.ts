import * as assert from 'assert';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const { PipelinesTreeDataProvider } = require('../../out/pipelinesView');
Module.prototype.require = originalRequire;

suite('Pipelines View Windows Paths (Mocked)', () => {
  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    mockVscode.workspace.workspaceFolders = [
      {
        uri: {
          path: '/D:/intent_router',
          fsPath: 'D:\\intent_router',
          scheme: 'file'
        }
      }
    ];
  });

  test('toPipelineRelativePath tolerates drive-letter case differences', () => {
    const provider = new PipelinesTreeDataProvider();
    const uri = {
      path: '/d:/intent_router/pipeline/product-1/delivery.issue-to-pr.intent.json',
      fsPath: 'd:\\intent_router\\pipeline\\product-1\\delivery.issue-to-pr.intent.json',
      scheme: 'file'
    };

    const relativePath = provider.toPipelineRelativePath(uri as any);
    provider.dispose();

    assert.strictEqual(relativePath, 'product-1/delivery.issue-to-pr.intent.json');
  });
});
