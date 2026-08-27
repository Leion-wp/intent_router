const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse,
  redactSensitiveData
} = require('../main.js');

describe('Acode OpenAI-compatible AI Provider Bridge', () => {
  let router;

  beforeEach(() => {
    router = new IntentRouter();
    // Mock navigator and window dependencies if needed
    global.navigator = { userAgent: 'test', platform: 'test' };
    global.window = {};
    router.commands.clear();
    router.setupCommands();
  });

  describe('Helper Functions', () => {
    it('normalizes baseUrl correctly for /chat/completions endpoint', () => {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1/'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:8080/v1'),
        'http://127.0.0.1:8080/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://localhost:11434/v1/chat/completions'),
        'http://localhost:11434/v1/chat/completions'
      );
    });

    it('builds valid OpenAI request with profile and payload parameters', () => {
      const profile = {
        id: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3-5-sonnet',
        token: 'sk-or-v1-secret-key-12345'
      };

      const payload = {
        provider: 'openrouter',
        messages: [{ role: 'user', content: 'Hello AI' }],
        temperature: 0.7,
        maxTokens: 100
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.headers['Authorization'], 'Bearer sk-or-v1-secret-key-12345');

      const body = JSON.parse(req.body);
      assert.strictEqual(body.model, 'anthropic/claude-3-5-sonnet');
      assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'Hello AI' }]);
      assert.strictEqual(body.temperature, 0.7);
      assert.strictEqual(body.max_tokens, 100);
    });

    it('omits Authorization header for local provider without token', () => {
      const profile = {
        id: 'local-ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3'
      };

      const payload = {
        provider: 'local-ollama',
        messages: [{ role: 'user', content: 'Hi local' }]
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.url, 'http://127.0.0.1:11434/v1/chat/completions');
      assert.strictEqual(req.headers['Authorization'], undefined);
    });

    it('normalizes complete OpenAI response format', () => {
      const raw = {
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello world response' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      const normalized = normalizeOpenAiCompatibleResponse(raw, 'openai', 'fallback-model');
      assert.deepStrictEqual(normalized, {
        provider: 'openai',
        model: 'gpt-4o',
        content: 'Hello world response',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        finishReason: 'stop'
      });
    });

    it('normalizes minimal OpenAI response format without usage or finishReason', () => {
      const raw = {
        choices: [
          {
            message: { role: 'assistant', content: 'Minimal response' }
          }
        ]
      };

      const normalized = normalizeOpenAiCompatibleResponse(raw, 'local', 'local-model');
      assert.deepStrictEqual(normalized, {
        provider: 'local',
        model: 'local-model',
        content: 'Minimal response'
      });
    });

    it('redacts secret token strings from text', () => {
      const secret = 'sk-proj-super-secret-key-999';
      const text = `Error invoking endpoint with key sk-proj-super-secret-key-999 on server`;
      const redacted = redactSensitiveData(text, [secret]);
      assert.strictEqual(redacted, 'Error invoking endpoint with key [REDACTED] on server');
    });
  });

  describe('IntentRouter AI Registry', () => {
    it('registers, lists, and unregisters AI provider profiles', () => {
      router.registerAiProvider('groq', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama3-8b-8192',
        token: 'gsk_secret123'
      });

      const profile = router.getAiProvider('groq');
      assert.strictEqual(profile.id, 'groq');
      assert.strictEqual(profile.baseUrl, 'https://api.groq.com/openai/v1');
      assert.strictEqual(profile.model, 'llama3-8b-8192');
      assert.strictEqual(profile.token, 'gsk_secret123');

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'groq');
      assert.strictEqual(list[0].token, undefined, 'token must not be returned in listAiProviders');
      assert.strictEqual(list[0].secret, undefined);

      assert.strictEqual(router.unregisterAiProvider('groq'), true);
      assert.strictEqual(router.getAiProvider('groq'), null);
    });

    it('router:ai_providers command returns non-sensitive profiles', async () => {
      router.registerAiProvider('p1', {
        baseUrl: 'https://api.p1.com/v1',
        model: 'm1',
        token: 'secret_token_1'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 'p1');
      assert.strictEqual(res.data[0].baseUrl, 'https://api.p1.com/v1');
      assert.strictEqual(res.data[0].model, 'm1');
      assert.strictEqual(res.data[0].token, undefined);
      assert.strictEqual(res.data[0].apiKey, undefined);
    });
  });

  describe('ai:chat action execution & routing', () => {
    it('executes ai.chat via intent route with normalized ai:chat', async () => {
      router.registerAiProvider('mock-ai', {
        baseUrl: 'https://mock.ai/v1',
        model: 'mock-model-v1',
        token: 'sk-mock-token-abc'
      });

      let capturedNetworkReq = null;
      router.register('network:request', async (data) => {
        capturedNetworkReq = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'cmpl-1',
            model: 'mock-model-v1',
            choices: [
              { message: { role: 'assistant', content: 'Mock response content' }, finish_reason: 'stop' }
            ]
          }
        };
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'mock-ai',
          messages: [{ role: 'user', content: 'Tell me a story' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'mock-ai');
      assert.strictEqual(res.data.model, 'mock-model-v1');
      assert.strictEqual(res.data.content, 'Mock response content');

      assert.strictEqual(capturedNetworkReq.url, 'https://mock.ai/v1/chat/completions');
      assert.strictEqual(capturedNetworkReq.headers['Authorization'], 'Bearer sk-mock-token-abc');
    });

    it('rejects ai:chat when provider is unknown or disabled', async () => {
      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'non-existent',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');
      assert.ok(res.error.includes("non-existent"));
    });

    it('maps HTTP 401/403 errors to ai_auth_failed without exposing secret token', async () => {
      const secretToken = 'sk-secret-token-to-hide';
      router.registerAiProvider('auth-provider', {
        baseUrl: 'https://api.auth.com/v1',
        model: 'm1',
        token: secretToken
      });

      router.register('network:request', async () => {
        throw new Error(`HTTP 401: Unauthorized access with key ${secretToken}`);
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'auth-provider',
          messages: [{ role: 'user', content: 'Hi' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.error.includes(secretToken), false, 'Token must be redacted from error message');
      assert.ok(res.error.includes('[REDACTED]'));
    });

    it('maps network failures to ai_provider_unavailable', async () => {
      router.registerAiProvider('down-provider', {
        baseUrl: 'https://down.provider.com/v1',
        model: 'm1'
      });

      router.register('network:request', async () => {
        throw new Error('Network connection refused (ECONNREFUSED)');
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'down-provider',
          messages: [{ role: 'user', content: 'Hi' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');
    });

    it('maps malformed JSON or invalid response structure to ai_invalid_response', async () => {
      router.registerAiProvider('bad-json-provider', {
        baseUrl: 'https://badjson.com/v1',
        model: 'm1'
      });

      router.register('network:request', async () => {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            // Missing choices array
            something: 'else'
          }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'bad-json-provider',
          messages: [{ role: 'user', content: 'Hi' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
    });

    it('redacts tokens from logs when registering or logging errors', () => {
      const secret = 'sk-ultra-secret-key-xyz';
      router.registerAiProvider('secret-log-provider', {
        baseUrl: 'https://secret.com/v1',
        model: 'm1',
        token: secret
      });

      router.log(`Connecting using token ${secret} to endpoint`);

      const lastLog = router.logs[router.logs.length - 1];
      assert.strictEqual(lastLog.includes(secret), false);
      assert.ok(lastLog.includes('[REDACTED]'));
    });
  });
});
