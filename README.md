# Image Generation Plugin

A local image generation and editing plugin for coding agents. Bring your own API keys for OpenAI, Google Gemini, Replicate, and OpenRouter.

**Status:** working v0.1.0 development release, checked on 3 October 2026. Includes a stdio MCP server, CLI, shared Agent Skill, portable Agent Plugins 1.0 package, and generated Claude Code package. OpenCode v2 connects through MCP and the shared skill.

Generate from text, compose from multiple references, or edit a saved result. Original images are saved to an explicit project directory and returned with durable artifact IDs and native MCP previews. Provider capabilities and dated workflow evidence are available through model discovery.

- [Install, configure providers, and use the plugin](docs/setup.md)
- [Model catalogue and live validation](docs/model-catalogue.md)
- [Validation results and limits](docs/validation.md)
- [Architecture and approved implementation plan](docs/implementation-plan.md)
- [Standards and provider research, checked 3 October 2026](docs/research-2026-10-03.md)
- [GitHub repository](https://github.com/ossianravn/image-generation-plugin)

## Quick start

Requires Node.js 24 or newer.

```sh
npm ci
npm run build
node dist/cli.js doctor --env-file /absolute/path/to/credentials.env
node dist/cli.js host-config --host opencode --env-file /absolute/path/to/credentials.env
```

Use the blank variable names from [`.env.example`](.env.example). `doctor` checks key presence; it does not send a provider request. For checkout development, `npm run dev -- models` explicitly loads the ignored `.env.local`.

Generate host packages with `npm run package`. The release directory includes portable and Claude layouts with production dependencies. Follow the [host-specific setup](docs/setup.md#connect-an-agent-host) before enabling the plugin. Packages are specific to their build OS and architecture because they include Sharp.

## Models and tools

The curated catalogue includes GPT Image 2.5 Flare/Sunburst, Nano Banana 2/Pro, FLUX 3 Image, Seedream 5.0 Pro, MAI-Image-2.6, Grok Imagine Image 2.0, Qwen Image 3/Pro, and Muse Image. Each provider route is explicit; a model appearing on another aggregator is not automatically covered.

The MCP tools are `list_models`, `get_model`, `generate_image`, `edit_image`, `get_job`, `cancel_job`, and `inspect_image`. Inputs use absolute local paths or previously returned artifact IDs. Remote reference URLs and arbitrary untested model IDs are outside this release's contract.

Requests use stable action IDs to prevent duplicate paid submissions. Unknown paid outcomes are not resubmitted automatically, and requested models/providers are not silently substituted. Gemini uses `store=false`; FLUX web grounding defaults off. Local job records omit prompts and copied input references. See [data and recovery behavior](docs/setup.md#recovery-and-cancellation).

## Development

```sh
npm run typecheck
npm test
npm run validate
```

Tests cover provider contracts with mocked HTTP, durable job recovery and concurrency, and real subprocess MCP connections using modern and legacy protocols. Authorized live model workflows are recorded separately in [live-validation.json](docs/live-validation.json).

`npm run test:live -- --model MODEL_ID --run UNIQUE_RUN_NAME` makes paid requests using `.env.local`. A run performs generation, two-reference composition, and a subsequent edit. Reuse a run name only to recover the same actions. `node scripts/record-evidence.ts` verifies output checksums and updates catalogue evidence without making provider requests.

The package is private and has not been published. License selection, public distribution, and the remaining host/OS acceptance checks are recorded in [validation](docs/validation.md).
