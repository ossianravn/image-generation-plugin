import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { catalogue } from '../src/catalogue.ts';
import type { Job, ModelDescriptor } from '../src/contracts.ts';
import { hasCode } from '../src/errors.ts';

// Reconcile durable jobs, rather than concurrent runner progress reports.
// Reading evidence never calls a provider or resubmits a request.
const root = resolve('.');
const liveRoot = join(root, '.image-generation', 'live');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const stages = ['generate', 'reference', 'edit'];
const collected = new Map<string, { run: string; stage: string; job: Job }>();
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
for (const run of await readdir(liveRoot, { withFileTypes: true })) {
  if (!run.isDirectory()) continue;
  const path = join(liveRoot, run.name, 'state', 'jobs.sqlite');
  try { await access(path); } catch (error) {
    if (hasCode(error, 'ENOENT')) continue;
    throw error;
  }
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    for (const model of catalogue) for (const stage of stages) {
      const id = hash(`${run.name}:${model.provider}:${model.id}:${stage}`);
      const row = db.prepare('SELECT payload FROM jobs WHERE id = ?').get(id);
      if (typeof row?.payload !== 'string') continue;
      const { job }: { job: Job } = JSON.parse(row.payload);
      if (job.state !== 'completed' || !job.artifacts.length) continue;
      const key = `${model.provider}:${model.id}:${stage}`;
      const previous = collected.get(key);
      if (!previous || job.created_at > previous.job.created_at) {
        collected.set(key, { run: run.name, stage, job });
      }
    }
  } finally { db.close(); }
}

const workflows = [];
const validation: Record<string, ModelDescriptor['live_validation']> = {};
for (const model of catalogue) {
  const successful: string[] = [];
  let date = '';
  for (const stage of stages) {
    const item = collected.get(`${model.provider}:${model.id}:${stage}`);
    if (!item) continue;
    const { job } = item;
    const artifacts = [];
    for (const artifact of job.artifacts) {
      if (hash(await readFile(artifact.path)) !== artifact.sha256) {
        throw new Error(`Artifact checksum changed: ${job.id}`);
      }
      artifacts.push({ ...artifact, path: relative(root, artifact.path).replaceAll('\\', '/') });
    }
    workflows.push({ provider: model.provider, model: model.id, api: model.api,
      stage, run: item.run, job_id: job.id, completed_at: job.updated_at,
      routed_provider: job.routed_provider, version: job.version, usage: job.usage, artifacts });
    successful.push(stage);
    if (job.updated_at > date) date = job.updated_at;
  }
  if (successful.length) validation[`${model.provider}:${model.id}`] = {
    checked_at: date, plugin_version: pkg.version, completed_workflows: successful,
    references_tested: successful.includes('reference') ? 2 : successful.includes('edit') ? 1 : 0,
  };
}
await writeFile('src/catalogue-validation.json', `${JSON.stringify(validation, null, 2)}\n`);
await writeFile('docs/live-validation.json', `${JSON.stringify({ plugin_version: pkg.version,
  recorded_at: new Date().toISOString(), fixture: 'scripts/live-check.ts',
  scope: 'One text generation, two-reference composition, and single-reference edit per model; controls and quality are not exhaustively tested.',
  workflows }, null, 2)}\n`);
console.log(`Recorded ${workflows.length}/${catalogue.length * stages.length} completed workflows with verified output checksums.`);
if (workflows.length !== catalogue.length * stages.length) process.exitCode = 1;
