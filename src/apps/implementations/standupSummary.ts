/**
 * Standup Summary App
 * 
 * Transform stream-of-consciousness notes into formatted standup updates.
 * Supports multiple output formats for different communication channels.
 */

import { AppDefinition, AppOutput } from '../types';

export const standupSummaryApp: AppDefinition = {
    id: 'standup-summary',
    name: 'Standup Summary',
    description: 'Format your daily standup update',
    icon: '📊',
    category: 'productivity',
    helpDocumentation: `
### What is this?
The **Standup Summary** app transforms your informal thoughts or "stream of consciousness" notes into a professionally formatted daily update.

### How to use it:
1. **Unload Your Thoughts**: Just type what you did yesterday, what you're doing today, and any blockers. Don't worry about formatting.
2. **Choose Format**: Select your target channel (Slack, Teams, etc.).
3. **Set Tone**: Match your team's culture with Professional, Casual, or Ultra-Brief styles.
4. **Generate**: The AI will organize your points using action verbs and highlight blockers clearly.

### Use cases:
- Preparing for a morning standup call.
- Posting a daily update to an async team channel.
- Maintaining a personal log of daily engineering activity.
    `,

    inputs: [
        {
            id: 'thoughts',
            label: 'What\'s on your mind? (stream of consciousness is fine)',
            type: 'textarea',
            placeholder: `Just type what you're thinking, e.g.:

yesterday fixed that auth bug that was blocking QA, also reviewed 3 PRs for the team. today gonna work on the payment integration, need to figure out stripe webhooks. blocked on getting API keys from finance team, sent email but no response yet. also need to sync with Sarah about the design...`,
            required: true,
            rows: 8,
            hint: 'Don\'t worry about formatting - we\'ll organize it for you'
        },
        {
            id: 'outputFormat',
            label: 'Output Format',
            type: 'select',
            defaultValue: 'slack',
            options: [
                { value: 'slack', label: '💬 Slack-Ready', description: 'With emojis, formatted for Slack' },
                { value: 'teams', label: '👥 Microsoft Teams', description: 'Teams-compatible formatting' },
                { value: 'jira', label: '🎫 JIRA Comment', description: 'For JIRA standup notes' },
                { value: 'plain', label: '📄 Plain Text', description: 'Simple, no formatting' },
                { value: 'email', label: '📧 Email', description: 'Professional email format' },
                { value: 'bullet', label: '• Bullet Points', description: 'Simple bullet list' }
            ]
        },
        {
            id: 'includeDate',
            label: 'Include Date',
            type: 'checkbox',
            defaultValue: 'true'
        },
        {
            id: 'tone',
            label: 'Tone',
            type: 'select',
            defaultValue: 'professional',
            options: [
                { value: 'casual', label: '😎 Casual', description: 'Relaxed, friendly' },
                { value: 'professional', label: '👔 Professional', description: 'Clear and business-like' },
                { value: 'brief', label: '⚡ Ultra-Brief', description: 'Minimal words, just the essentials' }
            ]
        },
        {
            id: 'teamContext',
            label: 'Team/Project (optional)',
            type: 'text',
            placeholder: 'e.g., Platform Team, Project Phoenix',
            hint: 'Adds context if posting to shared channels'
        }
    ],

    primaryAction: 'Generate Summary',

    systemPrompt: `You are an expert at turning informal thoughts into clear, professional standup updates.
Transform the user's stream of consciousness into a well-organized standup summary.

## Standard Standup Structure

1. **Yesterday/Done** - What was completed
2. **Today/Doing** - What's planned for today
3. **Blockers** - Any blockers or impediments (if any)

## Guidelines

1. **Be Concise**: Keep each item to one line when possible
2. **Use Action Verbs**: "Fixed", "Completed", "Working on", "Reviewing"
3. **Highlight Impact**: Mention who benefits or why it matters
4. **Be Specific**: Include ticket numbers, feature names, etc. if mentioned
5. **Group Related Items**: Combine related work into single points
6. **Blockers are Important**: Always highlight blockers clearly

## Format-Specific Instructions

### Slack Format
\`\`\`
🔄 *Standup Update - [Date]*

*Yesterday:*
✅ [Completed item 1]
✅ [Completed item 2]

*Today:*
🎯 [Planned item 1]
🎯 [Planned item 2]

*Blockers:*
🚧 [Blocker if any] (or ✨ No blockers!)
\`\`\`

### Teams Format
Use **bold** for headers, standard bullets.

### JIRA Format
Use h4. for headers, * for bullets.

### Email Format
Professional tone, proper greeting, signature placeholder.

### Plain/Bullet
Simple, clean formatting.

## Tone Guidelines

- **Casual**: Use contractions, friendly language, more emojis
- **Professional**: Clear, business-like, minimal emojis
- **Ultra-Brief**: Just the facts, no fluff, telegram style`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        const parts: string[] = [];

        parts.push(`## My Thoughts/Notes\n${inputs.thoughts}`);

        parts.push(`## Output Format: ${inputs.outputFormat || 'slack'}`);
        parts.push(`## Tone: ${inputs.tone || 'professional'}`);

        if (inputs.includeDate === 'true') {
            const today = new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
            });
            parts.push(`## Date: ${today}`);
        }

        if (inputs.teamContext) {
            parts.push(`## Context: ${inputs.teamContext}`);
        }

        parts.push(`\nPlease transform my notes into a clean, organized standup update following the format and tone specified.`);

        return parts.join('\n\n');
    },

    parseResponse: (response: string, inputs: Record<string, string>): AppOutput => {
        return {
            type: 'markdown',
            content: response,
            actions: [
                { label: 'Copy', icon: '📋', action: 'copy' },
                { label: 'Insert at Cursor', icon: '📝', action: 'insert' }
            ]
        };
    },

    defaultActions: [
        { label: 'Copy', icon: '📋', action: 'copy' }
    ],

    requirements: {
        copilot: true
    },

    examples: [
        {
            name: 'Typical Developer Day',
            inputs: {
                thoughts: `yesterday fixed the auth bug in the login flow, the one that was causing 500 errors. also reviewed prs from john and sarah. today going to start on the new dashboard feature, need to check requirements with PM first. might be blocked on design mocks, asked in slack but havent heard back`,
                outputFormat: 'slack',
                tone: 'professional',
                includeDate: 'true'
            }
        },
        {
            name: 'Quick Update',
            inputs: {
                thoughts: `finished api integration, starting frontend now, no blockers`,
                outputFormat: 'bullet',
                tone: 'brief',
                includeDate: 'false'
            }
        }
    ]
};
