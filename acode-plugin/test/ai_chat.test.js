const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse
} = require('../main.js');

describe('Acode OpenAI-compatible AI Provider Bridge', () => {
  let router;
  let fetchCalls;
  let originalFetch;

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      const mockResp = globalThis.__mockFetchResponse || {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          id: 'chatcmpl-123',
          model: 'gpt-4o',
          choices: [
            {
              message: { role: 'assistant', content: 'Hello from mock AI!' },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };

      if (!mockResp.headers.get) {
        const hMap = mockResp.headers;
        mockResp.headers = {
          get: (k) => hMap[k.toLowerCase()] || null,
          entries: () => Object.entries(hMap)
        };
      }

      return mockResp;
    };

    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete globalThis.__mockFetchResponse;
  });

  describe('Pure Helper Functions', () => {
    it('buildOpenAiCompatibleUrl normalizes base URLs correctly', () => {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1/'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:11434/v1/chat/completions'),
        'http://127.0.0.1:11434/v1/chat/completions'
      );
      assert.throws(() => buildOpenAiCompatibleUrl(null), /baseUrl is required/);
    });

    it('buildOpenAiCompatibleRequest builds valid payload and authorization header when token is present', () => {
      const profile = {
        id: 'remote-ai',
        baseUrl: 'https://api.example.com/v1/',
        model: 'default-model',
        token: 'secret-token-123'
      };
      const data = {
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.7,
        maxTokens: 100
      };

      const req = buildOpenAiCompatibleRequest(profile, data);
      assert.strictEqual(req.url, 'https://api.example.com/v1/chat/completions');
      assert.strictEqual(req.headers['Authorization'], 'Bearer secret-token-123');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.body.model, 'default-model');
      assert.strictEqual(req.body.temperature, 0.7);
      assert.strictEqual(req.body.max_tokens, 100);
      assert.deepStrictEqual(req.body.messages, [{ role: 'user', content: 'Hi' }]);
    });

    it('buildOpenAiCompatibleRequest omits Authorization header when token is absent (local LLM)', () => {
      const profile = {
        id: 'local-llm',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3:latest'
      };
      const data = {
        messages: [{ role: 'user', content: 'Local hi' }]
      };

      const req = buildOpenAiCompatibleRequest(profile, data);
      assert.strictEqual(req.url, 'http://127.0.0.1:11434/v1/chat/completions');
      assert.strictEqual(req.headers['Authorization'], undefined);
      assert.strictEqual(req.body.model, 'llama3:latest');
    });

    it('buildOpenAiCompatibleRequest allows model override in payload', () => {
      const profile = {
        id: 'remote-ai',
        baseUrl: 'https://api.example.com/v1',
        model: 'default-model'
      };
      const data = {
        model: 'custom-model-override',
        messages: [{ role: 'user', content: 'Test' }]
      };

      const req = buildOpenAiCompatibleRequest(profile, data);
      assert.strictEqual(req.body.model, 'custom-model-override');
    });

    it('normalizeOpenAiCompatibleResponse extracts content, model, usage, and finishReason', () => {
      const body = {
        model: 'gpt-4o',
        choices: [
          {
            message: { role: 'assistant', content: 'AI Answer' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      };

      const normalized = normalizeOpenAiCompatibleResponse(body, 'test-provider');
      assert.deepStrictEqual(normalized, {
        provider: 'test-provider',
        model: 'gpt-4o',
        content: 'AI Answer',
        finishReason: 'stop',
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      });
    });

    it('normalizeOpenAiCompatibleResponse handles minimal response without optional usage or finishReason', () => {
      const body = {
        choices: [
          {
            message: { content: 'Minimal response' }
          }
        ]
      };

      const normalized = normalizeOpenAiCompatibleResponse(body, 'minimal-provider');
      assert.strictEqual(normalized.provider, 'minimal-provider');
      assert.strictEqual(normalized.model, 'unknown');
      assert.strictEqual(normalized.content, 'Minimal response');
      assert.strictEqual(normalized.usage, undefined);
      assert.strictEqual(normalized.finishReason, undefined);
    });
  });

  describe('Profile Registry & router:ai_providers', () => {
    it('registers, lists, gets, and unregisters AI profiles', () => {
      const regRes = router.registerAiProvider({
        id: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama3-70b-8192',
        token: 'gsk-secret-key'
      });
      assert.deepStrictEqual(regRes, { registered: true, id: 'groq' });

      const profile = router.getAiProvider('groq');
      assert.strictEqual(profile.id, 'groq');
      assert.strictEqual(profile.token, 'gsk-secret-key');

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'groq');
      assert.strictEqual(list[0].baseUrl, 'https://api.groq.com/openai/v1');
      assert.strictEqual(list[0].model, 'llama3-70b-8192');
      assert.strictEqual(list[0].enabled, true);
      assert.strictEqual(list[0].token, undefined, 'Secret token MUST NOT be exposed in listAiProviders');

      const unregRes = router.unregisterAiProvider('groq');
      assert.deepStrictEqual(unregRes, { unregistered: true });
      assert.strictEqual(router.getAiProvider('groq'), null);
    });

    it('router:ai_providers returns non-sensitive metadata only', async () => {
      router.registerAiProvider({
        id: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet',
        token: 'sk-or-super-secret'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(Array.isArray(res.data), true);
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 'openrouter');
      assert.strictEqual(res.data[0].baseUrl, 'https://openrouter.ai/api/v1');
      assert.strictEqual(res.data[0].model, 'anthropic/claude-3.5-sonnet');
      assert.strictEqual(res.data[0].token, undefined);
      assert.strictEqual(JSON.stringify(res).includes('sk-or-super-secret'), false);
    });
  });

  describe('ai:chat & ai.chat Intent Execution', () => {
    it('executes ai.chat via Intent Router to remote provider with token (token hidden from logs)', async () => {
      router.registerAiProvider({
        id: 'my-remote-ai',
        baseUrl: 'https://api.remote-ai.com/v1/',
        model: 'remote-model-v1',
        token: 'secret-bearer-token'
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'my-remote-ai',
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello!' }
          ],
          temperature: 0.2
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'my-remote-ai');
      assert.strictEqual(res.data.content, 'Hello from mock AI!');
      assert.strictEqual(res.data.model, 'gpt-4o');

      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(fetchCalls[0].url, 'https://api.remote-ai.com/v1/chat/completions');
      const reqHeaders = fetchCalls[0].options.headers;
      assert.strictEqual(reqHeaders['Authorization'], 'Bearer secret-bearer-token');

      const sentBody = JSON.parse(fetchCalls[0].options.body);
      assert.strictEqual(sentBody.model, 'remote-model-v1');
      assert.strictEqual(sentBody.temperature, 0.2);
      assert.strictEqual(sentBody.messages.length, 2);

      const logsText = router.logs.join('\n');
      assert.strictEqual(logsText.includes('secret-bearer-token'), false, 'Token must never appear in logs');
    });

    it('executes ai.chat to local/LAN provider without token', async () => {
      router.registerAiProvider({
        id: 'local-lan-ai',
        baseUrl: 'http://192.168.1.50:11434/v1',
        model: 'mistral:latest'
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'local-lan-ai',
          messages: [{ role: 'user', content: 'Local query' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(fetchCalls[0].url, 'http://192.168.1.50:11434/v1/chat/completions');
      assert.strictEqual(fetchCalls[0].options.headers['Authorization'], undefined);
    });

    it('fails fast with ai_provider_unavailable if provider is unregistered or disabled', async () => {
      const resUnregistered = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'unknown-provider',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });
      assert.strictEqual(resUnregistered.success, false);
      assert.strictEqual(resUnregistered.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(resUnregistered.metadata.provider, 'unknown-provider');

      router.registerAiProvider({
        id: 'disabled-ai',
        baseUrl: 'https://api.disabled.com/v1',
        model: 'm1',
        enabled: false
      });

      const resDisabled = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'disabled-ai',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });
      assert.strictEqual(resDisabled.success, false);
      assert.strictEqual(resDisabled.metadata.code, 'ai_provider_unavailable');
    });

    it('distinguishes HTTP 401/403 errors as ai_auth_failed without exposing token', async () => {
      router.registerAiProvider({
        id: 'auth-ai',
        baseUrl: 'https://api.auth-fail.com/v1',
        model: 'm1',
        token: 'invalid-token-xyz'
      });

      globalThis.__mockFetchResponse = {
        ok: false,
        status: 401,
        headers: { get: () => 'application/json', entries: () => [] },
        json: async () => ({ error: { message: 'Unauthorized key' } })
      };

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'auth-ai',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.error.includes('invalid-token-xyz'), false);
    });

    it('fails with ai_invalid_response when response body has no choices', async () => {
      router.registerAiProvider({
        id: 'invalid-ai',
        baseUrl: 'https://api.invalid.com/v1',
        model: 'm1'
      });

      globalThis.__mockFetchResponse = {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json', entries: () => [] },
        json: async () => ({ id: '123', choices: [] })
      };

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'invalid-ai',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
      assert.ok(res.error.includes('missing or empty choices array'));
    });
  });
});
