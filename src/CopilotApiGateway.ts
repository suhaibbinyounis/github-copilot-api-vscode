import { randomUUID } from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as vscode from 'vscode';
import type { RawData, WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

const COPILOT_CHAT_EXTENSION_ID = 'GitHub.copilot-chat';
const COPILOT_CHAT_SEARCH_QUERY = '@id:GitHub.copilot-chat';

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly type: string,
		readonly code?: string,
		readonly details?: unknown,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export interface ApiServerConfig {
	enabled: boolean
	enableHttp: boolean
	enableWebSocket: boolean
	host: string
	port: number
	maxConcurrentRequests: number
	defaultModel: string
	apiKey: string
	enableLogging: boolean
	rateLimitPerMinute: number
	defaultSystemPrompt: string
	redactionPatterns: string[] // Regex patterns to redact sensitive data
}

// Request history entry
export interface RequestHistoryEntry {
	id: string
	timestamp: number
	method: string
	path: string
	status: number
	durationMs: number
	requestPayload?: unknown
	responsePayload?: unknown
	tokensIn?: number
	tokensOut?: number
	model?: string
	error?: string
}

// Model aliases for OpenAI compatibility
const MODEL_ALIASES: Record<string, string> = {
	'gpt-4': 'gpt-4o-copilot',
	'gpt-4-turbo': 'gpt-4o-copilot',
	'gpt-4-turbo-preview': 'gpt-4o-copilot',
	'gpt-4o': 'gpt-4o-copilot',
	'gpt-4o-mini': 'gpt-4o-mini-copilot',
	'gpt-3.5-turbo': 'gpt-4o-mini-copilot',
	'gpt-3.5-turbo-16k': 'gpt-4o-mini-copilot',
	'claude-3-opus': 'claude-3.5-sonnet-copilot',
	'claude-3-sonnet': 'claude-3.5-sonnet-copilot',
	'claude-3-haiku': 'claude-3.5-sonnet-copilot',
	'claude-3.5-sonnet': 'claude-3.5-sonnet-copilot',
	'o1': 'o1-copilot',
	'o1-mini': 'o1-mini-copilot',
	'o1-preview': 'o1-copilot',
	'o3-mini': 'o3-mini-copilot'
};

type ChatEndpointContext = {
	source: 'http' | 'websocket'
	endpoint: '/v1/chat/completions' | '/v1/completions'
}

export class CopilotApiGateway implements vscode.Disposable {
	private httpServer: ReturnType<typeof createServer> | undefined;
	private wsServer: WebSocketServer | undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private config: ApiServerConfig = getServerConfig();
	private disposed = false;
	private activeRequests = 0;
	private suppressRestart = false;
	private readonly _onDidChangeStatus = new vscode.EventEmitter<void>();
	public readonly onDidChangeStatus = this._onDidChangeStatus.event;

	// Usage statistics
	private usageStats = {
		totalRequests: 0,
		totalTokensIn: 0,
		totalTokensOut: 0,
		requestsByEndpoint: {} as Record<string, number>,
		startTime: Date.now()
	};

	// Real-time stats with latency tracking
	private realtimeStats = {
		requestsPerMinute: 0,
		avgLatencyMs: 0,
		latencyHistory: [] as { timestamp: number; latency: number }[],
		tokensPerMinute: 0,
		errorRate: 0,
		lastMinuteRequests: [] as number[],
		lastMinuteErrors: 0
	};

	// Request history (stored in memory, persisted to globalState)
	private requestHistory: RequestHistoryEntry[] = [];
	private readonly MAX_HISTORY_SIZE = 100;
	private context?: vscode.ExtensionContext;

	// Rate limiting
	private rateLimitBucket: number[] = [];

	// Request cache for deduplication
	private requestCache = new Map<string, { response: any; timestamp: number }>();
	private readonly CACHE_TTL_MS = 5000; // 5 seconds

	// Stats update interval
	private statsInterval?: ReturnType<typeof setInterval>;

	constructor(private readonly output: vscode.OutputChannel, private readonly statusItem: vscode.StatusBarItem, context?: vscode.ExtensionContext) {
		this.context = context;
		this.loadHistory();
		this.startStatsUpdater();

		const subscription = vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('githubCopilotApi.server')) {
				if (this.suppressRestart) {
					return;
				}
				void this.restart().catch(error => {
					this.logError('Failed to restart API server after configuration change', error);
				});
			}
		});
		this.disposables.push(subscription);
	}

    public get status() {
        return {
            running: !!this.httpServer,
            config: this.config,
            activeRequests: this.activeRequests,
            networkInfo: this.getNetworkInfo(),
            stats: this.getStats(),
            realtimeStats: this.realtimeStats,
            historyCount: this.requestHistory.length
        };
    }

	/**
	 * Get combined usage statistics
	 */
	public getStats() {
		return {
			...this.usageStats,
			uptimeMs: Date.now() - this.usageStats.startTime,
			avgLatencyMs: this.realtimeStats.avgLatencyMs,
			requestsPerMinute: this.realtimeStats.requestsPerMinute,
			errorRate: this.realtimeStats.errorRate
		};
	}

	/**
	 * Get request history (optionally filtered)
	 */
	public getHistory(limit?: number): RequestHistoryEntry[] {
		const entries = [...this.requestHistory].reverse(); // Most recent first
		return limit ? entries.slice(0, limit) : entries;
	}

	/**
	 * Clear request history
	 */
	public clearHistory(): void {
		this.requestHistory = [];
		this.saveHistory();
		this._onDidChangeStatus.fire();
	}

	/**
	 * Load request history from persistent storage
	 */
	private loadHistory(): void {
		if (!this.context) {
			return;
		}
		const saved = this.context.globalState.get<RequestHistoryEntry[]>('requestHistory', []);
		this.requestHistory = saved.slice(-this.MAX_HISTORY_SIZE);
	}

	/**
	 * Save request history to persistent storage
	 */
	private saveHistory(): void {
		if (!this.context) {
			return;
		}
		void this.context.globalState.update('requestHistory', this.requestHistory.slice(-this.MAX_HISTORY_SIZE));
	}

	/**
	 * Add entry to request history
	 */
	private addHistoryEntry(entry: RequestHistoryEntry): void {
		// Apply redaction patterns
		const redactedEntry = this.redactSensitiveData(entry);
		this.requestHistory.push(redactedEntry);

		// Trim to max size
		if (this.requestHistory.length > this.MAX_HISTORY_SIZE) {
			this.requestHistory = this.requestHistory.slice(-this.MAX_HISTORY_SIZE);
		}

		// Save periodically (every 10 entries to avoid too frequent writes)
		if (this.requestHistory.length % 10 === 0) {
			this.saveHistory();
		}

		this._onDidChangeStatus.fire();
	}

	/**
	 * Apply redaction patterns to sensitive data
	 */
	private redactSensitiveData<T>(data: T): T {
		if (!this.config.redactionPatterns.length) {
			return data;
		}

		const redact = (str: string): string => {
			let result = str;
			for (const pattern of this.config.redactionPatterns) {
				try {
					const regex = new RegExp(pattern, 'gi');
					result = result.replace(regex, '[REDACTED]');
				} catch {
					// Invalid regex, skip
				}
			}
			return result;
		};

		const redactObject = (obj: unknown): unknown => {
			if (typeof obj === 'string') {
				return redact(obj);
			}
			if (Array.isArray(obj)) {
				return obj.map(redactObject);
			}
			if (obj && typeof obj === 'object') {
				const result: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(obj)) {
					result[key] = redactObject(value);
				}
				return result;
			}
			return obj;
		};

		return redactObject(data) as T;
	}

	/**
	 * Start the real-time stats updater
	 */
	private startStatsUpdater(): void {
		// Update stats every 5 seconds
		this.statsInterval = setInterval(() => {
			this.updateRealtimeStats();
		}, 5000);
	}

	/**
	 * Update real-time statistics
	 */
	private updateRealtimeStats(): void {
		const now = Date.now();
		const oneMinuteAgo = now - 60000;

		// Clean old latency data
		this.realtimeStats.latencyHistory = this.realtimeStats.latencyHistory.filter(
			entry => entry.timestamp > oneMinuteAgo
		);

		// Clean old request timestamps
		this.realtimeStats.lastMinuteRequests = this.realtimeStats.lastMinuteRequests.filter(
			ts => ts > oneMinuteAgo
		);

		// Calculate requests per minute
		this.realtimeStats.requestsPerMinute = this.realtimeStats.lastMinuteRequests.length;

		// Calculate average latency
		if (this.realtimeStats.latencyHistory.length > 0) {
			const sum = this.realtimeStats.latencyHistory.reduce((acc, entry) => acc + entry.latency, 0);
			this.realtimeStats.avgLatencyMs = Math.round(sum / this.realtimeStats.latencyHistory.length);
		} else {
			this.realtimeStats.avgLatencyMs = 0;
		}

		// Calculate error rate (errors in last minute / requests in last minute)
		if (this.realtimeStats.lastMinuteRequests.length > 0) {
			this.realtimeStats.errorRate = Math.round(
				(this.realtimeStats.lastMinuteErrors / this.realtimeStats.lastMinuteRequests.length) * 100
			);
		} else {
			this.realtimeStats.errorRate = 0;
		}

		// Reset minute error counter periodically
		if (this.realtimeStats.lastMinuteRequests.length === 0) {
			this.realtimeStats.lastMinuteErrors = 0;
		}
	}

	/**
	 * Record a completed request for stats
	 */
	private recordRequestStats(latencyMs: number, tokensIn: number, tokensOut: number, isError: boolean): void {
		const now = Date.now();

		// Update usage stats
		this.usageStats.totalRequests++;
		this.usageStats.totalTokensIn += tokensIn;
		this.usageStats.totalTokensOut += tokensOut;

		// Update real-time stats
		this.realtimeStats.lastMinuteRequests.push(now);
		this.realtimeStats.latencyHistory.push({ timestamp: now, latency: latencyMs });

		if (isError) {
			this.realtimeStats.lastMinuteErrors++;
		}

		// Tokens per minute approximation
		this.realtimeStats.tokensPerMinute = Math.round(
			(this.usageStats.totalTokensIn + this.usageStats.totalTokensOut) /
			Math.max(1, (now - this.usageStats.startTime) / 60000)
		);
	}

	/**
	 * Add a redaction pattern
	 */
	public async addRedactionPattern(pattern: string): Promise<boolean> {
		try {
			// Validate regex
			new RegExp(pattern);
			const patterns = [...this.config.redactionPatterns, pattern];
			const config = vscode.workspace.getConfiguration('githubCopilotApi');
			await config.update('server.redactionPatterns', patterns, vscode.ConfigurationTarget.Global);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Remove a redaction pattern
	 */
	public async removeRedactionPattern(index: number): Promise<void> {
		const patterns = [...this.config.redactionPatterns];
		patterns.splice(index, 1);
		const config = vscode.workspace.getConfiguration('githubCopilotApi');
		await config.update('server.redactionPatterns', patterns, vscode.ConfigurationTarget.Global);
	}

	/**
	 * Get current redaction patterns
	 */
	public getRedactionPatterns(): string[] {
		return [...this.config.redactionPatterns];
	}

    /**
     * Get network information when bound to 0.0.0.0 (all interfaces)
     * Returns hostname and local IP addresses that can be shared with others
     */
    private getNetworkInfo(): { hostname: string; localIPs: string[] } | null {
        if (this.config.host !== '0.0.0.0') {
            return null;
        }

        const hostname = os.hostname();
        const localIPs: string[] = [];
        const interfaces = os.networkInterfaces();

        for (const name of Object.keys(interfaces)) {
            const netInterface = interfaces[name];
            if (!netInterface) {continue;}
            for (const info of netInterface) {
                // Skip internal/loopback and IPv6 addresses for simplicity
                if (!info.internal && info.family === 'IPv4') {
                    localIPs.push(info.address);
                }
            }
        }

        return { hostname, localIPs };
    }

	public async startServer(): Promise<void> {
		await this.updateServerConfig({ enabled: true });
	}

	public async stopServer(): Promise<void> {
		await this.updateServerConfig({ enabled: false });
	}

	public async toggleHttp(): Promise<void> {
		await this.updateServerConfig({ enableHttp: !this.config.enableHttp, enabled: true });
	}

	public async toggleWebSocket(): Promise<void> {
		await this.updateServerConfig({ enableWebSocket: !this.config.enableWebSocket, enabled: true });
	}

	public async toggleLogging(): Promise<void> {
		await this.updateServerConfig({ enableLogging: !this.config.enableLogging });
	}

	public async setApiKey(apiKey: string): Promise<void> {
		const value = (apiKey ?? '').trim();
		await this.updateServerConfig({ apiKey: value });
		if (value) {
			void vscode.window.showInformationMessage(`API key set. Use "Authorization: Bearer ${value}" to authenticate.`);
		} else {
			void vscode.window.showInformationMessage('API key cleared. Server is now open access.');
		}
	}

	public async setRateLimit(limit: number): Promise<void> {
		const normalized = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 60;
		await this.updateServerConfig({ rateLimitPerMinute: normalized });
	}

	public async setHost(host: string): Promise<void> {
		const value = (host ?? '').trim();
		if (!value) {
			return;
		}
		await this.updateServerConfig({ host: value, enabled: true });
	}

	public async setPort(port: number): Promise<void> {
		const normalized = Number.isFinite(port) ? Math.max(1, Math.min(65535, Math.floor(port))) : this.config.port;
		await this.updateServerConfig({ port: normalized, enabled: true });
	}

	public async setDefaultModel(model: string): Promise<void> {
		const value = (model ?? '').trim();
		if (!value) {
			return;
		}
		await this.updateServerConfig({ defaultModel: value, enabled: true });
	}

	async start(): Promise<void> {
		if (this.disposed) {
			return;
		}

		await this.stop();
		this.config = getServerConfig();
		if (!this.config.enabled) {
			this.updateStatusBar('stopped', 'Server disabled in settings');
            this._onDidChangeStatus.fire();
			return;
		}

		this.updateStatusBar('starting');
        this._onDidChangeStatus.fire();

		this.httpServer = createServer((req, res) => {
			const requestStart = Date.now();
			const requestId = randomUUID().slice(0, 8);

			void this.handleHttpRequest(req, res, requestId, requestStart).catch(error => {
				const duration = Date.now() - requestStart;
				if (error instanceof ApiError) {
					this.logRequest(requestId, req.method || 'UNKNOWN', req.url || '/', error.status, duration, {
						error: error.message
					});
					this.sendError(res, error);
				} else {
					this.logRequest(requestId, req.method || 'UNKNOWN', req.url || '/', 500, duration, {
						error: error instanceof Error ? error.message : String(error)
					});
					this.logError('Unhandled error in HTTP request handler', error);
					this.sendError(res, new ApiError(500, 'An unexpected error occurred.', 'server_error'));
				}
			});
		});

		this.httpServer.on('error', error => {
			this.logError('HTTP server error', error);
		});

		this.wsServer = new WebSocketServer({ noServer: true });
		this.wsServer.on('connection', (socket: WebSocket) => this.handleWebSocketConnection(socket));
		this.wsServer.on('error', (error: Error) => {
			this.logError('WebSocket server error', error);
		});

		this.httpServer.on('upgrade', (request, socket, head) => {
			if (!request.url) {
				socket.destroy();
				return;
			}
			const url = this.buildUrl(request.url);
			if (url.pathname === '/v1/realtime' && this.config.enableWebSocket) {
				this.wsServer?.handleUpgrade(request, socket, head, (ws: WebSocket) => {
					this.wsServer?.emit('connection', ws, request);
				});
			} else {
				socket.destroy();
			}
		});

		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				this.httpServer?.off('error', onError);
				reject(error);
			};
			this.httpServer?.once('error', onError);
			this.httpServer?.listen(this.config.port, this.config.host, () => {
				this.httpServer?.off('error', onError);
				resolve();
			});
		});

		const address = this.httpServer.address() as AddressInfo | null;
		if (address) {
			const location = `http://${address.address}:${address.port}`;
			this.logInfo(`HTTP server listening on ${location}`);
			this.updateStatusBar('running', `HTTP${this.config.enableWebSocket ? '+WS' : ''} on ${location}`);
			void vscode.window.showInformationMessage(`Copilot API server listening on ${location}`);
            this._onDidChangeStatus.fire();
		}
	}

	async restart(): Promise<void> {
		if (this.disposed) {
			return;
		}
		this.logInfo('Restarting API server to apply configuration changes...');
		await this.start();
	}

	async stop(): Promise<void> {
		if (this.wsServer) {
			await new Promise<void>(resolve => {
				for (const client of this.wsServer?.clients ?? []) {
					client.close(1001, 'Server shutting down');
				}
				this.wsServer?.close(() => resolve());
			});
		}
		if (this.httpServer) {
			await new Promise<void>((resolve, reject) => {
				this.httpServer?.close(error => {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				});
			});
		}
		this.httpServer = undefined;
		this.wsServer = undefined;
		this.activeRequests = 0;
		this.updateStatusBar('stopped');
        this._onDidChangeStatus.fire();
	}

	dispose(): void {
		this.disposed = true;

		// Stop stats updater
		if (this.statsInterval) {
			clearInterval(this.statsInterval);
			this.statsInterval = undefined;
		}

		// Save history before disposing
		this.saveHistory();

		void this.stop().catch(error => {
			this.logError('Failed to stop API server during dispose', error);
		});
		for (const disposable of this.disposables.splice(0)) {
			disposable.dispose();
		}
        this._onDidChangeStatus.dispose();
	}

	private async handleHttpRequest(req: IncomingMessage, res: ServerResponse, requestId: string, requestStart: number): Promise<void> {
		this.setCorsHeaders(res);
		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		if (!this.config.enableHttp) {
			throw new ApiError(503, 'HTTP API is disabled. Enable it from the Copilot API controls.', 'service_unavailable', 'http_disabled');
		}

		const url = this.buildUrl(req.url);

		// Authentication check (skip for health endpoint)
		if (this.config.apiKey && url.pathname !== '/health') {
			const authHeader = req.headers['authorization'];
			const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
			if (providedKey !== this.config.apiKey) {
				this.logRequest(requestId, req.method || 'UNKNOWN', url.pathname, 401, Date.now() - requestStart);
				throw new ApiError(401, 'Invalid or missing API key. Provide a valid Bearer token.', 'authentication_error', 'invalid_api_key');
			}
		}

		// Rate limiting check
		if (!this.checkRateLimit()) {
			this.logRequest(requestId, req.method || 'UNKNOWN', url.pathname, 429, Date.now() - requestStart);
			throw new ApiError(429, 'Rate limit exceeded. Please try again later.', 'rate_limit_error', 'rate_limit_exceeded');
		}

		// Track request
		this.usageStats.totalRequests++;
		this.usageStats.requestsByEndpoint[url.pathname] = (this.usageStats.requestsByEndpoint[url.pathname] || 0) + 1;

		// Health check
		if (req.method === 'GET' && url.pathname === '/health') {
			this.sendJson(res, 200, { status: 'ok', service: 'github-copilot-api-vscode' });
			return;
		}

		// OpenAPI specification
		if (req.method === 'GET' && url.pathname === '/openapi.json') {
			this.sendJson(res, 200, this.getOpenApiSpec());
			return;
		}

		// Swagger UI documentation
		if (req.method === 'GET' && url.pathname === '/docs') {
			this.sendSwaggerUi(res);
			return;
		}

		// Usage statistics
		if (req.method === 'GET' && url.pathname === '/v1/usage') {
			const uptime = Math.floor((Date.now() - this.usageStats.startTime) / 1000);
			this.sendJson(res, 200, {
				object: 'usage',
				total_requests: this.usageStats.totalRequests,
				total_tokens: {
					input: this.usageStats.totalTokensIn,
					output: this.usageStats.totalTokensOut,
					total: this.usageStats.totalTokensIn + this.usageStats.totalTokensOut
				},
				requests_by_endpoint: this.usageStats.requestsByEndpoint,
				uptime_seconds: uptime,
				active_requests: this.activeRequests
			});
			return;
		}

		// List all models
		if (req.method === 'GET' && url.pathname === '/v1/models') {
			const models = await this.getAvailableModels();
			this.sendJson(res, 200, {
				object: 'list',
				data: models
			});
			return;
		}

		// Get specific model
		const modelMatch = url.pathname.match(/^\/v1\/models\/(.+)$/);
		if (req.method === 'GET' && modelMatch) {
			const modelId = decodeURIComponent(modelMatch[1]);
			const models = await this.getAvailableModels();
			const model = models.find(m => m.id === modelId);
			if (!model) {
				throw new ApiError(404, `Model '${modelId}' not found`, 'not_found', 'model_not_found');
			}
			this.sendJson(res, 200, model);
			return;
		}

		// Chat completions (with optional streaming)
		if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
			const body = await this.readJsonBody(req);
			if (body?.stream === true) {
				await this.processStreamingChatCompletion(body, res, requestId, requestStart);
			} else {
				const response = await this.processChatCompletion(body, { source: 'http', endpoint: '/v1/chat/completions' }) as any;
				this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
					requestPayload: body,
					responsePayload: response,
					tokensIn: response?.usage?.prompt_tokens,
					tokensOut: response?.usage?.completion_tokens,
					model: body?.model
				});
				this.sendJson(res, 200, response);
			}
			return;
		}

		// Text completions
		if (req.method === 'POST' && url.pathname === '/v1/completions') {
			const body = await this.readJsonBody(req);
			const response = await this.processCompletion(body) as any;
			this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
				requestPayload: body,
				responsePayload: response,
				tokensIn: response?.usage?.prompt_tokens,
				tokensOut: response?.usage?.completion_tokens,
				model: body?.model
			});
			this.sendJson(res, 200, response);
			return;
		}

		// Token counting
		if (req.method === 'POST' && url.pathname === '/v1/tokenize') {
			const body = await this.readJsonBody(req);
			const response = await this.processTokenize(body);
			this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
				requestPayload: body,
				responsePayload: response,
				model: body?.model
			});
			this.sendJson(res, 200, response);
			return;
		}

		// Count tokens (alternative endpoint)
		if (req.method === 'POST' && url.pathname === '/v1/count_tokens') {
			const body = await this.readJsonBody(req);
			const response = await this.processTokenize(body);
			this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
				requestPayload: body,
				responsePayload: response,
				model: body?.model
			});
			this.sendJson(res, 200, response);
			return;
		}

		// Responses API (new OpenAI format)
		if (req.method === 'POST' && url.pathname === '/v1/responses') {
			const body = await this.readJsonBody(req);
			const response = await this.processResponsesApi(body);
			this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
				requestPayload: body,
				responsePayload: response,
				model: body?.model
			});
			this.sendJson(res, 200, response);
			return;
		}

		// Embeddings (not supported)
		if (req.method === 'POST' && url.pathname === '/v1/embeddings') {
			throw new ApiError(501, 'Embeddings are not supported by Copilot.', 'not_implemented', 'embeddings_not_supported');
		}

		// Images (not supported)
		if (url.pathname.startsWith('/v1/images')) {
			throw new ApiError(501, 'Image generation is not supported by Copilot.', 'not_implemented', 'images_not_supported');
		}

		// Audio (not supported)
		if (url.pathname.startsWith('/v1/audio')) {
			throw new ApiError(501, 'Audio processing is not supported by Copilot.', 'not_implemented', 'audio_not_supported');
		}

		throw new ApiError(404, `No route for ${req.method ?? 'UNKNOWN'} ${url.pathname}`, 'not_found');
	}

	private async getAvailableModels(): Promise<Array<Record<string, unknown>>> {
		const now = Math.floor(Date.now() / 1000);
		const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });

		const modelData = copilotModels.map(model => ({
			id: model.id,
			object: 'model',
			created: now,
			owned_by: model.vendor || 'github-copilot',
			name: model.name,
			family: model.family,
			version: model.version,
			max_input_tokens: model.maxInputTokens,
			capabilities: {
				chat_completion: true,
				text_completion: true,
				streaming: true,
				token_counting: true
			}
		}));

		// If no models found, return configured default
		if (modelData.length === 0) {
			modelData.push({
				id: this.config.defaultModel,
				object: 'model',
				created: now,
				owned_by: 'github-copilot',
				name: this.config.defaultModel,
				family: 'gpt-4o',
				version: '1',
				max_input_tokens: 128000,
				capabilities: {
					chat_completion: true,
					text_completion: true,
					streaming: true,
					token_counting: true
				}
			});
		}

		return modelData;
	}

	private async processStreamingChatCompletion(payload: any, res: ServerResponse, logRequestId?: string, logRequestStart?: number): Promise<void> {
		const messages = this.normalizeChatMessages(payload);
		const model = this.resolveModel(payload?.model);
		const tools = this.normalizeTools(payload?.tools || payload?.functions);
		const toolChoice = payload?.tool_choice || payload?.function_call;
		const requestId = `chatcmpl-${randomUUID()}`;
		const created = Math.floor(Date.now() / 1000);
		let totalContent = '';

		// Set SSE headers
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*'
		});

		try {
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (!copilotModels || copilotModels.length === 0) {
				throw new ApiError(503, 'No Copilot language model available.', 'service_unavailable', 'copilot_unavailable');
			}

			const lmModel = copilotModels[0];

			// Convert messages to VS Code format
			const lmMessages: vscode.LanguageModelChatMessage[] = [];
			for (const msg of messages) {
				const content = typeof msg.content === 'string'
					? msg.content
					: JSON.stringify(msg.content);

				switch (msg.role) {
					case 'system':
						lmMessages.push(vscode.LanguageModelChatMessage.User(`[System]: ${content}`));
						break;
					case 'user':
						lmMessages.push(vscode.LanguageModelChatMessage.User(content));
						break;
					case 'assistant':
						if (msg.tool_calls && msg.tool_calls.length > 0) {
							const toolCallInfo = msg.tool_calls.map((tc: any) =>
								`[Called function: ${tc.function?.name || tc.name}(${tc.function?.arguments || JSON.stringify(tc.arguments)})]`
							).join('\n');
							lmMessages.push(vscode.LanguageModelChatMessage.Assistant(toolCallInfo));
						} else {
							lmMessages.push(vscode.LanguageModelChatMessage.Assistant(content));
						}
						break;
					case 'tool':
						const toolResultContent = `[Tool result for ${msg.tool_call_id || 'unknown'}]: ${content}`;
						lmMessages.push(vscode.LanguageModelChatMessage.User(toolResultContent));
						break;
					default:
						lmMessages.push(vscode.LanguageModelChatMessage.User(content));
				}
			}

			// Build request options with tools
			const options: vscode.LanguageModelChatRequestOptions = {};
			if (tools && tools.length > 0) {
				options.tools = tools;
				if (toolChoice === 'required' || toolChoice === 'any') {
					options.toolMode = vscode.LanguageModelChatToolMode.Required;
				} else {
					options.toolMode = vscode.LanguageModelChatToolMode.Auto;
				}
			}

			const response = await lmModel.sendRequest(lmMessages, options, new vscode.CancellationTokenSource().token);

			// Track tool calls during streaming
			const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
			let toolCallIndex = 0;

			// Stream using the response.stream to handle both text and tool calls
			for await (const part of response.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					totalContent += part.value;
					const chunk = {
						id: requestId,
						object: 'chat.completion.chunk',
						created,
						model,
						choices: [{
							index: 0,
							delta: { content: part.value },
							finish_reason: null
						}]
					};
					res.write(`data: ${JSON.stringify(chunk)}\n\n`);
				} else if (part instanceof vscode.LanguageModelToolCallPart) {
					// Stream tool call in OpenAI format
					const toolCallId = `call_${randomUUID().slice(0, 24)}`;
					const args = typeof part.input === 'string' ? part.input : JSON.stringify(part.input);

					toolCalls.push({
						id: toolCallId,
						name: part.name,
						arguments: args
					});

					// Send tool call chunk
					const toolCallChunk = {
						id: requestId,
						object: 'chat.completion.chunk',
						created,
						model,
						choices: [{
							index: 0,
							delta: {
								tool_calls: [{
									index: toolCallIndex,
									id: toolCallId,
									type: 'function',
									function: {
										name: part.name,
										arguments: args
									}
								}]
							},
							finish_reason: null
						}]
					};
					res.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`);
					toolCallIndex++;
				}
			}

			// Send final chunk with appropriate finish_reason
			const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
			const finalChunk = {
				id: requestId,
				object: 'chat.completion.chunk',
				created,
				model,
				choices: [{
					index: 0,
					delta: {},
					finish_reason: finishReason
				}]
			};
			res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
			res.write('data: [DONE]\n\n');
			res.end();

			// Log the streaming request
			if (logRequestId && logRequestStart) {
				this.logRequest(logRequestId, 'POST', '/v1/chat/completions', 200, Date.now() - logRequestStart, {
					requestPayload: payload,
					responsePayload: { streamed: true, content_preview: totalContent.slice(0, 500), tool_calls: toolCalls },
					model: payload?.model
				});
			}
		} catch (error) {
			const errorChunk = {
				error: {
					message: error instanceof Error ? error.message : 'Unknown error',
					type: 'server_error'
				}
			};
			res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
			res.end();

			// Log error for streaming request
			if (logRequestId && logRequestStart) {
				this.logRequest(logRequestId, 'POST', '/v1/chat/completions', 500, Date.now() - logRequestStart, {
					requestPayload: payload,
					error: error instanceof Error ? error.message : String(error),
					model: payload?.model
				});
			}
		}
	}

	private async processTokenize(payload: any): Promise<Record<string, unknown>> {
		const text = payload?.text || payload?.input || '';
		const model = this.resolveModel(payload?.model);

		const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
		if (!copilotModels || copilotModels.length === 0) {
			throw new ApiError(503, 'No Copilot language model available.', 'service_unavailable', 'copilot_unavailable');
		}

		const lmModel = copilotModels[0];
		const tokenCount = await lmModel.countTokens(text);

		return {
			object: 'token_count',
			model,
			token_count: tokenCount,
			text_length: text.length
		};
	}

	private async processResponsesApi(payload: any): Promise<Record<string, unknown>> {
		// OpenAI Responses API format - convert to chat completion
		const input = payload?.input;
		let messages: Array<{ role: string; content: string }> = [];

		if (typeof input === 'string') {
			messages = [{ role: 'user', content: input }];
		} else if (Array.isArray(input)) {
			messages = input.map((item: any) => {
				if (typeof item === 'string') {
					return { role: 'user', content: item };
				}
				return {
					role: item.role || 'user',
					content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content)
				};
			});
		}

		const prompt = this.composePrompt(messages);
		const model = this.resolveModel(payload?.model);
		const text = await this.runWithConcurrency(() => this.invokeCopilot(prompt));

		return {
			id: `resp-${randomUUID()}`,
			object: 'response',
			created_at: Math.floor(Date.now() / 1000),
			model,
			output: [
				{
					type: 'message',
					id: `msg-${randomUUID()}`,
					role: 'assistant',
					content: [
						{
							type: 'output_text',
							text
						}
					]
				}
			],
			usage: {
				input_tokens: 0,
				output_tokens: 0,
				total_tokens: 0
			}
		};
	}

	private async processChatCompletion(payload: any, context: ChatEndpointContext): Promise<Record<string, unknown>> {
		let messages = this.normalizeChatMessages(payload);
		messages = this.injectSystemPrompt(messages);

		const model = this.resolveModel(payload?.model);
		const tools = this.normalizeTools(payload?.tools || payload?.functions);
		const toolChoice = payload?.tool_choice || payload?.function_call;
		const responseFormat = payload?.response_format;

		// Handle JSON mode by injecting instruction
		if (responseFormat?.type === 'json_object') {
			const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
			if (lastUserIdx >= 0) {
				const originalContent = messages[lastUserIdx].content;
				messages[lastUserIdx] = {
					...messages[lastUserIdx],
					content: `${originalContent}\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no explanation, just pure JSON.`
				};
			}
		}

		const result = await this.runWithConcurrency(() =>
			this.invokeCopilotWithTools(messages, tools, toolChoice)
		);

		const created = Math.floor(Date.now() / 1000);

		// Check if model requested tool calls
		if (result.toolCalls && result.toolCalls.length > 0) {
			return {
				id: `chatcmpl-${randomUUID()}`,
				object: 'chat.completion',
				created,
				model,
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							content: result.content || null,
							tool_calls: result.toolCalls.map((tc: any, idx: number) => ({
								id: `call_${randomUUID().slice(0, 24)}`,
								type: 'function',
								function: {
									name: tc.name,
									arguments: typeof tc.arguments === 'string'
										? tc.arguments
										: JSON.stringify(tc.arguments)
								}
							}))
						},
						finish_reason: 'tool_calls'
					}
				],
				usage: {
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0
				},
				system_fingerprint: null
			};
		}

		// Normal text response
		return {
			id: `chatcmpl-${randomUUID()}`,
			object: 'chat.completion',
			created,
			model,
			choices: [
				{
					index: 0,
					message: {
						role: 'assistant',
						content: result.content,
					},
					finish_reason: 'stop'
				}
			],
			usage: {
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0
			},
			system_fingerprint: null
		};
	}

	private normalizeTools(tools: any): vscode.LanguageModelChatTool[] | undefined {
		if (!tools || !Array.isArray(tools) || tools.length === 0) {
			return undefined;
		}

		return tools.map((tool: any) => {
			// Handle OpenAI format: { type: 'function', function: { name, description, parameters } }
			const fn = tool.type === 'function' ? tool.function : tool;

			return {
				name: fn.name,
				description: fn.description || '',
				inputSchema: fn.parameters || fn.inputSchema || undefined
			} as vscode.LanguageModelChatTool;
		});
	}

	private async invokeCopilotWithTools(
		chatMessages: Array<{ role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string }>,
		tools?: vscode.LanguageModelChatTool[],
		toolChoice?: any
	): Promise<{ content: string; toolCalls?: Array<{ name: string; arguments: any }> }> {
		const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });

		if (!copilotModels || copilotModels.length === 0) {
			throw new ApiError(503, 'No Copilot language model available.', 'service_unavailable', 'copilot_unavailable');
		}

		const model = copilotModels[0];

		// Convert messages to VS Code format
		const lmMessages: vscode.LanguageModelChatMessage[] = [];

		for (const msg of chatMessages) {
			const content = typeof msg.content === 'string'
				? msg.content
				: JSON.stringify(msg.content);

			switch (msg.role) {
				case 'system':
					lmMessages.push(vscode.LanguageModelChatMessage.User(`[System]: ${content}`));
					break;
				case 'user':
					lmMessages.push(vscode.LanguageModelChatMessage.User(content));
					break;
				case 'assistant':
					if (msg.tool_calls && msg.tool_calls.length > 0) {
						// Assistant message with tool calls - include tool call info
						const toolCallInfo = msg.tool_calls.map((tc: any) =>
							`[Called function: ${tc.function?.name || tc.name}(${tc.function?.arguments || JSON.stringify(tc.arguments)})]`
						).join('\n');
						lmMessages.push(vscode.LanguageModelChatMessage.Assistant(toolCallInfo));
					} else {
						lmMessages.push(vscode.LanguageModelChatMessage.Assistant(content));
					}
					break;
				case 'tool':
					// Tool result message
					const toolResultContent = `[Tool result for ${msg.tool_call_id || 'unknown'}]: ${content}`;
					lmMessages.push(vscode.LanguageModelChatMessage.User(toolResultContent));
					break;
				default:
					lmMessages.push(vscode.LanguageModelChatMessage.User(content));
			}
		}

		// Build request options
		const options: vscode.LanguageModelChatRequestOptions = {};

		if (tools && tools.length > 0) {
			options.tools = tools;

			// Set tool mode based on tool_choice
			if (toolChoice === 'required' || toolChoice === 'any') {
				options.toolMode = vscode.LanguageModelChatToolMode.Required;
			} else {
				options.toolMode = vscode.LanguageModelChatToolMode.Auto;
			}
		}

		try {
			const response = await model.sendRequest(lmMessages, options, new vscode.CancellationTokenSource().token);

			let textContent = '';
			const toolCalls: Array<{ name: string; arguments: any }> = [];

			// Process the response stream
			for await (const part of response.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					textContent += part.value;
				} else if (part instanceof vscode.LanguageModelToolCallPart) {
					toolCalls.push({
						name: part.name,
						arguments: part.input
					});
				}
			}

			return {
				content: textContent.trim(),
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined
			};
		} catch (error) {
			if (error instanceof ApiError) {
				throw error;
			}
			throw new ApiError(502, `Failed to retrieve Copilot response: ${getErrorMessage(error)}`, 'bad_gateway', 'command_failed', { cause: error });
		}
	}

	private async processCompletion(payload: any): Promise<Record<string, unknown>> {
		const prompt = this.normalizePromptInput(payload?.prompt);
		if (!prompt) {
			throw new ApiError(400, 'prompt is required', 'invalid_request_error', 'missing_prompt');
		}

		const model = this.resolveModel(payload?.model);
		const text = await this.runWithConcurrency(() => this.invokeCopilot(prompt));
		const created = Math.floor(Date.now() / 1000);
		return {
			id: `cmpl-${randomUUID()}`,
			object: 'text_completion',
			created,
			model,
			choices: [
				{
					index: 0,
					text,
					finish_reason: 'stop',
					logprobs: null
				}
			],
			usage: {
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0
			}
		};
	}

	private async handleWebSocketMessage(socket: WebSocket, raw: RawData): Promise<void> {
		const text = typeof raw === 'string' ? raw : raw.toString('utf8');
		let payload: any;
		try {
			payload = JSON.parse(text);
		} catch (error) {
			throw new ApiError(400, 'WebSocket payload must be valid JSON.', 'invalid_request_error', 'invalid_json');
		}

		const type: string | undefined = payload?.type ?? payload?.event ?? payload?.action;
		if (type === 'ping') {
			socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
			return;
		}

		if (!type || type === 'chat.completions.create') {
			const body = payload?.data ?? payload?.request ?? payload;
			const response = await this.processChatCompletion(body, { source: 'websocket', endpoint: '/v1/chat/completions' });
			socket.send(JSON.stringify({ type: 'chat.completion.result', data: response }));
			return;
		}

		if (type === 'completions.create') {
			const body = payload?.data ?? payload?.request ?? payload;
			const response = await this.processCompletion(body);
			socket.send(JSON.stringify({ type: 'completion.result', data: response }));
			return;
		}

		throw new ApiError(400, `Unsupported message type: ${type}`, 'invalid_request_error', 'unsupported_ws_message');
	}

	private handleWebSocketConnection(socket: WebSocket): void {
		socket.send(JSON.stringify({
			type: 'session.created',
			session: {
				id: randomUUID(),
				model: this.config.defaultModel,
				created: Math.floor(Date.now() / 1000)
			}
		}));

		socket.on('message', (data: RawData) => {
			void this.handleWebSocketMessage(socket, data).catch(error => {
				if (error instanceof ApiError) {
					this.sendWsError(socket, error);
				} else {
					this.logError('Unhandled WebSocket error', error);
					this.sendWsError(socket, new ApiError(500, 'An unexpected error occurred.', 'server_error'));
				}
			});
		});

		socket.on('error', (error: Error) => {
			this.logError('WebSocket client error', error);
		});
	}

	private async runWithConcurrency<T>(task: () => Promise<T>): Promise<T> {
		if (this.activeRequests >= this.config.maxConcurrentRequests) {
			throw new ApiError(429, 'Too many concurrent requests. Try again shortly.', 'rate_limit_exceeded', 'concurrency_limit');
		}
		this.activeRequests += 1;
		try {
			return await task();
		} finally {
			this.activeRequests -= 1;
		}
	}

	private async invokeCopilot(prompt: string): Promise<string> {
		// Use the VS Code Language Model API to invoke Copilot programmatically
		// This does NOT open the chat window
		const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });

		if (!models || models.length === 0) {
			throw new ApiError(503, 'No Copilot language model available. Make sure GitHub Copilot is installed and signed in.', 'service_unavailable', 'copilot_unavailable');
		}

		const model = models[0];
		const messages = [vscode.LanguageModelChatMessage.User(prompt)];

		try {
			const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

			// Collect all text fragments from the response stream
			let text = '';
			for await (const fragment of response.text) {
				text += fragment;
			}

			if (!text.trim()) {
				throw new ApiError(502, 'Copilot did not return any content.', 'bad_gateway', 'empty_response');
			}

			return text.trim();
		} catch (error) {
			if (error instanceof ApiError) {
				throw error;
			}
			throw new ApiError(502, `Failed to retrieve Copilot response: ${getErrorMessage(error)}`, 'bad_gateway', 'command_failed', { cause: error });
		}
	}

	private extractTextFromChatResult(result: unknown): string | undefined {
		if (!result) {
			return undefined;
		}
		if (typeof result === 'string') {
			return result.trim() || undefined;
		}
		if (Array.isArray(result)) {
			return result.map(part => typeof part === 'string' ? part : '').join(' ').trim() || undefined;
		}
		if (typeof result === 'object') {
			const candidate = result as Record<string, unknown>;
			const response = candidate.response ?? candidate.result ?? candidate.body;
			if (typeof response === 'string') {
				return response.trim() || undefined;
			}
			if (response && typeof response === 'object') {
				const maybeText = (response as Record<string, unknown>).text ?? (response as Record<string, unknown>).message;
				if (typeof maybeText === 'string' && maybeText.trim()) {
					return maybeText.trim();
				}
				const parts = (response as Record<string, unknown>).responseContent;
				if (Array.isArray(parts)) {
					const joined = parts.map(part => {
						if (typeof part === 'string') {
							return part;
						}
						if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
							return String((part as Record<string, unknown>).text);
						}
						return '';
					}).join('').trim();
					if (joined) {
						return joined;
					}
				}
			}
			if (Array.isArray(candidate.choices) && candidate.choices.length > 0) {
				const first = candidate.choices[0] as Record<string, unknown>;
				if (typeof first?.text === 'string' && first.text.trim()) {
					return (first.text as string).trim();
				}
				const message = first?.message as Record<string, unknown> | undefined;
				if (message && typeof message.content === 'string' && message.content.trim()) {
					return (message.content as string).trim();
				}
			}
		}
		return undefined;
	}

	private normalizeChatMessages(payload: any): Array<{ role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string }> {
		const messages = payload?.messages;
		if (Array.isArray(messages) && messages.length > 0) {
			return messages.map((message, index) => {
				const role = typeof message?.role === 'string' ? message.role : index === messages.length - 1 ? 'user' : 'system';
				return {
					role,
					content: message?.content,
					tool_calls: message?.tool_calls,
					tool_call_id: message?.tool_call_id
				};
			});
		}

		const prompt = this.normalizePromptInput(payload?.prompt ?? payload?.input);
		if (prompt) {
			return [{ role: 'user', content: prompt }];
		}

		throw new ApiError(400, 'messages must be a non-empty array or prompt must be provided.', 'invalid_request_error', 'missing_messages');
	}

	private normalizePromptInput(value: unknown): string | undefined {
		if (typeof value === 'string') {
			return value.trim() || undefined;
		}
		if (Array.isArray(value)) {
			const joined = value.map(part => typeof part === 'string' ? part : '').join('\n');
			return joined.trim() || undefined;
		}
		return undefined;
	}

	private composePrompt(messages: Array<{ role: string; content: unknown }>): string {
		return messages.map(({ role, content }) => {
			const cleanedRole = role || 'user';
			const text = this.flattenMessageContent(content);
			return `[${cleanedRole}]\n${text}`;
		}).join('\n\n');
	}

	private flattenMessageContent(content: unknown): string {
		if (typeof content === 'string') {
			return content;
		}
		if (content === undefined || content === null) {
			return '';
		}
		if (Array.isArray(content)) {
			return content.map(part => {
				if (typeof part === 'string') {
					return part;
				}
				if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
					return String((part as Record<string, unknown>).text);
				}
				return '';
			}).join('\n');
		}
		return String(content);
	}

	private resolveModel(model: unknown): string {
		if (typeof model === 'string' && model.trim()) {
			const requestedModel = model.trim().toLowerCase();
			// Check for alias first
			const aliasedModel = MODEL_ALIASES[requestedModel];
			if (aliasedModel) {
				return aliasedModel;
			}
			return model.trim();
		}
		return this.config.defaultModel;
	}

	private injectSystemPrompt(messages: Array<{ role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string }>): Array<{ role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string }> {
		if (!this.config.defaultSystemPrompt) {
			return messages;
		}
		// Check if there's already a system message
		const hasSystem = messages.some(m => m.role === 'system');
		if (hasSystem) {
			return messages;
		}
		// Inject default system prompt at the beginning
		return [{ role: 'system', content: this.config.defaultSystemPrompt }, ...messages];
	}

	private async readJsonBody(req: IncomingMessage): Promise<any> {
		const chunks: Buffer[] = [];
		await new Promise<void>((resolve, reject) => {
			req.on('data', chunk => {
				chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
			});
			req.on('end', () => resolve());
			req.on('error', error => reject(error));
		});
		if (chunks.length === 0) {
			return {};
		}
		const raw = Buffer.concat(chunks).toString('utf8');
		if (!raw.trim()) {
			return {};
		}
		try {
			return JSON.parse(raw);
		} catch (error) {
			throw new ApiError(400, 'Request body must be valid JSON.', 'invalid_request_error', 'invalid_json', { cause: error });
		}
	}

	private sendJson(res: ServerResponse, status: number, body: unknown): void {
		if (!res.headersSent) {
			res.statusCode = status;
			res.setHeader('Content-Type', 'application/json');
		}
		res.end(JSON.stringify(body));
	}

	private sendSwaggerUi(res: ServerResponse): void {
		const url = `http://${this.config.host}:${this.config.port}`;
		const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot API - Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>
        body { margin: 0; background: #fafafa; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info { margin: 30px 0; }
        .swagger-ui .info .title { font-size: 2em; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        window.onload = function() {
            SwaggerUIBundle({
                url: '${url}/openapi.json',
                dom_id: '#swagger-ui',
                presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
                layout: 'BaseLayout',
                deepLinking: true,
                showExtensions: true,
                showCommonExtensions: true
            });
        };
    </script>
</body>
</html>`;
		res.statusCode = 200;
		res.setHeader('Content-Type', 'text/html');
		res.end(html);
	}

	private getOpenApiSpec(): object {
		const url = `http://${this.config.host}:${this.config.port}`;
		return {
			openapi: '3.1.0',
			info: {
				title: 'Copilot API Gateway',
				description: 'Local OpenAI-compatible API server powered by GitHub Copilot. Provides REST and WebSocket endpoints for chat completions, text completions, tokenization, and more.',
				version: '1.0.0',
				contact: {
					name: 'GitHub Copilot API VS Code Extension'
				},
				license: {
					name: 'MIT'
				}
			},
			servers: [{ url, description: 'Local Copilot API Server' }],
			tags: [
				{ name: 'Chat', description: 'Chat completion endpoints' },
				{ name: 'Completions', description: 'Text completion endpoints' },
				{ name: 'Models', description: 'Model information' },
				{ name: 'Utilities', description: 'Utility endpoints' }
			],
			paths: {
				'/v1/chat/completions': {
					post: {
						tags: ['Chat'],
						summary: 'Create chat completion',
						description: 'Creates a chat completion for the given messages. Supports streaming, function calling (tools), JSON mode, and more.',
						operationId: 'createChatCompletion',
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ChatCompletionRequest' },
									examples: {
										basic: {
											summary: 'Basic chat',
											value: {
												model: this.config.defaultModel,
												messages: [{ role: 'user', content: 'Hello!' }]
											}
										},
										streaming: {
											summary: 'Streaming response',
											value: {
												model: this.config.defaultModel,
												messages: [{ role: 'user', content: 'Tell me a story' }],
												stream: true
											}
										},
										tools: {
											summary: 'With tools/functions',
											value: {
												model: this.config.defaultModel,
												messages: [{ role: 'user', content: 'What is the weather?' }],
												tools: [{
													type: 'function',
													function: {
														name: 'get_weather',
														description: 'Get weather for a location',
														parameters: {
															type: 'object',
															properties: { location: { type: 'string' } },
															required: ['location']
														}
													}
												}]
											}
										}
									}
								}
							}
						},
						responses: {
							'200': {
								description: 'Successful response',
								content: {
									'application/json': {
										schema: { $ref: '#/components/schemas/ChatCompletionResponse' }
									},
									'text/event-stream': {
										description: 'Server-sent events for streaming responses'
									}
								}
							},
							'400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
							'401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
							'429': { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/v1/completions': {
					post: {
						tags: ['Completions'],
						summary: 'Create text completion',
						description: 'Creates a text completion for the given prompt.',
						operationId: 'createCompletion',
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/CompletionRequest' },
									example: {
										model: this.config.defaultModel,
										prompt: 'Once upon a time',
										max_tokens: 100
									}
								}
							}
						},
						responses: {
							'200': {
								description: 'Successful response',
								content: { 'application/json': { schema: { $ref: '#/components/schemas/CompletionResponse' } } }
							},
							'400': { description: 'Bad request' },
							'401': { description: 'Unauthorized' }
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/v1/responses': {
					post: {
						tags: ['Chat'],
						summary: 'Create response (simplified API)',
						description: 'Simplified OpenAI Responses API format for easier integration.',
						operationId: 'createResponse',
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ResponsesRequest' },
									example: {
										model: this.config.defaultModel,
										input: 'What is 2+2?'
									}
								}
							}
						},
						responses: {
							'200': {
								description: 'Successful response',
								content: { 'application/json': { schema: { $ref: '#/components/schemas/ResponsesResponse' } } }
							}
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/v1/models': {
					get: {
						tags: ['Models'],
						summary: 'List models',
						description: 'Lists all available models from GitHub Copilot.',
						operationId: 'listModels',
						responses: {
							'200': {
								description: 'List of models',
								content: { 'application/json': { schema: { $ref: '#/components/schemas/ModelList' } } }
							}
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/v1/models/{model_id}': {
					get: {
						tags: ['Models'],
						summary: 'Get model',
						description: 'Retrieves details about a specific model.',
						operationId: 'getModel',
						parameters: [{
							name: 'model_id',
							in: 'path',
							required: true,
							schema: { type: 'string' },
							description: 'The ID of the model'
						}],
						responses: {
							'200': {
								description: 'Model details',
								content: { 'application/json': { schema: { $ref: '#/components/schemas/Model' } } }
							},
							'404': { description: 'Model not found' }
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/v1/tokenize': {
					post: {
						tags: ['Utilities'],
						summary: 'Count tokens',
						description: 'Counts the number of tokens in the given text.',
						operationId: 'tokenize',
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/TokenizeRequest' },
									example: { model: this.config.defaultModel, text: 'Hello, world!' }
								}
							}
						},
						responses: {
							'200': {
								description: 'Token count',
								content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenizeResponse' } } }
							}
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/v1/usage': {
					get: {
						tags: ['Utilities'],
						summary: 'Get usage statistics',
						description: 'Returns usage statistics including request counts, token usage, and uptime.',
						operationId: 'getUsage',
						responses: {
							'200': {
								description: 'Usage statistics',
								content: { 'application/json': { schema: { $ref: '#/components/schemas/UsageResponse' } } }
							}
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/health': {
					get: {
						tags: ['Utilities'],
						summary: 'Health check',
						description: 'Simple health check endpoint for monitoring.',
						operationId: 'healthCheck',
						responses: {
							'200': {
								description: 'Service is healthy',
								content: {
									'application/json': {
										schema: {
											type: 'object',
											properties: {
												status: { type: 'string', example: 'ok' },
												service: { type: 'string', example: 'github-copilot-api-vscode' }
											}
										}
									}
								}
							}
						}
					}
				}
			},
			components: {
				securitySchemes: {
					bearerAuth: {
						type: 'http',
						scheme: 'bearer',
						description: 'API key authentication (optional, configure in extension settings)'
					}
				},
				schemas: {
					ChatCompletionRequest: {
						type: 'object',
						required: ['model', 'messages'],
						properties: {
							model: { type: 'string', description: 'Model ID to use', example: this.config.defaultModel },
							messages: {
								type: 'array',
								items: { $ref: '#/components/schemas/Message' },
								description: 'List of messages in the conversation'
							},
							stream: { type: 'boolean', default: false, description: 'Enable streaming responses' },
							temperature: { type: 'number', minimum: 0, maximum: 2, description: 'Sampling temperature' },
							max_tokens: { type: 'integer', description: 'Maximum tokens to generate' },
							tools: {
								type: 'array',
								items: { $ref: '#/components/schemas/Tool' },
								description: 'List of tools/functions available'
							},
							tool_choice: { type: 'string', description: 'How to select tools: auto, none, or specific' },
							response_format: {
								type: 'object',
								properties: { type: { type: 'string', enum: ['text', 'json_object'] } },
								description: 'Response format (json_object for JSON mode)'
							}
						}
					},
					Message: {
						type: 'object',
						required: ['role', 'content'],
						properties: {
							role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'], description: 'Role of the message sender' },
							content: { type: 'string', description: 'Message content' },
							name: { type: 'string', description: 'Name of the sender (optional)' },
							tool_calls: { type: 'array', items: { $ref: '#/components/schemas/ToolCall' } },
							tool_call_id: { type: 'string', description: 'ID of tool call this message responds to' }
						}
					},
					Tool: {
						type: 'object',
						required: ['type', 'function'],
						properties: {
							type: { type: 'string', enum: ['function'] },
							function: {
								type: 'object',
								required: ['name'],
								properties: {
									name: { type: 'string' },
									description: { type: 'string' },
									parameters: { type: 'object', description: 'JSON Schema for function parameters' }
								}
							}
						}
					},
					ToolCall: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							type: { type: 'string', enum: ['function'] },
							function: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									arguments: { type: 'string' }
								}
							}
						}
					},
					ChatCompletionResponse: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							object: { type: 'string', example: 'chat.completion' },
							created: { type: 'integer' },
							model: { type: 'string' },
							choices: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										index: { type: 'integer' },
										message: { $ref: '#/components/schemas/Message' },
										finish_reason: { type: 'string', enum: ['stop', 'length', 'tool_calls'] }
									}
								}
							},
							usage: { $ref: '#/components/schemas/Usage' }
						}
					},
					CompletionRequest: {
						type: 'object',
						required: ['model', 'prompt'],
						properties: {
							model: { type: 'string' },
							prompt: { type: 'string', description: 'Text prompt to complete' },
							max_tokens: { type: 'integer', default: 100 },
							temperature: { type: 'number' }
						}
					},
					CompletionResponse: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							object: { type: 'string', example: 'text_completion' },
							created: { type: 'integer' },
							model: { type: 'string' },
							choices: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										text: { type: 'string' },
										index: { type: 'integer' },
										finish_reason: { type: 'string' }
									}
								}
							},
							usage: { $ref: '#/components/schemas/Usage' }
						}
					},
					ResponsesRequest: {
						type: 'object',
						required: ['input'],
						properties: {
							model: { type: 'string' },
							input: { type: 'string', description: 'User input/question' },
							instructions: { type: 'string', description: 'System instructions' }
						}
					},
					ResponsesResponse: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							object: { type: 'string' },
							created_at: { type: 'integer' },
							output: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										type: { type: 'string' },
										content: {
											type: 'array',
											items: {
												type: 'object',
												properties: {
													type: { type: 'string' },
													text: { type: 'string' }
												}
											}
										}
									}
								}
							},
							usage: { $ref: '#/components/schemas/Usage' }
						}
					},
					TokenizeRequest: {
						type: 'object',
						required: ['text'],
						properties: {
							model: { type: 'string' },
							text: { type: 'string', description: 'Text to tokenize' }
						}
					},
					TokenizeResponse: {
						type: 'object',
						properties: {
							model: { type: 'string' },
							token_count: { type: 'integer' }
						}
					},
					ModelList: {
						type: 'object',
						properties: {
							object: { type: 'string', example: 'list' },
							data: { type: 'array', items: { $ref: '#/components/schemas/Model' } }
						}
					},
					Model: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							object: { type: 'string', example: 'model' },
							created: { type: 'integer' },
							owned_by: { type: 'string' }
						}
					},
					UsageResponse: {
						type: 'object',
						properties: {
							object: { type: 'string', example: 'usage' },
							total_requests: { type: 'integer' },
							total_tokens: {
								type: 'object',
								properties: {
									input: { type: 'integer' },
									output: { type: 'integer' },
									total: { type: 'integer' }
								}
							},
							uptime_seconds: { type: 'integer' },
							active_requests: { type: 'integer' }
						}
					},
					Usage: {
						type: 'object',
						properties: {
							prompt_tokens: { type: 'integer' },
							completion_tokens: { type: 'integer' },
							total_tokens: { type: 'integer' }
						}
					},
					Error: {
						type: 'object',
						properties: {
							error: {
								type: 'object',
								properties: {
									message: { type: 'string' },
									type: { type: 'string' },
									code: { type: 'string' }
								}
							}
						}
					}
				}
			}
		};
	}

	private sendError(res: ServerResponse, error: ApiError): void {
		const status = error.status ?? 500;
		const payload = {
			error: {
				message: error.message,
				type: error.type,
				code: error.code ?? null,
				param: null
			}
		};
		this.sendJson(res, status, payload);
	}

	private sendWsError(socket: WebSocket, error: ApiError): void {
		socket.send(JSON.stringify({
			type: 'error',
			error: {
				message: error.message,
				type: error.type,
				code: error.code ?? null
			}
		}));
	}

	private setCorsHeaders(res: ServerResponse): void {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-requested-with');
		res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
	}

	private checkRateLimit(): boolean {
		if (this.config.rateLimitPerMinute <= 0) {
			return true; // Rate limiting disabled
		}
		const now = Date.now();
		const windowStart = now - 60000; // 1 minute window

		// Remove old entries
		this.rateLimitBucket = this.rateLimitBucket.filter(ts => ts > windowStart);

		if (this.rateLimitBucket.length >= this.config.rateLimitPerMinute) {
			return false;
		}

		this.rateLimitBucket.push(now);
		return true;
	}

	private logRequest(
		requestId: string,
		method: string,
		path: string,
		status: number,
		durationMs: number,
		extra?: {
			requestPayload?: unknown;
			responsePayload?: unknown;
			tokensIn?: number;
			tokensOut?: number;
			model?: string;
			error?: string;
		}
	): void {
		const isError = status >= 400;
		const tokensIn = extra?.tokensIn ?? 0;
		const tokensOut = extra?.tokensOut ?? 0;

		// Always record stats
		this.recordRequestStats(durationMs, tokensIn, tokensOut, isError);

		// Update endpoint stats
		this.usageStats.requestsByEndpoint[path] = (this.usageStats.requestsByEndpoint[path] || 0) + 1;

		// Add to history
		const historyEntry: RequestHistoryEntry = {
			id: requestId,
			timestamp: Date.now(),
			method,
			path,
			status,
			durationMs,
			requestPayload: extra?.requestPayload,
			responsePayload: extra?.responsePayload,
			tokensIn,
			tokensOut,
			model: extra?.model,
			error: extra?.error
		};
		this.addHistoryEntry(historyEntry);

		// Log to output if logging is enabled
		if (this.config.enableLogging) {
			const log = {
				timestamp: new Date().toISOString(),
				requestId,
				method,
				path,
				status,
				durationMs,
				tokensIn,
				tokensOut,
				model: extra?.model,
				error: extra?.error
			};
			this.output.appendLine(`[REQUEST] ${JSON.stringify(log)}`);
		}
	}

	private getCacheKey(payload: any): string {
		// Create a stable cache key from the request payload
		const key = JSON.stringify({
			model: payload?.model,
			messages: payload?.messages,
			prompt: payload?.prompt,
			tools: payload?.tools,
			stream: payload?.stream
		});
		return key;
	}

	private getFromCache(cacheKey: string): any | undefined {
		const cached = this.requestCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
			return cached.response;
		}
		this.requestCache.delete(cacheKey);
		return undefined;
	}

	private setCache(cacheKey: string, response: any): void {
		// Clean old entries periodically
		if (this.requestCache.size > 100) {
			const now = Date.now();
			for (const [key, value] of this.requestCache.entries()) {
				if (now - value.timestamp > this.CACHE_TTL_MS) {
					this.requestCache.delete(key);
				}
			}
		}
		this.requestCache.set(cacheKey, { response, timestamp: Date.now() });
	}

	private buildUrl(rawUrl: string | undefined): URL {
		const base = `http://${this.config.host}:${this.config.port}`;
		return new URL(rawUrl ?? '/', base);
	}

	private async updateServerConfig(patch: Partial<ApiServerConfig>): Promise<void> {
		this.config = { ...this.config, ...patch };
		this._onDidChangeStatus.fire();
		const config = vscode.workspace.getConfiguration('githubCopilotApi');
		const updates: Promise<unknown>[] = [];
		if (patch.enabled !== undefined) {
			updates.push(Promise.resolve(config.update('server.enabled', patch.enabled, vscode.ConfigurationTarget.Global)));
		}
		if (patch.enableHttp !== undefined) {
			updates.push(Promise.resolve(config.update('server.enableHttp', patch.enableHttp, vscode.ConfigurationTarget.Global)));
		}
		if (patch.enableWebSocket !== undefined) {
			updates.push(Promise.resolve(config.update('server.enableWebSocket', patch.enableWebSocket, vscode.ConfigurationTarget.Global)));
		}
		if (patch.host !== undefined) {
			updates.push(Promise.resolve(config.update('server.host', patch.host, vscode.ConfigurationTarget.Global)));
		}
		if (patch.port !== undefined) {
			updates.push(Promise.resolve(config.update('server.port', patch.port, vscode.ConfigurationTarget.Global)));
		}
		if (patch.maxConcurrentRequests !== undefined) {
			updates.push(Promise.resolve(config.update('server.maxConcurrentRequests', patch.maxConcurrentRequests, vscode.ConfigurationTarget.Global)));
		}
		if (patch.defaultModel !== undefined) {
			updates.push(Promise.resolve(config.update('server.defaultModel', patch.defaultModel, vscode.ConfigurationTarget.Global)));
		}
		if (patch.enableLogging !== undefined) {
			updates.push(Promise.resolve(config.update('server.enableLogging', patch.enableLogging, vscode.ConfigurationTarget.Global)));
		}
		if (patch.apiKey !== undefined) {
			updates.push(Promise.resolve(config.update('server.apiKey', patch.apiKey, vscode.ConfigurationTarget.Global)));
		}
		if (patch.rateLimitPerMinute !== undefined) {
			updates.push(Promise.resolve(config.update('server.rateLimitPerMinute', patch.rateLimitPerMinute, vscode.ConfigurationTarget.Global)));
		}

		this.suppressRestart = true;
		try {
			await Promise.all(updates);
		} finally {
			this.suppressRestart = false;
		}

		await this.restart();
	}

	private updateStatusBar(state: 'starting' | 'running' | 'stopped', detail?: string): void {
		const protocolText = `${this.config.enableHttp ? 'HTTP' : ''}${this.config.enableHttp && this.config.enableWebSocket ? '+' : ''}${this.config.enableWebSocket ? 'WS' : ''}` || 'disabled';
		if (state === 'starting') {
			this.statusItem.text = '$(broadcast) Copilot API: Starting…';
			this.statusItem.tooltip = 'Starting Copilot API gateway';
			return;
		}

		if (state === 'running') {
			this.statusItem.text = `$(broadcast) Copilot API: On (${protocolText})`;
			const location = `${this.config.host}:${this.config.port}`;
			this.statusItem.tooltip = detail ? detail : `Copilot API is running on ${location}`;
			return;
		}

		this.statusItem.text = '$(broadcast) Copilot API: Off';
		this.statusItem.tooltip = detail ?? 'Copilot API gateway is stopped';
	}

	async showControlPalette(): Promise<void> {
		const cfg = vscode.workspace.getConfiguration('githubCopilotApi');
		const items: vscode.QuickPickItem[] = [
			{ label: '$(check) Start HTTP + WebSocket', description: 'Enable and start all endpoints' },
			{ label: '$(primitive-square) Stop Server', description: 'Disable all endpoints' },
			{ label: `${this.config.enableHttp ? '$(circle-slash)' : '$(play)'} Toggle HTTP`, description: this.config.enableHttp ? 'Disable HTTP REST endpoints' : 'Enable HTTP REST endpoints' },
			{ label: `${this.config.enableWebSocket ? '$(circle-slash)' : '$(play)'} Toggle WebSocket`, description: this.config.enableWebSocket ? 'Disable WebSocket realtime endpoint' : 'Enable WebSocket realtime endpoint' },
			{ label: '$(globe) Listen on localhost', description: 'Bind to 127.0.0.1' },
			{ label: '$(rss) Listen on all interfaces', description: 'Bind to 0.0.0.0 for LAN access' },
			{ label: '$(plug) Change port', description: `Current: ${this.config.port}` },
			{ label: '$(settings) Open settings', description: 'Open Copilot API settings' }
		];

		const selection = await vscode.window.showQuickPick(items, {
			placeHolder: 'Copilot API controls'
		});

		if (!selection) {
			return;
		}

		if (selection.label.includes('Start')) {
			await cfg.update('server.enabled', true, vscode.ConfigurationTarget.Global);
			await cfg.update('server.enableHttp', true, vscode.ConfigurationTarget.Global);
			await cfg.update('server.enableWebSocket', true, vscode.ConfigurationTarget.Global);
			return;
		}

		if (selection.label.includes('Stop')) {
			await cfg.update('server.enabled', false, vscode.ConfigurationTarget.Global);
			return;
		}

		if (selection.label.includes('Toggle HTTP')) {
			await cfg.update('server.enableHttp', !this.config.enableHttp, vscode.ConfigurationTarget.Global);
			await cfg.update('server.enabled', true, vscode.ConfigurationTarget.Global);
			return;
		}

		if (selection.label.includes('Toggle WebSocket')) {
			await cfg.update('server.enableWebSocket', !this.config.enableWebSocket, vscode.ConfigurationTarget.Global);
			await cfg.update('server.enabled', true, vscode.ConfigurationTarget.Global);
			return;
		}

		if (selection.label.includes('localhost')) {
			await cfg.update('server.host', '127.0.0.1', vscode.ConfigurationTarget.Global);
			await cfg.update('server.enabled', true, vscode.ConfigurationTarget.Global);
			return;
		}

		if (selection.label.includes('all interfaces')) {
			await cfg.update('server.host', '0.0.0.0', vscode.ConfigurationTarget.Global);
			await cfg.update('server.enabled', true, vscode.ConfigurationTarget.Global);
			return;
		}

		if (selection.label.includes('Change port')) {
			const value = await vscode.window.showInputBox({
				title: 'Set API server port',
				value: String(this.config.port),
				validateInput: input => {
					const num = Number(input);
					if (!Number.isFinite(num) || num <= 0 || num > 65535) {
						return 'Enter a valid port between 1 and 65535';
					}
					return null;
				}
			});
			if (value) {
				await cfg.update('server.port', Number(value), vscode.ConfigurationTarget.Global);
				await cfg.update('server.enabled', true, vscode.ConfigurationTarget.Global);
			}
			return;
		}

		if (selection.label.includes('settings')) {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'githubCopilotApi.server');
		}
	}

	private logInfo(message: string): void {
		this.output.appendLine(`[${new Date().toISOString()}] INFO ${message}`);
	}

	private logError(message: string, error: unknown): void {
		this.output.appendLine(`[${new Date().toISOString()}] ERROR ${message}: ${getErrorMessage(error)}`);
	}
}

export async function ensureCopilotChatReady(): Promise<boolean> {
	const extension = vscode.extensions.getExtension(COPILOT_CHAT_EXTENSION_ID);
	if (!extension) {
		const choice = await vscode.window.showWarningMessage(
			'GitHub Copilot Chat extension is required. Install it from the Marketplace to continue.',
			'Open Marketplace',
			'Cancel',
		);
		if (choice === 'Open Marketplace') {
			await vscode.commands.executeCommand('workbench.extensions.search', COPILOT_CHAT_SEARCH_QUERY);
		}
		return false;
	}

	if (!extension.isActive) {
		try {
			await extension.activate();
		} catch (error) {
			void vscode.window.showErrorMessage(`Failed to activate GitHub Copilot Chat: ${getErrorMessage(error)}`);
			return false;
		}
	}

	return true;
}

export function normalizePrompt(raw: unknown): string | undefined {
	if (typeof raw === 'string') {
		return raw.trim() || undefined;
	}
	if (Array.isArray(raw)) {
		return raw.map(part => typeof part === 'string' ? part : '').join(' ').trim() || undefined;
	}
	return undefined;
}

function getServerConfig(): ApiServerConfig {
	const configuration = vscode.workspace.getConfiguration('githubCopilotApi');
	const enabled = configuration.get<boolean>('server.enabled', true);
	const enableHttp = configuration.get<boolean>('server.enableHttp', true);
	const enableWebSocket = configuration.get<boolean>('server.enableWebSocket', true);
	const host = configuration.get<string>('server.host', '127.0.0.1').trim() || '127.0.0.1';
	const rawPort = configuration.get<number>('server.port', 3030);
	const port = Number.isFinite(rawPort) ? Math.max(1, Math.floor(rawPort)) : 3030;
	const rawConcurrency = configuration.get<number>('server.maxConcurrentRequests', 4);
	const maxConcurrentRequests = Number.isFinite(rawConcurrency) ? Math.max(1, Math.floor(rawConcurrency)) : 4;
	const defaultModel = (configuration.get<string>('server.defaultModel', 'gpt-4o-copilot') ?? 'gpt-4o-copilot').trim() || 'gpt-4o-copilot';
	const apiKey = configuration.get<string>('server.apiKey', '').trim();
	const enableLogging = configuration.get<boolean>('server.enableLogging', false);
	const rawRateLimit = configuration.get<number>('server.rateLimitPerMinute', 60);
	const rateLimitPerMinute = Number.isFinite(rawRateLimit) ? Math.max(0, Math.floor(rawRateLimit)) : 60;
	const defaultSystemPrompt = configuration.get<string>('server.defaultSystemPrompt', '').trim();
	const redactionPatterns = configuration.get<string[]>('server.redactionPatterns', []);
	return { enabled, enableHttp, enableWebSocket, host, port, maxConcurrentRequests, defaultModel, apiKey, enableLogging, rateLimitPerMinute, defaultSystemPrompt, redactionPatterns };
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return String(error);
}
