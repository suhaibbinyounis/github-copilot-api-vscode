import { AppDefinition } from '../types';

export const focusMindfulnessApp: AppDefinition = {
    id: 'focus-mindfulness',
    name: 'Focus & Mindfulness',
    description: 'Quick guided breathing or focus exercises',
    icon: '🧘',
    category: 'wellness',
    primaryAction: '🌬️ Start Exercise',
    helpDocumentation: `### What is this?
The **Focus & Mindfulness** app provides quick mental reset exercises to help you regain focus, reduce stress, or prepare for important tasks.

### How to use it
1. Select the type of exercise you need.
2. Choose how much time you have.
3. Click **Start Exercise** for a guided session.

### Use cases
- Mental reset before a big meeting
- Decompression after intense focus work
- Starting the day with intention
- Breaking out of an afternoon slump`,
    inputs: [
        {
            id: 'exerciseType',
            label: 'What do you need?',
            type: 'radio',
            options: [
                { value: 'breathing', label: '🌬️ Breathing Exercise', description: 'Calm your nervous system' },
                { value: 'focus', label: '🎯 Focus Reset', description: 'Sharpen concentration' },
                { value: 'energy', label: '⚡ Energy Boost', description: 'Shake off sluggishness' },
                { value: 'calm', label: '😌 Stress Relief', description: 'Release tension' },
                { value: 'transition', label: '🚪 Work Transition', description: 'Shift between tasks/contexts' }
            ],
            defaultValue: 'breathing'
        },
        {
            id: 'duration',
            label: 'How much time?',
            type: 'select',
            options: [
                { value: '1', label: '1 minute (super quick)' },
                { value: '3', label: '3 minutes (short break)' },
                { value: '5', label: '5 minutes (proper reset)' }
            ],
            defaultValue: '3'
        },
        {
            id: 'style',
            label: 'Guidance Style',
            type: 'radio',
            options: [
                { value: 'gentle', label: 'Gentle', description: 'Soft, calming instructions' },
                { value: 'direct', label: 'Direct', description: 'Clear, efficient guidance' }
            ],
            defaultValue: 'gentle'
        }
    ],
    systemPrompt: `You are a mindfulness guide providing quick, effective exercises for busy professionals.

Create an exercise that fits the requested duration. Structure:
1. **Setup** (10-15 seconds read time)
   - What position to take
   - What to do with eyes/hands
   
2. **The Exercise** (main content)
   - Step-by-step guidance
   - Use time cues ("For the next 30 seconds...")
   - For breathing: specific patterns (e.g., 4-7-8)
   
3. **Return** (10 seconds)
   - Gentle return to activity
   - One-line intention or reminder

Guidelines:
- Be concise—this is for busy people
- Use formatting for easy scanning
- Include physical cues (body awareness)
- No spiritual/religious language
- End on an empowering note

Format with clear steps, using numbers or bullet points.`,
    buildUserPrompt: (inputs) => {
        return `Create a ${inputs.duration}-minute ${inputs.exerciseType} exercise. Style: ${inputs.style}.`;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Exercise', content: response }]
    })
};
