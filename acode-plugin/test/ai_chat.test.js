const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse
} = require('../main');

describe('Acode AI Provider Bridge (ai:chat & router:ai_providers)', function () {
  let router;

  beforeEach(function () {
    router = new IntentRouter();
    router.setupCommands();
  });

  describe('Pure Helper Functions', function () {
    it('buildOpenAiCompatibleUrl correctly formats chat/completions URLs', function () {
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
        buildOpenAiCompatibleUrl('http://127.0.0.1:11434/v1'),
        'http://127.0.0.1:11434/v1/chat/completions'
      );
    });

    it('buildOpenAiCompatibleRequest creates valid request and headers with token', function () {
      const profile = {
        id: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet',
        secret: 'sk-or-secret-token-12345'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 500
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers.Authorization, 'Bearer sk-or-secret-token-12345');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.deepStrictEqual(req.body, {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 500
      });
    });

    it('buildOpenAiCompatibleRequest omits Authorization header when secret is absent', function () {
      const profile = {
        id: 'local-ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Hi local AI' }]
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.url, 'http://localhost:11434/v1/chat/completions');
      assert.strictEqual(req.headers.Authorization, undefined);
      assert.strictEqual(req.body.model, 'llama3');
    });

    it('normalizeOpenAiCompatibleResponse extracts content, usage, finishReason', function () {
      const responseBody = {
        id: 'chatcmpl-123',
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello there!' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      const res = normalizeOpenAiCompatibleResponse(responseBody, 'test-provider');
      assert.deepStrictEqual(res, {
        provider: 'test-provider',
        model: 'gpt-4o-mini',
        content: 'Hello there!',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        finishReason: 'stop'
      });
    });

    it('normalizeOpenAiCompatibleResponse works for minimal valid response without usage', function () {
      const responseBody = JSON.stringify({
        choices: [
          {
            message: { content: 'Minimal response' }
          }
        ]
      });

      const res = normalizeOpenAiCompatibleResponse(responseBody, 'local-ai');
      assert.strictEqual(res.provider, 'local-ai');
      assert.strictEqual(res.content, 'Minimal response');
      assert.strictEqual(res.usage, undefined);
      assert.strictEqual(res.finishReason, undefined);
    });

    it('normalizeOpenAiCompatibleResponse throws ai_invalid_response on bad payload', function () {
      assert.throws(
        () => normalizeOpenAiCompatibleResponse('invalid json string', 'prov'),
        (err) => err.code === 'ai_invalid_response' && err.provider === 'prov'
      );
      assert.throws(
        () => normalizeOpenAiCompatibleResponse({ choices: [] }, 'prov'),
        (err) => err.code === 'ai_invalid_response'
      );
      assert.throws(
        () => normalizeOpenAiCompatibleResponse({ choices: [{ message: {} }] }, 'prov'),
        (err) => err.code === 'ai_invalid_response'
      );
    });
  });

  describe('AI Profile Registry', function () {
    it('registerAiProvider, listAiProviders, and unregisterAiProvider', function () {
      router.registerAiProvider('mock-provider', {
        baseUrl: 'https://api.mock.com/v1',
        model: 'mock-model-1',
        secret: 'super-secret-key-999'
      });

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'mock-provider');
      assert.strictEqual(list[0].baseUrl, 'https://api.mock.com/v1');
      assert.strictEqual(list[0].model, 'mock-model-1');
      assert.strictEqual(list[0].secret, undefined);

      const profile = router.getAiProvider('mock-provider');
      assert.strictEqual(profile.id, 'mock-provider');
      assert.strictEqual(profile.secret, 'super-secret-key-999');

      assert.strictEqual(router.unregisterAiProvider('mock-provider'), true);
      assert.strictEqual(router.listAiProviders().length, 0);
    });

    it('router:ai_providers action executes and does not leak secrets', async function () {
      router.registerAiProvider('p1', {
        baseUrl: 'https://ai.example.com',
        model: 'model-a',
        secret: 'my-hidden-secret-key'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(Array.isArray(res.data), true);
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 'p1');
      assert.strictEqual(res.data[0].secret, undefined);
      assert.strictEqual(JSON.stringify(res.data).includes('my-hidden-secret-key'), false);
    });
  });

  describe('ai:chat Route Execution', function () {
    it('successfully calls mock remote endpoint with secret and returns normalized response', async function () {
      const secretKey = 'sk-mock-remote-secret-987';
      router.registerAiProvider('remote-gpt', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        secret: secretKey
      });

      let mockFetchCalled = false;
      let capturedRequest = null;

      router.register('network:request', async (data) => {
        mockFetchCalled = true;
        capturedRequest = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'chatcmpl-test',
            model: 'gpt-4o',
            choices: [
              {
                message: { role: 'assistant', content: 'Response from gpt-4o' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 }
          }
        };
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'remote-gpt',
          messages: [{ role: 'user', content: 'What is 2+2?' }]
        }
      });

      assert.strictEqual(mockFetchCalled, true);
      assert.strictEqual(capturedRequest.url, 'https://api.openai.com/v1/chat/completions');
      assert.strictEqual(capturedRequest.headers.Authorization, `Bearer ${secretKey}`);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'remote-gpt');
      assert.strictEqual(res.data.model, 'gpt-4o');
      assert.strictEqual(res.data.content, 'Response from gpt-4o');
      assert.strictEqual(res.data.finishReason, 'stop');

      // Check log history does not contain the secret
      const logsStr = JSON.stringify(router.logs);
      assert.strictEqual(logsStr.includes(secretKey), false);
    });

    it('works with local/LAN endpoint without token', async function () {
      router.registerAiProvider('lan-ollama', {
        baseUrl: 'http://192.168.1.50:11434/v1',
        model: 'mistral'
      });

      let capturedHeaders = null;
      router.register('network:request', async (data) => {
        capturedHeaders = data.headers;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            choices: [{ message: { content: 'Ollama local response' } }]
          }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'lan-ollama',
          messages: [{ role: 'user', content: 'Local call' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(capturedHeaders.Authorization, undefined);
      assert.strictEqual(res.data.content, 'Ollama local response');
    });

    it('returns ai_provider_unavailable error code when provider is missing or disabled', async function () {
      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'non-existent-provider',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(res.metadata.provider, 'non-existent-provider');
    });

    it('returns ai_auth_failed on 401/403 HTTP response and redacts secrets', async function () {
      const secret = 'sk-invalid-auth-token-000';
      router.registerAiProvider('auth-fail-provider', {
        baseUrl: 'https://api.authfail.com/v1',
        model: 'gpt-4',
        secret: secret
      });

      router.register('network:request', async () => {
        throw new Error(`HTTP 401: Unauthorized access with token ${secret}`);
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'auth-fail-provider',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.error.includes(secret), false);
      assert.strictEqual(res.error.includes('[REDACTED]'), true);
    });

    it('returns ai_invalid_response on invalid JSON response structure', async function () {
      router.registerAiProvider('malformed-provider', {
        baseUrl: 'https://api.malformed.com/v1',
        model: 'gpt-4'
      });

      router.register('network:request', async () => {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { unexpected: 'structure without choices' }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'malformed-provider',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
    });
  });
});
