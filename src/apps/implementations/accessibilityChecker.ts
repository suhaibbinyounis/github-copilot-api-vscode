import { AppDefinition } from '../types';

export const accessibilityCheckerApp: AppDefinition = {
    id: 'accessibility-checker',
    name: 'Accessibility Checker',
    description: 'Get a11y recommendations for your UI components',
    icon: '♿',
    category: 'qa',
    primaryAction: '🔍 Check Accessibility',
    helpDocumentation: `### What is this?
The **Accessibility Checker** analyzes UI code or descriptions and provides WCAG-compliant accessibility recommendations.

### How to use it
1. Paste your UI code (HTML, JSX, Vue template) or describe the component.
2. Select the WCAG conformance level you're targeting.
3. Click **Check Accessibility** to get detailed recommendations.

### Use cases
- Auditing existing components for a11y issues
- Learning accessibility best practices
- Preparing for WCAG compliance audits
- Improving keyboard navigation and screen reader support`,
    inputs: [
        {
            id: 'uiCode',
            label: 'UI Code or Description',
            type: 'textarea',
            placeholder: 'Paste your component code (HTML, JSX, Vue) or describe the UI...\n\nExample:\nA modal dialog with a form containing name and email fields, a submit button, and a close icon button.',
            required: true,
            rows: 8,
            hint: 'Include all interactive elements for a thorough review'
        },
        {
            id: 'wcagLevel',
            label: 'WCAG Level',
            type: 'radio',
            options: [
                { value: 'A', label: 'Level A', description: 'Minimum accessibility (essential)' },
                { value: 'AA', label: 'Level AA', description: 'Standard target (recommended)' },
                { value: 'AAA', label: 'Level AAA', description: 'Highest conformance' }
            ],
            defaultValue: 'AA'
        },
        {
            id: 'focus',
            label: 'Focus Areas',
            type: 'multi-select',
            options: [
                { value: 'keyboard', label: 'Keyboard Navigation' },
                { value: 'screen-reader', label: 'Screen Reader' },
                { value: 'color', label: 'Color Contrast' },
                { value: 'forms', label: 'Form Labels & Errors' },
                { value: 'motion', label: 'Motion & Animation' }
            ]
        }
    ],
    systemPrompt: `You are an accessibility expert specializing in web applications. Analyze UI components and provide actionable WCAG-compliant recommendations.

For each issue found:
1. **Issue** - What's wrong
2. **WCAG Criterion** - e.g., "1.4.3 Contrast (Minimum)"
3. **Impact** - Who is affected and how
4. **Fix** - Code example showing the solution

Organize by severity: Critical > Serious > Moderate > Minor

Also include:
- ✅ What's already good
- 🧪 How to test each fix
- 📚 Resources for learning more`,
    buildUserPrompt: (inputs) => {
        let prompt = `Check this UI for WCAG Level ${inputs.wcagLevel} accessibility issues:\n\n${inputs.uiCode}`;
        if (inputs.focus?.trim()) {
            prompt += `\n\nFocus specifically on: ${inputs.focus.split(',').join(', ')}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Accessibility Report', content: response }]
    })
};
