/**
 * Caption Battle - Jackbox-Style Caption Competition
 * 
 * AI generates absurd scenarios, players compete to write
 * the funniest captions. Great for team bonding and laughs!
 */

import { AppDefinition } from '../../types';

export const captionBattleApp: AppDefinition = {
    id: 'caption-battle',
    name: 'Caption Battle',
    icon: '🎨',
    description: 'Write hilarious captions for AI-generated scenarios',
    category: 'games',
    tags: ['team', 'creative', 'funny', 'party'],

    inputs: [
        {
            id: 'vibe',
            label: 'Caption Vibe',
            type: 'radio',
            required: true,
            defaultValue: 'absurd',
            options: [
                { value: 'absurd', label: '🤪 Absurd', description: 'Weird and wacky' },
                { value: 'wholesome', label: '🥰 Wholesome', description: 'Heartwarming humor' },
                { value: 'corporate', label: '💼 Corporate', description: 'Office humor' },
                { value: 'dark', label: '🌑 Dark', description: 'Edgy comedy' },
                { value: 'random', label: '🎲 Random', description: 'Anything goes!' }
            ]
        },
        {
            id: 'scenarioCount',
            label: 'Number of Scenarios',
            type: 'select',
            defaultValue: '3',
            options: [
                { value: '1', label: '1 Scenario (Quick)' },
                { value: '3', label: '3 Scenarios (Standard)' },
                { value: '5', label: '5 Scenarios (Party Mode)' }
            ]
        },
        {
            id: 'theme',
            label: 'Optional Theme',
            type: 'text',
            placeholder: 'e.g., Cats, Space, Monday mornings...',
            hint: 'Leave blank for random scenarios'
        }
    ],

    primaryAction: '🎬 Generate Scenarios',

    systemPrompt: `You are the host of a hilarious party game called "Caption Battle"!

Your job is to create absurd, funny scenarios that players will write captions for.

SCENARIO STYLES:
- Absurd: Completely ridiculous situations that defy logic
- Wholesome: Sweet but funny misunderstandings
- Corporate: Office life taken to extremes
- Dark: Edgy humor (but nothing offensive)
- Random: Mix of everything

IMPORTANT:
1. Describe visual scenarios vividly - paint a picture with words
2. Include unexpected elements that beg for funny commentary
3. Keep scenarios universally relatable
4. End each scenario with a prompt for caption writers

FORMAT YOUR RESPONSE:

---SCENARIO_1---
# 🎬 Scene 1

**The Scene:**
[Vivid 2-3 sentence description of the scenario. Be specific and paint a picture!]

**The Details:**
[One or two absurd additional details that make it funnier]

💬 **Your Caption:** _____________________

---SCENARIO_2---
[Same format...]

---TIPS---
🏆 **Winning Caption Tips:**
- Subvert expectations
- Add a twist ending
- Reference something unexpected
- Keep it punchy!`,

    buildUserPrompt: (inputs) => {
        const vibe = inputs.vibe || 'absurd';
        const count = inputs.scenarioCount || '3';
        const theme = inputs.theme?.trim();

        return `Generate ${count} ${vibe} scenarios for Caption Battle.

${theme ? `Theme to incorporate: "${theme}"` : 'Use completely random themes.'}

Each scenario should:
1. Be vividly described so players can "see" it
2. Have at least one absurd or unexpected element
3. Be perfect for writing funny one-liners about
4. Work for a diverse team audience (SFW)

Make them genuinely funny and caption-worthy!`;
    }
};
