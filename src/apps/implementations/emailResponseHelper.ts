import { AppDefinition } from '../types';

export const emailResponseHelperApp: AppDefinition = {
    id: 'email-response-helper',
    name: 'Email Response Helper',
    description: 'Get help responding to tricky emails you don\'t know how to answer',
    icon: '📧',
    category: 'communication',
    primaryAction: '✨ Generate Responses',
    helpDocumentation: `### What is this?
The **Email Response Helper** helps you craft the perfect response to emails that leave you stumped - whether it's a difficult request, awkward situation, or you just don't know what to say.

### How to use it
1. Paste the email you received
2. Tell us what kind of response you want to send
3. Add any context or constraints
4. Get multiple response options to choose from

### Use cases
- Declining requests politely
- Responding to vague or confusing emails
- Handling difficult conversations
- Navigating office politics
- Buying time when you need to think`,
    inputs: [
        {
            id: 'originalEmail',
            label: '📥 Paste the email you need to respond to',
            type: 'textarea',
            placeholder: 'Paste the full email here... (You can include the whole thread if helpful)',
            required: true
        },
        {
            id: 'responseIntent',
            label: '🎯 What do you want to achieve?',
            type: 'select',
            options: [
                { value: 'accept', label: '✅ Accept / Agree' },
                { value: 'decline', label: '❌ Decline / Say No' },
                { value: 'delay', label: '⏰ Buy Time / Delay' },
                { value: 'clarify', label: '❓ Ask for Clarification' },
                { value: 'escalate', label: '⬆️ Escalate / Loop Someone In' },
                { value: 'apologize', label: '🙏 Apologize' },
                { value: 'pushback', label: '🛡️ Push Back / Set Boundaries' },
                { value: 'delegate', label: '➡️ Redirect / Delegate' },
                { value: 'neutral', label: '😐 Neutral Acknowledgement' },
                { value: 'other', label: '✍️ Other (describe below)' }
            ],
            defaultValue: 'decline'
        },
        {
            id: 'additionalContext',
            label: '📝 Additional context (optional)',
            type: 'textarea',
            placeholder: 'Any background info, constraints, or specific points to include? (e.g., "I actually can\'t do this because of project X deadline" or "I need to sound firm but not rude")'
        },
        {
            id: 'tone',
            label: '🎨 Tone',
            type: 'checkbox-group',
            options: [
                { value: 'professional', label: '💼 Professional' },
                { value: 'friendly', label: '🙂 Friendly' },
                { value: 'firm', label: '🛡️ Firm' },
                { value: 'diplomatic', label: '🤝 Diplomatic' },
                { value: 'empathetic', label: '❤️ Empathetic' },
                { value: 'brief', label: '⚡ Brief / Direct' },
                { value: 'formal', label: '📜 Formal' },
                { value: 'casual', label: '👋 Casual' }
            ],
            defaultValue: 'professional,friendly'
        },
        {
            id: 'length',
            label: '📏 Response Length',
            type: 'radio',
            options: [
                { value: 'short', label: 'Short (2-3 sentences)', description: 'Quick and direct' },
                { value: 'medium', label: 'Medium (1 paragraph)', description: 'Standard email' },
                { value: 'long', label: 'Long (multiple paragraphs)', description: 'Detailed explanation' }
            ],
            defaultValue: 'medium'
        },
        {
            id: 'count',
            label: '🔢 How many options?',
            type: 'select',
            options: [
                { value: '3', label: '3 variations' },
                { value: '5', label: '5 variations' }
            ],
            defaultValue: '3'
        }
    ],
    systemPrompt: `You are an expert at crafting email responses for difficult or awkward situations. You help people respond when they don't know what to say.

CRITICAL RULES:
1. Output ONLY plain text - no markdown, no formatting, no asterisks, no headers
2. Generate the EXACT number of variations requested
3. Each variation should take a different approach - different opening, different framing, different emphasis
4. Keep the specified length strictly
5. Blend ALL selected tones naturally together
6. Make responses feel natural and human, not robotic

Read the original email carefully and craft responses that:
- Address the core issue appropriately
- Match the requested intent (accept, decline, delay, etc.)
- Feel authentic and appropriate for workplace communication
- Don't sound AI-generated or templated

Format your response as numbered options, each separated by a blank line:

1. [First response option]

2. [Second response option]

3. [Third response option]

(and so on for the requested count)`,
    buildUserPrompt: (inputs) => {
        const tones = Array.isArray(inputs.tone) ? inputs.tone.join(', ') : inputs.tone;
        return `Generate ${inputs.count} email response options.

ORIGINAL EMAIL TO RESPOND TO:
---
${inputs.originalEmail}
---

Response Goal: ${inputs.responseIntent}
${inputs.additionalContext ? `Additional Context: ${inputs.additionalContext}` : ''}
Tone: ${tones}
Length: ${inputs.length}

Remember: Plain text only, no markdown. Make each response feel genuine and natural. Each variation should take a slightly different approach.`;
    },
    parseResponse: (response) => {
        const messages = response.split(/\n\n(?=\d+\.)/);
        const sections = messages.map((msg, i) => ({
            title: `Option ${i + 1}`,
            content: msg.replace(/^\d+\.\s*/, '').trim()
        }));

        return {
            type: 'sections',
            content: response,
            sections: sections.length > 0 ? sections : [{ title: 'Responses', content: response }]
        };
    }
};
