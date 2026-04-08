# Performance Scripts

This directory contains repeatable performance checks for the extension.

## Commands

- `npm run perf:bench`
  - Runs the lightweight runtime micro-benchmarks for Copilot health caching, redaction, and stable dashboard updates.
- `npm run perf:profile`
  - Builds the extension, launches a real extension host with `@vscode/test-electron`, opens the dashboard, captures a CPU profile for the open phase, and records message/html counters before and after opening.
- `npm run perf:all`
  - Runs both scripts in sequence.

## Output

Generated artifacts are written under `perf-results/`:

- `runtime-bench-*.json`
  - Micro-benchmark numbers for cache/redaction/panel update paths.
- `dashboard-profile/<timestamp>/report.json`
  - Phase-by-phase CPU usage and webview message/html counters from a real extension host run.
- `dashboard-profile/<timestamp>/dashboard-open.cpuprofile`
  - Inspector CPU profile for the extension host while the dashboard opens.

## Notes

- The runtime benchmark uses an esbuild-based mock VS Code environment so it can run without launching VS Code.
- The dashboard profile runs against a real extension host and uses internal perf commands plus Node inspector to capture the CPU profile.