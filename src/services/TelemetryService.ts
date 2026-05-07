import { TelemetryReporter } from '@vscode/extension-telemetry';
import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// Azure Application Insights connection string.
//
// HOW TO GET ONE (free, ~2 min):
//   1. Go to https://portal.azure.com → Create a resource → Application Insights
//   2. Copy the "Connection String" from the Overview page
//   3. Paste it here (replace the placeholder below)
//
// This is NOT a secret — it's a write-only ingest endpoint identifier.
// The @vscode/extension-telemetry package automatically respects the user's
// `telemetry.telemetryLevel` VS Code setting — no data is sent if the user
// has opted out of telemetry.
// ─────────────────────────────────────────────────────────────────────────────
const CONNECTION_STRING = 'InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/';

let reporter: TelemetryReporter | undefined;

/**
 * Initialize the telemetry reporter. Call once from `activate()`.
 * The reporter is automatically added to context.subscriptions so it is
 * flushed and disposed when the extension deactivates.
 */
export function initTelemetry(context: vscode.ExtensionContext): void {
	reporter = new TelemetryReporter(CONNECTION_STRING);
	context.subscriptions.push(reporter);
}

// ─── Event helpers ───────────────────────────────────────────────────────────
// All helpers are no-ops if telemetry is disabled or not yet initialized.
// Never include PII, request content, file paths, API keys, or IP addresses.

/** Extension activated. */
export function telemetryActivate(): void {
	reporter?.sendTelemetryEvent('extension.activated');
}

/** API server started successfully. */
export function telemetryServerStarted(props: {
	port: string;
	host: string;     // 'localhost' | '0.0.0.0' | 'custom' — never the actual IP
	isHttps: string;  // 'true' | 'false'
	autoStart: string;
}): void {
	reporter?.sendTelemetryEvent('server.started', props);
}

/** API server stopped. */
export function telemetryServerStopped(): void {
	reporter?.sendTelemetryEvent('server.stopped');
}

/** API server failed to start. */
export function telemetryServerError(errorType: string): void {
	// Only send the error type/category, never the full message (may contain paths)
	reporter?.sendTelemetryEvent('server.startFailed', { errorType });
}

/** A named command was invoked. */
export function telemetryCommand(commandName: string): void {
	reporter?.sendTelemetryEvent('command.invoked', { command: commandName });
}

/** Tunnel started. */
export function telemetryTunnelStarted(success: string): void {
	reporter?.sendTelemetryEvent('tunnel.started', { success });
}

/** Tunnel stopped. */
export function telemetryTunnelStopped(): void {
	reporter?.sendTelemetryEvent('tunnel.stopped');
}

/**
 * API request completed. Send aggregate metrics only — never content.
 * Call this from the gateway on each completed request.
 */
export function telemetryRequest(props: {
	statusCode: string;   // '200' | '400' | '500' etc.
	durationBucket: string; // '<100ms' | '<500ms' | '<1s' | '<5s' | '>5s'
	isStreaming: string;  // 'true' | 'false'
	modelFamily: string;  // 'gpt-4' | 'claude' | 'gemini' | 'unknown' — no versioned IDs
}): void {
	reporter?.sendTelemetryEvent('request.completed', props);
}
