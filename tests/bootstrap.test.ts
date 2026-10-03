import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureRuntime } from '../bootstrap/cache.mjs';

test('Git source bootstrap publishes a complete cache, reuses it, and isolates updates and private files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'image-bootstrap-test-'));
  const root = join(directory, 'plugin');
  const data = join(directory, 'data');
  try {
    for (const child of ['src', 'bootstrap', 'skills', 'docs']) await mkdir(join(root, child), { recursive: true });
    const pkg = { name: 'image-plugin-bootstrap-fixture', version: '1.0.0', type: 'module' };
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
    await writeFile(join(root, 'README.md'), 'Bootstrap fixture.');
    await writeFile(join(root, 'npm-shrinkwrap.json'), JSON.stringify({ ...pkg, lockfileVersion: 3,
      packages: { '': { name: pkg.name, version: pkg.version } } }));
    await writeFile(join(root, '.env.local'), 'PRIVATE_TEST_SENTINEL=not-for-distribution');
    await writeFile(join(root, 'src/cli.ts'), 'const n: number = 1; process.stdout.write(String(n));');
    const [first, concurrent] = await Promise.all([ensureRuntime(root, data), ensureRuntime(root, data)]);
    assert.equal(first, concurrent);
    assert.equal(await ensureRuntime(root, data), first);
    assert.equal((await readdir(root)).includes('node_modules'), false);
    assert.equal((await readdir(join(first, '..', '..'))).includes('.env.local'), false);
    assert.equal((await readdir(join(data, 'runtimes'))).filter(name => name.startsWith('.install-')).length, 0);

    await writeFile(join(root, 'src/cli.ts'), 'const n: number = 2; process.stdout.write(String(n));');
    const updated = await ensureRuntime(root, data);
    assert.notEqual(updated, first);
    assert.ok((await readFile(first, 'utf8')).includes('= 1'));
    assert.ok((await readFile(updated, 'utf8')).includes('= 2'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('failed runtime verification leaves no cache that a later launch could execute', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'image-bootstrap-failure-'));
  const root = join(directory, 'plugin');
  try {
    for (const child of ['src', 'bootstrap', 'skills', 'docs']) await mkdir(join(root, child), { recursive: true });
    const pkg = { name: 'image-plugin-bootstrap-fixture', version: '1.0.0', type: 'module' };
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
    await writeFile(join(root, 'README.md'), 'Bootstrap fixture.');
    await writeFile(join(root, 'npm-shrinkwrap.json'), JSON.stringify({ ...pkg, lockfileVersion: 3,
      packages: { '': { name: pkg.name, version: pkg.version } } }));
    await writeFile(join(root, 'src/cli.ts'), 'process.exit(1);');
    await assert.rejects(ensureRuntime(root, join(directory, 'data')), /Dependency setup failed/);
    assert.deepEqual(await readdir(join(directory, 'data/runtimes')), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
