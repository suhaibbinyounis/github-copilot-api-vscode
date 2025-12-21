import { AppDefinition } from '../types';

export const gratitudeJournalApp: AppDefinition = {
    id: 'gratitude-journal',
    name: 'Gratitude Journal',
    description: 'Reflect on positive moments with guided prompts',
    icon: '🙏',
    category: 'wellness',
    primaryAction: '✍️ Reflect',
    helpDocumentation: `### What is this?
The **Gratitude Journal** provides guided prompts to help you reflect on positive moments, boosting your mood and well-being through the practice of gratitude.

### How to use it
1. Choose a reflection style that suits your mood.
2. Optionally share something specific you're grateful for.
3. Click **Reflect** for personalized gratitude prompts and insights.

### Use cases
- Starting or ending your workday positively
- Building a daily gratitude practice
- Shifting perspective during stressful times
- Team gratitude exercises`,
    inputs: [
        {
            id: 'something',
            label: 'Something on your mind? (optional)',
            type: 'textarea',
            placeholder: 'Share something you\'re grateful for, or leave blank for fresh prompts...',
            rows: 3,
            hint: 'Big or small—all gratitude matters'
        },
        {
            id: 'focus',
            label: 'Focus Area',
            type: 'select',
            options: [
                { value: 'general', label: '🌈 Open Reflection' },
                { value: 'work', label: '💼 Work & Career' },
                { value: 'people', label: '❤️ Relationships & People' },
                { value: 'growth', label: '🌱 Personal Growth' },
                { value: 'simple', label: '☀️ Simple Pleasures' },
                { value: 'challenges', label: '💪 Challenges Overcome' }
            ],
            defaultValue: 'general'
        },
        {
            id: 'depth',
            label: 'Reflection Depth',
            type: 'radio',
            options: [
                { value: 'quick', label: 'Quick', description: '1-2 minute reflection' },
                { value: 'deep', label: 'Deep', description: 'Thoughtful exploration' }
            ],
            defaultValue: 'quick'
        }
    ],
    systemPrompt: `You are a gentle, thoughtful journaling companion helping someone practice gratitude.

For quick reflections:
- 3 simple gratitude prompts
- Brief affirmation

For deep reflections:
- Acknowledge what they shared (if anything)
- 3 thoughtful prompts with context
- A "reframe" prompt (finding silver linings)
- Closing reflection or affirmation

Guidelines:
- Be warm but not overly enthusiastic
- Focus on specificity (specific > general gratitude)
- Include sensory details when helpful
- Don't lecture about the benefits of gratitude
- Make it feel natural, not forced

Use gentle formatting with emojis sparingly.`,
    buildUserPrompt: (inputs) => {
        let prompt = `Create ${inputs.depth} gratitude prompts focused on ${inputs.focus}.`;
        if (inputs.something?.trim()) {
            prompt += `\n\nThey shared: ${inputs.something}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Gratitude Reflection', content: response }]
    })
};
