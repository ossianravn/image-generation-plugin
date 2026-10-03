import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './config.ts';
import { providerNames } from './credentials.ts';
import { publicError, ImageError } from './errors.ts';
import { hostConfig } from './host-config.ts';
import { createServer } from './mcp.ts';
import { Runtime } from './runtime.ts';
import { providerSchema } from './schema.ts';
import { credentialStatus, setup } from './setup.ts';
import { JobStore } from './store.ts';
import type { Job } from './contracts.ts';

const help = `image-generation <command> [options]

Commands:
  serve        Start the stdio MCP server
  setup        Choose providers and save masked keys in the shared OS store
  doctor       Report credential presence and local data location
  models       List catalogue models
  model        Inspect a model (--provider NAME --model ID)
  generate     Generate from a JSON request (--request FILE, or - for stdin)
  edit         Edit using a JSON request with references (--request FILE)
  job          Fetch/recover a job (--id ID)
  cancel       Request cancellation (--id ID)
  host-config  Print MCP configuration (--host codex|claude|opencode)

Options:
  --env-file FILE   Explicit credential file; environment values take precedence
  --data-dir DIR    Job state directory
  --provider NAME   Configure just this provider with setup
  --remove          With setup --provider NAME, remove its shared saved key
  --help           Show this help

Requests use absolute output/reference paths. Returned artifact IDs can be reused.
Generate/edit wait until completion. MCP calls return durable handles for slow jobs.
`;

function print(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

async function readRequest(path: string | undefined): Promise<unknown> {
  if (!path) throw new ImageError('REQUEST_FILE', 'Supply --request FILE, or --request - to read JSON from stdin.');
  let source: string;
  if (path === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    source = Buffer.concat(chunks).toString('utf8');
  } else source = await readFile(path, 'utf8');
  try { return JSON.parse(source); }
  catch { throw new ImageError('REQUEST_JSON', 'The request file must contain valid JSON.'); }
}

async function completed(runtime: Runtime, initial: Job): Promise<Job> {
  let job = initial;
  while (['submitted', 'running', 'cancel_requested', 'saving'].includes(job.state) && !job.error) {
    job = await runtime.wait(job.id, 1000);
  }
  if (job.state !== 'completed') process.exitCode = 1;
  return job;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    'env-file': { type: 'string' }, 'data-dir': { type: 'string' },
    request: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' },
    id: { type: 'string' }, host: { type: 'string' }, help: { type: 'boolean' }, remove: { type: 'boolean' },
  } });
  const command = positionals[0];
  if (!command || values.help) { process.stdout.write(help); return; }
  if (command === 'host-config') {
    print(hostConfig(values.host ?? '', process.argv[1]!, values['env-file']));
    return;
  }
  if (command === 'setup') {
    await setup(values.provider ? providerSchema.parse(values.provider) : undefined, values.remove);
    const config = await loadConfig({ envFile: values['env-file'], dataDirectory: values['data-dir'] });
    const sourceNames = { environment: 'environment variables', env_file: 'the explicit credential file',
      legacy_file: 'the legacy credential file' };
    for (const item of config.credentials()) {
      if (item.source === 'environment' || item.source === 'env_file' || item.source === 'legacy_file') {
        process.stdout.write(`${providerNames[item.provider]}: active key comes from ${sourceNames[item.source]}.\n`);
      }
    }
    process.stdout.write('Setup complete. Use credential_status in your agent to refresh. No provider requests were made.\n');
    return;
  }
  const config = await loadConfig({ envFile: values['env-file'], dataDirectory: values['data-dir'] });
  if (command === 'doctor') {
    print({ node: process.version, data_directory: config.dataDirectory,
      ...await credentialStatus(config) });
    return;
  }
  const runtime = new Runtime(config, await JobStore.open(config.dataDirectory));
  if (command === 'serve') {
    const handle = serveStdio(() => createServer(runtime), {
      onerror: () => process.stderr.write('MCP transport error. Check the host connection.\n'),
    });
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await handle.close();
      await runtime.close();
    };
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
      void close().catch(() => { process.stderr.write('Shutdown could not save all job state.\n'); process.exitCode = 1; });
    });
    process.stdin.once('end', () => {
      void close().catch(() => { process.stderr.write('Connection ended before shutdown completed.\n'); process.exitCode = 1; });
    });
    return;
  }
  try {
    if (command === 'models') print(await runtime.listModels(values.provider ? providerSchema.parse(values.provider) : undefined));
    else if (command === 'model') print(await runtime.getModel(providerSchema.parse(values.provider), values.model ?? ''));
    else if (command === 'generate' || command === 'edit') {
      print(await completed(runtime, await runtime.start(await readRequest(values.request), command)));
    } else if (command === 'job') print(await completed(runtime, await runtime.get(values.id ?? '')));
    else if (command === 'cancel') print(await runtime.cancel(values.id ?? ''));
    else throw new ImageError('COMMAND', `Unknown command. Run image-generation --help.`);
  } finally { await runtime.close(); }
}

main().catch(error => {
  const value = { error: publicError(error) };
  if (process.argv.includes('serve')) process.stderr.write(`${JSON.stringify(value)}\n`);
  else print(value);
  process.exitCode = 1;
});
