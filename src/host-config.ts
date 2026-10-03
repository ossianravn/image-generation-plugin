import { dirname, resolve } from 'node:path';
import { ImageError } from './errors.ts';

export function hostConfig(host: string, entry: string, envFile?: string) {
  const command = [process.execPath, resolve(entry), 'serve', ...(envFile ? ['--env-file', resolve(envFile)] : [])];
  if (host === 'opencode') return {
    mcp: { servers: { 'image-generation': { type: 'local', command, protocol: 'auto' } } },
    skills: [resolve(dirname(entry), '..', 'skills')],
  };
  if (host === 'claude') return { mcpServers: { 'image-generation': { command: command[0], args: command.slice(1) } } };
  if (host === 'codex') return { mcp_servers: { 'image-generation': { command: command[0], args: command.slice(1) } } };
  throw new ImageError('HOST', 'Choose codex, claude, or opencode. Codex output is a configuration object to translate into TOML.');
}
