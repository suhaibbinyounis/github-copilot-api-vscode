import * as vscode from 'vscode';
import { CopilotApiGateway } from './CopilotApiGateway';
import { PerfMetrics } from './services/PerfMetrics';

type GatewayStatus = Awaited<ReturnType<CopilotApiGateway['getStatus']>>;
type StatsSnapshot = {
    stats: GatewayStatus['stats'];
    realtimeStats: GatewayStatus['realtimeStats'] & { activeConnections: number };
};
type AuditSummarySnapshot = {
    totalSavings: string;
    todaySavings: string;
    totalRequests: number;
    avgLatency: number;
};

type WebviewTarget = 'sidebar' | 'dashboard' | 'wiki';

export class CopilotPanel implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'copilotApiControls';
    private _view?: vscode.WebviewView;
    private _viewDisposables: vscode.Disposable[] = [];
    private _statusDisposables: vscode.Disposable[] = [];

    // Full editor panel singleton
    private static currentPanel: vscode.WebviewPanel | undefined;
    // Track previous state to prevent unnecessary re-renders
    private _lastRunningState: boolean | undefined;
    private _lastTunnelState: boolean | undefined;
    private static panelDisposables: vscode.Disposable[] = [];

    private _gateway: CopilotApiGateway | undefined;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gatewayAccessor: () => Promise<CopilotApiGateway>
    ) {
        // Initialize gateway if already available, or wait for first access
        void this._init();
    }

    private async _init() {
        // We don't force creation here. If it's created, we hook up.
        // But how do we know if it's created?
        // We can poll or rely on the accessor being called when the view is resolved.
        // Actually, for the sidebar, resolveWebviewView will be called.
    }

    public dispose(): void {
        this._view = undefined;
        this._disposeDisposables(this._viewDisposables);
        this._disposeDisposables(this._statusDisposables);
    }

    private _disposeDisposables(disposables: vscode.Disposable[]): void {
        for (const disposable of disposables.splice(0)) {
            disposable.dispose();
        }
    }

    private _rememberStructuralState(status: GatewayStatus): void {
        this._lastRunningState = status.running;
        this._lastTunnelState = status.tunnel?.running ?? false;
    }

    private _hasStructuralStateChanged(status: GatewayStatus): boolean {
        return this._lastRunningState !== status.running || this._lastTunnelState !== (status.tunnel?.running ?? false);
    }

    private static _buildStatsSnapshot(status: GatewayStatus, gateway: CopilotApiGateway): StatsSnapshot {
        return {
            stats: status.stats,
            realtimeStats: {
                ...status.realtimeStats,
                activeConnections: gateway.getServerStatus().activeConnections
            }
        };
    }

    private static async _postStatsSnapshot(webview: vscode.Webview, snapshot: StatsSnapshot): Promise<void> {
        await this._postWebviewMessage('dashboard', webview, { type: 'statsSnapshot', data: snapshot });
    }

    private static _formatSavings(amount: number): string {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }

    private static async _buildAuditSummarySnapshot(gateway: CopilotApiGateway): Promise<AuditSummarySnapshot> {
        const auditService = gateway.getAuditService();
        const [lifetimeStats, todayStats] = await Promise.all([
            auditService.getLifetimeStats(),
            auditService.getTodayStats()
        ]);

        const priceIn = 2.0 / 1_000_000;
        const priceOut = 8.0 / 1_000_000;
        const totalSavings = (lifetimeStats.totalTokensIn * priceIn) + (lifetimeStats.totalTokensOut * priceOut);
        const todaySavings = (todayStats.tokensIn * priceIn) + (todayStats.tokensOut * priceOut);

        return {
            totalSavings: this._formatSavings(totalSavings),
            todaySavings: this._formatSavings(todaySavings),
            totalRequests: lifetimeStats.totalRequests || 0,
            avgLatency: todayStats.avgLatency || 0
        };
    }

    private static _getEmptyAuditSummarySnapshot(): AuditSummarySnapshot {
        return {
            totalSavings: this._formatSavings(0),
            todaySavings: this._formatSavings(0),
            totalRequests: 0,
            avgLatency: 0
        };
    }

    private static _setWebviewHtml(target: WebviewTarget, webview: vscode.Webview, html: string): void {
        PerfMetrics.recordWebviewHtmlWrite(target, html.length);
        webview.html = html;
    }

    private static _postWebviewMessage<T extends { type: string }>(target: WebviewTarget, webview: vscode.Webview, message: T): Thenable<boolean> {
        PerfMetrics.recordWebviewMessageSent(target, message.type);
        return webview.postMessage(message);
    }

    private static async _refreshCurrentPanelHtml(gateway: CopilotApiGateway): Promise<void> {
        if (!this.currentPanel) {
            return;
        }

        this._setWebviewHtml('dashboard', this.currentPanel.webview, await this.getPanelHtml(this.currentPanel.webview, gateway));
    }

    private async _postStatsSnapshotToVisibleViews(snapshot: StatsSnapshot): Promise<void> {
        const postTasks: Thenable<boolean>[] = [];

        if (this._view?.visible) {
            postTasks.push(CopilotPanel._postWebviewMessage('sidebar', this._view.webview, { type: 'statsSnapshot', data: snapshot }));
        }
        if (CopilotPanel.currentPanel?.visible) {
            postTasks.push(CopilotPanel._postWebviewMessage('dashboard', CopilotPanel.currentPanel.webview, { type: 'statsSnapshot', data: snapshot }));
        }

        if (postTasks.length > 0) {
            await Promise.all(postTasks);
        }
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._disposeDisposables(this._viewDisposables);
        this._view = webviewView;
        PerfMetrics.recordSidebarResolve();

        // When view is resolved (visible), we MUST have the gateway
        this._gateway = await this._gatewayAccessor();
        this._hookEvents(this._gateway);

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        const updateHtml = async () => {
            if (this._gateway) {
                const status = await this._gateway.getStatus();
                this._rememberStructuralState(status);
                CopilotPanel._setWebviewHtml('sidebar', webviewView.webview, await this._getSidebarHtml(webviewView.webview, status));
            }
        };

        await updateHtml();

        this._viewDisposables.push(
            webviewView.onDidDispose(() => {
                if (this._view === webviewView) {
                    this._view = undefined;
                }
                this._disposeDisposables(this._viewDisposables);
            })
        );

        this._viewDisposables.push(webviewView.webview.onDidReceiveMessage(async data => {
            PerfMetrics.recordWebviewMessageReceived('sidebar', data.type);
            if (!this._gateway) { return; }
            switch (data.type) {
                case 'openDashboard':
                    await CopilotPanel.createOrShow(this._extensionUri, this._gatewayAccessor);
                    break;
                case 'startServer':
                            void this._gateway.startServer()
                                .finally(async () => {
                                    await updateHtml();
                                });
                    break;
                case 'stopServer':
                            void this._gateway.stopServer()
                                .finally(async () => {
                                    await updateHtml();
                                });
                    break;
                case 'openSwagger': {
                    const status = await this._gateway.getStatus();
                    const swaggerUrl = `http://${status.config.host}:${status.config.port}/docs`;
                    vscode.env.openExternal(vscode.Uri.parse(swaggerUrl));
                    break;
                }
                case 'openWiki':
                    await CopilotPanel.openWiki(this._extensionUri, this._gateway);
                    break;
                case 'openUrl':
                    if (typeof data.value === 'string') {
                        void vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(data.value));
                    }
                    break;
                case 'editSystemPrompt':
                    void vscode.commands.executeCommand('github-copilot-api-vscode.editSystemPrompt');
                    break;
                case 'switchModel':
                    void vscode.commands.executeCommand('github-copilot-api-vscode.showServerControls');
                    break;
                default:
                    CopilotPanel.handleMessage(data, this._gateway);
            }
        }));
    }

    private _hookEvents(gateway: CopilotApiGateway) {
        this._disposeDisposables(this._statusDisposables);

        this._statusDisposables.push(gateway.onDidChangeStatus(async () => {
            PerfMetrics.recordStatusEvent();
            const status = await gateway.getStatus();

            // Check if critical state changed (Running vs Stopped, or Tunnel state)
            // If just stats changed, send data update message instead of re-rendering HTML
            if (!this._hasStructuralStateChanged(status)) {
                await this._postStatsSnapshotToVisibleViews(CopilotPanel._buildStatsSnapshot(status, gateway));
                return;
            }

            // Critical state change (Start/Stop or Tunnel change) - Re-render HTML
            this._rememberStructuralState(status);

            if (this._view) {
                CopilotPanel._setWebviewHtml('sidebar', this._view.webview, await this._getSidebarHtml(this._view.webview, status));
            }
            // Also update the full panel if it's open
            if (CopilotPanel.currentPanel) {
                CopilotPanel._setWebviewHtml('dashboard', CopilotPanel.currentPanel.webview, await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway, status));
            }
        }));
        this._statusDisposables.push(gateway.onDidLogRequest(log => {
            // console.log('[CopilotPanel] onDidLogRequest fired', log.requestId);
            if (this._view?.visible) {
                void CopilotPanel._postWebviewMessage('sidebar', this._view.webview, { type: 'liveLog', value: log });
            }
            if (CopilotPanel.currentPanel?.visible) {
                void CopilotPanel._postWebviewMessage('dashboard', CopilotPanel.currentPanel.webview, { type: 'liveLog', value: log });
            }
        }));
        this._statusDisposables.push(gateway.onDidLogRequestStart(startLog => {
            // Show pending request immediately in Live Log Tail
            if (this._view?.visible) {
                void CopilotPanel._postWebviewMessage('sidebar', this._view.webview, { type: 'liveLogStart', value: startLog });
            }
            if (CopilotPanel.currentPanel?.visible) {
                void CopilotPanel._postWebviewMessage('dashboard', CopilotPanel.currentPanel.webview, { type: 'liveLogStart', value: startLog });
            }
        }));
    }

    /**
     * Opens the dashboard as a full-size editor panel (not a sidebar view).
     * @param scrollTarget Optional target to scroll to after opening (e.g., 'wiki')
     */
    public static async createOrShow(extensionUri: vscode.Uri, gatewayAccessor: () => Promise<CopilotApiGateway>, scrollTarget?: string): Promise<void> {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
        const gateway = await gatewayAccessor(); // Force init for dashboard

        if (CopilotPanel.currentPanel) {
            PerfMetrics.recordDashboardReveal();
            CopilotPanel.currentPanel.reveal(column);
            const status = await gateway.getStatus();
            await CopilotPanel._postStatsSnapshot(CopilotPanel.currentPanel.webview, CopilotPanel._buildStatsSnapshot(status, gateway));
            void CopilotPanel._postWebviewMessage('dashboard', CopilotPanel.currentPanel.webview, { type: 'requestRefresh' });
            // If scroll target provided, send message to scroll
            if (scrollTarget) {
                CopilotPanel._postWebviewMessage('dashboard', CopilotPanel.currentPanel.webview, { type: 'scrollTo', target: scrollTarget });
            }
            return;
        }

        PerfMetrics.recordDashboardCreate();

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

        // Set up message listener BEFORE setting HTML to prevent race condition
        panel.webview.onDidReceiveMessage(
            data => {
                PerfMetrics.recordWebviewMessageReceived('dashboard', data.type);
                CopilotPanel.handleMessage(data, gateway);
            },
            undefined,
            CopilotPanel.panelDisposables
        );

        const initialStatus = await gateway.getStatus();
        CopilotPanel._setWebviewHtml('dashboard', panel.webview, await CopilotPanel.getPanelHtml(panel.webview, gateway, initialStatus));

        // If scroll target provided, send message after a short delay to ensure DOM is ready
        if (scrollTarget) {
            setTimeout(() => {
                void CopilotPanel._postWebviewMessage('dashboard', panel.webview, { type: 'scrollTo', target: scrollTarget });
            }, 300);
        }

        panel.onDidDispose(() => {
            CopilotPanel.currentPanel = undefined;
            for (const d of CopilotPanel.panelDisposables) {
                d.dispose();
            }
            CopilotPanel.panelDisposables = [];
        }, null, CopilotPanel.panelDisposables);
    }

    // Wiki panel singleton
    private static wikiPanel: vscode.WebviewPanel | undefined;

    /**
     * Opens the API Usage Guide (Wiki) as a separate editor panel.
     */
    public static async openWiki(extensionUri: vscode.Uri, gateway: CopilotApiGateway): Promise<void> {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (CopilotPanel.wikiPanel) {
            CopilotPanel.wikiPanel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'copilotApiWiki',
            '📚 API Usage Guide',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        CopilotPanel.wikiPanel = panel;
        CopilotPanel._setWebviewHtml('wiki', panel.webview, await CopilotPanel.getWikiHtml(panel.webview, gateway));

        panel.onDidDispose(() => {
            CopilotPanel.wikiPanel = undefined;
        });
    }

    /**
     * Generates the HTML for the Wiki panel
     */
    private static async getWikiHtml(webview: vscode.Webview, gateway: CopilotApiGateway): Promise<string> {
        const nonce = getNonce();
        const status = await gateway.getStatus();
        const config = status.config;
        const isRunning = status.running;
        const activeConnections = gateway.getServerStatus().activeConnections;

        // Calculate Savings
        const auditService = gateway.getAuditService();
        const lifetime = await auditService.getLifetimeStats();
        const today = await auditService.getTodayStats();

        // GPT-4.1 Pricing (approximate, as of 2025)
        const PRICE_IN = 2.00 / 1000000;
        const PRICE_OUT = 8.00 / 1000000;

        const savedTotal = (lifetime.totalTokensIn * PRICE_IN) + (lifetime.totalTokensOut * PRICE_OUT);
        const savedToday = (today.tokensIn * PRICE_IN) + (today.tokensOut * PRICE_OUT);

        const formatMoney = (amount: number) => {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
        };

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>API Usage Guide</title>
    <style>
        /* Wiki UI Variables */
        :root {
            --ui-bg-base: var(--vscode-editor-background);
            --ui-bg-card: color-mix(in srgb, var(--vscode-editorWidget-background) 50%, var(--vscode-editor-background));
            --ui-border-soft: color-mix(in srgb, var(--vscode-widget-border) 60%, transparent);
            --ui-border-hover: var(--vscode-focusBorder);
            --ui-text-primary: var(--vscode-foreground);
            --ui-text-muted: var(--vscode-descriptionForeground);
            --ui-accent: var(--vscode-button-background);
            --ui-accent-hover: var(--vscode-button-hoverBackground);
            
            --ease-smooth: cubic-bezier(0.25, 1, 0.5, 1);
        }

        body {
            margin: 0; padding: 0; min-height: 100vh;
            background-color: var(--ui-bg-base);
            font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: var(--ui-text-primary);
            font-size: 14px;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
            max-width: 900px; /* Constrain width for readability */
            margin: 0 auto;
            padding: 40px 32px 64px;
        }

        h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; font-weight: 700; color: var(--ui-text-primary); margin-bottom: 8px; }
        h4 { color: var(--vscode-textLink-foreground); margin: 32px 0 16px; font-size: 16px; font-weight: 600; }
        
        .muted { color: var(--ui-text-muted); font-size: 14px; }
        a { color: var(--vscode-textLink-foreground); text-decoration: none; font-weight: 500; transition: color 0.1s; }
        a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }

        /* Modern Tabs (Pill style) */
        #wiki-tabs {
            display: flex; gap: 8px; margin: 32px 0 24px; flex-wrap: wrap;
            padding-bottom: 16px; border-bottom: 1px solid var(--ui-border-soft);
        }
        .wiki-tab {
            padding: 8px 16px; border: 1px solid var(--ui-border-soft); border-radius: 999px;
            cursor: pointer; font-size: 13px; font-weight: 600;
            background: color-mix(in srgb, var(--ui-bg-card) 50%, transparent);
            color: var(--ui-text-primary);
            transition: all 0.2s var(--ease-smooth);
            font-family: inherit;
        }
        .wiki-tab:hover {
            border-color: var(--ui-border-hover);
            transform: translateY(-1px);
        }
        .wiki-tab.active {
            background: var(--ui-accent);
            color: var(--vscode-button-foreground);
            border-color: transparent;
            box-shadow: 0 4px 12px color-mix(in srgb, var(--ui-accent) 30%, transparent);
        }

        /* Content Area */
        .wiki-panel {
            display: none; animation: slide-up 0.3s var(--ease-smooth);
        }
        .wiki-panel.active { display: block; }
        
        @keyframes slide-up {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Code Blocks */
        pre {
            background: #000; color: #d4d4d4;
            padding: 20px; border-radius: 12px;
            overflow-x: auto; font-size: 13px;
            font-family: var(--vscode-editor-font-family);
            border: 1px solid #333;
            box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);
            line-height: 1.5; margin: 0 0 24px;
        }
        code {
            font-size: 13px; color: var(--vscode-textPreformat-foreground); font-weight: 600;
            background: color-mix(in srgb, var(--vscode-textPreformat-foreground) 10%, transparent);
            padding: 2px 6px; border-radius: 4px; font-family: var(--vscode-editor-font-family);
        }
        pre code { background: transparent; padding: 0; font-weight: 400; }

        /* Tool Cards */
        .tool-card {
            background: var(--ui-bg-card);
            padding: 20px; border-radius: 12px;
            border-left: 4px solid var(--vscode-textLink-foreground);
            border-top: 1px solid var(--ui-border-soft);
            border-right: 1px solid var(--ui-border-soft);
            border-bottom: 1px solid var(--ui-border-soft);
            margin-bottom: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.04);
            transition: transform 0.2s var(--ease-smooth), box-shadow 0.2s;
        }
        .tool-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.08);
        }
    </style>
</head>
<body>
    <h1>📚 API Usage Guide</h1>
    <p class="muted">Complete reference for connecting to the Copilot API Gateway from various languages.</p>

    <div id="wiki-tabs">
        <button class="wiki-tab active" data-tab="python">🐍 Python</button>
        <button class="wiki-tab" data-tab="javascript">📜 Node.js</button>
        <button class="wiki-tab" data-tab="curl">🔧 cURL</button>
        <button class="wiki-tab" data-tab="mcp">🔌 MCP Tools</button>
    </div>

    <div id="wiki-content">
        <!-- Python Tab -->
        <div class="wiki-panel active" data-panel="python">
            <h4 style="margin-top: 0;">📦 Installation</h4>
            <pre>pip install openai</pre>

            <h4>🚀 Quick Start</h4>
            <pre>from openai import OpenAI

client = OpenAI(
    base_url="http://${config.host}:${config.port}/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)</pre>

            <h4>📡 Streaming</h4>
            <pre>stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)</pre>
        </div>

        <!-- JavaScript Tab -->
        <div class="wiki-panel" data-panel="javascript">
            <h4 style="margin-top: 0;">📦 Installation</h4>
            <pre>npm install openai</pre>

            <h4>🚀 Quick Start</h4>
            <pre>import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://${config.host}:${config.port}/v1',
  apiKey: 'not-needed'
});

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(completion.choices[0].message.content);</pre>

            <h4>📡 Streaming</h4>
            <pre>const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}</pre>
        </div>

        <!-- cURL Tab -->
        <div class="wiki-panel" data-panel="curl">
            <h4 style="margin-top: 0;">🔧 Basic Request</h4>
            <pre>curl -X POST http://${config.host}:${config.port}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'</pre>

            <h4>📡 Streaming</h4>
            <pre>curl -X POST http://${config.host}:${config.port}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'</pre>

            <h4>📋 List Models</h4>
            <pre>curl http://${config.host}:${config.port}/v1/models</pre>
        </div>

        <!-- MCP Tab -->
        <div class="wiki-panel" data-panel="mcp">
            <h4 style="margin-top: 0;">🔌 Built-in VS Code Tools</h4>
            <p class="muted">These tools are automatically available via MCP:</p>

            <div class="tool-card" style="border-left-color: #10b981;">
                <code>vscode_read_file</code>
                <div class="muted" style="font-size: 11px; margin-top: 4px;">Read the contents of any file in the workspace</div>
            </div>

            <div class="tool-card" style="border-left-color: #3b82f6;">
                <code>vscode_list_files</code>
                <div class="muted" style="font-size: 11px; margin-top: 4px;">List files in a directory with optional glob pattern</div>
            </div>

            <div class="tool-card" style="border-left-color: #f59e0b;">
                <code>vscode_open_file</code>
                <div class="muted" style="font-size: 11px; margin-top: 4px;">Open a file in VS Code editor</div>
            </div>

            <div class="tool-card" style="border-left-color: #ef4444;">
                <code>vscode_get_diagnostics</code>
            <h4 style="margin-top: 0;">🔌 Model Context Protocol (MCP)</h4>
            <p>Connect GitHub Copilot to your local tools and data using the <a href="https://modelcontextprotocol.io">Model Context Protocol</a>.</p>

            <h4>1. Configuration</h4>
            <p>Edit your VS Code <code>settings.json</code> to add MCP servers:</p>
            <pre>{
  "githubCopilotApi.mcp.enabled": true,
  "githubCopilotApi.mcp.servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}</pre>

            <p>Once configured, restart the server. Tools provided by these servers (e.g., <code>read_file</code>, <code>query_database</code>) will be automatically available to the API.</p>
            <p>You can then use them in your API requests by enabling tool use, or letting your agent framework discover them.</p>

            <div class="tool-card" style="border-left-color: var(--ui-accent);">
                <strong style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 18px;">💡</span> Pro Tip:</strong>
                <div style="margin-top: 8px; opacity: 0.8; font-size: 13px;">Use the "Tools" tab in the dashboard (coming soon) to verify connected servers and see available tools.</div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const tabs = document.querySelectorAll('.wiki-tab');
        const panels = document.querySelectorAll('.wiki-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));

                // Add active class to clicked tab and corresponding panel
                tab.classList.add('active');
                const panelId = tab.getAttribute('data-tab');
                document.querySelector(\`.wiki-panel[data-panel="\${panelId}"]\`).classList.add('active');
            });
        });
    </script>
</body>
</html>`;
    }

    private static handleMessage(data: { type: string; value?: unknown }, gateway: CopilotApiGateway): void {
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
                void gateway.startServer()
                    .finally(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                break;
            case 'stopServer':
                void gateway.stopServer()
                    .finally(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                break;
            case 'openUrl':
                console.log('[CopilotPanel] Opening URL:', data.value);
                if (typeof data.value === 'string') {
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(data.value));
                }
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
            case 'toggleHttps':
                void gateway.toggleHttps();
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
                break;
            case 'toggleMcp':
                if (typeof data.value === 'boolean') {
                    void gateway.toggleMcp(data.value);
                }
                break;
            case 'startTunnel':
                void gateway.startTunnel().then(async result => {
                    if (!result.success) {
                        void vscode.window.showErrorMessage(result.error || 'Failed to start tunnel');
                    } else {
                        void vscode.window.showInformationMessage(`Tunnel active at: ${result.url}`);
                    }
                    await CopilotPanel._refreshCurrentPanelHtml(gateway);
                });
                break;
            case 'stopTunnel':
                void gateway.stopTunnel().then(async () => {
                    await CopilotPanel._refreshCurrentPanelHtml(gateway);
                });
                break;
            case 'addRedactionPattern':
                if (data.value && typeof data.value === 'object') {
                    const { name, pattern } = data.value as { name: string; pattern: string };
                    void gateway.addRedactionPattern(name, pattern).then(async success => {
                        if (!success) {
                            void vscode.window.showErrorMessage('Invalid regex pattern');
                        } else {
                            await CopilotPanel._refreshCurrentPanelHtml(gateway);
                        }
                    });
                }
                break;
            case 'removeRedactionPattern':
                if (typeof data.value === 'string') {
                    void gateway.removeRedactionPattern(data.value).then(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                }
                break;
            case 'toggleRedactionPattern':
                if (data.value && typeof data.value === 'object') {
                    const { id, enabled } = data.value as { id: string; enabled: boolean };
                    void gateway.toggleRedactionPattern(id, enabled);
                    // Don't refresh entire page - toggle state is already updated in the UI
                    // The state is persisted to config for next load
                }
                break;
            case 'addIpAllowlistEntry':
                if (typeof data.value === 'string') {
                    void gateway.addIpAllowlistEntry(data.value).then(async success => {
                        if (!success) {
                            void vscode.window.showErrorMessage('Invalid IP address or CIDR range');
                        } else {
                            await CopilotPanel._refreshCurrentPanelHtml(gateway);
                        }
                    });
                }
                break;
            case 'removeIpAllowlistEntry':
                if (typeof data.value === 'string') {
                    void gateway.removeIpAllowlistEntry(data.value).then(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                }
                break;
            case 'setRequestTimeout':
                if (typeof data.value === 'number') {
                    void gateway.setRequestTimeout(data.value).then(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                }
                break;
            case 'setMaxPayloadSize':
                if (typeof data.value === 'number') {
                    void gateway.setMaxPayloadSize(data.value).then(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                }
                break;
            case 'setMaxConnectionsPerIp':
                if (typeof data.value === 'number') {
                    void gateway.setMaxConnectionsPerIp(data.value).then(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                }
                break;
            case 'setCloudflaredPath':
                if (typeof data.value === 'string') {
                    void gateway.setCloudflaredPath(data.value).then(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                }
                break;
            case 'setMaxConcurrency':
                if (typeof data.value === 'number') {
                    void gateway.setMaxConcurrency(data.value).then(async () => {
                        await CopilotPanel._refreshCurrentPanelHtml(gateway);
                    });
                }
                break;
            case 'getHistory':
                if (CopilotPanel.currentPanel) {
                    const history = gateway.getHistory(50);
                    void CopilotPanel._postWebviewMessage('dashboard', CopilotPanel.currentPanel.webview, {
                        type: 'historyData',
                        data: history
                    });
                }
                break;
            case 'getStats':
                // Send stats back to webview
                if (CopilotPanel.currentPanel) {
                    const stats = gateway.getStats();
                    const activeConnections = gateway.getServerStatus().activeConnections;
                    void CopilotPanel._postWebviewMessage('dashboard', CopilotPanel.currentPanel.webview, {
                        type: 'statsData',
                        data: stats
                    });
                    // Also send realtime stats with activeConnections for connections card
                    void CopilotPanel._postWebviewMessage('dashboard', CopilotPanel.currentPanel.webview, {
                        type: 'realtimeStats',
                        data: { requestsPerMinute: stats.requestsPerMinute, avgLatencyMs: stats.avgLatencyMs, errorRate: stats.errorRate, activeConnections }
                    });
                }
                break;
            case 'getAuditStats':
                if (CopilotPanel.currentPanel) {
                    // Send daily stats for charts
                    void gateway.getDailyStats(30).then(stats => {
                        const panel = CopilotPanel.currentPanel;
                        if (!panel) {
                            return;
                        }
                        void CopilotPanel._postWebviewMessage('dashboard', panel.webview, {
                            type: 'auditStatsData',
                            data: stats
                        });
                    });
                }
                break;
            case 'getAuditSnapshot':
                if (CopilotPanel.currentPanel) {
                    const val = data.value as any || {};
                    const page = val.page || 1;
                    const pageSize = val.pageSize || 10;
                    const days = val.days || 30;

                    void Promise.allSettled([
                        CopilotPanel._buildAuditSummarySnapshot(gateway),
                        gateway.getDailyStats(days),
                        gateway.getAuditLogs(page, pageSize)
                    ]).then(results => {
                        const panel = CopilotPanel.currentPanel;
                        if (!panel) {
                            return;
                        }

                        const summary = results[0].status === 'fulfilled'
                            ? results[0].value
                            : CopilotPanel._getEmptyAuditSummarySnapshot();
                        const dailyStats = results[1].status === 'fulfilled' ? results[1].value : [];
                        const auditLogs = results[2].status === 'fulfilled'
                            ? results[2].value
                            : { total: 0, entries: [] };

                        if (results[0].status === 'rejected') {
                            console.error('[CopilotPanel] Error building audit summary snapshot:', results[0].reason);
                        }
                        if (results[1].status === 'rejected') {
                            console.error('[CopilotPanel] Error getting audit stats:', results[1].reason);
                        }
                        if (results[2].status === 'rejected') {
                            console.error('[CopilotPanel] Error getting audit logs:', results[2].reason);
                        }

                        void CopilotPanel._postWebviewMessage('dashboard', panel.webview, {
                            type: 'auditSnapshotData',
                            summary,
                            dailyStats,
                            logData: auditLogs.entries,
                            page,
                            total: auditLogs.total,
                            pageSize
                        });
                    });
                }
                break;
            case 'getAuditLogs':
                console.log('[CopilotPanel] Received getAuditLogs request');
                if (CopilotPanel.currentPanel) {
                    const val = data.value as any || {};
                    const page = val.page || 1;
                    const pageSize = val.pageSize || 10;
                    gateway.getAuditLogs(page, pageSize).then(res => {
                        console.log('[CopilotPanel] Got audit logs:', res.total, 'total,', res.entries.length, 'entries');
                        const panel = CopilotPanel.currentPanel;
                        if (!panel) {
                            return;
                        }
                        void CopilotPanel._postWebviewMessage('dashboard', panel.webview, {
                            type: 'auditLogData',
                            data: res.entries,
                            page: page,
                            total: res.total,
                            pageSize: pageSize
                        });
                    }).catch(err => {
                        console.error('[CopilotPanel] Error getting audit logs:', err);
                        // Send empty result on error
                        const panel = CopilotPanel.currentPanel;
                        if (!panel) {
                            return;
                        }
                        void CopilotPanel._postWebviewMessage('dashboard', panel.webview, {
                            type: 'auditLogData',
                            data: [],
                            page: page,
                            total: 0,
                            pageSize: pageSize
                        });
                    });
                } else {
                    console.warn('[CopilotPanel] No currentPanel available for getAuditLogs response');
                }
                break;
            case 'openLogFolder':
                const logPath = gateway.getLogFolderPath();
                if (logPath) {
                    void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(logPath));
                } else {
                    void vscode.window.showErrorMessage('Log folder not found');
                }
                break;
            case 'editSystemPrompt':
                void vscode.commands.executeCommand('github-copilot-api-vscode.editSystemPrompt');
                break;
        }
    }

    /**
     * Enhanced sidebar HTML with sections and analytics
     */
    private async _getSidebarHtml(webview: vscode.Webview, prefetchedStatus?: GatewayStatus): Promise<string> {
        const nonce = getNonce();
        if (!this._gateway) {
            return '<p>Loading...</p>';
        }
        const status = prefetchedStatus ?? await this._gateway.getStatus();
        const isRunning = status.running;
        const statusColor = isRunning ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
        const statusText = isRunning ? 'Running' : 'Stopped';
        const protocol = status.isHttps ? 'https' : 'http';
        // Show actual LAN IP instead of 0.0.0.0
        const displayHost = (status.config.host === '0.0.0.0' && status.networkInfo?.localIPs?.length)
            ? status.networkInfo.localIPs[0]
            : status.config.host;
        const url = `${protocol}://${displayHost}:${status.config.port}`;

        // Get stats for charts
        const stats = status.stats || { totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0, requestsPerMinute: 0, avgLatencyMs: 0, uptimeMs: 0, startTime: Date.now() };
        const realtimeStats = status.realtimeStats || { requestsPerMinute: 0, avgLatencyMs: 0, errorRate: 0 };

        // Get recent history for live feed
        const recentHistory = this._gateway.getHistory(5);

        // Get daily stats for mini chart (last 7 days)
        const dailyStats = await this._gateway.getDailyStats(7);
        const maxRequests = Math.max(...dailyStats.map(d => d.totalRequests), 1);

        // Generate SVG bar chart for last 7 days
        const barWidth = 20;
        const barGap = 6;
        const chartHeight = 50;
        const chartWidth = (barWidth + barGap) * 7;

        const barsHtml = dailyStats.map((day, i) => {
            const height = Math.max(2, (day.totalRequests / maxRequests) * chartHeight);
            const x = i * (barWidth + barGap);
            const y = chartHeight - height;
            const dayLabel = new Date(day.date).toLocaleDateString('en', { weekday: 'short' }).charAt(0);
            return `
                <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="3" fill="var(--vscode-charts-blue)" opacity="0.8"/>
                <text x="${x + barWidth / 2}" y="${chartHeight + 12}" font-size="8" fill="var(--vscode-descriptionForeground)" text-anchor="middle">${dayLabel}</text>
            `;
        }).join('');

        // Config toggles state
        const hasAuth = !!status.config.apiKey;
        const isHttps = status.isHttps;

        // Format uptime
        const uptimeMs = stats.uptimeMs || 0;
        const startTime = stats.startTime || Date.now();

        // Recent history HTML
        const feedHtml = recentHistory.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const methodColor = entry.method === 'POST' ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-blue)';
            const statusClass = (entry.status && entry.status < 400) ? 'success' : 'error';
            const statusColor2 = statusClass === 'success' ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
            const path = entry.path?.length > 22 ? '…' + entry.path.slice(-20) : (entry.path || '/');
            return `<div class="feed-item">
                <span class="feed-time">${time}</span>
                <span class="feed-method" style="color:${methodColor}">${entry.method || 'POST'}</span>
                <span class="feed-path">${path}</span>
                <span class="feed-status" style="color:${statusColor2}">${entry.status || '—'}</span>
                <span class="feed-latency">${entry.durationMs || 0}ms</span>
            </div>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* Sidebar Modern UI Variables */
        :root {
            --ui-bg-base: var(--vscode-sideBar-background);
            --ui-bg-card: var(--vscode-editor-background);
            --ui-border-soft: color-mix(in srgb, var(--vscode-widget-border) 50%, transparent);
            --ui-border-hover: var(--vscode-focusBorder);
            --ui-text-primary: var(--vscode-foreground);
            --ui-text-muted: var(--vscode-descriptionForeground);
            --ui-accent: var(--vscode-button-background);
            --ui-accent-hover: var(--vscode-button-hoverBackground);
        }

        body { 
            margin: 0; padding: 0; 
            font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: var(--ui-text-primary); 
            background: var(--ui-bg-base); 
            font-size: 13px;
        }
        
        .section { padding: 16px; border-bottom: 1px solid var(--ui-border-soft); }
        .section:last-child { border-bottom: none; }
        .section-title { 
            font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; 
            color: var(--ui-text-muted); font-weight: 700; 
            margin-bottom: 12px; display: flex; align-items: center; gap: 8px; 
        }
        
        .status-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .dot { 
            width: 10px; height: 10px; border-radius: 50%; 
            background: ${statusColor}; 
            box-shadow: 0 0 0 3px color-mix(in srgb, ${statusColor} 20%, transparent); 
            transition: all 0.3s ease; 
        }
        ${isRunning ? '.dot { animation: pulse-dot 2s ease-in-out infinite; }' : ''}
        @keyframes pulse-dot { 
            0% { box-shadow: 0 0 0 0 color-mix(in srgb, ${statusColor} 40%, transparent); } 
            70% { box-shadow: 0 0 0 8px transparent; }
            100% { box-shadow: 0 0 0 0 transparent; } 
        }
        
        .url { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--ui-text-muted); word-break: break-all; }
        .uptime { font-size: 11px; color: var(--ui-text-muted); margin-top: 6px; font-family: var(--vscode-editor-font-family); }
        
        .model-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        .model-label { font-size: 11px; color: var(--ui-text-muted); }
        .model-name { font-size: 11px; font-weight: 600; color: var(--vscode-textLink-foreground); cursor: pointer; transition: color 0.1s; }
        .model-name:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
        
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .stat-card { 
            background: var(--ui-bg-card); border-radius: 8px; padding: 10px 12px; 
            text-align: center; border: 1px solid var(--ui-border-soft); 
            transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease; 
        }
        .stat-card:hover { 
            border-color: var(--ui-border-hover); 
            transform: translateY(-1px);
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }
        
        .stat-value { font-size: 18px; font-weight: 700; color: var(--ui-text-primary); }
        .stat-label { font-size: 9px; text-transform: uppercase; color: var(--ui-text-muted); margin-top: 4px; letter-spacing: 0.05em; font-weight: 600; }
        
        .chart-container { 
            background: var(--ui-bg-card); border-radius: 8px; padding: 16px; 
            border: 1px solid var(--ui-border-soft); box-shadow: inset 0 1px 3px rgba(0,0,0,0.02);
        }
        .chart-title { font-size: 11px; font-weight: 600; margin-bottom: 12px; color: var(--ui-text-muted); }
        
        button { 
            width: 100%; padding: 8px 12px; margin-bottom: 8px; 
            background: var(--ui-accent); color: var(--vscode-button-foreground); 
            border: none; border-radius: 6px; cursor: pointer; 
            font-family: inherit; font-weight: 600; font-size: 12px; 
            transition: all 0.2s ease; 
        }
        button:hover { background: var(--ui-accent-hover); transform: translateY(-1px); }
        button:active { transform: scale(0.98); }
        button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--ui-border-soft); }
        button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ui-border-hover); }
        
        .btn-row { display: flex; gap: 8px; margin-bottom: 8px; }
        .btn-row button { flex: 1; margin-bottom: 0; }
        
        .copilot-status { font-size: 11px; color: var(--ui-text-muted); display: flex; align-items: center; gap: 6px; margin-top: 6px; }
        .copilot-dot { width: 8px; height: 8px; border-radius: 50%; }

        /* Live Feed */
        .feed-container { 
            background: #000; border-radius: 8px; border: 1px solid var(--ui-border-soft); 
            overflow: hidden; 
        }
        .feed-item { 
            display: flex; align-items: center; gap: 8px; padding: 6px 10px; 
            font-size: 11px; font-family: var(--vscode-editor-font-family); 
            border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.1s ease; 
        }
        .feed-item:last-child { border-bottom: none; }
        .feed-item:hover { background: rgba(255,255,255,0.05); }
        .feed-item.new { animation: feed-flash 0.5s ease; }
        @keyframes feed-flash { 
            from { background: rgba(255,255,255,0.1); } 
            to { background: transparent; } 
        }
        .feed-time { color: #858585; min-width: 55px; }
        .feed-method { font-weight: 700; min-width: 35px; color: #569cd6 !important; }
        .feed-path { flex: 1; color: #ce9178; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .feed-status { font-weight: 600; min-width: 25px; text-align: right; }
        .feed-latency { color: #858585; min-width: 40px; text-align: right; }
        .feed-empty { padding: 16px; text-align: center; font-size: 11px; color: #858585; }

        /* Config Toggles */
        .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
        .toggle-label { font-size: 12px; display: flex; align-items: center; gap: 8px; font-weight: 500; }
        .toggle-indicator { width: 10px; height: 10px; border-radius: 50%; }
        .toggle-on { background: var(--vscode-testing-iconPassed); box-shadow: 0 0 6px color-mix(in srgb, var(--vscode-testing-iconPassed) 40%, transparent); }
        .toggle-off { background: var(--ui-text-muted); opacity: 0.3; }
    </style>
</head>
<body>
    <!-- Status Section -->
    <div class="section">
        <div class="section-title">☁️ Server Status</div>
        <div class="status-row">
            <div class="dot"></div>
            <strong style="font-size: 15px;">${statusText}</strong>
        </div>
        <div class="url">${url}</div>
        <div class="model-row">
            <span class="model-label">Global Model:</span>
            <span class="model-name" id="model-name" title="Click to switch model">${status.config.defaultModel || 'gpt-4o'}</span>
        </div>
        ${isRunning ? `<div class="uptime" id="uptime-display">⏱ Uptime: calculating...</div>` : ''}
        <div class="copilot-status" style="margin-top: 10px; padding: 6px; background: color-mix(in srgb, var(--vscode-editor-background) 50%, transparent); border-radius: 6px; border: 1px solid var(--ui-border-soft);">
            <div class="copilot-dot" style="background: ${status.copilot.ready ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-editorWarning-foreground)'}"></div>
            <span>Copilot: <strong style="color: var(--ui-text-primary);">${status.copilot.ready ? 'Ready' : (status.copilot.signedIn ? 'Checking...' : 'Sign-in Needed')}</strong></span>
        </div>
    </div>

    <!-- Quick Copy Section -->
    <div class="section">
        <div class="section-title">📋 Connect</div>
        <div class="btn-row">
            <button id="btn-copy-url" class="secondary" title="Copy API URL">API URL</button>
            <button id="btn-copy-curl" class="secondary" title="Copy curl command">cURL</button>
            <button id="btn-copy-python" class="secondary" title="Copy Python snippet">Python</button>
        </div>
    </div>

    <!-- Primary Actions -->
    <div class="section">
        <div class="section-title">⚡ Power Commands</div>
        <button id="btn-toggle" data-running="${isRunning}" style="height: 36px; font-size: 13px;">${isRunning ? '⏹ Stop Gateway' : '▶ Start Gateway'}</button>
        <button id="btn-dashboard" style="height: 36px; font-size: 13px; background: color-mix(in srgb, var(--vscode-charts-blue) 80%, transparent); color: #fff;">📊 Open Full Dashboard</button>
        <button id="btn-swagger" class="secondary" style="height: 32px;">📝 View Swagger Docs</button>
    </div>

    <!-- Live Stats Section -->
    <div class="section">
        <div class="section-title">📈 Live Performance</div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value" id="stat-rpm">${realtimeStats.requestsPerMinute}</div>
                <div class="stat-label">Req/Min</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="stat-latency">${realtimeStats.avgLatencyMs}<span style="font-size: 11px; opacity: 0.5;">ms</span></div>
                <div class="stat-label">Avg Latency</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="stat-total" style="font-size: 16px;">${this.formatNumber(stats.totalRequests)}</div>
                <div class="stat-label">Total Traffic</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="stat-errors" style="font-size: 16px; color: ${(realtimeStats.errorRate || 0) > 0 ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconPassed)'};">${realtimeStats.errorRate || 0}%</div>
                <div class="stat-label">Error Rate</div>
            </div>
        </div>

        <div class="chart-container">
            <div class="chart-title" style="display: flex; justify-content: space-between;">
                <span>Volume (7 Days)</span>
            </div>
            <svg width="${chartWidth}" height="${chartHeight + 16}" style="display: block; margin: 0 auto; overflow: visible;">
                ${barsHtml}
            </svg>
        </div>
    </div>

    <!-- Live Request Feed -->
    <div class="section">
        <div class="section-title">⚡ Live Traffic Feed</div>
        <div class="feed-container" id="feed-container">
            ${feedHtml || '<div class="feed-empty">Listening for requests...</div>'}
        </div>
    </div>

    <!-- Config Status -->
    <div class="section">
        <div class="section-title">🔧 Environment</div>
        <div class="toggle-row">
            <span class="toggle-label"><span class="toggle-indicator ${hasAuth ? 'toggle-on' : 'toggle-off'}"></span> Authentication</span>
            <span style="font-size: 11px; color: var(--ui-text-muted); font-weight: 500;">${hasAuth ? '🔒 Secure' : '🔓 Open'}</span>
        </div>
        <div class="toggle-row">
            <span class="toggle-label"><span class="toggle-indicator ${isHttps ? 'toggle-on' : 'toggle-off'}"></span> Encrypted (HTTPS)</span>
            <span style="font-size: 11px; color: var(--ui-text-muted); font-weight: 500;">${isHttps ? '✅ Active' : 'Off'}</span>
        </div>
        <div class="toggle-row">
            <span class="toggle-label"><span class="toggle-indicator ${status.tunnel?.running ? 'toggle-on' : 'toggle-off'}"></span> Public Tunnel</span>
            <span style="font-size: 11px; color: var(--ui-text-muted); font-weight: 500;">${status.tunnel?.running ? '🌐 Live' : 'Off'}</span>
        </div>
    </div>


    <!-- More Actions -->
    <div class="section">
        <div class="section-title">More</div>
        <button id="btn-edit-system-prompt" class="secondary">📝 System Prompt</button>
        <button id="btn-wiki" class="secondary">📚 Wiki</button>
        <button id="btn-docs" class="secondary">📚 How to Use</button>
        <button id="btn-notes" class="secondary">📖 Things you should read</button>
    </div>

    <!-- GitHub Star Section -->
    <div class="section" style="text-align: center; padding: 16px 12px;">
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <a href="https://github.com/suhaibbinyounis/github-copilot-api-vscode" 
               target="_blank" 
               style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 6px; text-decoration: none; font-size: 12px; font-weight: 500; transition: background 0.15s ease;">
                ⭐ Star
            </a>
            <a href="https://github.com/sponsors/suhaibbinyounis" 
               target="_blank" 
               style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: linear-gradient(135deg, #ea4aaa 0%, #db61a2 100%); color: white; border-radius: 6px; text-decoration: none; font-size: 12px; font-weight: 500; transition: opacity 0.15s ease;">
                💖 Sponsor
            </a>
        </div>
        <div style="margin-top: 10px; font-size: 10px; opacity: 0.65; line-height: 1.4;">
            Enjoying this extension? A star helps others discover it.<br>
            If it's saved you time or money, consider sponsoring — it keeps this project alive. 💙
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const serverUrl = '${url}';
        const serverStartTime = ${startTime};
        const isRunning = ${isRunning};
        const curlCommand = \`curl -X POST ${url}/v1/chat/completions \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}'\`;
        const pythonCode = \`from openai import OpenAI

client = OpenAI(base_url="${url}/v1", api_key="optional")
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)\`;

        function copyWithFeedback(btn, text) {
            navigator.clipboard.writeText(text).then(() => {
                const original = btn.textContent;
                btn.textContent = '✓ Copied!';
                btn.style.background = 'var(--vscode-testing-iconPassed)';
                btn.style.color = 'var(--vscode-editor-background)';
                setTimeout(() => {
                    btn.textContent = original;
                    btn.style.background = '';
                    btn.style.color = '';
                }, 1500);
            });
        }

        function setSidebarToggleState(button, running, pending) {
            if (!button) {
                return;
            }

            button.disabled = !!pending;
            button.dataset.running = running ? 'true' : 'false';
            button.textContent = running ? '⏹ Stop Gateway' : '▶ Start Gateway';
        }

        // Uptime ticker
        if (isRunning) {
            const uptimeEl = document.getElementById('uptime-display');
            function updateUptime() {
                const elapsed = Date.now() - serverStartTime;
                const s = Math.floor(elapsed / 1000);
                const m = Math.floor(s / 60);
                const h = Math.floor(m / 60);
                const d = Math.floor(h / 24);
                let str = '';
                if (d > 0) str += d + 'd ';
                if (h > 0) str += (h % 24) + 'h ';
                str += (m % 60) + 'm ' + (s % 60) + 's';
                if (uptimeEl) uptimeEl.textContent = '⏱ ' + str;
            }
            updateUptime();
            setInterval(updateUptime, 1000);
        }

        // Button handlers
        document.getElementById('btn-copy-url')?.addEventListener('click', (e) => copyWithFeedback(e.target, serverUrl));
        document.getElementById('btn-copy-curl')?.addEventListener('click', (e) => copyWithFeedback(e.target, curlCommand));
        document.getElementById('btn-copy-python')?.addEventListener('click', (e) => copyWithFeedback(e.target, pythonCode));
        document.getElementById('btn-dashboard')?.addEventListener('click', () => vscode.postMessage({ type: 'openDashboard' }));
        document.getElementById('btn-toggle')?.addEventListener('click', (event) => {
            const button = event.currentTarget;
            const running = button?.dataset?.running === 'true';
            setSidebarToggleState(button, !running, true);
            vscode.postMessage({ type: running ? 'stopServer' : 'startServer' });
        });
        document.getElementById('btn-edit-system-prompt')?.addEventListener('click', () => vscode.postMessage({ type: 'editSystemPrompt' }));
        document.getElementById('btn-swagger')?.addEventListener('click', () => vscode.postMessage({ type: 'openSwagger' }));
        document.getElementById('btn-wiki')?.addEventListener('click', () => vscode.postMessage({ type: 'openWiki' }));
        document.getElementById('model-name')?.addEventListener('click', () => vscode.postMessage({ type: 'switchModel' }));
        const btnDocs = document.getElementById('btn-docs');
        if (btnDocs) {
            btnDocs.addEventListener('click', () => vscode.postMessage({ type: 'openUrl', value: 'https://notes.suhaib.in/docs/vscode/extensions/github-copilot-api-gateway/' }));
        }
        const btnNotes = document.getElementById('btn-notes');
        if (btnNotes) {
            btnNotes.addEventListener('click', () => vscode.postMessage({ type: 'openUrl', value: 'https://notes.suhaib.in' }));
        }

        // Live feed management
        const feedContainer = document.getElementById('feed-container');
        const MAX_FEED_ITEMS = 5;

        function addFeedItem(log) {
            // Remove empty message if present
            const empty = feedContainer.querySelector('.feed-empty');
            if (empty) empty.remove();

            const time = new Date(log.timestamp || Date.now()).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const methodColor = log.method === 'POST' ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-blue)';
            const statusOk = log.status && log.status < 400;
            const statusColor = statusOk ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
            const path = (log.path || '/').length > 22 ? '…' + (log.path || '/').slice(-20) : (log.path || '/');

            const item = document.createElement('div');
            item.className = 'feed-item new';
            item.innerHTML = \`
                <span class="feed-time">\${time}</span>
                <span class="feed-method" style="color:\${methodColor}">\${log.method || 'POST'}</span>
                <span class="feed-path">\${path}</span>
                <span class="feed-status" style="color:\${statusColor}">\${log.status || '…'}</span>
                <span class="feed-latency">\${log.latencyMs || 0}ms</span>
            \`;

            feedContainer.insertBefore(item, feedContainer.firstChild);

            // Trim to max items
            while (feedContainer.children.length > MAX_FEED_ITEMS) {
                feedContainer.removeChild(feedContainer.lastChild);
            }

            // Remove animation class after it plays
            setTimeout(() => item.classList.remove('new'), 500);
        }

        function updatePendingFeed(startLog) {
            const empty = feedContainer.querySelector('.feed-empty');
            if (empty) empty.remove();

            const time = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const methodColor = startLog.method === 'POST' ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-blue)';
            const path = (startLog.path || '/').length > 22 ? '…' + (startLog.path || '/').slice(-20) : (startLog.path || '/');

            const item = document.createElement('div');
            item.className = 'feed-item new';
            item.setAttribute('data-request-id', startLog.requestId || '');
            item.innerHTML = \`
                <span class="feed-time">\${time}</span>
                <span class="feed-method" style="color:\${methodColor}">\${startLog.method || 'POST'}</span>
                <span class="feed-path">\${path}</span>
                <span class="feed-status" style="opacity:0.4">…</span>
                <span class="feed-latency" style="opacity:0.4">—</span>
            \`;

            feedContainer.insertBefore(item, feedContainer.firstChild);
            while (feedContainer.children.length > MAX_FEED_ITEMS) {
                feedContainer.removeChild(feedContainer.lastChild);
            }
            setTimeout(() => item.classList.remove('new'), 500);
        }

        // Listen for real-time stats updates from extension
        function formatNumber(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'statsSnapshot' && message.data) {
                const snapshot = message.data;
                if (snapshot.stats) {
                    const totalEl = document.getElementById('stat-total');
                    if (totalEl) totalEl.textContent = formatNumber(snapshot.stats.totalRequests || 0);
                }
                if (snapshot.realtimeStats) {
                    const rpmEl = document.getElementById('stat-rpm');
                    const latencyEl = document.getElementById('stat-latency');
                    const errEl = document.getElementById('stat-errors');
                    if (rpmEl) rpmEl.textContent = snapshot.realtimeStats.requestsPerMinute;
                    if (latencyEl) latencyEl.innerHTML = snapshot.realtimeStats.avgLatencyMs + '<span style="font-size: 10px; opacity: 0.6;">ms</span>';
                    if (errEl) {
                        errEl.textContent = (snapshot.realtimeStats.errorRate || 0) + '%';
                        errEl.style.color = (snapshot.realtimeStats.errorRate || 0) > 0 ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconPassed)';
                    }
                }
            }
            if (message.type === 'realtimeStats' && message.data) {
                const stats = message.data;
                const rpmEl = document.getElementById('stat-rpm');
                const latencyEl = document.getElementById('stat-latency');
                const errEl = document.getElementById('stat-errors');
                if (rpmEl) rpmEl.textContent = stats.requestsPerMinute;
                if (latencyEl) latencyEl.innerHTML = stats.avgLatencyMs + '<span style="font-size: 10px; opacity: 0.6;">ms</span>';
                if (errEl) {
                    errEl.textContent = (stats.errorRate || 0) + '%';
                    errEl.style.color = (stats.errorRate || 0) > 0 ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconPassed)';
                }
            }
            if (message.type === 'statsData' && message.data) {
                const stats = message.data;
                const tokensInEl = document.getElementById('stat-tokens-in');
                const tokensOutEl = document.getElementById('stat-tokens-out');
                const totalEl = document.getElementById('stat-total');
                if (tokensInEl) tokensInEl.textContent = formatNumber(stats.totalTokensIn);
                if (tokensOutEl) tokensOutEl.textContent = formatNumber(stats.totalTokensOut);
                if (totalEl) totalEl.textContent = formatNumber(stats.totalRequests);
            }
            if (message.type === 'liveLog' && message.value) {
                addFeedItem(message.value);
            }
            if (message.type === 'liveLogStart' && message.value) {
                updatePendingFeed(message.value);
            }
        });
    </script>
</body>
</html>`;
    }

    private formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    private static async getPanelHtml(webview: vscode.Webview, gateway: CopilotApiGateway, prefetchedStatus?: GatewayStatus): Promise<string> {
        const nonce = getNonce();
        const status = prefetchedStatus ?? await gateway.getStatus();
        const config = status.config;
        const isRunning = status.running;
        const statusColor = isRunning ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
        const statusText = isRunning ? 'Running' : 'Stopped';
        const protocol = status.isHttps ? 'https' : 'http';
        const networkInfo = status.networkInfo;
        // Show actual LAN IP instead of 0.0.0.0
        const displayHost = (config.host === '0.0.0.0' && networkInfo?.localIPs?.length)
            ? networkInfo.localIPs[0]
            : config.host;
        const url = `${protocol}://${displayHost}:${config.port}`;
        const activeConnections = gateway.getServerStatus().activeConnections;
        const buildInfo = gateway.getBuildInfo();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src http: https:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot API Dashboard</title>
    <title>Copilot API Dashboard</title>
    <!-- Removed Chart.js for reliability -->
    <style>
        :root {
            /* Animation timings */
            --ease-smooth: cubic-bezier(0.25, 1, 0.5, 1);
            --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
            /* Base Colors (Adaptive via VS Code) */
            --ui-bg-base: var(--vscode-editor-background);
            --ui-bg-card: var(--vscode-editorWidget-background);
            --ui-border-soft: color-mix(in srgb, var(--vscode-widget-border) 60%, transparent);
            --ui-border-hover: var(--vscode-focusBorder);
            --ui-text-primary: var(--vscode-foreground);
            --ui-text-muted: var(--vscode-descriptionForeground);
            --ui-accent: var(--vscode-button-background);
            --ui-accent-hover: var(--vscode-button-hoverBackground);
            
            /* Enhanced Card Shadows */
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
            --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
            --shadow-lg: 0 12px 32px rgba(0,0,0,0.15);
        }

        body {
            margin: 0; padding: 0; min-height: 100vh;
            background-color: var(--ui-bg-base);
            font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: var(--ui-text-primary);
            font-size: 14px;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
        }
        
        /* Layout */
        .page {
            max-width: 1100px;
            margin: 0 auto;
            padding: 48px 32px 80px;
            display: flex;
            flex-direction: column;
            gap: 32px;
            animation: fade-in 0.4s var(--ease-smooth);
        }
        
        @keyframes fade-in {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Typography */
        h1 { margin: 0; font-size: 32px; letter-spacing: -0.03em; font-weight: 700; color: var(--ui-text-primary); }
        h3 { margin-top: 0; margin-bottom: 20px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: var(--ui-text-muted); }
        h4 { margin: 0; font-size: 16px; font-weight: 600; color: var(--ui-text-primary); }
        p { margin: 0; font-size: 14px; color: var(--ui-text-muted); line-height: 1.6; }
        
        .hero {
            display: flex;
            flex-direction: column;
            gap: 16px;
            border-bottom: 1px solid var(--ui-border-soft);
            padding-bottom: 32px;
            margin-bottom: 8px;
        }
        .hero-top {
            display: grid;
            grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
            gap: 24px;
            align-items: stretch;
        }
        .hero p { margin-top: 12px; font-size: 16px; max-width: 600px; }
        .hero-side {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
        }
        .hero-meta {
            background: color-mix(in srgb, var(--ui-bg-card) 85%, transparent);
            border: 1px solid var(--ui-border-soft);
            border-radius: 16px;
            padding: 18px 18px 16px;
            box-shadow: var(--shadow-sm);
        }
        .hero-meta-row {
            display: flex;
            align-items: center;
            gap: 10px;
            justify-content: space-between;
            font-size: 13px;
            line-height: 1.4;
        }
        .hero-meta-row + .hero-meta-row {
            margin-top: 8px;
        }
        .hero-meta-label {
            color: var(--ui-text-muted);
            font-weight: 600;
            white-space: nowrap;
        }
        .hero-meta-value {
            color: var(--ui-text-primary);
            text-align: right;
            overflow-wrap: anywhere;
        }
        .hero-actions {
            display: flex;
            gap: 10px;
            align-items: stretch;
            width: 100%;
        }
        .hero-actions button {
            flex: 1;
            min-width: 0;
            margin: 0;
            white-space: nowrap;
        }
        .hero-actions .hero-toggle {
            flex: 1.5;
        }
        
        .badge {
            display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--vscode-badge-background) 20%, transparent);
            color: var(--vscode-badge-foreground);
            font-size: 12px; font-weight: 600;
            border: 1px solid color-mix(in srgb, var(--vscode-badge-foreground) 30%, transparent);
        }

        /* Cards */
        .card {
            background-color: var(--ui-bg-card);
            border: 1px solid var(--ui-border-soft);
            border-radius: 16px;
            padding: 28px;
            box-shadow: var(--shadow-sm);
            transition: transform 0.3s var(--ease-spring), box-shadow 0.3s var(--ease-smooth), border-color 0.3s var(--ease-smooth);
            position: relative;
            overflow: hidden;
        }
        .card::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
        }
        .card:hover {
            border-color: var(--ui-border-hover);
            box-shadow: var(--shadow-md);
            transform: translateY(-2px);
        }
        .card.full-width { grid-column: 1 / -1; }

        .stat-value {
            font-size: 32px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-top: 8px;
            line-height: 1.1;
        }
        .stat-sub {
            font-size: 13px;
            opacity: 0.7;
            margin-top: 8px;
            font-weight: 500;
        }
        .money-saved {
            color: var(--vscode-testing-iconPassed);
            filter: drop-shadow(0 0 8px color-mix(in srgb, var(--vscode-testing-iconPassed) 40%, transparent));
        }
        
        /* Grid */
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; }
        .info-grid { display: grid; grid-template-columns: 160px 1fr; gap: 16px; font-size: 14px; align-items: center; }
        .label { color: var(--ui-text-muted); font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
        .value { color: var(--ui-text-primary); font-family: var(--vscode-editor-font-family); font-size: 14px; }

        /* Actions & Buttons */
        .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
        
        button {
            display: inline-flex; justify-content: center; align-items: center; gap: 8px;
            height: 40px; padding: 0 20px;
            background-color: var(--ui-accent);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-family: inherit; font-size: 14px; font-weight: 600;
            transition: all 0.2s var(--ease-smooth);
            box-shadow: 0 2px 4px color-mix(in srgb, var(--ui-accent) 20%, transparent);
        }
        button:hover {
            background-color: var(--ui-accent-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px color-mix(in srgb, var(--ui-accent) 30%, transparent);
        }
        button:active { transform: scale(0.97); box-shadow: none; }
        button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--ui-border-soft);
            box-shadow: none;
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
            border-color: var(--ui-border-hover);
        }

        .section-title {
            font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
            color: var(--ui-text-muted);
            margin-bottom: 16px; display: flex; align-items: center; gap: 12px;
        }
        .section-title::after {
            content: ''; flex: 1; height: 1px; background-color: var(--ui-border-soft);
        }

        /* Inputs */
        input[type="text"], input[type="number"], select {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--ui-border-soft);
            padding: 10px 12px;
            border-radius: 8px;
            font-family: var(--vscode-editor-font-family); font-size: 13px;
            transition: border-color 0.2s var(--ease-smooth), box-shadow 0.2s var(--ease-smooth);
            width: 100%; box-sizing: border-box;
        }
        input:focus, select:focus {
            border-color: var(--ui-border-hover);
            outline: none;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-border-hover) 20%, transparent);
        }
        
        /* Modern Toggle Switch */
        .switch { position: relative; width: 44px; height: 24px; display: inline-block; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
            background-color: color-mix(in srgb, var(--vscode-descriptionForeground) 30%, transparent);
            transition: .3s var(--ease-smooth); border-radius: 24px;
            border: 1px solid var(--ui-border-soft);
        }
        .slider:before {
            position: absolute; content: ""; height: 18px; width: 18px; left: 2px; bottom: 2px;
            background-color: var(--vscode-foreground); transition: .3s var(--ease-spring); border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        input:checked + .slider { 
            background-color: var(--vscode-testing-iconPassed); 
            border-color: var(--vscode-testing-iconPassed);
        }
        input:checked + .slider:before { 
            transform: translateX(20px); 
            background-color: #fff; 
        }

        /* Components */
        .toggle-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 14px 16px;
            border-bottom: 1px solid var(--ui-border-soft);
            background: transparent;
            transition: background 0.2s ease;
            border-radius: 8px;
        }
        .toggle-row:hover { background: color-mix(in srgb, var(--vscode-list-hoverBackground) 50%, transparent); }
        .toggle-row:last-child { border-bottom: none; }

        .pill-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
        .pill {
            padding: 6px 14px; border-radius: 999px;
            border: 1px solid var(--ui-border-soft);
            background: color-mix(in srgb, var(--ui-bg-card) 50%, transparent);
            color: var(--ui-text-primary);
            cursor: pointer; font-size: 13px; font-weight: 500;
            transition: all 0.2s var(--ease-smooth);
        }
        .pill:hover { 
            border-color: var(--vscode-textLink-foreground); 
            color: var(--vscode-textLink-foreground); 
            background: color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
            transform: translateY(-1px);
        }

        /* Documentation Cards */
        .docs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .doc-card {
            border: 1px solid var(--ui-border-soft);
            border-radius: 12px; padding: 20px;
            background: linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-card) 60%, transparent), transparent);
            cursor: pointer;
            transition: all 0.3s var(--ease-smooth);
        }
        .doc-card:hover { 
            border-color: var(--ui-border-hover); 
            transform: translateY(-3px); 
            box-shadow: var(--shadow-md);
            background: var(--ui-bg-card);
        }
        .doc-card h4 { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 15px; }
        .doc-card p { opacity: 0.8; font-size: 13px; line-height: 1.5; }
        .doc-card code {
            font-family: var(--vscode-editor-font-family); font-size: 12px;
            padding: 3px 6px; border-radius: 4px;
            background: color-mix(in srgb, var(--vscode-textPreformat-foreground) 15%, transparent);
            color: var(--vscode-textPreformat-foreground);
        }

        /* Status & Logs */
        .status-dot {
            width: 12px; height: 12px; border-radius: 50%;
            background-color: ${statusColor};
            box-shadow: 0 0 0 3px color-mix(in srgb, ${statusColor} 20%, transparent);
        }
        
        .log-container {
            background: #000; /* Deep terminal feel */
            color: #d4d4d4;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px; line-height: 1.6;
            padding: 20px; border-radius: 12px;
            height: 380px; overflow-y: auto;
            border: 1px solid #333;
            margin-top: 20px;
            box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
        }
        .log-line { display: flex; gap: 16px; padding: 4px 6px; border-radius: 4px; transition: background 0.1s; }
        .log-line:hover { background: rgba(255,255,255,0.05); }
        .log-time { color: #858585; font-size: 11px; min-width: 85px; font-weight: 500; }
        .log-method { font-weight: 600; color: #569cd6; min-width: 55px; }
        .log-path { color: #ce9178; flex: 1; word-break: break-all; }
        .log-status.success { color: #4ec9b0; font-weight: 600; }
        .log-status.error { color: #f14c4c; font-weight: 600; }
        .log-latency { color: #858585; font-size: 11px; min-width: 65px; text-align: right; }

        .muted { color: var(--ui-text-muted); font-size: 13px; }
        a { color: var(--vscode-textLink-foreground); text-decoration: none; font-weight: 500; transition: color 0.1s; }
        a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }

        /* Animations */
        @keyframes pulse-ring { 
            0% { box-shadow: 0 0 0 0 color-mix(in srgb, ${statusColor} 40%, transparent); } 
            70% { box-shadow: 0 0 0 10px transparent; }
            100% { box-shadow: 0 0 0 0 transparent; } 
        }
        .status-dot { animation: ${isRunning ? 'pulse-ring 2s infinite' : 'none'}; }
        
        @keyframes pending-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.3; } }
        .log-line.pending { animation: pending-pulse 2s ease-in-out infinite; }

        /* Modern Sidebar Design - Constant Dark Theme */
        @media (max-width: 600px) {
            body {
                background-color: #09090b; /* Zinc 950 */
                color: #fafafa; /* Zinc 50 */
            }
            
            .page {
                padding: 16px 16px 32px;
                gap: 12px;
                max-width: 100%;
            }

            /* Compact Hero */
            .hero {
                gap: 12px;
                padding-bottom: 12px;
                border-bottom: 1px solid #27272a; /* Zinc 800 */
                margin-bottom: 4px;
            }
            .hero-top {
                grid-template-columns: 1fr;
            }
            .hero-side {
                gap: 10px;
            }
            .hero-meta {
                padding: 14px;
                border-radius: 10px;
            }
            .hero-actions {
                flex-wrap: wrap;
            }
            .hero-actions button {
                flex: 1 1 calc(50% - 10px);
                min-width: 80px;
            }
            .hero-actions .hero-toggle {
                flex: 1 1 100%;
            }
            .hero h1 { 
                font-size: 18px; 
                display: flex; 
                align-items: center; 
                gap: 8px;
                color: #ffffff;
            }
            .hero p { display: none; }
             
            /* Unified Status Pill in Hero */
            .hero h1:after {
                content: '';
                display: inline-block;
                width: 8px; height: 8px;
                border-radius: 50%;
                background-color: ${statusColor};
                box-shadow: 0 0 10px ${statusColor};
                margin-left: auto;
                animation: pulse 2s infinite;
            }

            /* Filled Cards for Sidebar */
            .card {
                background-color: #18181b; /* Zinc 900 */
                border: 1px solid #27272a; /* Zinc 800 */
                box-shadow: none;
                padding: 16px;
                border-radius: 8px;
            }
            .card:hover {
                background-color: #27272a; /* Zinc 800 */
                transform: none;
                border-color: #3f3f46; /* Zinc 700 */
            }

            /* Typography Overrides */
            h3, h4 { color: #e4e4e7; opacity: 1; } /* Zinc 200 */
            .muted { color: #a1a1aa; opacity: 1; } /* Zinc 400 */
            
            /* Input overrides for dark theme consistency */
            button {
                background-color: #2563eb; /* Blue 600 */
                color: white;
                border: none;
            }
            button:hover { background-color: #1d4ed8; } /* Blue 700 */
            button.secondary {
                background-color: #27272a; /* Zinc 800 */
                color: #e4e4e7;
            }
            button.secondary:hover { background-color: #3f3f46; } /* Zinc 700 */

            /* Grid Stacking */
            .grid, .info-grid, .docs-grid {
                grid-template-columns: 1fr !important;
                gap: 12px;
            }

            /* Buttons */
            .actions { 
                grid-template-columns: 1fr;
                gap: 8px;
            }
            button {
                width: 100%;
                height: 36px;
                border-radius: 6px;
            }
            
            /* Status Stats Grid - Make them mini cards */
            .info-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .info-grid .label { display: none; }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                background: transparent;
            }
            .info-grid > div {
                 background: #18181b;
                 padding: 8px;
                 border-radius: 4px;
                 border: 1px solid #27272a;
                 display: flex;
                 flex-direction: column;
                 align-items: center;
                 text-align: center;
            }
            .info-grid .label { 
                display: block; 
                font-size: 10px; 
                margin-bottom: 2px;
                color: #a1a1aa; /* Zinc 400 */
            }
            .info-grid .value { 
                font-size: 14px; 
                font-weight: 600;
                color: #fafafa;
            }
            
            /* Hide non-essential elements */
            .badge { display: none; }
            #server-url { 
                font-size: 11px; 
                color: #a1a1aa;
                word-break: break-all; 
            }

            /* Aggressive Contrast Overrides */
            a { color: #60a5fa !important; } /* Blue 400 */
            .label { color: #a1a1aa !important; } /* Zinc 400 */
            
            /* Form Elements - Force Dark */
            input, select, textarea {
                background-color: #27272a !important; /* Zinc 800 */
                color: #fafafa !important; /* Zinc 50 */
                border-color: #3f3f46 !important; /* Zinc 700 */
            }
            input:focus, select:focus, textarea:focus {
                border-color: #60a5fa !important; /* Blue 400 */
            }
        }

    </style>
</head>
<body>
    <div class="page">
        <div class="hero">
            <div class="hero-top">
                <div>
                    <h1>Copilot API Dashboard</h1>
                    <p>Monitor and control your local Copilot API Gateway.</p>
                    <div style="margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; background: color-mix(in srgb, var(--vscode-charts-purple) 15%, transparent); color: var(--vscode-charts-purple); padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid color-mix(in srgb, var(--vscode-charts-purple) 30%, transparent);">
                        <span style="font-size: 14px;">✨</span> Fetches ANY language model detected in VS Code
                    </div>
                </div>
                <div class="hero-side">
                    <div class="hero-meta">
                        <div class="hero-meta-row">
                            <span class="hero-meta-label">Running on</span>
                            <span class="hero-meta-value"><strong id="server-url">${url}</strong></span>
                        </div>
                        <div class="hero-meta-row">
                            <span class="hero-meta-label">Build</span>
                            <span class="hero-meta-value"><strong title="${buildInfo.builtAtIso}">v${buildInfo.version}</strong> <span title="${buildInfo.builtAtIso}">${buildInfo.builtAtDisplay}</span></span>
                        </div>
                        <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                            <button id="btn-copy-url" class="secondary" style="padding: 4px 8px; font-size: 11px; min-width: auto;" title="Copy URL">📋 Copy</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="hero-actions">
                <button id="btn-toggle-server" class="hero-toggle ${status.running ? 'danger' : 'success'}" data-running="${status.running}">
                    ${status.running ? 'Stop Gateway' : 'Start Gateway'}
                </button>
                <button class="secondary" id="btn-open-chat" title="Open Copilot Chat">💬 Chat</button>
                <button class="secondary" id="btn-ask-copilot" title="Ask Copilot">❓ Ask</button>
                <button class="secondary" id="btn-docs" title="Read Documentation">📚 Docs</button>
                <button class="secondary" id="btn-settings" title="Settings">⚙️</button>
            </div>
        </div>

        <!-- What's New Banner -->
        <div class="card full-width" style="border-left: 3px solid var(--vscode-charts-blue);">
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
                <span style="background: var(--vscode-charts-blue); color: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 600; white-space: nowrap;">✨ NEW</span>
                <div>
                    <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px;">🌐 Internet Access via Cloudflare Tunnels</div>
                    <div class="muted" style="font-size: 12px; line-height: 1.5;">
                        Access your Copilot API from anywhere — your phone, tablet, another computer, or share with friends. 
                        Enable authentication, click "Go Live" below, and get a public URL instantly. Free, no account needed!
                    </div>
                </div>
            </div>
            
            <div style="font-size: 11px; font-weight: 600; margin-bottom: 10px; opacity: 0.8;">📖 Understanding Network Access Options</div>
            <div style="display: grid; gap: 10px; font-size: 11px;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <span style="font-weight: 600; white-space: nowrap;">🔒 127.0.0.1</span>
                    <span class="muted">(localhost only) — Only accessible from this computer. Safest option for local development.</span>
                </div>
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <span style="font-weight: 600; white-space: nowrap;">📡 0.0.0.0</span>
                    <span class="muted">(local network) — Accessible from devices on your WiFi/LAN (e.g., phone on same network). Use when you need LAN access but not internet exposure.</span>
                </div>
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <span style="font-weight: 600; white-space: nowrap;">🌐 Cloudflare Tunnel</span>
                    <span class="muted">(internet) — Accessible from anywhere via public URL. Use for phone access outside home, sharing with others, or remote access. Requires authentication. <em>URL changes each session.</em></span>
                </div>
            </div>
        </div>

        <!-- Stats Grid -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 24px;">
            <div class="card">
                <h3 style="font-size: 12px; text-transform: uppercase; opacity: 0.7; margin-bottom: 8px;">💸 Est. Savings</h3>
                <div id="audit-savings-total" style="font-size: 28px; font-weight: 600; color: var(--vscode-testing-iconPassed);">...</div>
                <div id="audit-savings-today" style="font-size: 11px; opacity: 0.6; margin-top: 4px;">Loading...</div>
                <div style="font-size: 9px; opacity: 0.4; margin-top: 8px;">*Approx. based on GPT-4.1 pricing</div>
            </div>
            <div class="card">
                <h3 style="font-size: 12px; text-transform: uppercase; opacity: 0.7; margin-bottom: 8px;">📊 Traffic</h3>
                <div id="audit-total-requests" style="font-size: 28px; font-weight: 600;">...</div>
                <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">Total Requests</div>
            </div>
            <div class="card">
                <h3 style="font-size: 12px; text-transform: uppercase; opacity: 0.7; margin-bottom: 8px;">⚡ Latency</h3>
                <div id="audit-today-latency" style="font-size: 28px; font-weight: 600;">...<span style="font-size: 14px; opacity: 0.6;">ms</span></div>
                <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">Avg Today</div>
            </div>
            <div class="card">
                <h3 style="font-size: 12px; text-transform: uppercase; opacity: 0.7; margin-bottom: 8px;">👥 Connections</h3>
                <div id="stat-connections" style="font-size: 28px; font-weight: 600;">${activeConnections}</div>
                <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">Active Clients</div>
            </div>
        </div>

        <!-- Copilot Health Banner -->
        ${!status.copilot.ready ? `
        <div style="background: var(--vscode-statusBarItem-warningBackground); color: var(--vscode-statusBarItem-warningForeground); padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; font-weight: 500; border: 1px solid rgba(0,0,0,0.1);">
            <span style="font-size: 20px;">⚠️</span>
            <div style="flex: 1;">
                <div style="font-size: 14px;">GitHub Copilot is not fully ready</div>
                <div style="font-size: 12px; opacity: 0.9; font-weight: 400;">
                    ${!status.copilot.installed ? '• GitHub Copilot extension is missing. ' : ''}
                    ${!status.copilot.chatInstalled ? '• GitHub Copilot Chat extension is missing. ' : ''}
                    ${!status.copilot.signedIn ? '• You are not signed in to GitHub Copilot. ' : ''}
                </div>
            </div>
            <button class="secondary" onclick="vscode.postMessage({ type: 'askCopilot' })" style="width: auto; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: inherit;">Resolve</button>
        </div>
        ` : ''}

        <!-- Server Status Card -->
        <div class="card full-width">
            <div class="status-row" style="justify-content: space-between; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div id="status-dot" class="status-dot"></div>
                    <span id="server-status-text" style="font-size: 16px;">${statusText}</span>
                </div>
                <div class="muted">
                    v${gateway.getVersion()}
                </div>
            </div>



            <div class="info-grid">
                <div class="label">Connection</div>
                <div class="value">
                    ${config.enableHttp ? 'HTTP ' : ''}
                    ${config.enableWebSocket ? 'WebSocket ' : ''}
                </div>
                <div class="label">Auth Mode</div>
                <div class="value">${config.apiKey ? 'API Key (Protected)' : 'Open (No Auth)'}</div>
                <div class="label">Default Model</div>
                <div class="value">${config.defaultModel}</div>
                <div class="label">Copilot Health</div>
                <div class="value" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <span class="badge" style="background: ${status.copilot.chatInstalled ? 'var(--vscode-charts-green)' : (status.copilot.signedIn ? 'var(--vscode-charts-yellow)' : 'var(--vscode-charts-red)')}; color: ${status.copilot.chatInstalled ? 'var(--vscode-editor-background)' : (status.copilot.signedIn ? 'var(--vscode-editor-background)' : 'white')}; padding: 1px 6px; border-radius: 4px; font-size: 10px;">Chat: ${status.copilot.chatInstalled ? 'Installed' : (status.copilot.signedIn ? 'Not Detected' : 'Missing')}</span>
                    <span class="badge" style="background: ${status.copilot.signedIn ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-red)'}; color: ${status.copilot.signedIn ? 'var(--vscode-editor-background)' : 'white'}; padding: 1px 6px; border-radius: 4px; font-size: 10px;">Auth: ${status.copilot.signedIn ? 'Signed In' : 'Signed Out'}</span>
                </div>
            </div>
        </div>

        <div class="grid">
            <!-- Configuration Card -->
            <div class="card">
                <h3>⚙️ Server Configuration</h3>
                <div class="stacked">
                    <div class="toggle-row">
                        <span>Enable HTTP Server</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-http" ${config.enableHttp ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-row">
                        <span>Enable WebSocket</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-ws" ${config.enableWebSocket ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-row">
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span>Detailed Logging</span>
                            <span title="Enables verbose output to the VS Code Output channel. Useful for debugging." style="cursor: help; opacity: 0.6; font-size: 14px;">ℹ️</span>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="toggle-logging" ${config.enableLogging ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-row">
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span>Enable HTTPS</span>
                            <span title="Use HTTPS/TLS encryption. Falls back to HTTP if certificates are not configured." style="cursor: help; opacity: 0.6; font-size: 14px;">🔒</span>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="toggle-https" ${config.enableHttps ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div style="margin-top: 20px;">
                        <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; align-items: flex-end;">
                            <div style="flex: 1; min-width: 140px;">
                                <span style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 8px; opacity: 0.8; letter-spacing: 0.05em;">HOST</span>
                                <input type="text" id="custom-host" value="${config.host}" placeholder="127.0.0.1">
                            </div>
                            <div style="width: 80px; flex-shrink: 0;">
                                <span style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 8px; opacity: 0.8; letter-spacing: 0.05em;">PORT</span>
                                <input type="number" id="custom-port" value="${config.port}" style="width: 100%; box-sizing: border-box; text-align: center;">
                            </div>
                        </div>
                        <button id="btn-save-host" class="secondary" style="width: auto; height: 32px; font-size: 13px;">Save Host/Port</button>
                        <div style="display: flex; gap: 12px; margin-top: 12px;">
                            <button class="secondary" id="btn-host-local" style="flex: 1;">Bind Localhost</button>
                            <button class="secondary" id="btn-host-lan" style="flex: 1;">Bind LAN (0.0.0.0)</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Security Card -->
            <div class="card">
                <h3>🔒 Security</h3>
                <div class="stacked">
                    <div class="toggle-row">
                        <span>Enable Authentication</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-auth" ${config.apiKey ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div style="margin-top: 16px; border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                        <span style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 8px;">RATE LIMIT</span>
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <input type="number" id="rate-limit-input" value="${config.rateLimitPerMinute || 0}" placeholder="0 = unlimited" style="width: 100px !important;">
                            <span class="muted">req/min</span>
                            <button class="secondary" id="btn-set-ratelimit" style="width: auto; padding: 6px 16px;">Set</button>
                        </div>
                    </div>

                    <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--ui-border-soft);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <span style="font-size: 13px; font-weight: 600;">API Key Protection</span>
                            <div style="display: flex; gap: 8px;">
                                <button id="btn-generate-key" class="secondary" style="width: auto; height: 28px; padding: 0 12px; font-size: 12px;" title="Generate new random key">Generate</button>
                                <button id="btn-copy-key" class="secondary" style="width: auto; height: 28px; padding: 0 12px; font-size: 12px;" title="Copy to clipboard">Copy</button>
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <input type="text" id="api-key-input" value="${config.apiKey || ''}" placeholder="Leave empty for NO AUTH (Insecure)" style="flex: 1; font-family: var(--vscode-editor-font-family); letter-spacing: 1px;">
                            <button id="btn-save-key" style="width: 80px;">Save</button>
                        </div>
                        <div style="font-size: 12px; opacity: 0.6; margin-top: 8px;">
                            If set, clients must send <code style="background: color-mix(in srgb, var(--ui-text-muted) 20%, transparent); padding: 2px 4px; border-radius: 4px;">Authorization: Bearer &lt;key&gt;</code>
                        </div>
                    </div>

                    <div style="margin-top: 16px; border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                        <div class="inline-form" style="margin-bottom: 8px;">
                            <span style="font-size: 12px; font-weight: 600;">ALLOW IP / DOMAIN</span>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="ip-allowlist-input" placeholder="e.g. 192.168.1.5, 10.0.0.0/24, or example.com">
                                <button class="secondary" id="btn-add-ip" style="width: auto;">Add</button>
                            </div>
                        </div>
                        <div class="pill-row" id="ip-list">
                            ${(config.ipAllowlist || []).map(ip =>
            `<span class="pill" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">${ip} <span class="btn-remove-ip" data-value="${ip}" style="cursor: pointer; opacity: 0.6;">×</span></span>`
        ).join('')}
                            ${(!config.ipAllowlist || config.ipAllowlist.length === 0) ? '<span class="muted">No access restrictions (all IPs allowed)</span>' : ''}
                        </div>
                    </div>

                    <div style="margin-top: 16px; border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                        <span style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 8px;">HARDENING & LIMITS</span>

                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="muted" style="width: 120px; font-size: 11px;">Request Timeout</span>
                                <input type="number" id="timeout-input" value="${config.requestTimeoutSeconds || 60}" style="width: 80px !important;">
                                <span class="muted">sec</span>
                                <button class="secondary" id="btn-set-timeout" style="width: auto; padding: 4px 12px; font-size: 11px;">Set</button>
                            </div>

                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="muted" style="width: 120px; font-size: 11px;">Max Payload</span>
                                <input type="number" id="payload-input" value="${config.maxPayloadSizeMb || 1}" style="width: 80px !important;">
                                <span class="muted">MB</span>
                                <button class="secondary" id="btn-set-payload" style="width: auto; padding: 4px 12px; font-size: 11px;">Set</button>
                            </div>

                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="muted" style="width: 120px; font-size: 11px;">Max Connections/IP</span>
                                <input type="number" id="connections-input" value="${config.maxConnectionsPerIp || 10}" style="width: 80px !important;">
                                <span class="muted">conn</span>
                                <button class="secondary" id="btn-set-connections" style="width: auto; padding: 4px 12px; font-size: 11px;">Set</button>
                            </div>

                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="muted" style="width: 120px; font-size: 11px;">Total Concurrency</span>
                                <input type="number" id="concurrency-input" value="${config.maxConcurrentRequests || 4}" style="width: 80px !important;">
                                <span class="muted">req</span>
                                <button class="secondary" id="btn-set-concurrency" style="width: auto; padding: 4px 12px; font-size: 11px;">Set</button>
                            </div>
                            <div class="muted" style="font-size: 10px; margin-top: 2px; opacity: 0.9; line-height: 1.4;">
                                <div style="display: flex; gap: 4px; margin-bottom: 2px;">
                                    <span style="font-weight: 600; color: var(--vscode-charts-blue); min-width: 105px;">Connections/IP:</span>
                                    <span>Limits simultaneous requests from a <b>single</b> user/client.</span>
                                </div>
                                <div style="display: flex; gap: 4px;">
                                    <span style="font-weight: 600; color: var(--vscode-charts-orange); min-width: 105px;">Total Concurrency:</span>
                                    <span>Global limit across <b>all</b> users to protect the Copilot backend.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Internet Access (Cloudflare Tunnel) -->
        <div class="card full-width">
            <h3>🌐 Internet Access</h3>
            <p class="muted" style="margin-bottom: 12px;">
                Expose your API to the internet using Cloudflare Quick Tunnels. Free, secure, no account needed.
            </p>
            
            <div style="background: var(--vscode-textBlockQuote-background); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <div style="font-size: 11px; font-weight: 600; margin-bottom: 8px; opacity: 0.8;">⚠️ REQUIREMENTS FOR GOING LIVE</div>
                <ul style="margin: 0; padding-left: 20px; font-size: 12px; line-height: 1.8;">
                    <li style="color: ${status.running ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)'};">
                        ${status.running ? '✓' : '✗'} Server must be <strong>running</strong>
                    </li>
                    <li style="color: ${config.apiKey ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)'};">
                        ${config.apiKey ? '✓' : '✗'} Authentication (API Key) must be <strong>enabled</strong> for security
                    </li>
                </ul>
            </div>

            <div style="margin-bottom: 16px; border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                <div style="font-size: 11px; font-weight: 600; margin-bottom: 8px; opacity: 0.8;">CLOUDFLARED BINARY PATH (OPTIONAL)</div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <input type="text" id="cloudflared-path-input" value="${config.cloudflaredPath || ''}" placeholder="Leave empty for auto-download or PATH" style="flex: 1; min-width: 200px;">
                    <button class="secondary" id="btn-set-cloudflared-path" style="width: auto; padding: 4px 12px; font-size: 11px;">Save Path</button>
                </div>
            </div>

            <div id="tunnel-status-area" style="margin-bottom: 16px;">
                ${status.tunnel?.running ? (status.tunnel?.url ? `
                    <div style="background: color-mix(in srgb, var(--vscode-testing-iconPassed) 15%, transparent); border: 1px solid var(--vscode-testing-iconPassed); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 11px; font-weight: 600; opacity: 0.8; margin-bottom: 8px;">🟢 TUNNEL ACTIVE</div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <code id="tunnel-url" style="font-size: 13px; word-break: break-all; flex: 1;">${status.tunnel.url}</code>
                            <button id="btn-copy-tunnel-url" class="secondary" style="width: auto; padding: 6px 12px; font-size: 11px;">📋 Copy URL</button>
                        </div>
                        <div class="muted" style="font-size: 10px; margin-top: 8px;">
                            Anyone with this URL and your API key can access the API. Tunnel URL changes each session.
                        </div>
                    </div>
                ` : `
                    <div style="background: color-mix(in srgb, var(--vscode-charts-blue) 15%, transparent); border: 1px solid var(--vscode-charts-blue); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 11px; font-weight: 600; opacity: 0.8; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                            <div class="status-dot" style="background: var(--vscode-charts-blue); width: 8px; height: 8px; border-radius: 50%;"></div>
                            STARTING TUNNEL...
                        </div>
                        <div class="muted" style="font-size: 12px;">Requesting Cloudflare tunnel URL...</div>
                    </div>
                `) : `
                    <div style="background: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 16px; text-align: center;">
                        <div class="muted" style="font-size: 12px;">Tunnel not active. Click "Go Live" to expose your API to the internet.</div>
                    </div>
                `}
            </div>

            <div class="actions" style="grid-template-columns: 1fr;">
                ${status.tunnel?.running ? `
                    <button id="btn-toggle-tunnel" class="danger" style="font-weight: 600;">🛑 Stop Tunnel</button>
                ` : `
                    <button id="btn-toggle-tunnel" class="${status.running && config.apiKey ? 'success' : 'secondary'}" style="font-weight: 600;" ${!status.running || !config.apiKey ? 'disabled' : ''}>🚀 Go Live</button>
                `}
            </div>
            ${!status.running || !config.apiKey ? `
                <div class="muted" style="font-size: 10px; margin-top: 8px; text-align: center;">
                    ${!status.running ? 'Start the server first. ' : ''}${!config.apiKey ? 'Enable authentication in Security settings.' : ''}
                </div>
            ` : ''}
        </div>

        <!-- MCP Status -->
        <div class="card full-width" id="mcp-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">🔌 MCP Status <span id="mcp-status-badge" class="badge">Checking...</span></h3>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <label style="font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer; opacity: 0.8;">
                        <input type="checkbox" id="mcp-enabled-toggle" style="width: 14px; height: 14px; margin: 0;"> Enabled
                    </label>
                </div>
            </div>

            <div id="mcp-content-area">
                <div class="muted" style="text-align: center; padding: 20px;">Loading tools...</div>
            </div>
        </div>

        <!-- Live Log Tail -->
        <div class="card full-width">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">📟 Live Log Tail <div id="log-status-indicator" class="active"></div></h3>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <label style="font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer; opacity: 0.8;">
                        <input type="checkbox" id="log-autoscroll" checked style="width: 14px; height: 14px; margin: 0;"> Auto-scroll
                    </label>
                    <button class="secondary" id="btn-clear-logs" style="width: auto; padding: 4px 12px; font-size: 11px; font-weight: 500;">🧹 Clear</button>
                </div>
            </div>
            <div id="live-log-container" class="log-container">
                <div class="muted" style="text-align: center; padding-top: 120px; opacity: 0.5;">Waiting for API requests...</div>
            </div>
        </div>

        <!-- Audit & Analytics -->
        <div class="card full-width">

            <!-- Charts removed per user request -->
            <div style="margin-bottom: 24px;"></div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h4 style="margin: 0; font-size: 13px; opacity: 0.9;">Recent Activity</h4>
                <span id="refresh-timer" class="muted" style="font-weight: normal; font-size: 11px; opacity: 0.6;"></span>
                <div style="display: flex; gap: 8px;">
                    <button class="secondary" id="btn-refresh-audit" style="padding: 4px 10px; font-size: 11px;">🔄 Refresh</button>
                    <button class="secondary" id="btn-open-logs" style="padding: 4px 10px; font-size: 11px;">📂 Open Log Folder</button>
                </div>
            </div>

            <div style="overflow-x: auto;">
                <table id="audit-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="text-align: left; border-bottom: 1px solid var(--vscode-widget-border);">
                            <th style="padding: 8px 12px; opacity: 0.7;">Time</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">IP</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Method</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Path</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Model</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Status</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Latency</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Tokens</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="audit-table-body">
                        <tr style="border-bottom: 1px solid var(--vscode-widget-border);">
                            <td style="padding: 8px 12px; opacity: 0.6; font-style: italic;" colspan="9">Loading audit logs...</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--vscode-widget-border);">
                <div class="muted" style="font-size: 11px;" id="page-info">Showing 0-0 of 0</div>
                <div style="display: flex; gap: 8px;">
                    <button class="secondary" id="btn-prev-page" disabled>Previous</button>
                    <button class="secondary" id="btn-next-page" disabled>Next</button>
                </div>
            </div>
        </div>

        <div class="card full-width">
            <h3>🛡️ Data Redaction</h3>
            <p class="muted" style="margin-bottom: 16px;">
                Toggle patterns to automatically redact sensitive data from logs. All patterns are applied in real-time.
            </p>

            <!-- Built-in Patterns -->
            <div style="margin-bottom: 20px;">
                <h4 style="font-size: 13px; margin-bottom: 12px; opacity: 0.9;">Built-in Patterns</h4>
                <div id="builtin-patterns-list" style="display: flex; flex-direction: column; gap: 8px;">
                    ${(config.redactionPatterns || []).filter((p: any) => p.isBuiltin).map((p: any) => `
                        <div class="toggle-row" style="padding: 8px 12px; background: var(--vscode-editor-background); border-radius: 6px; border: 1px solid var(--vscode-widget-border);">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="font-weight: 600; font-size: 12px;">${p.name}</span>
                                <code style="font-size: 10px; opacity: 0.6; word-break: break-all;">${p.pattern.length > 40 ? p.pattern.substring(0, 40) + '...' : p.pattern}</code>
                            </div>
                            <label class="switch">
                                <input type="checkbox" class="toggle-redaction" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Custom Patterns -->
            <div style="border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                <h4 style="font-size: 13px; margin-bottom: 12px; opacity: 0.9;">Custom Patterns</h4>

                <div id="custom-patterns-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                    ${(config.redactionPatterns || []).filter((p: any) => !p.isBuiltin).map((p: any) => `
                        <div class="toggle-row" style="padding: 8px 12px; background: var(--vscode-editor-background); border-radius: 6px; border: 1px solid var(--vscode-widget-border);">
                            <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
                                <span style="font-weight: 600; font-size: 12px;">${p.name}</span>
                                <code style="font-size: 10px; opacity: 0.6; word-break: break-all;">${p.pattern}</code>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <label class="switch">
                                    <input type="checkbox" class="toggle-redaction" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <button class="secondary btn-remove-redaction" data-id="${p.id}" style="width: 28px; height: 28px; padding: 0; font-size: 14px;" title="Remove">×</button>
                            </div>
                        </div>
                    `).join('')}
                    ${(config.redactionPatterns || []).filter(p => !p.isBuiltin).length === 0 ? '<span class="muted" style="text-align: center; padding: 12px;">No custom patterns added yet</span>' : ''}
                </div>

                <!-- Add Custom Pattern Form -->
                <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--vscode-textBlockQuote-background); border-radius: 8px;">
                    <span style="font-size: 11px; font-weight: 600; opacity: 0.8;">ADD CUSTOM PATTERN</span>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <input type="text" id="redaction-name-input" placeholder="Pattern name (e.g. 'Bank Account')" style="flex: 1; min-width: 150px;">
                        <input type="text" id="redaction-pattern-input" placeholder="Regex pattern" style="flex: 2; min-width: 200px;">
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="secondary" id="btn-test-redaction" style="width: auto;">🧪 Test</button>
                        <button class="secondary" id="btn-add-redaction" style="width: auto;">➕ Add Pattern</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="card full-width">
            <h3>🧠 System Prompt</h3>
            <p class="muted" style="margin-bottom: 12px;">
                Define a default system persona/instruction for all API requests that don't provide one.
            </p>
            <div class="actions">
                <button class="secondary" id="btn-edit-system-prompt" style="width: auto; padding: 8px 16px; font-weight: 600;">📝 Edit Default System Prompt</button>
            </div>
        </div>

        <div class="card full-width">
            <h3>\ud83d\udcda API Documentation</h3>
            <p class="muted" style="margin-bottom: 16px;">
                The gateway supports multiple API formats. Use the endpoints below with your favorite SDKs.
            </p>
            <div class="docs-grid">
                <div class="doc-card">
                    <h4><span>🤖</span> OpenAI <code>/v1</code></h4>
                    <p>Compatible with OpenAI SDKs. Supports <code>chat/completions</code>, <code>completions</code>, and <code>models</code>.</p>
                </div>
                <div class="doc-card">
                    <h4><span>🧪</span> Anthropic <code>/v1</code></h4>
                    <p>Compatible with Claude SDKs. Supports <code>/v1/messages</code> with full streaming (SSE).</p>
                </div>
                <div class="doc-card">
                    <h4><span>🌟</span> Google <code>/v1beta</code></h4>
                    <p>Compatible with Gemini SDKs. Supports <code>generateContent</code> and <code>streamGenerateContent</code>.</p>
                </div>
                <div class="doc-card">
                    <h4><span>🦙</span> Llama <code>/llama/v1</code></h4>
                    <p>Compatible with Meta Llama SDKs. Supports <code>chat/completions</code> with streaming.</p>
                </div>
                <div class="doc-card">
                    <h4><span>🔌</span> MCP Tools</h4>
                    <p>MCP tools are automatically prefixed with <code>mcp_{server}_{tool}</code>. The gateway handles execution automatically in non-streaming mode.</p>
                </div>
            </div>

            <div class="actions" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 16px;">
                <a href="http://${config.host}:${config.port}/docs" target="_blank" class="secondary" style="display: inline-flex; justify-content: center; align-items: center; gap: 6px; padding: 10px 12px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid color-mix(in srgb, var(--vscode-button-secondaryBackground) 50%, transparent); border-radius: 6px; text-decoration: none; font-weight: 600;">📑 Swagger UI</a>
                <a href="http://${config.host}:${config.port}/openapi.json" target="_blank" class="secondary" style="display: inline-flex; justify-content: center; align-items: center; gap: 6px; padding: 10px 12px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid color-mix(in srgb, var(--vscode-button-secondaryBackground) 50%, transparent); border-radius: 6px; text-decoration: none; font-weight: 600;">📄 OpenAPI JSON</a>
            </div>
        </div>

        <div class="card full-width" style="background: linear-gradient(135deg, color-mix(in srgb, var(--vscode-editor-background) 90%, #3b82f6 10%), color-mix(in srgb, var(--vscode-editor-background) 95%, #8b5cf6 5%));">
            <h3>👨‍💻 About</h3>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 200px;">
                    <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">Suhaib Bin Younis</div>
                    <div class="muted" style="margin-bottom: 8px;">Developer & Creator</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <a href="https://suhaibbinyounis.com" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">🌐 Website</a>
                        <a href="https://suhaib.in" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">🔗 suhaib.in</a>
                        <a href="mailto:vscode@suhaib.in" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">📧 Email</a>
                        <a href="https://github.com/suhaibbinyounis/github-copilot-api-vscode" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">⭐ Star on GitHub</a>
                    </div>
                </div>
                <div class="muted" style="font-size: 11px; text-align: right;">
                    GitHub Copilot API Gateway v${gateway.getVersion()}<br>
                    Made with ❤️ and ☕
                </div>
            </div>
        </div>

    </div>

    <!-- Detail Modal -->
    <div id="detail-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
        <div style="background: var(--vscode-sideBar-background); padding: 24px; border-radius: 12px; width: 80%; max-width: 800px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--vscode-widget-border); box-shadow: 0 4px 24px rgba(0,0,0,0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0;">Request Details</h3>
                <button class="secondary" id="btn-close-modal" style="width: auto; padding: 6px 12px;">Close</button>
            </div>
            <div style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; padding-right: 8px;">
                <div style="position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h4 style="margin: 0; opacity: 0.8;">Request</h4>
                        <button class="secondary btn-copy-modal" data-target="modal-request" style="width: auto; padding: 2px 8px; font-size: 10px;">📋 Copy</button>
                    </div>
                    <pre id="modal-request" style="font-size: 11px; max-height: 300px; overflow: auto; margin: 0;"></pre>
                </div>
                <div style="position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h4 style="margin: 0; opacity: 0.8;">Response</h4>
                        <button class="secondary btn-copy-modal" data-target="modal-response" style="width: auto; padding: 2px 8px; font-size: 10px;">📋 Copy</button>
                    </div>
                    <pre id="modal-response" style="font-size: 11px; max-height: 300px; overflow: auto; margin: 0;"></pre>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        var vscode = acquireVsCodeApi();
        var auditStatsDays = 30;

        // Pagination state - declare at top to avoid hoisting issues
        var currentPage = 1;
        var pageSize = 10;
        var totalLogs = 0;
        var lastLogs = [];

        function renderAuditLogLoading() {
            document.getElementById('audit-table-body').innerHTML = '<tr><td colspan="9" style="padding: 20px; text-align: center; opacity: 0.7;">Loading...</td></tr>';
        }

        function requestAuditSnapshot(options) {
            options = options || {};

            if (typeof options.page === 'number') {
                currentPage = options.page;
            }
            if (typeof options.pageSize === 'number') {
                pageSize = options.pageSize;
            }
            if (options.showLoadingLogs) {
                renderAuditLogLoading();
            }

            vscode.postMessage({
                type: 'getAuditSnapshot',
                value: {
                    page: currentPage,
                    pageSize: pageSize,
                    days: auditStatsDays
                }
            });
        }

        function updateAuditSummary(summary) {
            if (!summary) {
                return;
            }

            var totalSavingsEl = document.getElementById('audit-savings-total');
            var todaySavingsEl = document.getElementById('audit-savings-today');
            var totalRequestsEl = document.getElementById('audit-total-requests');
            var todayLatencyEl = document.getElementById('audit-today-latency');

            if (totalSavingsEl) totalSavingsEl.textContent = summary.totalSavings;
            if (todaySavingsEl) todaySavingsEl.textContent = '+' + summary.todaySavings + ' today';
            if (totalRequestsEl) totalRequestsEl.textContent = String(summary.totalRequests || 0);
            if (todayLatencyEl) {
                todayLatencyEl.innerHTML = String(summary.avgLatency || 0) + '<span style="font-size: 14px; opacity: 0.6;">ms</span>';
            }
        }

        function setServerToggleState(button, running, pending) {
            if (!button) {
                return;
            }

            button.dataset.running = running ? 'true' : 'false';
            button.dataset.pending = pending ? 'true' : 'false';
            button.disabled = !!pending;
            button.textContent = running ? 'Stop Gateway' : 'Start Gateway';
            button.classList.toggle('danger', running);
            button.classList.toggle('success', !running);
        }

        document.getElementById('btn-toggle-server').onclick = function() {
            var running = this.getAttribute('data-running') === 'true';
            setServerToggleState(this, !running, true);
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

        const btnDocs = document.getElementById('btn-docs');
        if (btnDocs) {
            btnDocs.onclick = function() {
                vscode.postMessage({ type: 'openUrl', value: 'https://notes.suhaib.in/docs/vscode/extensions/github-copilot-api-gateway/' });
            };
        }

        const btnEditSystemPrompt = document.getElementById('btn-edit-system-prompt');
        if (btnEditSystemPrompt) {
            btnEditSystemPrompt.onclick = function() {
                vscode.postMessage({ type: 'editSystemPrompt' });
            };
        }

        document.getElementById('btn-copy-url').onclick = function() {
            var url = document.getElementById('server-url').innerText;
            navigator.clipboard.writeText(url).then(function() {
                var btn = document.getElementById('btn-copy-url');
                btn.innerText = '✅ Copied!';
                setTimeout(function() { btn.innerText = '📋 Copy'; }, 1500);
            });
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

        document.getElementById('toggle-https').onchange = function() {
            vscode.postMessage({ type: 'toggleHttps' });
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

        const btnSaveKey = document.getElementById('btn-save-key');
        if (btnSaveKey) {
            btnSaveKey.onclick = function() {
                var v = document.getElementById('api-key-input').value.trim();
                currentApiKey = v;
                vscode.postMessage({ type: 'setApiKey', value: v });
                if (v) {
                    document.getElementById('toggle-auth').checked = true;
                }
            };
        }

        const btnGenerateKey = document.getElementById('btn-generate-key');
        if (btnGenerateKey) {
            btnGenerateKey.onclick = function() {
                var key = 'sk-' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
                document.getElementById('api-key-input').value = key;
                document.getElementById('api-key-input').type = 'text';
                currentApiKey = key;
                vscode.postMessage({ type: 'setApiKey', value: key });
                const toggleAuth = document.getElementById('toggle-auth');
                if (toggleAuth) toggleAuth.checked = true;
            };
        }

        const btnCopyKey = document.getElementById('btn-copy-key');
        if (btnCopyKey) {
            btnCopyKey.onclick = function() {
                var input = document.getElementById('api-key-input');
                var keyToCopy = input ? input.value.trim() : currentApiKey;
                if (!keyToCopy) keyToCopy = currentApiKey;
                if (keyToCopy) {
                    navigator.clipboard.writeText(keyToCopy).then(function() {
                        var originalText = btnCopyKey.textContent;
                        btnCopyKey.textContent = '✓';
                        setTimeout(function() { btnCopyKey.textContent = originalText; }, 1500);
                    });
                }
            };
        }

        document.getElementById('btn-set-ratelimit').onclick = function() {
            var v = document.getElementById('rate-limit-input').value;
            vscode.postMessage({ type: 'setRateLimit', value: Number(v) || 0 });
        };

        // Tunnel button handler
        var tunnelBtn = document.getElementById('btn-toggle-tunnel');
        if (tunnelBtn) {
            tunnelBtn.onclick = function() {
                var isTunnelActive = ${status.tunnel?.running ? 'true' : 'false'};
                if (isTunnelActive) {
                    vscode.postMessage({ type: 'stopTunnel' });
                } else {
                    this.textContent = '⏳ Starting...';
                    this.disabled = true;
                    vscode.postMessage({ type: 'startTunnel' });
                }
            };
        }

        // Copy tunnel URL button
        var copyTunnelBtn = document.getElementById('btn-copy-tunnel-url');
        if (copyTunnelBtn) {
            copyTunnelBtn.onclick = function() {
                var url = document.getElementById('tunnel-url')?.textContent;
                if (url) {
                    navigator.clipboard.writeText(url).then(function() {
                        copyTunnelBtn.textContent = '✅ Copied!';
                        setTimeout(function() { copyTunnelBtn.textContent = '📋 Copy URL'; }, 1500);
                    });
                }
            };
        }

        // Initialize on load
        // try { initCharts(); } catch (e) { console.error('Failed to init charts', e); }

        document.getElementById('btn-refresh-audit').onclick = function() {
            startCountdown(); // Reset timer
            requestAuditSnapshot({ showLoadingLogs: true });
            this.textContent = '🔄 Loading...';
            setTimeout(() => { this.textContent = '🔄 Refresh'; }, 1000);
        };

        document.getElementById('btn-open-logs').onclick = function() {
            vscode.postMessage({ type: 'openLogFolder' });
        };

        // Modal Logic
        // Modal Logic
        const modal = document.getElementById('detail-modal');
        function closeModal() {
            modal.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
        }

        document.getElementById('btn-close-modal').onclick = closeModal;

        window.onclick = function(event) {
            if (event.target == modal) {
                closeModal();
            }
        }

        // Global function for View button
        window.showDetails = function(index) {
            if (!lastLogs || !lastLogs[index]) return;
            const log = lastLogs[index];

            const reqContent = {
                headers: log.requestHeaders,
                body: log.requestBody
            };
            const resContent = {
                headers: log.responseHeaders,
                body: log.responseBody,
                error: log.error
            };

            document.getElementById('modal-request').textContent = JSON.stringify(reqContent, null, 2);
            document.getElementById('modal-response').textContent = JSON.stringify(resContent, null, 2);

            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden'; // Lock scrolling
        };

        // Copy content from modal
        document.querySelectorAll('.btn-copy-modal').forEach(btn => {
            btn.onclick = function() {
                const targetId = this.getAttribute('data-target');
                const content = document.getElementById(targetId).textContent;
                if (content) {
                    navigator.clipboard.writeText(content).then(() => {
                        const originalText = this.textContent;
                        this.textContent = '✓ Copied';
                        setTimeout(() => { this.textContent = originalText; }, 1500);
                    });
                }
            };
        });

        // Wiki tab switching
        document.querySelectorAll('.wiki-tab').forEach(function(tab) {
            tab.onclick = function() {
                var targetPanel = this.getAttribute('data-tab');
                // Update active tab styling
                document.querySelectorAll('.wiki-tab').forEach(function(t) {
                    t.classList.remove('active');
                    t.style.background = 'var(--vscode-button-secondaryBackground)';
                    t.style.color = 'var(--vscode-button-secondaryForeground)';
                });
                this.classList.add('active');
                this.style.background = 'var(--vscode-editor-background)';
                this.style.color = 'var(--vscode-foreground)';
                // Show corresponding panel
                document.querySelectorAll('.wiki-panel').forEach(function(p) {
                    p.style.display = 'none';
                });
                var panel = document.querySelector('.wiki-panel[data-panel="' + targetPanel + '"]');
                if (panel) panel.style.display = 'block';
            };
            // Initialize styling
            if (tab.classList.contains('active')) {
                tab.style.background = 'var(--vscode-editor-background)';
                tab.style.color = 'var(--vscode-foreground)';
            } else {
                tab.style.background = 'var(--vscode-button-secondaryBackground)';
                tab.style.color = 'var(--vscode-button-secondaryForeground)';
            }
        });

        // Auto-refresh Countdown Logic
        let refreshTimer = 10;
        let refreshIntervalVal = null;
        const refreshSpan = document.getElementById('refresh-timer');

        function startCountdown() {
            if (refreshIntervalVal) clearInterval(refreshIntervalVal);

            refreshTimer = 10;
            updateTimerDisplay();

            refreshIntervalVal = setInterval(() => {
                refreshTimer--;
                updateTimerDisplay();

                if (refreshTimer <= 0) {
                    refreshTimer = 10;
                    requestAuditSnapshot({ showLoadingLogs: false });
                }
            }, 1000);
        }

        function updateTimerDisplay() {
            if (refreshSpan) {
                refreshSpan.textContent = \`Refreshing in \${refreshTimer}s...\`;
            }
        }

        startCountdown();

        // Request fresh stats after a short delay to ensure extension message listener is ready
        setTimeout(function() {
            vscode.postMessage({ type: 'getStats' });
            requestAuditSnapshot({ showLoadingLogs: true });
        }, 100);

        // IP Allowlist handlers
        document.getElementById('btn-add-ip').onclick = function() {
            var ip = document.getElementById('ip-allowlist-input').value.trim();
            if (ip) {
                vscode.postMessage({ type: 'addIpAllowlistEntry', value: ip });
                document.getElementById('ip-allowlist-input').value = '';
            }
        };

        document.querySelectorAll('.btn-remove-ip').forEach(function(btn) {
            btn.onclick = function() {
                var ip = btn.getAttribute('data-value');
                if (ip) {
                    vscode.postMessage({ type: 'removeIpAllowlistEntry', value: ip });
                }
            };
        });

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

        // MCP Toggle
        var mcpToggle = document.getElementById('mcp-enabled-toggle');
        if (mcpToggle) {
            mcpToggle.onchange = function() {
                vscode.postMessage({ type: 'toggleMcp', value: mcpToggle.checked });
            };
        }


        const btnSaveHost = document.getElementById('btn-save-host');
        if (btnSaveHost) {
            btnSaveHost.onclick = function() {
                var h = document.getElementById('custom-host').value;
                var p = document.getElementById('custom-port').value;
                vscode.postMessage({ type: 'setHostPort', value: { host: h, port: Number(p) || 3000 } });
            };
        }

        const btnSetTimeout = document.getElementById('btn-set-timeout');
        if (btnSetTimeout) {
            btnSetTimeout.onclick = function() {
                var val = document.getElementById('timeout-input').value;
                vscode.postMessage({ type: 'setRequestTimeout', value: Number(val) });
            };
        }

        const btnSetPayload = document.getElementById('btn-set-payload');
        if (btnSetPayload) {
            btnSetPayload.onclick = function() {
                var val = document.getElementById('payload-input').value;
                vscode.postMessage({ type: 'setMaxPayloadSize', value: Number(val) });
            };
        }

        const btnSetConnections = document.getElementById('btn-set-connections');
        if (btnSetConnections) {
            btnSetConnections.onclick = function() {
                var val = document.getElementById('connections-input').value;
                vscode.postMessage({ type: 'setMaxConnectionsPerIp', value: Number(val) });
            };
        }

        const btnSetCloudflaredPath = document.getElementById('btn-set-cloudflared-path');
        if (btnSetCloudflaredPath) {
            btnSetCloudflaredPath.onclick = function() {
                var val = document.getElementById('cloudflared-path-input').value;
                vscode.postMessage({ type: 'setCloudflaredPath', value: String(val).trim() });
            };
        }
        document.getElementById('btn-set-concurrency').onclick = function() {
            var val = document.getElementById('concurrency-input').value;
            vscode.postMessage({ type: 'setMaxConcurrency', value: Number(val) });
        };

        // btn-set-model removed - element doesn't exist in current UI

        // Redaction pattern handlers
        document.getElementById('btn-add-redaction').onclick = function() {
            var name = document.getElementById('redaction-name-input').value.trim();
            var pattern = document.getElementById('redaction-pattern-input').value.trim();
            if (!name) {
                alert('Please enter a pattern name');
                return;
            }
            if (!pattern) {
                alert('Please enter a regex pattern');
                return;
            }
            try {
                new RegExp(pattern); // Validate
                vscode.postMessage({ type: 'addRedactionPattern', value: { name: name, pattern: pattern } });
                document.getElementById('redaction-name-input').value = '';
                document.getElementById('redaction-pattern-input').value = '';
            } catch (e) {
                alert('Invalid regex pattern: ' + e.message);
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
                var testStr = prompt('Enter test string to check redaction:', 'my-api-key-12345 or test@email.com');
                if (testStr) {
                    var result = testStr.replace(regex, '[REDACTED]');
                    alert('Result: ' + result);
                }
            } catch (e) {
                alert('Invalid regex pattern: ' + e.message);
            }
        };

        // Toggle redaction pattern on/off
        document.querySelectorAll('.toggle-redaction').forEach(function(toggle) {
            toggle.onchange = function() {
                var id = toggle.getAttribute('data-id');
                var enabled = toggle.checked;
                vscode.postMessage({ type: 'toggleRedactionPattern', value: { id: id, enabled: enabled } });
            };
        });

        // Remove redaction pattern buttons
        document.querySelectorAll('.btn-remove-redaction').forEach(function(btn) {
            btn.onclick = function() {
                var id = btn.getAttribute('data-id');
                if (id && confirm('Remove this pattern?')) {
                    vscode.postMessage({ type: 'removeRedactionPattern', value: id });
                }
            };
        });

        // Handle messages from extension
        window.addEventListener('message', function(event) {
            var message = event.data;
            console.log('[Dashboard] Received message:', message.type, message);
            if (message.type === 'historyData') {
                // Legacy support if needed
            } else if (message.type === 'statsSnapshot') {
                if (message.data?.stats) {
                    updateStats(message.data.stats);
                }
                if (message.data?.realtimeStats) {
                    if (message.data.realtimeStats.requestsPerMinute !== undefined) document.getElementById('stat-rpm').textContent = message.data.realtimeStats.requestsPerMinute;
                    if (message.data.realtimeStats.avgLatencyMs !== undefined) document.getElementById('stat-latency').innerHTML = message.data.realtimeStats.avgLatencyMs + '<span style="font-size: 10px; opacity: 0.6;">ms</span>';
                    if (message.data.realtimeStats.errorRate !== undefined) document.getElementById('stat-errors').innerHTML = message.data.realtimeStats.errorRate + '<span style="font-size: 10px; opacity: 0.6;">%</span>';
                    if (message.data.realtimeStats.activeConnections !== undefined) {
                        var snapshotConnEl = document.getElementById('stat-connections');
                        if (snapshotConnEl) snapshotConnEl.textContent = message.data.realtimeStats.activeConnections;
                    }
                }
            } else if (message.type === 'statsData') {
                updateStats(message.data);
            } else if (message.type === 'realtimeStats') {
                // Update specific realtime cards
                if (message.data.requestsPerMinute !== undefined) document.getElementById('stat-rpm').textContent = message.data.requestsPerMinute;
                if (message.data.avgLatencyMs !== undefined) document.getElementById('stat-latency').innerHTML = message.data.avgLatencyMs + '<span style="font-size: 10px; opacity: 0.6;">ms</span>';
                if (message.data.errorRate !== undefined) document.getElementById('stat-errors').innerHTML = message.data.errorRate + '<span style="font-size: 10px; opacity: 0.6;">%</span>';
                if (message.data.activeConnections !== undefined) {
                    var connEl = document.getElementById('stat-connections');
                    if (connEl) connEl.textContent = message.data.activeConnections;
                }
            } else if (message.type === 'auditStatsData') {
                updateCharts(message.data);
            } else if (message.type === 'auditSnapshotData') {
                updateAuditSummary(message.summary);
                updateCharts(message.dailyStats);
                updateLogTable(message.logData, message.page, message.total, message.pageSize);
            } else if (message.type === 'auditLogData') {
                console.log('[Dashboard] Updating log table with', message.data?.length || 0, 'entries');
                updateLogTable(message.data, message.page, message.total, message.pageSize);
            } else if (message.type === 'liveLogStart') {
                appendLogStart(message.value);
            } else if (message.type === 'liveLog') {
                appendLog(message.value);
            } else if (message.type === 'requestRefresh') {
                vscode.postMessage({ type: 'getStats' });
                requestAuditSnapshot({ showLoadingLogs: false });
            } else if (message.type === 'scrollTo') {
                // Scroll to a specific section
                var target = message.target;
                if (target === 'wiki') {
                    var wikiSection = document.getElementById('wiki-section');
                    if (wikiSection) {
                        wikiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }
        });

        // Pagination state variables moved to top of script

        document.getElementById('btn-prev-page').onclick = function() {
            if (currentPage > 1) {
                currentPage--;
                requestAuditSnapshot({ showLoadingLogs: true });
            }
        };

        document.getElementById('btn-next-page').onclick = function() {
            if (currentPage * pageSize < totalLogs) {
                currentPage++;
                requestAuditSnapshot({ showLoadingLogs: true });
            }
        };

        function updateCharts(stats) {
            // Charts removed per user request
        }

        // lastLogs declared at top of script

        function formatNumber(num) {
            if (num === undefined || num === null) return '0';
            if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
            if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
            if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
            if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
            return num.toString();
        }

// Live Log Tail Logic
        const logContainer = document.getElementById('live-log-container');
        const autoScroll = document.getElementById('log-autoscroll');
        const logStatus = document.getElementById('log-status-indicator');
        let linesCount = 0;



        function appendLogStart(startLog) {
            if (!logContainer) return;
            if (linesCount === 0) logContainer.innerHTML = '';

            const line = document.createElement('div');
            line.className = 'log-line pending';
            line.setAttribute('data-request-id', startLog.requestId);

            const time = new Date(startLog.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

            line.innerHTML = '<span class="log-time">[' + time + ']</span>' +
                             '<span class="log-method">' + (startLog.method || 'UNK') + '</span>' +
                             '<span class="log-path">' + (startLog.path || '/') + '</span>' +
                             '<span class="log-status">...</span>' +
                             '<span class="log-latency">pending</span>';

            logContainer.appendChild(line);
            linesCount++;

            // Pulse status indicator
            if (logStatus) {
                logStatus.classList.remove('active');
                void logStatus.offsetWidth; // Trigger reflow
                logStatus.classList.add('active');
            }

            // Limit shown lines to 100 for performance
            if (linesCount > 100) {
                logContainer.removeChild(logContainer.firstChild);
                linesCount--;
            }

            if (autoScroll && autoScroll.checked) {
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }

        function appendLog(log) {
            if (!logContainer) return;
            
            // Check if there's a pending entry for this request
            const existingLine = logContainer.querySelector('[data-request-id="' + log.requestId + '"]');
            
            const isError = log.status >= 400;
            const statusClass = isError ? 'error' : 'success';
            const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            if (existingLine) {
                // Update the existing pending entry
                existingLine.className = 'log-line';
                existingLine.innerHTML = '<span class="log-time">[' + time + ']</span>' +
                                 '<span class="log-method">' + (log.method || 'UNK') + '</span>' +
                                 '<span class="log-path">' + (log.path || '/') + '</span>' +
                                 '<span class="log-status ' + statusClass + '">' + (log.status || 0) + '</span>' +
                                 '<span class="log-latency">' + (log.durationMs || 0) + 'ms</span>';
            } else {
                // No pending entry, create a new line (fallback if start event was missed)
                if (linesCount === 0) logContainer.innerHTML = '';

                const line = document.createElement('div');
                line.className = 'log-line';

                line.innerHTML = '<span class="log-time">[' + time + ']</span>' +
                                 '<span class="log-method">' + (log.method || 'UNK') + '</span>' +
                                 '<span class="log-path">' + (log.path || '/') + '</span>' +
                                 '<span class="log-status ' + statusClass + '">' + (log.status || 0) + '</span>' +
                                 '<span class="log-latency">' + (log.durationMs || 0) + 'ms</span>';

                logContainer.appendChild(line);
                linesCount++;

                // Limit shown lines to 100 for performance
                if (linesCount > 100) {
                    logContainer.removeChild(logContainer.firstChild);
                    linesCount--;
                }
            }

            // Pulse status indicator
            if (logStatus) {
                logStatus.classList.remove('active');
                void logStatus.offsetWidth; // Trigger reflow
                logStatus.classList.add('active');
            }

            if (autoScroll && autoScroll.checked) {
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }

        document.getElementById('btn-clear-logs').onclick = function() {
            if (logContainer) {
                logContainer.innerHTML = '<div class="muted" style="text-align: center; padding-top: 120px; opacity: 0.5;">Waiting for API requests...</div>';
                linesCount = 0;
            }
        };

        function updateLogTable(logs, page, total, pSize) {
            lastLogs = logs;
            currentPage = page;
            totalLogs = total;
            pageSize = pSize || 10;

            const tbody = document.getElementById('audit-table-body');
            const pageInfo = document.getElementById('page-info');
            const btnPrev = document.getElementById('btn-prev-page');
            const btnNext = document.getElementById('btn-next-page');

            if (pageInfo) {
                const start = (page - 1) * pageSize + 1;
                const end = Math.min(page * pageSize, total);
                pageInfo.textContent = \`Showing \${total === 0 ? 0 : start}-\${end} of \${total}\`;
            }
            if (btnPrev) btnPrev.disabled = page <= 1;
            if (btnNext) btnNext.disabled = page * pageSize >= total;

            if (!tbody) return;

            // Clear checks to force refresh
            tbody.innerHTML = '';

            if (!logs || logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="padding: 24px; text-align: center; opacity: 0.6; font-style: italic;">No audit logs found.<br><span style="font-size: 11px; opacity: 0.8; margin-top: 4px; display: block;">Make a request to generate logs.</span></td></tr>';
                return;
            }

            tbody.innerHTML = logs.map((log, index) => {
                const date = new Date(log.timestamp);
                const time = date.toLocaleTimeString();
                const statusColor = log.status >= 400 ? 'var(--vscode-testing-iconFailed)' : (log.status >= 300 ? 'var(--vscode-charts-yellow)' : 'var(--vscode-testing-iconPassed)');

                return \`
                <tr style="border-bottom: 1px solid var(--vscode-widget-border);">
                    <td style="padding: 8px 12px; white-space: nowrap; opacity: 0.8;">\${time}</td>
                    <td style="padding: 8px 12px; white-space: nowrap; font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: 0.8;">\${log.ip || '-'}</td>
                    <td style="padding: 8px 12px; white-space: nowrap;"><span style="padding: 2px 6px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); font-size: 11px; font-family: var(--vscode-editor-font-family);">\${log.method || 'UNK'}</span></td>
                    <td style="padding: 8px 12px; word-break: break-all; font-family: var(--vscode-editor-font-family);">\${log.path || '/'}</td>
                    <td style="padding: 8px 12px; white-space: nowrap;"><span style="padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--vscode-charts-blue) 15%, transparent); font-size: 11px; font-family: var(--vscode-editor-font-family);">\${log.model || '-'}</span></td>
                    <td style="padding: 8px 12px; color: \${statusColor}; font-weight: 600;">\${log.status || 0}</td>
                    <td style="padding: 8px 12px;">\${log.durationMs || 0}ms</td>
                    <td style="padding: 8px 12px;" title="\${(log.tokensIn || 0) + (log.tokensOut || 0)} tokens">\${formatNumber ? formatNumber((log.tokensIn || 0) + (log.tokensOut || 0)) : 0}</td>
                    <td style="padding: 8px 12px;">
                        <button class="secondary btn-view-details" data-index="\${index}" style="padding: 2px 8px; font-size: 10px; width: auto;">🔍</button>
                    </td>
                </tr>\`;
    }).join('');

    // Add event listeners for view buttons (CSP safe)
    document.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', () => {
             const index = parseInt(btn.getAttribute('data-index') || '0');
             showDetails(index);
        });
    });
}

function updateStats(stats) {
    if (stats.totalRequests !== undefined) {
        document.getElementById('stat-requests').textContent = formatNumber(stats.totalRequests);
        document.getElementById('stat-requests').title = stats.totalRequests + ' requests';
    }
    if (stats.requestsPerMinute !== undefined) document.getElementById('stat-rpm').textContent = stats.requestsPerMinute;
    if (stats.avgLatencyMs !== undefined) document.getElementById('stat-latency').innerHTML = stats.avgLatencyMs + '<span style="font-size: 12px;">ms</span>';
    if (stats.totalTokensIn !== undefined) {
        document.getElementById('stat-tokens-in').textContent = formatNumber(stats.totalTokensIn);
        document.getElementById('stat-tokens-in').title = stats.totalTokensIn;
    }
    if (stats.totalTokensOut !== undefined) {
        document.getElementById('stat-tokens-out').textContent = formatNumber(stats.totalTokensOut);
        document.getElementById('stat-tokens-out').title = stats.totalTokensOut;
    }
    if (stats.errorRate !== undefined) document.getElementById('stat-errors').innerHTML = stats.errorRate + '<span style="font-size: 12px;">%</span>';
    if (stats.uptimeMs !== undefined) {
        var minutes = Math.floor(stats.uptimeMs / 60000);
        var hours = Math.floor(minutes / 60);
        var display = hours > 0 ? hours + 'h ' + (minutes % 60) + 'm' : minutes + 'm';
        document.getElementById('stat-uptime').textContent = display;
    }

    // Update MCP Status
    if (stats.mcp) {
        var mcpEnabled = stats.mcp.enabled;
        var statusBadge = document.getElementById('mcp-status-badge');
        if (statusBadge) {
            statusBadge.textContent = mcpEnabled ? (stats.mcp.servers.length > 0 ? 'Connected' : 'Ready') : 'Disabled';
            statusBadge.style.background = mcpEnabled ? (stats.mcp.servers.length > 0 ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-blue)') : 'var(--vscode-charts-red)';
            statusBadge.style.color = 'white';
            statusBadge.style.padding = '2px 8px';
            statusBadge.style.borderRadius = '10px';
            statusBadge.style.fontSize = '10px';
        }

        var toggle = document.getElementById('mcp-enabled-toggle');
        if (toggle) toggle.checked = mcpEnabled;

        // Render Tools Grouped by Server
        var contentArea = document.getElementById('mcp-content-area');
        if (contentArea && stats.mcp.tools) {
            if (!mcpEnabled) {
                contentArea.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">MCP is disabled. Enable it in settings or toggle above.</div>';
                return;
            }

            if (stats.mcp.tools.length === 0) {
                 contentArea.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">No tools available. Connect a server or enable built-in tools.</div>';
                 return;
            }

            // Group tools
            var groups = {};
            stats.mcp.tools.forEach(function(tool) {
                if (!groups[tool.serverName]) { groups[tool.serverName] = []; }
                groups[tool.serverName].push(tool);
            });

            var html = '<div style="display: flex; flex-direction: column; gap: 24px;">';

            Object.keys(groups).sort().forEach(function(serverName) {
                var serverTools = groups[serverName];
                html += '<div>';
                html += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">';
                html += '<span class="badge" style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); font-size: 10px;">' + serverName + '</span>';
                html += '<div style="height: 1px; flex: 1; background: var(--vscode-widget-border); opacity: 0.5;"></div>';
                html += '</div>';
                html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">';
                serverTools.forEach(function(t) {
                    html += '<div style="padding: 12px; border: 1px solid var(--vscode-widget-border); border-radius: 8px; background: rgba(0,0,0,0.02);">';
                    html += '<div style="font-family: var(--vscode-editor-font-family); font-weight: 600; font-size: 12px; margin-bottom: 4px; color: var(--vscode-textPreformat-foreground);">' + t.name + '</div>';
                    html += '<div style="font-size: 11px; opacity: 0.7; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="' + (t.description || '') + '">' + (t.description || 'No description') + '</div>';
                    html += '</div>';
                });
                html += '</div>';
                html += '</div>';
            });

html += '</div>';

// Only update if changed to avoid flicker (hashing would be better but simple string comparison works for now)
// Actually, innerHTML rewrite is fine for this dashboard frequency
contentArea.innerHTML = html;
}
    }
}

// Auto-refresh stats every 5 seconds
setInterval(function () {
    vscode.postMessage({ type: 'getStats' });
}, 5000);

</script>
    </body>
    </html>`;
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
