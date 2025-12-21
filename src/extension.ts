// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CopilotApiGateway, ensureCopilotChatReady, getErrorMessage, normalizePrompt } from './CopilotApiGateway';

import { CopilotPanel } from './CopilotPanel';
import { AppsPanel, AppsHubSidebarProvider } from './AppsPanel';
import { createDesktopShortcut } from './commands/createDesktopShortcut';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('GitHub Copilot API Server');
	context.subscriptions.push(output);

	const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusItem.command = 'github-copilot-api-vscode.showServerControls';
	context.subscriptions.push(statusItem);

	const gateway = new CopilotApiGateway(output, statusItem, context);
	context.subscriptions.push(gateway);

	const provider = new CopilotPanel(context.extensionUri, gateway);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CopilotPanel.viewType, provider)
	);

	// Initialize Apps Hub
	AppsPanel.initialize(context);

	// Register Apps Hub sidebar provider
	const appsHubSidebarProvider = new AppsHubSidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(AppsHubSidebarProvider.viewType, appsHubSidebarProvider)
	);

	// Register Apps Hub command
	context.subscriptions.push(
		vscode.commands.registerCommand('github-copilot-api-vscode.openAppsHub', () => {
			AppsPanel.openAppsHub();
		})
	);

	// Status Bar & Notifications
	const updateStatusBar = async () => {
		const status = await gateway.getStatus();
		if (status.running) {
			const rpm = status.stats.requestsPerMinute;
			const latency = status.stats.avgLatencyMs;
			let text = `$(broadcast) Copilot API: ON`;

			// Add RPM and Latency if there is activity
			if (rpm > 0 || status.activeRequests > 0) {
				text += `  $(graph) ${rpm} RPM`;
			}
			if (latency > 0) {
				text += `  $(pulse) ${latency}ms`;
			}

			if (status.activeRequests > 0) {
				statusItem.text = `$(sync~spin) Processing (${status.activeRequests}) | ${rpm} RPM`;
				statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			} else {
				statusItem.text = text;
				statusItem.backgroundColor = undefined;
			}

			statusItem.tooltip = new vscode.MarkdownString(`
**Copilot API Gateway**
- **Status**: Active
- **Host**: ${status.config.host}:${status.config.port}
- **Requests/min**: ${rpm}
- **Avg Latency**: ${latency}ms
- **Total Requests**: ${status.stats.totalRequests}
			`);
			statusItem.show();
		} else {
			statusItem.text = '$(circle-slash) Copilot API: OFF';
			statusItem.tooltip = 'Copilot API server is stopped. Click to manage.';
			statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
			statusItem.show();
		}
	};

	let wasRunning = false;
	context.subscriptions.push(gateway.onDidChangeStatus(async () => {
		await updateStatusBar();

		// Notifications
		const status = await gateway.getStatus();
		if (status.running && !wasRunning) {
			const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
			if (config.get<boolean>('showNotifications', true)) {
				const selection = await vscode.window.showInformationMessage(
					`GitHub Copilot API Server started at http://${status.config.host}:${status.config.port}`,
					'Open Dashboard'
				);
				if (selection === 'Open Dashboard') {
					void vscode.commands.executeCommand('github-copilot-api-vscode.openDashboard');
				}
			}
		}
		wasRunning = status.running;
	}));

	const showServerControls = vscode.commands.registerCommand('github-copilot-api-vscode.showServerControls', async () => {
		const status = await gateway.getStatus();
		const items: vscode.QuickPickItem[] = [];

		// status header
		if (status.running) {
			items.push({
				label: '$(check) Server is Running',
				description: `http://${status.config.host}:${status.config.port}`,
				detail: `Requests/min: ${status.stats.requestsPerMinute} | Avg Latency: ${status.stats.avgLatencyMs}ms | Errors: ${status.stats.errorRate}%`,
				kind: vscode.QuickPickItemKind.Separator
			});
			items.push({
				label: '$(stop-circle) Stop Server',
				description: 'Stop the API gateway'
			});
			items.push({
				label: '$(refresh) Restart Server',
				description: 'Reload configuration and restart'
			});
		} else {
			items.push({
				label: '$(x) Server is Stopped',
				kind: vscode.QuickPickItemKind.Separator
			});
			items.push({
				label: '$(play-circle) Start Server',
				description: 'Start the API gateway'
			});
		}

		items.push({ label: '', kind: vscode.QuickPickItemKind.Separator }); // Spacer

		items.push({
			label: '$(dashboard) Open Full Dashboard',
			description: 'View detailed charts, logs, and configuration'
		});

		items.push({
			label: '$(output) Show Logs',
			description: 'Open the output channel'
		});

		const selection = await vscode.window.showQuickPick(items, {
			placeHolder: 'Manage Copilot API Gateway',
			title: 'Copilot API Controls'
		});

		if (!selection) {
			return;
		}

		if (selection.label.includes('Stop Server')) {
			await gateway.stopServer();
		} else if (selection.label.includes('Start Server')) {
			await gateway.startServer();
		} else if (selection.label.includes('Restart Server')) {
			await gateway.restart();
		} else if (selection.label.includes('Open Full Dashboard')) {
			CopilotPanel.createOrShow(context.extensionUri, gateway);
		} else if (selection.label.includes('Show Logs')) {
			output.show();
		}
	});

	// Initial State
	void updateStatusBar();

	// Auto-Start Logic
	const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
	const enabled = config.get<boolean>('enabled', false);
	const autoStart = config.get<boolean>('autoStart', false);

	output.appendLine(`[DEBUG] Activation. Enabled: ${enabled}, AutoStart: ${autoStart}`);

	if (enabled || autoStart) {
		void gateway.start().catch(error => {
			output.appendLine(`[${new Date().toISOString()}] ERROR Failed to start API server: ${getErrorMessage(error)}`);
			void vscode.window.showErrorMessage(`Failed to start Copilot API server: ${getErrorMessage(error)}`);
		});
	}

	const openChatCommand = vscode.commands.registerCommand('github-copilot-api-vscode.openCopilotChat', async () => {
		if (!await ensureCopilotChatReady()) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.open');
	});

	const askChatCommand = vscode.commands.registerCommand('github-copilot-api-vscode.askCopilot', async (rawPrompt?: unknown) => {
		if (!await ensureCopilotChatReady()) {
			return;
		}

		const prompt = normalizePrompt(rawPrompt) ?? await vscode.window.showInputBox({
			title: 'Ask GitHub Copilot Chat',
			prompt: 'What do you want to ask Copilot?',
			ignoreFocusOut: true,
		});

		if (!prompt) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: prompt,
			isPartialQuery: false,
		});
	});

	const askSelectionCommand = vscode.commands.registerTextEditorCommand('github-copilot-api-vscode.askSelectionWithCopilot', async (editor, _edit, rawPrompt?: unknown) => {
		if (!await ensureCopilotChatReady()) {
			return;
		}

		const selection = editor.selection;
		if (selection.isEmpty) {
			void vscode.window.showWarningMessage('Select some code before asking Copilot about it.');
			return;
		}

		const prompt = normalizePrompt(rawPrompt) ?? await vscode.window.showInputBox({
			title: 'Ask Copilot About Selection',
			prompt: 'Describe what you want to know about the selected code.',
			value: 'Explain this code.',
			ignoreFocusOut: true,
		});

		if (!prompt) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: prompt,
			isPartialQuery: false,
			attachFiles: [{
				uri: editor.document.uri,
				range: new vscode.Range(selection.start, selection.end),
			}],
			blockOnResponse: false,
		});
	});




	const openDashboard = vscode.commands.registerCommand('github-copilot-api-vscode.openDashboard', () => {
		CopilotPanel.createOrShow(context.extensionUri, gateway);
	});

	const createShortcutCommand = vscode.commands.registerCommand('github-copilot-api-vscode.createDesktopShortcut', async () => {
		await createDesktopShortcut();
	});

	// URI Handler for deep linking
	// Handles vscode://suhaibbinyounis.github-copilot-api-vscode/<path>
	context.subscriptions.push(vscode.window.registerUriHandler({
		handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
			// Path is typically /dashboard, /start, /stop
			const path = uri.path;
			output.appendLine(`[URI Handler] Received URI: ${uri.toString()} (path: ${path})`);

			if (path === '/dashboard') {
				CopilotPanel.createOrShow(context.extensionUri, gateway);
			} else if (path === '/start') {
				void gateway.startServer().then(() => {
					void vscode.window.showInformationMessage('Copilot API Server started via shortcut');
				});
			} else if (path === '/stop') {
				void gateway.stopServer().then(() => {
					void vscode.window.showInformationMessage('Copilot API Server stopped via shortcut');
				});
			} else {
				void vscode.window.showWarningMessage(`Unknown shortcut path: ${path}`);
			}
		}
	}));


	context.subscriptions.push(openChatCommand, askChatCommand, askSelectionCommand, createShortcutCommand, openDashboard);
}

export function deactivate() {
	// no-op
}
