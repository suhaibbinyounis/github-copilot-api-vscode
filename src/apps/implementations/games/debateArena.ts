/**
 * Debate Arena - AI-Judged Hot Take Debates
 * 
 * Get assigned a random controversial position and defend it!
 * AI generates topics, provides arguments, and judges the debate.
 */

import { AppDefinition } from '../../types';

export const debateArenaApp: AppDefinition = {
    id: 'debate-arena',
    name: 'Debate Arena',
    icon: '⚔️',
    description: 'Defend random hot takes - AI judges your arguments',
    category: 'games',
    tags: ['team', 'debate', 'thinking', 'competitive'],

    inputs: [
        {
            id: 'category',
            label: 'Debate Category',
            type: 'radio',
            required: true,
            defaultValue: 'tech',
            options: [
                { value: 'tech', label: '💻 Tech Wars', description: 'Tabs vs spaces, etc.' },
                { value: 'food', label: '🍕 Food Fights', description: 'Pineapple on pizza?' },
                { value: 'life', label: '🌍 Life Choices', description: 'Morning person vs night owl' },
                { value: 'work', label: '💼 Work Style', description: 'Remote vs office' },
                { value: 'random', label: '🎲 Random', description: 'Anything goes!' }
            ]
        },
        {
            id: 'mode',
            label: 'Game Mode',
            type: 'radio',
            required: true,
            defaultValue: 'solo',
            options: [
                { value: 'solo', label: '🎤 Solo', description: 'You vs yourself - argue both sides!' },
                { value: 'vsai', label: '🤖 vs AI', description: 'Debate against the AI' },
                { value: 'prep', label: '📝 Prep Mode', description: 'Get arguments for a 1v1 with a friend' }
            ]
        },
        {
            id: 'customTopic',
            label: 'Custom Topic (Optional)',
            type: 'text',
            placeholder: 'e.g., "Cereal is a soup"',
            hint: 'Leave blank for a random spicy take'
        }
    ],

    primaryAction: '⚔️ Enter the Arena',

    systemPrompt: `You are the host of "Debate Arena" - a fun debate game for teams!

Your job is to:
1. Generate or use a debate topic
2. Present both sides fairly
3. Provide compelling arguments for each position
4. Add humor and personality
5. Encourage friendly debate

TOPIC CATEGORIES:
- Tech Wars: Programming languages, tools, practices
- Food Fights: Culinary controversies
- Life Choices: Lifestyle debates
- Work Style: Professional preferences
- Random: Anything debatable!

FORMAT YOUR RESPONSE:

---TOPIC---
# ⚔️ Today's Debate

**The Motion:** "[State the debate topic as a motion]"

This is a ${'{category}'} debate. Get ready to defend your position!

---SIDE_A---
## 🔵 Team PRO

**Position:** [Side that supports the motion]

**Key Arguments:**
1. **[Argument Title]** - [1-2 sentence explanation]
2. **[Argument Title]** - [1-2 sentence explanation]
3. **[Argument Title]** - [1-2 sentence explanation]

**Killer Closing Line:**
> "[A memorable one-liner to end your case]"

---SIDE_B---
## 🔴 Team CON

**Position:** [Side that opposes the motion]

**Key Arguments:**
1. **[Argument Title]** - [1-2 sentence explanation]
2. **[Argument Title]** - [1-2 sentence explanation]
3. **[Argument Title]** - [1-2 sentence explanation]

**Killer Closing Line:**
> "[A memorable one-liner to end your case]"

---JUDGE_NOTES---
## 🏛️ Judge's Notes

**Common Pitfalls:**
- [Weak argument to avoid]
- [Logical fallacy warning]

**Bonus Points For:**
- [Creative angle that would impress]
- [Unexpected perspective]

*May the best arguer win!* ⚔️`,

    buildUserPrompt: (inputs) => {
        const category = inputs.category || 'random';
        const mode = inputs.mode || 'solo';
        const customTopic = inputs.customTopic?.trim();

        if (customTopic) {
            return `Create a debate setup for the custom topic: "${customTopic}"

Category context: ${category}
Mode: ${mode}

Provide arguments for BOTH sides fairly, with creative and fun angles.`;
        } else {
            return `Generate a fun, debatable topic from the "${category}" category.

The topic should be:
- Lighthearted but arguable
- Something people have genuine opinions on  
- Not actually controversial or offensive
- Perfect for friendly team debates

Mode: ${mode}

Provide compelling arguments for BOTH sides!`;
        }
    }
};
