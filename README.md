# 🚀 GitHub Copilot API Gateway

### **The Breakthrough You've Been Waiting For**

*Finally unlock GitHub Copilot's full potential. Use it anywhere, with any tool, any SDK, any application.*

[![VS Code](https://img.shields.io/badge/VS%20Code-1.107.0+-007ACC?logo=visual-studio-code)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-412991?logo=openai)](https://platform.openai.com/docs/api-reference)

---

**Transform your $10/month GitHub Copilot subscription into a full-featured, local AI API server.**

Use the same AI that powers GitHub Copilot with curl, Python, Node.js, or any OpenAI-compatible client.

[📖 Quick Start](#-quick-start-guide) • [🎯 Features](#-features) • [📚 API Reference](#-api-endpoints) • [🔧 Configuration](#%EF%B8%8F-configuration-reference)

</div>

---

## 🤔 What Is This?

**GitHub Copilot API Gateway** is a VS Code extension that creates a local HTTP server on your computer. This server exposes GitHub Copilot's powerful AI models through a standard **OpenAI-compatible API**.

### In Plain English:
- You already pay for GitHub Copilot ($10/month or $100/year)
- Normally, you can only use it inside VS Code for code completion
- **This extension lets you use it ANYWHERE** - in your own apps, scripts, automations, or any tool that supports OpenAI's API

### Why Is This a Big Deal?

| Without This Extension | With This Extension |
|----------------------|---------------------|
| Copilot only works in VS Code | Use Copilot from ANY application |
| Limited to code completion | Full chat, streaming, function calling |
| Can't integrate into your own apps | Drop-in replacement for OpenAI API |
| Pay $20/month for ChatGPT Plus separately | Use your existing Copilot subscription |

---

## 🎯 Features

### 🔌 **OpenAI-Compatible API**
Drop-in replacement for OpenAI's API. Any code that works with OpenAI will work with this - just change the base URL!

### 📡 **Streaming Responses**
Get AI responses in real-time as they're generated, just like ChatGPT. Perfect for chat interfaces and interactive applications.

### 🛠️ **Function Calling (Tools)**
Let the AI call your functions! Build agents, automate workflows, and create intelligent applications that can take actions.

### 📋 **JSON Mode**
Force the AI to respond with valid JSON. Perfect for structured data extraction, API responses, and data processing pipelines.

### 🔄 **Model Aliasing**
Use familiar model names like `gpt-4`, `gpt-3.5-turbo`, or `claude-3.5-sonnet` - they automatically map to Copilot's equivalent models.

### 📚 **Interactive API Documentation**
Built-in Swagger UI at `/docs` - test every endpoint directly in your browser with "Try it out" functionality.

### 🔐 **Authentication**
Optional API key protection to secure your local server. Essential if you're exposing it on your network.

### ⏱️ **Rate Limiting**
Configurable request limits to prevent abuse and manage your usage.

### 📊 **Request History & Stats**
Track all requests, view response times, token usage, and debug issues with comprehensive logging.

### 🌐 **WebSocket Support**
Real-time bidirectional communication for advanced use cases like voice assistants and live streaming apps.

### 📡 **LAN Sharing**
Bind to `0.0.0.0` to share your Copilot API with other devices on your local network.

---

## 📋 Prerequisites & Requirements

Before you begin, make sure you have:

### 1. **Visual Studio Code** (Version 1.107.0 or newer)
   - Download from: https://code.visualstudio.com/
   - Check your version: Help → About (or `Code → About Visual Studio Code` on Mac)
   
### 2. **GitHub Copilot Subscription**
   - You need an active GitHub Copilot subscription (Individual, Business, or Enterprise)
   - Sign up at: https://github.com/features/copilot
   - Cost: $10/month or $100/year for individuals

### 3. **GitHub Copilot Extension for VS Code**
   - Install from VS Code Extensions marketplace
   - Extension ID: `GitHub.copilot`
   - **Must be signed in and activated** before using this extension

### 4. **GitHub Copilot Chat Extension** (Recommended)
   - Extension ID: `GitHub.copilot-chat`
   - Provides the underlying chat models this extension uses

---

## 🚀 Quick Start Guide

### Step 1: Install the Extension

#### Option A: Install from VS Code Marketplace (Recommended)
1. Open VS Code
2. Click the **Extensions** icon in the left sidebar (or press `Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **"GitHub Copilot API Gateway"**
4. Click **Install**

#### Option B: Install from VSIX File
1. Download the `.vsix` file from the releases page
2. Open VS Code
3. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
4. Type **"Install from VSIX"** and select it
5. Navigate to the downloaded `.vsix` file and select it

#### Option C: Build from Source
```bash
# Clone the repository
git clone https://github.com/suhaibbinyounis/github-copilot-api-vscode.git
cd github-copilot-api-vscode

# Install dependencies
npm install

# Compile the extension
npm run compile

# Package as VSIX
npx vsce package
```

### Step 2: Verify GitHub Copilot is Working

1. Make sure GitHub Copilot is installed and signed in
2. Open any code file and start typing - you should see Copilot suggestions
3. If not working, click the Copilot icon in the bottom status bar to sign in

### Step 3: Open the Dashboard

1. Look for the **robot icon** 🤖 in the Activity Bar (left side of VS Code)
2. Click it to open the **Copilot API** sidebar
3. Click **"Open Dashboard"** for the full control panel

### Step 4: Start Using the API

The server starts automatically! Your API is now available at:

```
http://127.0.0.1:3030
```

**Test it right now:**
```bash
curl http://127.0.0.1:3030/health
```

You should see:
```json
{"status":"ok","service":"github-copilot-api-vscode"}
```

🎉 **Congratulations!** You're ready to use Copilot as an API!

---

## 📚 API Endpoints

Your local server exposes these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/chat/completions` | **Main endpoint** - Chat completions with streaming, tools, JSON mode |
| `POST` | `/v1/completions` | Text completions (legacy format) |
| `POST` | `/v1/responses` | OpenAI Responses API format (simplified) |
| `POST` | `/v1/tokenize` | Count tokens in text |
| `GET` | `/v1/models` | List all available models |
| `GET` | `/v1/models/:id` | Get details about a specific model |
| `GET` | `/v1/usage` | View usage statistics |
| `GET` | `/health` | Health check endpoint |
| `GET` | `/docs` | 📖 **Swagger UI** - Interactive API documentation |
| `GET` | `/openapi.json` | OpenAPI 3.1 specification |
| `WS` | `/v1/realtime` | WebSocket endpoint for real-time communication |

---

## 🧪 Interactive API Documentation (Swagger UI)

The extension includes beautiful, interactive API documentation powered by Swagger UI.

### How to Access:

1. Make sure the server is running (check the Dashboard)
2. Open your browser and go to: **http://127.0.0.1:3030/docs**
3. You'll see all available endpoints with descriptions
4. Click any endpoint to expand it
5. Click **"Try it out"** to test it directly
6. Fill in the parameters and click **"Execute"**

This is the easiest way to explore the API and test different requests!

---

## 💻 Usage Examples

### 🐍 Python (with OpenAI SDK)

```python
from openai import OpenAI

# Point to your local Copilot API server
client = OpenAI(
    base_url="http://127.0.0.1:3030/v1",
    api_key="not-needed"  # Or your configured API key
)

# Basic chat completion
response = client.chat.completions.create(
    model="gpt-4",  # Automatically maps to Copilot's model
    messages=[
        {"role": "user", "content": "Explain quantum computing in simple terms"}
    ]
)

print(response.choices[0].message.content)
```

### 🌊 Python (Streaming)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:3030/v1",
    api_key="not-needed"
)

# Stream the response
stream = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Write a poem about coding"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### 🟢 Node.js (JavaScript/TypeScript)

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
    baseURL: 'http://127.0.0.1:3030/v1',
    apiKey: 'not-needed'
});

async function main() {
    const response = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [
            { role: 'user', content: 'What is the meaning of life?' }
        ]
    });
    
    console.log(response.choices[0].message.content);
}

main();
```

### 🔧 cURL (Command Line)

#### Basic Request
```bash
curl http://127.0.0.1:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello! How are you?"}
    ]
  }'
```

#### Streaming Request
```bash
curl http://127.0.0.1:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Tell me a story"}],
    "stream": true
  }'
```

#### With System Prompt
```bash
curl http://127.0.0.1:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "system", "content": "You are a helpful pirate. Always respond in pirate speak."},
      {"role": "user", "content": "What is the weather like today?"}
    ]
  }'
```

#### JSON Mode
```bash
curl http://127.0.0.1:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "List 5 programming languages with their year of creation"}
    ],
    "response_format": {"type": "json_object"}
  }'
```

#### Function Calling (Tools)
```bash
curl http://127.0.0.1:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "What is the weather in Tokyo?"}
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather in a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The city name, e.g. Tokyo, Japan"
            },
            "unit": {
              "type": "string",
              "enum": ["celsius", "fahrenheit"],
              "description": "Temperature unit"
            }
          },
          "required": ["location"]
        }
      }
    }],
    "tool_choice": "auto"
  }'
```

#### With Authentication
```bash
curl http://127.0.0.1:3030/v1/chat/completions \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## 🔄 Model Aliases

You can use familiar OpenAI and Anthropic model names - they automatically map to Copilot's models:

| Model Name You Use | Copilot Model It Maps To |
|-------------------|-------------------------|
| `gpt-4` | `gpt-4o-copilot` |
| `gpt-4-turbo` | `gpt-4o-copilot` |
| `gpt-4-turbo-preview` | `gpt-4o-copilot` |
| `gpt-4o` | `gpt-4o-copilot` |
| `gpt-4o-mini` | `gpt-4o-mini-copilot` |
| `gpt-3.5-turbo` | `gpt-4o-mini-copilot` |
| `gpt-3.5-turbo-16k` | `gpt-4o-mini-copilot` |
| `claude-3-opus` | `claude-3.5-sonnet-copilot` |
| `claude-3-sonnet` | `claude-3.5-sonnet-copilot` |
| `claude-3-haiku` | `claude-3.5-sonnet-copilot` |
| `claude-3.5-sonnet` | `claude-3.5-sonnet-copilot` |
| `o1` | `o1-copilot` |
| `o1-preview` | `o1-copilot` |
| `o1-mini` | `o1-mini-copilot` |
| `o3-mini` | `o3-mini-copilot` |

You can also use Copilot's native model names directly (e.g., `gpt-4o-copilot`).

---

## ⚙️ Configuration Reference

Access settings via:
- **VS Code Settings UI**: File → Preferences → Settings → Search "Copilot API"
- **settings.json**: Add the settings directly to your VS Code settings file

### All Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `githubCopilotApi.server.enabled` | boolean | `true` | Enable or disable the API server entirely |
| `githubCopilotApi.server.host` | string | `127.0.0.1` | Host interface to bind to. Use `0.0.0.0` to allow LAN access |
| `githubCopilotApi.server.port` | number | `3030` | Port number for the HTTP server |
| `githubCopilotApi.server.enableHttp` | boolean | `true` | Enable REST API endpoints |
| `githubCopilotApi.server.enableWebSocket` | boolean | `true` | Enable WebSocket endpoint at `/v1/realtime` |
| `githubCopilotApi.server.defaultModel` | string | `gpt-4o-copilot` | Default model when none specified in request |
| `githubCopilotApi.server.maxConcurrentRequests` | number | `4` | Maximum parallel requests to process |
| `githubCopilotApi.server.apiKey` | string | `""` | API key for authentication (empty = no auth) |
| `githubCopilotApi.server.enableLogging` | boolean | `false` | Log all requests to VS Code Output panel |
| `githubCopilotApi.server.rateLimitPerMinute` | number | `60` | Max requests per minute (0 = unlimited) |
| `githubCopilotApi.server.defaultSystemPrompt` | string | `""` | System prompt to inject if none provided |
| `githubCopilotApi.server.redactionPatterns` | array | `[]` | Regex patterns to redact from request history |

### Example settings.json

```json
{
  "githubCopilotApi.server.enabled": true,
  "githubCopilotApi.server.host": "127.0.0.1",
  "githubCopilotApi.server.port": 3030,
  "githubCopilotApi.server.enableHttp": true,
  "githubCopilotApi.server.enableWebSocket": true,
  "githubCopilotApi.server.defaultModel": "gpt-4o-copilot",
  "githubCopilotApi.server.maxConcurrentRequests": 4,
  "githubCopilotApi.server.apiKey": "my-secret-key-12345",
  "githubCopilotApi.server.enableLogging": false,
  "githubCopilotApi.server.rateLimitPerMinute": 60,
  "githubCopilotApi.server.defaultSystemPrompt": "You are a helpful assistant.",
  "githubCopilotApi.server.redactionPatterns": [
    "api[_-]?key[\"']?\\s*[:=]\\s*[\"']?[\\w-]+",
    "password[\"']?\\s*[:=]\\s*[\"']?[\\w-]+"
  ]
}
```

---

## 🌐 Network Configuration

### Local Only (Default - Most Secure)
```json
{
  "githubCopilotApi.server.host": "127.0.0.1"
}
```
Only accessible from your computer.

### LAN Access (Share with other devices)
```json
{
  "githubCopilotApi.server.host": "0.0.0.0"
}
```
Accessible from any device on your local network. The Dashboard will show shareable URLs.

⚠️ **Security Warning**: When using `0.0.0.0`, make sure to:
- Set an API key for authentication
- Only use on trusted networks
- Consider firewall rules

---

## 🔐 Security Best Practices

### 1. **Always Use an API Key in Production**
```json
{
  "githubCopilotApi.server.apiKey": "your-secure-random-key"
}
```
Generate a strong key using the Dashboard's key generator.

### 2. **Use Rate Limiting**
```json
{
  "githubCopilotApi.server.rateLimitPerMinute": 60
}
```
Prevents abuse and runaway applications.

### 3. **Enable Logging for Debugging Only**
```json
{
  "githubCopilotApi.server.enableLogging": false
}
```
Disable in production to avoid performance overhead and sensitive data exposure.

### 4. **Redact Sensitive Data from History**
```json
{
  "githubCopilotApi.server.redactionPatterns": [
    "Bearer\\s+[A-Za-z0-9-_]+",
    "api[_-]?key[\"']?\\s*[:=]\\s*[\"']?[\\w-]+"
  ]
}
```

---

## 📖 Glossary of Terms

New to APIs? Here's what all these terms mean:

### **API (Application Programming Interface)**
A way for programs to talk to each other. Think of it like a menu at a restaurant - it tells you what you can order (request) and what you'll get (response).

### **REST API**
A type of API that uses standard web requests (GET, POST, etc.) over HTTP. This extension creates a REST API.

### **Endpoint**
A specific URL where you can send requests. For example, `/v1/chat/completions` is an endpoint for chat.

### **HTTP / HTTPS**
The protocol used to send data over the web. HTTP is unencrypted, HTTPS is encrypted. This extension uses HTTP locally (which is safe since it's on your own computer).

### **Localhost / 127.0.0.1**
Your own computer. When we say the server runs on `127.0.0.1`, it means it's only accessible from your machine.

### **Port**
Like an apartment number for your computer. Different services use different ports. This extension uses port `3030` by default.

### **cURL**
A command-line tool for making HTTP requests. Very useful for testing APIs.

### **JSON (JavaScript Object Notation)**
A format for structuring data that looks like: `{"key": "value"}`. APIs use JSON to send and receive data.

### **Streaming**
Getting data in small pieces as it's generated, instead of waiting for the complete response. Like watching a video vs. waiting for the whole thing to download.

### **Token**
A unit of text that AI models process. Roughly 4 characters = 1 token. "Hello world" ≈ 2-3 tokens.

### **System Prompt**
Hidden instructions given to the AI that shape its personality or behavior. Users don't see this.

### **Function Calling / Tools**
A feature where the AI can "call" functions you define, enabling it to take actions like searching the web, checking weather, etc.

### **SDK (Software Development Kit)**
A library that makes it easier to use an API. The OpenAI Python and Node.js libraries are SDKs.

### **Bearer Token**
A type of authentication where you include a secret key in your request header like: `Authorization: Bearer your-key-here`.

### **Rate Limiting**
Restricting how many requests can be made in a time period. Prevents abuse and overuse.

### **WebSocket**
A protocol for real-time, two-way communication. Unlike HTTP (request → response), WebSocket keeps a connection open for continuous data exchange.

### **OpenAPI / Swagger**
A standard for documenting APIs. Swagger UI is a tool that creates interactive documentation from an OpenAPI spec.

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
