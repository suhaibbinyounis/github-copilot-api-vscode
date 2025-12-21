import { AppDefinition } from '../types';

export const sprintRetroApp: AppDefinition = {
    id: 'sprint-retro',
    name: 'Sprint Retrospective',
    description: 'Summarize sprint activity into structured retro points',
    icon: '🔄',
    category: 'jira',
    primaryAction: '📊 Generate Retro',
    helpDocumentation: `### What is this?
The **Sprint Retrospective** app helps you prepare for retro meetings by organizing sprint notes into structured discussion points.

### How to use it
1. Paste your sprint notes, completed tickets, or team observations.
2. Select your preferred retro format.
3. Click **Generate Retro** to get organized talking points.

### Use cases
- Preparing for sprint retrospective meetings
- Documenting team learnings and action items
- Identifying patterns across multiple sprints
- Facilitating more productive retro discussions`,
    inputs: [
        {
            id: 'sprintNotes',
            label: 'Sprint Notes & Observations',
            type: 'textarea',
            placeholder: 'Paste completed tickets, incident notes, team feedback, blockers encountered...\n\nExample:\n- Completed: User auth, Dashboard redesign\n- Blocked on: API rate limits, unclear requirements for export feature\n- Team feedback: Too many meetings, good collaboration on auth',
            required: true,
            rows: 8,
            hint: 'Include the good, the bad, and everything in between'
        },
        {
            id: 'format',
            label: 'Retro Format',
            type: 'radio',
            options: [
                { value: 'start-stop-continue', label: 'Start, Stop, Continue', description: 'Classic format for change-focused retros' },
                { value: 'liked-learned-lacked', label: 'Liked, Learned, Lacked', description: 'Positive, reflective format' },
                { value: 'mad-sad-glad', label: 'Mad, Sad, Glad', description: 'Emotion-based categorization' },
                { value: 'sailboat', label: 'Sailboat', description: 'Wind (helps), Anchor (slows), Rocks (risks)' }
            ],
            defaultValue: 'start-stop-continue'
        },
        {
            id: 'sprintGoal',
            label: 'Sprint Goal (optional)',
            type: 'text',
            placeholder: 'What was the main sprint objective?',
            hint: 'Helps evaluate if the sprint achieved its purpose'
        }
    ],
    systemPrompt: `You are an Agile coach facilitating a sprint retrospective. Organize the provided notes into a structured retro format that drives actionable improvements.

Guidelines:
- Be specific, not generic (use examples from the notes)
- Prioritize items by impact
- Suggest 2-3 concrete action items
- Include a brief sprint summary at the top
- Keep it constructive and team-focused
- Add facilitation tips for discussing each point`,
    buildUserPrompt: (inputs) => {
        let prompt = `Create a ${inputs.format.replace(/-/g, ', ')} retrospective from these sprint notes:\n\n${inputs.sprintNotes}`;
        if (inputs.sprintGoal?.trim()) {
            prompt += `\n\nSprint goal was: ${inputs.sprintGoal}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Sprint Retrospective', content: response }]
    })
};
