# Validation report

**Date:** 3 October 2026. **Release:** 0.2.0 development build; provider workflow evidence was collected on 0.1.0. **Machine:** Windows x64, Node 24.19.0, npm 11.17.0.

## Shared credential setup

Version 0.2.0 adds masked terminal setup and one OS credential store shared across hosts. Five new tests cover credential precedence, refresh and removal while the image service is running, setup persistence, cancellation after a partial save, and sanitized store errors. These tests use a fake credential store and mocked generation. The existing real MCP subprocess checks now exercise `credential_status` with synthetic environment keys and verify they are absent from results.

`npm run test:credentials:os` passed against Windows Credential Manager: a synthetic entry in an isolated service was saved, retrieved in a separate process, and removed. No provider keys were copied into that test. The first native probe exposed `null` for a missing entry despite the library's async declaration promising `undefined`; normalization in the store adapter fixed the mismatch and the repeat passed.

A real Windows terminal check confirmed masked input and clean Ctrl+C cancellation before saving. A non-interactive setup invocation returned the intended `SETUP_TERMINAL` error. Setup does not authenticate with providers or spend image credits. macOS Keychain and Linux Secret Service behavior remain unverified on native machines.

## Live provider workflows

The plugin completed 33 workflows: generation, two-reference composition, and a subsequent edit for each of 11 catalogue models across four providers. Output decoding, dimensions, hashes, and local file existence were verified. All 33 images were visually inspected using contact sheets. The requested subjects and color edit were present, with normal generative variation in texture and geometry. See the [catalogue](model-catalogue.md) and [operation records](live-validation.json).

The evidence records model aliases and provider identity rather than implying immutable model versions. Replicate exposed its version as `hidden`. Usage is retained where returned; no complete cross-provider dollar total is inferred from token counts.

Initial live attempts uncovered and corrected three contract differences:

- Stable Gemini v1 requires a `user_input` envelope and `models/` identifiers; the live image endpoint rejects the optional `delivery` field. Both Gemini models passed after those corrections.
- Replicate returns nullable version fields and mixed-type prediction metrics. The adapter now checkpoints the prediction ID before parsing optional result metadata. One already-completed FLUX prediction was matched to its local action and recovered without resubmitting generation.
- Muse works on OpenRouter's Image API despite empty endpoint discovery. Its explicit curated descriptor is dated and separately identified in capability responses.

The original all-model runner reported a nonzero exit because it retained the earlier failures, including Gemini attempts made before the fixes. The final evidence was reconciled from durable completed jobs and original image hashes. It does not erase those earlier failures or count failed requests as passes. Concurrent runner reports now use separate per-model filenames; durable jobs are the evidence source.

## Automated and package checks

Direct GitHub packaging was added with the README update. Two cache tests exercise concurrent installation, cache reuse, source updates, private-file exclusion, and failed-runtime cleanup using a dependency-free fixture. `npm run test:install` separately passed real production dependency installation and modern/legacy MCP calls from a source-only copy with no `dist` or `node_modules`. A package dry run confirms the launcher, source, adapter, and `npm-shrinkwrap.json` are included.

The README's GitHub installation commands were exercised with isolated client profiles on Windows. Codex and Claude installed commit `0af94f8`; OpenCode and npm installed the subsequent packaging fix at `629e20f`.

| GitHub installation path | Observed result |
| --- | --- |
| Codex CLI 0.160.0 marketplace add and plugin add | Installed; both modern and legacy MCP subprocess checks passed against the installed launcher |
| Claude Code 2.1.288 marketplace add and plugin install | Installed; both modern and legacy MCP subprocess checks passed against the installed launcher |
| OpenCode 2.0.18 plugin add | Installed Git package; adapter active, shared skill discovered, and MCP connected with all eight tools |
| Standalone `npx --package=git+https://github.com/ossianravn/image-generation-plugin.git` | Installed, prepared the runtime cache, and displayed CLI help successfully |

The first Git package attempts failed during npm's dependency preparation: a script named `build` triggered an unnecessary nested development install, which npm 11.17.0 rejected with `EALLOWSCRIPTS`. Renaming the contributor command to `build:runtime` removed that preparation path; the direct GitHub commands then passed. An isolated OpenCode service initially collided with the existing service port; assigning the test profile its own port resolved the harness conflict. No provider requests or real credential changes were made by these installation checks.

OpenCode 2.0.18 loaded the native adapter from a local package directory, reported it active, discovered the shared skill, and connected its MCP service. Its local directory loader required a root `index.js` entry; pointing directly at the `.mjs` adapter did not load it. Both the native Claude manifest and repository marketplace passed strict validation.

The local check suite covers strict TypeScript checking, portable manifest/MCP schemas, Agent Skill frontmatter, and the 300-physical-line limit for source, scripts, and tests. Behavioral tests use mocked provider HTTP for wire contracts and error handling, real SQLite and files for lifecycle behavior, and real subprocess stdio connections for MCP.

The subprocess smoke checks exercise both legacy MCP and the 2026-07-28 protocol through SDK 2.3.0, including tool discovery, native image content, and error results. This proves protocol behavior at that boundary, not every host's visual rendering.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 19 tests passed, none skipped |
| `npm run validate` | Portable schemas, version metadata, built entry, skill frontmatter, and code line limits passed |
| Agent Skill `quick_validate.py` with isolated PyYAML | Passed |
| Documentation quality check | Six updated Markdown files checked; no outstanding issues |
| `npm run package` | 0.2.0 portable and Claude Windows x64 packages built with production dependencies |
| MCP smoke tests from both 0.2.0 release folders | Four checks passed: modern and legacy for each layout, including credential status |
| Claude Code 2.1.288 `plugin validate --strict --json` | Passed, zero errors or warnings |
| OpenCode 2.0.18 native MCP status (0.1.0) | Packaged server connected with the v2 recipe |
| OpenCode 2.0.18 skill discovery (0.1.0) | Shared image-generation skill found through the configured path |
| Release file audit (0.1.0) | 2,176 files checked; no local key values, private credential files, live images, or job databases |

The initial Claude strict check reported missing author attribution; adding the repository owner's author metadata resolved it. OpenCode's public configuration schema still describes a shape inconsistent with its v2 MCP documentation. Full-schema validation consequently failed, including after resolving its remote schema dependency. The actual v2 host accepted `mcp.servers`, connected, and discovered the skill. This is an upstream schema discrepancy, not a passing schema check. Early one-shot OpenCode API probes returned an empty catalogue before location startup; the persistent host and explicitly scoped location confirmed the connection and skill.

## Remaining release acceptance

- Codex desktop plugin installation, skill activation, inline image display, and file navigation have not been exercised end to end in a fresh user session.
- Claude package validation is separate from an interactive Claude session rendering an image and using the skill.
- OpenCode v2 MCP connection and skill discovery passed. Interactive tool use and image rendering in the user interface remain to be exercised.
- The Windows/macOS/Linux [CI matrix passed for 0.2.0, including the Git packaging fix](https://github.com/ossianravn/image-generation-plugin/actions/runs/37150814856), covering dependency installation, type checking, 19 automated tests, and validation. Direct GitHub client installation and generated dependency packages were exercised on Windows x64. Prebuilt packages must be built for their target OS and architecture.
- Masks, transparency, all optional controls, maximum references, and multi-output batches are not comprehensively live-tested. Core workflow evidence must not be read as exhaustive parameter coverage.
- Shared OS credential setup has native Windows evidence. macOS/Linux credential access, host sandbox permissions, and a fresh installed-user onboarding journey in each host still need acceptance testing.
- Public release, npm publication, and license assignment remain pending.
