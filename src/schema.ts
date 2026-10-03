import { z } from 'zod';
import { isAbsolute } from 'node:path';
import { findModel } from './catalogue.ts';
import type { ImageRequest, Operation } from './contracts.ts';
import { ImageError } from './errors.ts';

export const providerSchema = z.enum(['openai', 'gemini', 'replicate', 'openrouter']);
export const optionsSchema = z.strictObject({
  size: z.string().optional(), aspect_ratio: z.string().optional(), resolution: z.string().optional(),
  quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),
  background: z.enum(['auto', 'opaque', 'transparent']).optional(),
  output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
  output_compression: z.number().int().min(0).max(100).optional(),
  seed: z.number().int().optional(), grounding: z.boolean().optional(),
});

export const requestSchema = z.strictObject({
  request_id: z.string().min(1).describe('Reuse this ID when retrying the same action; use a new ID for a new image.'),
  provider: providerSchema,
  model: z.string().min(1),
  prompt: z.string().trim().min(1),
  output_directory: z.string().refine(isAbsolute, 'Use an absolute output directory.'),
  references: z.array(z.string().min(1)).default([]).describe('Absolute local image paths or artifact IDs.'),
  mask: z.string().optional().describe('OpenAI edit mask: PNG with alpha, matching the first reference dimensions.'),
  count: z.number().int().positive().default(1),
  options: optionsSchema.default({}),
});

export function parseRequest(raw: unknown, operation: Operation): ImageRequest {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    throw new ImageError('INVALID_REQUEST', issues.join('; '));
  }
  const request = parsed.data;
  const model = findModel(request.provider, request.model);
  if (operation === 'edit' && request.references.length === 0) {
    throw new ImageError('REFERENCE_REQUIRED', 'Editing needs a source image as the first reference.');
  }
  if (model.max_references !== null && request.references.length > model.max_references) {
    throw new ImageError('REFERENCE_LIMIT', `${model.name} accepts up to ${model.max_references} references on this route.`);
  }
  if (request.count > model.max_count) {
    throw new ImageError('COUNT_UNSUPPORTED', `${model.name} accepts up to ${model.max_count} images per request on this route.`);
  }
  if (request.mask && (!model.masks || operation !== 'edit')) {
    throw new ImageError('MASK_UNSUPPORTED', 'Masks are supported for OpenAI edits only.');
  }
  for (const option of Object.keys(request.options) as (keyof ImageRequest['options'])[]) {
    if (!model.controls.includes(option)) {
      throw new ImageError('CONTROL_UNSUPPORTED', `${model.name} does not support the ${option} control on this route.`);
    }
  }
  return request;
}
