import { AppDefinition } from '../types';

export const jiraStoryWriterApp: AppDefinition = {
    id: 'jira-story-writer',
    name: 'JIRA Story Writer',
    description: 'Describe a feature, get a full user story with acceptance criteria',
    icon: '📋',
    category: 'jira',
    primaryAction: '✍️ Write Story',
    helpDocumentation: `### What is this?
The **JIRA Story Writer** transforms feature ideas into well-structured user stories with acceptance criteria, ready to paste into your project management tool.

### How to use it
1. Describe the feature or requirement in plain language.
2. Select the story type (User Story, Bug, Task, Epic).
3. Click **Write Story** to generate the complete ticket.

### Use cases
- Converting stakeholder requests into structured tickets
- Ensuring consistent story quality across the team
- Breaking down large features into actionable stories
- Training new team members on good story writing`,
    inputs: [
        {
            id: 'featureDescription',
            label: 'Feature Description',
            type: 'textarea',
            placeholder: 'Describe the feature, bug, or task...\n\nExample: Users should be able to export their dashboard as a PDF so they can share it with stakeholders who don\'t have system access.',
            required: true,
            rows: 5,
            hint: 'Include the why, what, and who if possible'
        },
        {
            id: 'storyType',
            label: 'Story Type',
            type: 'radio',
            options: [
                { value: 'user-story', label: 'User Story', description: 'Feature from user perspective' },
                { value: 'bug', label: 'Bug', description: 'Defect report' },
                { value: 'task', label: 'Technical Task', description: 'Technical work item' },
                { value: 'epic', label: 'Epic', description: 'Large feature with child stories' }
            ],
            defaultValue: 'user-story'
        },
        {
            id: 'context',
            label: 'Additional Context (optional)',
            type: 'textarea',
            placeholder: 'Any constraints, dependencies, or technical considerations...',
            rows: 3
        }
    ],
    systemPrompt: `You are an expert Agile coach and product manager. Create well-structured JIRA tickets that are clear, actionable, and follow best practices.

For User Stories, use the format:
**Title**: [Concise, action-oriented title]

**Description**:
As a [user type],
I want [goal],
So that [benefit].

**Acceptance Criteria**:
- [ ] Given [context], when [action], then [outcome]
- [ ] ...

**Technical Notes** (if applicable):
- Implementation hints
- API changes needed
- Security considerations

**Story Points**: [Estimate if possible]
**Labels**: [Suggested labels]`,
    buildUserPrompt: (inputs) => {
        let prompt = `Create a ${inputs.storyType} ticket for:\n\n${inputs.featureDescription}`;
        if (inputs.context?.trim()) {
            prompt += `\n\nAdditional context:\n${inputs.context}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'JIRA Story', content: response }]
    })
};
