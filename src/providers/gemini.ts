import { z } from 'zod';
import type { ProviderAdapter } from '../contracts.ts';
import type { Config } from '../config.ts';
import { Http, jsonBody } from '../http.ts';
import { ImageError } from '../errors.ts';
import { numericUsage } from './usage.ts';

const responseSchema = z.object({
  id: z.string().optional(), status: z.string().optional(),
  steps: z.array(z.object({
    type: z.string(), content: z.array(z.object({ type: z.string(), data: z.string().optional() })).optional(),
  })),
  usage: z.record(z.string(), z.unknown()).optional(),
});

export function geminiAdapter(config: Config, http: Http): ProviderAdapter {
  return {
    async submit({ request, references }, context) {
      const raw = await http.json('https://generativelanguage.googleapis.com/v1/interactions', {
        ...jsonBody({
          model: `models/${request.model}`, store: false,
          input: [{ type: 'user_input', content: [
            { type: 'text', text: request.prompt },
            ...references.map(image => ({ type: 'image', mime_type: image.mime, data: image.bytes.toString('base64') })),
          ] }],
          response_format: { type: 'image', aspect_ratio: request.options.aspect_ratio,
            image_size: request.options.resolution },
        }),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.key('gemini') },
        signal: context.signal,
      }, true);
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) throw new ImageError('INVALID_RESPONSE', 'Gemini returned an unrecognized interaction response.');
      const images = parsed.data.steps.filter(step => step.type === 'model_output')
        .flatMap(step => step.content ?? [])
        .filter(part => part.type === 'image' && part.data)
        .map(part => ({ base64: part.data! }));
      if (!images.length) throw new ImageError('NO_IMAGE', 'Gemini completed without a final output image. Check the prompt and model access.');
      return { images, request_id: parsed.data.id, usage: numericUsage(parsed.data.usage) };
    },
  };
}
