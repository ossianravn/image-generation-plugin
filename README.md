# Image Generation Plugin

**Create and edit images without leaving your coding agent.**

Turn a description into a project asset, use reference images to guide the result, and refine it in the same conversation. Works with **Codex, Claude Code, and OpenCode v2**, using your own OpenAI, Google Gemini, Replicate, or OpenRouter API keys.

- **Create assets where you need them:** illustrations, product images, backgrounds, icons, and other raster artwork saved directly into your project.
- **Keep working from the result:** edit a saved image or combine multiple references.
- **Choose your model:** 11 curated models across four providers, with recorded generation, reference, and editing tests.
- **Configure keys once:** a shared OS credential store makes the same keys available to this plugin across clients.

## Table of contents

[Install](#install) · [Connect providers](#connect-your-providers) · [Create your first image](#create-your-first-image) · [Models](#supported-models) · [Privacy and costs](#privacy-and-costs) · [Troubleshooting](#troubleshooting) · [Development](#development)

## Install

You need **Node.js 24 or newer with npm**, **Git**, and one of the clients below. Check `node --version` and `npm --version` in your terminal before starting. The repository is currently private, so your Git credentials must have access to it.

Choose your client. These commands install directly from GitHub; you do not need to clone or build the project manually.

### Codex

Run in your terminal:

```sh
codex plugin marketplace add ossianravn/image-generation-plugin
codex plugin add image-generation@image-generation
```

Open a new Codex chat. In the desktop app, check that **Image Generation** is installed and enabled in Plugins. If your CLI does not have `plugin add`, update Codex or install Image Generation from the registered marketplace in the app.

Continue with [provider setup](#connect-your-providers).

### Claude Code

Run in your terminal:

```sh
claude plugin marketplace add ossianravn/image-generation-plugin
claude plugin install image-generation@image-generation
```

Start a new Claude Code session. You can also use `/plugin marketplace add` and `/plugin install` inside Claude Code. The plugin includes both its image tools and its workflow skill.

Continue with [provider setup](#connect-your-providers).

### OpenCode v2

Run in your terminal:

```sh
opencode plugin add github:ossianravn/image-generation-plugin
```

Open or reload OpenCode in your project. The native adapter registers the image tools and shared skill automatically. Check the connection with:

```sh
opencode mcp list
```

Look for `image-generation  connected`. Continue with [provider setup](#connect-your-providers). OpenCode v1 is not supported by this adapter.

### What happens on first launch?

The plugin installs the exact runtime dependencies recorded in its lockfile into a local cache. This needs npm network access and can make the first connection slower. Later launches reuse the cache; plugin updates prepare a new runtime when its contents change. Provider keys stay in the OS credential store.

The portable package follows [Agent Plugins 1.0](https://agent-plugins.org/specification). Client-specific installation uses [Codex marketplaces](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli), [Claude marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), and [OpenCode Git package plugins](https://opencode.ai/v2/docs/plugins/#manage).

## Connect your providers

You need an API key and available API credits for **at least one** provider. Your coding-agent subscription does not supply image API credits.

1. Create a key for the provider you want to use.
2. Ask your agent: **“Set up my image generation providers.”**
3. Run the setup command it provides in your own terminal. Select providers with Space, press Enter, and enter the keys into the masked prompts.
4. Tell the agent setup is complete. It can refresh credential status immediately.

| Provider | Get an API key | Models available through this plugin |
| --- | --- | --- |
| OpenAI | [OpenAI Platform](https://platform.openai.com/api-keys) | GPT Image |
| Google Gemini | [Google AI Studio](https://aistudio.google.com/apikey) | Nano Banana |
| Replicate | [Replicate API tokens](https://replicate.com/account/api-tokens) | FLUX |
| OpenRouter | [OpenRouter keys](https://openrouter.ai/settings/keys) | Seedream, MAI, Grok, Qwen, Muse |

You can also start setup directly, without an agent:

```sh
npx --yes --package=git+https://github.com/ossianravn/image-generation-plugin.git image-generation setup
```

Keys are saved in Windows Credential Manager, macOS Keychain, or Linux Secret Service. Configure them once for the same OS user and computer, even if you use multiple clients. Paste keys only into the masked terminal prompts.

Run setup again to add or update providers. A presence check confirms that a key is configured; the provider still determines whether your account can use a model. See [advanced setup](docs/setup.md#environment-and-file-overrides) for environment variables, private credential files, and headless machines.

## Create your first image

Ask your agent in natural language. Include the destination, the subject, and any important visual requirements:

> Use Image Generation with OpenAI to create a square illustration of a red ceramic mug on a pale blue background. Save it in this project's assets folder and show me the result.

For a reference-guided image, attach images or provide their local paths:

> Use these two references with Nano Banana Pro: keep the product from the first image and use the setting from the second. Save the composition in assets/product.

For a follow-up edit:

> Edit the image you just created. Make the mug dark green, preserve the white emblem and composition, and save a new version.

The agent selects a compatible route, sends the request, saves the original output, and returns its file path and a preview where the client supports it. You can keep editing the result by referring to it in the conversation.

**You control the provider and model.** If a requested option is unsupported, the agent can explain the available choices. The plugin does not silently switch providers or submit another paid generation after an uncertain outcome.

## Supported models

| Provider | Curated models |
| --- | --- |
| OpenAI | GPT Image 2.5 Flare, GPT Image 2.5 Sunburst |
| Google Gemini | Nano Banana 2, Nano Banana Pro |
| Replicate | FLUX 3 Image |
| OpenRouter | Seedream 5.0 Pro, MAI-Image-2.6, Grok Imagine Image 2.0, Qwen Image 3, Qwen Image 3 Pro, Muse Image |

All 11 models completed text generation, composition using two references, and a subsequent edit in the **3 October 2026** live validation run. Those 33 outputs were saved, decoded, checked, and visually reviewed. Available sizes, formats, masks, transparency, and reference limits vary by model; the core workflow tests do not cover every option.

Ask **“Which image models can I use?”** to see your configured providers and the catalogue. See the [tested model catalogue](docs/model-catalogue.md) for exact model IDs, controls, and evidence.

## Privacy and costs

- **You pay the selected provider.** Generating and editing images use your API credits. Installing the plugin, checking local credentials, and inspecting a local image do not generate images.
- **Requests go to that provider.** Prompts and reference images are uploaded when you generate or edit. Provider retention policies and account settings apply.
- **Original files stay in your project.** Results have unique filenames; editing creates a new asset.
- **Keys use OS storage.** Environment and explicitly selected credential files can override saved keys. Plaintext files remain an optional development or headless configuration.
- **Jobs can be recovered.** Local metadata tracks existing actions so a disconnect does not automatically cause another paid submission. It omits original prompts and copies of input references. Pending results may be retained until they are saved.

Gemini requests use `store=false`, and FLUX web grounding defaults off. See [data and recovery details](docs/setup.md#recovery-and-cancellation).

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Repository not found or permission denied | Confirm your Git credentials have access to this private repository. |
| `node` or `npm` not found | Install Node.js 24+ with npm, then reopen the client so it sees the updated PATH. |
| Server still starting on first use | Allow dependency setup to finish. If the client times out, reconnect the MCP server; setup is safe to retry. |
| No provider configured | Ask the agent to run `credential_status`, then use its terminal setup command. |
| A saved key is not being used | Check `credential_status`: environment variables and explicit credential files take precedence. |
| OS credential store unavailable | Unlock the OS store. Linux needs a running Secret Service such as GNOME Keyring or KWallet; use an explicit environment/file override for headless use. |
| Provider rejects a request | Check the key's account access, API credits, and the selected model's supported options. |
| Connection lost during generation | Ask the agent to retrieve the existing job before requesting another generation. |
| Preview is unavailable | Open the returned file path. Preview rendering depends on the client. |

For credential rotation/removal, direct MCP configuration, updates, and uninstall behavior, see the [setup guide](docs/setup.md).

## Compatibility and status

**v0.2.0 is an early release**, developed against Codex CLI 0.160.0, Claude Code 2.1.288, OpenCode 2.0.18, and Node 24.19.0.

The runtime has Windows validation, real MCP subprocess checks, a Windows credential-store check, and recorded live provider workflows. Native macOS Keychain/Linux Secret Service access and image rendering in fresh interactive client sessions still need acceptance testing. See the [validation report](docs/validation.md) for the exact boundaries of the evidence.

The repository is private, the package is not published to npm, and a license has not yet been assigned.

## Development

For contributors or a local checkout:

```sh
git clone https://github.com/ossianravn/image-generation-plugin.git
cd image-generation-plugin
npm ci
npm run build
node dist/cli.js setup
npm run typecheck
npm test
npm run validate
```

`npm run dev -- models` explicitly loads the ignored `.env.local` for development. Normal installed launches do not search your project for dotenv files.

| Command | Purpose |
| --- | --- |
| `npm run test:install` | Test a source-only install with real dependency setup and modern/legacy MCP connections; requires npm network access. |
| `npm run test:credentials:os` | Exercise the real OS store using an isolated synthetic credential, then delete it. |
| `npm run package` | Build portable and Claude bundles with dependencies for the current OS and architecture. |
| `npm run test:live -- --model MODEL_ID --run UNIQUE_RUN_NAME` | Run paid generation, reference, and editing checks using `.env.local`. |

The shared MCP service exposes `credential_status`, `list_models`, `get_model`, `generate_image`, `edit_image`, `get_job`, `cancel_job`, and `inspect_image`. The client adapters reuse that service and the same Agent Skill.

[Setup guide](docs/setup.md) · [Model catalogue](docs/model-catalogue.md) · [Validation](docs/validation.md) · [Architecture](docs/implementation-plan.md) · [Dated research](docs/research-2026-10-03.md)
