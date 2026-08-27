const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse,
  redactSensitiveData
} = require('../main.js');

describe('Acode OpenAI-compatible AI provider bridge', () => {
  let router;
  let networkRequests;

  beforeEach(() => {
    networkRequests = [];
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();

    // Mock network:request command handler in router
    router.register('network:request', async (data) => {
      networkRequests.push(data);

      if (data.mockError) {
        throw new Error(data.mockError);
      }

      if (data.mockStatus && data.mockStatus !== 200) {
        throw new Error(`HTTP ${data.mockStatus}: ${data.mockResponseBody || 'Server error'}`);
      }

      return {
        status: data.mockStatus || 200,
        headers: { 'content-type': 'application/json' },
        body: data.mockResponseBody !== undefined ? data.mockResponseBody : {
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          model: 'mock-model-reply',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello from mock AI' },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }
      };
    });
  });

  describe('Pure Helper Functions', () => {
    it('buildOpenAiCompatibleUrl normalizes URLs cleanly', () => {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1/'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1/chat/completions'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:8080/v1'),
        'http://127.0.0.1:8080/v1/chat/completions'
      );

      assert.throws(() => buildOpenAiCompatibleUrl(''), /baseUrl is required/);
    });

    it('buildOpenAiCompatibleRequest constructs headers and body with model override and parameters', () => {
      const providerConfig = {
        id: 'remote-ai',
        baseUrl: 'https://api.example.com/v1',
        model: 'default-model',
        secret: 'sk-secret-token-123'
      };

      const payload = {
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'override-model',
        temperature: 0.7,
        maxTokens: 150
      };

      const req = buildOpenAiCompatibleRequest(providerConfig, payload);
      assert.strictEqual(req.url, 'https://api.example.com/v1/chat/completions');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.headers['Authorization'], 'Bearer sk-secret-token-123');
      assert.strictEqual(req.body.model, 'override-model');
      assert.deepStrictEqual(req.body.messages, [{ role: 'user', content: 'Hi' }]);
      assert.strictEqual(req.body.temperature, 0.7);
      assert.strictEqual(req.body.max_tokens, 150);
    });

    it('buildOpenAiCompatibleRequest excludes Authorization header if secret is not provided', () => {
      const providerConfig = {
        id: 'local-ai',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3'
      };

      const req = buildOpenAiCompatibleRequest(providerConfig, {
        messages: [{ role: 'user', content: 'Hello local' }]
      });

      assert.strictEqual(req.headers['Authorization'], undefined);
      assert.strictEqual(req.body.model, 'llama3');
    });

    it('normalizeOpenAiCompatibleResponse parses standard and minimal OpenAI responses', () => {
      const rawFull = {
        model: 'gpt-4o',
        choices: [
          {
            message: { role: 'assistant', content: 'Response content' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
      };

      const resFull = normalizeOpenAiCompatibleResponse('openai-provider', 'default-model', rawFull);
      assert.strictEqual(resFull.provider, 'openai-provider');
      assert.strictEqual(resFull.model, 'gpt-4o');
      assert.strictEqual(resFull.content, 'Response content');
      assert.strictEqual(resFull.finishReason, 'stop');
      assert.deepStrictEqual(resFull.usage, { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 });

      const rawMinimal = {
        choices: [
          {
            message: { role: 'assistant', content: 'Minimal content' }
          }
        ]
      };

      const resMinimal = normalizeOpenAiCompatibleResponse('local-provider', 'default-model', rawMinimal);
      assert.strictEqual(resMinimal.provider, 'local-provider');
      assert.strictEqual(resMinimal.model, 'default-model');
      assert.strictEqual(resMinimal.content, 'Minimal content');
      assert.strictEqual(resMinimal.usage, undefined);
      assert.strictEqual(resMinimal.finishReason, undefined);
    });

    it('redactSensitiveData redacts secret tokens accurately', () => {
      const secrets = ['sk-secret-key-999', 'token-abc'];
      const rawText = 'Error connecting with key sk-secret-key-999 and token-abc on server';
      const clean = redactSensitiveData(rawText, secrets);
      assert.strictEqual(clean, 'Error connecting with key [REDACTED] and [REDACTED] on server');
    });
  });

  describe('AI Provider Registry & Inspection', () => {
    it('registers and unregisters AI providers cleanly', () => {
      const reg = router.registerAiProvider('gpt-4', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        secret: 'sk-secret-key-123'
      });
      assert.strictEqual(reg.registered, true);
      assert.strictEqual(reg.id, 'gpt-4');

      const provider = router.getAiProvider('gpt-4');
      assert.strictEqual(provider.id, 'gpt-4');
      assert.strictEqual(provider.model, 'gpt-4o');
      assert.strictEqual(provider.secret, 'sk-secret-key-123');

      const unreg = router.unregisterAiProvider('gpt-4');
      assert.strictEqual(unreg, true);
      assert.strictEqual(router.getAiProvider('gpt-4'), null);
    });

    it('router:ai_providers returns non-sensitive metadata without secret tokens', async () => {
      router.registerAiProvider('remote-gpt', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        secret: 'sk-super-secret-token'
      });
      router.registerAiProvider('local-ollama', {
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      const list = res.data;
      assert.strictEqual(list.length, 2);

      const remoteMeta = list.find((p) => p.id === 'remote-gpt');
      assert.strictEqual(remoteMeta.baseUrl, 'https://api.openai.com/v1');
      assert.strictEqual(remoteMeta.model, 'gpt-4o');
      assert.strictEqual(remoteMeta.secret, undefined);

      const localMeta = list.find((p) => p.id === 'local-ollama');
      assert.strictEqual(localMeta.baseUrl, 'http://localhost:11434/v1');
      assert.strictEqual(localMeta.model, 'llama3');
      assert.strictEqual(localMeta.secret, undefined);
    });
  });

  describe('ai:chat Action Routing & Execution', () => {
    it('normalizes intent ai.chat to action ai:chat and invokes provider successfully', async () => {
      router.registerAiProvider('mock-provider', {
        baseUrl: 'https://api.mock.com/v1',
        model: 'mock-v1',
        secret: 'sk-mock-secret'
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'mock-provider',
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hi AI' }
          ]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'mock-provider');
      assert.strictEqual(res.data.content, 'Hello from mock AI');

      assert.strictEqual(networkRequests.length, 1);
      assert.strictEqual(networkRequests[0].url, 'https://api.mock.com/v1/chat/completions');
      assert.strictEqual(networkRequests[0].headers['Authorization'], 'Bearer sk-mock-secret');
      assert.deepStrictEqual(networkRequests[0].body.messages, [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi AI' }
      ]);
    });

    it('works with local / LAN endpoints without secret token', async () => {
      router.registerAiProvider('local-lan-ai', {
        baseUrl: 'http://192.168.1.100:8080/v1',
        model: 'local-llama'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'local-lan-ai',
          messages: [{ role: 'user', content: 'Ping' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(networkRequests.length, 1);
      assert.strictEqual(networkRequests[0].url, 'http://192.168.1.100:8080/v1/chat/completions');
      assert.strictEqual(networkRequests[0].headers['Authorization'], undefined);
    });

    it('passes timeoutMs and maxResponseBytes network guards to network:request', async () => {
      router.registerAiProvider('mock-guarded', {
        baseUrl: 'https://api.guarded.com/v1',
        model: 'guarded-model'
      });

      await router.route({
        action: 'ai:chat',
        data: {
          provider: 'mock-guarded',
          messages: [{ role: 'user', content: 'Test guards' }],
          timeoutMs: 5000,
          maxResponseBytes: 1048576
        }
      });

      assert.strictEqual(networkRequests.length, 1);
      assert.strictEqual(networkRequests[0].timeoutMs, 5000);
      assert.strictEqual(networkRequests[0].maxResponseBytes, 1048576);
    });

    it('returns structured error ai_provider_unavailable if provider is missing or disabled', async () => {
      const resMissing = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'non-existent-provider',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      assert.strictEqual(resMissing.success, false);
      assert.strictEqual(resMissing.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(resMissing.metadata.provider, 'non-existent-provider');

      router.registerAiProvider('disabled-provider', {
        baseUrl: 'https://api.disabled.com',
        model: 'disabled-model',
        enabled: false
      });

      const resDisabled = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'disabled-provider',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      assert.strictEqual(resDisabled.success, false);
      assert.strictEqual(resDisabled.metadata.code, 'ai_provider_unavailable');
    });

    it('returns structured error ai_auth_failed for HTTP 401/403 and redacts secret token', async () => {
      const secretToken = 'sk-secret-unauthorized-key-777';
      router.registerAiProvider('auth-failing-provider', {
        baseUrl: 'https://api.authfail.com/v1',
        model: 'auth-model',
        secret: secretToken
      });

      // Override mock network handler to trigger HTTP 401
      router.register('network:request', async () => {
        throw new Error(`HTTP 401: Unauthorized access using ${secretToken}`);
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'auth-failing-provider',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.metadata.provider, 'auth-failing-provider');
      assert.ok(!res.error.includes(secretToken), 'Secret token MUST be redacted from error message');
      assert.ok(res.error.includes('[REDACTED]'), 'Redacted placeholder should replace secret token');

      // Verify router logs do not contain the secret token either
      const logsText = router.logs.join('\n');
      assert.ok(!logsText.includes(secretToken), 'Secret token MUST NOT appear in router logs');
    });

    it('returns structured error ai_invalid_response when JSON response is malformed or choices array is missing', async () => {
      router.registerAiProvider('bad-json-provider', {
        baseUrl: 'https://api.badjson.com/v1',
        model: 'bad-model'
      });

      router.register('network:request', async () => {
        return {
          status: 200,
          body: { invalid_field: 'no choices here' }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'bad-json-provider',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
      assert.strictEqual(res.metadata.provider, 'bad-json-provider');
      assert.ok(res.error.includes('choices array missing or empty'));
    });
  });
});
