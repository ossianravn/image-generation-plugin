import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise what a Git install receives: source only, without dist or node_modules.
const directory = await mkdtemp(join(tmpdir(), 'image-github-source-'));
try {
  for (const name of ['package.json', 'npm-shrinkwrap.json', 'README.md', 'src', 'bootstrap', 'bin', 'skills', 'docs']) {
    await cp(resolve(name), join(directory, name), { recursive: true });
  }
  const result = spawnSync(process.execPath, ['--test', 'tests/mcp.test.ts'], {
    stdio: 'inherit', env: { ...process.env, IMAGE_GENERATION_TEST_ENTRY: join(directory, 'bin/image-generation.mjs') },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
