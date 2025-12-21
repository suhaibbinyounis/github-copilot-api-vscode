import { AppDefinition } from '../types';

export const brainstormingPartnerApp: AppDefinition = {
    id: 'brainstorming-partner',
    name: 'Brainstorming Partner',
    description: 'Explore ideas and get creative suggestions',
    icon: '💡',
    category: 'inspiration',
    primaryAction: '🧠 Brainstorm',
    helpDocumentation: `### What is this?
The **Brainstorming Partner** is your creative thinking companion. Share a problem or idea, and get diverse perspectives, alternative approaches, and creative suggestions.

### How to use it
1. Describe the problem, idea, or topic you want to explore.
2. Select the type of brainstorming you want.
3. Click **Brainstorm** to generate ideas.

### Use cases
- Exploring new project ideas
- Finding creative solutions to problems
- Breaking through writer's or designer's block
- Planning features and roadmaps`,
    inputs: [
        {
            id: 'topic',
            label: 'What do you want to brainstorm?',
            type: 'textarea',
            placeholder: 'e.g., Ways to improve user onboarding for our app\n\nOr: Name ideas for a new productivity tool\n\nOr: How might we reduce meeting fatigue?',
            required: true,
            rows: 4,
            hint: 'Be specific about what you\'re trying to solve or explore'
        },
        {
            id: 'style',
            label: 'Brainstorming Style',
            type: 'radio',
            options: [
                { value: 'divergent', label: 'Divergent (Many Ideas)', description: 'Quantity over quality, wild ideas welcome' },
                { value: 'convergent', label: 'Convergent (Focused)', description: 'Fewer, more refined ideas' },
                { value: 'sixhats', label: 'Six Thinking Hats', description: 'Multiple perspectives approach' },
                { value: 'scamper', label: 'SCAMPER', description: 'Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse' }
            ],
            defaultValue: 'divergent'
        },
        {
            id: 'constraints',
            label: 'Constraints (optional)',
            type: 'text',
            placeholder: 'e.g., Low budget, 2-week timeline, must work on mobile',
            hint: 'Constraints can actually spark creativity'
        }
    ],
    systemPrompt: `You are a creative thinking partner and innovation facilitator. Help the user explore ideas with enthusiasm and constructive suggestions.

Guidelines:
- Generate diverse, actionable ideas
- Challenge assumptions
- Build on ideas ("Yes, and..." approach)
- Include a few "wild card" creative ideas
- Organize ideas by theme or feasibility
- End with next steps or questions to explore

For Six Thinking Hats, cover: Facts (White), Emotions (Red), Caution (Black), Benefits (Yellow), Creativity (Green), Process (Blue).

Keep the energy positive and exploratory!`,
    buildUserPrompt: (inputs) => {
        let prompt = `Let's brainstorm: ${inputs.topic}\n\nStyle: ${inputs.style}`;
        if (inputs.constraints?.trim()) {
            prompt += `\nConstraints: ${inputs.constraints}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Ideas', content: response }]
    })
};
