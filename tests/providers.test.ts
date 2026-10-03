import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, config, response } from './helpers.ts';
import { Http } from '../src/http.ts';
import { openaiAdapter } from '../src/providers/openai.ts';
import { geminiAdapter } from '../src/providers/gemini.ts';
import { openrouterAdapter } from '../src/providers/openrouter.ts';
import { replicateAdapter } from '../src/providers/replicate.ts';
import type { PreparedRequest, ProviderContext } from '../src/contracts.ts';

function input(provider: PreparedRequest['request']['provider'], model: string, bytes: Buffer): PreparedRequest {
  return { operation: 'edit', references: [{ path: 'C:/reference.png', bytes, width: 384, height: 384, mime: 'image/png' }],
    request: { request_id: 'contract', provider, model, prompt: 'Turn the cup blue',
      output_directory: 'C:/outputs', references: ['C:/reference.png'], count: 1, options: {} } };
}
const context: ProviderContext = { signal: new AbortController().signal, checkpoint: async () => undefined };

test('OpenAI reference edits send actual image bytes as multipart', async () => {
  const f = await fixture();
  const http = new Http(async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/images/edits');
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body.get('model'), 'gpt-image-2.5-flare');
    const image = init.body.getAll('image[]')[0];
    assert.ok(image instanceof Blob);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), f.bytes);
    return response({ data: [{ b64_json: f.bytes.toString('base64') }] });
  });
  assert.equal((await openaiAdapter(config(f.directory), http).submit(input('openai', 'gpt-image-2.5-flare', f.bytes), context)).images.length, 1);
});

test('Gemini sends references without storage and extracts every final image, excluding thoughts', async () => {
  const f = await fixture();
  const http = new Http(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.input[0].type, 'user_input');
    assert.equal(body.input[0].content[1].data, f.bytes.toString('base64'));
    return response({ id: 'interaction-123', steps: [
      { type: 'thought', content: [{ type: 'image', data: 'intermediate' }] },
      { type: 'model_output', content: [{ type: 'image', data: 'final-one' }, { type: 'text', text: 'caption' }, { type: 'image', data: 'final-two' }] },
    ] });
  });
  const result = await geminiAdapter(config(f.directory), http).submit(input('gemini', 'gemini-3.1-flash-image', f.bytes), context);
  assert.deepEqual(result.images, [{ base64: 'final-one' }, { base64: 'final-two' }]);
});

test('OpenRouter refuses unsupported controls before a paid POST', async () => {
  const f = await fixture();
  let calls = 0;
  const http = new Http(async (_url, init) => {
    calls++;
    assert.notEqual(init?.method, 'POST');
    return response({ endpoints: [{ provider_name: 'Lab', provider_tag: 'lab', supported_parameters: {
      n: { type: 'range', min: 1, max: 1 }, input_references: { type: 'range', min: 0, max: 4 },
      resolution: { type: 'enum', values: ['1K'] },
    } }] });
  });
  const request = input('openrouter', 'qwen/qwen-image-3', f.bytes);
  request.request.options.resolution = '4K';
  await assert.rejects(openrouterAdapter(config(f.directory), http).submit(request, context), /No current OpenRouter endpoint/);
  assert.equal(calls, 1);
});

test('Replicate checkpoints prediction identity and maps native fields', async () => {
  const f = await fixture();
  let checkpoint = '';
  const http = new Http(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.input.grounding, false);
    assert.equal(body.input.output_format, 'jpg');
    assert.equal(body.input.images[0], `data:image/png;base64,${f.bytes.toString('base64')}`);
    return response({ id: 'prediction-1', status: 'succeeded', version: null,
      metrics: { resolution_target: '1k', predict_time: 18.8 }, output: 'https://example.test/result.jpg' });
  });
  const request = input('replicate', 'black-forest-labs/flux-3-image', f.bytes);
  request.request.options.output_format = 'jpeg';
  const result = await replicateAdapter(config(f.directory), http).submit(request,
    { ...context, checkpoint: async id => { checkpoint = id; } });
  assert.equal(checkpoint, 'prediction-1');
  assert.equal(result.version, undefined);
  assert.deepEqual(result.usage, { predict_time: 18.8 });
});

test('provider errors do not expose echoed request bodies or credentials', async () => {
  const http = new Http(async () => new Response('private-prompt unit-test-key', { status: 401 }));
  await assert.rejects(http.json('https://api.example.test', {}, true), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Check the API key/);
    assert.doesNotMatch(error.message, /private-prompt|unit-test-key/);
    return true;
  });
});
