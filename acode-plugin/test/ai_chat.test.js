const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse
} = require('../main.js');

describe('Acode OpenAI-compatible AI Provider Bridge', () => {
  let router;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
  });

  describe('buildOpenAiCompatibleUrl', () => {
    it('appends /chat/completions to base URLs cleanly', () => {
      assert.strictEqual(buildOpenAiCompatibleUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/chat/completions');
      assert.strictEqual(buildOpenAiCompatibleUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1/chat/completions');
      assert.strictEqual(buildOpenAiCompatibleUrl('http://127.0.0.1:8000'), 'http://127.0.0.1:8000/chat/completions');
      assert.strictEqual(buildOpenAiCompatibleUrl('http://127.0.0.1:8000/chat/completions'), 'http://127.0.0.1:8000/chat/completions');
      assert.strictEqual(buildOpenAiCompatibleUrl('http://192.168.1.50:11434/v1///'), 'http://192.168.1.50:11434/v1/chat/completions');
    });

    it('throws when baseUrl is missing or empty', () => {
      assert.throws(() => buildOpenAiCompatibleUrl(''), /baseUrl is required/);
      assert.throws(() => buildOpenAiCompatibleUrl(null), /baseUrl is required/);
    });
  });

  describe('buildOpenAiCompatibleRequest', () => {
    it('builds a standard request with model, messages, temperature, max_tokens and Authorization header', () => {
      const config = {
        id: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama3-8b-8192',
        secret: 'gsk_test_secret_123'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 500
      };

      const req = buildOpenAiCompatibleRequest(config, payload);
      assert.strictEqual(req.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.headers['Authorization'], 'Bearer gsk_test_secret_123');

      const body = JSON.parse(req.body);
      assert.strictEqual(body.model, 'llama3-8b-8192');
      assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'Hello' }]);
      assert.strictEqual(body.temperature, 0.7);
      assert.strictEqual(body.max_tokens, 500);
    });

    it('omits Authorization header when secret is absent or empty (for local/LAN endpoints)', () => {
      const config = {
        id: 'local-ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Local prompt' }]
      };

      const req = buildOpenAiCompatibleRequest(config, payload);
      assert.strictEqual(req.url, 'http://localhost:11434/v1/chat/completions');
      assert.strictEqual(req.headers['Authorization'], undefined);
    });

    it('allows model override in payload', () => {
      const config = {
        id: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-3.5-turbo',
        secret: 'sk-or-123'
      };
      const payload = {
        model: 'anthropic/claude-3-haiku',
        messages: [{ role: 'user', content: 'Hi' }]
      };

      const req = buildOpenAiCompatibleRequest(config, payload);
      const body = JSON.parse(req.body);
      assert.strictEqual(body.model, 'anthropic/claude-3-haiku');
    });

    it('throws invalid_ai_payload error code when messages is missing or empty', () => {
      const config = { id: 'test', baseUrl: 'http://localhost:8000', model: 'm1' };
      assert.throws(() => buildOpenAiCompatibleRequest(config, {}), (err) => {
        assert.strictEqual(err.code, 'invalid_ai_payload');
        return true;
      });
      assert.throws(() => buildOpenAiCompatibleRequest(config, { messages: [] }), (err) => {
        assert.strictEqual(err.code, 'invalid_ai_payload');
        return true;
      });
    });
  });

  describe('normalizeOpenAiCompatibleResponse', () => {
    it('normalizes full OpenAI response with usage and finishReason', () => {
      const rawBody = {
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello from AI!' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      const normalized = normalizeOpenAiCompatibleResponse('openai-provider', 'fallback-model', rawBody);
      assert.strictEqual(normalized.provider, 'openai-provider');
      assert.strictEqual(normalized.model, 'gpt-4o');
      assert.strictEqual(normalized.content, 'Hello from AI!');
      assert.strictEqual(normalized.finishReason, 'stop');
      assert.deepStrictEqual(normalized.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    });

    it('normalizes minimal OpenAI response without optional usage or finish_reason', () => {
      const rawBody = {
        choices: [
          {
            message: { role: 'assistant', content: 'Minimal AI response' }
          }
        ]
      };

      const normalized = normalizeOpenAiCompatibleResponse('local-llm', 'my-local-model', rawBody);
      assert.strictEqual(normalized.provider, 'local-llm');
      assert.strictEqual(normalized.model, 'my-local-model');
      assert.strictEqual(normalized.content, 'Minimal AI response');
      assert.strictEqual(normalized.usage, undefined);
      assert.strictEqual(normalized.finishReason, undefined);
    });

    it('throws ai_invalid_response when choices is missing or empty or JSON is malformed', () => {
      assert.throws(
        () => normalizeOpenAiCompatibleResponse('p1', 'm1', 'invalid json {'),
        (err) => err.code === 'ai_invalid_response' && err.provider === 'p1'
      );
      assert.throws(
        () => normalizeOpenAiCompatibleResponse('p1', 'm1', { choices: [] }),
        (err) => err.code === 'ai_invalid_response' && err.provider === 'p1'
      );
      assert.throws(
        () => normalizeOpenAiCompatibleResponse('p1', 'm1', { choices: [{ message: {} }] }),
        (err) => err.code === 'ai_invalid_response' && err.provider === 'p1'
      );
    });
  });

  describe('AI Provider Registry & Inspection', () => {
    it('registers, retrieves, lists, and unregisters AI providers without leaking secrets', async () => {
      const regRes = router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o-mini',
        secret: 'sk-or-v1-super-secret-key'
      });
      assert.deepStrictEqual(regRes, { registered: true, id: 'openrouter' });

      const retrieved = router.getAiProvider('openrouter');
      assert.strictEqual(retrieved.id, 'openrouter');
      assert.strictEqual(retrieved.secret, 'sk-or-v1-super-secret-key');

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'openrouter');
      assert.strictEqual(list[0].baseUrl, 'https://openrouter.ai/api/v1');
      assert.strictEqual(list[0].model, 'openai/gpt-4o-mini');
      assert.strictEqual(list[0].enabled, true);
      assert.strictEqual(list[0].secret, undefined, 'Secrets must NOT be present in provider list');

      const routedInspection = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(routedInspection.success, true);
      assert.strictEqual(routedInspection.data.length, 1);
      assert.strictEqual(routedInspection.data[0].secret, undefined, 'Secrets must NOT be present in router:ai_providers');

      const unregistered = router.unregisterAiProvider('openrouter');
      assert.strictEqual(unregistered, true);
      assert.strictEqual(router.getAiProvider('openrouter'), null);
    });
  });

  describe('ai:chat action routing', () => {
    it('executes ai:chat with a registered remote AI provider with secret', async () => {
      let networkRequestedData = null;
      router.register('network:request', async (data) => {
        networkRequestedData = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'chatcmpl-999',
            model: 'groq/llama-3.1-70b',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Greetings from Groq!' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 }
          }
        };
      });

      router.registerAiProvider('groq-prod', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'groq/llama-3.1-70b',
        secret: 'gsk_secret_token_abc'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'groq-prod',
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' }
          ],
          temperature: 0.2
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'groq-prod');
      assert.strictEqual(res.data.model, 'groq/llama-3.1-70b');
      assert.strictEqual(res.data.content, 'Greetings from Groq!');
      assert.strictEqual(res.data.finishReason, 'stop');
      assert.deepStrictEqual(res.data.usage, { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 });

      assert.strictEqual(networkRequestedData.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.strictEqual(networkRequestedData.headers['Authorization'], 'Bearer gsk_secret_token_abc');

      // Verify token never leaked in logs
      const logString = router.logs.join('\n');
      assert.strictEqual(logString.includes('gsk_secret_token_abc'), false, 'Secret token must never leak into logs');
    });

    it('executes ai:chat with a local/LAN AI provider without secret', async () => {
      let networkRequestedData = null;
      router.register('network:request', async (data) => {
        networkRequestedData = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            model: 'local-mistral',
            choices: [
              {
                message: { role: 'assistant', content: 'Local LAN response' }
              }
            ]
          }
        };
      });

      router.registerAiProvider('lan-llm', {
        baseUrl: 'http://192.168.1.100:11434/v1',
        model: 'local-mistral'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'lan-llm',
          messages: [{ role: 'user', content: 'LAN test' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'lan-llm');
      assert.strictEqual(res.data.content, 'Local LAN response');
      assert.strictEqual(networkRequestedData.url, 'http://192.168.1.100:11434/v1/chat/completions');
      assert.strictEqual(networkRequestedData.headers['Authorization'], undefined);
    });

    it('returns ai_provider_unavailable error when provider is unknown or disabled', async () => {
      const res1 = await router.route({
        action: 'ai:chat',
        data: { provider: 'non-existent-provider', messages: [{ role: 'user', content: 'test' }] }
      });
      assert.strictEqual(res1.success, false);
      assert.strictEqual(res1.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(res1.metadata.provider, 'non-existent-provider');

      router.registerAiProvider('disabled-provider', {
        baseUrl: 'https://example.com',
        model: 'm1',
        enabled: false
      });

      const res2 = await router.route({
        action: 'ai:chat',
        data: { provider: 'disabled-provider', messages: [{ role: 'user', content: 'test' }] }
      });
      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(res2.metadata.provider, 'disabled-provider');
    });

    it('returns ai_auth_failed error code on HTTP 401/403 responses without leaking token', async () => {
      router.register('network:request', async () => {
        throw new Error('HTTP 401: {"error": {"message": "Invalid API Key"}}');
      });

      router.registerAiProvider('openai-bad-token', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        secret: 'sk-invalid-secret-key-999'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'openai-bad-token', messages: [{ role: 'user', content: 'test' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.metadata.provider, 'openai-bad-token');
      assert.ok(res.error.includes('Authentication failed'));
      assert.strictEqual(res.error.includes('sk-invalid-secret-key-999'), false);
    });

    it('returns ai_invalid_response error code when provider response is missing choices or malformed', async () => {
      router.register('network:request', async () => {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { choices: [] }
        };
      });

      router.registerAiProvider('bad-response-provider', {
        baseUrl: 'https://example.com',
        model: 'm1'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'bad-response-provider', messages: [{ role: 'user', content: 'test' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
      assert.strictEqual(res.metadata.provider, 'bad-response-provider');
    });
  });
});
