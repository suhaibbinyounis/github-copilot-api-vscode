/**
 * Bug Report Writer App
 * 
 * Create well-structured bug reports from minimal input.
 * Generates professional bug reports with all necessary details.
 */

import { AppDefinition, AppOutput } from '../types';

export const bugReportWriterApp: AppDefinition = {
    id: 'bug-report-writer',
    name: 'Bug Report Writer',
    description: 'Create structured bug reports with repro steps',
    icon: '🐛',
    category: 'qa',
    helpDocumentation: `
### What is this?
The **Bug Report Writer** ensures your issues are addressed quickly by helping you write clear, comprehensive, and professional bug reports.

### How to use it:
1. **Describe the Bug**: provide a brief summary of what happened and what you expected.
2. **Add Context**: (Optional) Include reproduction steps, URLs, and environment details (Browser/OS).
3. **Set Severity**: Help developers prioritize by correctly identifying the impact.
4. **Result**: The AI will generate a structured report with clear sections for Environment, Repro Steps, and Expected/Actual behavior.

### Use cases:
- Filing a high-quality GitHub issue.
- Drafting a JIRA ticket for a complex bug.
- Communicating an issue clearly to a remote engineering team.
    `,

    inputs: [
        {
            id: 'whatHappened',
            label: 'What happened? (brief description)',
            type: 'textarea',
            placeholder: 'Describe the bug in a few sentences...',
            required: true,
            rows: 3,
            hint: 'Describe what went wrong. Be as specific as possible about the error symptoms.'
        },
        {
            id: 'expected',
            label: 'What did you expect to happen?',
            type: 'textarea',
            placeholder: 'What should have happened instead...',
            required: true,
            rows: 2
        },
        {
            id: 'steps',
            label: 'Steps you took (optional)',
            type: 'textarea',
            placeholder: `1. Opened the login page
2. Entered email and password
3. Clicked login button
4. Nothing happened`,
            rows: 5,
            hint: 'We\'ll enhance these into professional reproduction steps with clear preconditions.'
        },
        {
            id: 'url',
            label: 'URL / Page (optional)',
            type: 'text',
            placeholder: 'https://app.example.com/login'
        },
        {
            id: 'browser',
            label: 'Browser',
            type: 'select',
            defaultValue: 'chrome',
            options: [
                { value: 'chrome', label: 'Chrome' },
                { value: 'firefox', label: 'Firefox' },
                { value: 'safari', label: 'Safari' },
                { value: 'edge', label: 'Edge' },
                { value: 'mobile-ios', label: 'Mobile Safari (iOS)' },
                { value: 'mobile-android', label: 'Chrome (Android)' },
                { value: 'other', label: 'Other' }
            ]
        },
        {
            id: 'os',
            label: 'Operating System',
            type: 'select',
            defaultValue: 'macos',
            options: [
                { value: 'macos', label: 'macOS' },
                { value: 'windows', label: 'Windows' },
                { value: 'linux', label: 'Linux' },
                { value: 'ios', label: 'iOS' },
                { value: 'android', label: 'Android' },
                { value: 'other', label: 'Other' }
            ]
        },
        {
            id: 'severity',
            label: 'Severity',
            type: 'radio',
            defaultValue: 'high',
            options: [
                { value: 'critical', label: '🔴 Critical', description: 'System down, data loss, security issue' },
                { value: 'high', label: '🟠 High', description: 'Major feature broken, no workaround' },
                { value: 'medium', label: '🟡 Medium', description: 'Feature impaired, workaround exists' },
                { value: 'low', label: '🟢 Low', description: 'Minor issue, cosmetic' }
            ]
        },
        {
            id: 'additionalInfo',
            label: 'Additional Information (optional)',
            type: 'textarea',
            placeholder: 'Console errors, screenshots description, account details (non-sensitive)...',
            rows: 3
        },
        {
            id: 'outputFormat',
            label: 'Output Format',
            type: 'select',
            defaultValue: 'markdown',
            options: [
                { value: 'markdown', label: '📝 Markdown', description: 'GitHub/GitLab issues' },
                { value: 'jira', label: '🎫 JIRA', description: 'JIRA ticket format' },
                { value: 'plain', label: '📄 Plain Text', description: 'Simple text format' }
            ]
        }
    ],

    primaryAction: 'Generate Bug Report',

    systemPrompt: `You are an expert QA engineer who writes clear, comprehensive bug reports.
Create a well-structured bug report that developers can easily understand and act upon.

## Guidelines

1. **Clear Title**: Concise, descriptive title that summarizes the issue
2. **Reproducible Steps**: Detailed, numbered steps anyone can follow
3. **Expected vs Actual**: Clear distinction between expected and actual behavior
4. **Environment Details**: Browser, OS, and relevant versions
5. **Root Cause Hints**: If obvious, suggest possible causes
6. **Attachments Note**: Mention what screenshots/logs would help

## Output Formats

### Markdown Format
Use standard markdown with headers, bullet points, and code blocks.

### JIRA Format
Use JIRA wiki markup:
- h2. for headers
- * for bullets
- {code} blocks
- {color:red}text{color} for emphasis

### Plain Text
Simple structured text without markdown.

## Structure

1. **Title**: Bug: [Concise description]
2. **Summary**: 1-2 sentence overview
3. **Environment**: Browser, OS, URL
4. **Severity**: With justification
5. **Steps to Reproduce**: Detailed numbered steps
6. **Expected Behavior**: What should happen
7. **Actual Behavior**: What actually happens
8. **Additional Notes**: Possible causes, workarounds
9. **Attachments Needed**: What would help investigation`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        const parts: string[] = [];

        parts.push(`## Bug Description\n${inputs.whatHappened}`);
        parts.push(`## Expected Behavior\n${inputs.expected}`);

        if (inputs.steps) {
            parts.push(`## Steps Taken (to enhance)\n${inputs.steps}`);
        }

        parts.push(`## Environment`);
        parts.push(`- Browser: ${inputs.browser || 'Not specified'}`);
        parts.push(`- OS: ${inputs.os || 'Not specified'}`);
        if (inputs.url) {
            parts.push(`- URL: ${inputs.url}`);
        }

        const severityLabels: Record<string, string> = {
            critical: 'Critical - System down, data loss, or security issue',
            high: 'High - Major feature broken, no workaround',
            medium: 'Medium - Feature impaired, workaround exists',
            low: 'Low - Minor issue, cosmetic'
        };
        parts.push(`\n## Severity\n${severityLabels[inputs.severity] || inputs.severity}`);

        if (inputs.additionalInfo) {
            parts.push(`## Additional Information\n${inputs.additionalInfo}`);
        }

        parts.push(`\n## Output Format\n${inputs.outputFormat || 'markdown'}`);
        parts.push(`\nPlease generate a comprehensive, professional bug report.`);

        return parts.join('\n');
    },

    parseResponse: (response: string, inputs: Record<string, string>): AppOutput => {
        const formatExtensions: Record<string, string> = {
            markdown: '.md',
            jira: '.txt',
            plain: '.txt'
        };

        return {
            type: 'markdown',
            content: response,
            actions: [
                { label: 'Copy', icon: '📋', action: 'copy' },
                { label: 'Save as File', icon: '💾', action: 'newFile', fileExtension: formatExtensions[inputs.outputFormat] || '.md', suggestedFilename: 'bug-report' + (formatExtensions[inputs.outputFormat] || '.md') },
                { label: 'Insert at Cursor', icon: '📝', action: 'insert' }
            ]
        };
    },

    defaultActions: [
        { label: 'Copy', icon: '📋', action: 'copy' },
        { label: 'Save as File', icon: '💾', action: 'newFile', fileExtension: '.md' }
    ],

    requirements: {
        copilot: true
    },

    examples: [
        {
            name: 'Login Button Issue',
            inputs: {
                whatHappened: 'Login button does not respond when clicked after entering credentials',
                expected: 'Should redirect to dashboard after successful login',
                steps: '1. Go to login page\n2. Enter email\n3. Enter password\n4. Click login\n5. Nothing happens',
                browser: 'chrome',
                os: 'macos',
                severity: 'critical',
                outputFormat: 'markdown'
            }
        }
    ]
};
