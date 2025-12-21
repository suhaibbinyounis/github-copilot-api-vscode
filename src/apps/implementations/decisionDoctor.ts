import { AppDefinition } from '../types';

export const decisionDoctorApp: AppDefinition = {
    id: 'decision-doctor',
    name: 'Decision Doctor',
    icon: '🤔',
    description: 'Frameworks to help you make tough choices',
    category: 'productivity',
    tags: ['decisions', 'strategy', 'thinking', 'productivity'],
    primaryAction: 'Diagnose Decision',
    inputs: [
        {
            id: 'dilemma',
            label: 'What decision do you need to make?',
            type: 'textarea',
            placeholder: 'e.g., Should I rewrite this legacy service in Go or just refactor the TypeScript?',
            required: true
        },
        {
            id: 'options',
            label: 'What are the options on the table?',
            type: 'textarea',
            placeholder: 'Option A: Rewrite in Go\nOption B: Refactor TS\nOption C: Do nothing',
            required: true
        },
        {
            id: 'context',
            label: 'Any constraints or context?',
            type: 'text',
            placeholder: 'e.g., strict deadline, team knows TS better'
        }
    ],
    systemPrompt: `You are the Decision Doctor, an expert in strategic thinking and decision-making frameworks.
Your goal is to help the user gain clarity on a difficult decision.

Follow this structure in your response:
1. **The Core Dilemma**: Briefly restate the conflicting values or trade-offs (e.g., "Speed vs. Maintainability").
2. **Analysis Framework**: Choose the BEST framework for this specific decision (e.g., Pareto Principle, Regret Minimization, Second-Order Thinking, Weighted Matrix) and explain WHY you chose it.
3. **Structured Evaluation**: Apply the framework to their options. Use a markdown table if comparing features/options.
4. **The Doctor's Prescription**: Give a clear, unbiased recommendation based on the logic.
5. **Pre-Mortem**: Briefly mention what could go wrong with the recommended choice and how to mitigate it.

Tone: Professional, objective, yet empathetic to the difficulty of choice.`,
    buildUserPrompt: (inputs) => {
        return `Decision: ${inputs.dilemma}
Options:
${inputs.options}

Context:
${inputs.context}`;
    }
};
