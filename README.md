<p align="center">
  <img src="media/icon.png" alt="GitHub Copilot API Gateway" width="128" height="128">
</p>

<h1 align="center">GitHub Copilot API Gateway</h1>

<p align="center">
  <strong>Unlock the full potential of your GitHub Copilot subscription.</strong><br>
  Expose Copilot's models via standard APIs compatible with OpenAI, Anthropic, Google, and Llama.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=suhaibbinyounis.github-copilot-api-vscode">
    <img src="https://img.shields.io/visual-studio-marketplace/v/suhaibbinyounis.github-copilot-api-vscode?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=VS%20Code%20Marketplace" alt="VS Code Marketplace">
  </a>
  <a href="https://github.com/suhaibbinyounis/github-copilot-api-vscode/releases">
    <img src="https://img.shields.io/github/v/release/suhaibbinyounis/github-copilot-api-vscode?style=for-the-badge&logo=github" alt="GitHub Release">
  </a>
  <a href="https://open-vsx.org/extension/suhaibbinyounis/github-copilot-api-vscode">
    <img src="https://img.shields.io/open-vsx/v/suhaibbinyounis/github-copilot-api-vscode?style=for-the-badge&logo=eclipse-ide&logoColor=white&label=Open%20VSX" alt="Open VSX Registry">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License: MIT">
  </a>
</p>

<p align="center">
  <a href="#-universal-api-gateway">Universal API Gateway</a> •
  <a href="#-security--controls">Security & Controls</a> •
  <a href="#-api-endpoints">API Endpoints</a> •
  <a href="#-ecosystem--integrations">Ecosystem & Integrations</a> •
  <a href="#-getting-started">Getting Started</a>
</p>

---

## 🌐 Universal API Gateway

**GitHub Copilot API Gateway** acts as a bridge between your local development environment and GitHub Copilot. It starts a local HTTP server that standardizes communication, allowing you to use Copilot with **any AI SDK or tool**.

### One Subscription, Any Model

Why pay for separate API keys? Use your existing Copilot subscription to power tools that expect:
- **OpenAI** (GPT Family: `gpt-4o`, `gpt-3.5-turbo`)
- **Anthropic** (Claude Family: `claude-3-5-sonnet`)
- **Google** (Gemini Family: `gemini-1.5-pro`)
- **Meta** (Llama Family)

### Seamless Compatibility

Simply point your client to `http://127.0.0.1:3030` and it works like magic.

```python
# Create an OpenAI client that talks to Copilot
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:3030/v1",
    api_key="copilot" # API key is ignored, your authenticated session is used
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### 🔓 What This Unlocks
By standardizing Copilot as a local API, you instantly gain access to the entire AI ecosystem:

| Category | Tools & Frameworks | Use Cases |
| :--- | :--- | :--- |
| **Orchestration** | **LangChain**, **LlamaIndex**, **Flowise** | Build RAG pipelines, chat with your PDF/Notion data. |
| **Agents** | **AutoGPT**, **CrewAI**, **BabyAGI** | Run autonomous researchers and task-solvers locally. |
| **Dev Tools** | **Cursor**, **Aider**, **Open Interpreter** | Pair program in your terminal or specialized IDEs. |
| **No-Code** | **Bubble**, **Zapier** (via local tunnel) | Connect enterprise workflows to Copilot intelligence. |

*"Turn your VS Code into the engine room for your AI experiments."*

---

## 👥 Who Is This For?

Whether you're building the next unicorn or just learning to code, this extension levels the playing field.

### 🎓 Students & Researchers
**Don't let API costs block your learning.**
If you have the **GitHub Student Developer Pack**, you likely have free access to Copilot. Use this gateway to build RAG apps, agents, and complex systems that usually require expensive API credits. Experiment purely without fear of a surprise bill.

### 💼 Professionals & Indie Hackers
**Prototype at the speed of thought, for free.**
Stop burning your personal credit card on API calls during development. Use your $10/mo Copilot subscription to power your entire dev, test, and staging environments. Build full-stack AI features locally before deploying to production.

### 🏢 Enterprises & Teams
**Secure, Compliant AI for every developer.**
Leverage your existing GitHub Copilot Business/Enterprise licenses.
- **Data Privacy:** Keep traffic local or within your VPN.
- **No Shadow IT:** Developers don't need personal API keys to use advanced tools like Cursor or Aider.
- **Unified Billing:** One subscription covers IDE completion *and* API-based workflows.

---

## 🔒 Security & Controls

We understand that exposing an API requires strict control, especially in enterprise environments. This extension is built with **security-first principles**.

### 🛡️ Access Control
- **IP Allowlisting:** Restrict access to specific IP addresses (e.g., VPNs, local subnets).
- **Bearer Authentication:** Enforce a custom API Key (`server.apiKey`) for all incoming requests.
- **Connection Limits:** Set maximum concurrent connections per IP to prevent abuse.

### 📝 Audit & Observability
- **Full Audit Logging:** Every request and response is logged with timestamps, status codes, and latency.
- **Data Redaction:** Sensitive information (API keys, PII) is automatically redacted from logs using configurable regex patterns.
- **Live Dashboard:** Monitor real-time traffic, token usage, and error rates directly within VS Code.

### ⚡ Performance Guardrails
- **Rate Limiting:** Configurable requests-per-minute limits.
- **Payload Limits:** Rigorous checks on request sizes to ensure stability.
- **Optimized Core:** Built on a zero-dependency, high-performance Node.js HTTP server.

---

## 📚 API Endpoints

The gateway provides fully compatible endpoints for major AI providers.

| Provider | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| **OpenAI** | `/v1/chat/completions` | `POST` | Full support for streaming, tools, and JSON mode. |
| **OpenAI** | `/v1/models` | `GET` | List available models from your Copilot plan. |
| **Anthropic** | `/v1/messages` | `POST` | Compatible with Anthropic SDKs (Claude). |
| **Google** | `/v1beta/models/:model:generateContent` | `POST` | Compatible with Google Generative AI SDKs. |
| **Llama** | `/llama/v1/chat/completions` | `POST` | Targeted support for Llama client libraries. |
| **Utilities** | `/v1/tokenize` | `POST` | Count tokens for a given string (OpenAI format). |
| **Utilities** | `/metrics` | `GET` | Prometheus-compatible metrics endpoint. |
| **Utilities** | `/health` | `GET` | Service health check & Copilot status. |
| **Utilities** | `/docs` | `GET` | **Offline Swagger UI** for interactive testing. |

### Interactive Documentation (Swagger UI)

Explore the API offline at `http://127.0.0.1:3030/docs`.
- **Try it out:** Send real requests from your browser.
- **Schema Explorer:** View detailed request/response definitions.
- **Secure:** Served locally, no external assets loaded.

---

## 🔌 Ecosystem & Integrations

Build the future of AI with your favorite tools. The gateway is designed to be a drop-in replacement for any system expecting an OpenAI-compatible endpoint.

### 🤖 AI Frameworks
Connect seamlessly with industry-standard orchestration libraries:
- **[LangChain](https://langchain.com):** Build RAG pipelines and agents. Simply set `OPENAI_API_BASE=http://127.0.0.1:3030/v1`.
- **[LlamaIndex](https://llamaindex.ai):** Index your private data and query it using Copilot's models.
- **[Semantic Kernel](https://github.com/microsoft/semantic-kernel):** Integrate directly with Microsoft's enterprise-grade SDK.

### 🛠️ Developer Tools
Supercharge your CLI and editor workflows:
- **[Cursor](https://cursor.sh):** Use Copilot as your backend model provider.
- **[Aider](https://aider.chat):** The AI pair programmer in your terminal.
- **[Open Interpreter](https://openinterpreter.com):** Let language models run code on your computer.

### 🧠 Autonomous Agents
Power resource-intensive agent loops without breaking the bank:
- **[AutoGPT](https://github.com/Significant-Gravitas/AutoGPT):** Run continuous autonomous tasks.
- **[CrewAI](https://crewai.com):** Orchestrate teams of AI agents.

*"If it speaks OpenAI, it works with Copilot API Gateway."*

---

## 🚀 Getting Started

### 1. Installation
Install **GitHub Copilot API Gateway** from the VS Code Marketplace.
*Requirements: VS Code 1.95+ and GitHub Copilot Chat extension.*

### 2. Start the Server
Click the **"Start Server"** button in the extension sidebar, or run the command `GitHub Copilot: Start API Server`.

### 3. Usage & Network Configuration
By default, the server is secure and only accessible from your local machine (`127.0.0.1`).

**To share Copilot with your LAN (e.g., test on mobile, share with a colleague):**
1. Open VS Code Settings.
2. Search for `githubCopilotApi.server.host`.
3. Change value from `127.0.0.1` to `0.0.0.0` (Listen on all interfaces).
4. Your API is now accessible at `http://<YOUR-LAN-IP>:3030`.

> 💡 **Tip:** Use the **IP Allowlist** feature to ensure only trusted devices on your network can connect.

### Configuration
Customize your experience in VS Code Settings (`githubCopilotApi.*`):

```json
{
  "githubCopilotApi.server.port": 3030,
  "githubCopilotApi.server.host": "127.0.0.1",
  "githubCopilotApi.server.apiKey": "my-secret-token",
  "githubCopilotApi.server.ipAllowlist": ["127.0.0.1", "192.168.1.0/24"]
}
```

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Can I use this to get free GPT-4 access?**
A: This extension uses your *existing* GitHub Copilot subscription. If your plan includes GPT-4 (like most do), then yes, you can access GPT-4 programmatically without paying extra OpenAI API fees.

**Q: Does this work with local LLMs like Ollama or LM Studio?**
A: This extension *is* a local LLM server, but powered by GitHub's cloud. It is a perfect alternative to running heavy local models if your hardware is limited, offering cloud-quality performance (GPT-4o, Claude 3.5) with local-like control.

**Q: Is this safe for enterprise use?**
A: Yes. It runs entirely locally on your machine. No data is sent to any third-party server other than GitHub itself. You can enforce strict **IP Allowlisting** and **Audit Logging** to meet compliance requirements.

---

## 🏆 Why Developers Choose This Gateway

| Feature | **Copilot API Gateway** | Local LLMs (Ollama) | Direct Cloud APIs |
| :--- | :---: | :---: | :---: |
| **Model Quality** | 🌟 **S-Tier (GPT-4o/Claude)** | B-Tier (Llama/Mistral) | S-Tier |
| **Hardware Reqs** | 💻 **Minimal (Any CPU)** | 🔋 High (GPU Required) | None |
| **Cost** | 💸 **Fixed ($10/mo)** | Free | 💸 Pay-per-token ($$$) |
| **Setup** | ⚡ **1 Click (VS Code)** | Complex | Easy |
| **Privacy** | 🔒 **Local Proxy** | Local | Cloud |

---

## 💰 Cost Comparison

| Feature | **This Extension** | OpenAI API | Anthropic API |
|:--------|:------------------:|:----------:|:-------------:|
| **Cost** | **$0 (Included in Copilot)** | Pay-per-token | Pay-per-token |
| **Models** | GPT-4o, Claude 3.5, Gemini | GPT models only | Claude models only |
| **Privacy** | Local Proxy | Cloud API | Cloud API |

---

## 📝 License & Disclaimer

**MIT License.**

> **Disclaimer:** This extension is an independent project and is not affiliated with GitHub, Microsoft, or OpenAI. It leverages your existing GitHub Copilot subscription enabling you to use it in new ways. Use responsibly.

<p align="center">
  <strong>Built with ❤️ by <a href="https://suhaibbinyounis.com">Suhaib Bin Younis</a></strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=suhaibbinyounis.github-copilot-api-vscode">
    <img src="https://img.shields.io/visual-studio-marketplace/v/suhaibbinyounis.github-copilot-api-vscode?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=VS%20Code%20Marketplace" alt="VS Code Marketplace">
  </a>
  <a href="https://github.com/suhaibbinyounis/github-copilot-api-vscode/releases">
    <img src="https://img.shields.io/github/v/release/suhaibbinyounis/github-copilot-api-vscode?style=for-the-badge&logo=github" alt="GitHub Release">
  </a>
  <a href="https://open-vsx.org/extension/suhaibbinyounis/github-copilot-api-vscode">
    <img src="https://img.shields.io/open-vsx/v/suhaibbinyounis/github-copilot-api-vscode?style=for-the-badge&logo=eclipse-ide&logoColor=white&label=Open%20VSX" alt="Open VSX Registry">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License: MIT">
  </a>
</p>

<p align="center">
  <a href="#-universal-api-gateway">Universal API Gateway</a> •
  <a href="#-security--controls">Security & Controls</a> •
  <a href="#-api-endpoints">API Endpoints</a> •
  <a href="#-enterprise-apps-hub">Apps Hub</a> •
  <a href="#-getting-started">Getting Started</a>
</p>

---

## 🌐 Universal API Gateway

**GitHub Copilot API Gateway** acts as a bridge between your local development environment and GitHub Copilot. It starts a local HTTP server that standardizes communication, allowing you to use Copilot with **any AI SDK or tool**.

### One Subscription, Any Model

Why pay for separate API keys? Use your existing Copilot subscription to power tools that expect:
- **OpenAI** (GPT Family)
- **Anthropic** (Claude Family)
- **Google** (Gemini Family)
- **Meta** (Llama Family)

### Seamless Compatibility

Simply point your client to `http://127.0.0.1:3030` and it works like magic.

```python
# Create an OpenAI client that talks to Copilot
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:3030/v1",
    api_key="copilot" # API key is ignored, your authenticated session is used
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### 🔓 What This Unlocks
By standardizing Copilot as a local API, you instantly gain access to the entire AI ecosystem:

| Category | Tools & Frameworks | Use Cases |
| :--- | :--- | :--- |
| **Orchestration** | **LangChain**, **LlamaIndex**, **Flowise** | Build RAG pipelines, chat with your PDF/Notion data. |
| **Agents** | **AutoGPT**, **BabyAGI**, **CrewAI** | Run autonomous researchers and task-solvers locally. |
| **Dev Tools** | **Cursor**, **Aider**, **Open Interpreter** | Pair program in your terminal or specialized IDEs. |
| **No-Code** | **Bubble**, **Zapier** (via local tunnel) | Connect enterprise workflows to Copilot intelligence. |

*"Turn your VS Code into the engine room for your AI experiments."*

---

## 👥 Who Is This For?

Whether you're building the next unicorn or just learning to code, this extension levels the playing field.

### 🎓 Students & Researchers (GitHub Student Developer Pack)
**Don't let API costs block your learning.**
If you have the **GitHub Student Developer Pack**, you likely have free access to Copilot. Use this gateway to build RAG apps, agents, and complex systems that usually require expensive API credits. Experiment purely without fear of a surprise bill.

### 💼 Professionals & Indie Hackers
**Prototype at the speed of thought, for free.**
Stop burning your personal credit card on API calls during development. Use your $10/mo Copilot subscription to power your entire dev, test, and staging environments. Build full-stack AI features locally before deploying to production.

### 🏢 Enterprises & Teams
**Secure, Compliant AI for every developer.**
Leverage your existing GitHub Copilot Business/Enterprise licenses.
- **Data Privacy:** Keep traffic local or within your VPN.
- **No Shadow IT:** Developers don't need personal API keys to use advanced tools like Cursor or Aider.
- **Unified Billing:** One subscription covers IDE completion *and* API-based workflows.

*"This is the closest thing to having a private research lab on your laptop."*

---

---

## 🔒 Security & Controls

We understand that exposing an API requires strict control, especially in enterprise environments. This extension is built with **security-first principles**.

### 🛡️ Access Control
- **IP Allowlisting:** Restrict access to specific IP addresses or CIDR ranges (e.g., VPNs, local subnets).
- **Bearer Authentication:** Enforce a custom API Key (`server.apiKey`) for all incoming requests.
- **Connection Limits:** Set maximum concurrent connections per IP to prevent abuse.

### 📝 Audit & Observability
- **Full Audit Logging:** Every request and response is logged with timestamps, status codes, and latency.
- **Data Redaction:** Sensitive information (API keys, PII) is automatically redacted from logs using configurable regex patterns.
- **Live Dashboard:** Monitor real-time traffic, token usage, and error rates directly within VS Code.

### ⚡ Performance Guardrails
- **Rate Limiting:** Configurable requests-per-minute limits to prevent flooding.
- **Payload Limits:** rigorous checks on request sizes to ensure stability.
- **Optimized Core:** Built on a zero-dependency, high-performance Node.js HTTP server.

---

## 📚 API Endpoints

The gateway provides fully compatible endpoints for major AI providers.

| Provider | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| **OpenAI** | `/v1/chat/completions` | `POST` | Full support for streaming, tools, and JSON mode. |
| **OpenAI** | `/v1/realtime` | `WS` | **Realtime API** for low-latency bidirectional chat. |
| **OpenAI** | `/v1/completions` | `POST` | Legacy text completion endpoint. |
| **OpenAI** | `/v1/models` | `GET` | List available models from your Copilot plan. |
| **Anthropic** | `/v1/messages` | `POST` | Compatible with Anthropic SDKs (Claude). |
| **Anthropic** | `/anthropic/v1/realtime` | `WS` | Realtime API using Anthropic Messages format. |
| **Google** | `/v1beta/models/:model:generateContent` | `POST` | Compatible with Google Generative AI SDKs. |
| **Google** | `/google/v1/realtime` | `WS` | Realtime API using Google Gemini format. |
| **Llama** | `/llama/v1/chat/completions` | `POST` | Targeted support for Llama client libraries. |
| **Llama** | `/llama/v1/realtime` | `WS` | Realtime API using Llama format. |
| **Utilities** | `/v1/tokenize` | `POST` | Count tokens for a given string (OpenAI format). |
| **Utilities** | `/v1/usage` | `GET` | Retrieve server usage statistics. |
| **Utilities** | `/metrics` | `GET` | Prometheus-compatible metrics endpoint. |
| **Utilities** | `/health` | `GET` | Service health check & Copilot status. |
| **Utilities** | `/docs` | `GET` | **Offline Swagger UI** for interactive testing. |

### Interactive Documentation (Swagger UI)

Explore the API offline at `http://127.0.0.1:3030/docs`.
- **Try it out:** Send real requests from your browser.
- **Schema Explorer:** View detailed request/response definitions.
- **Secure:** Served locally, no external assets loaded.

---

## 🔌 Ecosystem & Integrations

Build the future of AI with your favorite tools. The gateway is designed to be a drop-in replacement for any system expecting an OpenAI-compatible endpoint.

### 🤖 AI Frameworks
Connect seamlessly with industry-standard orchestration libraries:
- **[LangChain](https://langchain.com):** Build RAG pipelines and agents. simply set `OPENAI_API_BASE=http://127.0.0.1:3030/v1`.
- **[LlamaIndex](https://llamaindex.ai):** Index your private data and query it using Copilot's models.
- **[Semantic Kernel](https://github.com/microsoft/semantic-kernel):** Integrate directly with Microsoft's enterprise-grade SDK.
- **[Haystack](https://haystack.deepset.ai):** Create powerful search and Q&A systems.

### 🛠️ Developer Tools
Supercharge your CLI and editor workflows:
- **[Cursor](https://cursor.sh) / [Zed](https://zed.dev):** Use Copilot as your backend model provider.
- **[Aider](https://aider.chat):** The AI pair programmer in your terminal.
- **[Continue](https://continue.dev):** Open-source AI code assistant.
- **[Open Interpreter](https://openinterpreter.com):** Let language models run code on your computer.

### 🧠 Autonomous Agents
Power resource-intensive agent loops without breaking the bank:
- **[AutoGPT](https://github.com/Significant-Gravitas/AutoGPT):** Run continuous autonomous tasks.
- **[CrewAI](https://crewai.com):** Orchestrate teams of AI agents.
- **[BabyAGI](https://github.com/yoheinakajima/babyagi):** Minimalist task management AI.

*"If it speaks OpenAI, it works with Copilot API Gateway."*

---

## 🔮 Advanced Use Cases

Go beyond simple chat. Unlock the advanced capabilities hidden in your subscription:

### ⚡ Structure-Aware Generation
Use **JSON Mode** to guarantee valid output for your applications. Perfect for:
- Extracting data from unstructured text
- Generating configuration files
- Formatting API responses

### 🛠️ Function Calling & Tools
Give Copilot hands. Define custom functions that the model can "call" to perform actions:
- Query database
- Search the web
- Execute Python scripts
*Compatible with OpenAI Tool use specifications.*

### 🌊 Real-Time Streaming
Build responsive UIs with low-latency Server-Sent Events (SSE). Receive tokens as they are generated, just like the ChatGPT interface.



---
## 🎯 Bonus: Enterprise Apps Hub

Included for free is the **Apps Hub**—a suite of 30+ AI-powered workflows integrated directly into VS Code.

> **Why buy separate tools?** Your Copilot subscription can now generate tests, review code, and manage Jira.

### Featured Workflows
- **🎭 Playwright Generator:** Generate production-ready end-to-end tests from descriptions.
- **🔗 Jira Integration:** Auto-fetch acceptance criteria to write code or tests.
- **🐞 Bug Reporter:** Turn vague reports into structured, repro-ready tickets.
- **📝 SQL Builder:** Write complex queries using natural language.

Access these apps by clicking **"Open Apps Hub"** in the sidebar.

---

## � Getting Started

### 1. Installation
Install **GitHub Copilot API Gateway** from the VS Code Marketplace.
*Requirements: VS Code 1.95+ and GitHub Copilot Chat extension.*

### 2. Start the Server
Click the **"Start Server"** button in the extension sidebar, or run the command `GitHub Copilot: Start API Server`.

### 3. Usage & Network Configuration
By default, the server is secure and only accessible from your local machine (`127.0.0.1`).

**To share Copilot with your LAN (e.g., test on mobile, share with a colleague):**
1. Open VS Code Settings.
2. Search for `githubCopilotApi.server.host`.
3. Change value from `127.0.0.1` to `0.0.0.0` (Listen on all interfaces).
4. Your API is now accessible at `http://<YOUR-LAN-IP>:3030`.

> 💡 **Tip:** Use the **IP Allowlist** feature to ensure only trusted devices on your network can connect.

### Configuration
Customize your experience in VS Code Settings (`githubCopilotApi.*`):

```json
{
  "githubCopilotApi.server.port": 3030,
  "githubCopilotApi.server.host": "127.0.0.1",
  "githubCopilotApi.server.apiKey": "my-secret-token",
  "githubCopilotApi.server.ipAllowlist": ["127.0.0.1", "192.168.1.0/24"]
}
```

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Can I use this to get free GPT-4 access?**
A: This extension uses your *existing* GitHub Copilot subscription. If your plan includes GPT-4 (like most do), then yes, you can access GPT-4 programmatically without paying extra OpenAI API fees.

**Q: Does this work with local LLMs like Ollama or LM Studio?**
A: This extension *is* a local LLM server, but powered by GitHub's cloud. It is a perfect alternative to running heavy local models if your hardware is limited, offering cloud-quality performance (GPT-4o, Claude 3.5) with local-like control.

**Q: How do I find my GitHub Copilot API Key?**
A: You don't need to extract or hunt for a static API key! This extension handles the secure authentication handshake with GitHub automatically. Your local tools just need to talk to `http://127.0.0.1:3030`.

**Q: Is this safe for enterprise use?**
A: Yes. It runs entirely locally on your machine. No data is sent to any third-party server other than GitHub itself. You can enforce strict **IP Allowlisting** and **Audit Logging** to meet compliance requirements.

---

## 🏆 Why Developers Choose This Gateway

| Feature | **Copilot API Gateway** | Local LLMs (Ollama) | Direct Cloud APIs |
| :--- | :---: | :---: | :---: |
| **Model Quality** | 🌟 **S-Tier (GPT-4o/Claude)** | B-Tier (Llama/Mistral) | S-Tier |
| **Hardware Reqs** | 💻 **Minimal (Any CPU)** | 🔋 High (GPU Required) | None |
| **Cost** | 💸 **Fixed ($10/mo)** | Free | 💸 Pay-per-token ($$$) |
| **Setup** | ⚡ **1 Click (VS Code)** | Complex | Easy |
| **Privacy** | 🔒 **Local Proxy** | Local | Cloud |

*Perfect for: Digital Nomads, Students, enterprise developers behind firewalls, and AI engineers prototyping RAG applications.*

---

## 💰 Cost Comparison

| Feature | **This Extension** | OpenAI API | Anthropic API |
|:--------|:------------------:|:----------:|:-------------:|
| **Cost** | **$0 (Included in Copilot)** | Pay-per-token | Pay-per-token |
| **Models** | GPT-4o, Claude 3.5, Gemini | GPT models only | Claude models only |
| **Privacy** | Local Proxy | Cloud API | Cloud API |

---

## 📝 License & Disclaimer

**MIT License.**

> **Disclaimer:** This extension is an independent project and is not affiliated with GitHub, Microsoft, or OpenAI. It leverages your existing GitHub Copilot subscription enabling you to use it in new ways. Use responsibly.

<p align="center">
  <strong>Built with ❤️ by <a href="https://suhaibbinyounis.com">Suhaib Bin Younis</a></strong>
</p>
