import * as assert from 'assert';
import { EventEmitter } from 'events';

// Mock setup must happen before imports
const mockVscode = require('./vscode-mock');

// Patch EventEmitter
mockVscode.EventEmitter = class {
    listeners: any[] = [];
    get event() {
        return (listener: any) => {
            this.listeners.push(listener);
            return { dispose: () => {} };
        };
    }
    fire(data: any) {
        this.listeners.forEach((l: any) => l(data));
    }
};

const Module = require('module');
const originalRequire = Module.prototype.require;

let mockChildProcess: any = {
    spawn: () => { throw new Error('Not implemented'); }
};

// Override require
Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  if (request === 'child_process') {
      return mockChildProcess;
  }
  return originalRequire.apply(this, arguments);
};

// Import code under test
const { executeTerminalCommand, cancelTerminalRun } = require('../../out/providers/terminalAdapter');
const { pipelineEventBus } = require('../../out/eventBus');

suite('Terminal Adapter Tests (Mocked)', () => {

    test('runCommand spawns process and streams output', async () => {
        mockChildProcess.spawn = (command: string, args: string[], options: any) => {
             const child: any = new EventEmitter();
             child.stdout = new EventEmitter();
             child.stderr = new EventEmitter();
             child.kill = () => {};
             setTimeout(() => {
                  child.stdout.emit('data', 'test output');
                  child.emit('close', 0);
             }, 10);
             return child;
        };

        let logs: any[] = [];
        const listener = pipelineEventBus.on((event: any) => {
             if (event.type === 'stepLog') {
                 logs.push(event);
             }
        });

        const meta = { runId: 'test-run', traceId: 'test-trace' };
        await executeTerminalCommand({ command: 'echo hello', __meta: meta });

        assert.strictEqual(logs.length, 1);
        assert.strictEqual(logs[0].text, 'test output');
        assert.strictEqual(logs[0].runId, 'test-run');

        listener.dispose();
    });

     test('cancelTerminalRun kills process', async () => {
         let killed = false;
         mockChildProcess.spawn = (command: string, args: string[], options: any) => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.kill = () => {
                 killed = true;
                 child.emit('close', null); // closing without code usually
            };
            return child;
        };

        const meta = { runId: 'cancel-run', traceId: 'test-trace' };
        const promise = executeTerminalCommand({ command: 'sleep 10', __meta: meta });

        // Allow spawn to happen
        await new Promise(resolve => setTimeout(resolve, 5));

        cancelTerminalRun('cancel-run');

        try {
            await promise;
        } catch (e) {
            // Expected rejection if code is not 0
        }

        assert.ok(killed, 'Process should have been killed');
    });
});
