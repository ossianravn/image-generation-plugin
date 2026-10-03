import { parseArgs } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import { catalogue } from '../src/catalogue.ts';
import { loadConfig } from '../src/config.ts';
import { Runtime } from '../src/runtime.ts';
import { JobStore } from '../src/store.ts';
import { publicError } from '../src/errors.ts';
import type { ImageOptions, Job, ModelDescriptor } from '../src/contracts.ts';

const { values } = parseArgs({ options: { model: { type: 'string' }, run: { type: 'string' } } });
const run = values.run ?? new Date().toISOString().replace(/[:.]/g, '-');
if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw new Error('Use a filename-safe run identifier.');
const directory = resolve('.image-generation/live', run);
await mkdir(directory, { recursive: true });
const config = await loadConfig({ dataDirectory: join(directory, 'state') });
const runtime = new Runtime(config, await JobStore.open(config.dataDirectory));
const cube = join(directory, 'reference-cube.png');
await sharp(Buffer.from('<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#eeeeee"/><path d="M140 180L250 115L370 180L260 245Z" fill="#ffe56b"/><path d="M140 180L260 245V390L140 325Z" fill="#ddb224"/><path d="M260 245L370 180V325L260 390Z" fill="#f9cb36"/></svg>'))
  .png().toFile(cube);

function options(model: ModelDescriptor): ImageOptions {
  if (model.provider === 'openai') return { quality: 'low', size: '1024x1024' };
  if (model.provider === 'replicate') return { resolution: '1k', grounding: false };
  if (model.controls.includes('resolution')) return { resolution: '1K', aspect_ratio: '1:1' };
  if (model.controls.includes('aspect_ratio')) return { aspect_ratio: '1:1' };
  return {};
}

async function finish(job: Job): Promise<Job> {
  let current = job;
  while (['submitted', 'running', 'saving', 'cancel_requested'].includes(current.state) && !current.error) {
    current = await runtime.wait(current.id, 1000);
  }
  return current;
}

type Evidence = { provider: string; model: string; stage: string; job?: Job; error?: { code: string; message: string } };
const reportPath = join(directory, values.model ? `report-${values.model.replaceAll('/', '--')}.json` : 'report.json');
const evidence: Evidence[] = [];
try {
  const existing = JSON.parse(await readFile(reportPath, 'utf8'));
  if (Array.isArray(existing.evidence)) evidence.push(...existing.evidence);
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}

try {
  const selected = catalogue.filter(model => !values.model || model.id === values.model);
  if (!selected.length) throw new Error('No matching catalogue model.');
  for (const model of selected) {
    const outputs = join(directory, model.id.replaceAll('/', '--'));
    let references: string[] = [];
    const stages = [
      ['generate', 'Studio product photograph of one red ceramic mug with a white circular emblem. Neutral light gray background, soft daylight, no text.'],
      ['reference', 'Use the mug from the first reference, preserving its red color, silhouette and white circular emblem. Place it on a blue tabletop next to the yellow cube from the second reference. Exactly one mug and one cube, soft daylight.'],
      ['edit', 'Change only the red mug body to cobalt blue. Preserve the white circular emblem, the yellow cube, the tabletop, lighting, and composition.'],
    ];
    for (const [stage, prompt] of stages) {
      try {
        const job = await finish(await runtime.start({
          request_id: `${run}:${model.provider}:${model.id}:${stage}`, provider: model.provider,
          model: model.id, prompt, output_directory: outputs, references, options: options(model),
        }, stage === 'edit' ? 'edit' : 'generate'));
        evidence.push({ provider: model.provider, model: model.id, stage: stage!, job });
        console.log(JSON.stringify({ model: model.id, stage, state: job.state, error: job.error,
          artifacts: job.artifacts.map(image => ({ path: image.path, width: image.width, height: image.height })), usage: job.usage }));
        if (job.state !== 'completed' || !job.artifacts[0]) break;
        references = stage === 'generate' ? [job.artifacts[0].id, cube] : [job.artifacts[0].id];
      } catch (error) {
        const failure = publicError(error);
        evidence.push({ provider: model.provider, model: model.id, stage: stage!, error: failure });
        console.log(JSON.stringify({ model: model.id, stage, error: failure }));
        break;
      } finally {
        await writeFile(reportPath, JSON.stringify({ run, checked_at: new Date().toISOString(),
          plugin_version: '0.1.0', node: process.version, visual_review: 'pending', evidence }, null, 2));
      }
    }
  }
} finally { await runtime.close(); }
console.log(`Evidence saved to ${reportPath}`);
if (evidence.some(item => item.error || item.job?.state !== 'completed')) process.exitCode = 1;
