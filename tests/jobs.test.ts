import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, request, runtimeFor } from './helpers.ts';
import { ImageError } from '../src/errors.ts';
import { digest } from '../src/images.ts';

test('two runtimes deduplicate concurrent submissions and preserve original output bytes', async () => {
  const f = await fixture();
  let calls = 0;
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const adapter = { async submit() { calls++; await gate; return { images: [{ base64: f.bytes.toString('base64') }] }; } };
  const a = await runtimeFor(f.directory, adapter);
  const b = await runtimeFor(f.directory, adapter);
  try {
    const [first, second] = await Promise.all([a.start(request(f.outputs), 'generate'), b.start(request(f.outputs), 'generate')]);
    assert.equal(first.id, second.id);
    assert.equal(calls, 1);
    finish();
    const job = await a.wait(first.id, 3000);
    assert.equal(job.state, 'completed');
    assert.deepEqual(await readFile(job.artifacts[0]!.path), f.bytes);
    assert.equal(job.artifacts[0]!.sha256, digest(f.bytes));
    await assert.rejects(b.start({ ...request(f.outputs), prompt: 'Different action' }, 'generate'), /different inputs/);
    assert.equal(calls, 1);
  } finally { finish(); await a.close(); await b.close(); }
});

test('an ambiguous paid outcome stays unknown and a reused ID never resubmits', async () => {
  const f = await fixture();
  let calls = 0;
  const runtime = await runtimeFor(f.directory, { async submit() {
    calls++; throw new ImageError('CONNECTION_LOST', 'Outcome uncertain', true);
  } });
  try {
    const initial = await runtime.start(request(f.outputs), 'generate');
    assert.equal((await runtime.wait(initial.id, 2000)).state, 'unknown');
    assert.equal((await runtime.start(request(f.outputs), 'generate')).state, 'unknown');
    assert.equal(calls, 1);
  } finally { await runtime.close(); }
});

test('retained provider output retries downloading without paying for generation again', async () => {
  const f = await fixture();
  let ready = false;
  let calls = 0;
  const runtime = await runtimeFor(f.directory, { async submit() {
    calls++; return { images: [{ url: 'https://images.example.test/asset.png' }] };
  } }, async () => ready ? new Response(new Uint8Array(f.bytes)) : new Response('', { status: 503 }));
  try {
    const initial = await runtime.start(request(f.outputs), 'generate');
    const failedSave = await runtime.wait(initial.id, 3000);
    assert.equal(failedSave.state, 'saving');
    assert.equal(failedSave.error?.code, 'DOWNLOAD_FAILED');
    ready = true;
    await runtime.get(initial.id);
    const saved = await runtime.wait(initial.id, 3000);
    assert.equal(saved.state, 'completed');
    assert.equal(calls, 1);
  } finally { await runtime.close(); }
});

test('a restarted runtime recovers a recorded provider job without its original prompt', async () => {
  const f = await fixture();
  let recovered = '';
  const runtime = await runtimeFor(f.directory, {
    async submit() { throw new Error('Must not submit'); },
    async recover(id) { recovered = id; return { images: [{ base64: f.bytes.toString('base64') }] }; },
  });
  const id = digest('previous-process');
  runtime.store.create({ owner: 'old-process', owner_pid: 0, fingerprint: 'prior-input-hash',
    job: { id, provider: 'replicate', model: 'black-forest-labs/flux-3-image', operation: 'generate',
      state: 'running', created_at: '2026-10-03', updated_at: '2026-10-03',
      output_directory: f.outputs, artifacts: [], provider_job_id: 'prediction-123' } });
  try {
    const job = await runtime.wait(id, 3000);
    assert.equal(job.state, 'completed');
    assert.equal(recovered, 'prediction-123');
    assert.equal('prompt' in runtime.store.get(id)!.job, false);
  } finally { await runtime.close(); }
});

test('cancellation dispatches once and reports provider-confirmed cancellation', async () => {
  const f = await fixture();
  let cancelled!: () => void;
  let calls = 0;
  const gate = new Promise<void>(resolve => { cancelled = resolve; });
  const runtime = await runtimeFor(f.directory, {
    async submit(_input, context) {
      await context.checkpoint('cancel-prediction');
      await gate;
      throw new ImageError('CANCELLED', 'Provider confirmed cancellation.');
    },
    async cancel(id) { assert.equal(id, 'cancel-prediction'); calls++; cancelled(); },
  });
  try {
    const job = await runtime.start(request(f.outputs), 'generate');
    await runtime.cancel(job.id);
    assert.equal((await runtime.wait(job.id, 2000)).state, 'cancelled');
    assert.equal(calls, 1);
  } finally { cancelled(); await runtime.close(); }
});
