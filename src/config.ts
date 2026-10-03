import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDirectory as resolveDataDirectory } from '../bootstrap/paths.mjs';
import { parseEnv } from 'node:util';
import type { Provider } from './contracts.ts';
import { credentialStoreError, keyNames, providers, systemCredentialStore, type CredentialStore } from './credentials.ts';
import { hasCode, ImageError } from './errors.ts';

export interface CredentialStatus {
  provider: Provider;
  configured: boolean;
  source: 'environment' | 'env_file' | 'os_store' | 'legacy_file' | null;
  issue?: string;
}

export interface Config {
  dataDirectory: string;
  key(provider: Provider): string;
  configured(provider: Provider): boolean;
  credentials(): CredentialStatus[];
  refresh(): Promise<void>;
}

interface ConfigOptions {
  envFile?: string;
  dataDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  credentialStore?: CredentialStore;
}

async function readCredentials(path: string, required: boolean): Promise<Record<string, string | undefined>> {
  try { return parseEnv(await readFile(path, 'utf8')); }
  catch (error) {
    if (!required && hasCode(error, 'ENOENT')) return {};
    throw new ImageError('CREDENTIAL_FILE', 'Cannot read the selected credential file. Check its path and permissions.');
  }
}

export async function loadConfig(options: ConfigOptions = {}): Promise<Config> {
  const environment = options.environment ?? process.env;
  const dataDirectory = resolveDataDirectory(options.dataDirectory, environment);
  const store = options.credentialStore ?? systemCredentialStore();
  let snapshot: { status: CredentialStatus; value?: string }[] = [];
  let refreshing: Promise<void> | undefined;

  async function readSnapshot() {
    const explicit = options.envFile ? await readCredentials(options.envFile, true) : {};
    let legacy: Promise<Record<string, string | undefined>> | undefined;
    const next = await Promise.all(providers.map(async provider => {
      const name = keyNames[provider];
      let value = environment[name]?.trim();
      let source: CredentialStatus['source'] = value ? 'environment' : null;
      let issue: string | undefined;
      if (!value && explicit[name]?.trim()) { value = explicit[name]!.trim(); source = 'env_file'; }
      if (!value) {
        try { value = (await store.get(provider))?.trim(); }
        catch { issue = credentialStoreError().message; }
        if (value) source = 'os_store';
      }
      if (!value && !options.envFile) {
        legacy ??= readCredentials(join(dataDirectory, 'credentials.env'), false);
        value = (await legacy)[name]?.trim();
        if (value) source = 'legacy_file';
      }
      return { value, status: { provider, configured: Boolean(value), source, ...(issue ? { issue } : {}) } };
    }));
    snapshot = next;
  }

  const config: Config = {
    dataDirectory,
    configured: provider => snapshot.some(item => item.status.provider === provider && item.status.configured),
    credentials: () => snapshot.map(item => ({ ...item.status })),
    refresh() {
      refreshing ??= readSnapshot().finally(() => { refreshing = undefined; });
      return refreshing;
    },
    key(provider) {
      const item = snapshot.find(item => item.status.provider === provider);
      if (item?.value) return item.value;
      if (item?.status.issue) throw credentialStoreError();
      throw new ImageError('MISSING_KEY',
        `Configure ${keyNames[provider]} with the setup command in your terminal. Use credential_status for the command, or supply an environment variable or --env-file.`);
    },
  };
  await config.refresh();
  return config;
}
