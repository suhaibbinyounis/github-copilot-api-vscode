/**
 * Playwright Script Generator App
 * 
 * Generate Playwright automation scripts from test steps (Excel/DOCX/text).
 * Features:
 * - Multi-language support (TypeScript, JavaScript, Python)
 * - Browser selection with Chrome as default
 * - Multi-step iterative generation with progress
 * - Screenshots for each step
 * - HTML report generation
 */

import { AppDefinition, AppOutput, OutputSection } from '../types';

export const playwrightGeneratorApp: AppDefinition = {
    id: 'playwright-generator',
    name: 'Playwright Script Generator',
    description: 'Generate automation scripts from test steps',
    icon: '🎭',
    category: 'qa',
    helpDocumentation: `
### What is this?
The **Playwright Script Generator** turns manual test steps or requirements into high-quality automation scripts. It supports TypeScript, JavaScript, and Python.

### How to use it:
1. **Define Steps**: Paste your steps in the textarea or **attach an Excel/Word file** containing the test cases.
2. **Provide Locators**: (Optional) If you have specific IDs or selectors, list them to ensure the AI uses your preferred identifiers.
3. **Configure**: Choose your target language, browser, and features (like screenshots or video).
4. **Generate**: Click the primary action. 
5. **Magic Feature**: Once the script is generated, use the **🚀 Create Full Project** button to automatically scaffold a complete, ready-to-run Playwright environment.

### Use cases:
- Rapidly automating manual regression tests.
- Scaffolding new end-to-end test suites.
- Converting legacy test documentation into executable code.
    `,

    inputs: [
        {
            id: 'attachedFiles',
            label: 'Attach Files (optional)',
            type: 'file-picker' as const,
            placeholder: 'Attach Excel, DOCX, TXT, or MD files with test steps/locators',
            hint: 'Upload test scripts from Excel, Word docs, or text files. File contents will be extracted and used.',
            rows: 0 // Used to store accepted extensions in hint
        },
        {
            id: 'testSteps',
            label: 'Test Steps',
            type: 'textarea',
            placeholder: `Paste your test steps here, e.g.:

1. Navigate to https://example.com/login
2. Enter "testuser@email.com" in email field
3. Enter "password123" in password field
4. Click the Login button
5. Verify dashboard page loads
6. Click on Settings menu
7. Verify Settings page title is visible`,
            required: false, // Not required if files are attached
            rows: 10,
            hint: 'Paste test steps directly, or use the file attachment above'
        },
        {
            id: 'locators',
            label: 'Element Locators (optional)',
            type: 'textarea',
            placeholder: `Provide locators if you have them:

email field: #email-input
password field: input[name="password"]
Login button: button.login-btn
Settings menu: [data-testid="settings-link"]`,
            rows: 6,
            hint: 'CSS selectors, data-testid, or other locators for elements'
        },
        {
            id: 'requirements',
            label: 'Additional Requirements (optional)',
            type: 'textarea',
            placeholder: `Any special requirements:
- Wait for network idle after login
- Handle cookie consent popup
- Test should work for mobile viewport
- Need to handle 2FA if prompted`,
            rows: 4
        },
        {
            id: 'baseUrl',
            label: 'Base URL',
            type: 'text',
            placeholder: 'https://your-app.com',
            hint: 'The starting URL for your test'
        },
        {
            id: 'language',
            label: 'Programming Language',
            type: 'radio',
            defaultValue: 'typescript',
            options: [
                { value: 'typescript', label: '🔷 TypeScript', description: 'Recommended - Type safety & better IDE support' },
                { value: 'javascript', label: '🟨 JavaScript', description: 'Simple and widely used' },
                { value: 'python', label: '🐍 Python', description: 'Great for data-driven testing' }
            ]
        },
        {
            id: 'browser',
            label: 'Browser',
            type: 'select',
            defaultValue: 'chrome',
            options: [
                { value: 'chrome', label: '🌐 Google Chrome' },
                { value: 'msedge', label: '🔷 Microsoft Edge' }
            ]
        },
        {
            id: 'headless',
            label: 'Run Mode',
            type: 'radio',
            defaultValue: 'headed',
            options: [
                { value: 'headed', label: '👁️ Headed (Visible browser)', description: 'Watch the test run' },
                { value: 'headless', label: '⚡ Headless (No UI)', description: 'Faster, for CI/CD' }
            ]
        },
        {
            id: 'features',
            label: 'Additional Features',
            type: 'multi-select',
            defaultValue: 'screenshots,report,retry',
            options: [
                { value: 'screenshots', label: '📸 Screenshots per step', description: 'Capture screenshot after each action' },
                { value: 'video', label: '🎥 Video recording', description: 'Record full test execution' },
                { value: 'report', label: '📊 HTML Report', description: 'Generate visual test report' },
                { value: 'retry', label: '🔄 Auto-retry on failure', description: 'Retry failed tests automatically' },
                { value: 'trace', label: '🔍 Trace on failure', description: 'Capture trace for debugging' },
                { value: 'parallel', label: '⚡ Parallel execution', description: 'Run tests in parallel' }
            ]
        },
        {
            id: 'testName',
            label: 'Test Name',
            type: 'text',
            placeholder: 'Login Flow Test',
            defaultValue: 'Automated Test',
            hint: 'Name for your test suite (also used as folder name)'
        },
        {
            id: 'targetFolder',
            label: 'Target Folder',
            type: 'project-picker' as const,
            required: true,
            placeholder: 'Select where to create the test project',
            hint: 'A folder named after your test will be created here with all files'
        },
        {
            id: 'jiraIssueId',
            label: 'Jira Issue ID (optional)',
            type: 'text',
            placeholder: 'e.g., PROJ-123, TEST-456',
            hint: 'Enter a Jira issue ID to auto-fetch requirements as context. Configure Jira in Apps Hub settings.',
            required: false
        },
        {
            id: 'model',
            label: 'AI Model',
            type: 'model-picker' as const,
            defaultValue: 'auto',
            hint: 'Select which AI model to use for generating the script'
        }
    ],

    primaryAction: 'Generate & Create Project',

    systemPrompt: `You are an expert Playwright automation engineer. Generate production-ready, enterprise-grade Playwright test scripts.

## Guidelines

1. **Robust Locators**: Use resilient selectors (data-testid > role > text > css)
2. **Proper Waits**: Use auto-waiting, avoid hardcoded delays
3. **Error Handling**: Include try-catch for critical steps
4. **Screenshots**: Capture screenshots at key points for debugging
5. **Assertions**: Add meaningful assertions after each significant action
6. **Comments**: Add clear comments explaining each step
7. **Best Practices**: Follow Playwright best practices

## Output Structure

Generate the script in THREE sections:

### SECTION 1: SETUP FILES
First, provide package.json and config files needed.

### SECTION 2: MAIN TEST FILE
The complete test script with:
- Proper imports
- Test setup/teardown
- Step-by-step actions with comments
- Screenshots after key steps
- Assertions to verify behavior
- Error handling

### SECTION 3: COMMANDS
Provide exact terminal commands to:
1. Install dependencies
2. Run the test
3. View the report

## Code Quality Requirements

- No syntax errors
- Proper async/await usage
- Type safety (for TypeScript)
- Descriptive variable names
- Modular helper functions where appropriate

## Screenshot Convention

For each step, capture screenshot with descriptive name:
await page.screenshot({ path: 'screenshots/01-login-page.png' });
await page.screenshot({ path: 'screenshots/02-after-credentials.png' });

## Report Configuration

Include HTML reporter configuration for visual reports.`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        const parts: string[] = [];

        // Language and config
        parts.push(`## Configuration`);
        parts.push(`- **Language**: ${inputs.language || 'typescript'}`);
        parts.push(`- **Browser**: ${inputs.browser || 'chrome'}`);
        parts.push(`- **Mode**: ${inputs.headless === 'headless' ? 'Headless' : 'Headed'}`);

        // Features
        const features = (inputs.features || 'screenshots,report').split(',');
        parts.push(`- **Features**: ${features.join(', ')}`);

        // Test name
        if (inputs.testName) {
            parts.push(`- **Test Name**: ${inputs.testName}`);
        }

        // Base URL
        if (inputs.baseUrl) {
            parts.push(`- **Base URL**: ${inputs.baseUrl}`);
        }

        // Attached files
        if (inputs.attachedFiles && inputs.attachedFiles.trim() && inputs.attachedFiles !== '[]') {
            try {
                const files = JSON.parse(inputs.attachedFiles);
                if (files.length > 0) {
                    parts.push(`\n## Attached Files`);
                    for (const file of files) {
                        parts.push(`\n### File: ${file.name}`);
                        parts.push('```');
                        parts.push(file.content);
                        parts.push('```');
                    }
                }
            } catch {
                // Ignore parse errors
            }
        }

        // Test steps (may be empty if files provided)
        if (inputs.testSteps && inputs.testSteps.trim()) {
            parts.push(`\n## Test Steps to Automate\n${inputs.testSteps}`);
        }

        // Locators
        if (inputs.locators && inputs.locators.trim()) {
            parts.push(`\n## Element Locators Provided\n${inputs.locators}`);
        } else {
            parts.push(`\n## Locators\nNo specific locators provided. Please use best practices to identify elements (prefer data-testid, role, text, then CSS selectors).`);
        }

        // Requirements
        if (inputs.requirements && inputs.requirements.trim()) {
            parts.push(`\n## Additional Requirements\n${inputs.requirements}`);
        }

        // Jira Context (auto-fetched if issue ID was provided)
        if (inputs.jiraContext && inputs.jiraContext.trim()) {
            parts.push(`\n## Jira Issue Context\n${inputs.jiraContext}`);
        }

        parts.push(`\n## Instructions
Generate a complete, ready-to-run Playwright test script. Include:
1. All necessary setup files (package.json, playwright.config)
2. The main test file with proper structure
3. Exact commands to install and run

Make sure the code has NO ERRORS and follows best practices.`);

        return parts.join('\n');
    },

    parseResponse: (response: string, inputs: Record<string, string>): AppOutput => {
        const language = inputs.language || 'typescript';
        const fileExtensions: Record<string, string> = {
            typescript: '.ts',
            javascript: '.js',
            python: '.py'
        };

        // Try to extract sections
        const sections: OutputSection[] = [];

        // Look for setup section
        const setupMatch = response.match(/###?\s*(?:SECTION 1|SETUP|Setup Files)[\s\S]*?(?=###?\s*(?:SECTION 2|MAIN|Main Test)|$)/i);
        if (setupMatch) {
            sections.push({
                title: '📦 Setup Files',
                content: setupMatch[0].replace(/###?\s*(?:SECTION 1|SETUP|Setup Files)[^\n]*\n/i, '').trim(),
                severity: 'info',
                collapsible: true,
                collapsed: false
            });
        }

        // Look for main test section
        const mainMatch = response.match(/###?\s*(?:SECTION 2|MAIN|Main Test)[\s\S]*?(?=###?\s*(?:SECTION 3|COMMANDS|Commands)|$)/i);
        if (mainMatch) {
            sections.push({
                title: '🎭 Main Test File',
                content: mainMatch[0].replace(/###?\s*(?:SECTION 2|MAIN|Main Test)[^\n]*\n/i, '').trim(),
                severity: 'success',
                collapsible: false
            });
        }

        // Look for commands section
        const commandsMatch = response.match(/###?\s*(?:SECTION 3|COMMANDS|Commands)[\s\S]*/i);
        if (commandsMatch) {
            sections.push({
                title: '💻 Run Commands',
                content: commandsMatch[0].replace(/###?\s*(?:SECTION 3|COMMANDS|Commands)[^\n]*\n/i, '').trim(),
                severity: 'info',
                collapsible: true,
                collapsed: false,
                actions: [
                    { label: 'Copy Commands', icon: '📋', action: 'copy' }
                ]
            });
        }

        // Extract just the code for download
        const codeBlockMatch = response.match(/```(?:typescript|javascript|python|ts|js|py)\n([\s\S]*?)\n```/);
        const mainCode = codeBlockMatch ? codeBlockMatch[1] : '';

        const testFileName = `test${fileExtensions[language]}`;

        return {
            type: sections.length > 0 ? 'structured' : 'markdown',
            content: response,
            sections: sections.length > 0 ? sections : undefined,
            summary: `Generated ${language.toUpperCase()} Playwright script`,
            actions: [
                {
                    label: `Download ${testFileName}`,
                    icon: '⬇️',
                    action: 'newFile',
                    fileExtension: fileExtensions[language],
                    suggestedFilename: testFileName,
                    data: mainCode || response
                },
                {
                    label: '🚀 Create Full Project',
                    icon: '📁',
                    action: 'export',
                    data: 'extractAndCreateProject'
                },
                { label: 'Copy All', icon: '📋', action: 'copy' },
                { label: 'Insert at Cursor', icon: '📝', action: 'insert' }
            ]
        };
    },

    defaultActions: [
        { label: '🚀 Create Project', icon: '📁', action: 'export', data: 'extractAndCreateProject' },
        { label: 'Download Script', icon: '⬇️', action: 'newFile', fileExtension: '.ts' },
        { label: 'Copy', icon: '📋', action: 'copy' }
    ],

    requirements: {
        copilot: true
    },

    examples: [
        {
            name: 'Login Flow Test',
            inputs: {
                testSteps: `1. Navigate to https://example.com/login
2. Enter "testuser@email.com" in the email field
3. Enter "password123" in the password field
4. Click the Login button
5. Verify the dashboard page loads successfully
6. Check that the welcome message shows the username`,
                locators: `email field: #email
password field: #password
Login button: button[type="submit"]
welcome message: .welcome-text`,
                language: 'typescript',
                browser: 'chromium',
                headless: 'headed',
                features: 'screenshots,report,retry',
                testName: 'Login Flow Test'
            }
        },
        {
            name: 'E-commerce Checkout',
            inputs: {
                testSteps: `1. Go to the product page
2. Select size "Medium"
3. Click Add to Cart
4. Go to Cart
5. Click Checkout
6. Fill shipping details
7. Select payment method
8. Complete purchase
9. Verify order confirmation`,
                language: 'python',
                browser: 'all',
                features: 'screenshots,video,report',
                testName: 'Checkout Flow Test'
            }
        }
    ]
};
