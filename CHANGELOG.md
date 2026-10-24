# Change Log

All notable changes to the "github-copilot-api-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [2.15.3] - 2026-10-24

### Changed
- **Dependencies:** `eslint` 10.12.0→10.13.0, `typescript-eslint` 8.71.0→8.71.2, `@types/node` 26.6.4→26.6.5, `@types/ws` 8.18.1→8.18.2, `@modelcontextprotocol/sdk` 1.32.0→1.32.1, `@microsoft/applicationinsights-web` 3.4.4→3.4.5, `@microsoft/applicationinsights-common` 3.4.4→3.4.5, `@microsoft/applicationinsights-core-js` 3.4.4→3.4.5.

---

## [2.15.2] - 2026-10-10

### Fixed
- **Tool call ID mismatch in non-streaming completions:** `invokeCopilotWithTools` now preserves the original `LanguageModelToolCallPart.callId` instead of discarding it. `processChatCompletion` reuses that ID for `assistant.tool_calls[].id`, the tool result `tool_call_id` (both success and error paths), and external tool calls returned to the client. Previously each was assigned an independent random UUID, causing the upstream model to return HTTP 400 `No tool output found for function call <id>` on the follow-up turn. ([#183](https://github.com/suhaibbinyounis/github-copilot-api-vscode/issues/183))

### Changed
- **Dependencies:** `lint-staged` 17.5.1→17.6.0, `ws` 8.21.3→8.22.0, `typescript-eslint` 8.70.0→8.71.0, `@modelcontextprotocol/sdk` 1.30.0→1.32.0, `eslint` 10.11.0→10.12.0, `@types/node` 26.6.2→26.6.4.

---

## [2.15.1] - 2026-09-27

### Fixed
- **Structured tool-call history in OpenAI flows:** Assistant messages with `tool_calls` are now serialized as `LanguageModelToolCallPart` parts instead of plain text (`[Called function: ...]`). Tool result messages are serialized as `LanguageModelToolResultPart` preserving the original `tool_call_id` linkage. This prevents long-context conversations from biasing the model toward textual tool-call imitation. Applies to both streaming and non-streaming code paths. ([#171](https://github.com/suhaibbinyounis/github-copilot-api-vscode/issues/171))

### Changed
- **Dependencies:** `typescript-eslint` 8.61.1→8.70.0, `@modelcontextprotocol/sdk` 1.29.0→1.30.0, `cloudflared` 0.7.1→0.7.3, `eslint` 10.5.0→10.11.0, `@types/node` 26.5.1→26.6.2.

---

## [2.15.0] - 2026-09-12

### Added
- **Cursor compatibility:** Model resolution now understands `cursor/`, `cursor-`, `copilot-`, and `openai/` prefixed model names — requests from Cursor and similar clients automatically resolve to the correct underlying Copilot model.
- **New `src/compatibility.ts` module:** Exports `normalizeModelLookupKey`, `buildCursorCompatibleAlias`, and `flattenOpenAICompatibleMessageContent` as reusable helpers for future API surface work.
- **Richer `/v1/models` response:** Each model entry now includes `aliased_model_id` and a `capabilities` object (`chat_completion`, `text_completion`, `streaming`, `token_counting`).
- **Multimodal content flattening:** Unified content-flattener handles `image`, `tool_use`, `tool_result`, `input_image`, and `image_url` content blocks consistently across all API surfaces.

### Fixed
- **Anthropic tool call history:** Structured `tool_use` / `tool_result` message pairs are now correctly mapped to `LanguageModelToolCallPart` / `LanguageModelToolResultPart` in both streaming and non-streaming `/v1/messages` flows — eliminating dropped tool results in multi-turn Anthropic conversations.
- **Google streaming:** Each content chunk now carries `finishReason: 'STOP'` instead of `null`; removed a spurious empty final chunk that caused some clients to error.

### Changed
- **`/v1/tools/call` now requires both `server` and `name`** (breaking for callers that previously omitted `server` to invoke VSCode built-in tools directly — those calls now return 400).
- `flattenMessageContent` internal method delegates to the shared `flattenOpenAICompatibleMessageContent` helper.

### Removed
- `anthropicToolPairs.ts` — its role is now handled by inline conversion logic in `CopilotApiGateway`.
- `TelemetryService.ts` and associated Application Insights bundling.
- `/v1/responses/` stub endpoints (GET / DELETE) — the gateway remains stateless.

---

## [2.14.0] - 2026-05-18


### Added
- **Comprehensive Telemetry:** Expanded from 7 sparse events to 15 rich telemetry helpers, giving deep observability via Azure Application Insights.
  - **Activation context:** VS Code version, OS platform/arch, Node version, Copilot Chat presence, extension version.
  - **Deactivation summary:** Session duration bucket, total commands and requests served this session.
  - **Server start (extended):** WebSocket enabled, MCP enabled, model family, max concurrency, API key presence, rate-limit presence.
  - **Server stop (extended):** Uptime bucket, total requests, error rate bucket.
  - **Request details (extended):** Endpoint bucket, token-in/out buckets, message-count bucket, streaming flag, tool use flag, system-prompt flag, finish reason.
  - **New `request.error` event:** Per-request error category (auth / rate_limit / timeout / server_error / client_error).
  - **New `rateLimit.hit` event:** Endpoint and limit type when a 429 is returned.
  - **New `model.switched` event:** Old/new model family and trigger source (quickpick / api / config).
  - **New `config.changed` event:** Setting key changed (never the value) and whether a server restart followed.
  - **New `ws.*` events:** WebSocket `connected`, `message` (type only), `disconnected`, `error` lifecycle.
  - **New `uriHandler.invoked` event:** Deep-link path used (`/dashboard`, `/start`, `/stop`).
  - **Performance heartbeat (`perf.heartbeat`):** Fires every 5 minutes while the server is running — heap MB bucket, uptime, RPM, error rate, server state.
  - **All 3 chat commands now tracked:** `openCopilotChat`, `askCopilot`, `askSelectionWithCopilot` — previously had no telemetry.
  - **Shared bucketing utilities:** `durationBucket`, `tokenBucket`, `messageCountBucket`, `uptimeBucket`, `heapMbBucket`, `modelFamily` exported from TelemetryService to eliminate duplicated logic.
  - **`bucketEndpoint()` helper:** Maps raw URL paths to stable, low-cardinality App Insights dimension labels.

### Changed
- `telemetryServerStarted` props extended (`hostBucket`, `enableWebSocket`, `enableMcp`, `modelFamily`, `maxConcurrency`, `hasApiKey`, `hasRateLimit`).
- `telemetryServerStopped` now includes uptime and request-count context.
- `telemetryServerError` and `telemetryTunnelStarted` updated to use structured props objects.

### Dependencies
- `lint-staged` 17.0.2 → 17.0.4
- `typescript-eslint` 8.59.2 → 8.59.3
- `@types/node` 25.6.0 → 25.7.0
- `ws` 8.20.0 → 8.20.1 (security fix: uninitialized memory disclosure in `websocket.close()`)

## [2.10.2] - 2026-03-09

### Fixed
- Release workflow: explicitly package the VSIX before uploading to GitHub Release, ensuring the release page actually contains the artifact.

## [2.10.1] - 2026-03-09

### Fixed
- Release packaging: removed stale `.vsix` files from repository root so published release contains only the current version.

## [2.10.0] - 2026-03-09

### Added
- **Claude Code Full Compatibility:** End-to-end support for Claude Code connecting via the Anthropic Messages API (`/v1/messages`).
- **`x-api-key` Authentication:** Now accepts Anthropic SDK-style `x-api-key` header in addition to `Authorization: Bearer` — required for Claude Code with API key auth enabled.
- **Tool Use in Anthropic Path:** The streaming Anthropic handler now passes tools to the VS Code LM API and emits proper `tool_use` SSE content blocks (`content_block_start` → `input_json_delta` → `content_block_stop`) with `stop_reason: "tool_use"`.
- **`system` Prompt as Array:** Both streaming and non-streaming Anthropic handlers now accept `system` as an array of text blocks (`[{type:"text",text:"..."}]`) per the latest Anthropic SDK spec.
- **`AnthropicContentBlock` Type:** Added explicit TypeScript union type for `text`, `tool_use`, and `tool_result` content blocks.
- **Extended `AnthropicMessageRequest`:** Interface now includes `tools`, `tool_choice`, and array `system` fields.

### Fixed
- **Claude 500 Error — "Unexpected chat message content type llm 2":** Multi-part array message content (`[{type:"text",text:"..."}]`) was incorrectly `JSON.stringify`'d before being passed to the VS Code LM API. Now uses `flattenMessageContent()` across all three conversion paths (`processStreamingChatCompletion`, `invokeCopilotWithTools`, `processStreamingAnthropicMessages`).
- **`tool_result` Content Blocks:** `flattenMessageContent()` now correctly extracts text from `tool_result` blocks in message history, allowing multi-turn tool conversations.
- **`tool_use` Content Blocks:** Conversation history messages containing `tool_use` blocks are now formatted as human-readable summaries instead of silently dropped.
- **CORS Headers:** Added `x-api-key`, `anthropic-version`, and `anthropic-beta` to `Access-Control-Allow-Headers` for full Anthropic SDK CORS compatibility.

## [2.9.0] - 2026-02-20

### Added
- **Modern Dashboard UI:** Complete visual overhaul with glassmorphism-inspired cards, refined color palettes adapting to VS Code themes, and smooth interactive hover effects.
- **Multi-Model Support Badge:** Highlighted capability in the dashboard hero section noting the Gateway can fetch ANY language model detected in VS Code.
- **Wiki Refinements:** Redesigned documentation tabs to a modern pill-shaped style and improved code block typography.

### Fixed
- **Live Feed & Activities:** Resolved JavaScript reference errors that broke the real-time Live Log and Recent Activity features.
- **Cloudflare Tunnel Status:** Fixed a bug where starting a tunnel displayed the literal string "null" instead of a proper "Starting" state in the dashboard.

## [2.7.0] - 2026-02-15

### Added
- **Status Bar:** Shows active model name, uptime counter, tunnel indicator (🌐), and enriched tooltip with full metrics table
- **Quick Pick Menu:** Copy API URL, Quick Test (sends live "Hello" request), Switch Model (lists all Copilot models), Edit System Prompt, Start/Manage Tunnel
- **Sidebar:** Animated pulsing status dot, clickable model name for switching, live uptime ticker (ticks every second), 4-stat grid (RPM, latency, total reqs, error rate), live request feed with flash animation, config status indicators (Auth/HTTPS/Tunnel)
- **README:** "Run as a Background Service" guide for macOS, Windows, and Linux

### Changed
- Sidebar layout reorganized: stats and live feed now above action buttons for better at-a-glance monitoring
- Removed duplicate Swagger button event listener from sidebar

## [2.6.0] - 2026-02-13

### Added
- **OpenAI Chat Completions:** `max_completion_tokens` parameter support (auto-normalized to `max_tokens` for GPT-5.x compatibility)
- **OpenAI Chat Completions:** `developer` role support (auto-mapped to `system` for 2025+ spec)
- **OpenAI Chat Completions:** `stream_options.include_usage` — emit usage chunk in streaming responses
- **OpenAI Chat Completions:** `reasoning_effort` parameter support for o-series models (auto-mapped to `reasoning.effort`)
- **OpenAI Responses API:** `text.format` structured output pass-through (was hardcoded to `text`)
- **OpenAI Responses API:** `truncation` parameter pass-through
- **OpenAI Responses API:** Expanded `reasoning.effort` values — added `minimal`, `none`, `xhigh` (Aug–Dec 2025 spec)
- **OpenAI Responses API:** Streaming events now pass through `text.format` and `truncation` from request
- **Anthropic Messages API:** `thinking`, `metadata` interface fields; `tool_use` stop reason; cache token usage
- **Google Generative AI:** `frequencyPenalty`, `presencePenalty`, `responseMimeType`, `responseSchema`, `safetySettings` interface
- **OpenAPI Spec:** Added `max_completion_tokens`, `reasoning_effort` to Chat Completions schema
- **OpenAPI Spec:** Added `developer` to Message role enum
- **OpenAPI Spec:** Added `reasoning`, `truncation`, `store`, `previous_response_id`, `tool_choice` to Responses API schema

### Changed
- Updated branding to emphasize free, open-source, and trustworthy nature
- Upgraded TypeScript to 5.9.3, typescript-eslint to 8.55.0, @types/node to 25.2.3

## [2.5.1] - 2026-02-07

### Fixed
- **Cloudflare Tunnel binary:** Now downloads the cloudflared binary automatically at runtime to extension storage. Works properly for marketplace-installed extensions.

## [2.5.0] - 2026-02-07

### Added
- **🌐 Internet Access via Cloudflare Tunnels:** Expose your API to the internet with a single click. Get a free public `*.trycloudflare.com` URL instantly — no account required. Perfect for accessing from your phone, sharing with friends, or remote development.
- **Network Access Guide:** New "What's New" banner explaining the difference between localhost (127.0.0.1), LAN (0.0.0.0), and Cloudflare Tunnel access.
- **Security Enforcement:** Tunnel requires API key authentication to be enabled before going live.

### Changed
- Dashboard UI improvements with better feature discovery.

## [2.1.5] - 2026-01-11

### Fixed
- **Real-time metrics:** Sidebar and dashboard now update metrics (Req/Min, Latency, Tokens, Connections) in real-time
- **Dashboard race condition:** Fixed message listener timing issue that caused stale data on initial load
- **Host/Port layout:** Fixed overlap between host, port inputs and Apply button

### Added
- "Things you should read" button in sidebar linking to notes.suhaib.in

## [2.1.4] - 2026-01-10

### Fixed
- **Model Selection:** Fixed critical issue where API endpoints were ignoring the requested model and defaulting to the first available model. Now all endpoints strictly validate and use the exact model specified in the request.
- Added model validation across all API endpoints (OpenAI, Anthropic, Google, Llama). Invalid models now return a 404 error with a list of available models.

### Changed
- Updated README to be model-agnostic and expanded tool categories.
- Removed specific model name references to future-proof documentation.

## [0.0.7] - 2025-12-21

### Fixed
- Dashboard readability issues in Light and High Contrast themes by using VS Code theme variables.

## [0.0.6]

- Initial release<!-- pair extraordinaire -->
