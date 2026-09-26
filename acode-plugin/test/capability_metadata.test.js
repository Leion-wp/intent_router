const assert = require('assert');
const {
  IntentRouter,
  normalizeCapabilityMetadata,
  validatePayloadAgainstArgs
} = require('../main.js');

describe('Acode capability argument metadata', () => {
  let router;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
  });

  describe('normalizeCapabilityMetadata()', () => {
    it('handles null, undefined, and primitive metadata gracefully', () => {
      assert.deepStrictEqual(normalizeCapabilityMetadata(null), { description: undefined, args: [] });
      assert.deepStrictEqual(normalizeCapabilityMetadata(undefined), { description: undefined, args: [] });
      assert.deepStrictEqual(normalizeCapabilityMetadata('invalid'), { description: undefined, args: [] });
      assert.deepStrictEqual(normalizeCapabilityMetadata(123), { description: undefined, args: [] });
    });

    it('sanitizes description and argument list', () => {
      const raw = {
        description: '  Sample action description  ',
        args: [
          null,
          'not an object',
          { name: '' }, // empty name ignored
          { name: '  ' }, // whitespace name ignored
          { name: 'path', type: 'STRING', required: true, description: 'Target path' },
          { name: 'maxBytes', type: 'INVALID_TYPE', required: false, default: 1024 }, // invalid type -> default 'string'
          { name: 'method', type: 'enum', required: false, default: 'GET', options: ['GET', 'POST'] },
          { name: 'config', type: 'object', required: false }
        ]
      };

      const normalized = normalizeCapabilityMetadata(raw);

      assert.strictEqual(normalized.description, '  Sample action description  ');
      assert.strictEqual(normalized.args.length, 4);

      assert.deepStrictEqual(normalized.args[0], {
        name: 'path',
        type: 'string',
        required: true,
        description: 'Target path'
      });

      assert.deepStrictEqual(normalized.args[1], {
        name: 'maxBytes',
        type: 'string', // fallback type
        required: false,
        default: 1024
      });

      assert.deepStrictEqual(normalized.args[2], {
        name: 'method',
        type: 'enum',
        required: false,
        default: 'GET',
        options: ['GET', 'POST']
      });

      assert.deepStrictEqual(normalized.args[3], {
        name: 'config',
        type: 'object',
        required: false
      });
    });

    it('deduplicates names after normalization and keeps the first contract', () => {
      const normalized = normalizeCapabilityMetadata({
        args: [
          { name: 'mode', type: 'string', required: true },
          { name: ' mode ', type: 'number', required: false }
        ]
      });
      assert.strictEqual(normalized.args.length, 1);
      assert.deepStrictEqual(normalized.args[0], {
        name: 'mode',
        type: 'string',
        required: true
      });
    });

    it('redacts values from sensitive metadata during normalization', () => {
      const sentinel = 'sentinel-secret-metadata';
      const normalized = normalizeCapabilityMetadata({
        args: [{
          name: 'token',
          type: 'string',
          sensitive: true,
          default: sentinel,
          options: [sentinel]
        }]
      });
      assert.deepStrictEqual(normalized.args[0], {
        name: 'token',
        type: 'string',
        required: false,
        sensitive: true
      });
      assert.strictEqual(JSON.stringify(normalized).includes(sentinel), false);
    });

  });

  describe('validatePayloadAgainstArgs()', () => {
    const sampleArgs = [
      { name: 'filePath', type: 'string', required: true, description: 'File path' },
      { name: 'retries', type: 'number', required: false, default: 3 },
      { name: 'verbose', type: 'boolean', required: false },
      { name: 'mode', type: 'enum', required: true, options: ['read', 'write', 'append'] },
      { name: 'options', type: 'object', required: false }
    ];

    it('accepts valid payloads meeting metadata specifications', () => {
      const payload = {
        filePath: '/tmp/test.txt',
        retries: 5,
        verbose: true,
        mode: 'read',
        options: { key: 'val' }
      };

      const res = validatePayloadAgainstArgs(payload, sampleArgs);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);
    });

    it('allows omitting optional arguments', () => {
      const payload = {
        filePath: '/tmp/test.txt',
        mode: 'write'
      };

      const res = validatePayloadAgainstArgs(payload, sampleArgs);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);
    });

    it('rejects payload missing required arguments', () => {
      const payload = {
        retries: 2
      };

      const res = validatePayloadAgainstArgs(payload, sampleArgs);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("Missing required argument 'filePath'")));
      assert.ok(res.errors.some(e => e.includes("Missing required argument 'mode'")));
    });

    it('rejects invalid primitive and enum argument types', () => {
      const payload = {
        filePath: 12345, // invalid: expected string
        retries: 'not_a_number', // invalid: expected number
        verbose: 'yes', // invalid: expected boolean
        mode: 'invalid_mode', // invalid enum value
        options: 'not_an_object' // invalid: expected object
      };

      const res = validatePayloadAgainstArgs(payload, sampleArgs);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 5);
      assert.ok(res.errors.some(e => e.includes("filePath")));
      assert.ok(res.errors.some(e => e.includes("retries")));
      assert.ok(res.errors.some(e => e.includes("verbose")));
      assert.ok(res.errors.some(e => e.includes("mode") && e.includes("Expected one of: read, write, append")));
      assert.ok(res.errors.some(e => e.includes("options")));
    });
  });

  describe('Command registration with and without metadata', () => {
    it('executes legacy commands without metadata identically', async () => {
      router.register('test:legacy', (data) => {
        return { echo: data.msg };
      });

      const res = await router.route({
        action: 'test:legacy',
        data: { msg: 'hello' }
      });

      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.data, { echo: 'hello' });
    });

    it('executes commands registered with metadata identically', async () => {
      // Form 1: register(name, handler, metadata)
      router.register('test:meta_p3', (data) => {
        return { sum: data.a + data.b };
      }, {
        description: 'Add two numbers',
        args: [
          { name: 'a', type: 'number', required: true },
          { name: 'b', type: 'number', required: true }
        ]
      });

      // Form 2: register(name, { handler, description, args })
      router.register('test:meta_obj', {
        handler: (data) => ({ result: data.text.toUpperCase() }),
        description: 'Uppercase string',
        args: [
          { name: 'text', type: 'string', required: true }
        ]
      });

      const res1 = await router.route({
        action: 'test:meta_p3',
        data: { a: 10, b: 20 }
      });
      assert.strictEqual(res1.success, true);
      assert.deepStrictEqual(res1.data, { sum: 30 });

      const res2 = await router.route({
        action: 'test:meta_obj',
        data: { text: 'acode' }
      });
      assert.strictEqual(res2.success, true);
      assert.deepStrictEqual(res2.data, { result: 'ACODE' });
    });

    it('does not break execution if metadata is malformed or invalid', async () => {
      router.register('test:bad_meta', (data) => {
        return 'success';
      }, {
        description: 12345, // invalid description type
        args: 'not_an_array' // invalid args type
      });

      const res = await router.route({
        action: 'test:bad_meta',
        data: {}
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data, 'success');
    });
  });

  describe('router:capabilities inspection and secret/function redaction', () => {
    it('returns a serializable snapshot without functions or sensitive metadata values', async () => {
      const sentinel = 'secret_bearer_token_12345';
      router.register('custom:secret_action', async () => ({ ok: true }), {
        description: 'Action handling internal tokens',
        args: [
          { name: 'input', type: 'string', required: true },
          { name: 'token', type: 'string', sensitive: true, default: sentinel, options: [sentinel] }
        ]
      });

      const res = await router.route({ action: 'router:capabilities' });
      assert.strictEqual(res.success, true);

      const snapshot = res.data;
      assert.ok(Array.isArray(snapshot.capabilities));
      assert.ok(Array.isArray(snapshot.actions));

      const serialized = JSON.stringify(snapshot);
      assert.doesNotThrow(() => JSON.parse(serialized));
      assert.strictEqual(serialized.includes(sentinel), false);
      assert.strictEqual(serialized.includes('function'), false);

      const secretCap = snapshot.capabilities.find(c => c.action === 'custom:secret_action');
      const tokenArg = secretCap.args.find(a => a.name === 'token');
      assert.strictEqual(tokenArg.sensitive, true);
      assert.strictEqual(tokenArg.default, undefined);
      assert.strictEqual(tokenArg.options, undefined);
      for (const cap of snapshot.capabilities) {
        assert.strictEqual(cap.handler, undefined);
      }
    });

    it('returns caller-owned deep snapshots that cannot mutate the registry or sibling projection', async () => {
      router.register('custom:mutable_meta', () => ({ ok: true }), {
        args: [{
          name: 'config',
          type: 'object',
          required: false,
          default: { nested: { value: 1 } },
          options: [{ id: 1 }]
        }]
      });

      const first = await router.route({ action: 'router:capabilities' });
      const capA = first.data.capabilities.find(c => c.action === 'custom:mutable_meta');
      const actionA = first.data.actions.find(c => c.action === 'custom:mutable_meta');

      capA.args[0].default.nested.value = 999;
      capA.args[0].options[0].id = 999;
      capA.args.push({ name: 'injected', type: 'string', required: false });

      assert.strictEqual(actionA.args[0].default.nested.value, 1);
      assert.strictEqual(actionA.args[0].options[0].id, 1);
      assert.strictEqual(actionA.args.length, 1);

      const second = await router.route({ action: 'router:capabilities' });
      const capB = second.data.capabilities.find(c => c.action === 'custom:mutable_meta');
      assert.strictEqual(capB.args[0].default.nested.value, 1);
      assert.strictEqual(capB.args[0].options[0].id, 1);
      assert.strictEqual(capB.args.length, 1);
    });

    it('exposes metadata only for primitives actually present on the base contract', async () => {
      const res = await router.route({ action: 'router:capabilities' });
      assert.strictEqual(res.success, true);
      const capabilities = res.data.capabilities;
      const findCap = name => capabilities.find(c => c.action === name);

      const fileRead = findCap('file:read');
      assert.ok(fileRead);
      assert.ok(fileRead.args.some(a => a.name === 'path' && a.required === true));
      assert.ok(fileRead.args.some(a => a.name === 'maxBytes' && a.type === 'number'));

      const networkRequest = findCap('network:request');
      assert.ok(networkRequest);
      assert.ok(networkRequest.args.some(a => a.name === 'url' && a.required === true));
      assert.ok(networkRequest.args.some(a => a.name === 'method' && a.type === 'string'));

      // Android does not yet contain terminal:run; this metadata PR must not create it.
      assert.strictEqual(findCap('terminal:run'), undefined);
    });

    it('keeps network metadata permissive where the live handler is permissive', async () => {
      const res = await router.route({ action: 'router:capabilities' });
      const networkRequest = res.data.capabilities.find(c => c.action === 'network:request');
      const validation = validatePayloadAgainstArgs({
        url: 'https://example.invalid',
        method: 'OPTIONS',
        body: { nested: true }
      }, networkRequest.args);

      // body is deliberately unconstrained because the runtime accepts strings or objects.
      assert.strictEqual(validation.valid, true);
    });
  });

  describe('Dynamic mobile UI builder simulation from capability metadata', () => {
    it('constructs simple form field schemas dynamically from args[] metadata without hardcoded actions', async () => {
      const res = await router.route({ action: 'router:capabilities' });
      assert.strictEqual(res.success, true);

      const generatedForms = {};
      for (const cap of res.data.capabilities) {
        generatedForms[cap.action] = {
          title: cap.action,
          description: cap.description || 'No description provided',
          fields: cap.args.map(arg => {
            let fieldType = 'text_input';
            if (arg.type === 'boolean') fieldType = 'checkbox';
            if (arg.type === 'number') fieldType = 'number_input';
            if (arg.type === 'enum') fieldType = 'dropdown_select';
            if (arg.type === 'object') fieldType = 'json_editor';
            return {
              key: arg.name,
              fieldType,
              required: !!arg.required,
              defaultValue: arg.default !== undefined ? arg.default : null,
              options: arg.options || null
            };
          })
        };
      }

      assert.ok(generatedForms['file:read']);
      assert.strictEqual(generatedForms['file:read'].fields.find(f => f.key === 'path').required, true);
      assert.strictEqual(generatedForms['file:read'].fields.find(f => f.key === 'maxBytes').fieldType, 'number_input');

      assert.ok(generatedForms['network:request']);
      assert.strictEqual(generatedForms['network:request'].fields.find(f => f.key === 'method').fieldType, 'text_input');
      assert.strictEqual(generatedForms['terminal:run'], undefined);
    });
  });
});
