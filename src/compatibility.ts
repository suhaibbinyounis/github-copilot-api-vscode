const MODEL_ALIAS_PREFIXES = ['copilot-', 'cursor-', 'cursor/', 'openai/'];

function stripKnownModelPrefixes(value: string): string {
	let result = value;
	let changed = true;
	while (changed) {
		changed = false;
		for (const prefix of MODEL_ALIAS_PREFIXES) {
			if (result.startsWith(prefix)) {
				result = result.slice(prefix.length);
				changed = true;
			}
		}
	}
	return result;
}

export function normalizeModelLookupKey(value: string): string {
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) {
		return '';
	}

	const stripped = stripKnownModelPrefixes(trimmed);
	return stripped
		.replace(/-\d{8}$/, '')         // Claude date suffix (e.g. -20241022)
		.replace(/-preview-\d{4}$/, '') // Gemini preview suffix (e.g. -preview-0409)
		.replace(/-\d{3}$/, '')         // Gemini release suffix (e.g. -002)
		.replace(/\./g, '-');
}

export function buildCursorCompatibleAlias(modelIdOrFamily: string): string | undefined {
	const normalized = modelIdOrFamily.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
	if (!normalized) {
		return undefined;
	}
	if (normalized.startsWith('copilot-')) {
		return normalized;
	}
	return `copilot-${normalized}`;
}

function flattenContentPart(part: unknown): string {
	if (typeof part === 'string') {
		return part;
	}
	if (!part || typeof part !== 'object') {
		return '';
	}

	const p = part as Record<string, unknown>;

	if (typeof p.text === 'string') {
		return p.text;
	}
	if (typeof p.input_text === 'string') {
		return p.input_text;
	}
	if (typeof p.output_text === 'string') {
		return p.output_text;
	}

	const type = typeof p.type === 'string' ? p.type : '';
	if (type === 'image' || type === 'input_image' || type === 'image_url') {
		return '[image omitted]';
	}

	if (p.image_url !== undefined) {
		return '[image omitted]';
	}

	if (type === 'tool_result') {
		return flattenOpenAICompatibleMessageContent(p.content);
	}

	if (type === 'tool_use') {
		return `[Tool call: ${String(p.name || 'unknown')}(${typeof p.input === 'string' ? p.input : JSON.stringify(p.input)})]`;
	}

	if (Array.isArray(p.content)) {
		return p.content.map(flattenContentPart).join('\n');
	}
	if (typeof p.content === 'string') {
		return p.content;
	}

	return '';
}

export function flattenOpenAICompatibleMessageContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (content === undefined || content === null) {
		return '';
	}
	if (Array.isArray(content)) {
		return content.map(flattenContentPart).join('\n');
	}
	return flattenContentPart(content) || String(content);
}
