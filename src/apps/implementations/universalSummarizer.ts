import { AppDefinition } from '../types';

export const universalSummarizerApp: AppDefinition = {
    id: 'universal-summarizer',
    name: 'Universal Summarizer',
    icon: '📝',
    description: 'Quickly summarize any text into clear takeaways',
    category: 'productivity',
    tags: ['summary', 'reading', 'productivity', 'tools'],
    primaryAction: 'Summarize',
    inputs: [
        {
            id: 'text',
            label: 'Text to Summarize',
            type: 'textarea',
            placeholder: 'Paste email, article, or specs here...',
            required: true
        },
        {
            id: 'format',
            label: 'Output Format',
            type: 'select',
            options: [
                { label: 'Bulleted List (Standard)', value: 'bullets' },
                { label: 'TL;DR (1 Sentence)', value: 'tldr' },
                { label: 'ELI5 (Simple)', value: 'eli5' },
                { label: 'Executive Brief (Decision focused)', value: 'executive' }
            ],
            required: true
        }
    ],
    systemPrompt: `You are the Universal Summarizer, an AI engine for text compression and clarity.
Your goal is to extract the signal from the noise.

Rules based on format:
- **bullets**: Main ideas in bold, supporting details indented.
- **tldr**: A single, punchy sentence capturing the essence.
- **eli5**: Simple analogies, no jargon, easy to understand.
- **executive**: 1. The Ask/Problem, 2. The Facts, 3. The Recommendation/Action.

Always output a "BLUF" (Bottom Line Up Front) section first—a 1-sentence grasp of the text.`,
    buildUserPrompt: (inputs) => {
        return `Format: ${inputs.format}

Text to summarize:
${inputs.text}`;
    }
};
