# 🚀 GitHub Copilot API Gateway

### **Unlock the Full Potential of GitHub Copilot**

Turn your VS Code Copilot subscription into a local, OpenAI-compatible AI server. Now with native support for **Anthropic** and **Google** clients.

[![VS Code](https://img.shields.io/badge/VS%20Code-1.99.0+-007ACC?logo=visual-studio-code)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-412991?logo=openai)](https://platform.openai.com/docs/api-reference)

---

## ⚡ What is this?

This extension spins up a local HTTP server that acts as a bridge to GitHub Copilot. It allows you to use Copilot with **any** application, script, or tool—whether it expects OpenAI, Anthropic, or Google Gemini APIs.

---

## 🌟 Features

### 🔌 Multi-Provider Support
- **OpenAI Compatible**: Drop-in replacement for standard OpenAI clients.
- **Anthropic Compatible**: Native support for `/v1/messages` (Claude clients).
- **Google Gemini Compatible**: Native support for `generateContent` (Gemini clients).

### 🛡️ Security & Hardening
- **IP Allowlist**: Restrict access to specific IPs or CIDR ranges.
- **Data Redaction**: Automatically redact PII (API Keys, Credit Cards, etc.) from history and prompts to protect privacy.
- **Rate Limiting**: Configurable requests-per-minute (RPM) limits.
- **Connection Control**: Limit max concurrent requests and connections-per-IP.
- **Authentication**: Secure your server with an optional Bearer Token.

### 📊 Observability
- **Live Log Tail**: Watch API traffic in real-time via the Dashboard.
- **Full Audit Log**: Comprehensive request history with configurable retention.
- **Swagger UI**: Interactive API documentation available at `/docs`.
- **Recent Activity**: Track latency, tokens, and errors at a glance.

### ⚡ Advanced Networking
- **LAN Sharing**: Bind to `0.0.0.0` to safely share Copilot with your local network.
- **WebSocket**: Real-time bidirectional communication at `/v1/realtime`.
- **Configurable**: Set custom request timeouts and max payload sizes.

### 🧩 Extensibility
- **Model Context Protocol (MCP)**: Give Copilot access to local tools (Filesystem, Git, etc.) via MCP servers.

---

## 🚀 Quick Start

### 1. Requirements
Ensure **GitHub Copilot** and **GitHub Copilot Chat** extensions are installed and signed in.

### 2. Start the Server
By default, the server is **stopped**.
1. Open Command Palette (`Cmd+Shift+P`).
2. Run **"Copilot API: Controls"** -> **"Start Server"**.

(Or use the "Copilot API" icon in the Activity Bar).

### 3. Connect!
Server runs at `http://127.0.0.1:3030`.

**Test OpenAI:**
```bash
curl http://127.0.0.1:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}] }'
```

---

## 🔌 Model Context Protocol (MCP)

**Give Copilot access to your real tools and data.**

This gateway implements the [Model Context Protocol](https://modelcontextprotocol.io/), allowing standard MCP servers to provide tools to Copilot.

### How to Use

1. **Install an MCP Server** (e.g., a filesystem server, a git server, or your own).
2. **Configure `settings.json`** in VS Code to tell the gateway where to find it.
3. **Just Chat!** The tools will automatically be available to the AI.

### Configuration Example

Add this to your VS Code `settings.json`:

```json
"githubCopilotApi.mcp.servers": {
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
  },
  "git": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "mcp/git"]
  },
  "remote-tools": {
    "url": "http://localhost:8000/sse"
  }
}
```

- **Stdio Transport**: Use `command` and `args` to run a local process.
- **SSE Transport**: Use `url` to connect to a remote MCP server via Server-Sent Events.

---

## 🔌 API Support

### OpenAI Endpoint
`POST /v1/chat/completions`
Compatible with any OpenAI SDK.

### Anthropic Endpoint
`POST /v1/messages`
Compatible with Claude clients.

### Google Endpoint
`POST /v1beta/models/:model:generateContent`
Compatible with Google Generative AI clients.

---

## ⚙️ Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `server.enabled` | boolean | `false` | Enable/Disable the server. |
| `server.host` | string | `127.0.0.1` | Bind to `0.0.0.0` for LAN access. |
| `server.port` | number | `3030` | Port to listen on. |
| `server.ipAllowlist` | array | `[]` | List of allowed IPs/CIDRs. |
| `server.redactionPatterns` | array | `[]` | Regex patterns to redaction. |
| `server.rateLimitPerMinute` | number | `60` | Max requests per minute. |
| `server.maxConcurrentRequests` | number | `4` | Max parallel requests globally. |
| `server.maxConnectionsPerIp` | number | `10` | Max connections per single IP. |
| `mcp.enabled` | boolean | `true` | Enable Model Context Protocol. |
| `audit.logRequestBodies` | boolean | `false` | Log full payloads (Caution: Sensitive). |

---

## 🐛 Troubleshooting

### Server Won't Start

1. **Check if port is in use**:
   ```bash
   lsof -i :3030
   ```
   If something else is using port 3030, change the port in settings.

2. **Verify Copilot is signed in**:
   - Click the Copilot icon in VS Code's status bar
   - Make sure you see "Copilot" and not "Sign in"

3. **Restart VS Code**:
   - Sometimes a fresh start fixes connection issues

### "Copilot Chat extension not found"

1. Install the **GitHub Copilot Chat** extension:
   - Extension ID: `GitHub.copilot-chat`
2. Restart VS Code after installation

### API Key Authentication Failing

1. Make sure you're including the header correctly:
   ```bash
   -H "Authorization: Bearer your-key"
   ```
   Note: It's `Bearer`, not `Basic`

2. Check for typos in the API key

### Slow Responses

1. Check your internet connection
2. Reduce `maxConcurrentRequests` if you're making many parallel requests
3. The first request after starting is always slower (cold start)

### Can't Access from Another Device

1. Make sure host is set to `0.0.0.0`:
   ```json
   "githubCopilotApi.server.host": "0.0.0.0"
   ```
2. Check your firewall isn't blocking port 3030
3. Make sure both devices are on the same network
4. Use the IP address shown in the Dashboard, not `localhost`

---

## 🆚 Comparison with Alternatives

| Feature | This Extension | ChatGPT Plus | OpenAI API | Claude API |
|---------|---------------|--------------|------------|------------|
| Monthly Cost | $10 (Copilot) | $20 | Pay per use | Pay per use |
| Local Server | ✅ Yes | ❌ No | ❌ No | ❌ No |
| OpenAI Compatible | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| Streaming | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Function Calling | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Works Offline* | ⚠️ Partial | ❌ No | ❌ No | ❌ No |
| Privacy | ✅ Local | ❌ Cloud | ❌ Cloud | ❌ Cloud |

*Requires VS Code and Copilot to be running, but no additional API keys needed.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## ⚠️ Disclaimer

This extension is not officially affiliated with, authorized, maintained, sponsored, or endorsed by GitHub, Microsoft, or OpenAI. Use at your own risk. This project exists to help developers make the most of their existing GitHub Copilot subscriptions.

---

<div align="center">

## 👨‍💻 Author

**Suhaib Bin Younis**

🌐 [suhaibbinyounis.com](https://suhaibbinyounis.com) • [suhaib.in](https://suhaib.in)

📧 [vscode@suhaib.in](mailto:vscode@suhaib.in)

🐙 GitHub: [@suhaibbinyounis](https://github.com/suhaibbinyounis)

---

### ⭐ If You Found This Useful

Give it a star on GitHub! It helps others discover this project.

[![Star on GitHub](https://img.shields.io/github/stars/suhaibbinyounis/github-copilot-api-vscode?style=social)](https://github.com/suhaibbinyounis/github-copilot-api-vscode)

---

*Made with ❤️ and lots of ☕*

</div>
