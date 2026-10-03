import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Job } from './contracts.ts';
import { publicError } from './errors.ts';
import { preview, readImage } from './images.ts';
import { artifactPath } from './prepare.ts';
import type { Runtime } from './runtime.ts';
import { providerSchema, requestSchema } from './schema.ts';
import { credentialStatus } from './setup.ts';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
const waitSchema = z.number().int().min(0).max(30000).default(1000)
  .describe('Wait for up to 30 seconds, then return the durable job handle.');
const jobInput = z.strictObject({ job_id: z.string(), wait_ms: waitSchema });
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function result(value: Record<string, unknown>) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] as Content[], structuredContent: value };
}

async function jobResult(job: Job) {
  const response = result({ job });
  if (job.state === 'completed' && job.artifacts[0]) {
    try { response.content.push({ type: 'image', data: await preview(job.artifacts[0].path), mimeType: 'image/png' }); }
    catch { response.content.push({ type: 'text', text: 'The saved files are available, but the display preview could not be rendered.' }); }
  }
  return { ...response, isError: job.state === 'failed' || job.state === 'unknown' };
}

async function guarded(action: () => Promise<ReturnType<typeof result>>) {
  try { return await action(); }
  catch (error) { return { ...result({ error: publicError(error) }), isError: true }; }
}

export function createServer(runtime: Runtime): McpServer {
  const server = new McpServer({ name: 'image-generation', version: '0.2.0' });
  server.registerTool('credential_status', {
    description: 'Refresh provider key presence and active sources, and return a masked setup command for the user to run in their own terminal. Never accepts or returns API keys; does not authenticate with providers.',
    inputSchema: z.strictObject({}), annotations: readOnly,
  }, () => guarded(() => credentialStatus(runtime.config).then(result)));

  server.registerTool('list_models', {
    description: 'List the curated image catalogue, documented controls, dated live workflow evidence, and credential presence. Presence does not verify current model access.',
    inputSchema: z.strictObject({ provider: providerSchema.optional() }), annotations: readOnly,
  }, ({ provider }) => guarded(async () => result({ models: await runtime.listModels(provider) })));

  server.registerTool('get_model', {
    description: 'Inspect a catalogue model and current OpenRouter Image API endpoint capabilities. Discovery makes no paid generation request.',
    inputSchema: z.strictObject({ provider: providerSchema, model: z.string() }),
    annotations: { ...readOnly, openWorldHint: true },
  }, args => guarded(async () => result({ model: await runtime.getModel(args.provider, args.model) })));

  for (const operation of ['generate', 'edit'] as const) {
    server.registerTool(`${operation}_image`, {
      description: operation === 'generate'
        ? 'Generate images, optionally guided by local references. Sends the prompt/images to the selected paid API and saves original files locally. Reuse request_id to recover the same action.'
        : 'Edit the first reference image, with optional additional references and supported mask. Uses a paid external API and saves new files. Reuse request_id for the same action.',
      inputSchema: requestSchema.extend({ wait_ms: waitSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, args => guarded(async () => {
      const { wait_ms, ...request } = args;
      const job = await runtime.start(request, operation);
      return jobResult(await runtime.wait(job.id, wait_ms));
    }));
  }

  server.registerTool('get_job', {
    description: 'Fetch or wait for an image job. Recovers existing provider jobs and retries saving retained results; never resubmits generation.',
    inputSchema: jobInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, args => guarded(async () => jobResult(await runtime.wait(args.job_id, args.wait_ms))));

  server.registerTool('cancel_job', {
    description: 'Request cancellation. Replicate can confirm it; other providers may have an unknown outcome. Cancellation does not guarantee charges stop.',
    inputSchema: z.strictObject({ job_id: z.string() }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, args => guarded(async () => jobResult(await runtime.cancel(args.job_id))));

  server.registerTool('inspect_image', {
    description: 'Read a local image or returned artifact ID and show its dimensions and a display preview. Does not upload the image or call a provider.',
    inputSchema: z.strictObject({ image: z.string() }), annotations: readOnly,
  }, args => guarded(async () => {
    const path = artifactPath(args.image, runtime.store);
    const image = await readImage(path);
    const response = result({ path, mime_type: image.mime, width: image.width, height: image.height });
    response.content.push({ type: 'image', data: await preview(path), mimeType: 'image/png' });
    return response;
  }));
  return server;
}
