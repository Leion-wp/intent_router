const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse,
  redactSensitiveData
} = require('../main.js');

describe('AI Chat Provider Bridge', function () {
  describe('buildOpenAiCompatibleUrl', function () {
    it('joins baseUrl and endpoint cleanly with slashes', function () {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1', '/chat/completions'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1/', 'chat/completions'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:11434/v1', '/chat/completions'),
        'http://127.0.0.1:11434/v1/chat/completions'
      );
    });

    it('throws error if baseUrl is missing or empty', function () {
      assert.throws(() => buildOpenAiCompatibleUrl(''), /baseUrl is required/);
      assert.throws(() => buildOpenAiCompatibleUrl(null), /baseUrl is required/);
    });
  });

  describe('buildOpenAiCompatibleRequest', function () {
    const config = {
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
      secret: 'sk-or-v1-secret12345'
    };

    it('builds request with Authorization header when secret is provided', function () {
      const payload = {
        messages: [{ role: 'user', content: 'Hello' }]
      };
      const req = buildOpenAiCompatibleRequest(config, payload);

      assert.strictEqual(req.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.headers['Authorization'], 'Bearer sk-or-v1-secret12345');
      assert.strictEqual(req.body.model, 'openai/gpt-4o-mini');
      assert.deepStrictEqual(req.body.messages, payload.messages);
    });

    it('omits Authorization header when no secret is present (e.g. local endpoint)', function () {
      const localConfig = {
        id: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3'
      };
      const payload = {
        messages: [{ role: 'user', content: 'Hi local AI' }]
      };
      const req = buildOpenAiCompatibleRequest(localConfig, payload);

      assert.strictEqual(req.headers['Authorization'], undefined);
      assert.strictEqual(req.body.model, 'llama3');
    });

    it('supports model override, temperature, and maxTokens parameters', function () {
      const payload = {
        model: 'custom-model-override',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        maxTokens: 500
      };
      const req = buildOpenAiCompatibleRequest(config, payload);

      assert.strictEqual(req.body.model, 'custom-model-override');
      assert.strictEqual(req.body.temperature, 0.7);
      assert.strictEqual(req.body.max_tokens, 500);
    });

    it('throws invalid_ai_payload when messages is missing or empty', function () {
      assert.throws(() => {
        buildOpenAiCompatibleRequest(config, {});
      }, (err) => err.code === 'invalid_ai_payload');

      assert.throws(() => {
        buildOpenAiCompatibleRequest(config, { messages: [] });
      }, (err) => err.code === 'invalid_ai_payload');
    });
  });

  describe('normalizeOpenAiCompatibleResponse', function () {
    it('normalizes valid OpenAI chat response', function () {
      const rawResponse = {
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

      const normalized = normalizeOpenAiCompatibleResponse('test-provider', 'default-model', rawResponse);

      assert.deepStrictEqual(normalized, {
        provider: 'test-provider',
        model: 'gpt-4o-mini',
        content: 'Hello there!',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        finishReason: 'stop'
      });
    });

    it('normalizes minimal valid response without optional usage/finishReason', function () {
      const rawResponse = {
        choices: [
          {
            message: { role: 'assistant', content: 'Minimal response' }
          }
        ]
      };

      const normalized = normalizeOpenAiCompatibleResponse('test-provider', 'default-model', rawResponse);

      assert.strictEqual(normalized.provider, 'test-provider');
      assert.strictEqual(normalized.model, 'default-model');
      assert.strictEqual(normalized.content, 'Minimal response');
      assert.strictEqual(normalized.usage, undefined);
      assert.strictEqual(normalized.finishReason, undefined);
    });

    it('throws ai_invalid_response when choices or content is missing', function () {
      assert.throws(() => {
        normalizeOpenAiCompatibleResponse('test', 'model', {});
      }, (err) => err.code === 'ai_invalid_response');

      assert.throws(() => {
        normalizeOpenAiCompatibleResponse('test', 'model', { choices: [] });
      }, (err) => err.code === 'ai_invalid_response');

      assert.throws(() => {
        normalizeOpenAiCompatibleResponse('test', 'model', { choices: [{ message: {} }] });
      }, (err) => err.code === 'ai_invalid_response');
    });
  });

  describe('redactSensitiveData', function () {
    it('redacts secret token in string', function () {
      const secret = 'sk-secret-key-999';
      const text = 'Error with key sk-secret-key-999 in request header';
      const redacted = redactSensitiveData(text, secret);

      assert.strictEqual(redacted, 'Error with key [REDACTED] in request header');
    });

    it('returns original text if secret is empty or not in text', function () {
      assert.strictEqual(redactSensitiveData('Normal message', ''), 'Normal message');
      assert.strictEqual(redactSensitiveData('Normal message', 'absent-key'), 'Normal message');
    });
  });

  describe('IntentRouter AI Provider Registry & Inspection', function () {
    let router;

    beforeEach(function () {
      router = new IntentRouter();
      router.setupCommands();
    });

    it('registers, retrieves, and unregisters AI providers', function () {
      const regResult = router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o-mini',
        secret: 'sk-or-v1-secret'
      });

      assert.strictEqual(regResult.id, 'openrouter');
      assert.strictEqual(regResult.baseUrl, 'https://openrouter.ai/api/v1');
      assert.strictEqual(regResult.model, 'openai/gpt-4o-mini');
      assert.strictEqual(regResult.enabled, true);

      const provider = router.getAiProvider('openrouter');
      assert.strictEqual(provider.secret, 'sk-or-v1-secret');

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'openrouter');
      assert.strictEqual(list[0].secret, undefined); // Secret must not be in listAiProviders!

      const unreg = router.unregisterAiProvider('openrouter');
      assert.strictEqual(unreg, true);
      assert.strictEqual(router.getAiProvider('openrouter'), null);
    });

    it('router:ai_providers route returns non-sensitive metadata without secret', async function () {
      router.registerAiProvider('local-llm', {
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3',
        secret: 'super-secret-key'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 'local-llm');
      assert.strictEqual(res.data[0].baseUrl, 'http://127.0.0.1:11434/v1');
      assert.strictEqual(res.data[0].model, 'llama3');
      assert.strictEqual(res.data[0].enabled, true);
      assert.strictEqual(res.data[0].secret, undefined);
    });
  });

  describe('ai:chat action execution & routing', function () {
    let router;
    let lastNetworkRequest;

    beforeEach(function () {
      router = new IntentRouter();
      router.setupCommands();
      lastNetworkRequest = null;
    });

    it('executes ai.chat intent with registered remote provider and token', async function () {
      router.registerAiProvider('groq', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.1-70b-versatile',
        secret: 'gsk_secret_token_abc123'
      });

      // Mock network:request command
      router.register('network:request', async (data) => {
        lastNetworkRequest = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            model: 'llama-3.1-70b-versatile',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Groq response' },
                finish_reason: 'stop'
              }
            ],
            usage: { total_tokens: 42 }
          }
        };
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'groq',
          messages: [{ role: 'user', content: 'Hello Groq' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'groq');
      assert.strictEqual(res.data.content, 'Groq response');
      assert.strictEqual(res.data.model, 'llama-3.1-70b-versatile');
      assert.deepStrictEqual(res.data.usage, { total_tokens: 42 });

      // Verify network request details
      assert.strictEqual(lastNetworkRequest.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.strictEqual(lastNetworkRequest.headers['Authorization'], 'Bearer gsk_secret_token_abc123');
      assert.strictEqual(lastNetworkRequest.body.model, 'llama-3.1-70b-versatile');
    });

    it('executes ai:chat with local LAN provider without authorization token', async function () {
      router.registerAiProvider('lan-ollama', {
        baseUrl: 'http://192.168.1.50:11434/v1',
        model: 'mistral'
      });

      router.register('network:request', async (data) => {
        lastNetworkRequest = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            choices: [{ message: { content: 'LAN Ollama response' } }]
          }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'lan-ollama',
          messages: [{ role: 'user', content: 'Ping LAN' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.content, 'LAN Ollama response');
      assert.strictEqual(lastNetworkRequest.headers['Authorization'], undefined);
    });

    it('fails with ai_provider_unavailable if provider is not registered or disabled', async function () {
      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'unknown-provider', messages: [{ role: 'user', content: 'Hi' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_provider_unavailable');

      // Disabled provider
      router.registerAiProvider('disabled-provider', {
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'test',
        enabled: false
      });

      const resDisabled = await router.route({
        action: 'ai:chat',
        data: { provider: 'disabled-provider', messages: [{ role: 'user', content: 'Hi' }] }
      });

      assert.strictEqual(resDisabled.success, false);
      assert.strictEqual(resDisabled.metadata.code, 'ai_provider_unavailable');
    });

    it('fails with invalid_ai_payload if messages array is invalid', async function () {
      router.registerAiProvider('valid-provider', {
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'test'
      });

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'valid-provider', messages: [] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'invalid_ai_payload');
    });

    it('fails with ai_auth_failed on 401/403 HTTP error and redacts secret from logs and error message', async function () {
      const secret = 'sk-sensitive-token-999';
      router.registerAiProvider('failing-auth', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4',
        secret: secret
      });

      router.register('network:request', async () => {
        throw new Error(`HTTP 401: Unauthorized access using key ${secret}`);
      });

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'failing-auth', messages: [{ role: 'user', content: 'Test' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.error.includes(secret), false);
      assert.strictEqual(res.error.includes('[REDACTED]'), true);

      // Verify router logs do not contain the secret either
      const logs = router.logs.join('\n');
      assert.strictEqual(logs.includes(secret), false);
    });

    it('fails with ai_invalid_response when provider returns malformed response body', async function () {
      router.registerAiProvider('malformed-provider', {
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'test'
      });

      router.register('network:request', async () => ({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { choices: [] }
      }));

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'malformed-provider', messages: [{ role: 'user', content: 'Test' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
    });

    it('passes timeoutMs and maxResponseBytes parameters to network:request', async function () {
      router.registerAiProvider('guarded-provider', {
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'test'
      });

      router.register('network:request', async (data) => {
        lastNetworkRequest = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { choices: [{ message: { content: 'OK' } }] }
        };
      });

      await router.route({
        action: 'ai:chat',
        data: {
          provider: 'guarded-provider',
          messages: [{ role: 'user', content: 'Test' }],
          timeoutMs: 5000,
          maxResponseBytes: 1048576
        }
      });

      assert.strictEqual(lastNetworkRequest.timeoutMs, 5000);
      assert.strictEqual(lastNetworkRequest.maxResponseBytes, 1048576);
    });
  });
});
