import { AppDefinition } from '../types';

export const codeExplainerApp: AppDefinition = {
    id: 'code-explainer',
    name: 'Code Explainer',
    description: 'Understand any code with line-by-line explanations',
    icon: '🎓',
    category: 'developer',
    primaryAction: '💡 Explain Code',
    helpDocumentation: `### What is this?
The **Code Explainer** helps you understand unfamiliar code by providing clear, detailed explanations.

### Perfect for
- Learning a new codebase
- Understanding legacy code
- Code reviews
- Teaching others

### Explanation levels
- **Beginner** - Assumes no prior knowledge
- **Intermediate** - Standard developer explanations
- **Expert** - Deep dive into implementation details`,
    inputs: [
        {
            id: 'code',
            label: 'Code to Explain',
            type: 'textarea',
            placeholder: 'Paste any code here...',
            required: true,
            rows: 12,
            hint: 'Works with any programming language'
        },
        {
            id: 'language',
            label: 'Language (auto-detected if empty)',
            type: 'text',
            placeholder: 'e.g., TypeScript, Python, Rust',
            hint: 'Leave empty for auto-detection'
        },
        {
            id: 'level',
            label: 'Explanation Level',
            type: 'select',
            options: [
                { value: 'beginner', label: '🌱 Beginner - Explain everything' },
                { value: 'intermediate', label: '🌿 Intermediate - Standard explanations' },
                { value: 'expert', label: '🌳 Expert - Deep technical dive' }
            ],
            defaultValue: 'intermediate'
        },
        {
            id: 'focus',
            label: 'Focus Area (optional)',
            type: 'text',
            placeholder: 'e.g., error handling, performance, security',
            hint: 'Emphasize specific aspects'
        }
    ],
    systemPrompt: `You are an expert code educator. Explain code clearly and thoroughly based on the requested level.

Structure your explanation:
1. **Overview** - What does this code do at a high level?
2. **Key Concepts** - Important patterns, algorithms, or techniques used
3. **Line-by-Line** - Walk through important sections
4. **Potential Issues** - Any bugs, anti-patterns, or improvements
5. **Related Concepts** - What to learn next

Adjust depth based on level:
- Beginner: Define all terms, explain syntax, use analogies
- Intermediate: Focus on logic and patterns
- Expert: Discuss performance, edge cases, alternatives`,
    buildUserPrompt: (inputs) => {
        let prompt = `Explain this code at the ${inputs.level} level:\n\n\`\`\`${inputs.language || ''}\n${inputs.code}\n\`\`\``;
        if (inputs.focus?.trim()) {
            prompt += `\n\nFocus especially on: ${inputs.focus}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Explanation', content: response }]
    })
};
