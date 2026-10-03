import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** @param {string} file */
async function exists(file) {
  try { await stat(file); return true; }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** @param {string} directory */
async function sourceFiles(directory) {
  const result = [];
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...await sourceFiles(path));
    else if (item.isFile()) result.push(path);
    else throw new Error('Runtime source must contain regular files and directories.');
  }
  return result;
}

/** @param {string} command @param {string[]} args @param {string} cwd */
async function run(command, args, cwd) {
  const env = { ...process.env };
  delete env.npm_config_allow_scripts;
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
    child.once('error', () => reject(new Error('Could not start dependency setup. Install Node.js 24+ with npm and reopen the client.')));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Dependency setup failed. Check npm/network access and reconnect the plugin to retry.')));
  });
}

/** Install into a staging directory; concurrent starts only publish complete runtimes.
 * @param {string} root @param {string} data
 */
export async function ensureRuntime(root, data) {
  if (await exists(join(root, 'dist', 'cli.js')) && await exists(join(root, 'node_modules'))) {
    return join(root, 'dist', 'cli.js');
  }
  const files = ['package.json', 'npm-shrinkwrap.json', 'README.md'].map(file => join(root, file));
  for (const directory of ['src', 'bootstrap', 'skills', 'docs']) files.push(...await sourceFiles(join(root, directory)));
  const hash = createHash('sha256');
  for (const file of files) hash.update(file.slice(root.length)).update(await readFile(file));
  hash.update(`${process.platform}-${process.arch}-${process.versions.modules}`);
  const cache = join(data, 'runtimes');
  const target = join(cache, hash.digest('hex'));
  const entry = join(target, 'src', 'cli.ts');
  if (await exists(join(target, '.ready'))) return entry;
  await mkdir(cache, { recursive: true });
  const staging = await mkdtemp(join(cache, '.install-'));
  process.stderr.write('Image Generation: installing locked dependencies for this platform (first launch).\n');
  try {
    for (const name of ['package.json', 'npm-shrinkwrap.json', 'README.md', 'src', 'bootstrap', 'skills', 'docs']) {
      await cp(join(root, name), join(staging, name), { recursive: true });
    }
    // Windows runs a constant command; paths are passed only via cwd, never shell text.
    if (process.platform === 'win32') {
      await run('cmd.exe', ['/d', '/s', '/c', 'npm ci --omit=dev --no-audit --no-fund'], staging);
    } else await run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], staging);
    await run(process.execPath, ['src/cli.ts', '--help'], staging);
    await writeFile(join(staging, '.ready'), 'ready\n');
    try { await rename(staging, target); }
    catch (error) {
      if (!(await exists(join(target, '.ready')))) throw error;
    }
    process.stderr.write('Image Generation: dependencies ready.\n');
    return entry;
  } finally {
    // Only the fresh directory created by mkdtemp above is removed.
    await rm(staging, { recursive: true, force: true });
  }
}
