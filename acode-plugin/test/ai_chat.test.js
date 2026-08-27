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

  describe('Pure helper functions', () => {
    it('buildOpenAiCompatibleUrl normalizes slashes and path', () => {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1/'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:11434/v1'),
        'http://127.0.0.1:11434/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://openrouter.ai/api/v1/chat/completions'),
        'https://openrouter.ai/api/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://openrouter.ai/api/v1/chat/completions/'),
        'https://openrouter.ai/api/v1/chat/completions'
      );

      assert.throws(
        () => buildOpenAiCompatibleUrl(''),
        (err) => err.code === 'invalid_ai_provider_config'
      );
      assert.throws(
        () => buildOpenAiCompatibleUrl(null),
        (err) => err.code === 'invalid_ai_provider_config'
      );
    });

    it('buildOpenAiCompatibleRequest constructs valid HTTP request with or without Authorization header', () => {
      const providerWithKey = {
        id: 'remote',
        baseUrl: 'https://api.example.com/v1',
        model: 'model-a',
        apiKey: 'sk-secret-key-123'
      };

      const payload = {
        provider: 'remote',
        messages: [{ role: 'user', content: 'hello' }],
        temperature: 0.7,
        maxTokens: 100
      };

      const req1 = buildOpenAiCompatibleRequest(providerWithKey, payload);
      assert.strictEqual(req1.url, 'https://api.example.com/v1/chat/completions');
      assert.strictEqual(req1.method, 'POST');
      assert.strictEqual(req1.headers['Content-Type'], 'application/json');
      assert.strictEqual(req1.headers.Authorization, 'Bearer sk-secret-key-123');
      assert.deepStrictEqual(req1.body, {
        model: 'model-a',
        messages: [{ role: 'user', content: 'hello' }],
        temperature: 0.7,
        max_tokens: 100
      });

      // Local provider without token/key
      const providerLocal = {
        id: 'local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3'
      };

      const req2 = buildOpenAiCompatibleRequest(providerLocal, {
        provider: 'local',
        messages: [{ role: 'user', content: 'test' }],
        model: 'llama3-override'
      });

      assert.strictEqual(req2.url, 'http://127.0.0.1:11434/v1/chat/completions');
      assert.strictEqual(req2.headers.Authorization, undefined);
      assert.strictEqual(req2.body.model, 'llama3-override');
    });

    it('buildOpenAiCompatibleRequest validates required parameters', () => {
      const provider = { id: 'p1', baseUrl: 'https://api.com/v1', model: 'm1' };

      assert.throws(
        () => buildOpenAiCompatibleRequest(provider, null),
        (err) => err.code === 'invalid_ai_payload'
      );

      assert.throws(
        () => buildOpenAiCompatibleRequest(provider, { provider: 'p1', messages: [] }),
        (err) => err.code === 'invalid_ai_payload'
      );

      assert.throws(
        () => buildOpenAiCompatibleRequest(provider, { provider: 'p1', messages: 'not-an-array' }),
        (err) => err.code === 'invalid_ai_payload'
      );
    });

    it('normalizeOpenAiCompatibleResponse extracts content, model, usage, and finishReason', () => {
      const fullResponseBody = {
        id: 'chatcmpl-123',
        model: 'gpt-4o-2024-08-06',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello! How can I help?' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 }
      };

      const norm1 = normalizeOpenAiCompatibleResponse('openai', 'gpt-4o', fullResponseBody);
      assert.deepStrictEqual(norm1, {
        provider: 'openai',
        model: 'gpt-4o-2024-08-06',
        content: 'Hello! How can I help?',
        finishReason: 'stop',
        usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 }
      });

      // Minimal response without usage or finishReason
      const minimalResponseBody = {
        choices: [
          { message: { role: 'assistant', content: 'Minimal output' } }
        ]
      };

      const norm2 = normalizeOpenAiCompatibleResponse('local', 'llama3', minimalResponseBody);
      assert.deepStrictEqual(norm2, {
        provider: 'local',
        model: 'llama3',
        content: 'Minimal output'
      });
    });

    it('normalizeOpenAiCompatibleResponse rejects malformed or incomplete responses', () => {
      const invalidResponses = [
        null,
        {},
        { choices: [] },
        { choices: [{}] },
        { choices: [{ message: {} }] }
      ];

      for (const res of invalidResponses) {
        assert.throws(
          () => normalizeOpenAiCompatibleResponse('p1', 'm1', res),
          (err) => err.code === 'ai_invalid_response',
          `Should reject invalid response structure: ${JSON.stringify(res)}`
        );
      }
    });
  });

  describe('Provider Registry & Security', () => {
    it('registers, lists, and unregisters AI providers without exposing secrets', () => {
      router.registerAiProvider({
        id: 'p1',
        baseUrl: 'https://api.example.com/v1',
        model: 'model-x',
        apiKey: 'super-secret-key-123'
      });

      const registered = router.getAiProvider('p1');
      assert.ok(registered);
      assert.strictEqual(registered.apiKey, 'super-secret-key-123');

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.deepStrictEqual(list[0], {
        id: 'p1',
        baseUrl: 'https://api.example.com/v1',
        model: 'model-x',
        enabled: true
      });
      assert.strictEqual(list[0].apiKey, undefined, 'apiKey MUST NOT be exposed in listAiProviders');
      assert.strictEqual(list[0].token, undefined, 'token MUST NOT be exposed in listAiProviders');

      assert.strictEqual(router.unregisterAiProvider('p1'), true);
      assert.strictEqual(router.getAiProvider('p1'), null);
      assert.strictEqual(router.listAiProviders().length, 0);
    });

    it('router:ai_providers command returns non-sensitive provider metadata', async () => {
      router.registerAiProvider({
        id: 'remote-1',
        baseUrl: 'https://remote.ai/v1',
        model: 'remote-model',
        token: 'secret-token-abc'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.data, [
        {
          id: 'remote-1',
          baseUrl: 'https://remote.ai/v1',
          model: 'remote-model',
          enabled: true
        }
      ]);
      assert.strictEqual(JSON.stringify(res).includes('secret-token-abc'), false);
    });

    it('router.log redacts secret tokens and Bearer headers', () => {
      router.registerAiProvider({
        id: 'my-provider',
        baseUrl: 'https://api.com/v1',
        model: 'm1',
        apiKey: 'sk-secret-token-999'
      });

      router.log('Connecting with Bearer sk-secret-token-999 to provider');
      const logs = router.logs.join('\n');
      assert.strictEqual(logs.includes('sk-secret-token-999'), false, 'Log MUST NOT contain secret token');
      assert.ok(logs.includes('***'));
    });
  });

  describe('ai:chat Action & ai.chat Intent Execution', () => {
    it('executes ai.chat intent with remote provider and returns normalized response', async () => {
      let networkCallArgs = null;
      router.register('network:request', async (data) => {
        networkCallArgs = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: 'chatcmpl-999',
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Paris is the capital of France.' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 }
          })
        };
      });

      router.registerAiProvider({
        id: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.1-8b-instant',
        apiKey: 'gsk_secret_12345'
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'groq',
          messages: [{ role: 'user', content: 'What is the capital of France?' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.data, {
        provider: 'groq',
        model: 'gpt-4o',
        content: 'Paris is the capital of France.',
        finishReason: 'stop',
        usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 }
      });

      assert.ok(networkCallArgs);
      assert.strictEqual(networkCallArgs.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.strictEqual(networkCallArgs.headers.Authorization, 'Bearer gsk_secret_12345');
      assert.deepStrictEqual(networkCallArgs.body, {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });
    });

    it('supports local/LAN compatible endpoint without Authorization token', async () => {
      let networkCallArgs = null;
      router.register('network:request', async (data) => {
        networkCallArgs = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            choices: [
              { message: { role: 'assistant', content: 'Response from local Ollama model' } }
            ]
          }
        };
      });

      router.registerAiProvider({
        id: 'local-lan',
        baseUrl: 'http://192.168.1.50:11434/v1',
        model: 'mistral'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'local-lan',
          messages: [{ role: 'user', content: 'Ping' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.content, 'Response from local Ollama model');
      assert.strictEqual(networkCallArgs.headers.Authorization, undefined);
      assert.strictEqual(networkCallArgs.url, 'http://192.168.1.50:11434/v1/chat/completions');
    });

    it('fails with ai_provider_unavailable if provider is unregistered or disabled', async () => {
      // Unregistered
      const res1 = await router.route({
        action: 'ai:chat',
        data: { provider: 'unknown', messages: [{ role: 'user', content: 'hi' }] }
      });
      assert.strictEqual(res1.success, false);
      assert.strictEqual(res1.metadata.code, 'ai_provider_unavailable');

      // Disabled
      router.registerAiProvider({
        id: 'disabled-p',
        baseUrl: 'https://api.com/v1',
        model: 'm1',
        enabled: false
      });

      const res2 = await router.route({
        action: 'ai:chat',
        data: { provider: 'disabled-p', messages: [{ role: 'user', content: 'hi' }] }
      });
      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.metadata.code, 'ai_provider_unavailable');
    });

    it('fails with invalid_ai_payload if provider or messages is missing', async () => {
      const res1 = await router.route({
        action: 'ai:chat',
        data: { provider: '' }
      });
      assert.strictEqual(res1.success, false);
      assert.strictEqual(res1.metadata.code, 'invalid_ai_payload');

      router.registerAiProvider({
        id: 'p1',
        baseUrl: 'https://api.com/v1',
        model: 'm1'
      });

      const res2 = await router.route({
        action: 'ai:chat',
        data: { provider: 'p1', messages: [] }
      });
      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.metadata.code, 'invalid_ai_payload');
    });

    it('distinguishes HTTP 401/403 auth errors as ai_auth_failed without leaking token', async () => {
      router.register('network:request', async () => {
        throw new Error('HTTP 401: Unauthorized access with Bearer secret-token-xyz');
      });

      router.registerAiProvider({
        id: 'auth-fail-provider',
        baseUrl: 'https://api.example.com/v1',
        model: 'model-1',
        apiKey: 'secret-token-xyz'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'auth-fail-provider',
          messages: [{ role: 'user', content: 'Test auth' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.error.includes('secret-token-xyz'), false, 'Error message MUST NOT contain secret token');
      assert.ok(res.error.includes('Bearer ***'));
    });

    it('handles network errors as ai_provider_unavailable without leaking token', async () => {
      router.register('network:request', async () => {
        throw new Error('Failed to fetch from https://api.com (token secret-123)');
      });

      router.registerAiProvider({
        id: 'net-fail-provider',
        baseUrl: 'https://api.example.com/v1',
        model: 'model-1',
        apiKey: 'secret-123'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'net-fail-provider',
          messages: [{ role: 'user', content: 'Test net' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(res.error.includes('secret-123'), false);
    });

    it('handles invalid JSON or malformed choices as ai_invalid_response', async () => {
      router.registerAiProvider({
        id: 'bad-response-provider',
        baseUrl: 'https://api.example.com/v1',
        model: 'model-1'
      });

      // Invalid JSON string
      router.register('network:request', async () => ({
        status: 200,
        headers: {},
        body: 'Not JSON text'
      }));

      const res1 = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'bad-response-provider',
          messages: [{ role: 'user', content: 'test' }]
        }
      });
      assert.strictEqual(res1.success, false);
      assert.strictEqual(res1.metadata.code, 'ai_invalid_response');

      // Valid JSON but missing choices
      router.register('network:request', async () => ({
        status: 200,
        headers: {},
        body: { choices: [] }
      }));

      const res2 = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'bad-response-provider',
          messages: [{ role: 'user', content: 'test' }]
        }
      });
      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.metadata.code, 'ai_invalid_response');
    });
  });
});
