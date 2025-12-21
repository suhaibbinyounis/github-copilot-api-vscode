/**
 * Meeting Notes to Actions App
 * 
 * Extract actionable items, decisions, and follow-ups from meeting notes.
 * Turns unstructured notes into organized action items with owners.
 */

import { AppDefinition, AppOutput, OutputSection } from '../types';

export const meetingNotesToActionsApp: AppDefinition = {
    id: 'meeting-notes-to-actions',
    name: 'Meeting Notes → Actions',
    description: 'Extract action items from meeting notes',
    icon: '📝',
    category: 'leadership',
    helpDocumentation: `
### What is this?
**Meeting Notes → Actions** is a productivity tool that extracts clear, assigned tasks and key decisions from unstructured meeting notes or transcripts.

### How to use it:
1. **Paste Notes**: Drop in your raw notes, a Slack thread, or a meeting transcript.
2. **Configure Extraction**: Select which items you want to focus on (Actions, Decisions, Risks, etc.).
3. **Set Format**: Choose between Markdown, Slack-ready formatting, or professional Email style.
4. **Identify Owners**: (Recommended) Enable this to have the AI attempt to assign tasks based on the conversation context.

### Use cases:
- Quickly updating a team Slack channel after a sync.
- Drafting a project follow-up email.
- Extracting JIRA-ready tasks from a planning session.
    `,

    inputs: [
        {
            id: 'meetingNotes',
            label: 'Paste Meeting Notes',
            type: 'textarea',
            placeholder: `Example:
Sprint planning call - Dec 21
Attendees: John, Sarah, Mike

Discussed the new auth feature. John said we should use OAuth2.
Sarah mentioned we need to update the docs by Friday.
Mike will handle the frontend integration.

We agreed to ship by next Friday. Need to check with legal about 
the privacy policy changes. Budget approved for new tools.`,
            required: true,
            rows: 12,
            hint: 'Paste raw meeting notes, transcript, or summary'
        },
        {
            id: 'extractTypes',
            label: 'What to Extract',
            type: 'multi-select',
            defaultValue: 'actions,decisions,followups',
            options: [
                { value: 'actions', label: '✅ Action Items', description: 'Tasks assigned to people' },
                { value: 'decisions', label: '📌 Decisions', description: 'Decisions that were made' },
                { value: 'followups', label: '🔄 Follow-ups', description: 'Items needing follow-up' },
                { value: 'questions', label: '❓ Open Questions', description: 'Unresolved questions' },
                { value: 'risks', label: '⚠️ Risks', description: 'Risks or concerns raised' },
                { value: 'deadlines', label: '📅 Deadlines', description: 'Important dates mentioned' }
            ]
        },
        {
            id: 'meetingTitle',
            label: 'Meeting Title (optional)',
            type: 'text',
            placeholder: 'e.g., Sprint Planning - Week 51'
        },
        {
            id: 'outputFormat',
            label: 'Output Format',
            type: 'select',
            defaultValue: 'markdown',
            options: [
                { value: 'markdown', label: '📝 Markdown', description: 'Formatted with tables and sections' },
                { value: 'slack', label: '💬 Slack-Ready', description: 'Formatted for Slack posting' },
                { value: 'email', label: '📧 Email', description: 'Ready to send as follow-up email' },
                { value: 'jira', label: '🎫 JIRA Tasks', description: 'Formatted as JIRA task descriptions' }
            ]
        },
        {
            id: 'includeOwners',
            label: 'Identify Owners',
            type: 'checkbox',
            defaultValue: 'true',
            hint: 'Attempt to identify who is responsible for each action'
        }
    ],

    primaryAction: 'Extract Actions',

    systemPrompt: `You are an expert at analyzing meeting notes and extracting actionable information.
Your goal is to transform unstructured meeting notes into clear, organized action items.

## Guidelines

1. **Be Thorough**: Extract ALL action items, even implied ones
2. **Identify Owners**: Assign owners when mentioned or implied
3. **Add Due Dates**: Extract or infer reasonable deadlines
4. **Capture Context**: Preserve important context for each item
5. **Highlight Decisions**: Clearly mark decisions that were made
6. **Flag Uncertainties**: Note when ownership or details are unclear

## Output Structure

### Meeting Summary
Brief 2-3 sentence summary of the meeting.

### 📌 Decisions Made
Numbered list of decisions with context.

### ✅ Action Items
| Owner | Task | Due Date | Priority |
|-------|------|----------|----------|
Use "TBD" for unknown owners, "ASAP" or specific date for due dates.

### 🔄 Follow-ups Required
Items that need follow-up but aren't specific tasks.

### ❓ Open Questions
Questions that weren't answered in the meeting.

### ⚠️ Risks & Concerns
Any risks or concerns that were raised.

### 📅 Key Dates
Important deadlines or milestones mentioned.

## Format-Specific Instructions

### Slack Format
- Use *bold* for headers
- Use bullet points with emojis
- Keep it concise

### Email Format
- Professional tone
- Include greeting and sign-off structure
- Numbered action items

### JIRA Format
- Each action as a separate task
- Include acceptance criteria where possible
- Use JIRA wiki markup`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        const parts: string[] = [];

        if (inputs.meetingTitle) {
            parts.push(`## Meeting: ${inputs.meetingTitle}`);
        }

        parts.push(`## Meeting Notes\n${inputs.meetingNotes}`);

        // Extract types
        const extractTypes = inputs.extractTypes ? inputs.extractTypes.split(',') : ['actions', 'decisions', 'followups'];
        const typeLabels: Record<string, string> = {
            actions: 'Action Items (tasks with owners)',
            decisions: 'Decisions Made',
            followups: 'Follow-ups Required',
            questions: 'Open Questions',
            risks: 'Risks and Concerns',
            deadlines: 'Key Dates and Deadlines'
        };
        const selectedTypes = extractTypes.map(t => typeLabels[t] || t);
        parts.push(`## Extract These Items\n${selectedTypes.map(t => `- ${t}`).join('\n')}`);

        parts.push(`## Output Format\n${inputs.outputFormat || 'markdown'}`);

        if (inputs.includeOwners === 'true') {
            parts.push(`\nIMPORTANT: Identify and assign owners for each action item based on the notes. Use "TBD" if unclear.`);
        }

        parts.push(`\nAnalyze the meeting notes and extract all requested information in a clear, organized format.`);

        return parts.join('\n\n');
    },

    parseResponse: (response: string, inputs: Record<string, string>): AppOutput => {
        // Try to extract sections for structured display
        const sections: OutputSection[] = [];

        // Look for action items section
        const actionsMatch = response.match(/###?\s*✅?\s*Action Items[\s\S]*?(?=###|$)/i);
        if (actionsMatch) {
            sections.push({
                title: '✅ Action Items',
                content: actionsMatch[0].replace(/###?\s*✅?\s*Action Items[^\n]*\n/, '').trim(),
                severity: 'info',
                collapsible: false
            });
        }

        // Look for decisions section
        const decisionsMatch = response.match(/###?\s*📌?\s*Decisions[\s\S]*?(?=###|$)/i);
        if (decisionsMatch) {
            sections.push({
                title: '📌 Decisions',
                content: decisionsMatch[0].replace(/###?\s*📌?\s*Decisions[^\n]*\n/, '').trim(),
                severity: 'success',
                collapsible: true,
                collapsed: false
            });
        }

        // Look for follow-ups section
        const followupsMatch = response.match(/###?\s*🔄?\s*Follow-ups[\s\S]*?(?=###|$)/i);
        if (followupsMatch) {
            sections.push({
                title: '🔄 Follow-ups',
                content: followupsMatch[0].replace(/###?\s*🔄?\s*Follow-ups[^\n]*\n/, '').trim(),
                severity: 'warning',
                collapsible: true,
                collapsed: true
            });
        }

        return {
            type: sections.length > 0 ? 'structured' : 'markdown',
            content: response,
            sections: sections.length > 0 ? sections : undefined,
            actions: [
                { label: 'Copy', icon: '📋', action: 'copy' },
                { label: 'Save as File', icon: '💾', action: 'newFile', fileExtension: '.md', suggestedFilename: 'meeting-actions.md' },
                { label: 'Insert at Cursor', icon: '📝', action: 'insert' }
            ]
        };
    },

    defaultActions: [
        { label: 'Copy', icon: '📋', action: 'copy' },
        { label: 'Save as File', icon: '💾', action: 'newFile', fileExtension: '.md' }
    ],

    requirements: {
        copilot: true
    },

    examples: [
        {
            name: 'Sprint Planning Notes',
            inputs: {
                meetingNotes: `Sprint planning - Week 51
Team: John (BE), Sarah (FE), Mike (QA), Lisa (PM)

Discussed Q1 priorities. Auth feature is top priority.
John will implement OAuth2 backend by end of week.
Sarah to update UI components, needs design specs from Lisa.
Mike mentioned we need more test coverage.
Lisa to check with legal about GDPR requirements.
Deadline: Launch by Jan 15th.`,
                extractTypes: 'actions,decisions,deadlines',
                outputFormat: 'markdown',
                includeOwners: 'true'
            }
        }
    ]
};
