/**
 * Test Case Generator App
 * 
 * Generate comprehensive test cases from requirements or user stories.
 * Supports multiple output formats: Gherkin, Traditional, Checklist, xUnit.
 */

import { AppDefinition, AppOutput } from '../types';

export const testCaseGeneratorApp: AppDefinition = {
    id: 'test-case-generator',
    name: 'Test Case Generator',
    description: 'Generate test cases from requirements/user stories',
    icon: '🧪',
    category: 'qa',
    helpDocumentation: `
### What is this?
The **Test Case Generator** helps QA and Developers ensure comprehensive coverage by converting requirements into structured test plans.

### How to use it:
1. **Input Requirement**: Paste a user story or feature description.
2. **Choose Test Types**: Select from Functional, Edge Cases, Security, Accessibility, etc.
3. **Pick Format**: Choose your preferred documentation style (Gherkin, Traditional Table, or Checklist).
4. **Generate**: The AI will design a series of test cases with clear Pass/Fail criteria.

### Use cases:
- Drafting a test plan for a new feature.
- Generating BDD-style "Given-When-Then" scenarios.
- Ensuring edge cases are considered during the design phase.
    `,

    inputs: [
        {
            id: 'requirement',
            label: 'Requirement / User Story',
            type: 'textarea',
            placeholder: `Example:
As a user, I want to reset my password so that I can regain access to my account if I forget it.

Acceptance Criteria:
- User can request password reset via email
- Reset link expires after 24 hours
- Password must meet complexity requirements`,
            required: true,
            rows: 8,
            hint: 'Paste the user story, requirement, or feature description'
        },
        {
            id: 'testTypes',
            label: 'Test Types to Include',
            type: 'multi-select',
            options: [
                { value: 'functional', label: '✅ Functional', description: 'Happy path scenarios' },
                { value: 'edge', label: '🔲 Edge Cases', description: 'Boundary conditions' },
                { value: 'negative', label: '❌ Negative', description: 'Error scenarios' },
                { value: 'security', label: '🔒 Security', description: 'Security test cases' },
                { value: 'performance', label: '⚡ Performance', description: 'Performance considerations' },
                { value: 'accessibility', label: '♿ Accessibility', description: 'A11y test cases' }
            ],
            defaultValue: 'functional,edge,negative'
        },
        {
            id: 'outputFormat',
            label: 'Output Format',
            type: 'select',
            required: true,
            defaultValue: 'gherkin',
            options: [
                { value: 'gherkin', label: '🥒 Gherkin (BDD)', description: 'Given/When/Then format' },
                { value: 'traditional', label: '📋 Traditional', description: 'ID, Steps, Expected Results' },
                { value: 'checklist', label: '✔️ Checklist', description: 'Simple test checklist' },
                { value: 'xunit', label: '🧪 xUnit Style', description: 'Test method structure' }
            ]
        },
        {
            id: 'priority',
            label: 'Include Priority Levels',
            type: 'checkbox',
            defaultValue: 'true'
        },
        {
            id: 'jiraIssueId',
            label: 'Jira Issue ID (optional)',
            type: 'text',
            placeholder: 'e.g., PROJ-123, TEST-456',
            hint: 'Auto-fetch requirements from Jira. Configure Jira in Apps Hub first.',
            required: false
        },
        {
            id: 'additionalContext',
            label: 'Additional Context (optional)',
            type: 'textarea',
            placeholder: 'Any additional technical details, constraints, or context...',
            rows: 3
        }
    ],

    primaryAction: 'Generate Test Cases',

    systemPrompt: `You are an expert QA engineer specializing in test case design.
Generate comprehensive, actionable test cases based on the given requirements.

## Guidelines

1. **Coverage**: Ensure all acceptance criteria are covered
2. **Completeness**: Each test case should be standalone and complete
3. **Clarity**: Use clear, unambiguous language
4. **Testability**: Each test must have a clear pass/fail criteria
5. **Prioritization**: Order tests by importance/risk

## Output Formats

### Gherkin (BDD) Format
\`\`\`gherkin
Feature: [Feature Name]

  Scenario: [Scenario Name]
    Given [precondition]
    When [action]
    Then [expected result]
    And [additional expectation]
\`\`\`

### Traditional Format
| Test ID | Test Case | Priority | Preconditions | Steps | Expected Result |
|---------|-----------|----------|---------------|-------|-----------------|

### Checklist Format
- [ ] [P1] Test case description
  - Step 1
  - Step 2
  - ✓ Expected: result

### xUnit Style Format
\`\`\`
Test: testFeatureName_WhenCondition_ShouldExpectedBehavior
Arrange: [setup]
Act: [action]
Assert: [verification]
\`\`\`

Always include:
- Happy path scenarios (functional)
- Edge cases and boundary conditions
- Negative/error scenarios
- Any specific test types requested`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        const parts: string[] = [];

        parts.push(`## Requirement to Test\n${inputs.requirement}`);

        if (inputs.additionalContext) {
            parts.push(`## Additional Context\n${inputs.additionalContext}`);
        }

        // Test types
        const testTypes = inputs.testTypes ? inputs.testTypes.split(',') : ['functional', 'edge', 'negative'];
        const typeLabels: Record<string, string> = {
            functional: 'Functional (happy path)',
            edge: 'Edge Cases (boundaries)',
            negative: 'Negative (error scenarios)',
            security: 'Security',
            performance: 'Performance',
            accessibility: 'Accessibility'
        };
        const selectedTypes = testTypes.map(t => typeLabels[t] || t).join(', ');
        parts.push(`## Test Types Required\n${selectedTypes}`);

        // Output format
        const formatLabels: Record<string, string> = {
            gherkin: 'Gherkin (BDD) - Given/When/Then format',
            traditional: 'Traditional table format with Test ID, Steps, Expected Results',
            checklist: 'Simple checklist format',
            xunit: 'xUnit test method structure (Arrange/Act/Assert)'
        };
        parts.push(`## Output Format\n${formatLabels[inputs.outputFormat] || inputs.outputFormat}`);

        if (inputs.priority === 'true') {
            parts.push(`## Include Priority\nYes - mark each test case with priority (P1=Critical, P2=High, P3=Medium, P4=Low)`);
        }

        // Jira Context (auto-fetched if issue ID was provided)
        if (inputs.jiraContext && inputs.jiraContext.trim()) {
            parts.push(`## Jira Issue Context\n${inputs.jiraContext}`);
        }

        parts.push(`\nPlease generate comprehensive test cases covering all the requested types in the specified format.`);

        return parts.join('\n\n');
    },

    parseResponse: (response: string, inputs: Record<string, string>): AppOutput => {
        // Determine file extension based on format
        const formatExtensions: Record<string, string> = {
            gherkin: '.feature',
            traditional: '.md',
            checklist: '.md',
            xunit: '.txt'
        };

        const ext = formatExtensions[inputs.outputFormat] || '.md';
        const filename = `test-cases${ext}`;

        return {
            type: inputs.outputFormat === 'gherkin' ? 'code' : 'markdown',
            content: response,
            language: inputs.outputFormat === 'gherkin' ? 'gherkin' : undefined,
            actions: [
                { label: 'Copy', icon: '📋', action: 'copy' },
                { label: 'Save as File', icon: '💾', action: 'newFile', fileExtension: ext, suggestedFilename: filename },
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
            name: 'Login Feature',
            inputs: {
                requirement: `As a user, I want to log in with my email and password so that I can access my account.

Acceptance Criteria:
- Valid email format required
- Password minimum 8 characters
- Show error for invalid credentials
- Lock account after 5 failed attempts
- Remember me option for 30 days`,
                testTypes: 'functional,edge,negative,security',
                outputFormat: 'gherkin'
            }
        },
        {
            name: 'Shopping Cart',
            inputs: {
                requirement: `Users can add items to cart, update quantities, and remove items. Cart persists across sessions.`,
                testTypes: 'functional,edge',
                outputFormat: 'traditional'
            }
        }
    ]
};
