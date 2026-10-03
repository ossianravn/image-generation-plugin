import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** @param {string | undefined} [override] @param {NodeJS.ProcessEnv} [environment] */
export function dataDirectory(override, environment = process.env) {
  const base = process.platform === 'win32'
    ? environment.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support')
      : environment.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return resolve(override ?? environment.IMAGE_GENERATION_DATA ?? environment.PLUGIN_DATA
    ?? environment.CLAUDE_PLUGIN_DATA ?? join(base, 'image-generation'));
}
