import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { systemCredentialStore } from '../src/credentials.ts';

// Explicit local check: real OS store, isolated namespace, synthetic value only.
// The child confirms persistence across processes without reading plugin credentials.
const service = process.argv[2];
if (service) {
  assert.ok(service.startsWith('image-generation-plugin-test-'));
  const store = systemCredentialStore(service);
  assert.equal(await store.get('openai'), 'synthetic-credential-test-value');
} else {
  const service = `image-generation-plugin-test-${randomUUID()}`;
  const store = systemCredentialStore(service);
  try {
    assert.equal(await store.get('openai'), undefined);
    await store.set('openai', 'synthetic-credential-test-value');
    const child = spawnSync(process.execPath, [import.meta.filename, service], { encoding: 'utf8' });
    assert.equal(child.status, 0, 'A separate process could not read the synthetic credential.');
    assert.equal(await store.remove('openai'), true);
    assert.equal(await store.get('openai'), undefined);
    assert.equal(await store.remove('openai'), false);
    console.log('OS credential set/read across processes/remove passed; synthetic test entry deleted.');
  } finally { await store.remove('openai'); }
}
