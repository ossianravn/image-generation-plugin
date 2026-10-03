import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { parseEnv } from 'node:util';
import type { Provider } from './contracts.ts';
import { hasCode, ImageError } from './errors.ts';

export const keyNames: Record<Provider, string> = {
  openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY',
  replicate: 'REPLICATE_API_KEY', openrouter: 'OPENROUTER_API_KEY',
};

export interface Config {
  dataDirectory: string;
  key: (provider: Provider) => string;
  configured: (provider: Provider) => boolean;
}

export async function loadConfig(options: { envFile?: string; dataDirectory?: string } = {}): Promise<Config> {
  const platformData = process.platform === 'win32'
    ? process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  const dataDirectory = resolve(options.dataDirectory ?? process.env.IMAGE_GENERATION_DATA
    ?? process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? join(platformData, 'image-generation'));
  const envFile = options.envFile ?? join(dataDirectory, 'credentials.env');
  let fileValues: Record<string, string | undefined> = {};
  try {
    fileValues = parseEnv(await readFile(envFile, 'utf8'));
  } catch (error) {
    if (options.envFile || !hasCode(error, 'ENOENT')) {
      throw new ImageError('CREDENTIAL_FILE', 'Cannot read the selected credential file. Check its path and permissions.');
    }
  }
  const values = { ...fileValues, ...process.env };
  return {
    dataDirectory,
    configured: provider => Boolean(values[keyNames[provider]]?.trim()),
    key(provider) {
      const value = values[keyNames[provider]]?.trim();
      if (!value) throw new ImageError('MISSING_KEY', `Set ${keyNames[provider]} in the environment or credential file.`);
      return value;
    },
  };
}
