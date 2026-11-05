import { z } from 'zod';
import { isAbsolute } from 'node:path';
import { findModel } from './catalogue.ts';
import type { ImageRequest, Operation } from './contracts.ts';
import { ImageError } from './errors.ts';
import { checkOptions } from './options.ts';

export const providerSchema = z.enum(['openai', 'gemini', 'replicate', 'openrouter']);
export const optionsSchema = z.strictObject({
  size: z.string().optional(), aspect_ratio: z.string().optional(), resolution: z.string().optional(),
  quality: z.enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  background: z.enum(['auto', 'opaque', 'transparent']).optional(),
  output_format: z.enum(['png', 'jpeg', 'webp', 'gif', 'svg']).optional()
    .describe('gif and svg are generation-only formats on models that list them.'),
  output_compression: z.number().int().min(0).max(100).optional(),
  complexity: z.enum(['low', 'medium', 'high']).optional()
    .describe('How much the model plans before rendering. Low suits focused edits.'),
  frame_count: z.number().int().min(2).max(16).optional().describe('GIF output only.'),
  frame_duration_ms: z.number().int().min(20).max(2000).optional().describe('GIF output only; rounded to 10 ms.'),
  svg_model: z.string().min(1).optional()
    .describe('SVG output only: the OpenAI text model that writes the SVG, such as gpt-6-astra. Required when the account has SVG author selection enabled.'),
  thinking_level: z.enum(['minimal', 'medium', 'high']).optional(),
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
  markup: z.string().optional().describe('OpenAI edit markup: transparent PNG annotation layer, matching the first reference dimensions.'),
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
  if (request.markup && (!model.markup || operation !== 'edit')) {
    throw new ImageError('MARKUP_UNSUPPORTED', 'Markup is supported for OpenAI GPT Image 2.5 and 2.6 edits only.');
  }
  if (request.markup && request.mask) {
    throw new ImageError('MARKUP_WITH_MASK', 'Use either a markup layer or a mask, not both.');
  }
  checkOptions(request, model);
  return request;
}
