import { AppDefinition } from '../types';

export const slackPolisherApp: AppDefinition = {
    id: 'slack-polisher',
    name: 'Slack Message Polisher',
    description: 'Rewrite casual text into clear, professional messages',
    icon: '💬',
    category: 'communication',
    primaryAction: '✨ Polish Message',
    helpDocumentation: `### What is this?
The **Slack Message Polisher** takes your rough draft messages and refines them for clarity, professionalism, and impact—perfect for important Slack communications.

### How to use it
1. Type your rough message as you'd naturally write it.
2. Select your target audience and desired outcome.
3. Click **Polish Message** to get an improved version.

### Use cases
- Announcing project updates to the team
- Asking for help without sounding needy
- Giving feedback constructively
- Communicating across time zones clearly`,
    inputs: [
        {
            id: 'roughMessage',
            label: 'Your Draft Message',
            type: 'textarea',
            placeholder: 'hey so we finished the thing but there were some issues and we might need to push the deadline a bit, can someone look at the api stuff?',
            required: true,
            rows: 4,
            hint: 'Write naturally, we\'ll polish it for you'
        },
        {
            id: 'audience',
            label: 'Who\'s reading this?',
            type: 'select',
            options: [
                { value: 'team', label: 'My Team' },
                { value: 'manager', label: 'My Manager' },
                { value: 'leadership', label: 'Leadership / Executives' },
                { value: 'cross-team', label: 'Cross-functional Team' },
                { value: 'external', label: 'External Partner / Client' }
            ],
            defaultValue: 'team'
        },
        {
            id: 'goal',
            label: 'What\'s the goal?',
            type: 'select',
            options: [
                { value: 'inform', label: 'Inform / Update' },
                { value: 'ask', label: 'Ask for Help' },
                { value: 'decide', label: 'Get a Decision' },
                { value: 'celebrate', label: 'Celebrate / Recognize' },
                { value: 'warn', label: 'Flag a Risk / Issue' }
            ],
            defaultValue: 'inform'
        },
        {
            id: 'channelType',
            label: 'Channel Type',
            type: 'radio',
            options: [
                { value: 'public', label: 'Public Channel', description: 'Visible to many people' },
                { value: 'private', label: 'Private / DM', description: 'More informal ok' }
            ],
            defaultValue: 'public'
        }
    ],
    systemPrompt: `You are a communication coach specializing in async workplace messaging. Rewrite the user's draft into a clear, effective Slack message.

Guidelines:
- Keep it concise (Slack is for quick reads)
- Use emoji sparingly but effectively
- Structure longer messages with bullet points
- Make the ask or update crystal clear
- Add context without over-explaining
- Match formality to the audience

Provide:
1. The polished message
2. Brief note on what was improved (1-2 sentences)`,
    buildUserPrompt: (inputs) => {
        return `Rewrite this ${inputs.channelType} Slack message for ${inputs.audience}. Goal: ${inputs.goal}.\n\nOriginal draft:\n${inputs.roughMessage}`;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Polished Message', content: response }]
    })
};
