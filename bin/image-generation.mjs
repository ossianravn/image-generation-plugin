#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureRuntime } from '../bootstrap/cache.mjs';
import { dataDirectory } from '../bootstrap/paths.mjs';

try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Image Generation requires Node.js 24 or newer.');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const data = dataDirectory();
  const entry = await ensureRuntime(root, data);
  process.env.IMAGE_GENERATION_DATA = data;
  process.argv[1] = entry;
  await import(pathToFileURL(entry).href);
} catch (error) {
  process.stderr.write(`Image Generation could not start: ${error.message}\n`);
  process.exitCode = 1;
}
