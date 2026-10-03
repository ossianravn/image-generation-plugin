import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Provider } from '../src/contracts.ts';
import { loadConfig } from '../src/config.ts';
import type { CredentialStore } from '../src/credentials.ts';
import { configureCredentials, credentialStatus } from '../src/setup.ts';
import { Runtime } from '../src/runtime.ts';
import { JobStore } from '../src/store.ts';
import { fixture, request } from './helpers.ts';

function memoryStore() {
  const values = new Map<Provider, string>();
  const store: CredentialStore = {
    get: async provider => values.get(provider),
    set: async (provider, value) => { values.set(provider, value); },
    remove: async provider => values.delete(provider),
  };
  return { values, store };
}

test('credential resolution respects overrides, shares across data directories, and refreshes without exposing values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'image-credentials-test-'));
  try {
    const { store, values } = memoryStore();
    values.set('openai', 'vault-openai');
    values.set('gemini', 'vault-gemini');
    values.set('replicate', 'vault-replicate');
    await writeFile(join(directory, 'credentials.env'),
      'GEMINI_API_KEY=legacy-gemini\nOPENROUTER_API_KEY=legacy-openrouter');
    const config = await loadConfig({ dataDirectory: directory, credentialStore: store,
      environment: { OPENAI_API_KEY: 'env-openai', GEMINI_API_KEY: '  ' } });
    assert.equal(config.key('openai'), 'env-openai');
    assert.equal(config.key('gemini'), 'vault-gemini');
    assert.equal(config.key('openrouter'), 'legacy-openrouter');
    assert.deepEqual(config.credentials().map(item => item.source),
      ['environment', 'os_store', 'os_store', 'legacy_file']);

    const envFile = join(directory, 'explicit.env');
    await writeFile(envFile, 'OPENAI_API_KEY=file-openai\nGEMINI_API_KEY=file-gemini');
    const explicit = await loadConfig({ envFile, dataDirectory: directory, credentialStore: store,
      environment: { OPENAI_API_KEY: 'env-openai' } });
    assert.equal(explicit.key('openai'), 'env-openai');
    assert.equal(explicit.key('gemini'), 'file-gemini');
    assert.equal(explicit.key('replicate'), 'vault-replicate');
    assert.equal(explicit.configured('openrouter'), false);

    const secondHost = await loadConfig({ dataDirectory: join(directory, 'another-host'),
      credentialStore: store, environment: {} });
    assert.equal(secondHost.key('gemini'), 'vault-gemini');
    values.set('gemini', 'rotated-gemini');
    values.set('openrouter', 'new-openrouter');
    await store.remove('replicate');
    const report = await credentialStatus(config);
    assert.equal(config.key('gemini'), 'rotated-gemini');
    assert.equal(config.key('openrouter'), 'new-openrouter');
    assert.equal(config.configured('replicate'), false);
    assert.throws(() => config.key('replicate'), { code: 'MISSING_KEY' });
    assert.equal(report.authentication_verified, false);
    assert.ok(report.setup.args.includes('setup'));
    for (const secret of ['env-openai', 'rotated-gemini', 'new-openrouter']) {
      assert.equal(JSON.stringify(report).includes(secret), false);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a locked store reports an actionable issue without leaking backend errors or disabling environment keys', async () => {
  const { store } = memoryStore();
  store.get = async () => { throw new Error('backend-error-with-sensitive-data'); };
  const config = await loadConfig({ dataDirectory: join(tmpdir(), 'unused-image-credential-directory'),
    credentialStore: store, environment: { OPENAI_API_KEY: 'usable-environment-key' } });
  assert.equal(config.key('openai'), 'usable-environment-key');
  assert.equal(config.configured('gemini'), false);
  assert.throws(() => config.key('gemini'), { code: 'CREDENTIAL_STORE' });
  const report = JSON.stringify(await credentialStatus(config));
  assert.ok(report.includes('Secret Service'));
  assert.equal(report.includes('backend-error-with-sensitive-data'), false);
  assert.equal(report.includes('usable-environment-key'), false);
});

test('a running image service picks up setup and removal before making another submission', async () => {
  const f = await fixture();
  const { store } = memoryStore();
  const config = await loadConfig({ dataDirectory: f.directory, environment: {}, credentialStore: store });
  let calls = 0;
  const adapter = { async submit() {
    assert.equal(config.key('openai'), 'newly-configured-key');
    calls++;
    return { images: [{ base64: f.bytes.toString('base64') }] };
  } };
  const runtime = new Runtime(config, await JobStore.open(f.directory), undefined,
    { openai: adapter, gemini: adapter, replicate: adapter, openrouter: adapter });
  try {
    assert.ok((await runtime.listModels('openai')).every(model => !model.credential_configured));
    await assert.rejects(runtime.start(request(f.outputs), 'generate'), { code: 'MISSING_KEY' });
    await configureCredentials(store, { choose: async () => [], key: async () => 'newly-configured-key' },
      () => {}, 'openai');
    const job = await runtime.start(request(f.outputs), 'generate');
    assert.equal((await runtime.wait(job.id, 2000)).state, 'completed');
    assert.equal(calls, 1);
    await store.remove('openai');
    await assert.rejects(runtime.start(request(f.outputs, 'after-removal'), 'generate'), { code: 'MISSING_KEY' });
    assert.equal(calls, 1);
  } finally { await runtime.close(); await rm(f.directory, { recursive: true, force: true }); }
});

test('setup adds and rotates only selected keys, supports keeping saved keys, and reports no values', async () => {
  const { store, values } = memoryStore();
  values.set('gemini', 'old-gemini');
  values.set('replicate', 'untouched-replicate');
  const messages: string[] = [];
  const prompts = { choose: async (): Promise<Provider[]> => ['openai', 'gemini'],
    key: async (provider: Provider, saved: boolean) => {
      assert.equal(saved, provider === 'gemini');
      return provider === 'openai' ? ' new-openai ' : '';
    } };
  await configureCredentials(store, prompts, message => messages.push(message));
  assert.equal(values.get('openai'), 'new-openai');
  assert.equal(values.get('gemini'), 'old-gemini');
  assert.equal(values.get('replicate'), 'untouched-replicate');
  await configureCredentials(store, { choose: async () => [], key: async () => 'rotated-gemini' },
    message => messages.push(message), 'gemini');
  assert.equal(values.get('gemini'), 'rotated-gemini');
  assert.equal(messages.some(message => /new-openai|old-gemini|rotated-gemini|untouched-replicate/.test(message)), false);
});

test('setup does not announce success on failed persistence and preserves earlier saves when cancelled', async () => {
  const { store, values } = memoryStore();
  const messages: string[] = [];
  await assert.rejects(configureCredentials(store, {
    choose: async () => ['openai', 'gemini'],
    key: async provider => {
      if (provider === 'gemini') throw new Error('cancelled');
      return 'saved-before-cancellation';
    },
  }, message => messages.push(message)), /cancelled/);
  assert.equal(values.get('openai'), 'saved-before-cancellation');
  assert.equal(values.has('gemini'), false);
  assert.equal(messages.length, 1);

  store.set = async () => {};
  await assert.rejects(configureCredentials(store, { choose: async () => [], key: async () => 'lost-write' },
    message => messages.push(message), 'openai'), { code: 'CREDENTIAL_SAVE' });
  assert.equal(messages.length, 1);
});
