import { randomUUID } from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AuditService, AuditEntry } from './services/AuditService';
import type { McpService } from './McpService';
import type { RawData, WebSocket, WebSocketServer } from 'ws';

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

// Redaction pattern with toggle support
export interface RedactionPattern {
	id: string;
	name: string;
	pattern: string;
	enabled: boolean;
	isBuiltin: boolean;
}

// Default redaction patterns - enabled by default
export const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
	{ id: 'ssn', name: 'US Social Security', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b', enabled: true, isBuiltin: true },
	{ id: 'credit-card', name: 'Credit/Debit Card', pattern: '\\b(?:\\d{4}[- ]?){3}\\d{4}\\b', enabled: true, isBuiltin: true },
	{ id: 'aadhaar', name: 'Aadhaar Number', pattern: '\\b\\d{4}\\s?\\d{4}\\s?\\d{4}\\b', enabled: true, isBuiltin: true },
	{ id: 'passport-in', name: 'Indian Passport', pattern: '\\b[A-Z]\\d{7}\\b', enabled: true, isBuiltin: true },
	{ id: 'passport-us', name: 'US Passport', pattern: '\\b\\d{9}\\b', enabled: true, isBuiltin: true },
	{ id: 'email', name: 'Email Address', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', enabled: true, isBuiltin: true },
	{ id: 'url', name: 'URLs', pattern: 'https?://[^\\s]+', enabled: true, isBuiltin: true },
	{ id: 'phone-us', name: 'US Phone Number', pattern: '\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b', enabled: true, isBuiltin: true },
	{ id: 'phone-in', name: 'Indian Phone', pattern: '\\b[6-9]\\d{9}\\b', enabled: true, isBuiltin: true },
	{ id: 'api-key', name: 'API Keys', pattern: '(sk-[a-zA-Z0-9]{20,})|(api[_-]?key[=:]\\s*[\\w-]+)', enabled: true, isBuiltin: true },
	{ id: 'password-json', name: 'Passwords in JSON', pattern: '"password"\\s*:\\s*"[^"]*"', enabled: true, isBuiltin: true },
	{ id: 'bearer-token', name: 'Bearer Tokens', pattern: 'Bearer\\s+[A-Za-z0-9\\-._~+/]+=*', enabled: true, isBuiltin: true },
];

export interface ApiServerConfig {
	enabled: boolean
	enableHttp: boolean
	enableWebSocket: boolean
	enableHttps: boolean
	tlsCertPath: string
	tlsKeyPath: string
	host: string
	port: number
	maxConcurrentRequests: number
	defaultModel: string
	apiKey: string
	enableLogging: boolean
	rateLimitPerMinute: number
	defaultSystemPrompt: string
	redactionPatterns: RedactionPattern[] // Named patterns with toggle support
	ipAllowlist: string[] // List of allowed IPs or CIDR ranges
	requestTimeoutSeconds: number
	maxPayloadSizeMb: number
	maxConnectionsPerIp: number
	mcpEnabled: boolean
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

// --- Anthropic API Interfaces ---
export interface AnthropicMessageRequest {
	model: string;
	messages: { role: 'user' | 'assistant'; content: string | { type: 'text'; text: string }[] }[];
	system?: string;
	max_tokens?: number;
	stop_sequences?: string[];
	stream?: boolean;
	temperature?: number;
	top_p?: number;
	top_k?: number;
}

export interface AnthropicMessageResponse {
	id: string;
	type: 'message';
	role: 'assistant';
	content: { type: 'text'; text: string }[];
	model: string;
	stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
	stop_sequence: string | null;
	usage: { input_tokens: number; output_tokens: number };
}

// --- Google Generative AI Interfaces ---
export interface GoogleGenerateContentRequest {
	contents: { role?: string; parts: { text: string }[] }[];
	systemInstruction?: { parts: { text: string }[] };
	generationConfig?: {
		stopSequences?: string[];
		maxOutputTokens?: number;
		temperature?: number;
		topP?: number;
		topK?: number;
	};
}

export interface GoogleGenerateContentResponse {
	candidates: {
		content: { role: string; parts: { text: string }[] };
		finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
		index: number;
		safetyRatings?: { category: string; probability: string }[];
	}[];
	usageMetadata?: {
		promptTokenCount: number;
		candidatesTokenCount: number;
		totalTokenCount: number;
	};
}

// --- Llama API Interfaces ---
export interface LlamaMessageRequest {
	model: string;
	messages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | { type: 'text'; text: string }[] }[];
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	max_completion_tokens?: number; // Llama uses this instead of max_tokens
	stream?: boolean;
	stop?: string | string[];
	tools?: any[];
	tool_choice?: string | { type: string; function: { name: string } };
	response_format?: { type: 'text' | 'json_object' | 'json_schema'; json_schema?: any };
}

export interface LlamaMessageResponse {
	id: string;
	object: 'chat.completion';
	created: number;
	model: string;
	choices: {
		index: number;
		message: { role: 'assistant'; content: string; tool_calls?: any[] };
		finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
	}[];
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

type ChatEndpointContext = {
	source: 'http' | 'websocket'
	endpoint: '/v1/chat/completions' | '/v1/completions' | '/llama/v1/chat/completions'
}


export class CopilotApiGateway implements vscode.Disposable {
	private httpServer: ReturnType<typeof createServer> | undefined;
	private wsServer: WebSocketServer | undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private config: ApiServerConfig = getServerConfig();
	private disposed = false;
	private activeRequests = 0;
	private isHttps = false;
	private suppressRestart = false;
	private readonly _onDidChangeStatus = new vscode.EventEmitter<void>();
	public readonly onDidChangeStatus = this._onDidChangeStatus.event;
	private readonly _onDidLogRequest = new vscode.EventEmitter<AuditEntry>();
	public readonly onDidLogRequest = this._onDidLogRequest.event;

	// Domain cache for IP allowlist (maps domain names to resolved IPs)
	private domainCache = new Map<string, string[]>();
	private domainRefreshInterval: NodeJS.Timeout | undefined;

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
	private connections: Set<ServerResponse> = new Set();
	private isShuttingDown: boolean = false;
	private readonly MAX_HISTORY_SIZE = 100;
	private context?: vscode.ExtensionContext;

	// Rate limiting
	private rateLimitBucket: number[] = [];

	// Request cache for deduplication
	private requestCache = new Map<string, { response: any; timestamp: number }>();
	private readonly CACHE_TTL_MS = 5000; // 5 seconds

	// Stats update interval
	private statsInterval?: ReturnType<typeof setInterval>;

	// Production hardening
	private activeConnectionsPerIp = new Map<string, number>();

	private auditService: AuditService;
	private mcpService?: McpService;
	private mcpInitPromise?: Promise<void>;

	constructor(private readonly output: vscode.OutputChannel, private readonly statusItem: vscode.StatusBarItem, context: vscode.ExtensionContext) {
		this.context = context;
		this.auditService = new AuditService(context);
		// MCP is loaded lazily when needed - no initialization here
		// Timer intervals deferred to start() to not run when server is stopped

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

		// Initialize stats from persistent storage (async, non-blocking)
		this.initializeStats().catch(err => console.error('Failed to initialize stats:', err));
		// Load request history (async, non-blocking)
		setImmediate(() => this.loadHistory());
	}

	private async initializeStats() {
		try {
			const lifetime = await this.auditService.getLifetimeStats();
			this.usageStats.totalRequests = lifetime.totalRequests;
			this.usageStats.totalTokensIn = lifetime.totalTokensIn;
			this.usageStats.totalTokensOut = lifetime.totalTokensOut;
		} catch (error) {
			console.error('Failed to load lifetime stats:', error);
		}
	}

	/**
	 * Lazy-load MCP service only when needed
	 * Returns undefined if MCP is disabled
	 */
	private async ensureMcpService(): Promise<McpService | undefined> {
		const mcpEnabled = vscode.workspace.getConfiguration('githubCopilotApi.mcp').get<boolean>('enabled', true);
		if (!mcpEnabled) {
			return undefined;
		}

		if (this.mcpService) {
			return this.mcpService;
		}

		if (!this.mcpInitPromise) {
			this.mcpInitPromise = (async () => {
				const { McpService: McpServiceClass } = await import('./McpService');
				this.mcpService = new McpServiceClass(this.output);
				await this.mcpService.initialize();
			})();
		}

		await this.mcpInitPromise;
		return this.mcpService;
	}

	public async getStatus() {
		return {
			running: !!this.httpServer,
			isHttps: this.isHttps,
			config: this.config,
			activeRequests: this.activeRequests,
			networkInfo: this.getNetworkInfo(),
			stats: this.getStats(),
			realtimeStats: this.realtimeStats,
			historyCount: this.requestHistory.length,
			mcp: this.getMcpStatus(),
			copilot: await this.getCopilotHealth()
		};
	}

	public async getCopilotHealth() {
		// More robust detection: scan all extensions for ID match (case-insensitive) or explicit name match
		const allExtensions = vscode.extensions.all;
		const copilotExt = allExtensions.find(e =>
			e.id.toLowerCase() === 'github.copilot' ||
			e.id.toLowerCase() === 'github.copilot-nightly' ||
			(e.packageJSON?.publisher === 'GitHub' && e.packageJSON?.name === 'copilot')
		);
		const copilotChatExt = allExtensions.find(e =>
			e.id.toLowerCase() === 'github.copilot-chat' ||
			(e.packageJSON?.publisher === 'GitHub' && e.packageJSON?.name === 'copilot-chat')
		);

		let signedIn = false;
		try {
			const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			signedIn = models && models.length > 0;
		} catch (e) {
			signedIn = false;
		}

		// If we are signed in (meaning we found models), we are functionally ready
		// regardless of whether we could strictly identify the extension ID.
		const isReady = signedIn || (!!copilotExt && !!copilotChatExt && signedIn);

		return {
			installed: !!copilotExt || signedIn,
			chatInstalled: !!copilotChatExt || signedIn,
			signedIn: signedIn,
			ready: isReady
		};
	}

	public getMcpStatus() {
		return {
			enabled: vscode.workspace.getConfiguration('githubCopilotApi.mcp').get<boolean>('enabled', true),
			servers: this.mcpService?.getConnectedServers() ?? [],
			tools: this.mcpService?.getTools() ?? []
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
			errorRate: this.realtimeStats.errorRate,
			mcp: this.getMcpStatus()
		};
	}

	/**
	 * Get request history (optionally filtered)
	 */
	public getHistory(limit?: number): RequestHistoryEntry[] {
		const entries = [...this.requestHistory].reverse(); // Most recent first
		return limit ? entries.slice(0, limit) : entries;
	}

	public async getDailyStats(days: number): Promise<any[]> {
		return this.auditService.getDailyStats(days);
	}

	public async getAuditLogs(page: number, pageSize: number): Promise<{ total: number, entries: AuditEntry[] }> {
		return this.auditService.getLogEntries(page, pageSize);
	}

	public getLogFolderPath(): string {
		return this.auditService.getLogFolderPath();
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
		const enabledPatterns = this.config.redactionPatterns.filter(p => p.enabled);
		console.log(`[Redaction] ${this.config.redactionPatterns.length} total patterns, ${enabledPatterns.length} enabled`);
		if (!enabledPatterns.length) {
			return data;
		}

		const redact = (str: string): string => {
			let result = str;
			for (const patternObj of enabledPatterns) {
				try {
					const regex = new RegExp(patternObj.pattern, 'gi');
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
	 * Redact sensitive content from chat messages BEFORE sending to Copilot
	 * This prevents confidential data from ever leaving the user's machine
	 */
	private redactMessagesContent(
		messages: Array<{ role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string }>
	): Array<{ role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string }> {
		const enabledPatterns = this.config.redactionPatterns.filter(p => p.enabled);
		if (!enabledPatterns.length) {
			return messages;
		}

		const redactString = (str: string): string => {
			let result = str;
			for (const patternObj of enabledPatterns) {
				try {
					const regex = new RegExp(patternObj.pattern, 'gi');
					result = result.replace(regex, '[REDACTED]');
				} catch {
					// Invalid regex, skip
				}
			}
			return result;
		};

		return messages.map(msg => {
			let content = msg.content;

			if (typeof content === 'string') {
				content = redactString(content);
			} else if (Array.isArray(content)) {
				// Handle array content (multi-modal messages)
				content = content.map(part => {
					if (typeof part === 'string') {
						return redactString(part);
					}
					if (part && typeof part === 'object' && typeof part.text === 'string') {
						return { ...part, text: redactString(part.text) };
					}
					return part;
				});
			}

			return { ...msg, content };
		});
	}

	/**
	 * Redact a simple string prompt before sending to Copilot
	 */
	private redactPromptString(prompt: string): string {
		const enabledPatterns = this.config.redactionPatterns.filter(p => p.enabled);
		if (!enabledPatterns.length) {
			return prompt;
		}

		let result = prompt;
		for (const patternObj of enabledPatterns) {
			try {
				const regex = new RegExp(patternObj.pattern, 'gi');
				result = result.replace(regex, '[REDACTED]');
			} catch {
				// Invalid regex, skip
			}
		}
		return result;
	}

	/**
	 * Start the real-time stats updater
	 */
	private startStatsUpdater(): void {
		// Update stats every 5 seconds
		this.statsInterval = setInterval(() => {
			this.updateRealtimeStats();
			this._onDidChangeStatus.fire();
		}, 5000);
	}

	/**
	 * Start periodic domain cache refresh for IP allowlist
	 */
	private startDomainCacheRefresh(): void {
		// Refresh immediately on startup
		void this.refreshDomainCache();

		// Then refresh every 5 minutes
		this.domainRefreshInterval = setInterval(() => {
			void this.refreshDomainCache();
		}, 5 * 60 * 1000);
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
	 * Add a custom redaction pattern
	 */
	public async addRedactionPattern(name: string, pattern: string): Promise<boolean> {
		try {
			new RegExp(pattern); // Validate regex
			const patterns = this.config.redactionPatterns;
			const id = `custom-${Date.now()}`;
			const newPattern: RedactionPattern = {
				id,
				name,
				pattern,
				enabled: true,
				isBuiltin: false
			};
			await this.updateServerConfig({ redactionPatterns: [...patterns, newPattern] });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Remove a redaction pattern by ID
	 */
	public async removeRedactionPattern(id: string): Promise<void> {
		const patterns = this.config.redactionPatterns.filter(p => p.id !== id);
		await this.updateServerConfig({ redactionPatterns: patterns });
	}

	/**
	 * Toggle a redaction pattern on/off
	 */
	public async toggleRedactionPattern(id: string, enabled: boolean): Promise<void> {
		const patterns = this.config.redactionPatterns.map(p =>
			p.id === id ? { ...p, enabled } : p
		);
		await this.updateServerConfig({ redactionPatterns: patterns });
	}

	/**
	 * Get current redaction patterns
	 */
	public getRedactionPatterns(): RedactionPattern[] {
		return [...this.config.redactionPatterns];
	}

	/**
	 * Add an IP allowlist entry
	 */
	public async addIpAllowlistEntry(entry: string): Promise<boolean> {
		const value = entry.trim();
		if (!value) {
			return false;
		}

		// Validation: allow IPs, CIDRs, and domain names
		// IP/CIDR: digits, dots, colons, slashes
		// Domain: alphanumeric, dots, hyphens (must have at least one dot for domains)
		const isIpOrCidr = /^[\d\.\/]+$|^[\da-fA-F:\/]+$/.test(value);
		const isDomain = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/.test(value);

		if (!isIpOrCidr && !isDomain) {
			return false;
		}

		const list = [...this.config.ipAllowlist, value];
		const config = vscode.workspace.getConfiguration('githubCopilotApi');
		await config.update('server.ipAllowlist', list, vscode.ConfigurationTarget.Global);
		return true;
	}

	/**
	 * Remove an IP allowlist entry
	 */
	public async removeIpAllowlistEntry(ipOrCidr: string): Promise<void> {
		const ips = this.config.ipAllowlist.filter(ip => ip !== ipOrCidr);
		await this.updateServerConfig({ ipAllowlist: ips });
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
			if (!netInterface) { continue; }
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

	public async toggleHttps(): Promise<void> {
		await this.updateServerConfig({ enableHttps: !this.config.enableHttps, enabled: true });
	}

	public async setApiKey(apiKey: string): Promise<void> {
		const value = (apiKey ?? '').trim();
		await this.updateServerConfig({ apiKey: value });
	}

	public async setRateLimit(limit: number): Promise<void> {
		const normalized = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 60;
		await this.updateServerConfig({ rateLimitPerMinute: normalized });
	}

	public getVersion(): string {
		return this.context?.extension.packageJSON.version || '0.0.1';
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

	public async toggleMcp(enabled: boolean): Promise<void> {
		this.suppressRestart = true;
		await vscode.workspace.getConfiguration('githubCopilotApi.mcp').update('enabled', enabled, vscode.ConfigurationTarget.Global);
		if (enabled) {
			const mcp = await this.ensureMcpService();
			await mcp?.refreshServers();
		}
		this.config.mcpEnabled = enabled;
		this.suppressRestart = false;
	}

	public async setDefaultModel(model: string): Promise<void> {
		const value = (model ?? '').trim();
		if (!value) {
			return;
		}
		await this.updateServerConfig({ defaultModel: value, enabled: true });
	}

	public async setRequestTimeout(seconds: number): Promise<void> {
		const normalized = Number.isFinite(seconds) ? Math.max(1, Math.floor(seconds)) : 180;
		await this.updateServerConfig({ requestTimeoutSeconds: normalized });
	}

	public async setMaxPayloadSize(mb: number): Promise<void> {
		const normalized = Number.isFinite(mb) ? Math.max(1, Math.floor(mb)) : 1;
		await this.updateServerConfig({ maxPayloadSizeMb: normalized });
	}

	public async setMaxConnectionsPerIp(limit: number): Promise<void> {
		const normalized = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 10;
		await this.updateServerConfig({ maxConnectionsPerIp: normalized });
	}

	public async setMaxConcurrency(limit: number): Promise<void> {
		const normalized = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 4;
		await this.updateServerConfig({ maxConcurrentRequests: normalized });
	}

	async start(): Promise<void> {
		if (this.disposed) {
			return;
		}

		// Start intervals only when server starts (deferred from constructor)
		this.startStatsUpdater();
		this.startDomainCacheRefresh();

		await this.stop();
		this.config = getServerConfig();
		if (!this.config.enabled) {
			this.updateStatusBar('stopped', 'Server disabled in settings');
			this._onDidChangeStatus.fire();
			return;
		}

		this.updateStatusBar('starting');
		this._onDidChangeStatus.fire();

		// Create request handler function
		const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
			// Track active connections for graceful shutdown
			this.connections.add(res);
			res.on('close', () => this.connections.delete(res));

			const requestStart = Date.now();
			const requestId = randomUUID().slice(0, 8);

			void this.handleHttpRequest(req, res, requestId, requestStart)
				.catch(error => {
					const duration = Date.now() - requestStart;
					if (error instanceof ApiError) {
						this.logRequest(requestId, req.method || 'UNKNOWN', req.url || '/', error.status, duration, {
							error: error.message,
							requestHeaders: req.headers
						});
						this.sendError(res, error);
					} else {
						this.logRequest(requestId, req.method || 'UNKNOWN', req.url || '/', 500, duration, {
							error: error instanceof Error ? error.message : String(error),
							requestHeaders: req.headers
						});
						this.logError('Unhandled error in HTTP request handler', error);
						this.sendError(res, new ApiError(500, 'An unexpected error occurred.', 'server_error'));
					}
				})
				.finally(() => {
					this.activeRequests--;
					this._onDidChangeStatus.fire();
				});

			this.activeRequests++;
			this._onDidChangeStatus.fire();
		};

		// Create HTTP or HTTPS server based on config
		let isHttps = false;
		if (this.config.enableHttps) {
			try {
				let certData: { cert: Buffer | string; key: Buffer | string } | null = null;

				// Check if user provided cert paths
				if (this.config.tlsCertPath && this.config.tlsKeyPath) {
					const certPath = this.config.tlsCertPath.startsWith('~')
						? path.join(os.homedir(), this.config.tlsCertPath.slice(1))
						: this.config.tlsCertPath;
					const keyPath = this.config.tlsKeyPath.startsWith('~')
						? path.join(os.homedir(), this.config.tlsKeyPath.slice(1))
						: this.config.tlsKeyPath;

					if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
						certData = {
							cert: fs.readFileSync(certPath),
							key: fs.readFileSync(keyPath)
						};
						this.logInfo(`HTTPS enabled with certificate from ${certPath}`);
					}
				}

				// Auto-generate self-signed cert if no cert configured
				if (!certData) {
					const selfsigned = require('selfsigned');
					const attrs = [{ name: 'commonName', value: 'localhost' }];
					const pems = selfsigned.generate(attrs, {
						days: 365,
						keySize: 2048,
						algorithm: 'sha256'
					});
					certData = {
						cert: pems.cert,
						key: pems.private
					};
					this.logInfo('HTTPS enabled with auto-generated self-signed certificate (valid 365 days)');
				}

				this.httpServer = createHttpsServer(certData, requestHandler);
				isHttps = true;
			} catch (error) {
				this.logError('Failed to setup HTTPS, falling back to HTTP', error);
				this.httpServer = createServer(requestHandler);
			}
		} else {
			this.httpServer = createServer(requestHandler);
		}

		// Track actual runtime protocol
		this.isHttps = isHttps;

		this.httpServer.on('error', error => {
			this.logError('HTTP server error', error);
		});

		// Only load WebSocket server when enabled
		if (this.config.enableWebSocket) {
			const { WebSocketServer: WSServer } = await import('ws');
			this.wsServer = new WSServer({ noServer: true });
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
				if (url.pathname === '/v1/realtime') {
					this.wsServer?.handleUpgrade(request, socket, head, (ws: WebSocket) => {
						this.wsServer?.emit('connection', ws, request);
					});
				} else {
					socket.destroy();
				}
			});
		}

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
			const protocol = isHttps ? 'https' : 'http';
			const location = `${protocol}://${address.address}:${address.port}`;
			this.logInfo(`${isHttps ? 'HTTPS' : 'HTTP'} server listening on ${location}`);
			this.updateStatusBar('running', `${isHttps ? 'HTTPS' : 'HTTP'}${this.config.enableWebSocket ? '+WS' : ''} on ${location}`);
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

	public async dispose(): Promise<void> {
		this.disposed = true;
		this.isShuttingDown = true;
		this.logInfo('Shutting down API Gateway...');

		// Stop stats updater
		if (this.statsInterval) {
			clearInterval(this.statsInterval);
			this.statsInterval = undefined;
		}

		// Stop domain cache refresh
		if (this.domainRefreshInterval) {
			clearInterval(this.domainRefreshInterval);
			this.domainRefreshInterval = undefined;
		}

		// Save history before disposing
		this.saveHistory();

		// Wait a bit for active requests to finish
		if (this.activeRequests > 0) {
			this.logInfo(`Waiting for ${this.activeRequests} active requests to complete...`);
			let waitTime = 0;
			while (this.activeRequests > 0 && waitTime < 3000) { // Max 3 seconds wait
				await new Promise(resolve => setTimeout(resolve, 100));
				waitTime += 100;
			}
			if (this.activeRequests > 0) {
				this.logInfo(`Forcing close of ${this.activeRequests} remaining requests.`);
			}
		}

		// Close all open HTTP connections
		for (const res of this.connections) {
			if (!res.writableEnded) {
				res.writeHead(503, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: { message: 'Server is shutting down', type: 'service_unavailable' } }));
			}
		}
		this.connections.clear();

		await this.stop().catch(error => {
			this.logError('Failed to stop API server during dispose', error);
		});

		for (const disposable of this.disposables.splice(0)) {
			disposable.dispose();
		}
		await this.mcpService?.dispose();
		this._onDidChangeStatus.dispose();
		this.logInfo('API Gateway shut down successfully.');
	}

	private async handleHttpRequest(req: IncomingMessage, res: ServerResponse, requestId: string, requestStart: number): Promise<void> {
		if (this.isShuttingDown) {
			res.writeHead(503, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: { message: 'Server is shutting down', type: 'service_unavailable' } }));
			return;
		}

		this.setCorsHeaders(res);

		// Add X-Request-ID header for debugging
		res.setHeader('X-Request-ID', requestId);

		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		if (!this.config.enableHttp) {
			throw new ApiError(503, 'HTTP API is disabled. Enable it from the Copilot API controls.', 'service_unavailable', 'http_disabled');
		}

		const url = this.buildUrl(req.url);

		// Get client IP for rate limiting
		const clientIp = this.getClientIp(req);

		// Per-IP connection limiting
		const currentConnections = this.activeConnectionsPerIp.get(clientIp) || 0;
		if (currentConnections >= this.config.maxConnectionsPerIp) {
			this.logRequest(requestId, req.method || 'UNKNOWN', url.pathname, 429, Date.now() - requestStart, {
				requestHeaders: req.headers
			});
			throw new ApiError(429, `Too many connections from your IP. Maximum ${this.config.maxConnectionsPerIp} concurrent connections allowed.`, 'rate_limit_error', 'too_many_connections');
		}
		this.activeConnectionsPerIp.set(clientIp, currentConnections + 1);

		// Ensure we decrement the counter when the request ends
		res.on('close', () => {
			const count = this.activeConnectionsPerIp.get(clientIp) || 1;
			if (count <= 1) {
				this.activeConnectionsPerIp.delete(clientIp);
			} else {
				this.activeConnectionsPerIp.set(clientIp, count - 1);
			}
		});

		// Authentication check (skip for health endpoint)
		if (this.config.apiKey && url.pathname !== '/health') {
			const authHeader = req.headers['authorization'];
			const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
			if (providedKey !== this.config.apiKey) {
				this.logRequest(requestId, req.method || 'UNKNOWN', url.pathname, 401, Date.now() - requestStart, {
					requestHeaders: req.headers
				});
				throw new ApiError(401, 'Invalid or missing API key. Provide a valid Bearer token.', 'authentication_error', 'invalid_api_key');
			}
		}

		// Rate limiting check
		if (!this.checkRateLimit()) {
			this.logRequest(requestId, req.method || 'UNKNOWN', url.pathname, 429, Date.now() - requestStart, {
				requestHeaders: req.headers
			});
			throw new ApiError(429, 'Rate limit exceeded. Please try again later.', 'rate_limit_error', 'rate_limit_exceeded');
		}

		// IP Allowlist check
		if (!this.checkIpAllowlist(req)) {
			this.logRequest(requestId, req.method || 'UNKNOWN', url.pathname, 403, Date.now() - requestStart, {
				requestHeaders: req.headers
			});
			throw new ApiError(403, 'Access denied. Your IP address is not allowed.', 'access_denied', 'ip_not_allowed');
		}

		// Track request
		this.usageStats.totalRequests++;
		this.usageStats.requestsByEndpoint[url.pathname] = (this.usageStats.requestsByEndpoint[url.pathname] || 0) + 1;

		// Enhanced health check - verify Copilot is actually available
		if (req.method === 'GET' && url.pathname === '/health') {
			try {
				const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
				if (models && models.length > 0) {
					this.sendJson(res, 200, {
						status: 'ok',
						service: 'github-copilot-api-vscode',
						copilot: 'available',
						models: models.length
					});
				} else {
					this.sendJson(res, 200, {
						status: 'degraded',
						service: 'github-copilot-api-vscode',
						copilot: 'unavailable',
						message: 'No Copilot models found. Check if GitHub Copilot is installed and signed in.'
					});
				}
			} catch {
				this.sendJson(res, 200, {
					status: 'degraded',
					service: 'github-copilot-api-vscode',
					copilot: 'error',
					message: 'Failed to check Copilot availability.'
				});
			}
			return;
		}

		// OpenAPI specification
		if (req.method === 'GET' && url.pathname === '/openapi.json') {
			this.sendJson(res, 200, this.getOpenApiSpec());
			return;
		}

		// Local diagnostics
		if (req.method === 'GET' && url.pathname === '/debug-paths') {
			this.sendDebugPaths(res);
			return;
		}

		// Swagger UI documentation
		if (req.method === 'GET' && url.pathname === '/docs') {
			this.sendSwaggerUi(res);
			return;
		}

		if (req.method === 'GET' && url.pathname.startsWith('/swagger-ui/')) {
			this.serveStaticFile(req, res, url.pathname);
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

		// Prometheus metrics endpoint
		if (req.method === 'GET' && url.pathname === '/metrics') {
			const uptime = Math.floor((Date.now() - this.usageStats.startTime) / 1000);
			const metrics = [
				'# HELP copilot_api_requests_total Total number of API requests',
				'# TYPE copilot_api_requests_total counter',
				`copilot_api_requests_total ${this.usageStats.totalRequests}`,
				'',
				'# HELP copilot_api_active_requests Current number of active requests',
				'# TYPE copilot_api_active_requests gauge',
				`copilot_api_active_requests ${this.activeRequests}`,
				'',
				'# HELP copilot_api_tokens_input_total Total input tokens consumed',
				'# TYPE copilot_api_tokens_input_total counter',
				`copilot_api_tokens_input_total ${this.usageStats.totalTokensIn}`,
				'',
				'# HELP copilot_api_tokens_output_total Total output tokens generated',
				'# TYPE copilot_api_tokens_output_total counter',
				`copilot_api_tokens_output_total ${this.usageStats.totalTokensOut}`,
				'',
				'# HELP copilot_api_uptime_seconds Server uptime in seconds',
				'# TYPE copilot_api_uptime_seconds gauge',
				`copilot_api_uptime_seconds ${uptime}`,
				'',
				'# HELP copilot_api_requests_per_minute Rate of requests per minute',
				'# TYPE copilot_api_requests_per_minute gauge',
				`copilot_api_requests_per_minute ${this.realtimeStats.requestsPerMinute}`,
				'',
				'# HELP copilot_api_latency_avg_ms Average request latency in milliseconds',
				'# TYPE copilot_api_latency_avg_ms gauge',
				`copilot_api_latency_avg_ms ${this.realtimeStats.avgLatencyMs}`,
				'',
				'# HELP copilot_api_error_rate_percent Error rate percentage',
				'# TYPE copilot_api_error_rate_percent gauge',
				`copilot_api_error_rate_percent ${this.realtimeStats.errorRate}`,
				''
			].join('\n');

			res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
			res.end(metrics);
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

		if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
			const body = await this.readJsonBody(req);
			if (body?.stream === true) {
				await this.processStreamingChatCompletion(body, req, res, requestId, requestStart);
			} else {
				const response = await this.processChatCompletion(body, { source: 'http', endpoint: '/v1/chat/completions' }) as any;
				this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
					requestPayload: body,
					responsePayload: response,
					tokensIn: response?.usage?.prompt_tokens,
					tokensOut: response?.usage?.completion_tokens,
					model: body?.model,
					requestHeaders: req.headers,
					responseHeaders: res.getHeaders()
				});
				this.sendJson(res, 200, response);
			}
			return;
		}

		// Anthropic Messages API
		if (req.method === 'POST' && url.pathname === '/v1/messages') {
			const body = await this.readJsonBody(req) as AnthropicMessageRequest;
			// Model validation
			if (body?.model && !this.resolveModel(body.model)) {
				throw new ApiError(400, `Model '${body.model}' is not supported.`, 'invalid_request_error', 'model_not_found');
			}

			if (body?.stream === true) {
				await this.processStreamingAnthropicMessages(body, req, res, requestId, requestStart);
			} else {
				try {
					const response = await this.processAnthropicMessages(body);
					this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
						requestPayload: body,
						responsePayload: response,
						tokensIn: response?.usage?.input_tokens,
						tokensOut: response?.usage?.output_tokens,
						model: body?.model,
						requestHeaders: req.headers,
						responseHeaders: res.getHeaders()
					});
					this.sendJson(res, 200, response);
				} catch (error: any) {
					const apiError = error instanceof ApiError ? error : new ApiError(500, error.message || 'Internal Server Error', 'api_error');
					this.sendJson(res, apiError.status, {
						type: 'error',
						error: {
							type: apiError.code || 'api_error',
							message: apiError.message
						}
					});
				}
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
				model: body?.model,
				requestHeaders: req.headers,
				responseHeaders: res.getHeaders()
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
				model: body?.model,
				requestHeaders: req.headers,
				responseHeaders: res.getHeaders()
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
				model: body?.model,
				requestHeaders: req.headers,
				responseHeaders: res.getHeaders()
			});
			this.sendJson(res, 200, response);
			return;
		}

		// Responses API (OpenAI)
		if (req.method === 'POST' && url.pathname === '/v1/responses') {
			const body = await this.readJsonBody(req);
			const response = await this.processResponsesApi(body);
			this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
				requestPayload: body,
				responsePayload: response,
				tokensIn: (response as any)?.usage?.input_tokens,
				tokensOut: (response as any)?.usage?.output_tokens,
				model: body?.model,
				requestHeaders: req.headers,
				responseHeaders: res.getHeaders()
			});
			this.sendJson(res, 200, response);
			return;
		}

		// Google Generative AI API
		const googleMatch = url.pathname.match(/^\/v1beta\/models\/(.+):generateContent$/);
		const googleStreamMatch = url.pathname.match(/^\/v1beta\/models\/(.+):streamGenerateContent$/);

		if (req.method === 'POST' && (googleMatch || googleStreamMatch)) {
			const modelId = decodeURIComponent((googleMatch || googleStreamMatch)![1]);
			const body = await this.readJsonBody(req) as GoogleGenerateContentRequest;

			// Model validation
			if (modelId && !this.resolveModel(modelId)) {
				throw new ApiError(400, `Model '${modelId}' is not supported.`, 'invalid_request_error', 'model_not_found');
			}

			if (googleStreamMatch) {
				await this.processStreamingGoogleGenerateContent(modelId, body, req, res, requestId, requestStart);
			} else {
				try {
					const response = await this.processGoogleGenerateContent(modelId, body);
					this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
						requestPayload: body,
						responsePayload: response,
						tokensIn: response?.usageMetadata?.promptTokenCount,
						tokensOut: response?.usageMetadata?.candidatesTokenCount,
						model: modelId,
						requestHeaders: req.headers,
						responseHeaders: res.getHeaders()
					});
					this.sendJson(res, 200, response);
				} catch (error: any) {
					const apiError = error instanceof ApiError ? error : new ApiError(500, error.message || 'Internal Server Error', 'server_error');
					this.sendJson(res, apiError.status, {
						error: {
							code: apiError.status,
							message: apiError.message,
							status: apiError.code || 'INTERNAL'
						}
					});
				}
			}
			return;
		}

		// Llama API (OpenAI-compatible format with Llama branding)
		// Since Llama uses OpenAI-compatible format, we reuse processChatCompletion
		if (req.method === 'POST' && url.pathname === '/llama/v1/chat/completions') {
			const body = await this.readJsonBody(req);
			// Handle max_completion_tokens (Llama) as max_tokens (OpenAI)
			if (body?.max_completion_tokens && !body?.max_tokens) {
				body.max_tokens = body.max_completion_tokens;
			}

			if (body?.stream === true) {
				await this.processStreamingChatCompletion(body, req, res, requestId, requestStart);
			} else {
				const response = await this.processChatCompletion(body, { source: 'http', endpoint: '/llama/v1/chat/completions' }) as any;
				this.logRequest(requestId, req.method, url.pathname, 200, Date.now() - requestStart, {
					requestPayload: body,
					responsePayload: response,
					tokensIn: response?.usage?.prompt_tokens,
					tokensOut: response?.usage?.completion_tokens,
					model: body?.model,
					requestHeaders: req.headers,
					responseHeaders: res.getHeaders()
				});
				this.sendJson(res, 200, response);
			}
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

	private async processStreamingGoogleGenerateContent(modelId: string, payload: GoogleGenerateContentRequest, req: IncomingMessage, res: ServerResponse, logRequestId?: string, logRequestStart?: number): Promise<void> {
		const messages: vscode.LanguageModelChatMessage[] = [];

		if (payload.systemInstruction) {
			const systemText = payload.systemInstruction.parts.map(p => p.text).join(' ');
			messages.push(vscode.LanguageModelChatMessage.User(this.redactPromptString(systemText)));
		}

		for (const content of payload.contents) {
			const role = content.role === 'model' ? vscode.LanguageModelChatMessageRole.Assistant : vscode.LanguageModelChatMessageRole.User;
			const text = content.parts.map(p => p.text).join(' ');
			const redactedText = this.redactPromptString(text);

			if (role === vscode.LanguageModelChatMessageRole.User) {
				messages.push(vscode.LanguageModelChatMessage.User(redactedText));
			} else {
				messages.push(vscode.LanguageModelChatMessage.Assistant(redactedText));
			}
		}

		const resolvedModel = this.resolveModel(modelId);
		const promptStr = messages.map(m => {
			if (typeof m.content === 'string') { return m.content; }
			return m.content.map(p => {
				if ('text' in p) { return p.text; }
				return '';
			}).join(' ');
		}).join('\n');

		// Set headers - Google stream is a JSON array of response objects, usually
		// but since we want to mimic their SDK behavior, we might use EventStream or just chunked JSON
		// Google's streamGenerateContent typically returns a JSON array over time
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'X-HTTP-Content-Type-Options': 'nosniff',
			'Transfer-Encoding': 'chunked'
		});

		let totalContent = '';

		const cts = new vscode.CancellationTokenSource();
		req.on('close', () => {
			cts.cancel();
			console.log(`[Google] Client disconnected, cancelling request ${logRequestId || ''}`);
		});

		try {
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (!copilotModels || copilotModels.length === 0) {
				throw new ApiError(503, 'No Copilot language model available.', 'service_unavailable', 'copilot_unavailable');
			}

			const lmModel = copilotModels[0];
			const response = await lmModel.sendRequest(messages, {}, cts.token);

			// Google's format is an array of objects
			res.write('[\n');
			let firstPart = true;

			for await (const part of response.stream) {
				if (cts.token.isCancellationRequested) { break; }
				if (part instanceof vscode.LanguageModelTextPart) {
					totalContent += part.value;
					if (!firstPart) {
						res.write(',\n');
					}
					const chunk = {
						candidates: [{
							content: {
								role: 'model',
								parts: [{ text: part.value }]
							},
							finishReason: 'STOP',
							index: 0
						}],
						usageMetadata: {
							promptTokenCount: 0,
							candidatesTokenCount: 0,
							totalTokenCount: 0
						}
					};
					res.write(JSON.stringify(chunk));
					firstPart = false;
				}
			}

			if (!cts.token.isCancellationRequested) {
				res.write('\n]\n');
				res.end();
			}

			// Token counting (best effort for logs)
			let inputTokens = 0;
			let outputTokens = 0;
			try {
				inputTokens = await lmModel.countTokens(promptStr, cts.token);
				outputTokens = await lmModel.countTokens(totalContent, cts.token);
			} catch (e) { }

			if (logRequestId) {
				this.logRequest(logRequestId, 'POST', `/v1beta/models/${modelId}:streamGenerateContent`, 200, Date.now() - (logRequestStart || 0), {
					requestPayload: payload,
					responsePayload: { candidates: [{ content: { parts: [{ text: totalContent }] } }] },
					tokensIn: inputTokens,
					tokensOut: outputTokens,
					model: resolvedModel
				});
			}

		} catch (error: any) {
			if (cts.token.isCancellationRequested) { return; }
			console.error('Google streaming error:', error);
			const apiError = error instanceof ApiError ? error : new ApiError(500, error.message || 'Internal Server Error', 'server_error');
			res.write(JSON.stringify({ error: { code: apiError.status, message: apiError.message, status: apiError.code } }));
			res.end();
		} finally {
			cts.dispose();
		}
	}

	private async processStreamingAnthropicMessages(payload: AnthropicMessageRequest, req: IncomingMessage, res: ServerResponse, logRequestId?: string, logRequestStart?: number): Promise<void> {
		const messages: vscode.LanguageModelChatMessage[] = [];

		if (payload.system) {
			messages.push(vscode.LanguageModelChatMessage.User(this.redactPromptString(payload.system)));
		}

		for (const msg of payload.messages) {
			const role = msg.role === 'user' ? vscode.LanguageModelChatMessageRole.User : vscode.LanguageModelChatMessageRole.Assistant;
			const content = typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.text).join(' ');
			const redactedContent = this.redactPromptString(content);

			if (role === vscode.LanguageModelChatMessageRole.User) {
				messages.push(vscode.LanguageModelChatMessage.User(redactedContent));
			} else {
				messages.push(vscode.LanguageModelChatMessage.Assistant(redactedContent));
			}
		}

		const resolvedModel = this.resolveModel(payload.model);
		const promptStr = messages.map(m => {
			if (typeof m.content === 'string') { return m.content; }
			return m.content.map(p => {
				if ('text' in p) { return p.text; }
				return '';
			}).join(' ');
		}).join('\n');

		// Set SSE headers
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*'
		});

		const messageId = 'ant-' + randomUUID();
		let totalContent = '';

		const cts = new vscode.CancellationTokenSource();
		req.on('close', () => {
			cts.cancel();
			console.log(`[Anthropic] Client disconnected, cancelling request ${logRequestId || ''}`);
		});

		// Heartbeat to keep connection alive
		const heartbeat = setInterval(() => {
			if (!res.writableEnded) {
				res.write(': ping\n\n');
			}
		}, 15000);

		try {
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (!copilotModels || copilotModels.length === 0) {
				throw new ApiError(503, 'No Copilot language model available.', 'service_unavailable', 'copilot_unavailable');
			}

			const lmModel = copilotModels[0];
			const response = await lmModel.sendRequest(messages, {}, cts.token);

			// Anthropic streaming starts with message_start
			res.write(`event: message_start\ndata: ${JSON.stringify({
				type: 'message_start',
				message: {
					id: messageId,
					type: 'message',
					role: 'assistant',
					content: [],
					model: resolvedModel,
					stop_reason: null,
					stop_sequence: null,
					usage: { input_tokens: 0, output_tokens: 0 }
				}
			})}\n\n`);

			res.write(`event: content_block_start\ndata: ${JSON.stringify({
				type: 'content_block_start',
				index: 0,
				content_block: { type: 'text', text: '' }
			})}\n\n`);

			for await (const part of response.stream) {
				if (cts.token.isCancellationRequested) { break; }
				if (part instanceof vscode.LanguageModelTextPart) {
					totalContent += part.value;
					res.write(`event: content_block_delta\ndata: ${JSON.stringify({
						type: 'content_block_delta',
						index: 0,
						delta: { type: 'text_delta', text: part.value }
					})}\n\n`);
				}
			}

			if (!cts.token.isCancellationRequested) {
				res.write(`event: content_block_stop\ndata: ${JSON.stringify({
					type: 'content_block_stop',
					index: 0
				})}\n\n`);

				res.write(`event: message_delta\ndata: ${JSON.stringify({
					type: 'message_delta',
					delta: { stop_reason: 'end_turn', stop_sequence: null },
					usage: { output_tokens: 0 }
				})}\n\n`);

				res.write(`event: message_stop\ndata: ${JSON.stringify({
					type: 'message_stop'
				})}\n\n`);

				res.end();
			}

			// Token counting (best effort for logs)
			let inputTokens = 0;
			let outputTokens = 0;
			try {
				inputTokens = await lmModel.countTokens(promptStr, cts.token);
				outputTokens = await lmModel.countTokens(totalContent, cts.token);
			} catch (e) { }

			if (logRequestId) {
				this.logRequest(logRequestId, 'POST', '/v1/messages', 200, Date.now() - (logRequestStart || 0), {
					requestPayload: payload,
					responsePayload: { id: messageId, type: 'message', content: [{ type: 'text', text: totalContent }] },
					tokensIn: inputTokens,
					tokensOut: outputTokens,
					model: resolvedModel
				});
			}

		} catch (error: any) {
			if (cts.token.isCancellationRequested) { return; }
			console.error('Anthropic streaming error:', error);
			const apiError = error instanceof ApiError ? error : new ApiError(500, error.message || 'Internal Server Error', 'server_error');
			res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: apiError.code || 'api_error', message: apiError.message } })}\n\n`);
			res.end();
		} finally {
			clearInterval(heartbeat);
			cts.dispose();
		}
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

		return modelData;
	}

	private async processStreamingChatCompletion(payload: any, req: IncomingMessage, res: ServerResponse, logRequestId?: string, logRequestStart?: number): Promise<void> {
		let messages = this.normalizeChatMessages(payload);
		// Apply redaction to OUTBOUND messages before sending to Copilot
		messages = this.redactMessagesContent(messages);
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

			// Calculate tokens manually since streaming responses often don't include usage
			let tokensIn = 0;
			let tokensOut = 0;
			try {
				const inputString = lmMessages.map(m => {
					// @ts-ignore - Check for content property structure
					return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
				}).join('\n');
				tokensIn = await lmModel.countTokens(inputString, new vscode.CancellationTokenSource().token);
				tokensOut = await lmModel.countTokens(totalContent, new vscode.CancellationTokenSource().token);
			} catch (e) {
				// Ignore token counting errors
				console.error('Failed to count tokens:', e);
			}

			// Log the streaming request
			if (logRequestId && logRequestStart) {
				this.logRequest(logRequestId, 'POST', '/v1/chat/completions', 200, Date.now() - logRequestStart, {
					requestPayload: payload,
					responsePayload: { streamed: true, content_preview: totalContent.slice(0, 500), tool_calls: toolCalls },
					model: payload?.model,
					requestHeaders: req.headers,
					responseHeaders: res.getHeaders(),
					tokensIn,
					tokensOut
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
					model: payload?.model,
					requestHeaders: req.headers
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

		let prompt = this.composePrompt(messages);
		// Apply redaction to OUTBOUND prompt before sending to Copilot
		prompt = this.redactPromptString(prompt);

		const model = this.resolveModel(payload?.model);
		const text = await this.runWithConcurrency(() => this.invokeCopilot(prompt));

		// Count tokens
		let inputTokens = 0;
		let outputTokens = 0;
		try {
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (copilotModels && copilotModels.length > 0) {
				const lmModel = copilotModels[0];
				inputTokens = await lmModel.countTokens(prompt);
				outputTokens = await lmModel.countTokens(text || '');
			}
		} catch (e) {
			console.error('Token counting failed:', e);
		}

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
				prompt_tokens: inputTokens,
				completion_tokens: outputTokens,
				total_tokens: inputTokens + outputTokens
			}
		};
	}

	private async processAnthropicMessages(payload: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
		const messages: vscode.LanguageModelChatMessage[] = [];

		if (payload.system) {
			messages.push(vscode.LanguageModelChatMessage.User(this.redactPromptString(payload.system)));
		}

		for (const msg of payload.messages) {
			const role = msg.role === 'user' ? vscode.LanguageModelChatMessageRole.User : vscode.LanguageModelChatMessageRole.Assistant;
			const content = typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.text).join(' ');
			const redactedContent = this.redactPromptString(content);

			if (role === vscode.LanguageModelChatMessageRole.User) {
				messages.push(vscode.LanguageModelChatMessage.User(redactedContent));
			} else {
				messages.push(vscode.LanguageModelChatMessage.Assistant(redactedContent));
			}
		}

		const resolvedModel = this.resolveModel(payload.model);
		const promptStr = messages.map(m => {
			if (typeof m.content === 'string') { return m.content; }
			return m.content.map(p => {
				if ('text' in p) { return p.text; }
				return '';
			}).join(' ');
		}).join('\n');



		// Use sendRequest directly to preserve message structure instead of flattening to string
		const text = await this.runWithConcurrency(async () => {
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (!copilotModels || copilotModels.length === 0) {
				throw new ApiError(503, 'No Copilot language model available.', 'service_unavailable', 'copilot_unavailable');
			}
			const lmModel = copilotModels[0];
			const result = await lmModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

			let output = '';
			for await (const part of result.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					output += part.value;
				}
			}
			return output;
		});

		// Count tokens


		// Count tokens
		let inputTokens = 0;
		let outputTokens = 0;
		try {
			const promptStr = messages.map(m => m.content).join(' ');
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (copilotModels && copilotModels.length > 0) {
				const lmModel = copilotModels[0];
				inputTokens = await lmModel.countTokens(promptStr);
				outputTokens = await lmModel.countTokens(text || '');
			}
		} catch (e) {
			console.error('Anthropic token counting failed:', e);
		}

		return {
			id: 'ant-' + randomUUID(),
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: text || '' }],
			model: resolvedModel,
			stop_reason: 'end_turn',
			stop_sequence: null,
			usage: {
				input_tokens: inputTokens,
				output_tokens: outputTokens
			}
		};
	}


	private async processGoogleGenerateContent(modelId: string, payload: GoogleGenerateContentRequest): Promise<GoogleGenerateContentResponse> {
		const messages: vscode.LanguageModelChatMessage[] = [];

		if (payload.systemInstruction) {
			const systemText = payload.systemInstruction.parts.map(p => p.text).join(' ');
			messages.push(vscode.LanguageModelChatMessage.User(this.redactPromptString(systemText)));
		}

		for (const content of payload.contents) {
			const role = content.role === 'model' ? vscode.LanguageModelChatMessageRole.Assistant : vscode.LanguageModelChatMessageRole.User;
			const text = content.parts.map(p => p.text).join(' ');
			const redactedText = this.redactPromptString(text);

			if (role === vscode.LanguageModelChatMessageRole.User) {
				messages.push(vscode.LanguageModelChatMessage.User(redactedText));
			} else {
				messages.push(vscode.LanguageModelChatMessage.Assistant(redactedText));
			}
		}

		const resolvedModel = this.resolveModel(modelId);
		const promptStr = messages.map(m => {
			if (typeof m.content === 'string') { return m.content; }
			return m.content.map(p => {
				if ('text' in p) { return p.text; }
				return '';
			}).join(' ');
		}).join('\n');



		// Use sendRequest directly to preserve message structure instead of flattening to string
		const text = await this.runWithConcurrency(async () => {
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (!copilotModels || copilotModels.length === 0) {
				throw new ApiError(503, 'No Copilot language model available.', 'service_unavailable', 'copilot_unavailable');
			}
			const lmModel = copilotModels[0];
			const result = await lmModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

			let output = '';
			for await (const part of result.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					output += part.value;
				}
			}
			return output;
		});

		// Count tokens


		// Count tokens
		let inputTokens = 0;
		let outputTokens = 0;
		try {
			const promptStr = messages.map(m => m.content).join(' ');
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (copilotModels && copilotModels.length > 0) {
				const lmModel = copilotModels[0];
				inputTokens = await lmModel.countTokens(promptStr);
				outputTokens = await lmModel.countTokens(text || '');
			}
		} catch (e) {
			console.error('Google token counting failed:', e);
		}

		return {
			candidates: [
				{
					content: {
						role: 'model',
						parts: [{ text: text || '' }]
					},
					finishReason: 'STOP',
					index: 0
				}
			],
			usageMetadata: {
				promptTokenCount: inputTokens,
				candidatesTokenCount: outputTokens,
				totalTokenCount: inputTokens + outputTokens
			}
		};
	}

	private async processChatCompletion(payload: any, context: ChatEndpointContext): Promise<Record<string, unknown>> {


		let messages = this.normalizeChatMessages(payload);
		messages = this.injectSystemPrompt(messages);

		// Apply redaction to OUTBOUND messages before sending to Copilot
		messages = this.redactMessagesContent(messages);

		const model = this.resolveModel(payload?.model);
		const baseTools = this.normalizeTools(payload?.tools || payload?.functions) || [];

		// Fetch MCP Tools (lazy load if available)
		const mcpService = await this.ensureMcpService();
		const mcpTools = mcpService ? await mcpService.getAllTools() : [];
		const mappedMcpTools: vscode.LanguageModelChatTool[] = mcpTools.map(t => ({
			name: `mcp_${t.serverName}_${t.name}`,
			description: t.description || `Tool from MCP server ${t.serverName}`,
			inputSchema: t.inputSchema
		}));

		const allTools = [...baseTools, ...mappedMcpTools];
		const toolChoice = payload?.tool_choice || payload?.function_call;
		const responseFormat = payload?.response_format;

		// Handle JSON mode by injecting instruction
		if (responseFormat?.type === 'json_object') {
			const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
			if (lastUserIdx >= 0) {
				const originalContent = messages[lastUserIdx].content;
				messages[lastUserIdx] = {
					...messages[lastUserIdx],
					content: `${originalContent}\n\nIMPORTANT: You MUST respond with valid JSON only.No markdown, no explanation, just pure JSON.`
				};
			}
		}

		let iterations = 0;
		const MAX_ITERATIONS = 5;
		let result: any;

		while (iterations < MAX_ITERATIONS) {
			result = await this.runWithConcurrency(() =>
				this.invokeCopilotWithTools(messages, allTools, toolChoice)
			);

			if (result.toolCalls && result.toolCalls.length > 0) {
				const mcpToolCalls = result.toolCalls.filter((tc: any) => tc.name.startsWith('mcp_'));

				if (mcpToolCalls.length > 0) {
					// Add assistant message with tool calls to history
					messages.push({
						role: 'assistant',
						content: result.content || null,
						tool_calls: result.toolCalls.map((tc: any) => ({
							id: `call_${randomUUID().slice(0, 24)}`,
							type: 'function',
							function: {
								name: tc.name,
								arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
							}
						}))
					});

					// Execute MCP tools
					for (const tc of mcpToolCalls) {
						const parts = tc.name.split('_');
						const serverName = parts[1];
						const toolName = parts.slice(2).join('_');

						try {
							const mcp = await this.ensureMcpService();
							if (!mcp) {
								throw new Error('MCP service not available');
							}
							const toolResult = await mcp.callTool(serverName, toolName, tc.arguments);
							messages.push({
								role: 'tool',
								tool_call_id: `call_${randomUUID().slice(0, 24)}`, // Best effort ID mapping
								content: JSON.stringify(toolResult)
							});
						} catch (error: any) {
							messages.push({
								role: 'tool',
								tool_call_id: `call_${randomUUID().slice(0, 24)}`,
								content: `Error executing MCP tool: ${error.message}`
							});
						}
					}

					iterations++;
					continue; // Loop again with tool results
				}
			}

			// If we get here, either no tool calls or no MCP tool calls
			break;
		}

		// Calculate tokens for final state
		const created = Math.floor(Date.now() / 1000);
		let promptTokens = 0;
		let completionTokens = 0;
		try {
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (copilotModels && copilotModels.length > 0) {
				const lmModel = copilotModels[0];

				// Count input tokens for the whole history
				const inputStr = messages.map(m => {
					// @ts-ignore
					return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
				}).join('\n');
				promptTokens = await lmModel.countTokens(inputStr);

				// Count output tokens for the final response
				const outputStr = result.content || '';
				const toolStr = result.toolCalls ? JSON.stringify(result.toolCalls) : '';
				completionTokens = await lmModel.countTokens(outputStr + toolStr);
			}
		} catch (e) {
			console.error('Token counting failed:', e);
		}

		// Check if the FINAL iteration requested tool calls (that we didn't handle, i.e. client tools)
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
					prompt_tokens: promptTokens,
					completion_tokens: completionTokens,
					total_tokens: promptTokens + completionTokens
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
				prompt_tokens: promptTokens,
				completion_tokens: completionTokens,
				total_tokens: promptTokens + completionTokens
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
		const health = await this.getCopilotHealth();

		if (!health.installed) {
			throw new ApiError(503, 'GitHub Copilot extension is not installed.', 'service_unavailable', 'copilot_not_installed');
		}
		if (!health.chatInstalled) {
			throw new ApiError(503, 'GitHub Copilot Chat extension is not installed.', 'service_unavailable', 'copilot_chat_not_installed');
		}
		if (!health.signedIn) {
			throw new ApiError(401, 'Not signed in to GitHub Copilot. Please sign in in VS Code.', 'unauthorized', 'copilot_not_signed_in');
		}

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
							`[Called function: $ { tc.function?.name || tc.name }(${tc.function?.arguments || JSON.stringify(tc.arguments)})]`
						).join('\n');
						lmMessages.push(vscode.LanguageModelChatMessage.Assistant(toolCallInfo));
					} else {
						lmMessages.push(vscode.LanguageModelChatMessage.Assistant(content));
					}
					break;
				case 'tool':
					// Tool result message
					const toolResultContent = `[Tool result for ${msg.tool_call_id || 'unknown'}]: ${content} `;
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

		// Create a cancellation token with timeout
		const cts = new vscode.CancellationTokenSource();
		const timeout = setTimeout(() => cts.cancel(), (this.config.requestTimeoutSeconds || 180) * 1000);

		try {
			const response = await model.sendRequest(lmMessages, options, cts.token);

			let textContent = '';
			const toolCalls: Array<{ name: string; arguments: any }> = [];

			// Process the response stream
			for await (const part of response.stream) {
				if (cts.token.isCancellationRequested) {
					throw new ApiError(504, 'Request timed out waiting for Copilot response.', 'gateway_timeout', 'request_timeout');
				}
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
			if (cts.token.isCancellationRequested) {
				throw new ApiError(504, 'Request timed out waiting for Copilot response.', 'gateway_timeout', 'request_timeout');
			}
			throw new ApiError(502, `Failed to retrieve Copilot response: ${getErrorMessage(error)} `, 'bad_gateway', 'command_failed', { cause: error });
		} finally {
			clearTimeout(timeout);
			cts.dispose();
		}
	}

	private async processCompletion(payload: any): Promise<Record<string, unknown>> {
		let prompt = this.normalizePromptInput(payload?.prompt);
		if (!prompt) {
			throw new ApiError(400, 'prompt is required', 'invalid_request_error', 'missing_prompt');
		}

		// Apply redaction to OUTBOUND prompt before sending to Copilot
		prompt = this.redactPromptString(prompt);

		const model = this.resolveModel(payload?.model);
		const text = await this.runWithConcurrency(() => this.invokeCopilot(prompt));
		// Calculate tokens
		const created = Math.floor(Date.now() / 1000);
		let promptTokens = 0;
		let completionTokens = 0;
		try {
			const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			if (copilotModels && copilotModels.length > 0) {
				const lmModel = copilotModels[0];

				// Count input tokens
				const inputStr = prompt;
				promptTokens = await lmModel.countTokens(inputStr);

				// Count output tokens
				const outputStr = text || '';
				completionTokens = await lmModel.countTokens(outputStr);
			}
		} catch (e) {
			console.error('Token counting failed:', e);
		}

		return {
			id: `cmpl - ${randomUUID()} `,
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
				prompt_tokens: promptTokens,
				completion_tokens: completionTokens,
				total_tokens: promptTokens + completionTokens
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

		throw new ApiError(400, `Unsupported message type: ${type} `, 'invalid_request_error', 'unsupported_ws_message');
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

	public async invokeCopilot(prompt: string): Promise<string> {
		// Use the VS Code Language Model API to invoke Copilot programmatically
		// This does NOT open the chat window
		const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });

		if (!models || models.length === 0) {
			throw new ApiError(503, 'No Copilot language model available. Make sure GitHub Copilot is installed and signed in.', 'service_unavailable', 'copilot_unavailable');
		}

		const model = models[0];
		const messages = [vscode.LanguageModelChatMessage.User(prompt)];

		// Create a cancellation token with timeout
		const cts = new vscode.CancellationTokenSource();
		const timeout = setTimeout(() => cts.cancel(), (this.config.requestTimeoutSeconds || 180) * 1000);

		try {
			const response = await model.sendRequest(messages, {}, cts.token);

			// Collect all text fragments from the response stream
			let text = '';
			for await (const fragment of response.text) {
				if (cts.token.isCancellationRequested) {
					throw new ApiError(504, 'Request timed out waiting for Copilot response.', 'gateway_timeout', 'request_timeout');
				}
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
			if (cts.token.isCancellationRequested) {
				throw new ApiError(504, 'Request timed out waiting for Copilot response.', 'gateway_timeout', 'request_timeout');
			}
			throw new ApiError(502, `Failed to retrieve Copilot response: ${getErrorMessage(error)} `, 'bad_gateway', 'command_failed', { cause: error });
		} finally {
			clearTimeout(timeout);
			cts.dispose();
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
			return `[${cleanedRole}]\n${text} `;
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
		let totalSize = 0;

		await new Promise<void>((resolve, reject) => {
			req.on('data', chunk => {
				const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
				totalSize += buffer.length;

				// Check payload size limit
				const maxPayloadSize = (this.config.maxPayloadSizeMb || 1) * 1024 * 1024;
				if (totalSize > maxPayloadSize) {
					req.destroy();
					reject(new ApiError(413, `Request body too large.Maximum size is ${Math.round(maxPayloadSize / 1024)} KB.`, 'invalid_request_error', 'payload_too_large'));
					return;
				}

				chunks.push(buffer);
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
		// Use root-relative paths to avoid host/port mismatch issues
		const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot API - Swagger UI</title>
    <link rel="stylesheet" href="/swagger-ui/swagger-ui.css">
    <style>
        body { margin: 0; background: #fafafa; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info { margin: 30px 0; }
        .swagger-ui .info .title { font-size: 2em; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="/swagger-ui/swagger-ui-bundle.js"></script>
    <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            SwaggerUIBundle({
                url: '/openapi.json',
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

	private serveStaticFile(req: IncomingMessage, res: ServerResponse, urlValue: string): void {
		const fileName = path.basename(urlValue);
		const candidates: string[] = [];

		if (this.context) {
			try {
				// Use VS Code API to resolve path relative to extension root
				candidates.push(this.context.asAbsolutePath(path.join('dist', 'swagger-ui', fileName)));
			} catch (err) {
				// ignore
			}
		}

		// Fallbacks
		candidates.push(
			path.join(__dirname, 'swagger-ui', fileName),
			path.join(__dirname, '..', 'swagger-ui', fileName),
			path.join(__dirname, 'dist', 'swagger-ui', fileName)
		);

		let filePath = '';
		for (const candidate of candidates) {
			if (fs.existsSync(candidate)) {
				filePath = candidate;
				break;
			}
		}

		if (filePath) {
			const stat = fs.statSync(filePath);
			const ext = path.extname(filePath);
			let contentType = 'text/plain';
			if (ext === '.css') {
				contentType = 'text/css';
			} else if (ext === '.js') {
				contentType = 'application/javascript';
			}

			res.writeHead(200, {
				'Content-Type': contentType,
				'Content-Length': stat.size
			});

			const readStream = fs.createReadStream(filePath);
			readStream.pipe(res);
		} else {
			const msg = `[Static] File not found: ${fileName}. Checked: ${JSON.stringify(candidates)}`;
			console.error(msg);
			this.output.appendLine(`[${new Date().toISOString()}] ERROR ${msg}`);

			// Debug directory listing
			if (this.context) {
				try {
					const dir = this.context.asAbsolutePath(path.join('dist', 'swagger-ui'));
					if (fs.existsSync(dir)) {
						this.output.appendLine(`Contents of ${dir}: ${fs.readdirSync(dir).join(', ')}`);
					} else {
						this.output.appendLine(`Directory not found: ${dir}`);
					}
				} catch (e) {
					this.output.appendLine(`Error listing directory: ${e}`);
				}
			}

			res.statusCode = 404;
			res.end('Not found');
		}
	}

	private sendDebugPaths(res: ServerResponse): void {
		const debugInfo: any = {
			dirname: __dirname,
			cwd: process.cwd(),
			contextExtensionUri: this.context?.extensionUri.fsPath ?? 'undefined',
			candidates_css: [],
			dist_swagger_contents: 'N/A'
		};

		const testFile = 'swagger-ui.css';
		const candidates: any[] = [];

		if (this.context) {
			try {
				const p = this.context.asAbsolutePath(path.join('dist', 'swagger-ui', testFile));
				const dir = path.dirname(p);

				let contents = 'N/A';
				if (fs.existsSync(dir)) {
					contents = fs.readdirSync(dir).join(', ');
				}

				candidates.push({
					type: 'context.asAbsolutePath',
					path: p,
					exists: fs.existsSync(p),
					dir_exists: fs.existsSync(dir),
					dir_contents: contents
				});
				debugInfo.dist_swagger_contents = contents;
			} catch (e) { candidates.push({ error: String(e) }); }
		}

		candidates.push({
			type: 'fallback_dirname',
			path: path.join(__dirname, 'swagger-ui', testFile),
			exists: fs.existsSync(path.join(__dirname, 'swagger-ui', testFile))
		});

		debugInfo.candidates_css = candidates;

		res.statusCode = 200;
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify(debugInfo, null, 2));
	}

	private getOpenApiSpec(): object {
		const url = '/';
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
				{ name: 'Anthropic', description: 'Anthropic Messages API compatible endpoints' },
				{ name: 'Google', description: 'Google Generative AI API compatible endpoints' },
				{ name: 'Llama', description: 'Meta Llama API compatible endpoints' },
				{ name: 'Models', description: 'Model information' },
				{ name: 'Utilities', description: 'Utility endpoints' }
			],

			paths: {
				'/v1/chat/completions': {
					post: {
						tags: ['Chat'],
						summary: 'Create chat completion',
						description: 'Creates a chat completion for the given messages using the OpenAI format.\n\n**Supported Features:**\n- **Streaming:** Server-Sent Events (SSE)\n- **Function Calling:** Tool use with `tools` and `tool_choice`\n- **JSON Mode:** Structured output with `response_format`\n- **Token usage:** Detailed usage statistics',
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
				'/v1/messages': {
					post: {
						tags: ['Anthropic'],
						summary: 'Anthropic Messages API',
						description: 'Create a message using the Anthropic-compatible API format.',
						operationId: 'anthropicMessages',
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/AnthropicMessageRequest' },
									example: {
										model: 'claude-3-5-sonnet-20240620',
										max_tokens: 1024,
										messages: [
											{ role: 'user', content: 'Hello, Claude' }
										]
									}
								}
							}
						},
						responses: {
							'200': {
								description: 'Successful response',
								content: {
									'application/json': { schema: { $ref: '#/components/schemas/AnthropicMessageResponse' } },
									'text/event-stream': { description: 'Anthropic-style event stream' }
								}
							}
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/v1beta/models/{model}:generateContent': {
					post: {
						tags: ['Google'],
						summary: 'Google Generative AI generateContent',
						description: 'Generate content using the Google-compatible API format.',
						operationId: 'googleGenerateContent',
						parameters: [{ name: 'model', in: 'path', required: true, schema: { type: 'string' } }],
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/GoogleGenerateContentRequest' },
									example: {
										contents: [
											{
												role: 'user',
												parts: [{ text: 'Write a story about a magic backpack' }]
											}
										],
										generationConfig: {
											temperature: 0.9,
											maxOutputTokens: 200
										}
									}
								}
							}
						},
						responses: {
							'200': {
								description: 'Successful response',
								content: { 'application/json': { schema: { $ref: '#/components/schemas/GoogleGenerateContentResponse' } } }
							}
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/v1beta/models/{model}:streamGenerateContent': {
					post: {
						tags: ['Google'],
						summary: 'Google Generative AI streamGenerateContent',
						description: 'Stream content generation using the Google-compatible API format.',
						operationId: 'googleStreamGenerateContent',
						parameters: [{ name: 'model', in: 'path', required: true, schema: { type: 'string' } }],
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/GoogleGenerateContentRequest' }
								}
							}
						},
						responses: {
							'200': {
								description: 'Successful response',
								content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/GoogleGenerateContentResponse' } } } }
							}
						},
						security: this.config.apiKey ? [{ bearerAuth: [] }] : []
					}
				},
				'/llama/v1/chat/completions': {
					post: {
						tags: ['Llama'],
						summary: 'Llama Chat Completions',
						description: 'Create a chat completion using the Llama-compatible API format.\n\nCompatible with `llama-api` Python/JS SDKs. Supports standard OpenAI parameters including `max_completion_tokens`.',
						operationId: 'llamaChatCompletions',
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/LlamaMessageRequest' }
								}
							}
						},
						responses: {
							'200': {
								description: 'Successful response',
								content: {
									'application/json': { schema: { $ref: '#/components/schemas/LlamaMessageResponse' } },
									'text/event-stream': { description: 'OpenAI-style SSE event stream for streaming responses' }
								}
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
					},
					AnthropicMessageRequest: {
						type: 'object',
						required: ['model', 'messages'],
						properties: {
							model: { type: 'string' },
							messages: {
								type: 'array',
								items: {
									type: 'object',
									required: ['role', 'content'],
									properties: {
										role: { type: 'string', enum: ['user', 'assistant'] },
										content: { type: 'string' }
									}
								}
							},
							system: { type: 'string' },
							max_tokens: { type: 'integer' },
							stream: { type: 'boolean' }
						}
					},
					AnthropicMessageResponse: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							type: { type: 'string', example: 'message' },
							role: { type: 'string', example: 'assistant' },
							content: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										type: { type: 'string', example: 'text' },
										text: { type: 'string' }
									}
								}
							},
							model: { type: 'string' },
							stop_reason: { type: 'string' },
							usage: {
								type: 'object',
								properties: {
									input_tokens: { type: 'integer' },
									output_tokens: { type: 'integer' }
								}
							}
						}
					},
					GoogleGenerateContentRequest: {
						type: 'object',
						required: ['contents'],
						properties: {
							contents: {
								type: 'array',
								items: {
									type: 'object',
									required: ['parts'],
									properties: {
										role: { type: 'string', enum: ['user', 'model'] },
										parts: {
											type: 'array',
											items: {
												type: 'object',
												properties: { text: { type: 'string' } }
											}
										}
									}
								}
							},
							systemInstruction: {
								type: 'object',
								properties: {
									parts: {
										type: 'array',
										items: {
											type: 'object',
											properties: { text: { type: 'string' } }
										}
									}
								}
							},
							generationConfig: { type: 'object' }
						}
					},
					GoogleGenerateContentResponse: {
						type: 'object',
						properties: {
							candidates: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										content: {
											type: 'object',
											properties: {
												role: { type: 'string' },
												parts: {
													type: 'array',
													items: {
														type: 'object',
														properties: { text: { type: 'string' } }
													}
												}
											}
										},
										finishReason: { type: 'string' }
									}
								}
							},
							usageMetadata: {
								type: 'object',
								properties: {
									promptTokenCount: { type: 'integer' },
									candidatesTokenCount: { type: 'integer' },
									totalTokenCount: { type: 'integer' }
								}
							}
						}
					},
					LlamaMessageRequest: {
						type: 'object',
						required: ['model', 'messages'],
						properties: {
							model: { type: 'string', description: 'Model ID to use' },
							messages: {
								type: 'array',
								description: 'List of messages in the conversation',
								items: {
									type: 'object',
									required: ['role', 'content'],
									properties: {
										role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
										content: { type: 'string' }
									}
								}
							},
							temperature: { type: 'number', minimum: 0, maximum: 2 },
							max_tokens: { type: 'integer', description: 'Maximum tokens to generate' },
							max_completion_tokens: { type: 'integer', description: 'Llama-style max tokens parameter' },
							stream: { type: 'boolean', default: false },
							top_p: { type: 'number' },
							stop: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }
						}
					},
					LlamaMessageResponse: {
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
										message: {
											type: 'object',
											properties: {
												role: { type: 'string', example: 'assistant' },
												content: { type: 'string' }
											}
										},
										finish_reason: { type: 'string', enum: ['stop', 'length', 'tool_calls', 'content_filter'] }
									}
								}
							},
							usage: {
								type: 'object',
								properties: {
									prompt_tokens: { type: 'integer' },
									completion_tokens: { type: 'integer' },
									total_tokens: { type: 'integer' }
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

	/**
	 * Extract client IP from request, handling proxies
	 */
	private getClientIp(req: IncomingMessage): string {
		// Check X-Forwarded-For header for proxied requests
		const forwarded = req.headers['x-forwarded-for'];
		if (forwarded) {
			const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
			const firstIp = ips?.split(',')[0]?.trim();
			if (firstIp) {
				return firstIp;
			}
		}

		const remoteAddress = req.socket.remoteAddress || 'unknown';
		// Normalize IPv6 mapped IPv4 addresses
		return remoteAddress.startsWith('::ffff:') ? remoteAddress.substring(7) : remoteAddress;
	}

	private checkIpAllowlist(req: IncomingMessage): boolean {
		const allowlist = this.config.ipAllowlist;
		if (!allowlist || allowlist.length === 0) {
			return true; // No allowlist, allow all
		}

		const remoteAddress = req.socket.remoteAddress;
		if (!remoteAddress) {
			return false; // Cannot determine IP, block
		}

		// Normalize IPv6 mapped IPv4 addresses
		const ip = remoteAddress.startsWith('::ffff:') ? remoteAddress.substring(7) : remoteAddress;

		for (const allowed of allowlist) {
			if (allowed.includes('/')) {
				// CIDR notation
				if (this.isIpInCidr(ip, allowed)) {
					return true;
				}
			} else if (/^[\d\.]+$|^[\da-fA-F:]+$/.test(allowed)) {
				// Direct IP match
				if (allowed === ip) {
					return true;
				}
			} else {
				// Domain name - check cached resolved IPs
				const cachedIps = this.domainCache.get(allowed);
				if (cachedIps && cachedIps.includes(ip)) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Resolve domains in allowlist and cache their IPs
	 * Called periodically to keep cache fresh
	 */
	private async refreshDomainCache(): Promise<void> {
		const dns = await import('dns').then(m => m.promises);
		for (const entry of this.config.ipAllowlist) {
			// Check if entry is a domain (contains letters)
			if (/[a-zA-Z]/.test(entry) && !entry.includes('/')) {
				try {
					const addresses = await dns.resolve4(entry).catch(() => []);
					const addresses6 = await dns.resolve6(entry).catch(() => []);
					const allIps = [...addresses, ...addresses6];
					if (allIps.length > 0) {
						this.domainCache.set(entry, allIps);
					}
				} catch {
					// DNS resolution failed, skip
				}
			}
		}
	}

	private isIpInCidr(ip: string, cidr: string): boolean {
		try {
			const [range, bits] = cidr.split('/');
			const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);

			const ipParts = ip.split('.').map(Number);
			const rangeParts = range.split('.').map(Number);

			const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
			const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];

			return (ipNum & mask) === (rangeNum & mask);
		} catch {
			return false; // Invalid CIDR or IP
		}
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
			requestHeaders?: Record<string, unknown>;
			responseHeaders?: Record<string, unknown>;
		}
	): void {
		const isError = status >= 400;
		const tokensIn = extra?.tokensIn ?? 0;
		const tokensOut = extra?.tokensOut ?? 0;

		// Always record usage stats
		this.recordRequestStats(durationMs, tokensIn, tokensOut, isError);

		// Determine if we should log detailed body/headers
		// User requested: "i want it to logs request body and response body as well as headers"
		// We use the existing 'logRequestBodies' config as the gatekeeper for all heavy data

		// Persistent Logging (Audit Trail)
		// User requested to always log bodies/headers
		const logEntry: AuditEntry = {
			timestamp: new Date().toISOString(),
			requestId,
			method,
			path,
			status,
			durationMs,
			tokensIn: extra?.tokensIn,
			tokensOut: extra?.tokensOut,
			error: extra?.error,
			model: extra?.model,
			requestBody: extra?.requestPayload,
			responseBody: extra?.responsePayload,
			requestHeaders: extra?.requestHeaders,
			responseHeaders: extra?.responseHeaders
		};

		const redactedEntry = this.redactSensitiveData(logEntry);
		this.auditService.logRequest(redactedEntry);

		// Broadcast to internal listeners (like Dashboard)
		this._onDidLogRequest.fire(redactedEntry);

		// Broadcast to WebSocket clients for Live Log Tail
		if (this.wsServer) {
			const broadcastData = JSON.stringify({
				type: 'log',
				data: redactedEntry
			});
			this.wsServer.clients.forEach(client => {
				if (client.readyState === 1 /* OPEN */) {
					client.send(broadcastData);
				}
			});
		}

		// Log to output if logging is enabled
		if (this.config.enableLogging) {
			const statusIcon = isError ? '❌' : (status >= 300 ? '⚠️' : '✅');
			this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${statusIcon} ${method} ${path} ${status} (${durationMs}ms)`);
			if (extra?.error) {
				this.output.appendLine(`  Error: ${extra.error}`);
			}
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
		if (patch.enableHttps !== undefined) {
			updates.push(Promise.resolve(config.update('server.enableHttps', patch.enableHttps, vscode.ConfigurationTarget.Global)));
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
		if (patch.requestTimeoutSeconds !== undefined) {
			updates.push(Promise.resolve(config.update('server.requestTimeoutSeconds', patch.requestTimeoutSeconds, vscode.ConfigurationTarget.Global)));
		}
		if (patch.maxPayloadSizeMb !== undefined) {
			updates.push(Promise.resolve(config.update('server.maxPayloadSizeMb', patch.maxPayloadSizeMb, vscode.ConfigurationTarget.Global)));
		}
		if (patch.maxConnectionsPerIp !== undefined) {
			updates.push(Promise.resolve(config.update('server.maxConnectionsPerIp', patch.maxConnectionsPerIp, vscode.ConfigurationTarget.Global)));
		}
		if (patch.redactionPatterns !== undefined) {
			updates.push(Promise.resolve(config.update('server.redactionPatterns', patch.redactionPatterns, vscode.ConfigurationTarget.Global)));
		}
		if (patch.ipAllowlist !== undefined) {
			updates.push(Promise.resolve(config.update('server.ipAllowlist', patch.ipAllowlist, vscode.ConfigurationTarget.Global)));
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
			this.statusItem.show();
			return;
		}

		if (state === 'running') {
			this.statusItem.text = `$(broadcast) Copilot API: On (${protocolText})`;
			const location = `${this.config.host}:${this.config.port}`;
			this.statusItem.tooltip = detail ? detail : `Copilot API is running on ${location}`;
			this.statusItem.show();
			return;
		}

		this.statusItem.text = '$(broadcast) Copilot API: Off';
		this.statusItem.tooltip = detail ?? 'Copilot API gateway is stopped';
		this.statusItem.hide();
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
	const enabled = configuration.get<boolean>('server.enabled', false);
	const enableHttp = configuration.get<boolean>('server.enableHttp', true);
	const enableWebSocket = configuration.get<boolean>('server.enableWebSocket', true);
	const enableHttps = configuration.get<boolean>('server.enableHttps', false);
	const tlsCertPath = configuration.get<string>('server.tlsCertPath', '').trim();
	const tlsKeyPath = configuration.get<string>('server.tlsKeyPath', '').trim();
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

	// Read stored patterns and merge with defaults
	const storedPatterns = configuration.get<unknown[]>('server.redactionPatterns', []);

	// Migrate from old string[] format to new RedactionPattern[] format
	const parsedPatterns: RedactionPattern[] = storedPatterns.map((p, i) => {
		if (typeof p === 'string') {
			// Old format - migrate to new
			return {
				id: `migrated-${i}`,
				name: `Custom Pattern ${i + 1}`,
				pattern: p,
				enabled: true,
				isBuiltin: false
			};
		}
		// New format
		return p as RedactionPattern;
	});

	// Merge with defaults: use stored state for builtin patterns, add missing defaults
	const redactionPatterns: RedactionPattern[] = [];

	// First, add all default patterns (use stored enabled state if available)
	for (const defaultPattern of DEFAULT_REDACTION_PATTERNS) {
		const storedVersion = parsedPatterns.find(p => p.id === defaultPattern.id);
		if (storedVersion) {
			redactionPatterns.push({ ...defaultPattern, enabled: storedVersion.enabled });
		} else {
			redactionPatterns.push(defaultPattern);
		}
	}

	// Then add all custom (non-builtin) patterns
	for (const pattern of parsedPatterns) {
		if (!pattern.isBuiltin) {
			redactionPatterns.push(pattern);
		}
	}

	const ipAllowlist = configuration.get<string[]>('server.ipAllowlist', []);
	const requestTimeoutSeconds = configuration.get<number>('server.requestTimeoutSeconds', 180);
	const maxPayloadSizeMb = configuration.get<number>('server.maxPayloadSizeMb', 1);
	const maxConnectionsPerIp = configuration.get<number>('server.maxConnectionsPerIp', 10);
	const mcpEnabled = vscode.workspace.getConfiguration('githubCopilotApi.mcp').get<boolean>('enabled', true);

	return {
		enabled, enableHttp, enableWebSocket, enableHttps, tlsCertPath, tlsKeyPath, host, port, maxConcurrentRequests,
		defaultModel, apiKey, enableLogging, rateLimitPerMinute, defaultSystemPrompt,
		redactionPatterns, ipAllowlist, requestTimeoutSeconds, maxPayloadSizeMb, maxConnectionsPerIp,
		mcpEnabled
	};
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return String(error);
}
