import * as assert from 'assert';
import * as vscode from 'vscode';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const { pipelineEventBus, PipelineEvent } = require('../../out/eventBus');
Module.prototype.require = originalRequire;

suite('EventBus Subscriber Isolation (Mocked)', () => {
  let originalConsoleError: typeof console.error;
  let loggedErrors: any[] = [];

  setup(() => {
    loggedErrors = [];
    originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      loggedErrors.push(args);
    };
  });

  teardown(() => {
    console.error = originalConsoleError;
  });

  test('listener B still receives event when listener A throws', () => {
    let callOrder: string[] = [];
    let receivedEventB: any = null;

    const subA = pipelineEventBus.on(() => {
      callOrder.push('A');
      throw new Error('Listener A failure');
    });

    const subB = pipelineEventBus.on((event: any) => {
      callOrder.push('B');
      receivedEventB = event;
    });

    try {
      const sampleEvent: any = { type: 'pipelinePause', runId: 'run-1', timestamp: 123456 };
      assert.doesNotThrow(() => {
        pipelineEventBus.emit(sampleEvent);
      });

      assert.deepStrictEqual(callOrder, ['A', 'B']);
      assert.strictEqual(receivedEventB, sampleEvent);
      assert.strictEqual(loggedErrors.length, 1);
      assert.ok(String(loggedErrors[0][1]).includes('Listener A failure'));
    } finally {
      subA.dispose();
      subB.dispose();
    }
  });

  test('emit() does not throw when subscriber throws', () => {
    const sub = pipelineEventBus.on(() => {
      throw new Error('Boom');
    });

    try {
      assert.doesNotThrow(() => {
        pipelineEventBus.emit({ type: 'pipelineResume', runId: 'run-2', timestamp: 7890 });
      });
      assert.strictEqual(loggedErrors.length, 1);
    } finally {
      sub.dispose();
    }
  });

  test('multiple throwing listeners followed by a healthy listener', () => {
    const calls: string[] = [];

    const sub1 = pipelineEventBus.on(() => {
      calls.push('1');
      throw new Error('Error 1');
    });

    const sub2 = pipelineEventBus.on(() => {
      calls.push('2');
      throw new Error('Error 2');
    });

    const sub3 = pipelineEventBus.on(() => {
      calls.push('3');
    });

    try {
      pipelineEventBus.emit({ type: 'pipelinePause', runId: 'run-3', timestamp: 100 });
      assert.deepStrictEqual(calls, ['1', '2', '3']);
      assert.strictEqual(loggedErrors.length, 2);
    } finally {
      sub1.dispose();
      sub2.dispose();
      sub3.dispose();
    }
  });

  test('dispose during callback allows current emission to complete and unsubscribes future emissions', () => {
    const calls: string[] = [];
    let sub2: vscode.Disposable;

    const sub1 = pipelineEventBus.on(() => {
      calls.push('1');
    });

    sub2 = pipelineEventBus.on(() => {
      calls.push('2');
      sub2.dispose();
    });

    const sub3 = pipelineEventBus.on(() => {
      calls.push('3');
    });

    try {
      pipelineEventBus.emit({ type: 'pipelinePause', runId: 'run-4', timestamp: 200 });
      assert.deepStrictEqual(calls, ['1', '2', '3']);

      calls.length = 0;
      pipelineEventBus.emit({ type: 'pipelinePause', runId: 'run-4', timestamp: 201 });
      assert.deepStrictEqual(calls, ['1', '3']);
    } finally {
      sub1.dispose();
      sub2.dispose();
      sub3.dispose();
    }
  });

  test('adding listener during emission does not receive current event but receives next event', () => {
    const calls: string[] = [];
    let lateSub: any = null;

    const sub1 = pipelineEventBus.on(() => {
      calls.push('1');
      lateSub = pipelineEventBus.on(() => {
        calls.push('late');
      });
    });

    const sub2 = pipelineEventBus.on(() => {
      calls.push('2');
    });

    try {
      pipelineEventBus.emit({ type: 'pipelinePause', runId: 'run-5', timestamp: 300 });
      assert.deepStrictEqual(calls, ['1', '2']);

      calls.length = 0;
      pipelineEventBus.emit({ type: 'pipelinePause', runId: 'run-5', timestamp: 301 });
      assert.deepStrictEqual(calls, ['1', '2', 'late']);
    } finally {
      sub1.dispose();
      sub2.dispose();
      lateSub?.dispose();
    }
  });

  test('listeners are called in order of registration', () => {
    const order: number[] = [];
    const subs = [1, 2, 3, 4, 5].map(i =>
      pipelineEventBus.on(() => {
        order.push(i);
      })
    );

    try {
      pipelineEventBus.emit({ type: 'pipelinePause', runId: 'run-6', timestamp: 400 });
      assert.deepStrictEqual(order, [1, 2, 3, 4, 5]);
    } finally {
      subs.forEach(s => s.dispose());
    }
  });

  test('smoke test with stepLog emitted to faulty subscriber', () => {
    const logsReceived: string[] = [];

    const faultySub = pipelineEventBus.on((event: any) => {
      if (event.type === 'stepLog') {
        throw new Error('Telemetry broken');
      }
    });

    const normalSub = pipelineEventBus.on((event: any) => {
      if (event.type === 'stepLog') {
        logsReceived.push(event.text);
      }
    });

    try {
      pipelineEventBus.emit({
        type: 'stepLog',
        runId: 'run-7',
        intentId: 'intent-1',
        text: 'hello from stdout',
        stream: 'stdout'
      });

      assert.deepStrictEqual(logsReceived, ['hello from stdout']);
      assert.strictEqual(loggedErrors.length, 1);
    } finally {
      faultySub.dispose();
      normalSub.dispose();
    }
  });
});
