const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse
} = require('../main.js');

describe('AI Chat Provider Bridge (OpenAI-compatible)', function () {
  let router;

  beforeEach(function () {
    router = new IntentRouter();
    router.commands.clear();
    router.setupCommands();
  });

  describe('Helper Functions', function () {
    it('buildOpenAiCompatibleUrl correctly normalizes baseUrl and endpoint path', function () {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1/'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:11434/v1', 'chat/completions'),
        'http://127.0.0.1:11434/v1/chat/completions'
      );
    });

    it('buildOpenAiCompatibleRequest constructs valid payload and Authorization header when token is present', function () {
      const profile = {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o',
        token: 'sk-or-secret-token'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 100
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.headers['Authorization'], 'Bearer sk-or-secret-token');
      assert.deepStrictEqual(req.body, {
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 100
      });
    });

    it('buildOpenAiCompatibleRequest omits Authorization header when token is missing (e.g., local LAN model)', function () {
      const profile = {
        baseUrl: 'http://192.168.1.50:8080/v1',
        model: 'local-llama-3'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Ping' }]
      };

      const req = buildOpenAiCompatibleRequest(profile, payload);
      assert.strictEqual(req.url, 'http://192.168.1.50:8080/v1/chat/completions');
      assert.strictEqual(req.headers['Authorization'], undefined);
      assert.deepStrictEqual(req.body, {
        model: 'local-llama-3',
        messages: [{ role: 'user', content: 'Ping' }]
      });
    });

    it('normalizeOpenAiCompatibleResponse extracts content, model, usage and finishReason', function () {
      const rawBody = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-3.5-turbo-0613',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response message content' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 9, completion_tokens: 12, total_tokens: 21 }
      };

      const res = normalizeOpenAiCompatibleResponse(rawBody, 'openai-prod', 'fallback-model');
      assert.strictEqual(res.provider, 'openai-prod');
      assert.strictEqual(res.model, 'gpt-3.5-turbo-0613');
      assert.strictEqual(res.content, 'Response message content');
      assert.strictEqual(res.finishReason, 'stop');
      assert.deepStrictEqual(res.usage, { prompt_tokens: 9, completion_tokens: 12, total_tokens: 21 });
    });

    it('normalizeOpenAiCompatibleResponse handles minimal response without usage', function () {
      const rawBody = {
        choices: [
          {
            message: { role: 'assistant', content: 'Minimal response' }
          }
        ]
      };

      const res = normalizeOpenAiCompatibleResponse(rawBody, 'local-llm', 'default-llama');
      assert.strictEqual(res.provider, 'local-llm');
      assert.strictEqual(res.model, 'default-llama');
      assert.strictEqual(res.content, 'Minimal response');
      assert.strictEqual(res.usage, undefined);
      assert.strictEqual(res.finishReason, undefined);
    });
  });

  describe('AI Provider Registry & Inspection', function () {
    it('registers, lists, and unregisters AI providers safely without exposing secrets', function () {
      router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet',
        token: 'sk-or-topsecret-key'
      });

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'openrouter');
      assert.strictEqual(list[0].baseUrl, 'https://openrouter.ai/api/v1');
      assert.strictEqual(list[0].model, 'anthropic/claude-3.5-sonnet');
      assert.strictEqual(list[0].enabled, true);
      assert.strictEqual(list[0].hasToken, true);
      assert.strictEqual(list[0].token, undefined, 'token should not be exposed in inspection');

      // Test router:ai_providers action
      const inspection = router.commands.get('router:ai_providers')();
      assert.strictEqual(inspection.length, 1);
      assert.strictEqual(inspection[0].token, undefined);

      router.unregisterAiProvider('openrouter');
      assert.strictEqual(router.listAiProviders().length, 0);
    });

    it('redacts tokens from logs automatically', function () {
      const secretToken = 'sk-proj-very-secret-token-12345';
      router.registerAiProvider('openai', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        token: secretToken
      });

      router.log(`Connecting with key ${secretToken} to provider`);
      const lastLog = router.logs[router.logs.length - 1];
      assert.ok(!lastLog.includes(secretToken), 'Log should not contain secret token');
      assert.ok(lastLog.includes('[REDACTED]'), 'Log should contain [REDACTED]');
    });
  });

  describe('ai:chat Intent Execution', function () {
    it('executes ai.chat successfully against mocked network:request route', async function () {
      router.registerAiProvider('groq', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama3-8b-8192',
        token: 'gsk-secret-groq-key'
      });

      let recordedNetworkReq = null;
      router.register('network:request', async (data) => {
        recordedNetworkReq = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'chatcmpl-groq-1',
            model: 'llama3-8b-8192',
            choices: [
              {
                message: { role: 'assistant', content: 'Groq response content' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
          }
        };
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'groq',
          messages: [{ role: 'user', content: 'Test prompt' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'groq');
      assert.strictEqual(res.data.model, 'llama3-8b-8192');
      assert.strictEqual(res.data.content, 'Groq response content');
      assert.strictEqual(res.data.finishReason, 'stop');

      assert.strictEqual(recordedNetworkReq.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.strictEqual(recordedNetworkReq.headers['Authorization'], 'Bearer gsk-secret-groq-key');
    });

    it('fails fast when provider is not registered or disabled', async function () {
      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'unknown-provider',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(res.metadata.provider, 'unknown-provider');
    });

    it('fails fast on invalid payload (missing messages)', async function () {
      router.registerAiProvider('openai', { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4' });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'openai'
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'invalid_ai_payload');
    });

    it('maps HTTP 401/403 network failures to ai_auth_failed without exposing token', async function () {
      router.registerAiProvider('openai', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        token: 'sk-invalid-secret'
      });

      router.register('network:request', async () => {
        throw new Error('HTTP 401: Unauthorized access');
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'openai',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.ok(!res.error.includes('sk-invalid-secret'), 'Error message must not include secret token');
    });

    it('handles malformed JSON response or choices array missing with ai_invalid_response', async function () {
      router.registerAiProvider('local-lan', {
        baseUrl: 'http://192.168.1.100:11434/v1',
        model: 'llama3'
      });

      router.register('network:request', async () => {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { unexpected: 'format' }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'local-lan',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
    });
  });
});
