import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Runtime } from '../src/runtime.ts';
import { JobStore } from '../src/store.ts';
import { Http, type Fetch } from '../src/http.ts';
import type { ProviderAdapter } from '../src/contracts.ts';
import type { Config } from '../src/config.ts';
import { providers } from '../src/credentials.ts';

export async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'image-plugin-test-'));
  const outputs = join(directory, 'outputs');
  await mkdir(outputs);
  const bytes = await sharp({ create: { width: 384, height: 384, channels: 4,
    background: { r: 210, g: 50, b: 80, alpha: 1 } } }).png().toBuffer();
  return { directory, outputs, bytes };
}

export function request(output_directory: string, request_id = 'test-action') {
  return { request_id, provider: 'openai', model: 'gpt-image-2.5-flare',
    prompt: 'A red ceramic cup on a white table', output_directory };
}

export function config(dataDirectory: string): Config {
  return { dataDirectory, key: () => 'unit-test-key', configured: () => true,
    refresh: async () => {},
    credentials: () => providers.map(provider => ({ provider, configured: true, source: 'environment' })),
  };
}

export async function runtimeFor(directory: string, adapter: ProviderAdapter, fetcher?: Fetch) {
  return new Runtime(config(directory), await JobStore.open(directory), new Http(fetcher), {
    openai: adapter, gemini: adapter, replicate: adapter, openrouter: adapter,
  });
}

export function response(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}
