export type AnthropicToolPairContentBlock =
	| { type: 'text'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: any }
	| { type: 'tool_result'; tool_use_id: string; content: string | { type: 'text'; text: string }[] };

export interface AnthropicToolPairMessage {
	role: 'user' | 'assistant';
	content: string | AnthropicToolPairContentBlock[];
}

export interface AnthropicToolPairIndexes {
	assistantIndexes: Set<number>;
	userIndexes: Set<number>;
}

export function normalizeAnthropicContent(content: string | AnthropicToolPairContentBlock[]): AnthropicToolPairContentBlock[] {
	return Array.isArray(content)
		? content
		: [{ type: 'text', text: typeof content === 'string' ? content : '' }];
}

function getToolUseIds(content: AnthropicToolPairContentBlock[]): string[] {
	return content
		.filter((block): block is { type: 'tool_use'; id: string; name: string; input: any } => block.type === 'tool_use')
		.map(block => block.id);
}

function getToolResultIds(content: AnthropicToolPairContentBlock[]): string[] {
	return content
		.filter((block): block is { type: 'tool_result'; tool_use_id: string; content: string | { type: 'text'; text: string }[] } => block.type === 'tool_result')
		.map(block => block.tool_use_id);
}

function hasContiguousLeadingToolResults(content: AnthropicToolPairContentBlock[]): boolean {
	let hasSeenNonToolResult = false;

	for (const block of content) {
		if (block.type === 'tool_result') {
			if (hasSeenNonToolResult) {
				return false;
			}
			continue;
		}
		if (block.type === 'text' && block.text.trim() === '') {
			continue;
		}
		hasSeenNonToolResult = true;
	}

	return true;
}

function hasSameUniqueIds(expectedIds: string[], actualIds: string[]): boolean {
	if (expectedIds.length === 0 || expectedIds.length !== actualIds.length) {
		return false;
	}

	const expected = new Set(expectedIds);
	const actual = new Set(actualIds);
	if (expected.size !== expectedIds.length || actual.size !== actualIds.length) {
		return false;
	}

	return actualIds.every(id => expected.has(id));
}

export function getStructuredAnthropicToolPairIndexes(
	messages: readonly AnthropicToolPairMessage[]
): AnthropicToolPairIndexes {
	const assistantIndexes = new Set<number>();
	const userIndexes = new Set<number>();

	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (message.role !== 'assistant') {
			continue;
		}

		const toolUseIds = getToolUseIds(normalizeAnthropicContent(message.content));
		if (toolUseIds.length === 0) {
			continue;
		}

		const nextMessage = messages[index + 1];
		if (!nextMessage || nextMessage.role !== 'user') {
			continue;
		}

		const nextContent = normalizeAnthropicContent(nextMessage.content);
		const toolResultIds = getToolResultIds(nextContent);
		if (
			toolResultIds.length > 0
			&& hasContiguousLeadingToolResults(nextContent)
			&& hasSameUniqueIds(toolUseIds, toolResultIds)
		) {
			assistantIndexes.add(index);
			userIndexes.add(index + 1);
		}
	}

	return { assistantIndexes, userIndexes };
}
