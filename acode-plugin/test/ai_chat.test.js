const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse,
  redactSensitiveData
} = require('../main.js');

describe('Acode AI Provider Bridge (ai:chat & router:ai_providers)', () => {
  let router;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
  });

  describe('Helper Functions', () => {
    it('buildOpenAiCompatibleUrl constructs correct completion endpoints', () => {
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
      assert.throws(() => buildOpenAiCompatibleUrl(''), /baseUrl is required/);
    });

    it('buildOpenAiCompatibleRequest creates valid HTTP request payloads', () => {
      const providerWithKey = {
        id: 'remote',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        secret: 'sk-secret123'
      };

      const payload = {
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 100
      };

      const req = buildOpenAiCompatibleRequest(providerWithKey, payload);
      assert.strictEqual(req.url, 'https://api.openai.com/v1/chat/completions');
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(req.headers.Authorization, 'Bearer sk-secret123');

      const parsedBody = JSON.parse(req.body);
      assert.strictEqual(parsedBody.model, 'gpt-4o');
      assert.deepStrictEqual(parsedBody.messages, [{ role: 'user', content: 'Hello' }]);
      assert.strictEqual(parsedBody.temperature, 0.7);
      assert.strictEqual(parsedBody.max_tokens, 100);
    });

    it('buildOpenAiCompatibleRequest omits Authorization header when secret is empty', () => {
      const localProvider = {
        id: 'local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3',
        secret: ''
      };

      const payload = {
        messages: [{ role: 'user', content: 'Hi local' }]
      };

      const req = buildOpenAiCompatibleRequest(localProvider, payload);
      assert.strictEqual(req.url, 'http://127.0.0.1:11434/v1/chat/completions');
      assert.strictEqual(req.headers.Authorization, undefined);
    });

    it('normalizeOpenAiCompatibleResponse parses complete OpenAI chat completion responses', () => {
      const raw = {
        id: 'chatcmpl-123',
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Parsed response text' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      const normalized = normalizeOpenAiCompatibleResponse(raw, 'my-provider');
      assert.strictEqual(normalized.provider, 'my-provider');
      assert.strictEqual(normalized.model, 'gpt-4o-mini');
      assert.strictEqual(normalized.content, 'Parsed response text');
      assert.strictEqual(normalized.finishReason, 'stop');
      assert.deepStrictEqual(normalized.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    });

    it('normalizeOpenAiCompatibleResponse works without optional usage or finishReason', () => {
      const raw = {
        choices: [
          { message: { role: 'assistant', content: 'Minimal response' } }
        ]
      };

      const normalized = normalizeOpenAiCompatibleResponse(raw, 'local');
      assert.strictEqual(normalized.provider, 'local');
      assert.strictEqual(normalized.model, 'unknown');
      assert.strictEqual(normalized.content, 'Minimal response');
      assert.strictEqual(normalized.usage, undefined);
      assert.strictEqual(normalized.finishReason, undefined);
    });

    it('normalizeOpenAiCompatibleResponse throws ai_invalid_response for malformed choices or missing content', () => {
      assert.throws(
        () => normalizeOpenAiCompatibleResponse({}, 'p1'),
        (err) => err.code === 'ai_invalid_response'
      );

      assert.throws(
        () => normalizeOpenAiCompatibleResponse({ choices: [] }, 'p1'),
        (err) => err.code === 'ai_invalid_response'
      );

      assert.throws(
        () => normalizeOpenAiCompatibleResponse({ choices: [{ message: {} }] }, 'p1'),
        (err) => err.code === 'ai_invalid_response'
      );
    });

    it('redactSensitiveData replaces secret tokens in strings and objects', () => {
      const secrets = ['secret-token-xyz'];
      const text = 'Calling API with key secret-token-xyz in header';
      assert.strictEqual(
        redactSensitiveData(text, secrets),
        'Calling API with key [REDACTED] in header'
      );

      const obj = {
        apiKey: 'secret-token-xyz',
        data: { message: 'Using secret-token-xyz token' }
      };
      const redactedObj = redactSensitiveData(obj, secrets);
      assert.strictEqual(redactedObj.apiKey, '[REDACTED]');
      assert.strictEqual(redactedObj.data.message, 'Using [REDACTED] token');
    });
  });

  describe('AI Provider Registry', () => {
    it('registers, retrieves, and unregisters AI provider profiles', () => {
      const reg = router.registerAiProvider('groq', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.1-70b',
        secret: 'gsk-secret-key'
      });

      assert.deepStrictEqual(reg, { id: 'groq', registered: true });

      const provider = router.getAiProvider('groq');
      assert.strictEqual(provider.id, 'groq');
      assert.strictEqual(provider.baseUrl, 'https://api.groq.com/openai/v1');
      assert.strictEqual(provider.model, 'llama-3.1-70b');
      assert.strictEqual(provider.secret, 'gsk-secret-key');
      assert.strictEqual(provider.enabled, true);

      const unreg = router.unregisterAiProvider('groq');
      assert.strictEqual(unreg, true);
      assert.strictEqual(router.getAiProvider('groq'), null);
    });

    it('listAiProviders and router:ai_providers return non-sensitive metadata only', async () => {
      router.registerAiProvider('p-remote', {
        baseUrl: 'https://api.provider.com/v1',
        model: 'm1',
        secret: 'SUPER_SECRET_TOKEN_999'
      });

      router.registerAiProvider('p-local', {
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'm2'
      });

      const list = router.listAiProviders();
      assert.strictEqual(list.length, 2);
      assert.deepStrictEqual(list[0], {
        id: 'p-remote',
        baseUrl: 'https://api.provider.com/v1',
        model: 'm1',
        enabled: true
      });
      assert.strictEqual(list[0].secret, undefined);
      assert.strictEqual(list[0].apiKey, undefined);

      const routedRes = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(routedRes.success, true);
      assert.strictEqual(routedRes.data.length, 2);
      assert.strictEqual(JSON.stringify(routedRes.data).includes('SUPER_SECRET_TOKEN_999'), false);
    });

    it('rejects invalid AI provider profile registration parameters', () => {
      assert.throws(() => router.registerAiProvider('', { baseUrl: 'https://a.com', model: 'm' }), /id is required/);
      assert.throws(() => router.registerAiProvider('p', { baseUrl: '', model: 'm' }), /baseUrl is required/);
      assert.throws(() => router.registerAiProvider('p', { baseUrl: 'https://a.com', model: '' }), /model is required/);
    });
  });

  describe('ai:chat Action & ai.chat Intent Execution', () => {
    it('executes ai.chat successfully over mock network route for remote endpoint', async () => {
      router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet',
        secret: 'sk-or-v1-secret'
      });

      let capturedNetworkData = null;
      router.register('network:request', async (reqData) => {
        capturedNetworkData = reqData;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'gen-123',
            model: 'anthropic/claude-3.5-sonnet',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Sonnet response' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
          }
        };
      });

      const result = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'openrouter',
          messages: [{ role: 'user', content: 'Write code' }]
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.provider, 'openrouter');
      assert.strictEqual(result.data.model, 'anthropic/claude-3.5-sonnet');
      assert.strictEqual(result.data.content, 'Sonnet response');
      assert.strictEqual(result.data.finishReason, 'stop');

      assert.strictEqual(capturedNetworkData.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.strictEqual(capturedNetworkData.headers.Authorization, 'Bearer sk-or-v1-secret');
    });

    it('supports local/LAN endpoint without token using exact same contract', async () => {
      router.registerAiProvider('ollama-local', {
        baseUrl: 'http://192.168.1.50:11434/v1',
        model: 'qwen2.5-coder'
      });

      let capturedNetworkData = null;
      router.register('network:request', async (reqData) => {
        capturedNetworkData = reqData;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            model: 'qwen2.5-coder',
            choices: [
              { message: { role: 'assistant', content: 'Local LLM output' } }
            ]
          }
        };
      });

      const result = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'ollama-local',
          messages: [{ role: 'user', content: 'Hello local LAN' }]
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.provider, 'ollama-local');
      assert.strictEqual(result.data.content, 'Local LLM output');
      assert.strictEqual(capturedNetworkData.url, 'http://192.168.1.50:11434/v1/chat/completions');
      assert.strictEqual(capturedNetworkData.headers.Authorization, undefined);
    });

    it('allows model override in ai:chat payload', async () => {
      router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'default-model',
        secret: 'sk-or-v1-secret'
      });

      let capturedNetworkData = null;
      router.register('network:request', async (reqData) => {
        capturedNetworkData = reqData;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            model: 'override-model',
            choices: [{ message: { role: 'assistant', content: 'OK' } }]
          }
        };
      });

      const result = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'openrouter',
          model: 'override-model',
          messages: [{ role: 'user', content: 'Test' }]
        }
      });

      assert.strictEqual(result.success, true);
      const parsedBody = JSON.parse(capturedNetworkData.body);
      assert.strictEqual(parsedBody.model, 'override-model');
    });
  });

  describe('Error Handling and Secret Redaction', () => {
    it('returns ai_provider_unavailable error code when provider is missing or disabled', async () => {
      const resMissing = await router.route({
        action: 'ai:chat',
        data: { provider: 'nonexistent', messages: [{ role: 'user', content: 'hi' }] }
      });

      assert.strictEqual(resMissing.success, false);
      assert.strictEqual(resMissing.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(resMissing.metadata.provider, 'nonexistent');

      router.registerAiProvider('disabled-p', {
        baseUrl: 'https://disabled.com/v1',
        model: 'm',
        enabled: false
      });

      const resDisabled = await router.route({
        action: 'ai:chat',
        data: { provider: 'disabled-p', messages: [{ role: 'user', content: 'hi' }] }
      });

      assert.strictEqual(resDisabled.success, false);
      assert.strictEqual(resDisabled.metadata.code, 'ai_provider_unavailable');
      assert.strictEqual(resDisabled.metadata.provider, 'disabled-p');
    });

    it('returns invalid_ai_payload error code for invalid or missing payload/messages', async () => {
      router.registerAiProvider('p1', { baseUrl: 'https://p1.com', model: 'm1' });

      const res1 = await router.route({
        action: 'ai:chat',
        data: { provider: 'p1', messages: 'not-an-array' }
      });
      assert.strictEqual(res1.success, false);
      assert.strictEqual(res1.metadata.code, 'invalid_ai_payload');

      const res2 = await router.route({
        action: 'ai:chat',
        data: { provider: 'p1', messages: [] }
      });
      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.metadata.code, 'invalid_ai_payload');
    });

    it('returns ai_auth_failed when network request yields HTTP 401/403 and NEVER leaks secret token', async () => {
      const secretKey = 'sk-SECRET-AUTH-KEY-DO-NOT-LEAK';
      router.registerAiProvider('auth-failing', {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        secret: secretKey
      });

      router.register('network:request', async () => {
        throw new Error(`HTTP 401: Unauthorized access with token ${secretKey}`);
      });

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'auth-failing', messages: [{ role: 'user', content: 'test' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.metadata.provider, 'auth-failing');

      assert.strictEqual(res.error.includes(secretKey), false, 'Error message must not leak secret');

      const logsText = router.logs.join('\n');
      assert.strictEqual(logsText.includes(secretKey), false, 'Logs must not contain secret key');
      assert.strictEqual(logsText.includes('[REDACTED]'), true, 'Secret should be redacted in logs');
    });

    it('returns ai_invalid_response when provider yields malformed JSON response', async () => {
      router.registerAiProvider('p1', { baseUrl: 'https://p1.com', model: 'm1' });

      router.register('network:request', async () => {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { invalid_structure: true }
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'p1', messages: [{ role: 'user', content: 'hi' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
      assert.strictEqual(res.metadata.provider, 'p1');
    });
  });
});
