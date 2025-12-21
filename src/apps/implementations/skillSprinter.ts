import { AppDefinition } from '../types';

export const skillSprinterApp: AppDefinition = {
    id: 'skill-sprinter',
    name: 'Skill Sprinter',
    icon: '📚',
    description: 'Generate a focused learning plan for any topic',
    category: 'inspiration',
    tags: ['learning', 'growth', 'education', 'planning'],
    primaryAction: 'Create Learning Plan',
    inputs: [
        {
            id: 'topic',
            label: 'What do you want to learn?',
            type: 'text',
            placeholder: 'e.g., Rust, Sourdough Baking, Kubernetes, public speaking',
            required: true
        },
        {
            id: 'timeframe',
            label: 'How much time do you have?',
            type: 'select',
            options: [
                { label: '1 Hour (Crash Course)', value: '1 hour' },
                { label: '1 Weekend (Deep Dive)', value: '1 weekend' },
                { label: '1 Month (Mastery)', value: '1 month' }
            ],
            required: true
        },
        {
            id: 'level',
            label: 'Current Level',
            type: 'select',
            options: [
                { label: 'Beginner', value: 'beginner' },
                { label: 'Intermediate', value: 'intermediate' },
                { label: 'Advanced', value: 'advanced' }
            ],
            required: true
        }
    ],
    systemPrompt: `You are Skill Sprinter, an elite learning coach who creates high-efficiency learning paths.
Design a learning plan that focuses on the 20% of concepts that provide 80% of the value (Pareto Principle).

Structure the plan based on the timeframe:
- **1 Hour**: strict concise "need to know" bullet points + 1 hands-on exercise.
- **1 Weekend**: Day 1 (Theory + Basics), Day 2 (Building/Doing something real).
- **1 Month**: Week-by-week breakdown with distinct milestones.

For each plan include:
1. **The Goal**: What exactly will they be able to DO by the end?
2. **The Plan**: Structured timeline.
3. **Key Resources**: Specific search terms or types of docs to look for (don't hallucinate generic URLs).
4. **The Final Boss**: A capstone project or test to prove mastery.

Tone: Encouraging, energetic, and highly structured.`,
    buildUserPrompt: (inputs) => {
        return `Topic: ${inputs.topic}
Timeframe: ${inputs.timeframe}
Current Level: ${inputs.level}`;
    }
};
