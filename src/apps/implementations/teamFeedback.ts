/**
 * Team Feedback Generator - Leadership App
 * 
 * Help managers provide constructive, actionable feedback to team members.
 */

import { AppDefinition, AppOutput } from '../types';

export const teamFeedbackApp: AppDefinition = {
    id: 'team-feedback-generator',
    name: 'Team Feedback Generator',
    description: 'Craft constructive feedback using proven frameworks',
    icon: '💬',
    category: 'leadership',
    tags: ['feedback', 'coaching', 'communication', 'management'],
    helpDocumentation: `
### What is this?
Generate professional, constructive feedback using proven frameworks like SBI (Situation-Behavior-Impact).

### How to use:
1. Describe the situation and behavior
2. Choose feedback type and framework
3. Get well-structured, actionable feedback
    `,

    inputs: [
        {
            id: 'recipientName',
            label: 'Feedback Recipient',
            type: 'text',
            placeholder: 'e.g., Jamie',
            required: true
        },
        {
            id: 'feedbackType',
            label: 'Feedback Type',
            type: 'radio',
            defaultValue: 'constructive',
            options: [
                { value: 'positive', label: '🌟 Positive / Recognition', description: 'Reinforce great behavior' },
                { value: 'constructive', label: '🔧 Constructive', description: 'Help them improve' },
                { value: 'redirect', label: '🔄 Redirect', description: 'Course correction needed' }
            ]
        },
        {
            id: 'situation',
            label: 'Situation',
            type: 'textarea',
            placeholder: 'What happened? When and where?\n\ne.g., During yesterday\'s sprint planning meeting...',
            rows: 3,
            required: true,
            hint: 'Be specific about time, place, and context'
        },
        {
            id: 'behavior',
            label: 'Observed Behavior',
            type: 'textarea',
            placeholder: 'What did they do or say?\n\ne.g., They interrupted teammates 3 times and dismissed alternative ideas quickly.',
            rows: 3,
            required: true,
            hint: 'Focus on observable facts, not assumptions'
        },
        {
            id: 'impact',
            label: 'Impact',
            type: 'textarea',
            placeholder: 'What was the effect?\n\ne.g., Other team members stopped sharing their ideas and the meeting ended without buy-in.',
            rows: 3,
            hint: 'How did it affect the team, project, or outcomes?'
        },
        {
            id: 'desiredOutcome',
            label: 'Desired Outcome',
            type: 'textarea',
            placeholder: 'What would you like to see instead?',
            rows: 2
        },
        {
            id: 'framework',
            label: 'Feedback Framework',
            type: 'select',
            defaultValue: 'sbi',
            options: [
                { value: 'sbi', label: '🎯 SBI (Situation-Behavior-Impact)' },
                { value: 'star', label: '⭐ STAR (Situation-Task-Action-Result)' },
                { value: 'coin', label: '🪙 COIN (Context-Observation-Impact-Next)' },
                { value: 'simple', label: '📝 Simple Direct Feedback' }
            ]
        },
        {
            id: 'deliveryMethod',
            label: 'Delivery Method',
            type: 'radio',
            defaultValue: 'verbal',
            options: [
                { value: 'verbal', label: '🗣️ In-person / Video', description: 'Script for conversation' },
                { value: 'written', label: '✉️ Written / Email', description: 'Written message' },
                { value: 'both', label: '📋 Both', description: 'Script + follow-up email' }
            ]
        }
    ],

    primaryAction: 'Generate Feedback',

    systemPrompt: `You are an expert leadership coach helping managers deliver effective feedback.

## Key Principles:
1. **Be Specific**: Use concrete examples
2. **Be Timely**: Reference recent events
3. **Be Constructive**: Focus on growth, not blame
4. **Be Actionable**: Provide clear next steps
5. **Be Empathetic**: Consider their perspective

## Output Should Include:
1. **Opening** - Set positive tone
2. **Feedback (using selected framework)**
3. **Discussion Prompts** - Questions to ask them
4. **Suggested Next Steps** - Concrete actions
5. **Closing** - End on supportive note

For written feedback, use a professional but warm tone.
For verbal scripts, include pauses and checkpoints for dialogue.`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        const frameworkLabels: Record<string, string> = {
            'sbi': 'SBI (Situation-Behavior-Impact)',
            'star': 'STAR (Situation-Task-Action-Result)',
            'coin': 'COIN (Context-Observation-Impact-Next)',
            'simple': 'Simple Direct'
        };

        return `## Feedback Request

**Recipient:** ${inputs.recipientName}
**Type:** ${inputs.feedbackType}
**Framework:** ${frameworkLabels[inputs.framework]}
**Delivery:** ${inputs.deliveryMethod}

### Situation
${inputs.situation}

### Observed Behavior
${inputs.behavior}

### Impact
${inputs.impact || 'Not specified'}

### Desired Outcome
${inputs.desiredOutcome || 'Improvement in this area'}

Please generate professional feedback ready for delivery.`;
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
