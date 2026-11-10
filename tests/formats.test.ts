import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { fixture, request, runtimeFor } from './helpers.ts';
import type { PreparedRequest } from '../src/contracts.ts';

const flare = { ...request('unused'), model: 'gpt-image-2.6-flare' };

test('GIF, SVG and size requests that cannot succeed are refused before a paid call', async () => {
  const f = await fixture();
  const reference = join(f.directory, 'reference.png');
  await writeFile(reference, f.bytes);
  let calls = 0;
  const runtime = await runtimeFor(f.directory, { async submit() { calls++; return { images: [] }; } });
  const base = { ...flare, output_directory: f.outputs };
  try {
    for (const [raw, pattern] of [
      [{ ...base, references: [reference], options: { output_format: 'gif' } }, /generation-only/],
      [{ ...base, count: 2, options: { output_format: 'svg' } }, /Set count to 1/],
      [{ ...base, options: { output_format: 'gif', output_compression: 50 } }, /JPEG and WebP/],
      [{ ...base, options: { frame_count: 4 } }, /GIF output only/],
      [{ ...base, options: { output_format: 'jpeg', background: 'transparent' } }, /PNG, WebP, or SVG/],
      [{ ...base, options: { size: '1000x1000' } }, /multiples of 16/],
      [{ ...base, options: { size: '3840x1072' } }, /between 1:3 and 3:1/],
      [{ ...base, model: 'gpt-image-2.5-flare', options: { output_format: 'gif' } }, /accepts output_format values png, jpeg, webp/],
      [{ ...base, model: 'gpt-image-2.5-flare', options: { complexity: 'low' } }, /does not support the complexity control/],
      [{ ...base, provider: 'gemini', model: 'gemini-nano-banana-2.1', options: { resolution: '512' } }, /1K, 2K, 4K/],
    ] as const) await assert.rejects(runtime.start(raw, 'generate'), pattern);
    await runtime.wait((await runtime.start({ ...base, request_id: 'svg-transparent',
      options: { output_format: 'svg', background: 'transparent' } }, 'generate')).id, 3000);
    const accepted = await runtime.start({ ...base, request_id: 'gif-ok',
      options: { output_format: 'gif', frame_count: 4, size: '512x512' } }, 'generate');
    await runtime.wait(accepted.id, 3000);
    assert.equal(calls, 2);
  } finally { await runtime.close(); }
});

test('requests without a provider or model use GPT Image 2.6 Flare, and a model ID alone finds its provider', async () => {
  const f = await fixture();
  const models: string[] = [];
  const runtime = await runtimeFor(f.directory, { async submit(input) {
    models.push(`${input.request.provider}:${input.request.model}`);
    return { images: [{ base64: f.bytes.toString('base64') }] };
  } });
  const base = { request_id: 'default', prompt: 'A red ceramic cup', output_directory: f.outputs };
  try {
    for (const [id, extra] of [['default', {}], ['gemini', { provider: 'gemini' }], ['by-id', { model: 'gpt-image-2.6-sunburst' }]] as const) {
      await runtime.wait((await runtime.start({ ...base, ...extra, request_id: id }, 'generate')).id, 3000);
    }
    assert.deepEqual(models, ['openai:gpt-image-2.6-flare', 'gemini:gemini-nano-banana-2.1', 'openai:gpt-image-2.6-sunburst']);
    const job = await runtime.start({ ...base, request_id: 'default' }, 'generate');
    assert.equal(job.model, 'gpt-image-2.6-flare');
    await assert.rejects(runtime.start({ ...base, request_id: 'router', provider: 'openrouter' }, 'generate'), /Name a openrouter model/);
    assert.equal(models.length, 3);
  } finally { await runtime.close(); }
});

test('SVG and animated GIF outputs are saved with their own type and frame data', async () => {
  const f = await fixture();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><rect width="64" height="48" fill="url(#g)"/></svg>');
  const frames = await Promise.all(['red', 'blue', 'green'].map(background =>
    sharp({ create: { width: 32, height: 32, channels: 3, background } }).png().toBuffer()));
  const gif = await sharp(frames, { join: { animated: true } }).gif({ delay: [100, 100, 100], loop: 0 }).toBuffer();
  const outputs = [svg, gif, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script></svg>')];
  const runtime = await runtimeFor(f.directory, { async submit() { return { images: [{ base64: outputs.shift()!.toString('base64') }] }; } });
  try {
    const vector = await runtime.wait((await runtime.start({ ...flare, request_id: 'svg', output_directory: f.outputs,
      options: { output_format: 'svg' } }, 'generate')).id, 3000);
    assert.equal(vector.state, 'completed');
    assert.equal(vector.artifacts[0]!.mime_type, 'image/svg+xml');
    assert.match(vector.artifacts[0]!.path, /\.svg$/);
    const animated = await runtime.wait((await runtime.start({ ...flare, request_id: 'gif', output_directory: f.outputs,
      options: { output_format: 'gif' } }, 'generate')).id, 3000);
    assert.deepEqual([animated.artifacts[0]!.mime_type, animated.artifacts[0]!.frames, animated.artifacts[0]!.duration_ms],
      ['image/gif', 3, 300]);
    const unsafe = await runtime.wait((await runtime.start({ ...flare, request_id: 'unsafe', output_directory: f.outputs,
      options: { output_format: 'svg' } }, 'generate')).id, 3000);
    assert.equal(unsafe.error?.code, 'UNSAFE_SVG');
    assert.equal(unsafe.artifacts.length, 0);
  } finally { await runtime.close(); }
});

test('markup must be a transparent PNG layer matching the first reference', async () => {
  const f = await fixture();
  const source = join(f.directory, 'source.png');
  const flat = join(f.directory, 'flat.png');
  const overlay = join(f.directory, 'overlay.png');
  await writeFile(source, f.bytes);
  await writeFile(flat, f.bytes);
  await sharp({ create: { width: 384, height: 384, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384"><circle cx="192" cy="192" r="80" fill="none" stroke="red" stroke-width="8"/></svg>') }])
    .png().toFile(overlay);
  let sent: PreparedRequest | undefined;
  const runtime = await runtimeFor(f.directory, { async submit(input) { sent = input; return { images: [{ base64: f.bytes.toString('base64') }] }; } });
  const edit = { ...flare, output_directory: f.outputs, references: [source] };
  try {
    await assert.rejects(runtime.start({ ...edit, markup: flat }, 'edit'), /transparent pixels/);
    await assert.rejects(runtime.start({ ...edit, markup: overlay, mask: overlay }, 'edit'), /not both/);
    await assert.rejects(runtime.start({ ...edit, markup: overlay }, 'generate'), /edits only/);
    await runtime.wait((await runtime.start({ ...edit, request_id: 'markup', markup: overlay }, 'edit')).id, 3000);
    assert.equal(sent?.markup?.path, overlay);
  } finally { await runtime.close(); }
});
