/// <reference types="mocha" />

import * as assert from 'assert';
import { readFileSync } from 'fs';

suite('CopilotPanel message routing', () => {
	test('handles the Save Host/Port webview message', () => {
		const source = readFileSync(new URL('../../src/CopilotPanel.ts', import.meta.url), 'utf8');

		assert.match(source, /postMessage\(\{\s*type:\s*'setHostPort'/s);
		assert.match(
			source,
			/case\s+'setHostPort'\s*:/,
			'Save Host/Port posts setHostPort, but the extension does not handle that message.'
		);
	});

	test('does not silently replace invalid saved ports with a default', () => {
		const source = readFileSync(new URL('../../src/CopilotPanel.ts', import.meta.url), 'utf8');

		assert.doesNotMatch(source, /Number\(p\)\s*\|\|\s*(?:3000|3030)/);
		assert.match(source, /Enter a valid port between 1 and 65535/);
	});
});
