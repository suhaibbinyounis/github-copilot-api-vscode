/**
 * 1:1 Meeting Prep - Leadership App
 * 
 * Help managers prepare effective 1:1 meetings with their team members.
 */

import { AppDefinition, AppOutput } from '../types';

export const oneOnOnePrepApp: AppDefinition = {
    id: 'one-on-one-prep',
    name: '1:1 Meeting Prep',
    description: 'Prepare effective 1:1 meetings with team members',
    icon: '👥',
    category: 'leadership',
    tags: ['meetings', 'management', '1:1', 'coaching'],
    helpDocumentation: `
### What is this?
Prepare for meaningful 1:1 meetings with your direct reports.

### How to use:
1. Enter team member name and role
2. Add context (recent work, concerns, goals)
3. Generate personalized talking points and questions
    `,

    inputs: [
        {
            id: 'memberName',
            label: 'Team Member Name',
            type: 'text',
            placeholder: 'e.g., Sarah Chen',
            required: true
        },
        {
            id: 'memberRole',
            label: 'Role / Position',
            type: 'text',
            placeholder: 'e.g., Senior Software Engineer',
            required: true
        },
        {
            id: 'recentContext',
            label: 'Recent Context',
            type: 'textarea',
            placeholder: `Recent highlights or concerns:\n- Delivered feature X ahead of schedule\n- Seemed stressed during sprint planning\n- Asked about promotion path`,
            rows: 5,
            hint: 'What has been going on with this person recently?'
        },
        {
            id: 'meetingGoals',
            label: 'Meeting Goals',
            type: 'multi-select',
            defaultValue: 'check-in,growth',
            options: [
                { value: 'check-in', label: '💬 General Check-in' },
                { value: 'growth', label: '📈 Career Growth' },
                { value: 'feedback', label: '🎯 Give Feedback' },
                { value: 'blockers', label: '🚧 Address Blockers' },
                { value: 'recognition', label: '🌟 Recognition' },
                { value: 'difficult', label: '⚠️ Difficult Conversation' }
            ]
        },
        {
            id: 'lastMeetingNotes',
            label: 'Last Meeting Notes (optional)',
            type: 'textarea',
            placeholder: 'Any notes from the previous 1:1...',
            rows: 3
        }
    ],

    primaryAction: 'Generate Meeting Prep',

    systemPrompt: `You are an expert leadership coach helping managers prepare effective 1:1 meetings.

## Your Output Should Include:

### 📋 Agenda (5-10 items)
Suggested topics and time allocation

### 💬 Conversation Starters
3-5 open-ended questions to build rapport

### 🎯 Key Questions to Ask
Based on the goals, provide specific questions

### 📝 Notes Template
Structure for taking notes during the meeting

### ⏭️ Follow-up Actions
Suggested action items to track

Be warm, empathetic, and focus on the team member's growth and well-being.`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        return `## Team Member: ${inputs.memberName}
**Role:** ${inputs.memberRole}

## Recent Context
${inputs.recentContext || 'No specific context provided'}

## Meeting Goals
${inputs.meetingGoals?.split(',').join(', ') || 'General check-in'}

${inputs.lastMeetingNotes ? `## Last Meeting Notes\n${inputs.lastMeetingNotes}` : ''}

Please prepare a comprehensive 1:1 meeting prep document.`;
    },

    parseResponse: (response: string): AppOutput => ({
        type: 'markdown',
        content: response,
        actions: [
            { label: 'Copy', icon: '📋', action: 'copy' },
            { label: 'Save', icon: '💾', action: 'newFile', fileExtension: '.md' }
        ]
    }),

    requirements: { copilot: true }
};
