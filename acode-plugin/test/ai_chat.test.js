const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse,
  redactSensitiveData
} = require('../main.js');

describe('Acode OpenAI-compatible AI provider bridge', () => {
  describe('Helper functions', () => {
    it('buildOpenAiCompatibleUrl constructs correct endpoint URLs', () => {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://openrouter.ai/api/v1/'),
        'https://openrouter.ai/api/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:11434/v1'),
        'http://127.0.0.1:11434/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.groq.com/openai/v1/chat/completions'),
        'https://api.groq.com/openai/v1/chat/completions'
      );
      assert.throws(() => buildOpenAiCompatibleUrl(''), /baseUrl is required/);
    });

    it('buildOpenAiCompatibleRequest builds request object with token header', () => {
      const provider = {
        id: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.1-70b-versatile',
        token: 'gsk_secret_token_123'
      };

      const payload = {
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 500
      };

      const req = buildOpenAiCompatibleRequest(provider, payload);
      assert.strictEqual(req.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers['Authorization'], 'Bearer gsk_secret_token_123');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.body.model, 'llama-3.1-70b-versatile');
      assert.deepStrictEqual(req.body.messages, [{ role: 'user', content: 'Hello' }]);
      assert.strictEqual(req.body.temperature, 0.7);
      assert.strictEqual(req.body.max_tokens, 500);
    });

    it('buildOpenAiCompatibleRequest omits Authorization header when no token is configured (local endpoint)', () => {
      const provider = {
        id: 'local-ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3'
      };

      const payload = {
        messages: [{ role: 'user', content: 'Hi local AI' }]
      };

      const req = buildOpenAiCompatibleRequest(provider, payload);
      assert.strictEqual(req.url, 'http://127.0.0.1:11434/v1/chat/completions');
      assert.strictEqual(req.headers['Authorization'], undefined);
      assert.strictEqual(req.body.model, 'llama3');
    });

    it('buildOpenAiCompatibleRequest validates payload structure', () => {
      const provider = { id: 'p1', baseUrl: 'http://localhost', model: 'm1' };

      assert.throws(
        () => buildOpenAiCompatibleRequest(provider, {}),
        (err) => err.code === 'invalid_ai_payload'
      );

      assert.throws(
        () => buildOpenAiCompatibleRequest(provider, { messages: [] }),
        (err) => err.code === 'invalid_ai_payload'
      );

      assert.throws(
        () => buildOpenAiCompatibleRequest({ id: 'p1', baseUrl: 'http://localhost' }, { messages: [{ role: 'user', content: 'hi' }] }),
        (err) => err.code === 'invalid_ai_payload'
      );
    });

    it('normalizeOpenAiCompatibleResponse standardizes response object', () => {
      const raw = {
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello there!' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      const norm = normalizeOpenAiCompatibleResponse(raw, 'openai', 'gpt-4o');
      assert.strictEqual(norm.provider, 'openai');
      assert.strictEqual(norm.model, 'gpt-4o');
      assert.strictEqual(norm.content, 'Hello there!');
      assert.strictEqual(norm.finishReason, 'stop');
      assert.deepStrictEqual(norm.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    });

    it('normalizeOpenAiCompatibleResponse handles minimal response without usage', () => {
      const raw = {
        choices: [
          {
            message: { role: 'assistant', content: 'Minimal response' }
          }
        ]
      };

      const norm = normalizeOpenAiCompatibleResponse(raw, 'local', 'llama-3');
      assert.strictEqual(norm.provider, 'local');
      assert.strictEqual(norm.model, 'llama-3');
      assert.strictEqual(norm.content, 'Minimal response');
      assert.strictEqual(norm.usage, undefined);
    });

    it('normalizeOpenAiCompatibleResponse throws ai_invalid_response for bad structure', () => {
      assert.throws(
        () => normalizeOpenAiCompatibleResponse(null, 'p', 'm'),
        (err) => err.code === 'ai_invalid_response'
      );

      assert.throws(
        () => normalizeOpenAiCompatibleResponse({ choices: [] }, 'p', 'm'),
        (err) => err.code === 'ai_invalid_response'
      );

      assert.throws(
        () => normalizeOpenAiCompatibleResponse({ choices: [{ message: {} }] }, 'p', 'm'),
        (err) => err.code === 'ai_invalid_response'
      );
    });

    it('redactSensitiveData replaces tokens with [REDACTED]', () => {
      const secrets = ['secret_key_1', 'secret_key_2'];
      const text = 'Authorization: Bearer secret_key_1 error in secret_key_2';
      const redacted = redactSensitiveData(text, secrets);
      assert.strictEqual(redacted, 'Authorization: Bearer [REDACTED] error in [REDACTED]');
    });
  });

  describe('IntentRouter AI Provider management', () => {
    let router;

    beforeEach(() => {
      router = new IntentRouter();
      router.isInitialized = true;
      router.setupCommands();
    });

    it('registers, lists (without secrets), gets, and unregisters AI providers', () => {
      router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet',
        token: 'sk-or-v1-secret-key-999'
      });

      const p = router.getAiProvider('openrouter');
      assert.ok(p);
      assert.strictEqual(p.id, 'openrouter');
      assert.strictEqual(p.token, 'sk-or-v1-secret-key-999');

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'openrouter');
      assert.strictEqual(list[0].baseUrl, 'https://openrouter.ai/api/v1');
      assert.strictEqual(list[0].model, 'anthropic/claude-3.5-sonnet');
      assert.strictEqual(list[0].hasToken, true);
      assert.strictEqual(list[0].token, undefined, 'Secret token must NEVER be exposed in router:ai_providers');

      const unregistered = router.unregisterAiProvider('openrouter');
      assert.strictEqual(unregistered, true);
      assert.strictEqual(router.getAiProvider('openrouter'), null);
      assert.strictEqual(router.listAiProviders().length, 0);
    });

    it('router:ai_providers action returns safe metadata list', async () => {
      router.registerAiProvider('local', {
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'mistral'
      });
      router.registerAiProvider('groq', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama3-70b',
        apiKey: 'gsk_secret_456'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.length, 2);
      assert.deepStrictEqual(res.data[0], {
        id: 'local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'mistral',
        enabled: true,
        hasToken: false
      });
      assert.deepStrictEqual(res.data[1], {
        id: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama3-70b',
        enabled: true,
        hasToken: true
      });
    });
  });

  describe('ai:chat action routing', () => {
    let router;
    let lastNetworkRequest;

    beforeEach(() => {
      router = new IntentRouter();
      router.isInitialized = true;
      router.setupCommands();
      lastNetworkRequest = null;

      // Mock network:request handler
      router.register('network:request', async (data) => {
        lastNetworkRequest = data;
        if (data.url.includes('401')) {
          throw new Error('HTTP 401: Unauthorized');
        }
        if (data.url.includes('invalid-json')) {
          return { status: 200, headers: {}, body: 'not-json-object' };
        }
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'mock-chat-1',
            model: data.body ? data.body.model : 'mock-model',
            choices: [
              {
                message: { role: 'assistant', content: 'Response from mock provider' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
          }
        };
      });
    });

    it('executes ai:chat with remote provider and passes authorization token', async () => {
      router.registerAiProvider('groq', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.1-70b-versatile',
        token: 'gsk_secret_super_token'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'groq',
          messages: [{ role: 'user', content: 'What is Acode?' }],
          temperature: 0.5
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'groq');
      assert.strictEqual(res.data.model, 'llama-3.1-70b-versatile');
      assert.strictEqual(res.data.content, 'Response from mock provider');
      assert.strictEqual(res.data.finishReason, 'stop');

      assert.ok(lastNetworkRequest);
      assert.strictEqual(lastNetworkRequest.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.strictEqual(lastNetworkRequest.headers['Authorization'], 'Bearer gsk_secret_super_token');
    });

    it('executes ai:chat with local LAN / localhost endpoint', async () => {
      router.registerAiProvider('local-ollama', {
        baseUrl: 'http://192.168.1.50:11434/v1',
        model: 'qwen2.5-coder'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'local-ollama',
          messages: [{ role: 'user', content: 'Write hello world' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'local-ollama');
      assert.strictEqual(res.data.content, 'Response from mock provider');

      assert.ok(lastNetworkRequest);
      assert.strictEqual(lastNetworkRequest.url, 'http://192.168.1.50:11434/v1/chat/completions');
      assert.strictEqual(lastNetworkRequest.headers['Authorization'], undefined);
    });

    it('fails fast when provider is missing or disabled with ai_provider_unavailable', async () => {
      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'non-existent',
          messages: [{ role: 'user', content: 'Hi' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');
      assert.ok(res.error.includes("AI provider 'non-existent' is not registered or disabled"));
    });

    it('handles HTTP 401/403 with structured ai_auth_failed and redacts secret token in logs', async () => {
      const token = 'gsk_super_secret_token_abc123';
      router.registerAiProvider('auth-fail-provider', {
        baseUrl: 'https://api.example.com/401-error',
        model: 'model-1',
        token: token
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'auth-fail-provider',
          messages: [{ role: 'user', content: 'Hi' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.error.includes(token), false, 'Error message must not contain secret token');

      const logsText = router.logs.join('\n');
      assert.strictEqual(logsText.includes(token), false, 'Router logs must not contain secret token');
    });

    it('handles invalid response payload structure with ai_invalid_response', async () => {
      router.registerAiProvider('bad-json-provider', {
        baseUrl: 'https://api.example.com/invalid-json',
        model: 'model-1'
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
  });
});
