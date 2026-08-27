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

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
  });

  describe('buildOpenAiCompatibleUrl helper', () => {
    it('normalizes base URLs correctly with or without trailing slash and path suffix', () => {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://openrouter.ai/api/v1/'),
        'https://openrouter.ai/api/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:11434/v1/chat/completions'),
        'http://127.0.0.1:11434/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://localhost:8080/v1/chat/completions/'),
        'http://localhost:8080/v1/chat/completions'
      );
    });

    it('throws when baseUrl is missing or empty', () => {
      assert.throws(() => buildOpenAiCompatibleUrl(''), /baseUrl is required/);
      assert.throws(() => buildOpenAiCompatibleUrl(null), /baseUrl is required/);
    });
  });

  describe('buildOpenAiCompatibleRequest helper', () => {
    it('builds POST request with Authorization Bearer header when token is present', () => {
      const profile = {
        id: 'remote-ai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'sk-proj-secret123456'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Hello AI' }],
        temperature: 0.7,
        maxTokens: 100
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.url, 'https://api.openai.com/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.headers['Authorization'], 'Bearer sk-proj-secret123456');

      const body = JSON.parse(req.body);
      assert.strictEqual(body.model, 'gpt-4o');
      assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'Hello AI' }]);
      assert.strictEqual(body.temperature, 0.7);
      assert.strictEqual(body.max_tokens, 100);
    });

    it('omits Authorization header when secret is absent (e.g. local LAN provider)', () => {
      const profile = {
        id: 'local-ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Local prompt' }]
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.url, 'http://127.0.0.1:11434/v1/chat/completions');
      assert.strictEqual(req.headers['Authorization'], undefined);

      const body = JSON.parse(req.body);
      assert.strictEqual(body.model, 'llama3');
    });

    it('supports custom model override in payload', () => {
      const profile = {
        id: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.1-8b-instant',
        apiKey: 'gsk-secret-key'
      };
      const payload = {
        model: 'llama-3.1-70b-versatile',
        messages: [{ role: 'user', content: 'Explain quantum physics' }]
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      const body = JSON.parse(req.body);
      assert.strictEqual(body.model, 'llama-3.1-70b-versatile');
    });

    it('supports getApiKey function for dynamic key resolution', () => {
      const profile = {
        id: 'dynamic-ai',
        baseUrl: 'https://api.example.com/v1',
        model: 'model-a',
        getApiKey: () => 'dynamic-secret-key-999'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Test dynamic key' }]
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.headers['Authorization'], 'Bearer dynamic-secret-key-999');
    });

    it('throws invalid_ai_payload when messages array is missing or empty', () => {
      const profile = { id: 'p1', baseUrl: 'https://api.com', model: 'm1' };

      assert.throws(() => buildOpenAiCompatibleRequest(profile, {}), (err) => {
        assert.strictEqual(err.code, 'invalid_ai_payload');
        return true;
      });

      assert.throws(() => buildOpenAiCompatibleRequest(profile, { messages: [] }), (err) => {
        assert.strictEqual(err.code, 'invalid_ai_payload');
        return true;
      });
    });
  });

  describe('normalizeOpenAiCompatibleResponse helper', () => {
    it('normalizes complete OpenAI chat completion response', () => {
      const apiResponse = {
        id: 'chatcmpl-123',
        model: 'gpt-4o-2024-05-13',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello! How can I help?' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
      };

      const normalized = normalizeOpenAiCompatibleResponse('openai-main', apiResponse);
      assert.deepStrictEqual(normalized, {
        provider: 'openai-main',
        model: 'gpt-4o-2024-05-13',
        content: 'Hello! How can I help?',
        usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        finishReason: 'stop'
      });
    });

    it('normalizes minimal OpenAI response without usage', () => {
      const apiResponse = {
        model: 'local-model',
        choices: [
          {
            message: { content: 'Minimal response text' }
          }
        ]
      };

      const normalized = normalizeOpenAiCompatibleResponse('local-provider', apiResponse);
      assert.deepStrictEqual(normalized, {
        provider: 'local-provider',
        model: 'local-model',
        content: 'Minimal response text'
      });
    });

    it('throws ai_invalid_response on invalid or missing choices', () => {
      const testCases = [
        null,
        {},
        { choices: [] },
        { choices: [{}] },
        { choices: [{ message: {} }] }
      ];

      for (const tc of testCases) {
        assert.throws(
          () => normalizeOpenAiCompatibleResponse('prov-1', tc),
          (err) => {
            assert.strictEqual(err.code, 'ai_invalid_response');
            assert.strictEqual(err.provider, 'prov-1');
            return true;
          }
        );
      }
    });
  });

  describe('IntentRouter AI provider management and router:ai_providers', () => {
    it('registers, retrieves, unregisters, and lists AI providers without exposing secrets', async () => {
      router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet',
        apiKey: 'sk-or-secret-token-abcdef'
      });

      const profile = router.getAiProvider('openrouter');
      assert.strictEqual(profile.id, 'openrouter');
      assert.strictEqual(profile.model, 'anthropic/claude-3.5-sonnet');
      assert.strictEqual(profile.apiKey, 'sk-or-secret-token-abcdef');

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.data, [
        {
          id: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'anthropic/claude-3.5-sonnet',
          enabled: true
        }
      ]);

      // Unregister
      const unregistered = router.unregisterAiProvider('openrouter');
      assert.strictEqual(unregistered, true);

      const resAfter = await router.route({ action: 'router:ai_providers' });
      assert.deepStrictEqual(resAfter.data, []);
    });

    it('throws error when registering provider with missing parameters', () => {
      assert.throws(() => router.registerAiProvider('', { baseUrl: 'http://a', model: 'm' }), /id is required/);
      assert.throws(() => router.registerAiProvider('p1', { baseUrl: '', model: 'm' }), /baseUrl is required/);
      assert.throws(() => router.registerAiProvider('p1', { baseUrl: 'http://a', model: '' }), /model is required/);
    });
  });

  describe('ai.chat / ai:chat action execution & error handling', () => {
    it('normalizes intent name ai.chat to ai:chat and routes to mock remote endpoint', async () => {
      let networkCalledWith = null;
      router.register('network:request', async (data) => {
        networkCalledWith = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'cmpl-99',
            model: 'gpt-4o',
            choices: [{ message: { content: 'AI Response from mock' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
          }
        };
      });

      router.registerAiProvider('mock-remote', {
        baseUrl: 'https://api.remote.ai/v1',
        model: 'gpt-4o',
        token: 'secret-bearer-token-12345'
      });

      const result = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'mock-remote',
          messages: [{ role: 'user', content: 'Test question' }],
          temperature: 0.2
        }
      });

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data, {
        provider: 'mock-remote',
        model: 'gpt-4o',
        content: 'AI Response from mock',
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        finishReason: 'stop'
      });

      assert.strictEqual(networkCalledWith.url, 'https://api.remote.ai/v1/chat/completions');
      assert.strictEqual(networkCalledWith.method, 'POST');
      assert.strictEqual(networkCalledWith.headers['Authorization'], 'Bearer secret-bearer-token-12345');
      const sentBody = JSON.parse(networkCalledWith.body);
      assert.strictEqual(sentBody.temperature, 0.2);
    });

    it('works with local/LAN endpoint without token', async () => {
      let networkCalledWith = null;
      router.register('network:request', async (data) => {
        networkCalledWith = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3:8b',
            choices: [{ message: { content: 'Local llama answer' } }]
          })
        };
      });

      router.registerAiProvider('local-lan', {
        baseUrl: 'http://192.168.1.50:11434/v1',
        model: 'llama3:8b'
      });

      const result = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'local-lan',
          messages: [{ role: 'user', content: 'Hello local model' }]
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.content, 'Local llama answer');
      assert.strictEqual(networkCalledWith.url, 'http://192.168.1.50:11434/v1/chat/completions');
      assert.strictEqual(networkCalledWith.headers['Authorization'], undefined);
    });

    it('fails with ai_provider_unavailable when provider is missing or disabled', async () => {
      const resMissing = await router.route({
        intent: 'ai.chat',
        payload: { provider: 'non-existent', messages: [{ role: 'user', content: 'hi' }] }
      });
      assert.strictEqual(resMissing.success, false);
      assert.strictEqual(resMissing.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(resMissing.metadata.provider, 'non-existent');

      router.registerAiProvider('disabled-prov', {
        baseUrl: 'https://api.ai.com/v1',
        model: 'm1',
        enabled: false
      });

      const resDisabled = await router.route({
        intent: 'ai.chat',
        payload: { provider: 'disabled-prov', messages: [{ role: 'user', content: 'hi' }] }
      });
      assert.strictEqual(resDisabled.success, false);
      assert.strictEqual(resDisabled.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(resDisabled.metadata.provider, 'disabled-prov');
    });

    it('fails with invalid_ai_payload when messages are missing', async () => {
      router.registerAiProvider('valid-prov', {
        baseUrl: 'https://api.ai.com/v1',
        model: 'm1'
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: { provider: 'valid-prov' }
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'invalid_ai_payload');
      assert.strictEqual(res.metadata.provider, 'valid-prov');
    });

    it('distinguishes HTTP 401/403 errors as ai_auth_failed without leaking secret token', async () => {
      const secretKey = 'sk-super-secret-key-987654';
      router.register('network:request', async () => {
        throw new Error(`HTTP 401: Invalid API Key ${secretKey}`);
      });

      router.registerAiProvider('auth-failing-prov', {
        baseUrl: 'https://api.ai.com/v1',
        model: 'm1',
        apiKey: secretKey
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: { provider: 'auth-failing-prov', messages: [{ role: 'user', content: 'hello' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.metadata.provider, 'auth-failing-prov');
      assert.strictEqual(res.error.includes(secretKey), false, 'Error message must NOT expose secret key');
      assert.strictEqual(res.error.includes('[REDACTED]'), true, 'Secret key in error message must be redacted');

      // Check router logs
      for (const logEntry of router.logs) {
        assert.strictEqual(logEntry.includes(secretKey), false, `Log entry must not contain secret key: ${logEntry}`);
      }
    });

    it('fails with ai_invalid_response when provider returns malformed JSON or invalid choices', async () => {
      router.register('network:request', async () => {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ choices: [] })
        };
      });

      router.registerAiProvider('malformed-prov', {
        baseUrl: 'https://api.ai.com/v1',
        model: 'm1'
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: { provider: 'malformed-prov', messages: [{ role: 'user', content: 'test' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
      assert.strictEqual(res.metadata.provider, 'malformed-prov');
    });
  });

  describe('redactSensitiveData helper', () => {
    it('redacts registered provider secrets from strings and objects', () => {
      const secret = 'sk-secret-token-xyz999';
      const providerMap = new Map([
        ['p1', { id: 'p1', apiKey: secret }]
      ]);

      const rawText = `User requested with key ${secret} in payload`;
      const redacted = redactSensitiveData(rawText, providerMap);
      assert.strictEqual(redacted, 'User requested with key [REDACTED] in payload');
    });
  });
});
