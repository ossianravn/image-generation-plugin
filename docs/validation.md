# Validation report

**Date:** 3 October 2026. **Release:** 0.1.0 development build. **Machine:** Windows x64, Node 24.19.0, npm 11.17.0.

## Live provider workflows

The plugin completed 33 workflows: generation, two-reference composition, and a subsequent edit for each of 11 catalogue models across four providers. Output decoding, dimensions, hashes, and local file existence were verified. All 33 images were visually inspected using contact sheets. The requested subjects and color edit were present, with normal generative variation in texture and geometry. See the [catalogue](model-catalogue.md) and [operation records](live-validation.json).

The evidence records model aliases and provider identity rather than implying immutable model versions. Replicate exposed its version as `hidden`. Usage is retained where returned; no complete cross-provider dollar total is inferred from token counts.

Initial live attempts uncovered and corrected three contract differences:

- Stable Gemini v1 requires a `user_input` envelope and `models/` identifiers; the live image endpoint rejects the optional `delivery` field. Both Gemini models passed after those corrections.
- Replicate returns nullable version fields and mixed-type prediction metrics. The adapter now checkpoints the prediction ID before parsing optional result metadata. One already-completed FLUX prediction was matched to its local action and recovered without resubmitting generation.
- Muse works on OpenRouter's Image API despite empty endpoint discovery. Its explicit curated descriptor is dated and separately identified in capability responses.

The original all-model runner reported a nonzero exit because it retained the earlier failures, including Gemini attempts made before the fixes. The final evidence was reconciled from durable completed jobs and original image hashes. It does not erase those earlier failures or count failed requests as passes. Concurrent runner reports now use separate per-model filenames; durable jobs are the evidence source.

## Automated and package checks

The local check suite covers strict TypeScript checking, portable manifest/MCP schemas, Agent Skill frontmatter, and the 300-physical-line limit for source, scripts, and tests. Behavioral tests use mocked provider HTTP for wire contracts and error handling, real SQLite and files for lifecycle behavior, and real subprocess stdio connections for MCP.

The subprocess smoke checks exercise both legacy MCP and the 2026-07-28 protocol through SDK 2.3.0, including tool discovery, native image content, and error results. This proves protocol behavior at that boundary, not every host's visual rendering.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 12 tests passed, none skipped |
| `npm run validate` | Portable schemas, version metadata, built entry, skill frontmatter, and code line limits passed |
| Agent Skill `quick_validate.py` with isolated PyYAML | Passed |
| Documentation quality check | Zero issues across seven Markdown files |
| `npm run package` | Portable and Claude Windows x64 packages built with production dependencies |
| MCP smoke tests from both release folders | Four checks passed: modern and legacy for each layout |
| Claude Code 2.1.288 `plugin validate --strict --json` | Passed, zero errors or warnings |
| OpenCode 2.0.18 native MCP status | Packaged server connected with the v2 recipe |
| OpenCode 2.0.18 skill discovery | Shared image-generation skill found through the configured path |
| Release file audit | 2,176 files checked; no local key values, private credential files, live images, or job databases |

The initial Claude strict check reported missing author attribution; adding the repository owner's author metadata resolved it. OpenCode's public configuration schema still describes a shape inconsistent with its v2 MCP documentation. Full-schema validation consequently failed, including after resolving its remote schema dependency. The actual v2 host accepted `mcp.servers`, connected, and discovered the skill. This is an upstream schema discrepancy, not a passing schema check. Early one-shot OpenCode API probes returned an empty catalogue before location startup; the persistent host and explicitly scoped location confirmed the connection and skill.

## Remaining release acceptance

- Codex desktop plugin installation, skill activation, inline image display, and file navigation have not been exercised end to end in a fresh user session.
- Claude package validation is separate from an interactive Claude session rendering an image and using the skill.
- OpenCode v2 MCP connection and skill discovery passed. Interactive tool use and image rendering in the user interface remain to be exercised.
- Local runtime tests and generated dependency packages were run on Windows x64. The Windows/macOS/Linux CI matrix is configured but has not run on GitHub. Packages must be built for their target OS and architecture.
- Masks, transparency, all optional controls, maximum references, and multi-output batches are not comprehensively live-tested. Core workflow evidence must not be read as exhaustive parameter coverage.
- Credentials are supported through explicit environment files or host environments. There is no OS keychain integration or credential-entry wizard in this release.
- Public release, npm publication, and license assignment remain pending.
