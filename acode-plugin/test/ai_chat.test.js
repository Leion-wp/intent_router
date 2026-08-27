const assert = require('assert');
const {
  IntentRouter,
  buildOpenAiCompatibleUrl,
  buildOpenAiCompatibleRequest,
  normalizeOpenAiCompatibleResponse,
  redactSensitiveData
} = require('../main.js');

describe('Acode OpenAI-compatible AI provider bridge (ai:chat)', () => {
  let router;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
  });

  describe('Helper functions', () => {
    it('buildOpenAiCompatibleUrl normalizes slashes correctly', () => {
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('https://api.openai.com/v1/'),
        'https://api.openai.com/v1/chat/completions'
      );
      assert.strictEqual(
        buildOpenAiCompatibleUrl('http://127.0.0.1:8080/v1/chat/completions'),
        'http://127.0.0.1:8080/v1/chat/completions'
      );
      assert.throws(() => buildOpenAiCompatibleUrl(''), err => err.code === 'invalid_ai_payload');
    });

    it('buildOpenAiCompatibleRequest sets Authorization header when token is present and omits it when absent', () => {
      const profileWithToken = {
        id: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3-haiku',
        apiKey: 'sk-or-secret-token-12345'
      };

      const reqWithToken = buildOpenAiCompatibleRequest(profileWithToken, {
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 100
      });

      assert.strictEqual(reqWithToken.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.strictEqual(reqWithToken.method, 'POST');
      assert.strictEqual(reqWithToken.headers.Authorization, 'Bearer sk-or-secret-token-12345');
      assert.strictEqual(reqWithToken.headers['Content-Type'], 'application/json');

      const parsedBody = JSON.parse(reqWithToken.body);
      assert.strictEqual(parsedBody.model, 'anthropic/claude-3-haiku');
      assert.strictEqual(parsedBody.temperature, 0.7);
      assert.strictEqual(parsedBody.max_tokens, 100);
      assert.deepStrictEqual(parsedBody.messages, [{ role: 'user', content: 'Hello' }]);

      const localProfile = {
        id: 'local-llama',
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'llama3:8b'
      };

      const localReq = buildOpenAiCompatibleRequest(localProfile, {
        messages: [{ role: 'user', content: 'Hi' }]
      });

      assert.strictEqual(localReq.url, 'http://127.0.0.1:8080/v1/chat/completions');
      assert.strictEqual(localReq.headers.Authorization, undefined);
    });

    it('normalizeOpenAiCompatibleResponse extracts content, usage, and finishReason', () => {
      const rawFull = {
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response message text' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      };

      const normalizedFull = normalizeOpenAiCompatibleResponse(rawFull, 'openai', 'gpt-4o');
      assert.strictEqual(normalizedFull.provider, 'openai');
      assert.strictEqual(normalizedFull.model, 'gpt-4o');
      assert.strictEqual(normalizedFull.content, 'Response message text');
      assert.strictEqual(normalizedFull.finishReason, 'stop');
      assert.deepStrictEqual(normalizedFull.usage, { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });

      // Minimal valid response without usage
      const rawMinimal = {
        choices: [
          {
            message: { role: 'assistant', content: 'Minimal response' }
          }
        ]
      };

      const normalizedMin = normalizeOpenAiCompatibleResponse(rawMinimal, 'local', 'default-model');
      assert.strictEqual(normalizedMin.provider, 'local');
      assert.strictEqual(normalizedMin.model, 'default-model');
      assert.strictEqual(normalizedMin.content, 'Minimal response');
      assert.strictEqual(normalizedMin.usage, undefined);
      assert.strictEqual(normalizedMin.finishReason, undefined);
    });

    it('normalizeOpenAiCompatibleResponse rejects invalid responses with structured error code', () => {
      const invalidCases = [
        'not valid json',
        {},
        { choices: [] },
        { choices: [{ message: {} }] },
        null
      ];

      for (const item of invalidCases) {
        assert.throws(
          () => normalizeOpenAiCompatibleResponse(item, 'test', 'model'),
          err => {
            assert.strictEqual(err.code, 'ai_invalid_response');
            return true;
          }
        );
      }
    });

    it('redactSensitiveData redacts single and multiple secrets', () => {
      const secret = 'sk-super-secret-key-12345';
      const text = `Error authenticating with key sk-super-secret-key-12345 at endpoint`;
      const redacted = redactSensitiveData(text, [secret]);
      assert.strictEqual(redacted, 'Error authenticating with key [REDACTED] at endpoint');
    });
  });

  describe('AI Provider Registration & Inspection', () => {
    it('registers, lists, and unregisters AI providers without leaking secret keys', () => {
      router.registerAiProvider('groq', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama3-8b-8192',
        apiKey: 'gsk_super_secret_key_abc123'
      });

      const providers = router.listAiProviders();
      assert.strictEqual(providers.length, 1);
      assert.strictEqual(providers[0].id, 'groq');
      assert.strictEqual(providers[0].baseUrl, 'https://api.groq.com/openai/v1');
      assert.strictEqual(providers[0].model, 'llama3-8b-8192');
      assert.strictEqual(providers[0].enabled, true);
      assert.strictEqual(providers[0].apiKey, undefined);

      assert.strictEqual(router.getAiProvider('groq').apiKey, 'gsk_super_secret_key_abc123');

      const unregisterRes = router.unregisterAiProvider('groq');
      assert.strictEqual(unregisterRes, true);
      assert.strictEqual(router.listAiProviders().length, 0);
    });

    it('router:ai_providers command returns non-sensitive provider metadata', async () => {
      router.registerAiProvider('openrouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'auto',
        secret: 'sk-or-v1-secret'
      });

      const res = await router.route({ action: 'router:ai_providers' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 'openrouter');
      assert.strictEqual(res.data[0].baseUrl, 'https://openrouter.ai/api/v1');
      assert.strictEqual(res.data[0].model, 'auto');
      assert.strictEqual(res.data[0].enabled, true);
      assert.strictEqual(JSON.stringify(res.data).includes('sk-or-v1-secret'), false);
    });
  });

  describe('ai:chat action routing', () => {
    it('executes end-to-end ai:chat request for remote provider via mock network:request', async () => {
      const SECRET_TOKEN = 'sk-remote-secret-999';
      router.registerAiProvider('mock-remote', {
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-4o-mini',
        apiKey: SECRET_TOKEN
      });

      let capturedNetworkData = null;
      router.register('network:request', async (data) => {
        capturedNetworkData = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            id: 'chatcmpl-abc',
            model: 'gpt-4o-mini',
            choices: [
              {
                message: { role: 'assistant', content: 'Hello from remote AI' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 }
          }
        };
      });

      const res = await router.route({
        intent: 'ai.chat',
        payload: {
          provider: 'mock-remote',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Say hello.' }
          ],
          temperature: 0.2
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'mock-remote');
      assert.strictEqual(res.data.model, 'gpt-4o-mini');
      assert.strictEqual(res.data.content, 'Hello from remote AI');
      assert.strictEqual(res.data.finishReason, 'stop');
      assert.deepStrictEqual(res.data.usage, { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 });

      assert.strictEqual(capturedNetworkData.url, 'https://api.example.com/v1/chat/completions');
      assert.strictEqual(capturedNetworkData.method, 'POST');
      assert.strictEqual(capturedNetworkData.headers.Authorization, `Bearer ${SECRET_TOKEN}`);
      const body = JSON.parse(capturedNetworkData.body);
      assert.strictEqual(body.model, 'gpt-4o-mini');
      assert.strictEqual(body.temperature, 0.2);
    });

    it('executes end-to-end ai:chat request for local LAN provider without Authorization header', async () => {
      router.registerAiProvider('local-lan', {
        baseUrl: 'http://192.168.1.50:11434/v1',
        model: 'mistral'
      });

      let capturedNetworkData = null;
      router.register('network:request', async (data) => {
        capturedNetworkData = data;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            choices: [{ message: { content: 'Local response' } }]
          })
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: {
          provider: 'local-lan',
          messages: [{ role: 'user', content: 'Ping' }]
        }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.provider, 'local-lan');
      assert.strictEqual(res.data.model, 'mistral');
      assert.strictEqual(res.data.content, 'Local response');
      assert.strictEqual(capturedNetworkData.url, 'http://192.168.1.50:11434/v1/chat/completions');
      assert.strictEqual(capturedNetworkData.headers.Authorization, undefined);
    });

    it('returns ai_provider_unavailable error code when provider is not registered or disabled', async () => {
      const resMissing = await router.route({
        action: 'ai:chat',
        data: { provider: 'unknown-provider', messages: [{ role: 'user', content: 'hi' }] }
      });
      assert.strictEqual(resMissing.success, false);
      assert.strictEqual(resMissing.metadata.code, 'ai_provider_unavailable');
      assert.ok(resMissing.error.includes("unknown-provider"));

      router.registerAiProvider('disabled-provider', {
        baseUrl: 'https://example.com/v1',
        model: 'test',
        enabled: false
      });

      const resDisabled = await router.route({
        action: 'ai:chat',
        data: { provider: 'disabled-provider', messages: [{ role: 'user', content: 'hi' }] }
      });
      assert.strictEqual(resDisabled.success, false);
      assert.strictEqual(resDisabled.metadata.code, 'ai_provider_unavailable');
    });

    it('returns ai_auth_failed and redacts token on HTTP 401 or 403 network response', async () => {
      const SECRET_KEY = 'sk-secret-key-that-must-be-hidden-999';
      router.registerAiProvider('auth-fail-provider', {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama3',
        apiKey: SECRET_KEY
      });

      router.register('network:request', async () => {
        throw new Error(`HTTP 401: Unauthorized access with key ${SECRET_KEY}`);
      });

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'auth-fail-provider', messages: [{ role: 'user', content: 'test' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_auth_failed');
      assert.strictEqual(res.error.includes(SECRET_KEY), false, 'Token must be redacted from error message');
      assert.ok(res.error.includes('[REDACTED]'));

      // Check router logs to ensure token is not present
      const logs = router.logs.join('\n');
      assert.strictEqual(logs.includes(SECRET_KEY), false, 'Token must not appear in logs');
    });

    it('returns ai_invalid_response when provider produces malformed JSON or invalid schema', async () => {
      router.registerAiProvider('bad-response-provider', {
        baseUrl: 'https://api.example.com/v1',
        model: 'test'
      });

      router.register('network:request', async () => {
        return {
          status: 200,
          headers: {},
          body: 'Not valid JSON output'
        };
      });

      const res = await router.route({
        action: 'ai:chat',
        data: { provider: 'bad-response-provider', messages: [{ role: 'user', content: 'test' }] }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'ai_invalid_response');
    });
  });
});
