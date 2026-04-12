# Performance Scripts

This directory contains repeatable performance checks for the extension.

## Commands

- `npm run perf:bench`
  - Runs the lightweight runtime micro-benchmarks for Copilot health caching, redaction, and stable dashboard updates.
- `npm run perf:profile`
  - Builds the extension, launches a real extension host with `@vscode/test-electron`, opens the dashboard, captures a CPU profile for the open phase, and records message/html counters before and after opening.
- `npm run perf:request-tracking`
  - Builds the extension, launches an isolated extension host, runs the fast-path request tracking regression check, and verifies request-scoped maps such as `requestIpMap` return to zero after repeated `/`, `/health`, `/docs`, `/openapi.json`, `/v1/models`, and `/v1/messages/count_tokens` requests.
- `npm run perf:all`
  - Runs the benchmark, dashboard profile, and request tracking regression suite in sequence.

## Output

Generated artifacts are written under `perf-results/`:

- `runtime-bench-*.json`
  - Micro-benchmark numbers for cache/redaction/panel update paths.
- `dashboard-profile/<timestamp>/report.json`
  - Phase-by-phase CPU usage and webview message/html counters from a real extension host run.
- `dashboard-profile/<timestamp>/dashboard-open.cpuprofile`
  - Inspector CPU profile for the extension host while the dashboard opens.
- `request-tracking/<timestamp>/report.json`
  - Request lifecycle regression results, including the validated fast-path endpoints plus the initial/final sizes of request-scoped tracking maps.

## Notes

- The runtime benchmark uses an esbuild-based mock VS Code environment so it can run without launching VS Code.
- The dashboard profile runs against a real extension host and uses internal perf commands plus Node inspector to capture the CPU profile.
- The request tracking regression also runs in a real extension host, but it exercises a synthetic in-process request lifecycle so the cleanup assertions are stable and do not depend on loopback networking or model-provider availability.