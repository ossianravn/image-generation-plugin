import { z } from 'zod';
import { basename } from 'node:path';
import type { InputImage, ProviderAdapter } from '../contracts.ts';
import type { Config } from '../config.ts';
import { Http, jsonBody } from '../http.ts';
import { ImageError } from '../errors.ts';
import { numericUsage } from './usage.ts';

const responseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
  usage: z.record(z.string(), z.unknown()).optional(),
  // SVG output bills the authoring text model separately from the reference image.
  svg_usage: z.record(z.string(), z.unknown()).optional(),
});

const file = (image: InputImage) => new Blob([new Uint8Array(image.bytes)], { type: image.mime });

export function openaiAdapter(config: Config, http: Http): ProviderAdapter {
  return {
    async submit({ request, references, mask, markup }, context) {
      const { svg_model, ...options } = request.options;
      const fields = { model: request.model, prompt: request.prompt, n: request.count, ...options,
        ...(svg_model ? { svg: { model: svg_model } } : {}) };
      const headers: Record<string, string> = { Authorization: `Bearer ${config.key('openai')}` };
      let init: RequestInit;
      if (references.length) {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
        for (const image of references) form.append('image[]', file(image), basename(image.path));
        if (mask) form.set('mask', file(mask), basename(mask.path));
        if (markup) form.set('markup', file(markup), basename(markup.path));
        init = { method: 'POST', body: form };
      } else {
        headers['Content-Type'] = 'application/json';
        init = jsonBody(fields);
      }
      // GIF and SVG are generation-only; request validation keeps them off the edits route.
      const raw = await http.json(`https://api.openai.com/v1/images/${references.length ? 'edits' : 'generations'}`,
        { ...init, headers, signal: context.signal }, true).catch((error: unknown) => {
        // Accounts with SVG author selection enabled must name the author model; others must not.
        if (error instanceof ImageError && error.param === 'svg.model') {
          throw new ImageError('SVG_MODEL_REQUIRED', 'This OpenAI account needs options.svg_model, the text model that writes the SVG, such as gpt-6-astra.');
        }
        throw error;
      });
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) throw new ImageError('NO_IMAGE', 'OpenAI returned no usable image result. The request was not resubmitted.');
      const { usage, svg_usage } = parsed.data;
      return { images: parsed.data.data.map(image => ({ base64: image.b64_json })),
        usage: numericUsage(svg_usage ? { ...usage, svg_usage } : usage) };
    },
  };
}
