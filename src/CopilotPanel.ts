import * as vscode from 'vscode';
import { CopilotApiGateway } from './CopilotApiGateway';

export class CopilotPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'copilotApiControls';
    private _view?: vscode.WebviewView;

    // Full editor panel singleton
    private static currentPanel: vscode.WebviewPanel | undefined;
    private static panelDisposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gateway: CopilotApiGateway
    ) {
        this._gateway.onDidChangeStatus(() => {
            if (this._view) {
                this._view.webview.html = this._getSidebarHtml(this._view.webview);
            }
            // Also update the full panel if it's open
            if (CopilotPanel.currentPanel) {
                CopilotPanel.currentPanel.webview.html = CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, this._gateway);
            }
        });
    }

    /**
     * Opens the dashboard as a full-size editor panel (not a sidebar view).
     */
    public static createOrShow(extensionUri: vscode.Uri, gateway: CopilotApiGateway): void {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (CopilotPanel.currentPanel) {
            CopilotPanel.currentPanel.reveal(column);
            // Update HTML in case state changed
            CopilotPanel.currentPanel.webview.html = CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
            console.log('Copilot API Dashboard: Revealed existing panel');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'copilotApiDashboard',
            'Copilot API Dashboard',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        CopilotPanel.currentPanel = panel;

        panel.webview.html = CopilotPanel.getPanelHtml(panel.webview, gateway);
        console.log('Copilot API Dashboard: Created new panel, registering message listener');

        panel.webview.onDidReceiveMessage(
            data => {
                console.log('Copilot API Dashboard: Received message from webview:', data);
                CopilotPanel.handleMessage(data, gateway);
            },
            undefined,
            CopilotPanel.panelDisposables
        );

        panel.onDidDispose(() => {
            console.log('Copilot API Dashboard: Panel disposed');
            CopilotPanel.currentPanel = undefined;
            for (const d of CopilotPanel.panelDisposables) {
                d.dispose();
            }
            CopilotPanel.panelDisposables = [];
        }, null, CopilotPanel.panelDisposables);
    }

    private static handleMessage(data: { type: string; value?: unknown }, gateway: CopilotApiGateway): void {
        console.log('Dashboard received message:', data);
        void vscode.window.showInformationMessage(`Dashboard: ${data.type}`);
        switch (data.type) {
            case 'openChat':
                void vscode.commands.executeCommand('github-copilot-api-vscode.openCopilotChat');
                break;
            case 'askCopilot':
                void vscode.commands.executeCommand('github-copilot-api-vscode.askCopilot');
                break;
            case 'showControls':
                void vscode.commands.executeCommand('github-copilot-api-vscode.showServerControls');
                break;
            case 'startServer':
                console.log('Starting server via gateway');
                void gateway.startServer();
                break;
            case 'stopServer':
                console.log('Stopping server via gateway');
                void gateway.stopServer();
                break;
            case 'toggleHttp':
                void gateway.toggleHttp();
                break;
            case 'toggleWs':
                void gateway.toggleWebSocket();
                break;
            case 'toggleLogging':
                void gateway.toggleLogging();
                break;
            case 'setApiKey':
                if (typeof data.value === 'string') {
                    void gateway.setApiKey(data.value);
                }
                break;
            case 'setRateLimit':
                if (typeof data.value === 'number') {
                    void gateway.setRateLimit(data.value);
                }
                break;
            case 'hostLocal':
                void gateway.setHost('127.0.0.1');
                break;
            case 'hostLan':
                void gateway.setHost('0.0.0.0');
                break;
            case 'setHost':
                if (typeof data.value === 'string') {
                    void gateway.setHost(data.value);
                }
                break;
            case 'setPort':
                if (typeof data.value === 'number') {
                    void gateway.setPort(data.value);
                }
                break;
            case 'setModel':
                if (typeof data.value === 'string') {
                    void gateway.setDefaultModel(data.value);
                }
                break;
            case 'clearHistory':
                gateway.clearHistory();
                void vscode.window.showInformationMessage('Request history cleared');
                break;
            case 'addRedactionPattern':
                if (typeof data.value === 'string') {
                    void gateway.addRedactionPattern(data.value).then(success => {
                        if (success) {
                            void vscode.window.showInformationMessage('Redaction pattern added');
                        } else {
                            void vscode.window.showErrorMessage('Invalid regex pattern');
                        }
                    });
                }
                break;
            case 'removeRedactionPattern':
                if (typeof data.value === 'number') {
                    void gateway.removeRedactionPattern(data.value);
                    void vscode.window.showInformationMessage('Redaction pattern removed');
                }
                break;
            case 'getHistory':
                // Send history back to webview
                if (CopilotPanel.currentPanel) {
                    const history = gateway.getHistory(50);
                    void CopilotPanel.currentPanel.webview.postMessage({
                        type: 'historyData',
                        data: history
                    });
                }
                break;
            case 'getStats':
                // Send stats back to webview
                if (CopilotPanel.currentPanel) {
                    void CopilotPanel.currentPanel.webview.postMessage({
                        type: 'statsData',
                        data: gateway.getStats()
                    });
                }
                break;
        }
    }

    /**
     * Simple sidebar HTML that prompts user to open full dashboard
     */
    private _getSidebarHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const status = this._gateway.status;
        const isRunning = status.running;
        const statusColor = isRunning ? '#4ade80' : '#f87171';
        const statusText = isRunning ? 'Running' : 'Stopped';
        const url = `http://${status.config.host}:${status.config.port}`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 12px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
        .status { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 6px ${statusColor}; }
        .url { font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: 0.8; word-break: break-all; margin-bottom: 12px; }
        button { width: 100%; padding: 8px 12px; margin-bottom: 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-family: var(--vscode-font-family); font-weight: 500; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .hint { font-size: 11px; opacity: 0.7; text-align: center; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="status">
        <div class="dot"></div>
        <strong>${statusText}</strong>
    </div>
    <div class="url">${url}</div>
    <button id="btn-dashboard">Open Dashboard</button>
    <button id="btn-toggle" class="secondary">${isRunning ? 'Stop Server' : 'Start Server'}</button>
    <div class="hint">Use the dashboard for full controls</div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('btn-dashboard').addEventListener('click', () => {
            vscode.postMessage({ type: 'openDashboard' });
        });
        document.getElementById('btn-toggle').addEventListener('click', () => {
            vscode.postMessage({ type: '${isRunning ? 'stopServer' : 'startServer'}' });
        });
    </script>
</body>
</html>`;
    }

    private static getPanelHtml(webview: vscode.Webview, gateway: CopilotApiGateway): string {
        const nonce = getNonce();
        const status = gateway.status;
        const config = status.config;
        const isRunning = status.running;
        const statusColor = isRunning ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
        const statusText = isRunning ? 'Running' : 'Stopped';
        const url = `http://${config.host}:${config.port}`;
        const networkInfo = status.networkInfo;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http: https:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot API Dashboard</title>
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        body {
            margin: 0; padding: 0; min-height: 100vh;
            background: radial-gradient(120% 120% at 20% 20%, rgba(56,189,248,0.05), transparent),
                        radial-gradient(120% 120% at 80% 0%, rgba(147,197,253,0.05), transparent),
                        var(--vscode-editor-background);
            font-family: var(--vscode-font-family); color: var(--vscode-foreground);
        }
        .page { max-width: 1100px; margin: 0 auto; padding: 24px 24px 48px; display: flex; flex-direction: column; gap: 16px; }
        .hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .hero h1 { margin: 0; font-size: 22px; letter-spacing: -0.2px; }
        .hero p { margin: 4px 0 0 0; opacity: 0.8; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
        .card { background-color: color-mix(in srgb, var(--vscode-sideBar-background) 80%, transparent); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 14px 16px; box-shadow: 0 4px 18px rgba(0,0,0,0.08); }
        .card.full-width { grid-column: 1 / -1; }
        h3 { margin-top: 0; margin-bottom: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.8; }
        .status-row { display: flex; align-items: center; gap: 10px; font-weight: 600; }
        .status-dot { width: 12px; height: 12px; border-radius: 50%; background-color: ${statusColor}; box-shadow: 0 0 10px ${statusColor}; }
        .info-grid { display: grid; grid-template-columns: 120px 1fr; gap: 6px 12px; font-size: 12px; align-items: center; }
        .label { opacity: 0.7; text-transform: uppercase; letter-spacing: 0.3px; font-size: 11px; }
        .value { font-family: var(--vscode-editor-font-family); word-break: break-all; }
        .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
        button { display: inline-flex; justify-content: center; align-items: center; gap: 6px; width: 100%; padding: 10px 12px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid color-mix(in srgb, var(--vscode-button-background) 50%, transparent); border-radius: 6px; cursor: pointer; font-family: var(--vscode-font-family); font-weight: 600; transition: transform 120ms ease, background-color 120ms ease; }
        button:hover { background-color: var(--vscode-button-hoverBackground); transform: translateY(-1px); }
        button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        button.secondary { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        button.success { background-color: var(--vscode-testing-iconPassed); }
        button.danger { background-color: var(--vscode-testing-iconFailed); }
        .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--vscode-widget-border); }
        .toggle-row:last-child { border-bottom: none; }
        .switch { position: relative; width: 36px; height: 20px; }
        .switch input { display: none; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--vscode-input-background); border: 1px solid var(--vscode-widget-border); transition: .2s; border-radius: 999px; }
        .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: var(--vscode-foreground); transition: .2s; border-radius: 50%; }
        input:checked + .slider { background: var(--vscode-testing-iconPassed); border-color: var(--vscode-testing-iconPassed); }
        input:checked + .slider:before { transform: translateX(16px); background: var(--vscode-editor-background); }
        .muted { opacity: 0.75; font-size: 12px; }
        .stacked { display: flex; flex-direction: column; gap: 6px; }
        .inline-form { display: grid; grid-template-columns: 1fr 120px; gap: 8px; align-items: center; }
        input, select, textarea { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: var(--vscode-font-family); box-sizing: border-box; }
        textarea { font-family: var(--vscode-editor-font-family); font-size: 12px; resize: vertical; min-height: 120px; }
        select { cursor: pointer; }
        .pill-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .pill { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--vscode-widget-border); background: var(--vscode-editor-background); cursor: pointer; }
        .pill:hover { border-color: var(--vscode-testing-iconPassed); color: var(--vscode-testing-iconPassed); }
        .docs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
        .doc-card { border: 1px dashed var(--vscode-widget-border); border-radius: 8px; padding: 10px; background: color-mix(in srgb, var(--vscode-editor-background) 90%, transparent); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
        .doc-card:hover { border-color: var(--vscode-focusBorder); background: color-mix(in srgb, var(--vscode-editor-background) 70%, transparent); }
        .doc-card h4 { margin: 0 0 6px 0; font-size: 13px; display: flex; gap: 8px; align-items: center; }
        .doc-card code { display: inline-block; padding: 3px 6px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); font-family: var(--vscode-editor-font-family); }
        .doc-card p { margin: 6px 0 0 0; opacity: 0.85; font-size: 12px; }
        pre { background: var(--vscode-textBlockQuote-background); border-radius: 8px; padding: 10px; font-size: 12px; overflow-x: auto; margin: 0; white-space: pre-wrap; word-break: break-word; }
        a { color: var(--vscode-textLink-foreground); }

        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 50%; border-top-color: transparent; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="page">
        <div class="hero">
            <div>
                <div class="badge">Copilot API Gateway</div>
                <h1>Local OpenAI-compatible server</h1>
                <p>Start/stop the gateway, pick interfaces, and copy API docs from a single place.</p>
            </div>
            <div class="status-row">
                <div class="status-dot"></div>
                <div>${statusText}</div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>Server</h3>
                <div class="info-grid">
                    <div class="label">URL</div>
                    <div class="value">${url}</div>
                    <div class="label">Model</div>
                    <div class="value">${config.defaultModel}</div>
                    <div class="label">Requests</div>
                    <div class="value">${status.activeRequests} active</div>
                </div>
                ${networkInfo ? `
                <div style="margin-top: 12px; padding: 10px; background: var(--vscode-textBlockQuote-background); border-radius: 6px; border-left: 3px solid var(--vscode-textLink-foreground); overflow: hidden;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; opacity: 0.8; margin-bottom: 8px;">📡 Shareable URLs (LAN)</div>
                    <div style="display: flex; flex-direction: column; gap: 6px; overflow: hidden;">
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                            <span class="label" style="flex-shrink: 0; width: 65px;">Hostname</span>
                            <code style="background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1;">http://${networkInfo.hostname}.local:${config.port}</code>
                            <button class="secondary btn-copy-url" data-url="http://${networkInfo.hostname}.local:${config.port}" style="padding: 4px 8px; font-size: 11px; flex-shrink: 0;">Copy</button>
                        </div>
                        ${networkInfo.localIPs.map(ip => `
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                            <span class="label" style="flex-shrink: 0; width: 65px;">IP</span>
                            <code style="background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1;">http://${ip}:${config.port}</code>
                            <button class="secondary btn-copy-url" data-url="http://${ip}:${config.port}" style="padding: 4px 8px; font-size: 11px; flex-shrink: 0;">Copy</button>
                        </div>
                        `).join('')}
                    </div>
                    <div class="muted" style="font-size: 10px; margin-top: 6px;">Share these URLs with other devices on your local network</div>
                </div>
                ` : ''}
                <div class="actions" style="margin-top:10px;">
                    <button id="btn-toggle-server" data-running="${isRunning}">${isRunning ? 'Stop Server' : 'Start Server'}</button>
                    <button class="secondary" id="btn-open-chat">Open Chat</button>
                    <button class="secondary" id="btn-ask-copilot">Ask Copilot</button>
                    <button class="secondary" id="btn-settings">Settings</button>
                </div>
            </div>

            <div class="card">
                <h3>Protocols</h3>
                <div class="toggle-row">
                    <div><strong>HTTP</strong><div class="muted">REST endpoints</div></div>
                    <label class="switch"><input type="checkbox" id="toggle-http" ${config.enableHttp ? 'checked' : ''}><span class="slider"></span></label>
                </div>
                <div class="toggle-row">
                    <div><strong>WebSocket</strong><div class="muted">Realtime /v1/realtime</div></div>
                    <label class="switch"><input type="checkbox" id="toggle-ws" ${config.enableWebSocket ? 'checked' : ''}><span class="slider"></span></label>
                </div>
            </div>

            <div class="card">
                <h3>Network</h3>
                <div class="pill-row" style="margin-bottom:8px;">
                    <div class="pill" id="btn-host-local">Bind: 127.0.0.1</div>
                    <div class="pill" id="btn-host-lan">Bind: 0.0.0.0 (LAN)</div>
                </div>
                <div class="inline-form" style="margin-bottom:8px;">
                    <input id="custom-host" type="text" placeholder="Custom host" value="${config.host}" />
                    <button class="secondary" id="btn-set-host">Set Host</button>
                </div>
                <div class="inline-form">
                    <input id="custom-port" type="number" min="1" max="65535" value="${config.port}" />
                    <button class="secondary" id="btn-set-port">Set Port</button>
                </div>
            </div>

            <div class="card">
                <h3>Model</h3>
                <div class="inline-form">
                    <input id="model-input" type="text" value="${config.defaultModel}" />
                    <button class="secondary" id="btn-set-model">Save</button>
                </div>
                <div class="muted" style="margin-top:6px;">Shown by /v1/models and used as default for completions.</div>
                <details style="margin-top:10px;">
                    <summary style="cursor:pointer;font-size:12px;opacity:0.8;">Model Aliases (OpenAI → Copilot)</summary>
                    <div style="font-size:11px;margin-top:8px;padding:8px;background:var(--vscode-textBlockQuote-background);border-radius:6px;font-family:var(--vscode-editor-font-family);">
                        gpt-4 → gpt-4o-copilot<br>
                        gpt-4-turbo → gpt-4o-copilot<br>
                        gpt-4o → gpt-4o-copilot<br>
                        gpt-4o-mini → gpt-4o-mini-copilot<br>
                        gpt-3.5-turbo → gpt-4o-mini-copilot<br>
                        claude-3.5-sonnet → claude-3.5-sonnet-copilot<br>
                        o1 → o1-copilot<br>
                        o1-mini → o1-mini-copilot<br>
                        o3-mini → o3-mini-copilot
                    </div>
                </details>
            </div>

            <div class="card">
                <h3>Security & Rate Limits</h3>
                <div class="toggle-row">
                    <div><strong>Authentication</strong><div class="muted">Require Bearer token</div></div>
                    <label class="switch"><input type="checkbox" id="toggle-auth" ${config.apiKey ? 'checked' : ''}><span class="slider"></span></label>
                </div>
                <div class="inline-form" style="margin-top:8px;">
                    <input id="api-key-input" type="password" placeholder="${config.apiKey ? '••••••••' : 'Enter API key to enable auth'}" value="" />
                    <button class="secondary" id="btn-set-apikey">Set</button>
                    <button class="secondary" id="btn-generate-key" title="Generate random key">🎲</button>
                    <button class="secondary" id="btn-copy-key" title="Copy current API key">📋</button>
                    <button class="secondary" id="btn-show-key" title="Show/hide key">👁</button>
                </div>
                <div class="toggle-row" style="margin-top:8px;">
                    <div><strong>Request Logging</strong><div class="muted">Log requests to output</div></div>
                    <label class="switch"><input type="checkbox" id="toggle-logging" ${config.enableLogging ? 'checked' : ''}><span class="slider"></span></label>
                </div>
                <div class="inline-form" style="margin-top:8px;">
                    <input id="rate-limit-input" type="number" min="0" placeholder="Requests/min" value="${config.rateLimitPerMinute}" />
                    <button class="secondary" id="btn-set-ratelimit">Set Limit</button>
                </div>
                <div class="muted" style="margin-top:6px;">Rate limit: ${config.rateLimitPerMinute > 0 ? config.rateLimitPerMinute + ' req/min' : 'Disabled (0)'}</div>
            </div>
        </div>

        <div class="card full-width">
            <h3>📖 API Documentation</h3>
            <p style="margin: 0 0 12px 0;">Interactive OpenAPI/Swagger documentation with try-it-out functionality.</p>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <a href="${url}/docs" target="_blank" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 6px; text-decoration: none; font-weight: 500;">
                    <span>🔗 Open Swagger UI</span>
                </a>
                <a href="${url}/openapi.json" target="_blank" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-widget-border); border-radius: 6px; text-decoration: none;">
                    <span>📄 OpenAPI Spec (JSON)</span>
                </a>
            </div>
            <div class="muted" style="margin-top: 12px;">Full API reference at <code>${url}/docs</code> — test endpoints directly in your browser</div>
        </div>

        <div class="card full-width">
            <h3>📊 Real-time Stats</h3>
            <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
                <div class="stat-box" style="background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700;" id="stat-requests">${status.stats?.totalRequests ?? 0}</div>
                    <div class="muted" style="font-size: 11px;">Total Requests</div>
                </div>
                <div class="stat-box" style="background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700;" id="stat-rpm">${status.realtimeStats?.requestsPerMinute ?? 0}</div>
                    <div class="muted" style="font-size: 11px;">Requests/min</div>
                </div>
                <div class="stat-box" style="background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700;" id="stat-latency">${status.realtimeStats?.avgLatencyMs ?? 0}<span style="font-size: 12px;">ms</span></div>
                    <div class="muted" style="font-size: 11px;">Avg Latency</div>
                </div>
                <div class="stat-box" style="background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700;" id="stat-tokens-in">${status.stats?.totalTokensIn ?? 0}</div>
                    <div class="muted" style="font-size: 11px;">Tokens In</div>
                </div>
                <div class="stat-box" style="background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700;" id="stat-tokens-out">${status.stats?.totalTokensOut ?? 0}</div>
                    <div class="muted" style="font-size: 11px;">Tokens Out</div>
                </div>
                <div class="stat-box" style="background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700;" id="stat-errors" style="color: ${(status.realtimeStats?.errorRate ?? 0) > 10 ? 'var(--vscode-testing-iconFailed)' : 'inherit'};">${status.realtimeStats?.errorRate ?? 0}<span style="font-size: 12px;">%</span></div>
                    <div class="muted" style="font-size: 11px;">Error Rate</div>
                </div>
            </div>
            <div class="muted" style="margin-top: 10px; font-size: 11px;">
                Uptime: <span id="stat-uptime">${Math.floor((status.stats?.uptimeMs ?? 0) / 60000)}</span> minutes
                • History: <span id="stat-history-count">${status.historyCount ?? 0}</span> entries
            </div>
        </div>

        <div class="card full-width">
            <h3>📜 Request History</h3>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <button class="secondary" id="btn-refresh-history">🔄 Refresh</button>
                <button class="secondary" id="btn-clear-history">🗑️ Clear History</button>
            </div>
            <div id="history-container" style="max-height: 400px; overflow-y: auto;">
                <div class="muted">Click "Refresh" to load request history</div>
            </div>
        </div>

        <div class="card full-width">
            <h3>🔒 Data Redaction</h3>
            <div class="muted" style="margin-bottom: 10px;">Add regex patterns to automatically redact sensitive information from request history (e.g., API keys, passwords, emails).</div>
            <div class="inline-form" style="margin-bottom: 12px;">
                <input id="redaction-pattern-input" type="text" placeholder="Regex pattern (e.g., password|secret|api[_-]?key)" style="flex: 1;" />
                <button class="secondary" id="btn-add-redaction">Add Pattern</button>
                <button class="secondary" id="btn-test-redaction" title="Test pattern">🧪</button>
            </div>
            <div id="redaction-patterns-list" style="display: flex; flex-direction: column; gap: 6px;">
                ${config.redactionPatterns && config.redactionPatterns.length > 0 ? config.redactionPatterns.map((pattern: string, index: number) => `
                <div class="redaction-pattern" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--vscode-textBlockQuote-background); border-radius: 6px;">
                    <code style="flex: 1; font-size: 12px; word-break: break-all;">${pattern}</code>
                    <button class="secondary btn-remove-redaction" data-index="${index}" style="padding: 4px 8px; font-size: 11px;">Remove</button>
                </div>
                `).join('') : '<div class="muted">No redaction patterns configured</div>'}
            </div>
            <details style="margin-top: 12px;">
                <summary style="cursor: pointer; font-size: 12px; opacity: 0.8;">Example Patterns</summary>
                <div style="font-size: 11px; margin-top: 8px; padding: 8px; background: var(--vscode-textBlockQuote-background); border-radius: 6px;">
                    <code>password|passwd|pwd</code> - Passwords<br>
                    <code>api[_-]?key|apikey|secret[_-]?key</code> - API Keys<br>
                    <code>[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}</code> - Email addresses<br>
                    <code>\\b\\d{3}-\\d{2}-\\d{4}\\b</code> - SSN format<br>
                    <code>\\b\\d{16}\\b</code> - Credit card numbers (basic)
                </div>
            </details>
        </div>

        <div class="card full-width" style="background: linear-gradient(135deg, color-mix(in srgb, var(--vscode-sideBar-background) 90%, #3b82f6 10%), color-mix(in srgb, var(--vscode-sideBar-background) 95%, #8b5cf6 5%));">
            <h3>👨‍💻 About</h3>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 200px;">
                    <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">Suhaib Bin Younis</div>
                    <div class="muted" style="margin-bottom: 8px;">Developer & Creator</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <a href="https://suhaibbinyounis.com" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">🌐 Website</a>
                        <a href="https://suhaib.in" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">🔗 suhaib.in</a>
                        <a href="mailto:vscode@suhaib.in" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">📧 Email</a>
                        <a href="https://github.com/pmbyt/github-copilot-api-vscode" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">⭐ Star on GitHub</a>
                    </div>
                </div>
                <div class="muted" style="font-size: 11px; text-align: right;">
                    GitHub Copilot API Gateway v0.0.1<br>
                    Made with ❤️ and ☕
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        var vscode = acquireVsCodeApi();

        document.getElementById('btn-toggle-server').onclick = function() {
            var running = this.getAttribute('data-running') === 'true';
            vscode.postMessage({ type: running ? 'stopServer' : 'startServer' });
        };

        document.getElementById('btn-open-chat').onclick = function() {
            vscode.postMessage({ type: 'openChat' });
        };

        document.getElementById('btn-ask-copilot').onclick = function() {
            vscode.postMessage({ type: 'askCopilot' });
        };

        document.getElementById('btn-settings').onclick = function() {
            vscode.postMessage({ type: 'showControls' });
        };

        document.getElementById('toggle-http').onchange = function() {
            vscode.postMessage({ type: 'toggleHttp' });
        };

        document.getElementById('toggle-ws').onchange = function() {
            vscode.postMessage({ type: 'toggleWs' });
        };

        document.getElementById('toggle-logging').onchange = function() {
            vscode.postMessage({ type: 'toggleLogging' });
        };

        // Store the current API key for copy functionality
        var currentApiKey = '${config.apiKey || ''}';

        document.getElementById('toggle-auth').onchange = function() {
            if (!this.checked) {
                // Disable auth by clearing API key
                currentApiKey = '';
                vscode.postMessage({ type: 'setApiKey', value: '' });
            } else {
                // Generate a random key when enabling
                var key = 'sk-' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
                document.getElementById('api-key-input').value = key;
                document.getElementById('api-key-input').type = 'text';
                currentApiKey = key;
                vscode.postMessage({ type: 'setApiKey', value: key });
            }
        };

        document.getElementById('btn-set-apikey').onclick = function() {
            var v = document.getElementById('api-key-input').value.trim();
            currentApiKey = v;
            vscode.postMessage({ type: 'setApiKey', value: v });
            if (v) {
                document.getElementById('toggle-auth').checked = true;
            }
        };

        document.getElementById('btn-generate-key').onclick = function() {
            var key = 'sk-' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
            document.getElementById('api-key-input').value = key;
            document.getElementById('api-key-input').type = 'text';
            currentApiKey = key;
            vscode.postMessage({ type: 'setApiKey', value: key });
            document.getElementById('toggle-auth').checked = true;
        };

        document.getElementById('btn-copy-key').onclick = function() {
            var input = document.getElementById('api-key-input');
            var keyToCopy = input.value.trim() || currentApiKey;
            if (keyToCopy) {
                navigator.clipboard.writeText(keyToCopy).then(function() {
                    var btn = document.getElementById('btn-copy-key');
                    btn.textContent = '✓';
                    setTimeout(function() { btn.textContent = '📋'; }, 1500);
                });
            }
        };

        document.getElementById('btn-show-key').onclick = function() {
            var input = document.getElementById('api-key-input');
            var btn = document.getElementById('btn-show-key');
            if (input.type === 'password') {
                input.type = 'text';
                if (!input.value && currentApiKey) {
                    input.value = currentApiKey;
                }
                btn.textContent = '🙈';
            } else {
                input.type = 'password';
                btn.textContent = '👁';
            }
        };

        document.getElementById('btn-set-ratelimit').onclick = function() {
            var v = document.getElementById('rate-limit-input').value;
            vscode.postMessage({ type: 'setRateLimit', value: Number(v) || 0 });
        };

        document.getElementById('btn-host-local').onclick = function() {
            vscode.postMessage({ type: 'hostLocal' });
        };

        document.getElementById('btn-host-lan').onclick = function() {
            vscode.postMessage({ type: 'hostLan' });
        };

        // Copy URL buttons for shareable LAN URLs
        document.querySelectorAll('.btn-copy-url').forEach(function(btn) {
            btn.onclick = function() {
                var url = btn.getAttribute('data-url');
                if (url) {
                    navigator.clipboard.writeText(url).then(function() {
                        var originalText = btn.textContent;
                        btn.textContent = '✓ Copied!';
                        setTimeout(function() { btn.textContent = originalText; }, 1500);
                    });
                }
            };
        });

        document.getElementById('btn-set-host').onclick = function() {
            var v = document.getElementById('custom-host').value;
            if (v) vscode.postMessage({ type: 'setHost', value: v });
        };

        document.getElementById('btn-set-port').onclick = function() {
            var v = document.getElementById('custom-port').value;
            if (v) vscode.postMessage({ type: 'setPort', value: Number(v) });
        };

        document.getElementById('btn-set-model').onclick = function() {
            var v = document.getElementById('model-input').value;
            if (v) vscode.postMessage({ type: 'setModel', value: v });
        };

        // Request History handlers
        document.getElementById('btn-refresh-history').onclick = function() {
            vscode.postMessage({ type: 'getHistory' });
        };

        document.getElementById('btn-clear-history').onclick = function() {
            if (confirm('Are you sure you want to clear all request history?')) {
                vscode.postMessage({ type: 'clearHistory' });
                document.getElementById('history-container').innerHTML = '<div class="muted">History cleared</div>';
            }
        };

        // Redaction pattern handlers
        document.getElementById('btn-add-redaction').onclick = function() {
            var pattern = document.getElementById('redaction-pattern-input').value.trim();
            if (pattern) {
                vscode.postMessage({ type: 'addRedactionPattern', value: pattern });
                document.getElementById('redaction-pattern-input').value = '';
            }
        };

        document.getElementById('btn-test-redaction').onclick = function() {
            var pattern = document.getElementById('redaction-pattern-input').value.trim();
            if (!pattern) {
                alert('Enter a pattern first');
                return;
            }
            try {
                var regex = new RegExp(pattern, 'gi');
                var testStr = prompt('Enter test string to check redaction:', 'my-api-key-12345');
                if (testStr) {
                    var result = testStr.replace(regex, '[REDACTED]');
                    alert('Result: ' + result);
                }
            } catch (e) {
                alert('Invalid regex pattern: ' + e.message);
            }
        };

        // Remove redaction pattern buttons
        document.querySelectorAll('.btn-remove-redaction').forEach(function(btn) {
            btn.onclick = function() {
                var index = parseInt(btn.getAttribute('data-index'));
                vscode.postMessage({ type: 'removeRedactionPattern', value: index });
            };
        });

        // Handle messages from extension
        window.addEventListener('message', function(event) {
            var message = event.data;
            if (message.type === 'historyData') {
                renderHistory(message.data);
            } else if (message.type === 'statsData') {
                updateStats(message.data);
            }
        });

        function renderHistory(history) {
            var container = document.getElementById('history-container');
            if (!history || history.length === 0) {
                container.innerHTML = '<div class="muted">No requests recorded yet</div>';
                return;
            }

            var html = history.map(function(entry, index) {
                var statusColor = entry.status < 400 ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
                var timestamp = new Date(entry.timestamp).toLocaleString();
                return '<details style="margin-bottom: 8px; background: var(--vscode-textBlockQuote-background); border-radius: 6px; overflow: hidden;">' +
                    '<summary style="padding: 10px; cursor: pointer; display: flex; align-items: center; gap: 10px;">' +
                        '<span style="font-weight: 600; color: ' + statusColor + ';">' + entry.status + '</span>' +
                        '<code style="font-size: 11px;">' + entry.method + ' ' + entry.path + '</code>' +
                        '<span class="muted" style="font-size: 10px;">' + entry.durationMs + 'ms</span>' +
                        '<span class="muted" style="font-size: 10px; margin-left: auto;">' + timestamp + '</span>' +
                    '</summary>' +
                    '<div style="padding: 10px; border-top: 1px solid var(--vscode-widget-border);">' +
                        '<div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 11px; margin-bottom: 8px;">' +
                            '<div class="label">ID</div><div class="value">' + entry.id + '</div>' +
                            '<div class="label">Model</div><div class="value">' + (entry.model || 'N/A') + '</div>' +
                            '<div class="label">Tokens</div><div class="value">In: ' + (entry.tokensIn || 0) + ' / Out: ' + (entry.tokensOut || 0) + '</div>' +
                        '</div>' +
                        (entry.error ? '<div style="color: var(--vscode-testing-iconFailed); margin-bottom: 8px;">Error: ' + entry.error + '</div>' : '') +
                        (entry.requestPayload ? '<details style="margin-bottom: 6px;"><summary style="cursor: pointer; font-size: 11px;">Request Payload</summary><pre style="font-size: 10px; margin: 4px 0; padding: 8px; background: var(--vscode-textCodeBlock-background); border-radius: 4px; overflow: auto; max-height: 200px;">' + JSON.stringify(entry.requestPayload, null, 2) + '</pre></details>' : '') +
                        (entry.responsePayload ? '<details><summary style="cursor: pointer; font-size: 11px;">Response Payload</summary><pre style="font-size: 10px; margin: 4px 0; padding: 8px; background: var(--vscode-textCodeBlock-background); border-radius: 4px; overflow: auto; max-height: 200px;">' + JSON.stringify(entry.responsePayload, null, 2) + '</pre></details>' : '') +
                    '</div>' +
                '</details>';
            }).join('');

            container.innerHTML = html;
        }

        function updateStats(stats) {
            if (stats.totalRequests !== undefined) document.getElementById('stat-requests').textContent = stats.totalRequests;
            if (stats.requestsPerMinute !== undefined) document.getElementById('stat-rpm').textContent = stats.requestsPerMinute;
            if (stats.avgLatencyMs !== undefined) document.getElementById('stat-latency').innerHTML = stats.avgLatencyMs + '<span style="font-size: 12px;">ms</span>';
            if (stats.totalTokensIn !== undefined) document.getElementById('stat-tokens-in').textContent = stats.totalTokensIn;
            if (stats.totalTokensOut !== undefined) document.getElementById('stat-tokens-out').textContent = stats.totalTokensOut;
            if (stats.errorRate !== undefined) document.getElementById('stat-errors').innerHTML = stats.errorRate + '<span style="font-size: 12px;">%</span>';
            if (stats.uptimeMs !== undefined) document.getElementById('stat-uptime').textContent = Math.floor(stats.uptimeMs / 60000);
        }

        // Auto-refresh stats every 5 seconds
        setInterval(function() {
            vscode.postMessage({ type: 'getStats' });
        }, 5000);

        // Load history on page load
        vscode.postMessage({ type: 'getHistory' });
    </script>
</body>
</html>`;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getSidebarHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'openDashboard':
                    CopilotPanel.createOrShow(this._extensionUri, this._gateway);
                    break;
                case 'startServer':
                    void this._gateway.startServer();
                    break;
                case 'stopServer':
                    void this._gateway.stopServer();
                    break;
            }
        });
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
