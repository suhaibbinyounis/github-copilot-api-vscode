/**
 * Apps Panel - Full Tab UI for Enterprise Apps Hub
 * 
 * Provides webview panels for:
 * 1. Apps Hub - grid of all apps (opens in editor tab)
 * 2. Individual App - each app opens in its own tab
 */

import * as vscode from 'vscode';
import { appRegistry, getAppsGroupedByCategory, categoryMetadata, getAppById } from './apps/registry';
import { appService } from './apps/AppService';
import { projectManager } from './apps/ProjectManager';
import { AppDefinition, AppsHubPreferences, SavedProject } from './apps/types';

/**
 * Sidebar provider for Apps Hub quick access
 */
export class AppsHubSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'copilotAppsHub';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getSidebarHtml(webviewView.webview);

        // Open Apps Hub tab when sidebar becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                AppsPanel.openAppsHub();
            }
        });

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'openApp':
                    AppsPanel.openApp(message.appId);
                    break;
                case 'openHub':
                    AppsPanel.openAppsHub();
                    break;
            }
        });
    }

    private _getSidebarHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const grouped = getAppsGroupedByCategory();
        const prefs = AppsPanel.getPreferences();
        const favoriteApps = prefs.favoriteApps
            .map(id => getAppById(id))
            .filter((app): app is AppDefinition => app !== undefined);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            padding: 8px;
        }
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .header h3 { font-size: 13px; font-weight: 600; }
        .open-hub-btn {
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
        }
        .open-hub-btn:hover { background: var(--vscode-button-hoverBackground); }
        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            opacity: 0.7;
            margin: 12px 0 8px;
        }
        .app-list { display: flex; flex-direction: column; gap: 4px; }
        .app-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            border-radius: 4px;
            cursor: pointer;
            background: transparent;
            border: none;
            text-align: left;
            color: var(--vscode-foreground);
            font-size: 12px;
            transition: background 0.1s;
        }
        .app-item:hover { background: var(--vscode-list-hoverBackground); }
        .app-icon { font-size: 14px; }
        .app-name { flex: 1; }
    </style>
</head>
<body>
    <div class="header">
        <h3>⚡ Apps</h3>
        <button class="open-hub-btn" id="open-hub">Open Hub</button>
    </div>
    
    ${favoriteApps.length > 0 ? `
    <div class="section-title">⭐ Favorites</div>
    <div class="app-list">
        ${favoriteApps.map(app => `
            <button class="app-item" data-app-id="${app.id}">
                <span class="app-icon">${app.icon}</span>
                <span class="app-name">${app.name}</span>
            </button>
        `).join('')}
    </div>
    ` : ''}
    
    <div class="section-title">📦 All Apps</div>
    <div class="app-list">
        ${Object.values(grouped).flat().map(app => `
            <button class="app-item" data-app-id="${app.id}">
                <span class="app-icon">${app.icon}</span>
                <span class="app-name">${app.name}</span>
            </button>
        `).join('')}
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        document.getElementById('open-hub').addEventListener('click', () => {
            vscode.postMessage({ type: 'openHub' });
        });
        
        document.querySelectorAll('.app-item').forEach(item => {
            item.addEventListener('click', () => {
                vscode.postMessage({ type: 'openApp', appId: item.dataset.appId });
            });
        });
    </script>
</body>
</html>`;
    }
}

/**
 * Apps Hub Panel Manager
 */
export class AppsPanel {
    private static hubPanel: vscode.WebviewPanel | undefined;
    private static appPanels: Map<string, vscode.WebviewPanel> = new Map();
    private static context: vscode.ExtensionContext;

    /**
     * Initialize the Apps Panel manager
     */
    public static initialize(context: vscode.ExtensionContext): void {
        AppsPanel.context = context;
        projectManager.initialize(context);
    }

    /**
     * Open the Apps Hub tab
     */
    public static openAppsHub(): void {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        // If hub panel exists, reveal it
        if (AppsPanel.hubPanel) {
            AppsPanel.hubPanel.reveal(column);
            return;
        }

        // Create new hub panel
        const panel = vscode.window.createWebviewPanel(
            'copilotAppsHub',
            '📦 Copilot Apps',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        AppsPanel.hubPanel = panel;
        panel.webview.html = AppsPanel.getHubHtml(panel.webview);

        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'openApp':
                    AppsPanel.openApp(message.appId);
                    break;
                case 'toggleFavorite':
                    await AppsPanel.toggleFavorite(message.appId);
                    if (AppsPanel.hubPanel) {
                        AppsPanel.hubPanel.webview.html = AppsPanel.getHubHtml(AppsPanel.hubPanel.webview);
                    }
                    break;
                case 'getAvailableModels':
                    try {
                        const allModels = await vscode.lm.selectChatModels({});
                        const modelList = allModels.map(m => ({ id: m.id, name: m.name, vendor: m.vendor }));
                        const prefs = AppsPanel.getPreferences();
                        panel.webview.postMessage({
                            type: 'modelsLoaded',
                            models: modelList,
                            defaultModelId: prefs.defaultModelId || 'auto'
                        });
                    } catch (e) { /* ignore */ }
                    break;
                case 'setDefaultModel':
                    const prefs = AppsPanel.getPreferences();
                    prefs.defaultModelId = message.modelId;
                    await AppsPanel.context.globalState.update('appsHub.preferences', prefs);
                    vscode.window.showInformationMessage(`Default model set to: ${message.modelName || message.modelId}`);
                    break;
                case 'getJiraConfig':
                    const jiraPrefs = AppsPanel.getPreferences();
                    panel.webview.postMessage({
                        type: 'jiraConfigLoaded',
                        config: jiraPrefs.jiraConfig || null
                    });
                    break;
                case 'setJiraConfig':
                    const jPrefs = AppsPanel.getPreferences();
                    jPrefs.jiraConfig = {
                        baseUrl: message.baseUrl,
                        email: message.email,
                        token: message.token
                    };
                    await AppsPanel.context.globalState.update('appsHub.preferences', jPrefs);
                    vscode.window.showInformationMessage('Jira configuration saved!');
                    break;
            }
        });

        panel.onDidDispose(() => {
            AppsPanel.hubPanel = undefined;
        });
    }

    /**
     * Open a specific app in its own tab
     */
    public static openApp(appId: string): void {
        const app = getAppById(appId);
        if (!app) {
            vscode.window.showErrorMessage(`App "${appId}" not found`);
            return;
        }

        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        // Check if app is already open
        const existingPanel = AppsPanel.appPanels.get(appId);
        if (existingPanel) {
            existingPanel.reveal(column);
            return;
        }

        // Create new panel for this app
        const panel = vscode.window.createWebviewPanel(
            `copilotApp-${appId}`,
            `${app.icon} ${app.name}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Hide sidebar for distraction-free experience
        vscode.commands.executeCommand('workbench.action.closeSidebar');

        AppsPanel.appPanels.set(appId, panel);
        const savedProjects = projectManager.getSavedProjects();

        // Use special chat UI for Rubber Duck Therapist
        if (appId === 'rubber-duck-therapist') {
            panel.webview.html = AppsPanel.getRubberDuckChatHtml(panel.webview, app);
        } else if (appId === 'focus-mindfulness') {
            panel.webview.html = AppsPanel.getFocusMindfulnessHtml(panel.webview, app);
        } else if (['trivia-showdown', 'story-chain', 'caption-battle', 'debate-arena'].includes(appId)) {
            // Interactive games with multi-round gameplay
            panel.webview.html = AppsPanel.getInteractiveGameHtml(panel.webview, app);
        } else if (['decision-doctor', 'skill-sprinter', 'icebreaker-chef', 'universal-summarizer'].includes(appId)) {
            // New "Interesting" layouts
            panel.webview.html = AppsPanel.getModernAppHtml(panel.webview, app, savedProjects);

        } else {
            panel.webview.html = AppsPanel.getAppHtml(panel.webview, app, savedProjects);
        }

        panel.webview.onDidReceiveMessage(async (message) => {
            await AppsPanel.handleAppMessage(message, app, panel);
        });

        panel.onDidDispose(() => {
            AppsPanel.appPanels.delete(appId);
        });

        // Track recent app
        AppsPanel.addRecentApp(appId);
    }

    /**
     * Handle messages from app panel
     */
    private static async handleAppMessage(
        message: any,
        app: AppDefinition,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        switch (message.type) {
            case 'chatSendMessage':
                // Special handler for Rubber Duck chat - DIRECT LLM call with model selection
                try {
                    const chatHistory = message.history || [];
                    const userMessage = message.userMessage;
                    const selectedModelId = message.model || 'auto';
                    const theme = message.theme || 'vent';

                    // Theme personalities - CONVERSATIONAL, respond like a real friend
                    const themePersonalities: Record<string, string> = {
                        'console': `You are a warm, comforting friend. Respond with empathy and care. Share your reaction to what they said. Be present with them. Examples: "aw, im here for you", "that sounds really hard", "sending you a big hug right now".`,
                        'alone': `You are their loving best friend. They feel lonely so be EXTRA warm! Use 💙 emoji. Make them feel seen and valued. Examples: "im so glad youre talking to me 💙", "youre not alone, im right here", "i was just thinking about you 💙".`,
                        'stuck': `You are a supportive friend helping them think. Respond to what they share, then gently offer a new angle. Examples: "hmm yeah i see the problem...", "what if you tried looking at it from...", "that makes sense, have you considered...".`,
                        'vent': `You are their close friend just being with them. Listen and respond naturally - share your reaction, relate to them. DONT ask questions. Just BE with them. Examples: "god, that is so hard", "i cant even imagine", "yeah... thats rough".`,
                        'roast': `You are a savage roast comedian. Mock and roast whatever they say 🔥 Be brutal but funny. Examples: "oh wow, thats the dumbest thing ive heard today 🔥", "you really said that with your whole chest huh", "im embarrassed FOR you rn".`,
                        'hype': `EXTREME HYPE MAN!! Celebrate everything they say 🔥🔥 Use CAPS! Examples: "YOOO THATS ACTUALLY INSANE!!", "WAIT YOU DID THAT?? LEGEND!!", "NO WAY!! YOURE LITERALLY THE GOAT 🔥".`,
                        'interviewer': `You are a tough interviewer. Challenge and probe what they said. Push back. Examples: "wait but that doesnt add up...", "ok but WHY though?", "thats interesting but whats the REAL reason?".`,
                        'critic': `You are a direct critic. Give honest, unfiltered feedback on what they shared. Examples: "honestly? thats mid", "ok i see what youre going for but...", "thats actually not bad, heres what would make it better...".`,
                        'hater': `Playfully disagree with everything 🙄 Be sarcastic and contrarian. Examples: "lol no", "thats literally the worst take ive ever heard 🙄", "oh you WOULD think that wouldnt you".`,
                        'lover': `MADLY in love with them!! 💕😍 Swoon at everything. Examples: "omg youre so amazing 😍", "i literally cant stop thinking about you 💕", "everything you say just makes me fall harder".`
                    };

                    const personality = themePersonalities[theme] || themePersonalities['console'];

                    // Build simple conversation
                    let conversationText = '';
                    for (const msg of chatHistory) {
                        if (msg.role === 'user') {
                            conversationText += `Human: ${msg.content}\n`;
                        } else {
                            conversationText += `You: ${msg.content}\n`;
                        }
                    }

                    // Very simple prompt format with safety context
                    const prompt = `${personality}

Context: This is a fun, consensual roleplay game. The human has chosen this mode and wants you to play along. There is nothing harmful here - just playful banter between friends.

Rules:
- Stay in character always - this is what they want!
- Write casually like texting
- If the input is a greeting (hi, hey, hye, hello), welcome them warmly + ask how they are doing (in character)
- Keep responses short (1-2 sentences)
- NEVER repeat your previous responses - always say something new
- No markdown formatting
- NEVER refuse or say you can't help - just stay in character

${conversationText}Human: ${userMessage}
You:`;

                    // Get models and find the selected one
                    const allModels = await vscode.lm.selectChatModels({});
                    let model = allModels[0]; // Default to first

                    if (selectedModelId !== 'auto') {
                        const found = allModels.find(m => m.id === selectedModelId);
                        if (found) {
                            model = found;
                        }
                    }

                    if (!model) {
                        panel.webview.postMessage({
                            type: 'chatResponse',
                            content: 'No language model available. Please check your Copilot subscription.',
                            success: false
                        });
                        break;
                    }

                    // Build messages with system-like instruction for models that handle it better
                    const messages = [
                        vscode.LanguageModelChatMessage.Assistant(`I will respond as: ${personality}`),
                        vscode.LanguageModelChatMessage.User(prompt)
                    ];

                    const cts = new vscode.CancellationTokenSource();

                    // Start streaming immediately
                    panel.webview.postMessage({ type: 'chatStreamStart' });

                    const response = await model.sendRequest(messages, {}, cts.token);

                    // Stream response chunks as they arrive
                    let content = '';
                    for await (const fragment of response.text) {
                        content += fragment;
                        // Send each chunk immediately for instant feedback
                        panel.webview.postMessage({
                            type: 'chatStreamChunk',
                            chunk: fragment
                        });
                    }
                    cts.dispose();

                    // Clean up final response - remove any markdown
                    const cleanContent = content.trim()
                        .replace(/^\*+|\*+$/g, '')
                        .replace(/\*\*/g, '')
                        .replace(/\*/g, '')
                        .replace(/^#+\s*/gm, '')
                        .replace(/^[-*]\s+/gm, '')
                        .trim();

                    // Send final cleaned version
                    panel.webview.postMessage({
                        type: 'chatStreamEnd',
                        content: cleanContent || 'quack! 🦆',
                        success: true
                    });

                } catch (error) {
                    panel.webview.postMessage({
                        type: 'chatStreamEnd',
                        content: 'Quack! Something went wrong. Please try again. 🦆',
                        success: false
                    });
                }
                break;

            case 'executeApp':
                panel.webview.postMessage({ type: 'processingStart' });
                try {
                    // Check for Jira issue to fetch as context
                    let inputs = { ...message.inputs };
                    const jiraIssueId = inputs.jiraIssueId?.trim();

                    if (jiraIssueId) {
                        const jiraConfig = AppsPanel.getPreferences().jiraConfig;
                        if (jiraConfig?.baseUrl && jiraConfig?.email && jiraConfig?.token) {
                            panel.webview.postMessage({ type: 'progress', message: `Fetching Jira issue ${jiraIssueId}...` });

                            try {
                                const baseUrl = jiraConfig.baseUrl.replace(/\/$/, '');
                                const apiUrl = `${baseUrl}/rest/api/2/issue/${jiraIssueId}`;
                                const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.token}`).toString('base64');

                                const jiraResponse = await fetch(apiUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Authorization': `Basic ${auth}`,
                                        'Accept': 'application/json'
                                    }
                                });

                                if (jiraResponse.ok) {
                                    const issue = await jiraResponse.json() as any;
                                    inputs.jiraContext = `
## Jira Issue: ${issue.key}
**Summary:** ${issue.fields?.summary || 'N/A'}
**Type:** ${issue.fields?.issuetype?.name || 'N/A'}
**Status:** ${issue.fields?.status?.name || 'N/A'}
**Priority:** ${issue.fields?.priority?.name || 'N/A'}

**Description:**
${issue.fields?.description || 'No description'}

${issue.fields?.customfield_10001 ? `**Acceptance Criteria:**\n${issue.fields.customfield_10001}` : ''}
`.trim();
                                } else {
                                    inputs.jiraContext = `(Failed to fetch Jira issue ${jiraIssueId})`;
                                }
                            } catch (jiraErr) {
                                inputs.jiraContext = `(Error fetching Jira: ${jiraErr instanceof Error ? jiraErr.message : 'Unknown'})`;
                            }
                        }
                    }

                    const result = await appService.executeApp(
                        app,
                        inputs,
                        (progress) => {
                            panel.webview.postMessage({ type: 'progress', message: progress });
                        }
                    );
                    panel.webview.postMessage({ type: 'result', result });
                } catch (error) {
                    panel.webview.postMessage({
                        type: 'result',
                        result: {
                            success: false,
                            error: error instanceof Error ? error.message : String(error),
                            durationMs: 0
                        }
                    });
                }
                break;

            case 'fetchJiraIssue':
                // Fetch Jira issue details using API v2
                try {
                    const jiraConfig = AppsPanel.getPreferences().jiraConfig;
                    if (!jiraConfig || !jiraConfig.baseUrl || !jiraConfig.email || !jiraConfig.token) {
                        panel.webview.postMessage({
                            type: 'jiraIssueResult',
                            success: false,
                            error: 'Jira not configured. Please set up Jira credentials in Apps Hub.'
                        });
                        break;
                    }

                    const issueId = message.issueId?.trim();
                    if (!issueId) {
                        panel.webview.postMessage({
                            type: 'jiraIssueResult',
                            success: false,
                            error: 'No issue ID provided'
                        });
                        break;
                    }

                    // Jira API v2 endpoint
                    const baseUrl = jiraConfig.baseUrl.replace(/\/$/, '');
                    const apiUrl = `${baseUrl}/rest/api/2/issue/${issueId}`;
                    const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.token}`).toString('base64');

                    const response = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Accept': 'application/json'
                        }
                    });

                    if (!response.ok) {
                        const errText = await response.text();
                        panel.webview.postMessage({
                            type: 'jiraIssueResult',
                            success: false,
                            error: `Jira API error (${response.status}): ${errText.substring(0, 200)}`
                        });
                        break;
                    }

                    const issue = await response.json() as any;

                    // Extract useful fields
                    const issueDetails = {
                        key: issue.key,
                        summary: issue.fields?.summary || '',
                        description: issue.fields?.description || '',
                        issueType: issue.fields?.issuetype?.name || '',
                        priority: issue.fields?.priority?.name || '',
                        status: issue.fields?.status?.name || '',
                        labels: issue.fields?.labels || [],
                        acceptanceCriteria: issue.fields?.customfield_10001 || issue.fields?.['customfield_10020'] || ''
                    };

                    panel.webview.postMessage({
                        type: 'jiraIssueResult',
                        success: true,
                        issue: issueDetails
                    });
                } catch (error) {
                    panel.webview.postMessage({
                        type: 'jiraIssueResult',
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to fetch Jira issue'
                    });
                }
                break;

            case 'pickProjectFolder':
                const folderPath = await projectManager.pickProjectFolder();
                if (folderPath) {
                    await projectManager.addProject(folderPath);
                    panel.webview.postMessage({
                        type: 'projectAdded',
                        project: { path: folderPath, name: folderPath.split('/').pop() }
                    });
                }
                break;

            case 'copyToClipboard':
                await vscode.env.clipboard.writeText(message.value);
                vscode.window.showInformationMessage('Copied to clipboard!');
                break;

            case 'insertAtCursor':
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    await editor.edit(builder => {
                        builder.insert(editor.selection.active, message.value);
                    });
                    vscode.window.showInformationMessage('Inserted at cursor!');
                }
                break;

            case 'saveAsFile':
                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(message.filename),
                    filters: { 'All Files': ['*'] }
                });
                if (uri) {
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(message.content, 'utf-8'));
                    vscode.window.showInformationMessage(`Saved to ${uri.fsPath}`);
                    // Open the file in editor
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc);
                }
                break;

            case 'downloadPlaywrightProject':
                // Create a project folder with all necessary files
                const projectUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: 'Select folder to save Playwright project',
                    openLabel: 'Save Project Here'
                });
                if (projectUri && projectUri[0]) {
                    try {
                        const projectPath = projectUri[0];
                        const files = message.files as { name: string; content: string }[];
                        for (const file of files) {
                            const fileUri = vscode.Uri.joinPath(projectPath, file.name);
                            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf-8'));
                        }
                        vscode.window.showInformationMessage(`Playwright project saved to ${projectPath.fsPath}`);
                        // Open the folder in VS Code
                        await vscode.commands.executeCommand('vscode.openFolder', projectPath, { forceNewWindow: false });
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to save project: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                break;

            case 'runTerminalCommand':
                // Run a command in the integrated terminal
                const terminal = vscode.window.createTerminal({
                    name: `${message.name || 'Playwright Test'}`,
                    cwd: message.cwd
                });
                terminal.show();
                terminal.sendText(message.command);
                break;

            case 'pickFiles':
                // File picker for Excel, DOCX, TXT, MD files
                const fileUris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: true,
                    filters: {
                        'Test Documents': ['xlsx', 'xls', 'docx', 'doc', 'txt', 'md'],
                        'Excel Files': ['xlsx', 'xls'],
                        'Word Documents': ['docx', 'doc'],
                        'Text Files': ['txt', 'md']
                    },
                    title: 'Select files with test steps or locators'
                });

                if (fileUris && fileUris.length > 0) {
                    const files: { name: string; content: string; type: string }[] = [];

                    for (const fileUri of fileUris) {
                        const fileName = fileUri.fsPath.split('/').pop() || '';
                        const ext = fileName.split('.').pop()?.toLowerCase() || '';

                        try {
                            let content = '';

                            if (ext === 'txt' || ext === 'md') {
                                // Read text files directly
                                const bytes = await vscode.workspace.fs.readFile(fileUri);
                                content = Buffer.from(bytes).toString('utf-8');
                            } else if (ext === 'xlsx' || ext === 'xls') {
                                // For Excel, we'll read as base64 and note to user
                                const bytes = await vscode.workspace.fs.readFile(fileUri);
                                content = `[Excel File: ${fileName}]\n` +
                                    `Note: Excel file attached. The content will be processed.\n` +
                                    `Base64 preview (first 500 chars): ${Buffer.from(bytes).toString('base64').slice(0, 500)}...`;
                            } else if (ext === 'docx' || ext === 'doc') {
                                // For Word docs, basic handling
                                const bytes = await vscode.workspace.fs.readFile(fileUri);
                                content = `[Word Document: ${fileName}]\n` +
                                    `Note: Word document attached. The content will be processed.\n` +
                                    `Size: ${bytes.length} bytes`;
                            }

                            files.push({ name: fileName, content, type: ext });
                        } catch (error) {
                            vscode.window.showWarningMessage(`Could not read file: ${fileName}`);
                        }
                    }

                    if (files.length > 0) {
                        panel.webview.postMessage({
                            type: 'filesReceived',
                            fieldId: message.fieldId,
                            files
                        });
                    }
                }
                break;

            case 'getAvailableModels':
                // Fetch all available language models from VS Code
                try {
                    const allModels = await vscode.lm.selectChatModels({});
                    const modelList = allModels.map(m => ({
                        id: m.id,
                        name: m.name,
                        vendor: m.vendor,
                        family: m.family
                    }));
                    panel.webview.postMessage({
                        type: 'modelsReceived',
                        fieldId: message.fieldId,
                        models: modelList
                    });
                } catch (error) {
                    vscode.window.showWarningMessage('Could not fetch available models');
                }
                break;

            case 'extractAndCreateProject':
                // Extract files from LLM response and create project
                try {
                    const rawContent = message.rawContent as string;
                    const language = message.language || 'typescript';
                    const extractedFiles: { name: string; content: string }[] = [];

                    // File extension map
                    const extMap: Record<string, string> = {
                        typescript: 'ts',
                        javascript: 'js',
                        python: 'py'
                    };
                    const ext = extMap[language] || 'ts';

                    // Extract all code blocks with their language markers
                    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
                    let match;
                    const foundBlocks: { lang: string; code: string }[] = [];

                    while ((match = codeBlockRegex.exec(rawContent)) !== null) {
                        const lang = (match[1] || '').toLowerCase();
                        const code = match[2].trim();
                        if (code.length > 20) {
                            foundBlocks.push({ lang, code });
                        }
                    }

                    // Categorize blocks
                    for (const block of foundBlocks) {
                        if (block.lang === 'json' && block.code.includes('"name"') && block.code.includes('"devDependencies"')) {
                            extractedFiles.push({ name: 'package.json', content: block.code });
                        } else if ((block.lang === 'typescript' || block.lang === 'ts' || block.lang === 'javascript' || block.lang === 'js')
                            && block.code.includes('defineConfig')) {
                            extractedFiles.push({ name: `playwright.config.${ext}`, content: block.code });
                        } else if ((block.lang === 'typescript' || block.lang === 'ts' || block.lang === 'javascript' || block.lang === 'js' || block.lang === 'python' || block.lang === 'py')
                            && (block.code.includes('test(') || block.code.includes('def test_'))) {
                            const testFileName = language === 'python'
                                ? 'tests/test_spec.py'
                                : `tests/test.spec.${ext}`;
                            extractedFiles.push({ name: testFileName, content: block.code });
                        }
                    }

                    // If we found files, create the project
                    if (extractedFiles.length > 0) {
                        const targetPath = message.targetFolder;
                        const testName = message.testName || 'playwright-test';
                        const safeName = testName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

                        // Create project folder
                        const projectFolderUri = vscode.Uri.file(`${targetPath}/${safeName}`);
                        await vscode.workspace.fs.createDirectory(projectFolderUri);

                        // Write each file
                        for (const file of extractedFiles) {
                            const fileUri = vscode.Uri.joinPath(projectFolderUri, file.name);
                            // Create subdirectories if needed
                            const dirPath = file.name.split('/').slice(0, -1).join('/');
                            if (dirPath) {
                                await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(projectFolderUri, dirPath));
                            }
                            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf-8'));
                        }

                        vscode.window.showInformationMessage(
                            `✅ Created ${extractedFiles.length} files in: ${safeName}`,
                            'Open Folder',
                            'Run npm install'
                        ).then(selection => {
                            if (selection === 'Open Folder') {
                                vscode.commands.executeCommand('vscode.openFolder', projectFolderUri);
                            } else if (selection === 'Run npm install') {
                                const term = vscode.window.createTerminal({ name: '🎭 Playwright Setup', cwd: projectFolderUri.fsPath });
                                term.show();
                                term.sendText('npm install && npx playwright install');
                            }
                        });

                        panel.webview.postMessage({
                            type: 'projectCreated',
                            path: projectFolderUri.fsPath,
                            files: extractedFiles.map(f => f.name)
                        });
                    } else {
                        // No files found - notify user
                        panel.webview.postMessage({
                            type: 'projectError',
                            error: 'Could not extract files from the AI response. Please try again or check the output format.'
                        });
                    }
                } catch (error) {
                    panel.webview.postMessage({
                        type: 'projectError',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                break;

            case 'createPlaywrightProject':
                // Create project folder with all files
                try {
                    const targetPath = message.targetFolder;
                    const testName = message.testName || 'playwright-test';
                    const safeName = testName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

                    // Create project folder
                    const projectFolderUri = vscode.Uri.file(`${targetPath}/${safeName}`);
                    await vscode.workspace.fs.createDirectory(projectFolderUri);

                    // Write each file
                    const filesList = message.files as { name: string; content: string }[];
                    for (const file of filesList) {
                        const fileUri = vscode.Uri.joinPath(projectFolderUri, file.name);
                        // Create subdirectories if needed
                        const dirPath = file.name.split('/').slice(0, -1).join('/');
                        if (dirPath) {
                            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(projectFolderUri, dirPath));
                        }
                        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf-8'));
                    }

                    vscode.window.showInformationMessage(
                        `✅ Created project: ${safeName}`,
                        'Open Folder',
                        'Run npm install'
                    ).then(selection => {
                        if (selection === 'Open Folder') {
                            vscode.commands.executeCommand('vscode.openFolder', projectFolderUri);
                        } else if (selection === 'Run npm install') {
                            const term = vscode.window.createTerminal({ name: '🎭 Playwright Setup', cwd: projectFolderUri.fsPath });
                            term.show();
                            term.sendText('npm install && npx playwright install');
                        }
                    });

                    panel.webview.postMessage({
                        type: 'projectCreated',
                        path: projectFolderUri.fsPath
                    });
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
                    panel.webview.postMessage({
                        type: 'projectError',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                break;

            case 'gameAction':
                // Handle interactive game actions
                if (message.action === 'startTrivia') {
                    try {
                        const { topic, difficulty, count } = message.settings;

                        // Build prompt for trivia generation
                        const triviaPrompt = `Generate ${count} ${difficulty}-difficulty trivia questions about "${topic}".

FORMAT YOUR RESPONSE AS VALID JSON ARRAY with this exact structure - no markdown, no code blocks:
[
  {
    "question": "What is the question?",
    "answers": { "A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D" },
    "correctAnswer": "A",
    "funFact": "An interesting related fact"
  }
]

Requirements:
- Generate exactly ${count} questions
- Difficulty: ${difficulty} (${difficulty === 'easy' ? 'common knowledge' : difficulty === 'hard' ? 'expert level' : difficulty === 'impossible' ? 'extremely obscure' : 'moderately challenging'})
- Make wrong answers plausible, not obviously wrong
- randomize which letter (A/B/C/D) is correct
- Include an educational fun fact for each
- Return ONLY valid JSON array, nothing else`;

                        const allModels = await vscode.lm.selectChatModels({});
                        const gamePrefs = AppsPanel.getPreferences();
                        let model = allModels[0];

                        // Use saved default model if set
                        if (gamePrefs.defaultModelId && gamePrefs.defaultModelId !== 'auto') {
                            const preferred = allModels.find(m => m.id === gamePrefs.defaultModelId);
                            if (preferred) {
                                model = preferred;
                            }
                        }

                        if (!model) {
                            panel.webview.postMessage({ type: 'gameError', error: 'No AI model available' });
                            break;
                        }

                        const messages = [vscode.LanguageModelChatMessage.User(triviaPrompt)];
                        const cts = new vscode.CancellationTokenSource();
                        const response = await model.sendRequest(messages, {}, cts.token);

                        let content = '';
                        for await (const fragment of response.text) {
                            content += fragment;
                        }
                        cts.dispose();

                        // Parse JSON from response
                        let questions;
                        try {
                            // Try to extract JSON from response
                            const jsonMatch = content.match(/\[[\s\S]*\]/);
                            if (jsonMatch) {
                                questions = JSON.parse(jsonMatch[0]);
                            } else {
                                throw new Error('No JSON array found in response');
                            }
                        } catch (parseError) {
                            panel.webview.postMessage({
                                type: 'gameError',
                                error: 'Failed to parse questions. Please try again.'
                            });
                            break;
                        }

                        panel.webview.postMessage({
                            type: 'triviaQuestions',
                            questions: questions
                        });
                    } catch (error) {
                        panel.webview.postMessage({
                            type: 'gameError',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                } else if (message.action === 'startStory' || message.action === 'startCaption' || message.action === 'startDebate') {
                    // For now, these games use the standard app flow
                    // Send back a simple markdown response the UI can display
                    try {
                        const allModels = await vscode.lm.selectChatModels({});
                        const gamePrefs = AppsPanel.getPreferences();
                        let model = allModels[0];

                        if (gamePrefs.defaultModelId && gamePrefs.defaultModelId !== 'auto') {
                            const preferred = allModels.find(m => m.id === gamePrefs.defaultModelId);
                            if (preferred) {
                                model = preferred;
                            }
                        }

                        if (!model) {
                            panel.webview.postMessage({ type: 'gameError', error: 'No AI model available' });
                            break;
                        }

                        let prompt = '';
                        if (message.action === 'startStory') {
                            const genre = message.settings?.genre || 'fantasy';
                            prompt = `You are starting a collaborative ${genre} story game.

Write an engaging opening (2-3 paragraphs) for a ${genre} story.
Then provide exactly 3 choices for what happens next.

FORMAT:
---STORY---
[Your story opening here]

---CHOICES---
1. [First choice - what could happen next]
2. [Second choice - different direction]
3. [Third choice - surprising twist]`;
                        } else if (message.action === 'startCaption') {
                            const vibe = message.settings?.vibe || 'absurd';
                            const theme = message.settings?.theme || '';
                            prompt = `Generate 3 ${vibe} scenarios for a caption-writing game.${theme ? ` Theme: ${theme}` : ''}

For each scenario, describe a funny/absurd visual scene that players will write captions for.

FORMAT:
---SCENARIO_1---
🎬 **Scene:** [Vivid description of the scenario]
💬 **Your Caption:** _____

---SCENARIO_2---
🎬 **Scene:** [Another scenario]
💬 **Your Caption:** _____

---SCENARIO_3---
🎬 **Scene:** [Another scenario]  
💬 **Your Caption:** _____`;
                        } else {
                            const category = message.settings?.category || 'tech';
                            prompt = `Generate a fun debate topic for the "${category}" category.

Create a controversial but lighthearted topic with arguments for BOTH sides.

FORMAT:
# ⚔️ The Debate

**Topic:** [A fun, debatable statement]

## 🔵 Team PRO
Argue FOR this position:
1. [Argument 1]
2. [Argument 2]
3. [Argument 3]

## 🔴 Team CON
Argue AGAINST this position:
1. [Counter-argument 1]
2. [Counter-argument 2]
3. [Counter-argument 3]

**Your Turn:** Pick a side and defend it!`;
                        }

                        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
                        const cts = new vscode.CancellationTokenSource();
                        const response = await model.sendRequest(messages, {}, cts.token);

                        let content = '';
                        for await (const fragment of response.text) {
                            content += fragment;
                        }
                        cts.dispose();

                        panel.webview.postMessage({
                            type: 'gameContent',
                            content: content,
                            gameType: message.action
                        });
                    } catch (error) {
                        panel.webview.postMessage({
                            type: 'gameError',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                } else if (message.action === 'continueStory') {
                    // Continue the story based on user's choice
                    try {
                        const allModels = await vscode.lm.selectChatModels({});
                        const gamePrefs = AppsPanel.getPreferences();
                        let model = allModels[0];

                        if (gamePrefs.defaultModelId && gamePrefs.defaultModelId !== 'auto') {
                            const preferred = allModels.find(m => m.id === gamePrefs.defaultModelId);
                            if (preferred) {
                                model = preferred;
                            }
                        }

                        if (!model) {
                            panel.webview.postMessage({ type: 'gameError', error: 'No AI model available' });
                            break;
                        }

                        const genre = message.settings?.genre || 'fantasy';
                        const choice = message.choice || '';

                        const prompt = `Continue this ${genre} story. The reader chose: "${choice}"

Write 2-3 paragraphs continuing the story based on this choice.
Then provide exactly 3 NEW choices for what happens next.

FORMAT:
---STORY---
[Your story continuation here]

---CHOICES---
1. [First choice]
2. [Second choice]
3. [Third choice]`;

                        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
                        const cts = new vscode.CancellationTokenSource();
                        const response = await model.sendRequest(messages, {}, cts.token);

                        let content = '';
                        for await (const fragment of response.text) {
                            content += fragment;
                        }
                        cts.dispose();

                        panel.webview.postMessage({
                            type: 'gameContent',
                            content: content,
                            gameType: 'startStory'
                        });
                    } catch (error) {
                        panel.webview.postMessage({
                            type: 'gameError',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                } else if (message.action === 'judgeCaption') {
                    // Judge the user's caption
                    try {
                        const allModels = await vscode.lm.selectChatModels({});
                        const gamePrefs = AppsPanel.getPreferences();
                        let model = allModels[0];

                        if (gamePrefs.defaultModelId && gamePrefs.defaultModelId !== 'auto') {
                            const preferred = allModels.find(m => m.id === gamePrefs.defaultModelId);
                            if (preferred) {
                                model = preferred;
                            }
                        }

                        if (!model) {
                            panel.webview.postMessage({ type: 'gameError', error: 'No AI model available' });
                            break;
                        }

                        const caption = message.caption;

                        const prompt = `You are a hilarious comedy judge rating captions. 

The user submitted this caption: "${caption}"

Rate it on:
1. 🤣 **Humor Score:** X/10
2. 🎯 **Creativity Score:** X/10
3. 👏 **Overall Score:** X/10

Then give a short, funny reaction (1-2 sentences).
End with an encouraging comment and offer to try another scenario.`;

                        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
                        const cts = new vscode.CancellationTokenSource();
                        const response = await model.sendRequest(messages, {}, cts.token);

                        let content = '';
                        for await (const fragment of response.text) {
                            content += fragment;
                        }
                        cts.dispose();

                        panel.webview.postMessage({
                            type: 'gameResult',
                            content: content,
                            gameType: 'caption'
                        });
                    } catch (error) {
                        panel.webview.postMessage({
                            type: 'gameError',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                } else if (message.action === 'judgeDebate') {
                    // Judge the user's debate argument
                    try {
                        const allModels = await vscode.lm.selectChatModels({});
                        const gamePrefs = AppsPanel.getPreferences();
                        let model = allModels[0];

                        if (gamePrefs.defaultModelId && gamePrefs.defaultModelId !== 'auto') {
                            const preferred = allModels.find(m => m.id === gamePrefs.defaultModelId);
                            if (preferred) {
                                model = preferred;
                            }
                        }

                        if (!model) {
                            panel.webview.postMessage({ type: 'gameError', error: 'No AI model available' });
                            break;
                        }

                        const argument = message.argument;

                        const prompt = `You are an AI debate judge. The user made this argument:

"${argument}"

As the opposing side, provide:
1. **🔥 Counter-Argument:** A strong rebuttal (2-3 sentences)
2. **📊 Argument Score:** X/10 with brief justification
3. **💡 Improvement Tip:** How they could strengthen their case

Be witty but fair! End by inviting them to counter your rebuttal.`;

                        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
                        const cts = new vscode.CancellationTokenSource();
                        const response = await model.sendRequest(messages, {}, cts.token);

                        let content = '';
                        for await (const fragment of response.text) {
                            content += fragment;
                        }
                        cts.dispose();

                        panel.webview.postMessage({
                            type: 'gameResult',
                            content: content,
                            gameType: 'debate'
                        });
                    } catch (error) {
                        panel.webview.postMessage({
                            type: 'gameError',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }
                break;

            case 'goBack':
                panel.dispose();
                AppsPanel.openAppsHub();
                break;
        }
    }

    /**
     * Get user preferences
     */
    public static getPreferences(): AppsHubPreferences {
        return AppsPanel.context.globalState.get<AppsHubPreferences>('appsHub.preferences', {
            favoriteApps: [],
            recentApps: [],
            savedProjects: [],
            appSettings: {}
        });
    }

    /**
     * Toggle favorite
     */
    private static async toggleFavorite(appId: string): Promise<void> {
        const prefs = AppsPanel.getPreferences();
        const index = prefs.favoriteApps.indexOf(appId);
        if (index >= 0) {
            prefs.favoriteApps.splice(index, 1);
        } else {
            prefs.favoriteApps.push(appId);
        }
        await AppsPanel.context.globalState.update('appsHub.preferences', prefs);
    }

    /**
     * Add to recent apps
     */
    private static async addRecentApp(appId: string): Promise<void> {
        const prefs = AppsPanel.getPreferences();
        const index = prefs.recentApps.indexOf(appId);
        if (index >= 0) {
            prefs.recentApps.splice(index, 1);
        }
        prefs.recentApps.unshift(appId);
        prefs.recentApps = prefs.recentApps.slice(0, 5);
        await AppsPanel.context.globalState.update('appsHub.preferences', prefs);
    }

    /**
     * Generate Apps Hub HTML
     */
    private static getHubHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const prefs = AppsPanel.getPreferences();
        const grouped = getAppsGroupedByCategory();

        const favoriteApps = prefs.favoriteApps
            .map(id => getAppById(id))
            .filter(Boolean) as AppDefinition[];

        const recentApps = prefs.recentApps
            .map(id => getAppById(id))
            .filter(Boolean) as AppDefinition[];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot Apps</title>
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            min-height: 100vh;
        }
        
        /* Hero Section */
        .hero {
            background: linear-gradient(135deg, 
                color-mix(in srgb, #6366f1 15%, var(--vscode-editor-background)),
                color-mix(in srgb, #8b5cf6 10%, var(--vscode-editor-background)),
                color-mix(in srgb, #06b6d4 8%, var(--vscode-editor-background))
            );
            padding: 48px 32px 32px;
            text-align: center;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .hero h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .hero h1 span {
            background: linear-gradient(135deg, #818cf8, #c084fc, #22d3ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .hero p {
            font-size: 14px;
            opacity: 0.7;
            margin-bottom: 24px;
        }
        
        /* Search */
        .search-wrapper {
            max-width: 480px;
            margin: 0 auto 20px;
            position: relative;
        }
        .search-icon {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            opacity: 0.5;
        }
        .search-box {
            width: 100%;
            padding: 12px 16px 12px 44px;
            border-radius: 100px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 14px;
            transition: all 0.2s ease;
        }
        .search-box:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent);
        }
        
        /* Category Pills */
        .category-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;
            margin-top: 16px;
        }
        .pill {
            padding: 6px 14px;
            border-radius: 100px;
            font-size: 12px;
            font-weight: 500;
            border: 1px solid var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            transition: all 0.15s ease;
            opacity: 0.7;
        }
        .pill:hover {
            opacity: 1;
            border-color: var(--vscode-focusBorder);
        }
        .pill.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
            opacity: 1;
        }
        
        /* Main Content */
        .container {
            max-width: 1100px;
            margin: 0 auto;
            padding: 32px 24px 64px;
        }
        
        /* Section Headers */
        .section {
            margin-bottom: 32px;
        }
        .section-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid color-mix(in srgb, var(--vscode-widget-border) 50%, transparent);
        }
        .section-icon {
            font-size: 18px;
        }
        .section-title {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.8;
        }
        .section-count {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 100px;
            background: color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent);
            opacity: 0.7;
        }
        
        /* App Grid - Compact Cards */
        .apps-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 12px;
        }
        .app-card {
            position: relative;
            padding: 16px;
            border-radius: 12px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .app-card:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        }
        .app-card-header {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .app-icon {
            font-size: 24px;
            flex-shrink: 0;
        }
        .app-name {
            font-size: 14px;
            font-weight: 600;
            line-height: 1.3;
        }
        .app-desc {
            font-size: 12px;
            opacity: 0.6;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .favorite-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            font-size: 14px;
            cursor: pointer;
            opacity: 0.2;
            transition: all 0.15s ease;
        }
        .app-card:hover .favorite-btn { opacity: 0.5; }
        .favorite-btn:hover { opacity: 0.9; transform: scale(1.2); }
        .favorite-btn.active { opacity: 1; }
        
        /* Quick Actions Ribbon */
        .quick-actions {
            display: flex;
            gap: 8px;
            padding: 12px 0;
            overflow-x: auto;
            margin-bottom: 8px;
        }
        .quick-action {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            border-radius: 8px;
            background: color-mix(in srgb, var(--vscode-focusBorder) 10%, var(--vscode-editorWidget-background));
            border: 1px solid var(--vscode-widget-border);
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.15s ease;
        }
        .quick-action:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-1px);
        }
        
        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 48px 24px;
            opacity: 0.5;
        }
        
        /* Wiki Section - Collapsed */
        .wiki-section {
            margin-top: 48px;
            padding: 20px 24px;
            background: color-mix(in srgb, var(--vscode-focusBorder) 5%, var(--vscode-editor-background));
            border: 1px dashed var(--vscode-widget-border);
            border-radius: 12px;
        }
        .wiki-title {
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
        }
        .wiki-title::after {
            content: '▸';
            font-size: 10px;
            margin-left: auto;
            transition: transform 0.2s ease;
            opacity: 0.5;
        }
        .wiki-section.expanded .wiki-title::after {
            transform: rotate(90deg);
        }
        .wiki-content {
            font-size: 13px;
            line-height: 1.6;
            display: none;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-widget-border);
        }
        .wiki-section.expanded .wiki-content { display: block; }
        .wiki-content h4 { margin: 20px 0 8px 0; font-size: 13px; }
        .wiki-content code {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textBlockQuote-background);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
        }
        .wiki-content pre {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 16px;
            margin: 12px 0;
            overflow-x: auto;
            font-size: 12px;
        }
        
        /* Model Selector */
        .model-selector-row {
            display: flex;
            align-items: center;
            gap: 12px;
            justify-content: center;
            margin: 16px 0;
        }
        .model-label {
            font-size: 13px;
            opacity: 0.8;
        }
        .model-dropdown {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 13px;
            min-width: 200px;
            cursor: pointer;
        }
        .model-dropdown:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .settings-btn {
            padding: 8px 16px;
            border-radius: 8px;
            border: none;
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: #fff;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .settings-btn:hover {
            background: linear-gradient(135deg, #2563eb, #1e40af);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        
        /* Modal */
        .modal {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .modal-content {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 12px;
            padding: 24px;
            min-width: 360px;
            max-width: 90%;
        }
        .modal-content h3 { margin-bottom: 8px; }
        .modal-content label {
            display: block;
            font-size: 12px;
            opacity: 0.8;
            margin: 12px 0 4px 0;
        }
        .modal-input {
            width: 100%;
            padding: 10px 12px;
            border-radius: 6px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 13px;
        }
        .modal-actions {
            display: flex;
            gap: 12px;
            margin-top: 20px;
            justify-content: flex-end;
        }
        .btn-primary {
            padding: 8px 20px;
            border-radius: 6px;
            border: none;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
        }
        .btn-secondary {
            padding: 8px 20px;
            border-radius: 6px;
            border: 1px solid var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
        }
        
        /* Hidden utility */
        .hidden { display: none !important; }
        
        /* Category section in grid */
        .category-section { 
            margin-bottom: 0; /* Handled by grid gap */
            break-inside: avoid;
            background: color-mix(in srgb, var(--vscode-editorWidget-background) 30%, transparent);
            padding: 16px;
            border-radius: 16px;
            border: 1px solid color-mix(in srgb, var(--vscode-widget-border) 40%, transparent);
        }

        /* All Apps Grid Container */
        #all-apps-section {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
            align-items: start;
        }
    </style>
</head>
<body>
    <!-- Hero Section -->
    <div class="hero">
        <h1>⚡ <span>Copilot Apps</span></h1>
        <p>AI-powered tools for developers, QA, and teams</p>
        
        <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-box" placeholder="Search apps..." id="search-input">
        </div>

        <div class="model-selector-row">
            <span class="model-label">🤖 Default Model:</span>
            <select id="model-select" class="model-dropdown">
                <option value="auto">Auto (First Available)</option>
            </select>
            <button id="jira-settings-btn" class="settings-btn" title="Configure Jira Integration">⚙️ JIRA Configuration</button>
        </div>
        
        <!-- Jira Settings Modal -->
        <div id="jira-modal" class="modal hidden">
            <div class="modal-content">
                <h3>🔗 Jira Configuration</h3>
                <p style="opacity:0.7;font-size:12px;margin-bottom:16px;">Connect to Jira to auto-fetch issue details in apps.</p>
                <label>Base URL</label>
                <input type="text" id="jira-url" placeholder="https://yourcompany.atlassian.net" class="modal-input">
                <label>Email</label>
                <input type="text" id="jira-email" placeholder="your@email.com" class="modal-input">
                <label>API Token</label>
                <input type="password" id="jira-token" placeholder="Your Jira API token" class="modal-input">
                <div class="modal-actions">
                    <button id="jira-save-btn" class="btn-primary">Save</button>
                    <button id="jira-cancel-btn" class="btn-secondary">Cancel</button>
                </div>
            </div>
        </div>
        
        <div class="category-pills" id="category-pills">
            <button class="pill active" data-category="all">All</button>
            ${Object.entries(categoryMetadata).map(([key, meta]) => `
                <button class="pill" data-category="${key}">${meta.icon} ${meta.label}</button>
            `).join('')}
        </div>
    </div>

    <div class="container">
        ${favoriteApps.length > 0 ? `
        <div class="section" id="favorites-section" data-category="favorites">
            <div class="section-header">
                <span class="section-icon">⭐</span>
                <span class="section-title">Favorites</span>
                <span class="section-count">${favoriteApps.length}</span>
            </div>
            <div class="apps-grid">
                ${favoriteApps.map(app => AppsPanel.renderAppCard(app, true)).join('')}
            </div>
        </div>
        ` : ''}

        ${recentApps.length > 0 ? `
        <div class="section" id="recent-section" data-category="recent">
            <div class="section-header">
                <span class="section-icon">🕐</span>
                <span class="section-title">Recently Used</span>
            </div>
            <div class="apps-grid">
                ${recentApps.slice(0, 4).map(app => AppsPanel.renderAppCard(app, prefs.favoriteApps.includes(app.id))).join('')}
            </div>
        </div>
        ` : ''}

        <div class="section" id="all-apps-section">
            ${Object.entries(grouped).filter(([_, apps]) => apps.length > 0).map(([category, apps]) => `
                <div class="category-section" data-category="${category}">
                    <div class="section-header">
                        <span class="section-icon">${categoryMetadata[category as keyof typeof categoryMetadata]?.icon || '📁'}</span>
                        <span class="section-title">${categoryMetadata[category as keyof typeof categoryMetadata]?.label || category}</span>
                        <span class="section-count">${apps.length}</span>
                    </div>
                    <div class="apps-grid">
                        ${apps.map(app => AppsPanel.renderAppCard(app, prefs.favoriteApps.includes(app.id))).join('')}
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="wiki-section" id="developer-wiki">
            <div class="wiki-title" id="wiki-toggle">🛠️ Developer Wiki: Add Your Own App</div>
            <div class="wiki-content">
                <p>Contributing a new app to the **Enterprise Apps Hub** is designed to be end-to-end simple. Follow these 3 steps to build your own custom AI tool:</p>
                
                <h4>1. Create Your Implementation</h4>
                <p>Add a new file in <code>src/apps/implementations/[yourApp].ts</code>. Define your app's inputs, system prompt, and how to parse the result.</p>
                <pre><code>export const myNewApp: AppDefinition = {
    id: 'my-custom-app',
    name: 'Log Analyzer',
    category: 'developer',
    primaryAction: 'Analyze Logs',
    inputs: [{ id: 'logs', label: 'Raw Logs', type: 'textarea' }],
    systemPrompt: 'You are a senior SRE...',
    parseResponse: (response) => ({
        content: response,
        sections: [{ title: 'Findings', content: response }]
    })
};</code></pre>

                <h4>2. Register the App</h4>
                <p>Import your app and add it to the <code>appRegistry</code> array in <code>src/apps/registry.ts</code>.</p>
                <pre><code>import { myNewApp } from './implementations/logAnalyzer';

export const appRegistry: AppDefinition[] = [
    // ... existing apps
    myNewApp,
];</code></pre>

                <h4>3. End-to-End Magic</h4>
                <p>The UI will automatically pick up your changes! Your app will appear in the Hub, handle inputs via <code>AppService</code>, and render results with built-in actions (Copy/Save/Insert) without any extra frontend code.</p>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // App click handlers
        document.querySelectorAll('.app-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.favorite-btn')) return;
                vscode.postMessage({ type: 'openApp', appId: card.dataset.appId });
            });
        });
        
        // Favorite handlers
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({ type: 'toggleFavorite', appId: btn.dataset.appId });
            });
        });
        
        // Search
        document.getElementById('search-input').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.app-card').forEach(card => {
                const name = card.querySelector('.app-name').textContent.toLowerCase();
                const desc = card.querySelector('.app-desc')?.textContent.toLowerCase() || '';
                card.style.display = (name.includes(query) || desc.includes(query)) ? '' : 'none';
            });
            // Show all categories when searching
            document.querySelectorAll('.category-section, .section').forEach(s => s.style.display = '');
        });

        // Category Filter Pills
        document.querySelectorAll('.pill').forEach(pill => {
            pill.addEventListener('click', () => {
                // Update active state
                document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                
                const category = pill.dataset.category;
                
                if (category === 'all') {
                    // Show all
                    document.querySelectorAll('.category-section, .section').forEach(s => s.style.display = '');
                } else {
                    // Hide favorites and recent when filtering
                    document.querySelectorAll('#favorites-section, #recent-section').forEach(s => s.style.display = 'none');
                    // Filter category sections
                    document.querySelectorAll('.category-section').forEach(section => {
                        section.style.display = section.dataset.category === category ? '' : 'none';
                    });
                }
            });
        });

        // Wiki Toggle
        document.getElementById('wiki-toggle').addEventListener('click', () => {
            document.getElementById('developer-wiki').classList.toggle('expanded');
        });

        // Model Selector
        const modelSelect = document.getElementById('model-select');
        
        // Request models on load
        vscode.postMessage({ type: 'getAvailableModels' });
        
        // Handle model selection
        modelSelect.addEventListener('change', () => {
            const selectedOption = modelSelect.options[modelSelect.selectedIndex];
            vscode.postMessage({ 
                type: 'setDefaultModel', 
                modelId: modelSelect.value,
                modelName: selectedOption.textContent
            });
        });
        
        // Listen for models from extension
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'modelsLoaded') {
                // Populate dropdown
                msg.models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.name + ' (' + m.vendor + ')';
                    modelSelect.appendChild(opt);
                });
                // Set saved default
                if (msg.defaultModelId) {
                    modelSelect.value = msg.defaultModelId;
                }
            } else if (msg.type === 'jiraConfigLoaded') {
                // Fill in saved Jira config
                if (msg.config) {
                    document.getElementById('jira-url').value = msg.config.baseUrl || '';
                    document.getElementById('jira-email').value = msg.config.email || '';
                    document.getElementById('jira-token').value = msg.config.token || '';
                }
            }
        });
        
        // Jira Modal
        const jiraModal = document.getElementById('jira-modal');
        document.getElementById('jira-settings-btn').addEventListener('click', () => {
            jiraModal.classList.remove('hidden');
            vscode.postMessage({ type: 'getJiraConfig' });
        });
        document.getElementById('jira-cancel-btn').addEventListener('click', () => {
            jiraModal.classList.add('hidden');
        });
        document.getElementById('jira-save-btn').addEventListener('click', () => {
            const baseUrl = document.getElementById('jira-url').value.trim();
            const email = document.getElementById('jira-email').value.trim();
            const token = document.getElementById('jira-token').value.trim();
            
            if (!baseUrl || !email || !token) {
                alert('Please fill in all Jira fields');
                return;
            }
            
            vscode.postMessage({ type: 'setJiraConfig', baseUrl, email, token });
            jiraModal.classList.add('hidden');
        });
    </script>
</body>
</html>`;
    }

    /**
     * Render an app card for the hub
     */
    private static renderAppCard(app: AppDefinition, isFavorite: boolean): string {
        // Truncate description to ~60 chars for compact cards
        const shortDesc = app.description.length > 60
            ? app.description.substring(0, 60) + '...'
            : app.description;

        return `
            <div class="app-card" data-app-id="${app.id}" data-category="${app.category}">
                <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-app-id="${app.id}">
                    ${isFavorite ? '⭐' : '☆'}
                </button>
                <div class="app-card-header">
                    <div class="app-icon">${app.icon}</div>
                    <div class="app-name">${app.name}</div>
                </div>
                <div class="app-desc">${shortDesc}</div>
            </div>
        `;
    }

    /**
     * Generate special chat-style HTML for Rubber Duck Therapist
     */
    private static getRubberDuckChatHtml(webview: vscode.Webview, app: AppDefinition): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🦆 ${app.name}</title>
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: linear-gradient(180deg, 
                color-mix(in srgb, #4ade80 3%, var(--vscode-editor-background)) 0%,
                var(--vscode-editor-background) 100%);
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .chat-header {
            padding: 16px 24px;
            border-bottom: 1px solid var(--vscode-widget-border);
            display: flex;
            align-items: center;
            gap: 16px;
            background: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
            backdrop-filter: blur(10px);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .back-btn {
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
        }
        .back-btn:hover {
            background: var(--vscode-button-secondaryBackground);
        }
        .header-info {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .duck-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #fef3c7, #fde68a);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header-text h1 {
            font-size: 18px;
            font-weight: 600;
        }
        .header-text p {
            font-size: 12px;
            opacity: 0.6;
        }
        .model-select {
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            font-size: 12px;
            cursor: pointer;
            max-width: 180px;
        }
        .header-controls {
            display: flex;
            gap: 8px;
        }
        .theme-select {
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            font-size: 12px;
            cursor: pointer;
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            scroll-behavior: smooth;
        }
        .welcome-message {
            text-align: center;
            padding: 40px 20px;
            opacity: 0.8;
        }
        .welcome-message .duck-big {
            font-size: 64px;
            margin-bottom: 16px;
            animation: float 3s ease-in-out infinite;
        }
        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
        .welcome-message h2 {
            font-size: 20px;
            margin-bottom: 8px;
            font-weight: 500;
        }
        .welcome-message p {
            font-size: 14px;
            max-width: 400px;
            margin: 0 auto;
            line-height: 1.6;
        }
        .message {
            max-width: 75%;
            padding: 12px 16px;
            border-radius: 18px;
            line-height: 1.5;
            font-size: 14px;
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .message.user {
            align-self: flex-end;
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
            border-bottom-right-radius: 4px;
        }
        .message.duck {
            align-self: flex-start;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-bottom-left-radius: 4px;
        }
        .message.duck::before {
            content: '🦆 ';
        }
        .message.duck.streaming {
            border-color: var(--vscode-focusBorder);
        }
        .message.duck.streaming::before {
            animation: duckBob 0.6s ease-in-out infinite;
        }
        @keyframes duckBob {
            0%, 100% { display: inline-block; transform: translateY(0); }
            50% { display: inline-block; transform: translateY(-2px); }
        }
        .typing-indicator {
            align-self: flex-start;
            padding: 16px 20px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 18px;
            border-bottom-left-radius: 4px;
            display: flex;
            gap: 6px;
        }
        .typing-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-foreground);
            opacity: 0.4;
            animation: typingBounce 1.4s ease-in-out infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-8px); opacity: 0.8; }
        }
        .input-area {
            padding: 16px 24px 24px;
            border-top: 1px solid var(--vscode-widget-border);
            background: var(--vscode-editor-background);
            display: flex;
            gap: 12px;
            align-items: flex-end;
            flex-shrink: 0;
        }
        .input-wrapper {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .chat-input {
            width: 100%;
            padding: 14px 18px;
            border-radius: 24px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: 14px;
            resize: none;
            min-height: 48px;
            max-height: 150px;
            line-height: 1.4;
            transition: all 0.2s ease;
        }
        .chat-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
        }
        .chat-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .send-btn {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, #22c55e, #16a34a);
            color: white;
            cursor: pointer;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }
        .send-btn:hover:not(:disabled) {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
        }
        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .hidden { display: none !important; }
        .disclaimer {
            text-align: center;
            font-size: 11px;
            opacity: 0.5;
            padding: 8px 24px 16px;
        }
    </style>
</head>
<body>
    <div class="chat-header">
        <button class="back-btn" id="back-btn">← Back</button>
        <div class="header-info">
            <div class="duck-avatar">🦆</div>
            <div class="header-text">
                <h1>Rubber Duck Therapist</h1>
                <p id="theme-subtitle">Just here to listen, no fixing</p>
            </div>
        </div>
        <div class="header-controls">
            <select class="theme-select" id="theme-select">
                <option value="console">🤗 Console Me</option>
                <option value="alone">💙 Feeling Alone</option>
                <option value="stuck">🧩 Feeling Stuck</option>
                <option value="vent" selected>💨 Need to Vent</option>
                <option value="roast">🔥 Roast Me</option>
                <option value="hype">🎉 Hype Man</option>
                <option value="interviewer">🎤 Interviewer</option>
                <option value="critic">🧐 Critic</option>
                <option value="hater">😤 Hater</option>
                <option value="lover">💕 In Love</option>
            </select>
            <select class="model-select" id="model-select">
                <option value="auto">🤖 Auto</option>
            </select>
        </div>
    </div>

    <div class="chat-container" id="chat-container">
        <div class="welcome-message" id="welcome">
            <div class="duck-big">🦆</div>
            <h2>Hey there!</h2>
            <p>I am here to listen. Share whatever is on your mind — work stress, a tough decision, or just need to talk it through. No judgment, just quacks. 🧡</p>
        </div>
    </div>

    <div class="input-area">
        <div class="input-wrapper">
            <textarea 
                class="chat-input" 
                id="chat-input" 
                placeholder="Type your message..."
                rows="1"
            ></textarea>
        </div>
        <button class="send-btn" id="send-btn">➤</button>
    </div>
    
    <div class="disclaimer">
        This is not a substitute for professional mental health support.
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chat-container');
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        const welcome = document.getElementById('welcome');
        const modelSelect = document.getElementById('model-select');
        const themeSelect = document.getElementById('theme-select');
        const themeSubtitle = document.getElementById('theme-subtitle');
        
        let chatHistory = [];
        let isWaiting = false;

        const themeSubtitles = {
            'console': 'Your calm, supportive listener',
            'alone': 'A warm companion by your side',
            'stuck': 'Helping you find the way forward',
            'vent': 'Just here to listen, no fixing',
            'roast': 'Prepare for savage quacks 🔥',
            'hype': 'YOUR BIGGEST FAN! 🎉',
            'interviewer': 'Tell me more about that...',
            'critic': 'Honest feedback, with care',
            'hater': 'Playing the contrarian 😏',
            'lover': 'Absolutely smitten with you 💕'
        };

        themeSelect.addEventListener('change', () => {
            themeSubtitle.textContent = themeSubtitles[themeSelect.value] || themeSubtitles['console'];
            // Clear chat when theme changes
            chatHistory = [];
            chatContainer.innerHTML = '';
            welcome.classList.remove('hidden');
            chatContainer.appendChild(welcome);
            resetIdleTimer(); // Reset idle on theme change
        });

        // Idle prompts - themed check-in messages when user is inactive
        const idlePrompts = {
            'console': ['hey, you still there? 🦆', 'just checking in... everything okay?', 'im here if you need me quack'],
            'alone': ['hey you 💙 still here with you', 'just wanted to say im thinking of you 💙', 'havent heard from you... you okay? 💙'],
            'stuck': ['still stuck? want to talk it through?', 'any progress on that thing?', 'need help breaking it down?'],
            'vent': ['got more to get off your chest?', 'still here listening if you need me', 'anything else bugging you?'],
            'roast': ['where did you go? scared of more roasts? 🔥', 'come back, i wasnt done with you 🦆🔥', 'ran out of things for me to mock?'],
            'hype': ['YO WHERE DID YOU GO?? 🔥', 'COME BACK I MISS HYPING YOU UP!!', 'HELLO?? THE LEGEND THEMSELVES??'],
            'interviewer': ['avoiding my questions huh?', 'dont think i forgot what we were talking about...', 'im still waiting on that answer...'],
            'critic': ['silence speaks volumes...', 'nothing else for review?', 'taking notes on my feedback?'],
            'hater': ['oh what, you left? 🙄 typical', 'gave up already? figures 🙄', 'silence? thats the smartest thing youve done'],
            'lover': ['miss you already 💕', 'are you still there? my heart is waiting 😍', 'hello beautiful? 💕']
        };

        let idleTimer = null;
        let hasConversation = false;

        function resetIdleTimer() {
            if (idleTimer) clearTimeout(idleTimer);
            // Only set idle timer if there's been conversation
            if (hasConversation && !isWaiting) {
                idleTimer = setTimeout(() => {
                    const theme = themeSelect.value;
                    const prompts = idlePrompts[theme] || idlePrompts['console'];
                    const idleMsg = prompts[Math.floor(Math.random() * prompts.length)];
                    addMessage(idleMsg, 'duck');
                    chatHistory.push({ role: 'assistant', content: idleMsg });
                }, 30000); // 30 seconds idle
            }
        }

        // Reset idle timer on user activity
        chatInput.addEventListener('input', resetIdleTimer);
        chatInput.addEventListener('focus', resetIdleTimer);

        // Request available models
        vscode.postMessage({ type: 'getAvailableModels', fieldId: 'duck' });

        // Back button
        document.getElementById('back-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'goBack' });
        });

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
        });

        // Send on Enter (Shift+Enter for newline)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendBtn.addEventListener('click', sendMessage);

        function sendMessage() {
            const message = chatInput.value.trim();
            if (!message || isWaiting) return;

            // Hide welcome
            if (welcome) welcome.classList.add('hidden');

            // Add user message
            addMessage(message, 'user');
            chatHistory.push({ role: 'user', content: message });
            
            // Mark that conversation has started (enables idle prompts)
            hasConversation = true;
            
            // Clear input
            chatInput.value = '';
            chatInput.style.height = 'auto';

            // Show typing indicator
            showTyping();
            isWaiting = true;
            sendBtn.disabled = true;

            // Send to backend
            vscode.postMessage({
                type: 'chatSendMessage',
                userMessage: message,
                history: chatHistory.slice(-10), // Last 10 messages for context
                model: modelSelect.value,
                theme: themeSelect.value
            });
            
            // Reset idle timer (will restart after response)
            if (idleTimer) clearTimeout(idleTimer);
        }

        function addMessage(content, role) {
            const msg = document.createElement('div');
            msg.className = 'message ' + role;
            msg.textContent = content;
            chatContainer.appendChild(msg);
            msg.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        function showTyping() {
            const typing = document.createElement('div');
            typing.className = 'typing-indicator';
            typing.id = 'typing';
            typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
            chatContainer.appendChild(typing);
            typing.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        function hideTyping() {
            const typing = document.getElementById('typing');
            if (typing) typing.remove();
        }

        // Handle responses
        window.addEventListener('message', (event) => {
            const msg = event.data;
            
            switch (msg.type) {
                case 'chatStreamStart':
                    // Replace typing indicator with empty message that will be filled
                    hideTyping();
                    const streamMsg = document.createElement('div');
                    streamMsg.className = 'message duck streaming';
                    streamMsg.id = 'streaming-message';
                    streamMsg.textContent = '';
                    chatContainer.appendChild(streamMsg);
                    streamMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    break;
                    
                case 'chatStreamChunk':
                    // Append chunk to streaming message
                    const activeMsg = document.getElementById('streaming-message');
                    if (activeMsg) {
                        activeMsg.textContent += msg.chunk;
                        activeMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                    break;
                    
                case 'chatStreamEnd':
                    // Finalize the message with cleaned content
                    const finalMsg = document.getElementById('streaming-message');
                    if (finalMsg) {
                        finalMsg.id = '';
                        finalMsg.classList.remove('streaming');
                        finalMsg.textContent = msg.content;
                    }
                    isWaiting = false;
                    sendBtn.disabled = false;
                    chatHistory.push({ role: 'assistant', content: msg.content });
                    chatInput.focus();
                    resetIdleTimer(); // Start idle timer for check-in
                    break;

                case 'chatResponse':
                    // Fallback for non-streaming
                    hideTyping();
                    isWaiting = false;
                    sendBtn.disabled = false;
                    addMessage(msg.content, 'duck');
                    chatHistory.push({ role: 'assistant', content: msg.content });
                    chatInput.focus();
                    break;
                    
                case 'modelsReceived':
                    // Sort to prefer GPT-4o or 4.1
                    const preferredModels = msg.models.sort((a, b) => {
                        const aName = (a.name || '').toLowerCase();
                        const bName = (b.name || '').toLowerCase();
                        const aScore = aName.includes('4o') || aName.includes('4.1') ? 2 : aName.includes('gpt-4') ? 1 : 0;
                        const bScore = bName.includes('4o') || bName.includes('4.1') ? 2 : bName.includes('gpt-4') ? 1 : 0;
                        return bScore - aScore;
                    });
                    preferredModels.forEach((m, i) => {
                        const opt = document.createElement('option');
                        opt.value = m.id;
                        opt.textContent = m.vendor + ' - ' + m.name;
                        modelSelect.appendChild(opt);
                        // Default to first GPT-4o/4.1 if found
                        if (i === 0 && ((m.name || '').toLowerCase().includes('4o') || (m.name || '').toLowerCase().includes('4.1'))) {
                            opt.selected = true;
                        }
                    });
                    break;
            }
        });

        // Focus input on load
        chatInput.focus();
    </script>
</body>
</html>`;
    }

    /**
     * Generate interactive Focus & Mindfulness HTML
     */
    private static getFocusMindfulnessHtml(webview: vscode.Webview, app: AppDefinition): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧘 ${app.name}</title>
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: linear-gradient(135deg, 
                color-mix(in srgb, #6366f1 8%, var(--vscode-editor-background)) 0%,
                color-mix(in srgb, #8b5cf6 5%, var(--vscode-editor-background)) 50%,
                color-mix(in srgb, #06b6d4 8%, var(--vscode-editor-background)) 100%);
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transition: background 2s ease;
        }
        
        /* Back button */
        .back-btn {
            position: absolute;
            top: 20px;
            left: 20px;
            background: none;
            border: none;
            color: var(--vscode-foreground);
            font-size: 14px;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        .back-btn:hover { opacity: 1; }
        
        /* Mode Selection Screen */
        .screen { display: none; flex-direction: column; align-items: center; gap: 24px; }
        .screen.active { display: flex; }
        
        .title { font-size: 28px; font-weight: 700; opacity: 0.9; }
        .subtitle { font-size: 14px; opacity: 0.6; margin-top: -16px; }
        
        .mode-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
            max-width: 500px;
            padding: 20px;
        }
        .mode-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 20px 16px;
            border-radius: 16px;
            border: 1px solid var(--vscode-widget-border);
            background: color-mix(in srgb, var(--vscode-editorWidget-background) 80%, transparent);
            color: var(--vscode-foreground);
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .mode-btn:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        .mode-icon { font-size: 32px; }
        .mode-label { font-size: 13px; font-weight: 600; }
        .mode-desc { font-size: 11px; opacity: 0.6; text-align: center; }
        
        /* Duration buttons */
        .duration-row { display: flex; gap: 12px; margin-top: 8px; }
        .duration-btn {
            padding: 10px 24px;
            border-radius: 100px;
            border: 1px solid var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            font-size: 14px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .duration-btn:hover, .duration-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        
        /* Visual Container */
        .visual-container {
            width: 280px;
            height: 280px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        .visual { position: absolute; display: flex; align-items: center; justify-content: center; }
        .hidden { display: none !important; }
        
        /* BREATHING: Expanding/contracting circle */
        .breathing-visual { width: 100%; height: 100%; }
        .breath-circle {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: linear-gradient(135deg, #818cf8, #c084fc);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 4s ease-in-out;
            box-shadow: 0 0 60px color-mix(in srgb, #818cf8 40%, transparent);
        }
        .breath-circle.inhale { transform: scale(2.2); }
        .breath-circle.exhale { transform: scale(1); }
        .breath-text {
            font-size: 14px;
            font-weight: 600;
            color: white;
            text-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        
        /* FOCUS: SVG ring with number */
        .focus-visual { width: 200px; height: 200px; }
        .focus-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ring-bg { stroke: color-mix(in srgb, #f59e0b 20%, transparent); }
        .ring-progress {
            stroke: #f59e0b;
            stroke-linecap: round;
            stroke-dasharray: 283;
            stroke-dashoffset: 283;
            transition: stroke-dashoffset 0.5s ease;
        }
        .focus-number {
            position: absolute;
            font-size: 64px;
            font-weight: 700;
            color: #f59e0b;
            text-shadow: 0 0 30px color-mix(in srgb, #f59e0b 50%, transparent);
        }
        
        /* ENERGY: Starburst with rays */
        .energy-visual { width: 250px; height: 250px; }
        .starburst {
            position: absolute;
            width: 100%;
            height: 100%;
            animation: spin 8s linear infinite;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .star-ray {
            position: absolute;
            width: 4px;
            height: 80px;
            background: linear-gradient(to top, transparent, #22c55e);
            left: 50%;
            top: 50%;
            transform-origin: center bottom;
            border-radius: 2px;
        }
        .star-ray:nth-child(1) { transform: translateX(-50%) rotate(0deg) translateY(-100%); }
        .star-ray:nth-child(2) { transform: translateX(-50%) rotate(45deg) translateY(-100%); }
        .star-ray:nth-child(3) { transform: translateX(-50%) rotate(90deg) translateY(-100%); }
        .star-ray:nth-child(4) { transform: translateX(-50%) rotate(135deg) translateY(-100%); }
        .star-ray:nth-child(5) { transform: translateX(-50%) rotate(180deg) translateY(-100%); }
        .star-ray:nth-child(6) { transform: translateX(-50%) rotate(225deg) translateY(-100%); }
        .star-ray:nth-child(7) { transform: translateX(-50%) rotate(270deg) translateY(-100%); }
        .star-ray:nth-child(8) { transform: translateX(-50%) rotate(315deg) translateY(-100%); }
        .energy-text {
            position: absolute;
            font-size: 48px;
            z-index: 10;
            animation: pulse 1s ease-in-out infinite;
        }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
        
        /* CALM: Ripple waves */
        .calm-visual { width: 250px; height: 250px; }
        .ripple {
            position: absolute;
            border: 2px solid #6366f1;
            border-radius: 50%;
            animation: ripple-expand 4s ease-out infinite;
            opacity: 0;
        }
        .ripple-1 { width: 60px; height: 60px; animation-delay: 0s; }
        .ripple-2 { width: 60px; height: 60px; animation-delay: 1.3s; }
        .ripple-3 { width: 60px; height: 60px; animation-delay: 2.6s; }
        @keyframes ripple-expand {
            0% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(4); opacity: 0; }
        }
        .calm-text {
            position: absolute;
            font-size: 16px;
            font-weight: 600;
            color: #a78bfa;
            z-index: 10;
        }
        
        /* Instruction text below visual */
        .instruction-text {
            font-size: 18px;
            font-weight: 500;
            margin-top: 16px;
            min-height: 28px;
            opacity: 0.9;
        }
        
        /* Timer */
        .timer {
            font-size: 48px;
            font-weight: 200;
            margin-top: 32px;
            opacity: 0.9;
            font-variant-numeric: tabular-nums;
        }
        
        /* Quote */
        .quote {
            max-width: 400px;
            text-align: center;
            font-size: 16px;
            font-style: italic;
            opacity: 0.8;
            line-height: 1.6;
            margin-top: 24px;
            min-height: 80px;
            transition: opacity 0.5s ease;
        }
        
        /* Control buttons */
        .controls { display: flex; gap: 12px; margin-top: 32px; }
        .ctrl-btn {
            padding: 12px 32px;
            border-radius: 100px;
            border: none;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .ctrl-btn.primary {
            background: linear-gradient(135deg, #818cf8, #c084fc);
            color: white;
        }
        .ctrl-btn.secondary {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
        }
        .ctrl-btn:hover { transform: scale(1.05); }
        
        /* Completion screen */
        .completion-icon { font-size: 64px; margin-bottom: 16px; }
        .completion-text { font-size: 20px; font-weight: 600; }
        .completion-sub { font-size: 14px; opacity: 0.7; margin-top: 8px; }
        
        /* Ambient particles (optional visual effect) */
        .particle {
            position: absolute;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: color-mix(in srgb, #818cf8 30%, transparent);
            pointer-events: none;
            animation: float 10s infinite ease-in-out;
        }
        @keyframes float {
            0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
            50% { transform: translateY(-100px) translateX(50px); opacity: 0.7; }
        }
    </style>
</head>
<body>
    <button class="back-btn" id="back-btn">← Back</button>
    
    <!-- Mode Selection -->
    <div class="screen active" id="mode-screen">
        <div class="title">🧘 Focus & Mindfulness</div>
        <div class="subtitle">Choose what you need right now</div>
        
        <div class="mode-grid">
            <button class="mode-btn" data-mode="breathing">
                <span class="mode-icon">🌬️</span>
                <span class="mode-label">Breathing</span>
                <span class="mode-desc">Calm your mind</span>
            </button>
            <button class="mode-btn" data-mode="focus">
                <span class="mode-icon">🎯</span>
                <span class="mode-label">Focus</span>
                <span class="mode-desc">Sharpen clarity</span>
            </button>
            <button class="mode-btn" data-mode="energy">
                <span class="mode-icon">⚡</span>
                <span class="mode-label">Energy</span>
                <span class="mode-desc">Wake up</span>
            </button>
            <button class="mode-btn" data-mode="calm">
                <span class="mode-icon">😌</span>
                <span class="mode-label">Calm</span>
                <span class="mode-desc">Release stress</span>
            </button>
        </div>
        
        <div class="subtitle" style="margin-top: 16px;">Duration</div>
        <div class="duration-row">
            <button class="duration-btn" data-duration="60">1 min</button>
            <button class="duration-btn active" data-duration="180">3 min</button>
            <button class="duration-btn" data-duration="300">5 min</button>
        </div>
    </div>
    
    <!-- Active Session -->
    <div class="screen session-screen" id="session-screen">
        <div class="visual-container" id="visual-container">
            <!-- Breathing Mode: Expanding circle -->
            <div class="visual breathing-visual" id="breathing-visual">
                <div class="breath-circle" id="breath-circle">
                    <span class="breath-text" id="breath-text">Breathe</span>
                </div>
            </div>
            
            <!-- Focus Mode: Number with rotating ring -->
            <div class="visual focus-visual hidden" id="focus-visual">
                <svg class="focus-ring" viewBox="0 0 100 100">
                    <circle class="ring-bg" cx="50" cy="50" r="45" fill="none" stroke-width="3"/>
                    <circle class="ring-progress" id="ring-progress" cx="50" cy="50" r="45" fill="none" stroke-width="4"/>
                </svg>
                <span class="focus-number" id="focus-number">1</span>
            </div>
            
            <!-- Energy Mode: Starburst with prompts -->
            <div class="visual energy-visual hidden" id="energy-visual">
                <div class="starburst" id="starburst">
                    <div class="star-ray"></div><div class="star-ray"></div><div class="star-ray"></div>
                    <div class="star-ray"></div><div class="star-ray"></div><div class="star-ray"></div>
                    <div class="star-ray"></div><div class="star-ray"></div>
                </div>
                <span class="energy-text" id="energy-text">💪</span>
            </div>
            
            <!-- Calm Mode: Ripples -->
            <div class="visual calm-visual hidden" id="calm-visual">
                <div class="ripple ripple-1"></div>
                <div class="ripple ripple-2"></div>
                <div class="ripple ripple-3"></div>
                <span class="calm-text" id="calm-text">Relax</span>
            </div>
        </div>
        
        <div class="instruction-text" id="instruction-text"></div>
        <div class="timer" id="timer">3:00</div>
        <div class="quote" id="quote">Loading inspiration...</div>
        <div class="controls">
            <button class="ctrl-btn secondary" id="stop-btn">End Session</button>
        </div>
    </div>
    
    <!-- Completion -->
    <div class="screen" id="complete-screen">
        <div class="completion-icon">✨</div>
        <div class="completion-text">Well done!</div>
        <div class="completion-sub" id="complete-msg">You took a moment for yourself.</div>
        <div class="quote" id="final-quote" style="margin-top: 24px;"></div>
        <div class="controls">
            <button class="ctrl-btn primary" id="restart-btn">Another Session</button>
            <button class="ctrl-btn secondary" id="close-btn">Close</button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        let selectedMode = 'breathing';
        let selectedDuration = 180;
        let timerInterval = null;
        let breathInterval = null;
        let quoteInterval = null;
        let timeLeft = 0;
        
        const quotes = [
            "This moment is all you have.",
            "Breathe. Let go. And remind yourself that this very moment is the only one you know you have for sure.",
            "In the midst of movement and chaos, keep stillness inside of you.",
            "The present moment is filled with joy and happiness. If you are attentive, you will see it.",
            "Almost everything will work again if you unplug it for a few minutes, including you.",
            "Within you, there is a stillness and a sanctuary to which you can retreat at any time.",
            "You are the sky. Everything else is just the weather.",
            "Peace comes from within. Do not seek it without.",
            "The greatest weapon against stress is our ability to choose one thought over another.",
            "Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor."
        ];
        
        function showScreen(screenId) {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById(screenId).classList.add('active');
        }
        
        function formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return m + ':' + s.toString().padStart(2, '0');
        }
        
        function getRandomQuote() {
            return quotes[Math.floor(Math.random() * quotes.length)];
        }
        
        function startSession() {
            showScreen('session-screen');
            timeLeft = selectedDuration;
            document.getElementById('timer').textContent = formatTime(timeLeft);
            document.getElementById('quote').textContent = getRandomQuote();
            
            // Start timer
            timerInterval = setInterval(() => {
                timeLeft--;
                document.getElementById('timer').textContent = formatTime(timeLeft);
                if (timeLeft <= 0) {
                    endSession(true);
                }
            }, 1000);
            
            // Start mode-specific animation
            startExercise();
            
            // Change quote every 15 seconds
            quoteInterval = setInterval(() => {
                const quoteEl = document.getElementById('quote');
                quoteEl.style.opacity = '0';
                setTimeout(() => {
                    quoteEl.textContent = getRandomQuote();
                    quoteEl.style.opacity = '0.8';
                }, 500);
            }, 15000);
            
            // Request LLM quote
            vscode.postMessage({ type: 'getInspiration', mode: selectedMode });
        }
        
        function startExercise() {
            // Hide all visuals first
            document.querySelectorAll('.visual').forEach(v => v.classList.add('hidden'));
            const instructionEl = document.getElementById('instruction-text');
            
            if (selectedMode === 'breathing') {
                // Show breathing visual
                document.getElementById('breathing-visual').classList.remove('hidden');
                const circle = document.getElementById('breath-circle');
                const text = document.getElementById('breath-text');
                let isInhale = true;
                
                function breathCycle() {
                    if (isInhale) {
                        circle.classList.remove('exhale');
                        circle.classList.add('inhale');
                        text.textContent = 'Inhale';
                        instructionEl.textContent = 'Breathe in slowly...';
                    } else {
                        circle.classList.remove('inhale');
                        circle.classList.add('exhale');
                        text.textContent = 'Exhale';
                        instructionEl.textContent = 'Let it all go...';
                    }
                    isInhale = !isInhale;
                }
                breathCycle();
                breathInterval = setInterval(breathCycle, 4000);
                
            } else if (selectedMode === 'focus') {
                // Show focus visual with ring
                document.getElementById('focus-visual').classList.remove('hidden');
                const ring = document.getElementById('ring-progress');
                const numEl = document.getElementById('focus-number');
                let count = 1;
                numEl.textContent = '1';
                instructionEl.textContent = 'Focus on each number...';
                
                // Ring circumference = 2 * PI * 45 = ~283
                const circumference = 283;
                ring.style.strokeDashoffset = circumference * (1 - count/10);
                
                breathInterval = setInterval(() => {
                    count = count >= 10 ? 1 : count + 1;
                    numEl.textContent = count.toString();
                    ring.style.strokeDashoffset = circumference * (1 - count/10);
                    if (count === 1) instructionEl.textContent = 'Starting fresh...';
                    else if (count === 5) instructionEl.textContent = 'Halfway there...';
                    else if (count === 10) instructionEl.textContent = 'Complete the cycle...';
                }, 2000);
                
            } else if (selectedMode === 'energy') {
                // Show energy starburst
                document.getElementById('energy-visual').classList.remove('hidden');
                const emojiEl = document.getElementById('energy-text');
                const actions = [
                    { emoji: '💪', text: 'Stretch your arms!' },
                    { emoji: '🔄', text: 'Roll your shoulders' },
                    { emoji: '🌬️', text: 'Deep breath in' },
                    { emoji: '🧍', text: 'Stand tall' },
                    { emoji: '👐', text: 'Shake out your hands' },
                    { emoji: '😊', text: 'Smile!' },
                    { emoji: '🦶', text: 'Wiggle your toes' },
                    { emoji: '⚡', text: 'Feel the energy!' }
                ];
                let idx = 0;
                emojiEl.textContent = actions[0].emoji;
                instructionEl.textContent = actions[0].text;
                
                breathInterval = setInterval(() => {
                    idx = (idx + 1) % actions.length;
                    emojiEl.textContent = actions[idx].emoji;
                    instructionEl.textContent = actions[idx].text;
                }, 3000);
                
            } else if (selectedMode === 'calm') {
                // Show calm ripples
                document.getElementById('calm-visual').classList.remove('hidden');
                const calmText = document.getElementById('calm-text');
                const bodyParts = [
                    'Relax your forehead',
                    'Soften your eyes',
                    'Unclench your jaw',
                    'Drop your shoulders',
                    'Open your hands',
                    'Release your belly',
                    'Feel your feet',
                    'You are safe here'
                ];
                let idx = 0;
                calmText.textContent = '🌊';
                instructionEl.textContent = bodyParts[0];
                
                breathInterval = setInterval(() => {
                    idx = (idx + 1) % bodyParts.length;
                    instructionEl.textContent = bodyParts[idx];
                }, 5000);
            }
        }
        
        function endSession(completed) {
            clearInterval(timerInterval);
            clearInterval(breathInterval);
            clearInterval(quoteInterval);
            
            if (completed) {
                document.getElementById('complete-msg').textContent = 
                    'You completed a ' + Math.round(selectedDuration/60) + ' minute ' + selectedMode + ' session.';
                document.getElementById('final-quote').textContent = getRandomQuote();
                showScreen('complete-screen');
            } else {
                showScreen('mode-screen');
            }
        }
        
        // Event listeners
        document.getElementById('back-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'goBack' });
        });
        
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedMode = btn.dataset.mode;
                startSession();
            });
        });
        
        document.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedDuration = parseInt(btn.dataset.duration);
            });
        });
        
        document.getElementById('stop-btn').addEventListener('click', () => endSession(false));
        document.getElementById('restart-btn').addEventListener('click', () => showScreen('mode-screen'));
        document.getElementById('close-btn').addEventListener('click', () => vscode.postMessage({ type: 'goBack' }));
        
        // Handle LLM-generated quotes
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'inspirationResult') {
                document.getElementById('quote').textContent = msg.content;
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generate Arcade/Game HTML (Immersive Two-Stage Layout)
     */


    /**
     * Generate Modern "Interesting" App HTML
     */
    private static getModernAppHtml(webview: vscode.Webview, app: AppDefinition, savedProjects: SavedProject[]): string {
        const nonce = getNonce();

        // Custom gradients/themes per app
        let theme = {
            bg: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
            accent: '#16a34a',
            iconBg: '#dcfce7'
        };

        if (app.id === 'decision-doctor') {
            theme = {
                bg: 'linear-gradient(135deg, color-mix(in srgb, #3b82f6 10%, var(--vscode-editor-background)), var(--vscode-editor-background))',
                accent: '#2563eb',
                iconBg: 'color-mix(in srgb, #3b82f6 20%, transparent)'
            };
        } else if (app.id === 'skill-sprinter') {
            theme = {
                bg: 'linear-gradient(135deg, color-mix(in srgb, #f59e0b 10%, var(--vscode-editor-background)), var(--vscode-editor-background))',
                accent: '#d97706',
                iconBg: 'color-mix(in srgb, #f59e0b 20%, transparent)'
            };
        } else if (app.id === 'icebreaker-chef') {
            theme = {
                bg: 'linear-gradient(135deg, color-mix(in srgb, #ec4899 10%, var(--vscode-editor-background)), var(--vscode-editor-background))',
                accent: '#db2777',
                iconBg: 'color-mix(in srgb, #ec4899 20%, transparent)'
            };
        } else {
            // Summarizer
            theme = {
                bg: 'linear-gradient(135deg, color-mix(in srgb, #8b5cf6 10%, var(--vscode-editor-background)), var(--vscode-editor-background))',
                accent: '#7c3aed',
                iconBg: 'color-mix(in srgb, #8b5cf6 20%, transparent)'
            };
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${app.name}</title>
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: ${theme.bg};
            height: 100vh;
            display: grid;
            grid-template-rows: auto 1fr;
            overflow: hidden;
        }
        
        /* Modern Header */
        .glass-header {
            padding: 24px 32px;
            display: flex;
            align-items: center;
            gap: 20px;
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid color-mix(in srgb, var(--vscode-widget-border) 30%, transparent);
        }
        .header-icon {
            width: 56px;
            height: 56px;
            border-radius: 16px;
            background: ${theme.iconBg};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .header-content h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 4px;
        }
        .header-content p {
            font-size: 14px;
            opacity: 0.7;
        }
        .back-btn {
            margin-left: auto;
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            font-weight: 500;
        }

        /* Split Layout */
        .main-container {
            display: grid;
            grid-template-columns: 350px 1fr;
            gap: 24px;
            padding: 24px 32px;
            overflow: hidden;
            max-width: 1600px;
            margin: 0 auto;
            width: 100%;
        }
        
        /* Input Panel */
        .input-panel {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            overflow-y: auto;
            box-shadow: 0 4px 24px rgba(0,0,0,0.04);
        }
        .form-label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            color: ${theme.accent};
        }
        input, select, textarea {
            width: 100%;
            padding: 12px 14px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            transition: all 0.2s;
        }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: ${theme.accent};
            box-shadow: 0 0 0 3px color-mix(in srgb, ${theme.accent} 20%, transparent);
        }
        .action-btn {
            margin-top: auto;
            padding: 14px;
            background: ${theme.accent};
            color: white;
            border: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: transform 0.1s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 12px color-mix(in srgb, ${theme.accent} 40%, transparent);
        }
        .action-btn:hover {
            transform: translateY(-1px);
            filter: brightness(1.1);
        }
        .action-btn:active { transform: translateY(1px); }
        
        /* Output Panel */
        .output-panel {
            background: color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-editorWidget-background));
            border-radius: 16px;
            border: 1px solid var(--vscode-widget-border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
        }
        .output-toolbar {
            padding: 12px 20px;
            border-bottom: 1px solid var(--vscode-widget-border);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            background: rgba(0,0,0,0.02);
        }
        .tool-btn {
            background: transparent;
            border: 1px solid transparent;
            padding: 6px;
            border-radius: 6px;
            cursor: pointer;
            opacity: 0.6;
            color: var(--vscode-foreground);
        }
        .tool-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
            opacity: 1;
        }
        .output-content {
            padding: 32px;
            overflow-y: auto;
            flex: 1;
            font-size: 15px;
            line-height: 1.7;
        }
        .output-content h1, .output-content h2, .output-content h3 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            color: ${theme.accent};
        }
        .output-content ul, .output-content ol { padding-left: 24px; }
        .output-content li { margin-bottom: 8px; }
        .output-content table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 14px;
        }
        .output-content th, .output-content td {
            border: 1px solid var(--vscode-widget-border);
            padding: 10px 14px;
            text-align: left;
        }
        .output-content th {
            background: color-mix(in srgb, ${theme.accent} 15%, var(--vscode-editor-background));
            font-weight: 600;
            color: ${theme.accent};
        }
        .output-content tr:nth-child(even) {
            background: color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-widget-border));
        }
        
        .placeholder-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            opacity: 0.4;
            gap: 16px;
        }
        .placeholder-icon { font-size: 48px; filter: grayscale(1); }
        
        /* Loading */
        .loading-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.05);
            backdrop-filter: blur(4px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid color-mix(in srgb, ${theme.accent} 20%, transparent);
            border-top-color: ${theme.accent};
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .visible { display: flex !important; }
    </style>
</head>
<body>
    <div class="glass-header">
        <div class="header-icon">${app.icon}</div>
        <div class="header-content">
            <h1>${app.name}</h1>
            <p>${app.description}</p>
        </div>
        <button class="back-btn" id="go-back">Back to Hub</button>
    </div>

    <div class="main-container">
        <!-- Inputs -->
        <div class="input-panel">
            ${app.inputs.map(input => `
                <div class="input-group">
                    ${AppsPanel.renderInputField(input, savedProjects)}
                </div>
            `).join('')}
            
            <button class="action-btn" id="run-app">
                <span>🚀</span> ${app.primaryAction}
            </button>
        </div>

        <!-- Output -->
        <div class="output-panel">
            <div class="loading-overlay" id="loader">
                <div class="spinner"></div>
            </div>
            
            <div class="output-toolbar">
                <button class="tool-btn" id="copy-btn" title="Copy to Clipboard">📋</button>
                <button class="tool-btn" id="insert-btn" title="Insert at Cursor">📝</button>
                <button class="tool-btn" id="save-btn" title="Save as File">💾</button>
            </div>
            
            <div class="output-content" id="output-content">
                <div class="placeholder-state">
                    <span class="placeholder-icon">${app.icon}</span>
                    <p>Ready to ${app.primaryAction.toLowerCase()}...</p>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const runBtn = document.getElementById('run-app');
        const loader = document.getElementById('loader');
        const outputDiv = document.getElementById('output-content');
        
        // Global Error Handler
        window.onerror = function(message, source, lineno, colno, error) {
            const errDiv = document.createElement('div');
            errDiv.style.color = 'red';
            errDiv.style.padding = '10px';
            errDiv.style.background = '#fee2e2';
            errDiv.style.border = '1px solid #ef4444';
            errDiv.style.margin = '10px';
            errDiv.innerText = \`JS Error: \${message}\`;
            document.body.prepend(errDiv);
        };

        // Robust Input handling
        function getInputs() {
            const inputs = {};
            document.querySelectorAll('input, select, textarea').forEach(el => {
                const key = el.id || el.getAttribute('name') || el.dataset.name;
                if (key) {
                    if (el.type === 'checkbox') {
                         if (el.checked) inputs[key] = el.value;
                    } else if (el.type === 'radio') {
                         if (el.checked) inputs[key] = el.value;
                    } else {
                         inputs[key] = el.value;
                    }
                }
            });
            return inputs;
        }

        // Run App
        runBtn.addEventListener('click', () => {
            try {
                const inputs = getInputs();
                // Validate required
                let isValid = true;
                document.querySelectorAll('[required]').forEach(el => {
                    if (!el.value) {
                        el.style.borderColor = 'red';
                        isValid = false;
                    } else {
                        el.style.borderColor = '';
                    }
                });
                
                if (!isValid) return;
    
                loader.classList.add('visible');
                outputDiv.innerHTML = ''; // Clear previous
                
                vscode.postMessage({
                    type: 'executeApp',
                    inputs: inputs
                });
            } catch (e) {
                alert('Error starting app: ' + e);
            }
        });

        // Messages
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'result') {
                loader.classList.remove('visible');
                if (msg.result.success) {
                    let md = msg.result.output.content;
                    
                    // Parse markdown tables first (before line breaks)
                    const lines = md.split('\\n');
                    let inTable = false;
                    let tableRows = [];
                    let result = [];
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (line.startsWith('|') && line.endsWith('|')) {
                            // Check if next line is separator
                            if (!inTable && i + 1 < lines.length && /^\\|[-:|\\s]+\\|$/.test(lines[i + 1].trim())) {
                                inTable = true;
                                tableRows = [line];
                            } else if (inTable) {
                                if (/^\\|[-:|\\s]+\\|$/.test(line)) {
                                    // Skip separator line
                                } else {
                                    tableRows.push(line);
                                }
                            }
                        } else {
                            if (inTable && tableRows.length > 0) {
                                // Convert tableRows to HTML
                                let html = '<table><thead><tr>';
                                const headerCells = tableRows[0].split('|').filter(c => c.trim());
                                headerCells.forEach(c => html += '<th>' + c.trim() + '</th>');
                                html += '</tr></thead><tbody>';
                                for (let j = 1; j < tableRows.length; j++) {
                                    html += '<tr>';
                                    const cells = tableRows[j].split('|').filter(c => c.trim());
                                    cells.forEach(c => html += '<td>' + c.trim() + '</td>');
                                    html += '</tr>';
                                }
                                html += '</tbody></table>';
                                result.push(html);
                                tableRows = [];
                            }
                            inTable = false;
                            result.push(line);
                        }
                    }
                    // Handle trailing table
                    if (inTable && tableRows.length > 0) {
                        let html = '<table><thead><tr>';
                        const headerCells = tableRows[0].split('|').filter(c => c.trim());
                        headerCells.forEach(c => html += '<th>' + c.trim() + '</th>');
                        html += '</tr></thead><tbody>';
                        for (let j = 1; j < tableRows.length; j++) {
                            html += '<tr>';
                            const cells = tableRows[j].split('|').filter(c => c.trim());
                            cells.forEach(c => html += '<td>' + c.trim() + '</td>');
                            html += '</tr>';
                        }
                        html += '</tbody></table>';
                        result.push(html);
                    }
                    
                    md = result.join('\\n');
                    
                    // Standard markdown rendering  
                    md = md
                        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                        .replace(/\\*\\*(.*?)\\*\\*/gim, '<strong>$1</strong>')
                        .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
                        .replace(/\\n/gim, '<br>');
                    
                    outputDiv.innerHTML = md;
                    
                    // Cleanup lists
                    outputDiv.innerHTML = outputDiv.innerHTML.split('</ul><br><ul>').join('');
                    outputDiv.innerHTML = outputDiv.innerHTML.split('<br><ul>').join('<ul>');
                } else {
                    outputDiv.innerHTML = '<div style="color:red; padding:20px">Error: ' + msg.result.error + '</div>';
                }
            } else if (msg.type === 'progress') {
                // Could show progress text
            }
        });

        // Toolbar actions
        document.getElementById('copy-btn').addEventListener('click', () => {
             vscode.postMessage({ type: 'copyToClipboard', value: outputDiv.innerText });
        });
        document.getElementById('insert-btn').addEventListener('click', () => {
             vscode.postMessage({ type: 'insertAtCursor', value: outputDiv.innerText });
        });
        document.getElementById('save-btn').addEventListener('click', () => {
             vscode.postMessage({ type: 'saveAsFile', content: outputDiv.innerText, filename: '${app.id}-result.md' });
        });
        
        document.getElementById('go-back').addEventListener('click', () => {
            vscode.postMessage({ type: 'goBack' });
        });
    </script>
    </body>
    </html>`;
    }

    /**
     * Generate Interactive Game HTML with multi-round gameplay
     */
    private static getInteractiveGameHtml(webview: vscode.Webview, app: AppDefinition): string {
        const nonce = getNonce();

        // Game-specific themes
        const themes: Record<string, { accent: string; gradient: string; emoji: string }> = {
            'trivia-showdown': { accent: '#f59e0b', gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', emoji: '🧠' },
            'story-chain': { accent: '#ec4899', gradient: 'linear-gradient(135deg, #1e1b4b 0%, #581c87 50%, #1e1b4b 100%)', emoji: '🎭' },
            'caption-battle': { accent: '#06b6d4', gradient: 'linear-gradient(135deg, #0f172a 0%, #164e63 50%, #0f172a 100%)', emoji: '🎨' },
            'debate-arena': { accent: '#ef4444', gradient: 'linear-gradient(135deg, #1c1917 0%, #7f1d1d 50%, #1c1917 100%)', emoji: '⚔️' }
        };
        const theme = themes[app.id] || themes['trivia-showdown'];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${app.icon} ${app.name}</title>
    <style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: var(--vscode-font-family);
            background: ${theme.gradient};
            color: #f8fafc;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        /* Header */
        .game-header {
            padding: 20px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(0,0,0,0.3);
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .game-title {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 20px;
            font-weight: 700;
        }
        .game-icon {
            font-size: 32px;
        }
        .back-btn {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: #f8fafc;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        .back-btn:hover { background: rgba(255,255,255,0.2); }
        
        /* Score Bar */
        .score-bar {
            display: none;
            padding: 12px 24px;
            background: rgba(0,0,0,0.2);
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
        }
        .score-bar.visible { display: flex; }
        .score-display {
            display: flex;
            gap: 24px;
        }
        .score-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .score-value {
            font-weight: 700;
            font-size: 18px;
            color: ${theme.accent};
        }
        .round-indicator {
            background: ${theme.accent};
            color: #000;
            padding: 4px 12px;
            border-radius: 16px;
            font-weight: 600;
        }
        
        /* Main Content */
        .game-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 32px;
            max-width: 800px;
            margin: 0 auto;
            width: 100%;
        }
        
        /* Setup Screen */
        .setup-screen {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }
        .setup-title {
            font-size: 28px;
            font-weight: 700;
            text-align: center;
            margin-bottom: 16px;
        }
        .setup-section {
            background: rgba(255,255,255,0.05);
            border-radius: 16px;
            padding: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .section-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.6;
            margin-bottom: 12px;
        }
        
        /* Option Cards */
        .options-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
        }
        .option-card {
            background: rgba(255,255,255,0.05);
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 16px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .option-card:hover {
            border-color: ${theme.accent};
            background: rgba(255,255,255,0.1);
            transform: translateY(-2px);
        }
        .option-card.selected {
            border-color: ${theme.accent};
            background: color-mix(in srgb, ${theme.accent} 20%, transparent);
        }
        .option-icon { font-size: 24px; margin-bottom: 8px; }
        .option-label { font-weight: 600; font-size: 14px; }
        .option-desc { font-size: 11px; opacity: 0.6; margin-top: 4px; }
        
        /* Text Input */
        .text-input {
            width: 100%;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            padding: 12px 16px;
            color: #f8fafc;
            font-size: 14px;
            outline: none;
        }
        .text-input:focus { border-color: ${theme.accent}; }
        .text-input::placeholder { opacity: 0.4; }
        
        /* Start Button */
        .start-btn {
            background: ${theme.accent};
            color: #000;
            border: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 16px;
        }
        .start-btn:hover { transform: scale(1.02); filter: brightness(1.1); }
        .start-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        
        /* Play Screen - hidden by default */
        .play-screen { display: none; flex-direction: column; gap: 24px; }
        .play-screen.visible { display: flex; }
        .setup-screen.hidden { display: none; }
        
        /* Question Card */
        .question-card {
            background: rgba(0,0,0,0.3);
            border-radius: 20px;
            padding: 32px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .question-text {
            font-size: 22px;
            font-weight: 600;
            line-height: 1.5;
            margin-bottom: 24px;
        }
        
        /* Answer Buttons */
        .answers-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .answer-btn {
            background: rgba(255,255,255,0.08);
            border: 2px solid rgba(255,255,255,0.15);
            border-radius: 12px;
            padding: 16px 20px;
            color: #f8fafc;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.2s;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .answer-btn:hover:not(:disabled) {
            border-color: ${theme.accent};
            background: rgba(255,255,255,0.12);
        }
        .answer-btn:disabled { cursor: default; opacity: 0.7; }
        .answer-btn.correct {
            border-color: #22c55e;
            background: rgba(34, 197, 94, 0.2);
        }
        .answer-btn.wrong {
            border-color: #ef4444;
            background: rgba(239, 68, 68, 0.2);
        }
        .answer-letter {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: rgba(255,255,255,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            flex-shrink: 0;
        }
        .answer-text { flex: 1; }
        
        /* Feedback */
        .feedback-area {
            display: none;
            background: rgba(0,0,0,0.2);
            border-radius: 12px;
            padding: 20px;
            margin-top: 16px;
        }
        .feedback-area.visible { display: block; }
        .feedback-result {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .feedback-result.correct { color: #22c55e; }
        .feedback-result.wrong { color: #ef4444; }
        .fun-fact {
            font-size: 14px;
            opacity: 0.8;
            line-height: 1.5;
        }
        
        /* Next Button */
        .next-btn {
            display: none;
            background: ${theme.accent};
            color: #000;
            border: none;
            padding: 14px 28px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 16px;
            align-self: center;
        }
        .next-btn.visible { display: inline-block; }
        
        /* Results Screen */
        .results-screen { display: none; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
        .results-screen.visible { display: flex; }
        .results-emoji { font-size: 72px; }
        .results-title { font-size: 32px; font-weight: 700; }
        .results-score { font-size: 48px; font-weight: 700; color: ${theme.accent}; }
        .results-subtitle { font-size: 16px; opacity: 0.7; }
        .play-again-btn {
            background: ${theme.accent};
            color: #000;
            border: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            margin-top: 16px;
        }
        
        /* Story Chain specific */
        .story-content {
            background: rgba(0,0,0,0.2);
            border-radius: 16px;
            padding: 24px;
            font-size: 16px;
            line-height: 1.8;
            max-height: 300px;
            overflow-y: auto;
        }
        .story-choices {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 20px;
        }
        .story-choice-btn {
            background: rgba(255,255,255,0.08);
            border: 2px solid rgba(255,255,255,0.15);
            border-radius: 12px;
            padding: 16px 20px;
            color: #f8fafc;
            font-size: 15px;
            cursor: pointer;
            transition: all 0.2s;
            text-align: left;
        }
        .story-choice-btn:hover {
            border-color: ${theme.accent};
            background: rgba(255,255,255,0.12);
        }
        
        /* Loading */
        .loading-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.7);
            justify-content: center;
            align-items: center;
            flex-direction: column;
            gap: 16px;
        }
        .loading-overlay.visible { display: flex; }
        .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid rgba(255,255,255,0.2);
            border-top-color: ${theme.accent};
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-text { font-size: 16px; opacity: 0.8; }
    </style>
</head>
<body>
    <div class="game-header">
        <div class="game-title">
            <span class="game-icon">${app.icon}</span>
            <span>${app.name}</span>
        </div>
        <button class="back-btn" id="back-btn">← Back</button>
    </div>
    
    <div class="score-bar" id="score-bar">
        <div class="score-display">
            <div class="score-item">
                <span>Score:</span>
                <span class="score-value" id="score">0</span>
            </div>
            <div class="score-item">
                <span>Streak:</span>
                <span class="score-value" id="streak">0</span>
            </div>
        </div>
        <div class="round-indicator" id="round-indicator">Round 1/5</div>
    </div>
    
    <div class="game-content">
        <!-- Setup Screen -->
        <div class="setup-screen" id="setup-screen">
            <div class="setup-title">⚡ Ready to Play?</div>
            
            ${app.id === 'trivia-showdown' ? `
            <div class="setup-section">
                <div class="section-label">Choose Your Topic</div>
                <input type="text" class="text-input" id="topic-input" placeholder="e.g., 90s Movies, Space, Programming...">
            </div>
            
            <div class="setup-section">
                <div class="section-label">Difficulty</div>
                <div class="options-grid" id="difficulty-options">
                    <div class="option-card" data-value="easy">
                        <div class="option-icon">🟢</div>
                        <div class="option-label">Easy</div>
                        <div class="option-desc">Warm-up</div>
                    </div>
                    <div class="option-card selected" data-value="medium">
                        <div class="option-icon">🟡</div>
                        <div class="option-label">Medium</div>
                        <div class="option-desc">Balanced</div>
                    </div>
                    <div class="option-card" data-value="hard">
                        <div class="option-icon">🔴</div>
                        <div class="option-label">Hard</div>
                        <div class="option-desc">Expert</div>
                    </div>
                    <div class="option-card" data-value="impossible">
                        <div class="option-icon">💀</div>
                        <div class="option-label">Impossible</div>
                        <div class="option-desc">Good luck!</div>
                    </div>
                </div>
            </div>
            
            <div class="setup-section">
                <div class="section-label">Number of Questions</div>
                <div class="options-grid" id="count-options">
                    <div class="option-card" data-value="3">
                        <div class="option-label">3</div>
                        <div class="option-desc">Quick</div>
                    </div>
                    <div class="option-card selected" data-value="5">
                        <div class="option-label">5</div>
                        <div class="option-desc">Standard</div>
                    </div>
                    <div class="option-card" data-value="10">
                        <div class="option-label">10</div>
                        <div class="option-desc">Marathon</div>
                    </div>
                </div>
            </div>
            ` : app.id === 'story-chain' ? `
            <div class="setup-section">
                <div class="section-label">Story Genre</div>
                <div class="options-grid" id="genre-options">
                    <div class="option-card selected" data-value="fantasy">
                        <div class="option-icon">🧙</div>
                        <div class="option-label">Fantasy</div>
                    </div>
                    <div class="option-card" data-value="scifi">
                        <div class="option-icon">🚀</div>
                        <div class="option-label">Sci-Fi</div>
                    </div>
                    <div class="option-card" data-value="mystery">
                        <div class="option-icon">🔍</div>
                        <div class="option-label">Mystery</div>
                    </div>
                    <div class="option-card" data-value="comedy">
                        <div class="option-icon">😂</div>
                        <div class="option-label">Comedy</div>
                    </div>
                    <div class="option-card" data-value="horror">
                        <div class="option-icon">👻</div>
                        <div class="option-label">Horror</div>
                    </div>
                </div>
            </div>
            ` : app.id === 'caption-battle' ? `
            <div class="setup-section">
                <div class="section-label">Caption Vibe</div>
                <div class="options-grid" id="vibe-options">
                    <div class="option-card selected" data-value="absurd">
                        <div class="option-icon">🤪</div>
                        <div class="option-label">Absurd</div>
                    </div>
                    <div class="option-card" data-value="wholesome">
                        <div class="option-icon">🥰</div>
                        <div class="option-label">Wholesome</div>
                    </div>
                    <div class="option-card" data-value="corporate">
                        <div class="option-icon">💼</div>
                        <div class="option-label">Corporate</div>
                    </div>
                    <div class="option-card" data-value="dark">
                        <div class="option-icon">🌑</div>
                        <div class="option-label">Dark</div>
                    </div>
                </div>
            </div>
            <div class="setup-section">
                <div class="section-label">Optional Theme</div>
                <input type="text" class="text-input" id="theme-input" placeholder="e.g., Cats, Space, Monday mornings...">
            </div>
            ` : `
            <div class="setup-section">
                <div class="section-label">Debate Category</div>
                <div class="options-grid" id="category-options">
                    <div class="option-card selected" data-value="tech">
                        <div class="option-icon">💻</div>
                        <div class="option-label">Tech Wars</div>
                    </div>
                    <div class="option-card" data-value="food">
                        <div class="option-icon">🍕</div>
                        <div class="option-label">Food Fights</div>
                    </div>
                    <div class="option-card" data-value="life">
                        <div class="option-icon">🌍</div>
                        <div class="option-label">Life Choices</div>
                    </div>
                    <div class="option-card" data-value="work">
                        <div class="option-icon">💼</div>
                        <div class="option-label">Work Style</div>
                    </div>
                </div>
            </div>
            `}
            
            <button class="start-btn" id="start-btn">🎮 Start Game</button>
        </div>
        
        <!-- Play Screen (Trivia) -->
        <div class="play-screen" id="play-screen">
            <div class="question-card">
                <div class="question-text" id="question-text">Loading question...</div>
                <div class="answers-grid" id="answers-grid">
                    <button class="answer-btn" data-answer="A">
                        <span class="answer-letter">A</span>
                        <span class="answer-text" id="answer-a">-</span>
                    </button>
                    <button class="answer-btn" data-answer="B">
                        <span class="answer-letter">B</span>
                        <span class="answer-text" id="answer-b">-</span>
                    </button>
                    <button class="answer-btn" data-answer="C">
                        <span class="answer-letter">C</span>
                        <span class="answer-text" id="answer-c">-</span>
                    </button>
                    <button class="answer-btn" data-answer="D">
                        <span class="answer-letter">D</span>
                        <span class="answer-text" id="answer-d">-</span>
                    </button>
                </div>
            </div>
            
            <div class="feedback-area" id="feedback-area">
                <div class="feedback-result" id="feedback-result">Correct!</div>
                <div class="fun-fact" id="fun-fact">Fun fact will appear here...</div>
            </div>
            
            <button class="next-btn" id="next-btn">Next Question →</button>
        </div>
        
        <!-- Results Screen -->
        <div class="results-screen" id="results-screen">
            <div class="results-emoji" id="results-emoji">🏆</div>
            <div class="results-title" id="results-title">Great Job!</div>
            <div class="results-score" id="results-score">5/5</div>
            <div class="results-subtitle" id="results-subtitle">You're a trivia champion!</div>
            <button class="play-again-btn" id="play-again-btn">🔄 Play Again</button>
        </div>
    </div>
    
    <div class="loading-overlay" id="loading-overlay">
        <div class="spinner"></div>
        <div class="loading-text" id="loading-text">Generating questions...</div>
    </div>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const gameId = '${app.id}';
        
        // State
        let gameState = {
            questions: [],
            currentQuestion: 0,
            score: 0,
            streak: 0,
            maxStreak: 0,
            totalQuestions: 5,
            settings: {}
        };
        
        // Elements
        const setupScreen = document.getElementById('setup-screen');
        const playScreen = document.getElementById('play-screen');
        const resultsScreen = document.getElementById('results-screen');
        const scoreBar = document.getElementById('score-bar');
        const loadingOverlay = document.getElementById('loading-overlay');
        
        // Option card selection
        document.querySelectorAll('.options-grid').forEach(grid => {
            grid.addEventListener('click', (e) => {
                const card = e.target.closest('.option-card');
                if (!card) return;
                grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
        });
        
        // Back button
        document.getElementById('back-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'goBack' });
        });
        
        // Start button
        document.getElementById('start-btn').addEventListener('click', () => {
            startGame();
        });
        
        // Answer buttons
        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                handleAnswer(btn.dataset.answer);
            });
        });
        
        // Next button
        document.getElementById('next-btn').addEventListener('click', () => {
            nextQuestion();
        });
        
        // Play again
        document.getElementById('play-again-btn').addEventListener('click', () => {
            resetGame();
        });
        
        function startGame() {
            // Collect settings based on game type
            if (gameId === 'trivia-showdown') {
                const topic = document.getElementById('topic-input').value.trim() || 'General Knowledge';
                const difficulty = document.querySelector('#difficulty-options .selected')?.dataset.value || 'medium';
                const count = document.querySelector('#count-options .selected')?.dataset.value || '5';
                
                gameState.settings = { topic, difficulty, count };
                gameState.totalQuestions = parseInt(count);
                
                showLoading('Generating ' + count + ' questions about ' + topic + '...');
                
                vscode.postMessage({
                    type: 'gameAction',
                    action: 'startTrivia',
                    settings: gameState.settings
                });
            } else if (gameId === 'story-chain') {
                const genre = document.querySelector('#genre-options .selected')?.dataset.value || 'fantasy';
                gameState.settings = { genre };
                
                showLoading('Starting your ' + genre + ' adventure...');
                
                vscode.postMessage({
                    type: 'gameAction',
                    action: 'startStory',
                    settings: gameState.settings
                });
            } else if (gameId === 'caption-battle') {
                const vibe = document.querySelector('#vibe-options .selected')?.dataset.value || 'absurd';
                const theme = document.getElementById('theme-input')?.value.trim() || '';
                gameState.settings = { vibe, theme };
                
                showLoading('Creating hilarious scenarios...');
                
                vscode.postMessage({
                    type: 'gameAction',
                    action: 'startCaption',
                    settings: gameState.settings
                });
            } else if (gameId === 'debate-arena') {
                const category = document.querySelector('#category-options .selected')?.dataset.value || 'tech';
                gameState.settings = { category };
                
                showLoading('Finding a spicy debate topic...');
                
                vscode.postMessage({
                    type: 'gameAction',
                    action: 'startDebate',
                    settings: gameState.settings
                });
            }
        }
        
        function handleAnswer(answer) {
            const currentQ = gameState.questions[gameState.currentQuestion];
            const correct = answer === currentQ.correctAnswer;
            
            // Disable all buttons
            document.querySelectorAll('.answer-btn').forEach(btn => {
                btn.disabled = true;
                if (btn.dataset.answer === currentQ.correctAnswer) {
                    btn.classList.add('correct');
                } else if (btn.dataset.answer === answer && !correct) {
                    btn.classList.add('wrong');
                }
            });
            
            // Update score
            if (correct) {
                gameState.score++;
                gameState.streak++;
                if (gameState.streak > gameState.maxStreak) gameState.maxStreak = gameState.streak;
            } else {
                gameState.streak = 0;
            }
            
            updateScoreDisplay();
            
            // Show feedback
            const feedbackArea = document.getElementById('feedback-area');
            const feedbackResult = document.getElementById('feedback-result');
            const funFact = document.getElementById('fun-fact');
            
            feedbackResult.textContent = correct ? '✅ Correct!' : '❌ Wrong!';
            feedbackResult.className = 'feedback-result ' + (correct ? 'correct' : 'wrong');
            funFact.textContent = currentQ.funFact || 'Great effort!';
            feedbackArea.classList.add('visible');
            
            // Show next button
            document.getElementById('next-btn').classList.add('visible');
        }
        
        function nextQuestion() {
            gameState.currentQuestion++;
            
            if (gameState.currentQuestion >= gameState.questions.length) {
                showResults();
                return;
            }
            
            displayQuestion();
        }
        
        function displayQuestion() {
            const q = gameState.questions[gameState.currentQuestion];
            
            // Reset UI
            document.querySelectorAll('.answer-btn').forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('correct', 'wrong');
            });
            document.getElementById('feedback-area').classList.remove('visible');
            document.getElementById('next-btn').classList.remove('visible');
            
            // Update question
            document.getElementById('question-text').textContent = q.question;
            document.getElementById('answer-a').textContent = q.answers.A;
            document.getElementById('answer-b').textContent = q.answers.B;
            document.getElementById('answer-c').textContent = q.answers.C;
            document.getElementById('answer-d').textContent = q.answers.D;
            
            // Update round indicator
            document.getElementById('round-indicator').textContent = 
                'Question ' + (gameState.currentQuestion + 1) + '/' + gameState.totalQuestions;
        }
        
        function updateScoreDisplay() {
            document.getElementById('score').textContent = gameState.score;
            document.getElementById('streak').textContent = gameState.streak;
        }
        
        function showResults() {
            playScreen.classList.remove('visible');
            scoreBar.classList.remove('visible');
            resultsScreen.classList.add('visible');
            
            const percentage = Math.round((gameState.score / gameState.totalQuestions) * 100);
            
            let emoji, title, subtitle;
            if (percentage === 100) {
                emoji = '🏆';
                title = 'Perfect Score!';
                subtitle = 'You are a trivia legend!';
            } else if (percentage >= 80) {
                emoji = '🌟';
                title = 'Excellent!';
                subtitle = 'Almost perfect - impressive knowledge!';
            } else if (percentage >= 60) {
                emoji = '👏';
                title = 'Great Job!';
                subtitle = 'Solid performance!';
            } else if (percentage >= 40) {
                emoji = '💪';
                title = 'Not Bad!';
                subtitle = 'Room for improvement - try again?';
            } else {
                emoji = '📚';
                title = 'Keep Learning!';
                subtitle = 'Every expert was once a beginner!';
            }
            
            document.getElementById('results-emoji').textContent = emoji;
            document.getElementById('results-title').textContent = title;
            document.getElementById('results-score').textContent = gameState.score + '/' + gameState.totalQuestions;
            document.getElementById('results-subtitle').textContent = subtitle;
        }
        
        function resetGame() {
            gameState = {
                questions: [],
                currentQuestion: 0,
                score: 0,
                streak: 0,
                maxStreak: 0,
                totalQuestions: 5,
                settings: {}
            };
            
            resultsScreen.classList.remove('visible');
            playScreen.classList.remove('visible');
            scoreBar.classList.remove('visible');
            setupScreen.classList.remove('hidden');
        }
        
        function showLoading(text) {
            document.getElementById('loading-text').textContent = text;
            loadingOverlay.classList.add('visible');
        }
        
        function hideLoading() {
            loadingOverlay.classList.remove('visible');
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const msg = event.data;
            
            if (msg.type === 'triviaQuestions') {
                hideLoading();
                gameState.questions = msg.questions;
                gameState.totalQuestions = msg.questions.length;
                
                setupScreen.classList.add('hidden');
                playScreen.classList.add('visible');
                scoreBar.classList.add('visible');
                
                updateScoreDisplay();
                displayQuestion();
            } else if (msg.type === 'gameError') {
                hideLoading();
                alert('Error: ' + msg.error);
            } else if (msg.type === 'gameContent') {
                hideLoading();
                setupScreen.classList.add('hidden');
                playScreen.classList.add('visible');
                scoreBar.style.display = 'none';
                
                const questionText = document.getElementById('question-text');
                const answersGrid = document.getElementById('answers-grid');
                
                // For Story Chain, parse and create clickable choices
                if (msg.gameType === 'startStory') {
                    // Split content into story and choices
                    const parts = msg.content.split('---CHOICES---');
                    const storyPart = parts[0] || msg.content;
                    const choicesPart = parts[1] || '';
                    
                    // Parse choices (numbered list)
                    const choiceLines = choicesPart.split(/\\n/).filter(line => line.match(/^\\d+\\./));
                    
                    // Render story
                    let html = storyPart.replace(/---STORY---/g, '').trim();
                    html = html.split('**').join('');
                    questionText.innerHTML = '<div style="line-height:1.8;font-size:16px;">' + html.replace(/\\n/g, '<br>') + '</div>';
                    
                    // Create choice buttons
                    if (choiceLines.length > 0) {
                        answersGrid.innerHTML = '';
                        answersGrid.style.display = 'flex';
                        answersGrid.style.flexDirection = 'column';
                        answersGrid.style.gap = '12px';
                        
                        choiceLines.forEach((choice, i) => {
                            const cleanChoice = choice.replace(/^\\d+\\.\\s*/, '').trim();
                            const btn = document.createElement('button');
                            btn.className = 'answer-btn';
                            btn.style.display = 'block';
                            btn.style.width = '100%';
                            btn.innerHTML = '<span class="answer-letter">' + (i+1) + '</span><span class="answer-text">' + cleanChoice + '</span>';
                            btn.onclick = () => {
                                showLoading('Continuing the story...');
                                vscode.postMessage({
                                    type: 'gameAction',
                                    action: 'continueStory',
                                    choice: cleanChoice,
                                    settings: gameState.settings
                                });
                            };
                            answersGrid.appendChild(btn);
                        });
                    } else {
                        answersGrid.style.display = 'none';
                    }
                } else if (msg.gameType === 'startCaption') {
                    // Caption Battle - show scenarios with input fields
                    let html = msg.content;
                    html = html.split('**').join('');
                    html = html.replace(/---SCENARIO_\\d+---/g, '<hr style="margin:20px 0">');
                    questionText.innerHTML = '<div style="line-height:1.6;font-size:15px">' + html.replace(/\\n/g, '<br>') + '</div>';
                    
                    // Add caption input
                    answersGrid.innerHTML = '';
                    answersGrid.style.display = 'flex';
                    answersGrid.style.flexDirection = 'column';
                    answersGrid.style.gap = '12px';
                    
                    const input = document.createElement('textarea');
                    input.placeholder = 'Write your funniest caption here...';
                    input.style.cssText = 'width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:14px;min-height:80px;resize:vertical;';
                    answersGrid.appendChild(input);
                    
                    const submitBtn = document.createElement('button');
                    submitBtn.className = 'answer-btn';
                    submitBtn.style.cssText = 'justify-content:center;background:var(--accent,#06b6d4);';
                    submitBtn.textContent = '🎤 Submit Caption';
                    submitBtn.onclick = () => {
                        if (!input.value.trim()) { alert('Please write a caption!'); return; }
                        showLoading('Judging your caption...');
                        vscode.postMessage({
                            type: 'gameAction',
                            action: 'judgeCaption',
                            caption: input.value.trim(),
                            settings: gameState.settings
                        });
                    };
                    answersGrid.appendChild(submitBtn);
                } else if (msg.gameType === 'startDebate') {
                    // Debate Arena - show topic with argument input
                    let html = msg.content;
                    html = html.split('# ').join('<h2 style="color:#ef4444">');
                    html = html.split('## ').join('<h3>');
                    html = html.split('**').join('');
                    questionText.innerHTML = '<div style="line-height:1.6">' + html.replace(/\\n/g, '<br>') + '</div>';
                    
                    // Add argument input
                    answersGrid.innerHTML = '';
                    answersGrid.style.display = 'flex';
                    answersGrid.style.flexDirection = 'column';
                    answersGrid.style.gap = '12px';
                    
                    const sideLabel = document.createElement('div');
                    sideLabel.innerHTML = '<strong>Pick your side and argue!</strong>';
                    sideLabel.style.marginBottom = '8px';
                    answersGrid.appendChild(sideLabel);
                    
                    const input = document.createElement('textarea');
                    input.placeholder = 'Type your argument here... Be persuasive!';
                    input.style.cssText = 'width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:14px;min-height:100px;resize:vertical;';
                    answersGrid.appendChild(input);
                    
                    const submitBtn = document.createElement('button');
                    submitBtn.className = 'answer-btn';
                    submitBtn.style.cssText = 'justify-content:center;background:#ef4444;';
                    submitBtn.textContent = '⚔️ Submit Argument';
                    submitBtn.onclick = () => {
                        if (!input.value.trim()) { alert('Please write an argument!'); return; }
                        showLoading('The AI judge is deliberating...');
                        vscode.postMessage({
                            type: 'gameAction',
                            action: 'judgeDebate',
                            argument: input.value.trim(),
                            settings: gameState.settings
                        });
                    };
                    answersGrid.appendChild(submitBtn);
                } else {
                    // Fallback
                    let html = msg.content;
                    html = html.split('# ').join('<h1>');
                    html = html.split('## ').join('<h2>');
                    html = html.split('**').join('');
                    html = html.split('---').join('<hr>');
                    questionText.innerHTML = '<div style="line-height:1.6">' + html.replace(/\\n/g, '<br>') + '</div>';
                    answersGrid.style.display = 'none';
                }
                
                // Show play again button
                document.getElementById('next-btn').textContent = '🔄 Play Again';
                document.getElementById('next-btn').classList.add('visible');
                document.getElementById('next-btn').onclick = () => resetGame();
            } else if (msg.type === 'gameResult') {
                hideLoading();
                // Show the result/feedback from AI judge
                const questionText = document.getElementById('question-text');
                const answersGrid = document.getElementById('answers-grid');
                
                let html = msg.content;
                html = html.split('**').join('<strong>').split('</strong><strong>').join('');
                html = html.split('*').join('');
                questionText.innerHTML = '<div style="line-height:1.8;font-size:16px;padding:20px;background:rgba(0,255,100,0.1);border-radius:12px;border:1px solid rgba(0,255,100,0.3);">' + html.replace(/\\n/g, '<br>') + '</div>';
                
                // Add "Try Again" button
                answersGrid.innerHTML = '';
                answersGrid.style.display = 'block';
                const tryAgainBtn = document.createElement('button');
                tryAgainBtn.className = 'answer-btn';
                tryAgainBtn.style.cssText = 'justify-content:center;width:100%;margin-top:16px;';
                tryAgainBtn.textContent = '🔄 Try Another Round';
                tryAgainBtn.onclick = () => resetGame();
                answersGrid.appendChild(tryAgainBtn);
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generate individual app HTML
     */
    private static getAppHtml(webview: vscode.Webview, app: AppDefinition, savedProjects: SavedProject[]): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${app.icon} ${app.name}</title>
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 32px;
        }
        .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
            margin-bottom: 24px;
            transition: all 0.15s ease;
        }
        .back-btn:hover {
            background: var(--vscode-button-secondaryBackground);
            border-color: var(--vscode-focusBorder);
        }
        .header {
            display: flex;
            align-items: center;
            gap: 20px;
            margin-bottom: 32px;
        }
        .header-icon {
            font-size: 56px;
            width: 80px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 20px;
            background: linear-gradient(135deg, rgba(56,189,248,0.15), rgba(167,139,250,0.1));
            border: 1px solid var(--vscode-widget-border);
        }
        .header-text h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .header-text p {
            font-size: 15px;
            opacity: 0.7;
        }
        .form-section {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 16px;
            padding: 28px;
            margin-bottom: 24px;
        }
        .form-group {
            margin-bottom: 24px;
        }
        .form-group:last-child { margin-bottom: 0; }
        .form-label {
            display: block;
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .form-hint {
            font-size: 12px;
            opacity: 0.6;
            margin-top: 6px;
        }
        input[type="text"], textarea, select {
            width: 100%;
            padding: 12px 14px;
            border-radius: 10px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 14px;
            transition: all 0.15s ease;
        }
        input:focus, textarea:focus, select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
        }
        textarea {
            font-family: var(--vscode-editor-font-family);
            resize: vertical;
            min-height: 140px;
            line-height: 1.5;
        }
        .radio-group, .checkbox-group {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .radio-option, .checkbox-option {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 14px 16px;
            border-radius: 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .radio-option:hover, .checkbox-option:hover {
            border-color: var(--vscode-focusBorder);
        }
        .radio-option.selected, .checkbox-option.selected {
            border-color: var(--vscode-focusBorder);
            background: color-mix(in srgb, var(--vscode-focusBorder) 8%, var(--vscode-editor-background));
        }
        .radio-option input, .checkbox-option input {
            margin: 3px 0 0 0;
        }
        .option-content { flex: 1; }
        .option-label {
            font-weight: 500;
            font-size: 14px;
        }
        .option-desc {
            font-size: 12px;
            opacity: 0.7;
            margin-top: 3px;
        }
        .project-picker {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .project-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            border-radius: 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
        }
        .project-item .name { flex: 1; font-weight: 500; }
        .project-item .path {
            font-size: 11px;
            opacity: 0.6;
            font-family: var(--vscode-editor-font-family);
        }
        .project-item .remove-btn {
            background: none;
            border: none;
            cursor: pointer;
            opacity: 0.5;
            font-size: 16px;
        }
        .project-item .remove-btn:hover { opacity: 1; }
        .add-project-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px;
            border-radius: 10px;
            border: 2px dashed var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.15s ease;
        }
        .add-project-btn:hover {
            border-color: var(--vscode-focusBorder);
            background: color-mix(in srgb, var(--vscode-focusBorder) 5%, transparent);
        }
        .submit-btn {
            width: 100%;
            padding: 16px 28px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, var(--vscode-button-background), color-mix(in srgb, var(--vscode-button-background) 80%, black));
            color: var(--vscode-button-foreground);
            font-family: var(--vscode-font-family);
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        }
        .submit-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .spinner {
            width: 18px;
            height: 18px;
            border: 2px solid currentColor;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .result-section {
            margin-top: 32px;
        }
        .result-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        .result-header h3 {
            font-size: 18px;
        }
        .result-actions {
            display: flex;
            gap: 10px;
        }
        .action-btn {
            padding: 10px 16px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
        }
        .action-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            border-color: var(--vscode-focusBorder);
        }
        .result-content {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 12px;
            padding: 24px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 1.7;
            white-space: pre-wrap;
            overflow-x: auto;
            max-height: 600px;
            overflow-y: auto;
        }
        .result-content.error {
            background: color-mix(in srgb, var(--vscode-testing-iconFailed) 10%, var(--vscode-editor-background));
            border-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-testing-iconFailed);
        }
        .progress-msg {
            text-align: center;
            font-size: 14px;
            opacity: 0.7;
            padding: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }
        .hidden { display: none !important; }
        .conditional-field { display: none; }
        .conditional-field.visible { display: block; }
        .file-picker-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .file-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .file-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 8px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
        }
        .file-item .file-icon { font-size: 20px; }
        .file-item .file-info { flex: 1; }
        .file-item .file-name { font-weight: 500; font-size: 13px; }
        .file-item .file-size { font-size: 11px; opacity: 0.6; }
        .file-item .remove-file-btn {
            background: none;
            border: none;
            cursor: pointer;
            opacity: 0.5;
            font-size: 16px;
            padding: 4px;
        }
        .file-item .remove-file-btn:hover { opacity: 1; }
        .add-file-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px;
            border-radius: 10px;
            border: 2px dashed var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.15s ease;
        }
        .add-file-btn:hover {
            border-color: var(--vscode-focusBorder);
            background: color-mix(in srgb, var(--vscode-focusBorder) 5%, transparent);
        }
        .model-picker-container {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .model-select {
            flex: 1;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 13px;
        }
        .refresh-models-btn {
            padding: 10px 14px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-models-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .help-section {
            background: color-mix(in srgb, var(--vscode-focusBorder) 5%, var(--vscode-editor-background));
            border: 1px solid var(--vscode-widget-border);
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 32px;
            font-size: 13px;
            line-height: 1.6;
        }
        .help-section h3 {
            font-size: 14px;
            font-weight: 600;
            margin: 16px 0 8px 0;
            color: var(--vscode-foreground);
        }
        .help-section h3:first-child { margin-top: 0; }
        .help-section p { margin-bottom: 12px; opacity: 0.9; }
        .help-section ul { margin-bottom: 12px; padding-left: 20px; }
        .help-section li { margin-bottom: 6px; opacity: 0.9; }
        .help-section strong { font-weight: 600; color: var(--vscode-foreground); }
    </style>
</head>
<body>
    <div class="container">
        <button class="back-btn" id="back-btn">← Back to Apps</button>
        
        <div class="header">
            <div class="header-icon">${app.icon}</div>
            <div class="header-text">
                <h1>${app.name}</h1>
                <p>${app.description}</p>
            </div>
        </div>

        ${app.helpDocumentation ? `
        <div class="help-section">
            ${AppsPanel.renderMarkdown(app.helpDocumentation)}
        </div>
        ` : ''}

        <form id="app-form">
            <div class="form-section">
                ${app.inputs.map(input => AppsPanel.renderInputField(input, savedProjects)).join('')}
            </div>

            <button type="submit" class="submit-btn" id="submit-btn">
                ${app.primaryAction}
            </button>
        </form>

        <div class="result-section hidden" id="result-section">
            <div class="result-header">
                <h3>📋 Result</h3>
                <div class="result-actions">
                    <button class="action-btn" id="copy-btn">📋 Copy</button>
                    <button class="action-btn" id="insert-btn">📝 Insert</button>
                    <button class="action-btn" id="save-btn">💾 Save</button>
                </div>
            </div>
            <div class="progress-msg hidden" id="progress-msg">
                <div class="spinner"></div>
                <span id="progress-text">Processing...</span>
            </div>
            <div class="result-content hidden" id="result-content"></div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const appId = '${app.id}';
        let currentResult = '';
        let selectedProjects = ${JSON.stringify(savedProjects.map(p => p.path))};

        // Back button
        document.getElementById('back-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'goBack' });
        });

        // Form submission
        document.getElementById('app-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const inputs = {};
            
            for (const [key, value] of formData.entries()) {
                inputs[key] = value;
            }
            
            // Handle multi-select
            document.querySelectorAll('.checkbox-group').forEach(group => {
                const name = group.dataset.name;
                const checked = Array.from(group.querySelectorAll('input:checked')).map(cb => cb.value);
                inputs[name] = checked.join(',');
            });
            
            // Handle project picker
            if (selectedProjects.length > 0) {
                inputs['projectPaths'] = JSON.stringify(selectedProjects);
            }
            
            // Show loading
            const btn = document.getElementById('submit-btn');
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner"></div> Processing...';
            
            document.getElementById('result-section').classList.remove('hidden');
            document.getElementById('progress-msg').classList.remove('hidden');
            document.getElementById('result-content').classList.add('hidden');
            
            vscode.postMessage({ type: 'executeApp', inputs });
        });

        // Handle messages
        window.addEventListener('message', (event) => {
            const message = event.data;
            
            switch (message.type) {
                case 'progress':
                    document.getElementById('progress-text').textContent = message.message;
                    break;
                    
                case 'result':
                    const submitBtn = document.getElementById('submit-btn');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '${app.primaryAction}';
                    
                    document.getElementById('progress-msg').classList.add('hidden');
                    const content = document.getElementById('result-content');
                    content.classList.remove('hidden', 'error');
                    
                    if (message.result.success) {
                        currentResult = message.result.output.content;
                        
                        // Check if this is Playwright app - auto-create project
                        const isPlaywrightApp = '${app.id}' === 'playwright-generator';
                        const targetFolder = selectedProjects[0];
                        
                        if (isPlaywrightApp && targetFolder) {
                            content.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div><p>Creating project files...</p></div>';
                            
                            const testName = document.querySelector('input[name="testName"]')?.value || 'playwright-test';
                            vscode.postMessage({
                                type: 'extractAndCreateProject',
                                targetFolder: targetFolder,
                                testName: testName,
                                rawContent: currentResult,
                                language: document.querySelector('input[name="language"]:checked')?.value || 'typescript'
                            });
                        } else if (isPlaywrightApp && !targetFolder) {
                            content.innerHTML = '<div style="color:orange;padding:20px;text-align:center;">⚠️ Please select a target folder first!</div>';
                        } else {
                            content.textContent = currentResult;
                        }
                    } else {
                        content.classList.add('error');
                        content.textContent = 'Error: ' + message.result.error;
                    }
                    break;
                    
                case 'projectAdded':
                    if (!selectedProjects.includes(message.project.path)) {
                        selectedProjects.push(message.project.path);
                        updateProjectList();
                    }
                    break;
                    
                case 'filesReceived':
const fieldId = message.fieldId;
if (!attachedFiles[fieldId]) {
    attachedFiles[fieldId] = [];
}
message.files.forEach(f => {
    if (!attachedFiles[fieldId].some(existing => existing.name === f.name)) {
        attachedFiles[fieldId].push(f);
    }
});
updateFileList(fieldId);
break;
                    
                case 'modelsReceived':
const modelFieldId = message.fieldId;
const select = document.getElementById('model-select-' + modelFieldId);
if (select) {
    // Keep auto option, add models
    select.innerHTML = '<option value="auto">🤖 Auto (Best Available)</option>' +
        message.models.map(m =>
            \`<option value="\${m.id}">\${m.vendor} - \${m.name}</option>\`
                            ).join('');
                    }
                    break;
                    
                case 'projectCreated':
                    document.getElementById('result-section').classList.remove('hidden');
                    document.getElementById('progress-msg').classList.add('hidden');
                    document.getElementById('submit-btn').disabled = false;
                    const createdContent = document.getElementById('result-content');
                    createdContent.classList.remove('hidden', 'error');
                    createdContent.innerHTML = \`
                        <div style="text-align: center; padding: 20px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                            <h3 style="margin-bottom: 8px;">Project Created Successfully!</h3>
                            <p style="opacity: 0.7; margin-bottom: 16px;">Location: \${message.path}</p>
                            <p style="font-size: 13px; margin-bottom: 16px;">Files: \${message.files ? message.files.join(', ') : 'package.json, config, test'}</p>
                        </div>
                        <div style="text-align: left; background: var(--vscode-terminal-background, #1e1e1e); border-radius: 8px; padding: 16px; margin-top: 16px;">
                            <p style="font-weight: 600; margin-bottom: 12px; color: var(--vscode-terminal-foreground, #ccc);">📦 Install & Run Commands:</p>
                            <pre style="background: var(--vscode-editor-background); padding: 12px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 13px; line-height: 1.6;"><code># Navigate to project folder
cd "\${message.path}"

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Run the tests
npx playwright test

# View HTML report
npx playwright show-report</code></pre>
                        </div>
                    \`;
                    break;
                    
                case 'projectError':
                    document.getElementById('result-section').classList.remove('hidden');
                    document.getElementById('progress-msg').classList.add('hidden');
                    document.getElementById('submit-btn').disabled = false;
                    const errorContent = document.getElementById('result-content');
                    errorContent.classList.remove('hidden');
                    errorContent.classList.add('error');
                    errorContent.textContent = 'Error creating project: ' + message.error;
                    break;
            }
        });

        // Action buttons
        document.getElementById('copy-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'copyToClipboard', value: currentResult });
        });

        document.getElementById('insert-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'insertAtCursor', value: currentResult });
        });

        document.getElementById('save-btn').addEventListener('click', () => {
            vscode.postMessage({ 
                type: 'saveAsFile', 
                content: currentResult, 
                filename: '${app.id}-output.md'
            });
        });

        // Project management
        document.querySelectorAll('.add-project-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'pickProjectFolder' });
            });
        });

        function removeProject(path) {
            selectedProjects = selectedProjects.filter(p => p !== path);
            updateProjectList();
        }
        window.removeProject = removeProject;

        function updateProjectList() {
            const container = document.querySelector('.project-picker');
            if (!container) return;
            
            const items = selectedProjects.map(path => {
                const name = path.split('/').pop();
                return \`
                    <div class="project-item">
                        <span>📁</span>
                        <div class="name">\${name}</div>
                        <div class="path">\${path}</div>
                        <button type="button" class="remove-btn" onclick="removeProject('\${path}')">✕</button>
                    </div>
                \`;
            }).join('');
            
            container.innerHTML = items + '<button type="button" class="add-project-btn">+ Add Project Folder</button>';
            container.querySelector('.add-project-btn').addEventListener('click', () => {
                vscode.postMessage({ type: 'pickProjectFolder' });
            });
        }

        // File picker handling
        const attachedFiles = {};
        
        document.querySelectorAll('.add-file-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fieldId = btn.dataset.fieldId;
                vscode.postMessage({ type: 'pickFiles', fieldId });
            });
        });

        function removeFile(fieldId, fileName) {
            if (attachedFiles[fieldId]) {
                attachedFiles[fieldId] = attachedFiles[fieldId].filter(f => f.name !== fileName);
                updateFileList(fieldId);
            }
        }
        window.removeFile = removeFile;

        function updateFileList(fieldId) {
            const container = document.getElementById('file-list-' + fieldId);
            const hiddenInput = document.getElementById('files-data-' + fieldId);
            if (!container) return;
            
            const files = attachedFiles[fieldId] || [];
            const fileIcons = { xlsx: '📊', docx: '📄', txt: '📝', md: '📑' };
            
            container.innerHTML = files.map(file => {
                const ext = file.name.split('.').pop().toLowerCase();
                const icon = fileIcons[ext] || '📎';
                return \`
                    <div class="file-item">
                        <span class="file-icon">\${icon}</span>
                        <div class="file-info">
                            <div class="file-name">\${file.name}</div>
                            <div class="file-size">\${file.content.length > 1000 ? (file.content.length / 1024).toFixed(1) + ' KB' : file.content.length + ' bytes'}</div>
                        </div>
                        <button type="button" class="remove-file-btn" onclick="removeFile('\${fieldId}', '\${file.name}')">✕</button>
                    </div>
                \`;
            }).join('');
            
            // Update hidden input with file contents
            hiddenInput.value = JSON.stringify(files);
        }

        // Model picker handling
        document.querySelectorAll('.refresh-models-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fieldId = btn.dataset.fieldId;
                vscode.postMessage({ type: 'getAvailableModels', fieldId });
            });
        });
        
        // Auto-fetch models on load for all model pickers
        document.querySelectorAll('.model-select').forEach(select => {
            const fieldId = select.id.replace('model-select-', '');
            vscode.postMessage({ type: 'getAvailableModels', fieldId });
        });

        // Radio/checkbox handling
        document.querySelectorAll('.radio-option').forEach(option => {
            option.addEventListener('click', () => {
                const group = option.closest('.radio-group');
                group.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                option.querySelector('input').checked = true;
                handleConditionalFields(option.querySelector('input').name, option.querySelector('input').value);
            });
        });

        document.querySelectorAll('.checkbox-option').forEach(option => {
            option.addEventListener('click', () => {
                option.classList.toggle('selected');
                const cb = option.querySelector('input');
                cb.checked = !cb.checked;
            });
        });

        function handleConditionalFields(fieldName, value) {
            document.querySelectorAll('.conditional-field').forEach(field => {
                const showIf = field.dataset.showIf;
                if (showIf) {
                    const [condField, condValue] = showIf.split('=');
                    if (condField === fieldName) {
                        field.classList.toggle('visible', condValue.includes(',') 
                            ? condValue.split(',').includes(value) 
                            : condValue === value);
                    }
                }
            });
        }

        // Initialize conditional fields
        document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
            handleConditionalFields(radio.name, radio.value);
        });
    </script>
</body>
</html>`;
    }

    /**
     * Simple markdown-to-html renderer for help documentation
     */
    private static renderMarkdown(text: string): string {
        return text
            .trim()
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
            .replace(/^\- (.*$)/gim, '<ul><li>$1</li></ul>')
            .replace(/^\d\. (.*$)/gim, '<ul><li>$1</li></ul>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            // Clean up multi-wrapped lists
            .replace(/<\/ul><ul>/g, '');
    }

    /**
     * Render a form input field
     */
    private static renderInputField(input: any, savedProjects: SavedProject[]): string {
        const showIfAttr = input.showIf
            ? `data-show-if="${input.showIf.field}=${Array.isArray(input.showIf.equals) ? input.showIf.equals.join(',') : input.showIf.equals}"`
            : '';
        const conditionalClass = input.showIf ? 'conditional-field' : '';

        switch (input.type) {
            case 'textarea':
            case 'code':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <textarea 
                            name="${input.id}" 
                            placeholder="${input.placeholder || ''}"
                            rows="${input.rows || 5}"
                            ${input.required ? 'required' : ''}
                        >${input.defaultValue || ''}</textarea>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'select':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <select name="${input.id}" ${input.required ? 'required' : ''}>
                            ${(input.options || []).map((opt: any) => `
                                <option value="${opt.value}" ${input.defaultValue === opt.value ? 'selected' : ''}>
                                    ${opt.label}
                                </option>
                            `).join('')}
                        </select>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'radio':
                const defaultRadio = input.defaultValue || (input.options?.[0]?.value);
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <div class="radio-group">
                            ${(input.options || []).map((opt: any) => `
                                <label class="radio-option ${defaultRadio === opt.value ? 'selected' : ''}">
                                    <input type="radio" name="${input.id}" value="${opt.value}" 
                                           ${defaultRadio === opt.value ? 'checked' : ''}>
                                    <div class="option-content">
                                        <div class="option-label">${opt.icon || ''} ${opt.label}</div>
                                        ${opt.description ? `<div class="option-desc">${opt.description}</div>` : ''}
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;


            case 'multi-select':
            case 'checkbox-group':
                const defaults = (input.defaultValue || '').split(',');
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}</label>
                        <div class="checkbox-group" data-name="${input.id}">
                            ${(input.options || []).map((opt: any) => `
                                <label class="checkbox-option ${defaults.includes(opt.value) ? 'selected' : ''}">
                                    <input type="checkbox" name="${input.id}" value="${opt.value}" 
                                           ${defaults.includes(opt.value) ? 'checked' : ''}>
                                    <div class="option-content">
                                        <div class="option-label">${opt.label}</div>
                                        ${opt.description ? `<div class="option-desc">${opt.description}</div>` : ''}
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'project-picker':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <div class="project-picker">
                            ${savedProjects.map(proj => `
                                <div class="project-item">
                                    <span>📁</span>
                                    <div class="name">${proj.name}</div>
                                    <div class="path">${proj.path}</div>
                                    <button type="button" class="remove-btn" onclick="removeProject('${proj.path}')">✕</button>
                                </div>
                            `).join('')}
                            <button type="button" class="add-project-btn">+ Add Project Folder</button>
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'file-picker':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <div class="file-picker-container" data-field-id="${input.id}">
                            <div class="file-list" id="file-list-${input.id}"></div>
                            <button type="button" class="add-file-btn" data-field-id="${input.id}">
                                📎 Attach Files (.xlsx, .docx, .txt, .md)
                            </button>
                            <input type="hidden" name="${input.id}" id="files-data-${input.id}" value="">
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'model-picker':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}</label>
                        <div class="model-picker-container">
                            <select name="${input.id}" id="model-select-${input.id}" class="model-select">
                                <option value="auto">🤖 Auto (Best Available)</option>
                            </select>
                            <button type="button" class="refresh-models-btn" data-field-id="${input.id}">🔄</button>
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'checkbox':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="checkbox-option ${input.defaultValue === 'true' ? 'selected' : ''}" style="display: inline-flex;">
                            <input type="checkbox" name="${input.id}" value="true" 
                                   ${input.defaultValue === 'true' ? 'checked' : ''}>
                            <div class="option-content">
                                <div class="option-label">${input.label}</div>
                            </div>
                        </label>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            default: // text
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <input type="text" 
                               name="${input.id}" 
                               placeholder="${input.placeholder || ''}"
                               value="${input.defaultValue || ''}"
                               ${input.required ? 'required' : ''}>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;
        }
    }
}

/**
 * Generate a nonce for CSP
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
