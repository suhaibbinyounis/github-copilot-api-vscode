import { AppDefinition } from '../types';

export const rubberDuckTherapistApp: AppDefinition = {
    id: 'rubber-duck-therapist',
    name: 'Rubber Duck Therapist',
    description: 'Talk through problems with a supportive listener',
    icon: '🦆',
    category: 'wellness',
    primaryAction: '💬 Start Talking',
    helpDocumentation: `### What is this?
The **Rubber Duck Therapist** is a supportive conversation partner. Based on the "rubber duck debugging" technique, it helps you talk through problems, gain clarity, and feel heard.

### ⚠️ Important Note
This is NOT a replacement for professional mental health support. If you're struggling with serious issues, please reach out to a qualified professional.

### How to use it
1. Share what's on your mind—work stress, a decision you're facing, or just need to vent.
2. The duck will listen, ask clarifying questions, and help you think it through.
3. Continue the conversation as long as you need.

### Use cases
- Working through frustrating problems
- Making difficult decisions
- Decompressing after a tough day
- Gaining perspective on challenges`,
    inputs: [
        {
            id: 'thoughts',
            label: 'What\'s on your mind?',
            type: 'textarea',
            placeholder: 'Share whatever you\'re thinking about. This is a safe space to express yourself...',
            required: true,
            rows: 6,
            hint: 'Be as open as you feel comfortable. Everything stays here.'
        },
        {
            id: 'support',
            label: 'What would help most?',
            type: 'radio',
            options: [
                { value: 'listen', label: '👂 Just Listen', description: 'Validate and understand' },
                { value: 'questions', label: '❓ Ask Questions', description: 'Help me think it through' },
                { value: 'perspective', label: '🔮 New Perspective', description: 'Offer alternative viewpoints' },
                { value: 'action', label: '⚡ Action Ideas', description: 'Help me figure out next steps' }
            ],
            defaultValue: 'questions'
        }
    ],
    systemPrompt: `You are a supportive, empathetic listener (the "rubber duck therapist"). Your role is to help the user process their thoughts and feelings.

Guidelines:
- Be warm, supportive, and non-judgmental
- Don't give medical or psychological advice
- Use active listening techniques (reflect, validate, clarify)
- Ask open-ended questions to help them explore
- Acknowledge emotions before offering perspective
- Keep responses conversational, not clinical
- Use gentle humor when appropriate (you ARE a duck 🦆)

IMPORTANT: If someone expresses serious mental health concerns or thoughts of self-harm, provide appropriate resources and encourage professional support.

Start with warmth, end with gentle encouragement.`,
    buildUserPrompt: (inputs) => {
        return `Mode: ${inputs.support}\n\n${inputs.thoughts}`;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Response', content: response }]
    })
};
