/// <reference types="mocha" />

import * as assert from 'assert';
import { getStructuredAnthropicToolPairIndexes, type AnthropicToolPairMessage } from '../anthropicToolPairs.js';

suite('CopilotApiGateway Anthropic tool message handling', () => {
	test('does not preserve orphan tool_result blocks as structured tool results', () => {
		const messages: AnthropicToolPairMessage[] = [
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'toolu_orphan', content: 'done' },
				],
			},
		];

		const pairs = getStructuredAnthropicToolPairIndexes(messages);

		assert.equal(pairs.userIndexes.has(0), false);
	});

	test('preserves immediately paired assistant tool_use and user tool_result blocks', () => {
		const messages: AnthropicToolPairMessage[] = [
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'README.md' } },
				],
			},
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'contents' },
				],
			},
		];

		const pairs = getStructuredAnthropicToolPairIndexes(messages);

		assert.equal(pairs.assistantIndexes.has(0), true);
		assert.equal(pairs.userIndexes.has(1), true);
	});

	test('does not preserve partial parallel tool results as structured tool results', () => {
		const messages: AnthropicToolPairMessage[] = [
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'README.md' } },
					{ type: 'tool_use', id: 'toolu_2', name: 'read_file', input: { path: 'CHANGELOG.md' } },
				],
			},
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'readme contents' },
				],
			},
		];

		const pairs = getStructuredAnthropicToolPairIndexes(messages);

		assert.equal(pairs.assistantIndexes.has(0), false);
		assert.equal(pairs.userIndexes.has(1), false);
	});
});
