const assert = require('assert');
const {
  IntentRouter,
  AcodeTriggerManager,
  isWorkspacePathSafe,
  matchGlob,
  parseWatchEvents,
  asBoolean,
  asPositiveInt
} = require('../main.js');

describe('Acode Watch Triggers Unit Tests', () => {
  describe('Helper Functions', () => {
    it('should validate workspace path safety correctly', () => {
      assert.strictEqual(isWorkspacePathSafe('src/main.js'), true);
      assert.strictEqual(isWorkspacePathSafe('config.json'), true);
      assert.strictEqual(isWorkspacePathSafe('a/b/c/d.ts'), true);

      assert.strictEqual(isWorkspacePathSafe('../outside.js'), false);
      assert.strictEqual(isWorkspacePathSafe('src/../../outside.js'), false);
      assert.strictEqual(isWorkspacePathSafe('/etc/passwd'), false);
      assert.strictEqual(isWorkspacePathSafe('C:\\Windows\\System32'), false);
      assert.strictEqual(isWorkspacePathSafe('file:///sdcard/outside'), false);
      assert.strictEqual(isWorkspacePathSafe(''), false);
    });

    it('should match glob patterns accurately', () => {
      assert.strictEqual(matchGlob('src/index.js', 'src/**/*.js'), true);
      assert.strictEqual(matchGlob('src/components/Button.js', 'src/**/*.js'), true);
      assert.strictEqual(matchGlob('dist/index.js', 'src/**/*.js'), false);
      assert.strictEqual(matchGlob('config.json', '*.json'), true);
      assert.strictEqual(matchGlob('package-lock.json', '*.json'), true);
      assert.strictEqual(matchGlob('src/config.json', '*.json'), false);
    });

    it('should parse watch events correctly', () => {
      assert.deepStrictEqual(Array.from(parseWatchEvents('create,change')), ['create', 'change']);
      assert.deepStrictEqual(Array.from(parseWatchEvents(['change', 'delete'])), ['change', 'delete']);
      assert.deepStrictEqual(Array.from(parseWatchEvents('invalid')), ['change']);
      assert.deepStrictEqual(Array.from(parseWatchEvents('')), ['change']);
    });

    it('should parse boolean and integer configurations', () => {
      assert.strictEqual(asBoolean(true), true);
      assert.strictEqual(asBoolean('false'), false);
      assert.strictEqual(asBoolean('TRUE'), true);
      assert.strictEqual(asBoolean(undefined, true), true);

      assert.strictEqual(asPositiveInt(500, 100), 500);
      assert.strictEqual(asPositiveInt('1200', 100), 1200);
      assert.strictEqual(asPositiveInt(-10, 100), 100);
      assert.strictEqual(asPositiveInt('invalid', 100), 100);
    });
  });

  describe('AcodeTriggerManager End-to-End Watch Behavior', () => {
    let router;
    let virtualFS;
    let executedRuns;

    function createMockFS(files) {
      virtualFS = new Map(Object.entries(files));
      return (url) => {
        const normalizedUrl = url.replace(/\\/g, '/');
        return {
          exists: async () => {
            if (virtualFS.has(normalizedUrl)) return true;
            const prefix = normalizedUrl.endsWith('/') ? normalizedUrl : normalizedUrl + '/';
            for (const key of virtualFS.keys()) {
              if (key.startsWith(prefix)) return true;
            }
            return false;
          },
          stat: async () => {
            const entry = virtualFS.get(normalizedUrl);
            if (!entry) throw new Error(`File not found: ${normalizedUrl}`);
            return {
              mtime: entry.mtime || 1000,
              lastModified: entry.mtime || 1000,
              size: entry.content ? entry.content.length : (entry.size || 0)
            };
          },
          readFile: async () => {
            const entry = virtualFS.get(normalizedUrl);
            if (!entry) throw new Error(`File not found: ${normalizedUrl}`);
            return entry.content || '';
          },
          lsDir: async () => {
            const results = [];
            const prefix = normalizedUrl.endsWith('/') ? normalizedUrl : normalizedUrl + '/';
            for (const [key, entry] of virtualFS.entries()) {
              if (key.startsWith(prefix)) {
                const sub = key.substring(prefix.length);
                const firstSegment = sub.split('/')[0];
                const itemUrl = prefix + firstSegment;
                const isDir = sub.includes('/') || entry.isDir;
                if (!results.some(r => r.url === itemUrl)) {
                  results.push({
                    name: firstSegment,
                    url: itemUrl,
                    isDirectory: isDir,
                    isDir: isDir,
                    stat: {
                      mtime: entry.mtime || 1000,
                      size: entry.content ? entry.content.length : 0
                    }
                  });
                }
              }
            }
            return results;
          }
        };
      }
    }

    beforeEach(() => {
      executedRuns = [];
      router = new IntentRouter();
      router.workspaceRoot = 'file:///workspace';
      router.setupCommands();
      router.modules.fs = createMockFS({
        'file:///workspace/pipeline/test.intent.json': {
          mtime: 1000,
          content: JSON.stringify({
            steps: [
              {
                id: "watch_step_1",
                intent: "system.trigger.watch",
                payload: {
                  enabled: true,
                  glob: "src/**/*.js",
                  events: "create,change,delete",
                  debounceMs: 10,
                  cooldownMs: 50,
                  pollIntervalMs: 0
                }
              },
              {
                id: "toast_step",
                intent: "system.toast",
                payload: {
                  message: "Triggered for ${trigger_path}"
                }
              }
            ]
          })
        },
        'file:///workspace/src/app.js': {
          mtime: 1000,
          content: 'console.log("hello");'
        }
      });

      router.register('system:toast', (data, intent) => {
        executedRuns.push({ data, intent, runtimeVariables: intent.runtimeVariables });
        return { shown: true };
      });
    });

    afterEach(() => {
      if (router) {
        router.destroy();
      }
    });

    it('should discover and register active watch triggers upon refresh', async () => {
      await router.triggerManager.refresh();
      const list = router.triggerManager.getRegistrations();

      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].stepId, 'watch_step_1');
      assert.strictEqual(list[0].pattern, 'src/**/*.js');
      assert.deepStrictEqual(list[0].events, ['create', 'change', 'delete']);
      assert.strictEqual(list[0].enabled, true);
    });

    it('should ignore triggers with enabled: false', async () => {
      virtualFS.set('file:///workspace/pipeline/test.intent.json', {
        mtime: 1000,
        content: JSON.stringify({
          steps: [
            {
              id: "watch_disabled",
              intent: "system.trigger.watch",
              payload: {
                enabled: false,
                glob: "src/**/*.js"
              }
            }
          ]
        })
      });

      await router.triggerManager.refresh();
      const list = router.triggerManager.getRegistrations();
      assert.strictEqual(list.length, 0);
    });

    it('should reject unsafe or external path triggers', async () => {
      virtualFS.set('file:///workspace/pipeline/test.intent.json', {
        mtime: 1000,
        content: JSON.stringify({
          steps: [
            {
              id: "watch_unsafe",
              intent: "system.trigger.watch",
              payload: {
                enabled: true,
                glob: "../../secret.txt"
              }
            }
          ]
        })
      });

      await router.triggerManager.refresh();
      const list = router.triggerManager.getRegistrations();
      assert.strictEqual(list.length, 0);
    });

    it('should detect file modification and execute pipeline with correct context', async () => {
      await router.triggerManager.refresh();
      assert.strictEqual(executedRuns.length, 0);

      // Modify file mtime
      virtualFS.set('file:///workspace/src/app.js', {
        mtime: 2000,
        content: 'console.log("updated");'
      });

      // Poll tick
      const regId = router.triggerManager.getRegistrations()[0].id;
      const reg = router.triggerManager.registrations.get(regId);
      await router.triggerManager.pollTick(regId, 'file:///workspace');

      if (reg.lastRunPromise) await reg.lastRunPromise;

      assert.strictEqual(executedRuns.length, 1);
      assert.strictEqual(executedRuns[0].data.message, 'Triggered for src/app.js');
    });

    it('should detect file creation and deletion events', async () => {
      await router.triggerManager.refresh();

      const regId = router.triggerManager.getRegistrations()[0].id;
      const reg = router.triggerManager.registrations.get(regId);

      // Add new file
      virtualFS.set('file:///workspace/src/helper.js', {
        mtime: 3000,
        content: 'module.exports = {};'
      });

      await router.triggerManager.pollTick(regId, 'file:///workspace');
      if (reg.lastRunPromise) await reg.lastRunPromise;

      assert.strictEqual(executedRuns.length, 1);

      // Remove created file
      virtualFS.delete('file:///workspace/src/helper.js');

      // Wait out cooldown (50ms)
      await new Promise(resolve => setTimeout(resolve, 70));

      await router.triggerManager.pollTick(regId, 'file:///workspace');
      if (reg.lastRunPromise) await reg.lastRunPromise;

      assert.strictEqual(executedRuns.length, 2);
    });

    it('should coalesce rapid saves using debounce and cooldown', async () => {
      await router.triggerManager.refresh();
      const regId = router.triggerManager.getRegistrations()[0].id;

      // Rapid consecutive file mtime changes
      virtualFS.set('file:///workspace/src/app.js', { mtime: 2001, content: 'v1' });
      await router.triggerManager.pollTick(regId, 'file:///workspace');

      virtualFS.set('file:///workspace/src/app.js', { mtime: 2002, content: 'v2' });
      await router.triggerManager.pollTick(regId, 'file:///workspace');

      virtualFS.set('file:///workspace/src/app.js', { mtime: 2003, content: 'v3' });
      await router.triggerManager.pollTick(regId, 'file:///workspace');

      await new Promise(resolve => setTimeout(resolve, 120));

      assert.strictEqual(executedRuns.length, 1);
    });

    it('should clean up timers and avoid execution after destroy()', async () => {
      await router.triggerManager.refresh();
      const regId = router.triggerManager.getRegistrations()[0].id;

      virtualFS.set('file:///workspace/src/app.js', { mtime: 5000, content: 'destroyed test' });
      await router.triggerManager.pollTick(regId, 'file:///workspace');

      router.destroy();

      await new Promise(resolve => setTimeout(resolve, 120));

      assert.strictEqual(executedRuns.length, 0);
      assert.strictEqual(router.triggerManager.getRegistrations().length, 0);
    });
  });
});
