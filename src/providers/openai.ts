import { z } from 'zod';
import { basename } from 'node:path';
import type { ProviderAdapter } from '../contracts.ts';
import type { Config } from '../config.ts';
import { Http, jsonBody } from '../http.ts';
import { ImageError } from '../errors.ts';
import { numericUsage } from './usage.ts';

const responseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
  usage: z.record(z.string(), z.unknown()).optional(),
});

export function openaiAdapter(config: Config, http: Http): ProviderAdapter {
  return {
    async submit({ request, references, mask }, context) {
      const fields = { model: request.model, prompt: request.prompt, n: request.count, ...request.options };
      const headers: Record<string, string> = { Authorization: `Bearer ${config.key('openai')}` };
      let init: RequestInit;
      if (references.length) {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
        for (const image of references) {
          form.append('image[]', new Blob([new Uint8Array(image.bytes)], { type: image.mime }), basename(image.path));
        }
        if (mask) form.set('mask', new Blob([new Uint8Array(mask.bytes)], { type: mask.mime }), basename(mask.path));
        init = { method: 'POST', body: form };
      } else {
        headers['Content-Type'] = 'application/json';
        init = jsonBody(fields);
      }
      const raw = await http.json(`https://api.openai.com/v1/images/${references.length ? 'edits' : 'generations'}`,
        { ...init, headers, signal: context.signal }, true);
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) throw new ImageError('NO_IMAGE', 'OpenAI returned no usable image result. The request was not resubmitted.');
      return { images: parsed.data.data.map(image => ({ base64: image.b64_json })), usage: numericUsage(parsed.data.usage) };
    },
  };
}
