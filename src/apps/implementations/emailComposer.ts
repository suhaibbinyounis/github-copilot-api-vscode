import { AppDefinition } from '../types';

export const emailComposerApp: AppDefinition = {
    id: 'email-composer',
    name: 'Email Composer',
    description: 'Draft professional emails from key points',
    icon: '📧',
    category: 'communication',
    primaryAction: '✉️ Compose Email',
    helpDocumentation: `### What is this?
The **Email Composer** transforms bullet points and rough notes into polished, professional emails ready to send.

### How to use it
1. Enter the key points you want to communicate.
2. Select the tone and purpose of your email.
3. Click **Compose Email** to get a well-structured draft.

### Use cases
- Writing status updates to stakeholders
- Sending project proposals
- Following up on meetings
- Communicating difficult messages professionally`,
    inputs: [
        {
            id: 'keyPoints',
            label: 'Key Points',
            type: 'textarea',
            placeholder: '- Project deadline moved to next Friday\n- Need design approval by Wednesday\n- Budget approved for additional resources\n- Thanks for their support',
            required: true,
            rows: 5,
            hint: 'List the main things you want to say'
        },
        {
            id: 'recipient',
            label: 'Who is this for?',
            type: 'text',
            placeholder: 'e.g., My manager, Client stakeholder, Team members',
            hint: 'Helps adjust formality and context'
        },
        {
            id: 'tone',
            label: 'Tone',
            type: 'radio',
            options: [
                { value: 'professional', label: 'Professional', description: 'Formal and business-appropriate' },
                { value: 'friendly', label: 'Friendly', description: 'Warm but still professional' },
                { value: 'urgent', label: 'Urgent', description: 'Direct and action-focused' },
                { value: 'apologetic', label: 'Apologetic', description: 'Acknowledging mistakes or delays' }
            ],
            defaultValue: 'professional'
        },
        {
            id: 'purpose',
            label: 'Email Purpose',
            type: 'select',
            options: [
                { value: 'update', label: 'Status Update' },
                { value: 'request', label: 'Request / Ask' },
                { value: 'followup', label: 'Follow-up' },
                { value: 'announcement', label: 'Announcement' },
                { value: 'thankyou', label: 'Thank You' },
                { value: 'introduction', label: 'Introduction' }
            ],
            defaultValue: 'update'
        }
    ],
    systemPrompt: `You are an expert business communicator. Draft clear, professional emails that effectively convey the key messages while maintaining the appropriate tone.

Guidelines:
- Start with a clear subject line suggestion
- Keep paragraphs short and scannable
- Use bullet points for lists when appropriate
- Include a clear call-to-action if needed
- End with an appropriate closing
- Keep the email concise (under 200 words unless complex)

Format:
**Subject:** [Suggested subject line]

[Email body]

[Closing]`,
    buildUserPrompt: (inputs) => {
        let prompt = `Write a ${inputs.tone} ${inputs.purpose} email with these key points:\n\n${inputs.keyPoints}`;
        if (inputs.recipient?.trim()) {
            prompt += `\n\nRecipient: ${inputs.recipient}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Email Draft', content: response }]
    })
};
