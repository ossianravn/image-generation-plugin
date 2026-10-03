import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve('.');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(root, 'releases', `${pkg.version}-${process.platform}-${process.arch}-${stamp}`);
const portable = join(output, 'portable');
await mkdir(portable, { recursive: true });
for (const name of ['dist', 'skills', 'plugin.json', 'mcp.json', 'README.md', '.env.example', 'package.json', 'package-lock.json', 'docs']) {
  await cp(join(root, name), join(portable, name), { recursive: true });
}
if (!process.env.npm_execpath) throw new Error('Run packaging through npm run package.');
const installEnvironment = { ...process.env };
// npm run exports this setting as a CLI flag, which nested project installs reject.
// The package's allowScripts declaration remains the source of install-script policy.
delete installEnvironment.npm_config_allow_scripts;
execFileSync(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--no-audit', '--no-fund'],
  { cwd: portable, stdio: 'inherit', env: installEnvironment });

const claude = join(output, 'claude');
await mkdir(join(claude, '.claude-plugin'), { recursive: true });
for (const name of ['dist', 'skills', 'node_modules', 'README.md', '.env.example', 'package.json', 'package-lock.json', 'docs']) {
  await cp(join(portable, name), join(claude, name), { recursive: true });
}
const manifest = JSON.parse(await readFile('plugin.json', 'utf8'));
delete manifest.$schema;
await writeFile(join(claude, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2));
await writeFile(join(claude, '.mcp.json'), JSON.stringify({ mcpServers: {
  'image-generation': { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/dist/cli.js', 'serve'],
    env: { IMAGE_GENERATION_DATA: '${CLAUDE_PLUGIN_DATA}' } },
} }, null, 2));

await writeFile(join(output, 'artifacts.json'), JSON.stringify({ version: pkg.version, platform: process.platform,
  arch: process.arch, node: process.version, portable, claude }, null, 2));
await mkdir(join(output, '.agents', 'plugins'), { recursive: true });
await writeFile(join(output, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({
  name: 'image-generation-local', interface: { displayName: 'Image Generation' }, plugins: [{
    name: 'image-generation', source: { source: 'local', path: './portable' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity',
  }],
}, null, 2));
console.log(`Release directories: ${output}`);
