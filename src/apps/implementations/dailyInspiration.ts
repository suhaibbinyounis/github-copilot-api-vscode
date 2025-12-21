import { AppDefinition } from '../types';

export const dailyInspirationApp: AppDefinition = {
    id: 'daily-inspiration',
    name: 'Daily Inspiration',
    description: 'Get a motivational quote with meaningful context',
    icon: '🌟',
    category: 'inspiration',
    primaryAction: '💫 Inspire Me',
    helpDocumentation: `### What is this?
The **Daily Inspiration** app delivers curated motivational quotes with context and reflection prompts to start your day on a positive note.

### How to use it
1. Select a theme that resonates with your current needs.
2. Choose how you'd like the quote presented.
3. Click **Inspire Me** for your dose of motivation.

### Use cases
- Starting your workday with a positive mindset
- Finding motivation during challenging projects
- Team meeting openers
- Personal reflection and journaling`,
    inputs: [
        {
            id: 'theme',
            label: 'What kind of inspiration?',
            type: 'select',
            options: [
                { value: 'general', label: '✨ General Motivation' },
                { value: 'productivity', label: '⚡ Productivity & Focus' },
                { value: 'creativity', label: '🎨 Creativity & Innovation' },
                { value: 'leadership', label: '👑 Leadership & Growth' },
                { value: 'resilience', label: '💪 Resilience & Perseverance' },
                { value: 'teamwork', label: '🤝 Teamwork & Collaboration' },
                { value: 'tech', label: '💻 Tech & Engineering' },
                { value: 'surprise', label: '🎲 Surprise Me' }
            ],
            defaultValue: 'surprise'
        },
        {
            id: 'style',
            label: 'Quote Style',
            type: 'radio',
            options: [
                { value: 'classic', label: 'Classic', description: 'Timeless wisdom from notable figures' },
                { value: 'modern', label: 'Modern', description: 'Contemporary voices and insights' },
                { value: 'tech', label: 'Tech World', description: 'From innovators and builders' },
                { value: 'unexpected', label: 'Unexpected', description: 'From unlikely sources' }
            ],
            defaultValue: 'classic'
        },
        {
            id: 'context',
            label: 'Current Situation (optional)',
            type: 'text',
            placeholder: 'e.g., Feeling stuck on a project, Starting a new role',
            hint: 'For more relevant inspiration'
        }
    ],
    systemPrompt: `You are a thoughtful curator of wisdom and inspiration. Provide meaningful quotes with context that resonates.

Format:
## 💬 [The Quote]
— [Author], [Brief context about who they are]

### 🌱 Why This Matters
[2-3 sentences connecting the quote to work, creativity, or personal growth]

### 💭 Reflection
[A thought-provoking question based on the quote]

### ⚡ Today's Challenge
[A simple, actionable way to apply this wisdom today]

Select real, accurate quotes. Avoid misattributed or made-up quotes.`,
    buildUserPrompt: (inputs) => {
        let prompt = `Give me a ${inputs.style} inspirational quote about ${inputs.theme}.`;
        if (inputs.context?.trim()) {
            prompt += ` Context: ${inputs.context}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Inspiration', content: response }]
    })
};
