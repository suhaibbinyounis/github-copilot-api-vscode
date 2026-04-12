// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CopilotApiGateway, ensureCopilotChatReady, getErrorMessage, normalizePrompt } from './CopilotApiGateway';

import { CopilotPanel } from './CopilotPanel';
import { createDesktopShortcut } from './commands/createDesktopShortcut';
import { ExtensionHostProfiler } from './services/ExtensionHostProfiler';
import { PerfMetrics } from './services/PerfMetrics';

let gateway: CopilotApiGateway | undefined;
let gatewayPromise: Promise<CopilotApiGateway> | undefined;

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('GitHub Copilot API Server');
	const extensionHostProfiler = new ExtensionHostProfiler();
	context.subscriptions.push(output);
	context.subscriptions.push(extensionHostProfiler);

	const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusItem.command = 'github-copilot-api-vscode.showServerControls';
	context.subscriptions.push(statusItem);

	// Status Bar & Notifications
	const updateStatusBar = async () => {
		if (!gateway) {
			statusItem.text = '$(circle-slash) Copilot API: OFF';
			statusItem.tooltip = new vscode.MarkdownString(`
**$(circle-slash) Copilot API Gateway**

Server is stopped. Click to start or manage.

*Tip: Enable auto-start in settings for convenience*
			`);
			statusItem.tooltip.isTrusted = true;
			statusItem.backgroundColor = undefined;
			statusItem.show();
			return;
		}

		const status = await gateway.getStatus();
		if (status.running) {
			const rpm = status.stats.requestsPerMinute;
			const latency = status.stats.avgLatencyMs;
			const errorRate = status.stats.errorRate || 0;
			const totalReqs = status.stats.totalRequests;
			const uptimeMs = status.stats.uptimeMs || 0;
			const tunnelActive = status.tunnel?.running ?? false;

			// Format uptime as "Xh Ym" or "Xm Ys"
			const uptimeSec = Math.floor(uptimeMs / 1000);
			const uptimeMin = Math.floor(uptimeSec / 60);
			const uptimeHrs = Math.floor(uptimeMin / 60);
			const uptimeStr = uptimeHrs > 0
				? `${uptimeHrs}h ${uptimeMin % 60}m`
				: uptimeMin > 0
					? `${uptimeMin}m ${uptimeSec % 60}s`
					: `${uptimeSec}s`;

			if (status.activeRequests > 0) {
				statusItem.text = `$(sync~spin) Processing (${status.activeRequests}) | ${rpm} RPM`;
				statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			} else {
				let text = `$(broadcast) Copilot API`;
				if (rpm > 0) {
					text += `  $(graph) ${rpm}`;
				}
				if (latency > 0) {
					text += `  $(pulse) ${latency}ms`;
				}
				if (errorRate >= 5) {
					text += `  $(warning) ${errorRate}%`;
				}
				if (tunnelActive) {
					text += `  $(globe)`;
				}
				statusItem.text = text;
				statusItem.backgroundColor = undefined;
			}

			const protocol = status.isHttps ? 'https' : 'http';
			const displayHost = (status.config.host === '0.0.0.0' && status.networkInfo?.localIPs?.length)
				? status.networkInfo.localIPs[0]
				: status.config.host;
			const url = `${protocol}://${displayHost}:${status.config.port}`;

			statusItem.tooltip = new vscode.MarkdownString(`
**$(broadcast) Copilot API Gateway**

| Metric | Value |
|--------|-------|
| Status | 🟢 Active |
| Default Model | \`${status.config.defaultModel}\` |
| Endpoint | \`${url}\` |
| Uptime | ${uptimeStr} |
| Total Requests | ${totalReqs.toLocaleString()} |
| Requests/min | ${rpm} |
| Avg Latency | ${latency}ms |
| Error Rate | ${errorRate}% |
| Tokens In/Out | ${(status.stats.totalTokensIn || 0).toLocaleString()} / ${(status.stats.totalTokensOut || 0).toLocaleString()} |
| Tunnel | ${tunnelActive ? '🌐 Active' : '—'} |

*Click to open controls*
			`);
			statusItem.tooltip.isTrusted = true;
			statusItem.show();
		} else {
			statusItem.text = '$(circle-slash) Copilot API: OFF';
			statusItem.tooltip = new vscode.MarkdownString(`
**$(circle-slash) Copilot API Gateway**

Server is stopped. Click to start or manage.

*Tip: Enable auto-start in settings for convenience*
			`);
			statusItem.tooltip.isTrusted = true;
			statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
			statusItem.show();
		}
	};

	let wasRunning = false;

	// Lazy Gateway Accessor
	const getGateway = async (): Promise<CopilotApiGateway> => {
		if (gateway) {
			return gateway;
		}

		if (gatewayPromise) {
			return gatewayPromise;
		}


		gatewayPromise = (async () => {
			const gw = new CopilotApiGateway(output, statusItem, context);
			gateway = gw;
			context.subscriptions.push(gw);

			// Hook up listeners
			context.subscriptions.push(gw.onDidChangeStatus(async () => {
				await updateStatusBar();

				// Notifications
				const status = await gw.getStatus();
				if (status.running && !wasRunning) {
					const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
					if (config.get<boolean>('showNotifications', true)) {
						// Show actual LAN IP instead of 0.0.0.0 when bound to all interfaces
						const displayHost = (status.config.host === '0.0.0.0' && status.networkInfo?.localIPs?.length)
							? status.networkInfo.localIPs[0]
							: status.config.host;
						const protocol = status.isHttps ? 'https' : 'http';
						const selection = await vscode.window.showInformationMessage(
							`GitHub Copilot API Server started at ${protocol}://${displayHost}:${status.config.port}`,
							'Open Dashboard'
						);
						if (selection === 'Open Dashboard') {
							void vscode.commands.executeCommand('github-copilot-api-vscode.openDashboard');
						}
					}
				}
				wasRunning = status.running;
			}));

			// Initial status update after creation
			await updateStatusBar();
			return gw;
		})();

		return gatewayPromise;
	};

	// Initialize Provider with lazy accessor
	const provider = new CopilotPanel(context.extensionUri, getGateway);
	context.subscriptions.push(
		provider,
		vscode.window.registerWebviewViewProvider(CopilotPanel.viewType, provider)
	);

	const showServerControls = vscode.commands.registerCommand('github-copilot-api-vscode.showServerControls', async () => {
		const gw = await getGateway(); // Force init
		const status = await gw.getStatus();
		const items: vscode.QuickPickItem[] = [];

		const protocol = status.isHttps ? 'https' : 'http';
		const displayHost = (status.config.host === '0.0.0.0' && status.networkInfo?.localIPs?.length)
			? status.networkInfo.localIPs[0]
			: status.config.host;
		const url = `${protocol}://${displayHost}:${status.config.port}`;

		// Status header
		if (status.running) {
			const uptimeMs = status.stats.uptimeMs || 0;
			const uptimeSec = Math.floor(uptimeMs / 1000);
			const uptimeMin = Math.floor(uptimeSec / 60);
			const uptimeHrs = Math.floor(uptimeMin / 60);
			const uptimeStr = uptimeHrs > 0 ? `${uptimeHrs}h ${uptimeMin % 60}m` : uptimeMin > 0 ? `${uptimeMin}m` : `${uptimeSec}s`;

			items.push({
				label: `$(check) Running — ${status.config.defaultModel}`,
				description: url,
				detail: `⏱ ${uptimeStr}  ·  📊 ${status.stats.totalRequests.toLocaleString()} reqs  ·  ${status.stats.requestsPerMinute} RPM  ·  ${status.stats.avgLatencyMs}ms avg`,
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

		items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

		// Quick actions
		items.push({
			label: '$(clippy) Copy API URL',
			description: url
		});

		items.push({
			label: '$(beaker) Quick Test',
			description: 'Send a test "Hello" request'
		});

		items.push({
			label: '$(symbol-enum) Switch Model',
			description: `Current: ${status.config.defaultModel}`
		});

		items.push({
			label: '$(edit) Edit System Prompt',
			description: 'Open the default system prompt editor'
		});

		// Tunnel
		const tunnelRunning = status.tunnel?.running ?? false;
		items.push({
			label: tunnelRunning ? '$(globe) Tunnel Active' : '$(globe) Start Tunnel',
			description: tunnelRunning ? (status.tunnel?.url ?? 'Connected') : 'Expose API via Cloudflare'
		});

		items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

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
			await gw.stopServer();
		} else if (selection.label.includes('Start Server')) {
			await gw.startServer();
		} else if (selection.label.includes('Restart Server')) {
			await gw.restart();
		} else if (selection.label.includes('Open Full Dashboard')) {
			CopilotPanel.createOrShow(context.extensionUri, getGateway);
		} else if (selection.label.includes('Show Logs')) {
			output.show();
		} else if (selection.label.includes('Copy API URL')) {
			await vscode.env.clipboard.writeText(url);
			void vscode.window.showInformationMessage(`Copied: ${url}`);
		} else if (selection.label.includes('Quick Test')) {
			if (!status.running) {
				void vscode.window.showWarningMessage('Start the server first to run a test.');
				return;
			}
			void vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Testing API...' }, async () => {
				try {
					const http = await import('http');
					const postData = JSON.stringify({ model: status.config.defaultModel, messages: [{ role: 'user', content: 'Say "API is working!" in exactly 3 words.' }], max_tokens: 20 });
					const result = await new Promise<string>((resolve, reject) => {
						const req = http.request({ hostname: status.config.host === '0.0.0.0' ? '127.0.0.1' : status.config.host, port: status.config.port, path: '/v1/chat/completions', method: 'POST', headers: { 'Content-Type': 'application/json', ...(status.config.apiKey ? { 'Authorization': `Bearer ${status.config.apiKey}` } : {}) } }, (res) => {
							let data = '';
							res.on('data', (chunk: string) => data += chunk);
							res.on('end', () => resolve(data));
						});
						req.on('error', reject);
						req.write(postData);
						req.end();
					});
					const parsed = JSON.parse(result);
					const reply = parsed?.choices?.[0]?.message?.content || 'No response';
					void vscode.window.showInformationMessage(`✅ API Test: ${reply}`);
				} catch (e: any) {
					void vscode.window.showErrorMessage(`❌ API Test Failed: ${e.message}`);
				}
			});
		} else if (selection.label.includes('Switch Model')) {
			// Discover ALL available language models from all providers
			const allModels = await vscode.lm.selectChatModels();
			const modelItems = allModels.map(m => ({
				label: m.id === status.config.defaultModel ? `$(check) ${m.id}` : `     ${m.id}`,
				description: m.id === status.config.defaultModel ? `(current) · ${m.vendor}` : m.vendor,
				modelId: m.id
			}));
			const modelSelection = await vscode.window.showQuickPick(modelItems, { placeHolder: 'Select default model', title: 'Switch Default Model' });
			if (modelSelection) {
				const newModel = (modelSelection as any).modelId;
				await gw.setDefaultModel(newModel);
				void vscode.window.showInformationMessage(`Default model set to: ${newModel}`);
			}
		} else if (selection.label.includes('Edit System Prompt')) {
			void vscode.commands.executeCommand('github-copilot-api-vscode.editSystemPrompt');
		} else if (selection.label.includes('Start Tunnel')) {
			const result = await gw.startTunnel();
			if (result.success) {
				void vscode.window.showInformationMessage(`Tunnel active at: ${result.url}`);
			} else {
				void vscode.window.showErrorMessage(result.error || 'Failed to start tunnel');
			}
		} else if (selection.label.includes('Tunnel Active')) {
			const action = await vscode.window.showQuickPick(['Copy Tunnel URL', 'Stop Tunnel'], { placeHolder: 'Tunnel is active' });
			if (action === 'Copy Tunnel URL' && status.tunnel?.url) {
				await vscode.env.clipboard.writeText(status.tunnel.url);
				void vscode.window.showInformationMessage(`Copied: ${status.tunnel.url}`);
			} else if (action === 'Stop Tunnel') {
				await gw.stopTunnel();
				void vscode.window.showInformationMessage('Tunnel stopped.');
			}
		}
	});

	// Initial State for Status Bar (Static "OFF" until loaded)
	statusItem.text = '$(circle-slash) Copilot API: OFF';
	statusItem.show();

	// Auto-Start Logic
	const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
	const enabled = config.get<boolean>('enabled', false);
	const autoStart = config.get<boolean>('autoStart', false);

	output.appendLine(`[DEBUG] Activation. Enabled: ${enabled}, AutoStart: ${autoStart}`);

	if (enabled || autoStart) {
		// If auto-start is requested, initialize immediately
		getGateway().then(gw => {
			return gw.start().catch(error => {
				output.appendLine(`[${new Date().toISOString()}] ERROR Failed to start API server: ${getErrorMessage(error)}`);
				void vscode.window.showErrorMessage(`Failed to start Copilot API server: ${getErrorMessage(error)}`);
			});
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
		return CopilotPanel.createOrShow(context.extensionUri, getGateway);
	});

	const resetPerfMetricsCommand = vscode.commands.registerCommand('github-copilot-api-vscode.perf.resetMetrics', () => {
		PerfMetrics.reset();
		return PerfMetrics.getReport();
	});

	const beginPerfPhaseCommand = vscode.commands.registerCommand('github-copilot-api-vscode.perf.beginPhase', (rawName?: unknown) => {
		const phaseName = typeof rawName === 'string' ? rawName : '';
		return PerfMetrics.beginPhase(phaseName);
	});

	const endPerfPhaseCommand = vscode.commands.registerCommand('github-copilot-api-vscode.perf.endPhase', (rawName?: unknown) => {
		const phaseName = typeof rawName === 'string' ? rawName : '';
		return PerfMetrics.endPhase(phaseName);
	});

	const getPerfMetricsCommand = vscode.commands.registerCommand('github-copilot-api-vscode.perf.getMetrics', () => {
		return PerfMetrics.getReport();
	});

	const validateRequestTrackingCommand = vscode.commands.registerCommand('github-copilot-api-vscode.perf.validateRequestTracking', async (rawIterations?: unknown) => {
		const gw = await getGateway();
		const iterations = typeof rawIterations === 'number' ? rawIterations : 25;
		return gw.validateFastPathRequestTracking(iterations);
	});

	const startCpuProfileCommand = vscode.commands.registerCommand('github-copilot-api-vscode.perf.startCpuProfile', async (rawLabel?: unknown) => {
		const label = typeof rawLabel === 'string' ? rawLabel : '';
		return extensionHostProfiler.start(label);
	});

	const stopCpuProfileCommand = vscode.commands.registerCommand('github-copilot-api-vscode.perf.stopCpuProfile', async (rawOutputPath?: unknown) => {
		const outputPath = typeof rawOutputPath === 'string' ? rawOutputPath : '';
		return extensionHostProfiler.stop(outputPath);
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
				CopilotPanel.createOrShow(context.extensionUri, getGateway);
			} else if (path === '/start') {
				void getGateway().then(gw => gw.startServer().then(() => {
					void vscode.window.showInformationMessage('Copilot API Server started via shortcut');
				}));
			} else if (path === '/stop') {
				// Only stop if gateway exists
				if (gateway) {
					void gateway.stopServer().then(() => {
						void vscode.window.showInformationMessage('Copilot API Server stopped via shortcut');
					});
				}
			} else {
				void vscode.window.showWarningMessage(`Unknown shortcut path: ${path}`);
			}
		}
	}));

	const PROMPT_HEADER = `
# ℹ️ DEFAULT SYSTEM PROMPT
# -------------------------------------------------------------------------------------
# This prompt is valid ONLY when no system instruction is provided by the client tool.
# It acts as a fallback and does NOT permanently override API requests.
#
# EDIT BELOW THIS LINE - SAVE TO APPLY
# -------------------------------------------------------------------------------------

`.trimStart();

	const editSystemPrompt = vscode.commands.registerCommand('github-copilot-api-vscode.editSystemPrompt', async () => {
		const storageUri = context.globalStorageUri;
		try {
			// Ensure storage directory exists
			await vscode.workspace.fs.createDirectory(storageUri);
		} catch { }

		const fileUri = vscode.Uri.joinPath(storageUri, 'system_prompt.md');
		const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
		const currentPrompt = config.get<string>('defaultSystemPrompt', '');

		// Write file with header
		const content = PROMPT_HEADER + (currentPrompt || '');
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));

		const doc = await vscode.workspace.openTextDocument(fileUri);
		await vscode.window.showTextDocument(doc);
	});

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (doc) => {
		if (doc.uri.scheme === 'file' && doc.uri.fsPath.endsWith('system_prompt.md')) {
			// Verify it's our file
			if (doc.uri.fsPath.includes(context.globalStorageUri.fsPath)) {
				const text = doc.getText();
				const separator = '# -------------------------------------------------------------------------------------';
				const lastSeparatorIndex = text.lastIndexOf(separator);

				let newPrompt = text;
				if (lastSeparatorIndex !== -1) {
					// Extract everything after the last separator
					newPrompt = text.substring(lastSeparatorIndex + separator.length).trim();
				} else {
					// Fallback if user deleted header
					newPrompt = text.trim();
				}

				const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
				await config.update('defaultSystemPrompt', newPrompt, vscode.ConfigurationTarget.Global);
				void vscode.window.setStatusBarMessage('$(check) Default system prompt updated', 3000);
			}
		}
	}));


	context.subscriptions.push(
		openChatCommand,
		askChatCommand,
		askSelectionCommand,
		createShortcutCommand,
		openDashboard,
		showServerControls,
		editSystemPrompt,
		resetPerfMetricsCommand,
		beginPerfPhaseCommand,
		endPerfPhaseCommand,
		getPerfMetricsCommand,
		validateRequestTrackingCommand,
		startCpuProfileCommand,
		stopCpuProfileCommand,
	);
}

export function deactivate() {
	// no-op
}
