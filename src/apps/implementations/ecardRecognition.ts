import { AppDefinition } from '../types';

export const ecardRecognitionApp: AppDefinition = {
    id: 'ecard-recognition',
    name: 'eCard & Recognition',
    description: 'Generate heartfelt recognition messages and eCards for colleagues',
    icon: '🎉',
    category: 'communication',
    primaryAction: '✨ Generate Messages',
    helpDocumentation: `### What is this?
The **eCard & Recognition** app helps you craft thoughtful, personalized recognition messages for your teammates and colleagues.

### How to use it
1. Enter the name(s) of the person/people you're recognizing
2. Describe what you're calling out (achievement, behavior, milestone)
3. Select one or more tones that fit the occasion
4. Click **Generate Messages** for multiple options

### Use cases
- Peer recognition and kudos
- Team milestone celebrations
- Work anniversary messages
- Project completion shoutouts
- Thank you notes`,
    inputs: [
        {
            id: 'recipients',
            label: '👤 Who is this for?',
            type: 'textarea',
            placeholder: 'Enter name(s) - e.g., "Sarah" or "The DevOps Team" or "Mike, Lisa, and Raj"',
            required: true
        },
        {
            id: 'occasion',
            label: '🎯 What are we celebrating?',
            type: 'select',
            options: [
                { value: 'achievement', label: '🏆 Achievement / Milestone' },
                { value: 'teamwork', label: '🤝 Great Teamwork' },
                { value: 'helping', label: '💪 Going Above & Beyond' },
                { value: 'innovation', label: '💡 Innovation / Great Idea' },
                { value: 'delivery', label: '🚀 Successful Delivery' },
                { value: 'anniversary', label: '🎂 Work Anniversary' },
                { value: 'welcome', label: '👋 Welcome to Team' },
                { value: 'farewell', label: '👋 Farewell / Best Wishes' },
                { value: 'thankyou', label: '🙏 Thank You' },
                { value: 'other', label: '✍️ Other (describe below)' }
            ],
            defaultValue: 'achievement'
        },
        {
            id: 'details',
            label: '📝 Details / Context',
            type: 'textarea',
            placeholder: 'What specifically did they do? Any background or details to include? (e.g., "Led the migration to the new platform ahead of schedule despite challenges")',
            required: true
        },
        {
            id: 'tones',
            label: '🎨 Tone (select all that apply)',
            type: 'checkbox-group',
            options: [
                { value: 'professional', label: '💼 Professional' },
                { value: 'warm', label: '❤️ Warm & Heartfelt' },
                { value: 'funny', label: '😄 Funny / Light' },
                { value: 'inspiring', label: '✨ Inspiring' },
                { value: 'casual', label: '🙂 Casual / Friendly' },
                { value: 'formal', label: '📜 Formal' },
                { value: 'enthusiastic', label: '🎉 Enthusiastic' },
                { value: 'sincere', label: '💯 Sincere & Genuine' }
            ],
            defaultValue: 'professional,warm'
        },
        {
            id: 'length',
            label: '📏 Message Length',
            type: 'radio',
            options: [
                { value: 'short', label: 'Short (1-2 sentences)', description: 'Quick kudos' },
                { value: 'medium', label: 'Medium (3-4 sentences)', description: 'Standard recognition' },
                { value: 'long', label: 'Long (paragraph)', description: 'Detailed appreciation' }
            ],
            defaultValue: 'medium'
        },
        {
            id: 'count',
            label: '🔢 How many options?',
            type: 'select',
            options: [
                { value: '3', label: '3 variations' },
                { value: '5', label: '5 variations' },
                { value: '7', label: '7 variations' }
            ],
            defaultValue: '3'
        }
    ],
    systemPrompt: `You are an expert at crafting recognition messages and eCards. Your messages are genuine, impactful, and memorable.

CRITICAL RULES:
1. Output ONLY plain text - no markdown, no formatting, no asterisks, no headers
2. Generate the EXACT number of variations requested
3. Each variation should feel distinct - different opening, structure, and emphasis
4. Keep the specified length strictly
5. Blend ALL selected tones naturally together

For each message:
- Start differently (don't always start with "I want to..." or "Congratulations...")
- Be specific about the achievement when details are provided
- Make it feel personal and genuine, not generic
- Avoid corporate jargon and clichés when possible
- If "funny" is selected, add tasteful humor that's workplace-appropriate

Format your response as numbered messages, each separated by a blank line:

1. [First message]

2. [Second message]

3. [Third message]

(and so on for the requested count)`,
    buildUserPrompt: (inputs) => {
        const tones = Array.isArray(inputs.tones) ? inputs.tones.join(', ') : inputs.tones;
        return `Generate ${inputs.count} recognition messages.

Recipient(s): ${inputs.recipients}
Occasion: ${inputs.occasion}
Details: ${inputs.details}
Tones to blend: ${tones}
Length: ${inputs.length}

Remember: Plain text only, no markdown. Make each variation unique and memorable.`;
    },
    parseResponse: (response) => {
        // Split by numbered items and create sections for each
        const messages = response.split(/\n\n(?=\d+\.)/);
        const sections = messages.map((msg, i) => ({
            title: `Option ${i + 1}`,
            content: msg.replace(/^\d+\.\s*/, '').trim()
        }));

        return {
            type: 'sections',
            content: response,
            sections: sections.length > 0 ? sections : [{ title: 'Messages', content: response }]
        };
    }
};
