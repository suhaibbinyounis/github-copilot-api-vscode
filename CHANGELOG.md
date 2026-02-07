# Change Log

All notable changes to the "github-copilot-api-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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

- Initial release