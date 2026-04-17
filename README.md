<p align="center">
  <img src="media/icon.png" alt="GitHub Copilot API Gateway" width="128" height="128">
</p>

<h1 align="center">GitHub Copilot API Gateway</h1>

<p align="center">
  <strong>Use GitHub Copilot, Gemini, Ollama & any VS Code AI — like any other API.</strong><br>
  One extension. Zero API keys. Auto-discovers every model. Works with LangChain, Cursor, Aider, and 50+ tools.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=suhaibbinyounis.github-copilot-api-vscode">
    <img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="VS Code Marketplace">
  </a>
  <a href="https://open-vsx.org/extension/suhaibbinyounis/github-copilot-api-vscode">
    <img src="https://img.shields.io/open-vsx/v/suhaibbinyounis/github-copilot-api-vscode?style=for-the-badge&logo=eclipse-ide&logoColor=white&label=Open%20VSX" alt="Open VSX">
  </a>
  <a href="https://open-vsx.org/extension/suhaibbinyounis/github-copilot-api-vscode">
    <img src="https://img.shields.io/open-vsx/dt/suhaibbinyounis/github-copilot-api-vscode?style=for-the-badge&logo=eclipse-ide&logoColor=white&label=Downloads" alt="Open VSX Downloads">
  </a>
  <a href="https://github.com/suhaibbinyounis/github-copilot-api-vscode/stargazers">
    <img src="https://img.shields.io/github/stars/suhaibbinyounis/github-copilot-api-vscode?style=for-the-badge&logo=github&color=yellow" alt="GitHub Stars">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License: MIT">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI">
  <img src="https://img.shields.io/badge/Anthropic-191919?style=flat-square&logo=anthropic&logoColor=white" alt="Anthropic">
  <img src="https://img.shields.io/badge/Google-4285F4?style=flat-square&logo=google&logoColor=white" alt="Google">
  <img src="https://img.shields.io/badge/Meta-0467DF?style=flat-square&logo=meta&logoColor=white" alt="Meta">
  <img src="https://img.shields.io/badge/Ollama-000000?style=flat-square&logo=ollama&logoColor=white" alt="Ollama">
</p>

<p align="center">
  <img src="demo.gif" alt="GitHub Copilot API Gateway Demo" width="800">
</p>

---

## ⚡ Quick Start

```bash
# 1. Install from VS Code Marketplace (search "GitHub Copilot API Gateway")
# 2. Click "Start Server" in the sidebar
# 3. Done. Your local API is ready.
```

**Use it like OpenAI:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:3030/v1",
    api_key="anything"  # No real API key needed
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

> 🔒 **Your data stays local.** This extension runs entirely on your machine — no third-party servers, no telemetry, no data collection. The full source code is available on [GitHub](https://github.com/suhaibbinyounis/github-copilot-api-vscode) for you to audit.

---

## ✅ What You Can Do

- **Use [Cursor](https://cursor.sh)** with Copilot, Gemini, or Ollama as the backend
- **Run [LangChain](https://langchain.com) agents** without paying for OpenAI
- **Power [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)** and [CrewAI](https://crewai.com) agents locally
- **Query data** with [PandasAI](https://pandas-ai.com) and [LlamaIndex](https://llamaindex.ai)
- **Build chatbots** with Botpress, Chainlit, or Rasa
- **Pair program** with [Aider](https://aider.chat) or [Open Interpreter](https://openinterpreter.com)
- **Generate code** with GPT Engineer or Sweep
- **Connect [Clawdbot](https://github.com/clawdbot/clawdbot)** to power AI on WhatsApp, Telegram, Discord & Slack
- **Mix and match models** — route one request to GPT-4o, the next to Gemini, all on `localhost:3030`

If it speaks OpenAI, it works with this gateway.

### 🔀 Multi-Provider: One Endpoint, Every Model

This gateway **auto-discovers all AI models** registered in VS Code — not just Copilot.

| Provider | How to enable | Example models |
|----------|---------------|----------------|
| **GitHub Copilot** | Install [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension | `gpt-4o`, `claude-3.5-sonnet`, `o3-mini` |
| **Google Gemini** | Install [Gemini Code Assist](https://marketplace.visualstudio.com/items?itemName=Google.geminicodeassist) extension | `gemini-2.0-flash` |
| **Ollama** | Install an Ollama VS Code extension | Local models (llama3, mistral, etc.) |
| **Any other** | Any extension using `vscode.lm` API | Automatically discovered |

All models are exposed at `GET /v1/models` and routable via the `model` field in any request. No config changes needed — just install the VS Code extension and the models appear.

### 🤖 Using with Clawdbot (Moltbot)

[Clawdbot](https://github.com/clawdbot/clawdbot) is an open-source AI assistant that brings LLMs to messaging platforms like **WhatsApp**, **Telegram**, **Discord**, and **Slack**. Since it supports any OpenAI-compatible API endpoint, you can use this gateway to power Clawdbot with GitHub Copilot:

1. Start the Copilot API Gateway in VS Code
2. Expose the API (set host to `0.0.0.0` if Clawdbot runs on another machine)
3. Configure Clawdbot to use your gateway:

```yaml
# In your Clawdbot config
llm:
  provider: openai
  base_url: http://YOUR-IP:3030/v1
  api_key: your-optional-api-key  # or "anything" if auth is disabled
  model: gpt-4o
```

Now your WhatsApp/Telegram/Discord/Slack bots are powered by Copilot! 🚀

### 🌐 Internet Access via Cloudflare Tunnels

Access your Copilot API from anywhere — your phone, tablet, or share with friends:

1. Enable authentication (set an API key in Security settings)
2. Start the server
3. Click **"Go Live"** in the Internet Access section
4. Get a public `*.trycloudflare.com` URL instantly

**Free, no Cloudflare account needed!** Perfect for:
- Accessing from your phone outside your home network
- Sharing with friends or teammates temporarily
- Remote development without VPN setup

---

### 🖥️ Run as a Background Service

The gateway runs inside VS Code's extension host, so VS Code must be running — but it **doesn't need to be visible**. Here's how to run it like a background service:

**Prerequisites:** Enable `autoStart` so the server launches automatically:
```json
{ "githubCopilotApi.server.autoStart": true }
```

**macOS:**
```bash
# Launch VS Code minimized (gateway starts automatically)
open -a "Visual Studio Code" --args --disable-workspace-trust

# Or run completely headless via CLI
nohup code --disable-workspace-trust &>/dev/null &
```

**Windows (PowerShell):**
```powershell
# Launch minimized
Start-Process code -ArgumentList "--disable-workspace-trust" -WindowStyle Minimized

# Or add to Task Scheduler for start-on-boot:
# Program: code
# Arguments: --disable-workspace-trust
```

**Linux:**
```bash
# Run in background
nohup code --disable-workspace-trust &>/dev/null &

# Or create a systemd user service (~/.config/systemd/user/copilot-api.service):
# [Service]
# ExecStart=/usr/bin/code --disable-workspace-trust
# Restart=on-failure
# Then: systemctl --user enable --now copilot-api
```

> **Note:** VS Code must remain running in the background. If you close VS Code, the gateway stops. The `autoStart` setting ensures the API server starts the moment VS Code opens — no manual clicks needed.

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat completions (streaming supported) |
| `/v1/completions` | POST | Legacy completions API (streaming supported) |
| `/v1/responses` | POST | OpenAI Responses API (2026 spec, streaming supported) |
| `/v1/models` | GET | List all available models |
| `/v1/tools` | GET | List available tools (VS Code + MCP) |
| `/v1/tools/call` | POST | Execute a tool directly |
| `/v1/mcp/servers` | GET | List connected MCP servers |
| `/v1/messages` | POST | Anthropic Claude-compatible endpoint |
| `/v1beta/models/:model:generateContent` | POST | Google Gemini-compatible endpoint |
| `/health` | GET | Server health check |
| `/docs` | GET | Interactive Swagger UI |

---

## ⚙️ Configuration

Customize in VS Code Settings (`githubCopilotApi.*`):

```json
{
  "githubCopilotApi.server.port": 3030,
  "githubCopilotApi.server.host": "127.0.0.1",
  "githubCopilotApi.server.apiKey": "",
  "githubCopilotApi.server.autoStart": false
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `server.port` | 3030 | Local server port |
| `server.host` | 127.0.0.1 | Bind address (use `0.0.0.0` for LAN access) |
| `server.apiKey` | *(empty)* | Optional Bearer token for authentication |
| `server.autoStart` | false | Start server when VS Code opens |

For advanced options (TLS, IP allowlisting, audit logging), see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📦 Requirements

- **VS Code 1.95+**
- **GitHub Copilot Chat extension** (must be signed in)

---

## 📖 Documentation

- [Official Docs](https://notes.suhaib.in/docs/vscode/extensions/github-copilot-api-gateway/)
- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

---

## 🛡️ Trust & Transparency

This project is **100% free and open-source** under the [MIT License](LICENSE).

- 🔍 **Full source code** available on [GitHub](https://github.com/suhaibbinyounis/github-copilot-api-vscode)
- 🚫 **No telemetry** — zero data collection, no analytics, no tracking
- 🔒 **Runs locally** — your prompts and API keys never leave your machine
- ✅ **Community-driven** — contributions welcome via [CONTRIBUTING.md](CONTRIBUTING.md)
- 🛡️ **Security** — report vulnerabilities via [SECURITY.md](SECURITY.md)

> **Disclaimer:** This extension is an independent, community-built project and is not affiliated with GitHub, Microsoft, or OpenAI. It leverages your existing GitHub Copilot subscription. Use responsibly.

<p align="center">
  <strong>Built with ❤️ by <a href="https://suhaibbinyounis.com">Suhaib Bin Younis</a></strong>
</p>
