/// <reference types="mocha" />

import * as assert from 'assert';
import {
	buildCursorCompatibleAlias,
	flattenOpenAICompatibleMessageContent,
	normalizeModelLookupKey
} from '../compatibility.js';

suite('compatibility helpers', () => {
	test('normalizes prefixed cursor/openai model names', () => {
		assert.equal(normalizeModelLookupKey('copilot-gpt-4o'), 'gpt-4o');
		assert.equal(normalizeModelLookupKey('cursor/gpt-4o-20241022'), 'gpt-4o');
		assert.equal(normalizeModelLookupKey('openai/gemini-1.5-pro-preview-0409'), 'gemini-1-5-pro');
	});

	test('builds cursor-compatible aliases with copilot prefix', () => {
		assert.equal(buildCursorCompatibleAlias('gpt-4o'), 'copilot-gpt-4o');
		assert.equal(buildCursorCompatibleAlias('copilot-gpt-4o'), 'copilot-gpt-4o');
	});

	test('flattens OpenAI image parts to placeholders', () => {
		const flattened = flattenOpenAICompatibleMessageContent([
			{ type: 'text', text: 'Analyze this' },
			{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
			{ type: 'input_image', image_url: 'https://example.com/image.png' }
		]);

		assert.equal(flattened, 'Analyze this\n[image omitted]\n[image omitted]');
	});

	test('flattens nested tool_result multimodal content', () => {
		const flattened = flattenOpenAICompatibleMessageContent([
			{
				type: 'tool_result',
				content: [
					{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
					{ type: 'text', text: 'OCR text' }
				]
			}
		]);

		assert.equal(flattened, '[image omitted]\nOCR text');
	});
});
