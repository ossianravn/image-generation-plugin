# Tested model catalogue

**Checked:** 3 October 2026. **Plugin:** 0.1.0. **Scope:** one primary provider route per model.

All 11 models completed the same three-stage live journey: text generation, composition from two references, and an edit of the resulting image. Every output was decoded, saved locally, and checked against its recorded SHA-256. The 33 resulting images were visually reviewed. Full operation records are in [live-validation.json](live-validation.json); testing limits and host evidence are in [validation.md](validation.md).

## Primary routes

| Model | Provider and API | Generation / two references / edit | Documented reference limit |
| --- | --- | --- | --- |
| GPT Image 2.5 Flare | OpenAI Images | Passed / passed / passed | 16 |
| GPT Image 2.5 Sunburst | OpenAI Images | Passed / passed / passed | 16 |
| Nano Banana 2 (`gemini-3.1-flash-image`) | Gemini stable v1 Interactions | Passed / passed / passed | 14 |
| Nano Banana Pro (`gemini-3-pro-image`) | Gemini stable v1 Interactions | Passed / passed / passed | 14 |
| FLUX 3 Image | Replicate Predictions | Passed / passed / passed | 10 |
| Seedream 5.0 Pro | OpenRouter Images | Passed / passed / passed | 14 |
| MAI-Image-2.6 | OpenRouter Images | Passed / passed / passed | 5 |
| Grok Imagine Image 2.0 | OpenRouter Images | Passed / passed / passed | 3 |
| Qwen Image 3 | OpenRouter Images | Passed / passed / passed | 4 |
| Qwen Image 3 Pro | OpenRouter Images | Passed / passed / passed | 4 |
| Muse Image | OpenRouter Images, Meta route | Passed / passed / passed | Unknown; two exercised |

Sources for direct routes: [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation), [Gemini image guide](https://ai.google.dev/gemini-api/docs/image-generation), [stable Interactions reference](https://ai.google.dev/api/interactions-api-v1), and [FLUX 3 model schema](https://replicate.com/black-forest-labs/flux-3-image). Aggregator controls come from [OpenRouter's Image API and endpoint discovery](https://openrouter.ai/docs/guides/overview/multimodal/image-generation).

The listed maximums are capability metadata, not maximum-count live tests. The live run used one output per call and two reference inputs at the composition stage. Tests used low-quality 1024-square OpenAI output, 1K square Gemini output, FLUX 1k with grounding off, and supported 1K/aspect controls on OpenRouter. Muse used its defaults and returned 1920×1280 WebP. FLUX returned 880×1184 WebP; other selected routes returned 1024×1024 images.

## Visual observations

Each journey generated a red mug with a white circular emblem, combined that mug with a separate yellow-cube reference on a blue tabletop, and changed the mug to blue. All 11 final edits visibly changed the mug color while retaining the emblem, cube, and broad composition. These are qualitative sample observations, not pixel-identity guarantees or a model ranking.

Gemini Flash added a small landscape motif inside its circular emblem and carried it through the edits. Some models adjusted proportions, highlights, texture, or framing across steps. A real asset still needs creative review against its intended use.

## Muse route investigation

Muse's dedicated endpoint-discovery response was empty, while its model page described editing and references. A chat-completions probe returned a route error directing callers to the Image API. Direct `POST /api/v1/images` then succeeded for generation, two references, and editing with the Meta provider pinned.

The adapter therefore contains a dated, explicit Muse endpoint descriptor used only when its discovery array is empty. It exposes no unverified optional controls and leaves the maximum reference count unknown. It does not try another API or provider after a failed submission. Recheck this descriptor when OpenRouter repairs discovery. [Muse model page](https://openrouter.ai/meta/muse-image), [dedicated discovery endpoint](https://openrouter.ai/api/v1/images/models/meta/muse-image/endpoints).

## What the evidence establishes

`list_models` and `get_model` expose documented controls separately from `live_validation`: the plugin version, date, completed workflows, and number of references exercised. Metadata discovery cannot promote a route to live-tested. The runtime preserves provider identity and reported version/usage; Replicate returned `hidden` as its executed version, so no immutable FLUX version is claimed.

Masks, transparent backgrounds, alternate compression/formats, batch counts, seeds, grounding, and maximum resolutions are not exhaustively live-tested. Current descriptors expose only supported control names; OpenRouter also checks requested values against the selected endpoint before submission. Additional models or secondary routes for the same model need their own validation journey.

## Maintenance

Run `npm run test:live -- --model MODEL_ID --run UNIQUE_RUN_NAME` only when a paid validation run is intended. Reusing a run ID retrieves the same durable actions. Run `node scripts/record-evidence.ts` afterward to reconcile completed jobs and verify original bytes; this command never calls a provider. `node scripts/review-sheets.mjs` builds local contact sheets for visual inspection.

The supplied [portrait benchmark](https://openrouter.ai/benchmarks/media/images/portraits?variant=studio-headshot) helped identify model families. It was not used as evidence of this plugin's compatibility. Recheck account access and official API requirements before a release; the recorded success is dated, not a promise of future availability.
