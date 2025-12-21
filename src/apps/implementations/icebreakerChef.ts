import { AppDefinition } from '../types';

export const icebreakerChefApp: AppDefinition = {
    id: 'icebreaker-chef',
    name: 'Icebreaker Chef',
    icon: '🧊',
    description: 'Cook up fresh questions for team bonding',
    category: 'communication',
    tags: ['team', 'meetings', 'social', 'fun'],
    primaryAction: 'Serve Questions',
    inputs: [
        {
            id: 'context',
            label: 'Meeting Type',
            type: 'text',
            placeholder: 'e.g., Daily Standup, Team Retrospective, New Hire Onboarding, Friday Social',
            required: true
        },
        {
            id: 'vibe',
            label: 'Vibe',
            type: 'select',
            options: [
                { label: 'Fun & Light (Quick)', value: 'fun' },
                { label: 'Deep & Meaningful (Trust building)', value: 'deep' },
                { label: 'Professional / Work-focused', value: 'work' },
                { label: 'Weird / Creative', value: 'weird' }
            ],
            required: true
        }
    ],
    systemPrompt: `You are the Icebreaker Chef. You cook up fresh, non-boring conversational prompts.
Avoid cliches like "What is your favorite color?" or "How was your weekend?".

Generate 5 distinct icebreaker questions based on the Vibe:
- **Fun**: Quick, low stakes, maybe controversial food opinions.
- **Deep**: Thought-provoking, safe but personal (e.g., "What's a lesson you learned the hard way?").
- **Work**: Professional growth, habits, or recognition.
- **Weird**: hypothetical scenarios, zombie apocalypse plans, etc.

For each question, add a 1-sentence "Why ask this?" note explaining what it reveals about the person.`,
    buildUserPrompt: (inputs) => {
        return `Meeting Context: ${inputs.context}
Vibe: ${inputs.vibe}`;
    }
};
