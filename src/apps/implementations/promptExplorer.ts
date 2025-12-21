import { AppDefinition } from '../types';

export const promptExplorerApp: AppDefinition = {
    id: 'prompt-explorer',
    name: 'Prompt Explorer',
    description: 'Generate effective prompts for AI tools',
    icon: '🔮',
    category: 'inspiration',
    primaryAction: '✨ Generate Prompts',
    helpDocumentation: `### What is this?
The **Prompt Explorer** helps you craft better prompts for AI tools like ChatGPT, Midjourney, Claude, and more. Get optimized prompts that deliver better results.

### How to use it
1. Describe what you want the AI to do.
2. Select the target AI tool.
3. Click **Generate Prompts** to get optimized prompt variations.

### Use cases
- Writing effective prompts for code generation
- Creating detailed image generation prompts
- Improving AI writing assistant outputs
- Learning prompt engineering techniques`,
    inputs: [
        {
            id: 'goal',
            label: 'What do you want the AI to do?',
            type: 'textarea',
            placeholder: 'e.g., Write a marketing email for a product launch\n\nOr: Generate an image of a futuristic city\n\nOr: Help me debug a React component',
            required: true,
            rows: 3,
            hint: 'Be specific about your desired outcome'
        },
        {
            id: 'targetAi',
            label: 'Target AI Tool',
            type: 'select',
            options: [
                { value: 'chatgpt', label: 'ChatGPT / GPT-4' },
                { value: 'claude', label: 'Claude' },
                { value: 'copilot', label: 'GitHub Copilot' },
                { value: 'midjourney', label: 'Midjourney' },
                { value: 'dalle', label: 'DALL-E' },
                { value: 'stable-diffusion', label: 'Stable Diffusion' },
                { value: 'general', label: 'General Purpose' }
            ],
            defaultValue: 'general'
        },
        {
            id: 'style',
            label: 'Prompt Style',
            type: 'radio',
            options: [
                { value: 'simple', label: 'Simple & Direct', description: 'Clear, straightforward prompts' },
                { value: 'detailed', label: 'Detailed & Structured', description: 'With context, examples, constraints' },
                { value: 'chain', label: 'Chain of Thought', description: 'Step-by-step reasoning approach' }
            ],
            defaultValue: 'detailed'
        }
    ],
    systemPrompt: `You are an expert prompt engineer. Create optimized prompts that get the best results from AI tools.

Generate 3-4 prompt variations, from simple to advanced:
1. **Basic Prompt**: Quick, direct approach
2. **Structured Prompt**: With context and constraints
3. **Expert Prompt**: Using advanced techniques (few-shot, chain-of-thought, etc.)

For each prompt:
- Show the actual prompt text in a code block
- Add a brief note on when to use it
- Include any variables/placeholders in [brackets]

Also include tips specific to the target AI tool.`,
    buildUserPrompt: (inputs) => {
        return `Create ${inputs.style} prompts for ${inputs.targetAi} to accomplish:\n\n${inputs.goal}`;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Prompt Ideas', content: response }]
    })
};
