/// <reference types="mocha" />

import * as assert from 'assert';
import {
	applyStructuredAnthropicToolPairLimit,
	flattenAnthropicMessageForTextHistory,
	getAnthropicToolUseId,
	getAnthropicToolHistoryDebugInfo,
	getStructuredAnthropicToolPairIndexes,
	type AnthropicToolPairMessage
} from '../anthropicToolPairs.js';

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

	test('preserves VS Code tool call ids for Anthropic tool_use blocks', () => {
		const toolUseId = getAnthropicToolUseId('call_from_vscode', () => 'toolu_fallback');

		assert.equal(toolUseId, 'call_from_vscode');
	});

	test('falls back to a generated Anthropic tool_use id when VS Code omits callId', () => {
		const toolUseId = getAnthropicToolUseId('', () => 'toolu_fallback');

		assert.equal(toolUseId, 'toolu_fallback');
	});

	test('reports leading orphan tool_result blocks in debug info', () => {
		const debugInfo = getAnthropicToolHistoryDebugInfo([
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'toolu_orphan', content: 'done' },
				],
			},
		]);

		assert.deepEqual(debugInfo.leadingOrphanToolResultIds, ['toolu_orphan']);
		assert.deepEqual(debugInfo.orphanToolResultIds, ['toolu_orphan']);
		assert.equal(debugInfo.messages[0].structuredMode, 'text');
		assert.equal(debugInfo.messages[0].hasLeadingOrphanToolResult, true);
	});

	test('reports structured tool pairs in debug info', () => {
		const debugInfo = getAnthropicToolHistoryDebugInfo([
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
		]);

		assert.deepEqual(debugInfo.structuredAssistantIndexes, [0]);
		assert.deepEqual(debugInfo.structuredUserIndexes, [1]);
		assert.deepEqual(debugInfo.leadingOrphanToolResultIds, []);
		assert.equal(debugInfo.messages[0].structuredMode, 'structured');
		assert.equal(debugInfo.messages[1].structuredMode, 'structured');
	});

	test('limits structured tool pairs to the most recent pairs', () => {
		const pairs = getStructuredAnthropicToolPairIndexes([
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'toolu_old', name: 'read_file', input: { path: 'old.txt' } },
				],
			},
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'toolu_old', content: 'old' },
				],
			},
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'toolu_new', name: 'read_file', input: { path: 'new.txt' } },
				],
			},
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'toolu_new', content: 'new' },
				],
			},
		]);

		const limited = applyStructuredAnthropicToolPairLimit(pairs, 1);

		assert.equal(limited.assistantIndexes.has(0), false);
		assert.equal(limited.userIndexes.has(1), false);
		assert.equal(limited.assistantIndexes.has(2), true);
		assert.equal(limited.userIndexes.has(3), true);
	});

	test('drops all structured tool pairs when the limit is zero', () => {
		const pairs = getStructuredAnthropicToolPairIndexes([
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'toolu_old', name: 'read_file', input: { path: 'old.txt' } },
				],
			},
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'toolu_old', content: 'old' },
				],
			},
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'toolu_new', name: 'read_file', input: { path: 'new.txt' } },
				],
			},
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'toolu_new', content: 'new' },
				],
			},
		]);

		const limited = applyStructuredAnthropicToolPairLimit(pairs, 0);

		assert.deepEqual([...limited.assistantIndexes], []);
		assert.deepEqual([...limited.userIndexes], []);
	});

	test('downgrades assistant tool_use history without pseudo tool call syntax', () => {
		const flattened = flattenAnthropicMessageForTextHistory({
			role: 'assistant',
			content: [
				{ type: 'text', text: 'I will inspect the file.' },
				{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/tmp/demo' } },
			],
		});

		assert.equal(flattened, 'I will inspect the file.');
		assert.equal(flattened.includes('[Tool call:'), false);
	});

	test('keeps tool result text when downgrading user tool history', () => {
		const flattened = flattenAnthropicMessageForTextHistory({
			role: 'user',
			content: [
				{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'line 1\nline 2' },
			],
		});

		assert.equal(flattened, 'line 1\nline 2');
	});

	test('preserves image placeholders when downgrading user tool history', () => {
		const flattened = flattenAnthropicMessageForTextHistory({
			role: 'user',
			content: [
				{
					type: 'tool_result',
					tool_use_id: 'toolu_1',
					content: [
						{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
						{ type: 'text', text: 'OCR result' },
					],
				},
			],
		});

		assert.equal(flattened, '[image omitted]\nOCR result');
	});
});
