import { TelemetryReporter } from '@vscode/extension-telemetry';
import * as os from 'os';
import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// Azure Application Insights connection string.
// This is NOT a secret — it's a write-only ingest endpoint identifier.
// The @vscode/extension-telemetry package automatically respects the user's
// `telemetry.telemetryLevel` VS Code setting — no data is sent if the user
// has opted out of telemetry.
// ─────────────────────────────────────────────────────────────────────────────
const CONNECTION_STRING = 'InstrumentationKey=0cd16943-5132-4204-91da-961cfeb4c886;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=edf9eba3-8dc8-4911-a81e-2d7a1d9ef160';

let reporter: TelemetryReporter | undefined;

// ─── Session-level counters ───────────────────────────────────────────────────
// Used to enrich the deactivation event with aggregate session data.
let _sessionCommandCount = 0;
let _sessionRequestCount = 0;
let _sessionActivatedAt = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Bucket a raw millisecond duration into a coarse label. */
function durationBucket(ms: number): string {
	if (ms < 100) { return '<100ms'; }
	if (ms < 500) { return '<500ms'; }
	if (ms < 1000) { return '<1s'; }
	if (ms < 5000) { return '<5s'; }
	return '>5s';
}

/** Bucket a raw token count into a coarse label. */
function tokenBucket(n: number): string {
	if (n === 0) { return '0'; }
	if (n < 500) { return '<500'; }
	if (n < 2000) { return '<2k'; }
	if (n < 8000) { return '<8k'; }
	if (n < 32000) { return '<32k'; }
	return '32k+';
}

/** Bucket a message count into a coarse label. */
function messageCountBucket(n: number): string {
	if (n <= 1) { return '1'; }
	if (n <= 3) { return '2-3'; }
	if (n <= 8) { return '4-8'; }
	if (n <= 20) { return '9-20'; }
	return '20+';
}

/** Bucket uptime in seconds into a coarse label. */
function uptimeBucket(seconds: number): string {
	if (seconds < 60) { return '<1m'; }
	if (seconds < 300) { return '<5m'; }
	if (seconds < 1800) { return '<30m'; }
	if (seconds < 3600) { return '<1h'; }
	return '1h+';
}

/** Derive a safe model family label from a raw model ID string. */
function modelFamily(rawModel: string): string {
	const m = rawModel.toLowerCase();
	if (m.includes('gpt-4')) { return 'gpt-4'; }
	if (m.includes('gpt-3') || m.includes('o1') || m.includes('o3') || m.includes('o4')) { return 'openai-other'; }
	if (m.includes('claude')) { return 'claude'; }
	if (m.includes('gemini')) { return 'gemini'; }
	if (m.includes('llama')) { return 'llama'; }
	if (m.includes('mistral')) { return 'mistral'; }
	if (m.includes('deepseek')) { return 'deepseek'; }
	if (m) { return 'other'; }
	return 'unknown';
}

/** Bucket heap megabytes into a coarse label. */
function heapMbBucket(mb: number): string {
	if (mb < 50) { return '<50mb'; }
	if (mb < 100) { return '<100mb'; }
	if (mb < 200) { return '<200mb'; }
	if (mb < 400) { return '<400mb'; }
	return '400mb+';
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the telemetry reporter. Call once from `activate()`.
 * The reporter is automatically added to context.subscriptions so it is
 * flushed and disposed when the extension deactivates.
 */
export function initTelemetry(context: vscode.ExtensionContext): void {
	reporter = new TelemetryReporter(CONNECTION_STRING);
	context.subscriptions.push(reporter);
	_sessionActivatedAt = Date.now();
	_sessionCommandCount = 0;
	_sessionRequestCount = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extension activated. Sends rich environment context so you can segment by
 * VS Code version, platform, extension version, and whether Copilot Chat
 * is installed.
 */
export function telemetryActivate(props: {
	vscodeVersion: string;       // e.g. '1.95.3'
	extensionVersion: string;    // e.g. '2.13.0'
	osPlatform: string;          // 'win32' | 'darwin' | 'linux'
	osArch: string;              // 'x64' | 'arm64' | ...
	nodeVersion: string;         // e.g. '20.11.0'
	copilotChatPresent: string;  // 'true' | 'false'
	copilotChatActive: string;   // 'true' | 'false'
}): void {
	reporter?.sendTelemetryEvent('extension.activated', props);
}

/**
 * Extension deactivated. Sends a session summary so you can understand
 * how long users keep the extension active and how heavily they use it.
 */
export function telemetryDeactivate(): void {
	const sessionSec = _sessionActivatedAt > 0
		? Math.round((Date.now() - _sessionActivatedAt) / 1000)
		: 0;
	reporter?.sendTelemetryEvent('extension.deactivated', {
		sessionDurationBucket: uptimeBucket(sessionSec),
		totalCommands: String(_sessionCommandCount),
		totalRequests: String(_sessionRequestCount),
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Server lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * API server started successfully.
 * Extended to include protocol flags, model family, and feature flags so you
 * can understand what config combinations users run.
 */
export function telemetryServerStarted(props: {
	port: string;           // port number as string
	hostBucket: string;     // 'localhost' | 'all-interfaces' | 'custom'
	isHttps: string;        // 'true' | 'false'
	autoStart: string;      // 'true' | 'false'
	enableWebSocket: string;// 'true' | 'false'
	enableMcp: string;      // 'true' | 'false'
	modelFamily: string;    // coarse model family label
	maxConcurrency: string; // '1'..'N'
	hasApiKey: string;      // 'true' | 'false'
	hasRateLimit: string;   // 'true' | 'false'
}): void {
	reporter?.sendTelemetryEvent('server.started', props);
}

/**
 * API server stopped.
 * Includes uptime and aggregate request stats so you can understand
 * session health and total throughput.
 */
export function telemetryServerStopped(props: {
	uptimeBucket: string;       // '<1m' | '<5m' | '<30m' | '<1h' | '1h+'
	totalRequests: string;      // raw count as string
	totalErrors: string;        // raw count as string
	errorRateBucket: string;    // '0%' | '<5%' | '<20%' | '20%+'
}): void {
	reporter?.sendTelemetryEvent('server.stopped', props);
}

/**
 * API server failed to start.
 */
export function telemetryServerError(props: {
	errorType: string;    // 'port_in_use' | 'permission_denied' | 'copilot_unavailable' | 'unknown'
	retryCount?: string;  // how many times start was retried before giving up
}): void {
	reporter?.sendTelemetryEvent('server.startFailed', props);
}

// ─────────────────────────────────────────────────────────────────────────────
// Request events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A completed API request. Bucketed properties only — never content.
 */
export function telemetryRequest(props: {
	// Core
	statusCode: string;          // '200' | '400' | '429' | '500' etc.
	durationBucket: string;      // '<100ms' | '<500ms' | '<1s' | '<5s' | '>5s'
	isStreaming: string;         // 'true' | 'false'
	modelFamily: string;         // 'gpt-4' | 'claude' | 'gemini' | 'llama' | ...
	// Extended
	endpoint: string;            // '/v1/chat/completions' | '/v1/models' | '/v1/embeddings' | 'other'
	tokensInBucket: string;      // '0' | '<500' | '<2k' | '<8k' | '<32k' | '32k+'
	tokensOutBucket: string;     // same scale
	messageCountBucket: string;  // '1' | '2-3' | '4-8' | '9-20' | '20+'
	cacheHit: string;            // 'true' | 'false'
	hasTools: string;            // 'true' | 'false'
	hasSystemPrompt: string;     // 'true' | 'false'
	finishReason: string;        // 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'unknown'
}): void {
	_sessionRequestCount++;
	reporter?.sendTelemetryEvent('request.completed', props);
}

/**
 * A request that resulted in an error.
 * Called in addition to (not instead of) `telemetryRequest`.
 */
export function telemetryRequestError(props: {
	errorCategory: string;   // 'auth' | 'rate_limit' | 'timeout' | 'model_error' | 'server_error' | 'unknown'
	endpoint: string;
	modelFamily: string;
	statusCode: string;
}): void {
	reporter?.sendTelemetryEvent('request.error', props);
}

/**
 * A rate-limit 429 was returned to a client.
 */
export function telemetryRateLimitHit(props: {
	endpoint: string;
	limitType: string; // 'per_minute' | 'concurrent' | 'per_ip'
}): void {
	reporter?.sendTelemetryEvent('rateLimit.hit', props);
}

/**
 * A cache hit was served (request deduplication / response cache).
 */
export function telemetryCacheHit(props: {
	endpoint: string;
	modelFamily: string;
}): void {
	reporter?.sendTelemetryEvent('cache.hit', props);
}

// ─────────────────────────────────────────────────────────────────────────────
// Command events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A named VS Code command was invoked.
 * `source` can be 'command-palette' | 'status-bar' | 'quickpick' | 'context-menu' | 'unknown'
 */
export function telemetryCommand(commandName: string, props?: Record<string, string>): void {
	_sessionCommandCount++;
	reporter?.sendTelemetryEvent('command.invoked', { command: commandName, ...props });
}

// ─────────────────────────────────────────────────────────────────────────────
// Model events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User switched the default model.
 */
export function telemetryModelSwitched(props: {
	fromFamily: string;   // model family of the old default
	toFamily: string;     // model family of the new default
	triggeredFrom: string;// 'quickpick' | 'api' | 'config'
}): void {
	reporter?.sendTelemetryEvent('model.switched', props);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tunnel events
// ─────────────────────────────────────────────────────────────────────────────

/** Tunnel started. */
export function telemetryTunnelStarted(props: {
	success: string;   // 'true' | 'false'
	provider?: string; // 'cloudflare' | 'other'
}): void {
	reporter?.sendTelemetryEvent('tunnel.started', props);
}

/** Tunnel stopped. */
export function telemetryTunnelStopped(props?: {
	durationBucket?: string;
}): void {
	reporter?.sendTelemetryEvent('tunnel.stopped', props ?? {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A user-accessible setting was changed.
 * Only the key name is sent — never the value (values can contain paths / secrets).
 */
export function telemetryConfigChanged(props: {
	settingKey: string;       // e.g. 'server.port' | 'server.defaultModel'
	serverRestarted: string;  // 'true' | 'false' — did a restart follow?
}): void {
	reporter?.sendTelemetryEvent('config.changed', props);
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A WebSocket lifecycle event occurred.
 * `event` is one of: 'connected' | 'disconnected' | 'message' | 'error'
 */
export function telemetryWsEvent(event: string, props?: {
	endpoint?: string;   // '/v1/realtime' | '/anthropic/v1/realtime' | ...
	messageType?: string;// 'conversation.item.create' | 'response.create' | ... (type field only)
}): void {
	reporter?.sendTelemetryEvent(`ws.${event}`, props ?? {});
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An MCP tool call was made.
 * Tool name is the identifier (no arguments — they may contain PII).
 */
export function telemetryMcpToolCall(props: {
	toolName: string;  // e.g. 'read_file' | 'run_command'
	success: string;   // 'true' | 'false'
}): void {
	reporter?.sendTelemetryEvent('mcp.toolCall', props);
}

// ─────────────────────────────────────────────────────────────────────────────
// URI handler events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A deep-link URI was received.
 */
export function telemetryUriHandler(props: {
	path: string;  // '/dashboard' | '/start' | '/stop' | 'unknown'
}): void {
	reporter?.sendTelemetryEvent('uriHandler.invoked', props);
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance heartbeat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Periodic health/performance snapshot. Fires every N minutes while the server
 * is running so you can observe memory pressure and throughput trends over time.
 * All values are bucketed — never exact.
 */
export function telemetryPerfHeartbeat(props: {
	heapMbBucket: string;   // '<50mb' | '<100mb' | '<200mb' | '<400mb' | '400mb+'
	uptimeBucket: string;   // '<1m' | '<5m' | '<30m' | '<1h' | '1h+'
	rpmBucket: string;      // '0' | '<5' | '<20' | '<60' | '60+'
	errorRateBucket: string;// '0%' | '<1%' | '<5%' | '<20%' | '20%+'
	serverRunning: string;  // 'true' | 'false'
	wsConnections: string;  // raw client count as string
}): void {
	reporter?.sendTelemetryEvent('perf.heartbeat', props);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public utility re-exports (helpers for callers to use consistent bucketing)
// ─────────────────────────────────────────────────────────────────────────────

export {
	durationBucket,
	heapMbBucket,
	messageCountBucket,
	modelFamily,
	tokenBucket,
	uptimeBucket,
};
