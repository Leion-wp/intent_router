const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse,
  redactSensitiveData
} = require('../main.js');

describe('Acode AI OpenAI-compatible Bridge', () => {
  let router;

  beforeEach(() => {
    router = new IntentRouter();
    router.setupCommands();
  });

  describe('Helper Functions', () => {
    it('buildOpenAiCompatibleUrl correctly appends /chat/completions', () => {
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

    it('buildOpenAiCompatibleRequest constructs valid HTTP request spec', () => {
      const config = {
        id: 'test-provider',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-4o',
        token: 'secret-token-123'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Hello AI' }],
        temperature: 0.7,
        maxTokens: 100
      };

      const req = buildOpenAiCompatibleRequest(config, payload);
      assert.strictEqual(req.url, 'https://api.example.com/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers.Authorization, 'Bearer secret-token-123');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.deepStrictEqual(req.body, {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello AI' }],
        temperature: 0.7,
        max_tokens: 100
      });
    });

    it('buildOpenAiCompatibleRequest supports model override when permitted', () => {
      const config = {
        id: 'test-provider',
        baseUrl: 'https://api.example.com/v1',
        model: 'default-model',
        allowModelOverride: true
      };
      const payload = {
        model: 'custom-model',
        messages: [{ role: 'user', content: 'Hi' }]
      };

      const req = buildOpenAiCompatibleRequest(config, payload);
      assert.strictEqual(req.body.model, 'custom-model');
    });

    it('buildOpenAiCompatibleRequest ignores model override when allowModelOverride is false', () => {
      const config = {
        id: 'test-provider',
        baseUrl: 'https://api.example.com/v1',
        model: 'default-model',
        allowModelOverride: false
      };
      const payload = {
        model: 'custom-model',
        messages: [{ role: 'user', content: 'Hi' }]
      };

      const req = buildOpenAiCompatibleRequest(config, payload);
      assert.strictEqual(req.body.model, 'default-model');
    });

    it('normalizeOpenAiCompatibleResponse extracts content, model, usage, finishReason', () => {
      const rawBody = {
        id: 'chatcmpl-123',
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello World!' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      const norm = normalizeOpenAiCompatibleResponse('test-provider', rawBody);
      assert.strictEqual(norm.provider, 'test-provider');
      assert.strictEqual(norm.model, 'gpt-4o-mini');
      assert.strictEqual(norm.content, 'Hello World!');
      assert.strictEqual(norm.finishReason, 'stop');
      assert.deepStrictEqual(norm.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    });

    it('redactSensitiveData redacts secret tokens in strings', () => {
      const secret = 'sk-proj-super-secret-key-999';
      const text = `Failed request with key sk-proj-super-secret-key-999 at endpoint`;
      assert.strictEqual(
        redactSensitiveData(text, [secret]),
        'Failed request with key [REDACTED] at endpoint'
      );
    });
  });

  describe('Provider Registry & router:ai_providers', () => {
    it('registers and lists AI providers without leaking secret tokens', () => {
      router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'meta-llama/llama-3-70b-instruct',
        token: 'sk-or-v1-secret-key'
      });

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'openrouter');
      assert.strictEqual(list[0].baseUrl, 'https://openrouter.ai/api/v1');
      assert.strictEqual(list[0].model, 'meta-llama/llama-3-70b-instruct');
      assert.strictEqual(list[0].enabled, true);
      assert.strictEqual(list[0].hasToken, true);
      assert.strictEqual(list[0].token, undefined, 'Secret token must not be exposed in list');
    });

    it('allows unregistering AI providers', () => {
      router.registerAiProvider('p1', { baseUrl: 'https://p1.com/v1', model: 'm1' });
      assert.strictEqual(router.listAiProviders().length, 1);
      assert.strictEqual(router.unregisterAiProvider('p1'), true);
      assert.strictEqual(router.listAiProviders().length, 0);
    });

    it('routes router:ai_providers command', async () => {
      router.registerAiProvider('local-ollama', {
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 'local-ollama');
      assert.strictEqual(res.data[0].hasToken, false);
    });
  });

  describe('ai:chat action execution & Intent routing', () => {
    it('returns error when provider is unregistered', async () => {
      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'unknown-provider',
          messages: [{ role: 'user', content: 'Hi' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(res.metadata.provider, 'unknown-provider');
    });

    it('returns error when provider is disabled', async () => {
      router.registerAiProvider('disabled-prov', {
        baseUrl: 'https://api.example.com/v1',
        model: 'm1',
        enabled: false
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'disabled-prov',
          messages: [{ role: 'user', content: 'Hi' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');
    });

    it('executes ai:chat successfully against remote provider using mock network:request', async () => {
      router.registerAiProvider('groq', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        token: 'gsk-secret-token-key'
      });

      let routedNetworkReq = null;
      router.register('network:request', async (data) => {
        routedNetworkReq = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'chatcmpl-999',
            model: 'llama-3.3-70b-versatile',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Groq response here' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
          }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'groq',
          messages: [{ role: 'user', content: 'Explain quantum computing in 5 words' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'groq');
      assert.strictEqual(res.data.model, 'llama-3.3-70b-versatile');
      assert.strictEqual(res.data.content, 'Groq response here');
      assert.strictEqual(res.data.finishReason, 'stop');
      assert.deepStrictEqual(res.data.usage, { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 });

      assert.strictEqual(routedNetworkReq.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.strictEqual(routedNetworkReq.headers.Authorization, 'Bearer gsk-secret-token-key');
    });

    it('works with local/LAN endpoint without token', async () => {
      router.registerAiProvider('local-lan', {
        baseUrl: 'http://192.168.1.50:8080/v1',
        model: 'local-model'
      });

      let routedNetworkReq = null;
      router.register('network:request', async (data) => {
        routedNetworkReq = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            choices: [{ message: { role: 'assistant', content: 'Local response' } }]
          }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'local-lan',
          messages: [{ role: 'user', content: 'Hello local AI' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.content, 'Local response');
      assert.strictEqual(routedNetworkReq.headers.Authorization, undefined);
    });

    it('handles 401/403 auth errors and redacts token from error logs and output', async () => {
      const secretToken = 'sk-proj-secret-token-to-hide-12345';
      router.registerAiProvider('auth-fail-provider', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        token: secretToken
      });

      router.register('network:request', async () => {
        throw new Error(`HTTP 401 Unauthorized with token ${secretToken}`);
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'auth-fail-provider',
          messages: [{ role: 'user', content: 'Test prompt' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.ok(!res.error.includes(secretToken), 'Token must be redacted from error message');
      assert.ok(res.error.includes('[REDACTED]'), 'Redacted marker should be present');

      const logsText = router.logs.join('\n');
      assert.ok(!logsText.includes(secretToken), 'Token must never appear in router logs');
    });

    it('handles malformed JSON / missing choices with ai_invalid_response error code', async () => {
      router.registerAiProvider('bad-json-provider', {
        baseUrl: 'https://api.example.com/v1',
        model: 'm1'
      });

      router.register('network:request', async () => {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { invalid: 'no choices array here' }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'bad-json-provider',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
    });
  });
});
