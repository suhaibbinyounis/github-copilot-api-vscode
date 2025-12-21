/**
 * Story Chain - Collaborative AI Storytelling Game
 * 
 * Players take turns adding to an evolving story while the AI
 * maintains continuity and adds unexpected plot twists.
 */

import { AppDefinition } from '../../types';

export const storyChainApp: AppDefinition = {
    id: 'story-chain',
    name: 'Story Chain',
    icon: '🎭',
    description: 'Collaborative storytelling with AI plot twists',
    category: 'games',
    tags: ['team', 'creative', 'storytelling', 'fun'],

    inputs: [
        {
            id: 'genre',
            label: 'Story Genre',
            type: 'radio',
            required: true,
            defaultValue: 'fantasy',
            options: [
                { value: 'fantasy', label: '🧙 Fantasy', description: 'Magic, dragons, quests' },
                { value: 'scifi', label: '🚀 Sci-Fi', description: 'Space, tech, future' },
                { value: 'mystery', label: '🔍 Mystery', description: 'Clues, suspense, twists' },
                { value: 'comedy', label: '😂 Comedy', description: 'Silly, absurd, fun' },
                { value: 'horror', label: '👻 Horror', description: 'Spooky, tense, creepy' }
            ]
        },
        {
            id: 'mode',
            label: 'Game Mode',
            type: 'radio',
            required: true,
            defaultValue: 'collaborative',
            options: [
                { value: 'collaborative', label: '🤝 Collaborative', description: 'You write, AI continues' },
                { value: 'challenge', label: '⚔️ Challenge', description: 'AI tries to stump you with plot twists' }
            ]
        },
        {
            id: 'opening',
            label: 'Story Opening (or leave blank for AI start)',
            type: 'textarea',
            placeholder: 'e.g., "The old lighthouse keeper had never seen anything like it..."',
            rows: 3
        },
        {
            id: 'rounds',
            label: 'Number of Rounds',
            type: 'select',
            defaultValue: '5',
            options: [
                { value: '3', label: '3 rounds (Quick)' },
                { value: '5', label: '5 rounds (Standard)' },
                { value: '10', label: '10 rounds (Epic)' }
            ]
        }
    ],

    primaryAction: '📖 Begin Story',

    systemPrompt: `You are a collaborative storytelling AI for a fun team game called "Story Chain".

Your role is to:
1. Continue the story based on player contributions
2. Maintain narrative continuity and character consistency
3. Add unexpected but logical plot twists
4. Keep the tone matching the chosen genre
5. End each turn with a hook that invites the next contribution

GENRE STYLES:
- Fantasy: Rich descriptions, magical elements, heroic moments
- Sci-Fi: Technical details, futuristic concepts, exploration themes
- Mystery: Suspense building, clue dropping, red herrings
- Comedy: Absurd situations, wordplay, unexpected humor
- Horror: Atmospheric tension, creeping dread, jump scares

FORMAT YOUR RESPONSE:

---STORY_CONTINUATION---
[Your 2-3 paragraphs continuing the story]

---TWIST---
[A short, surprising twist or cliffhanger to end on]

---PROMPT---
[An engaging question or prompt for the next player, like "What does our hero discover behind the door?"]`,

    buildUserPrompt: (inputs) => {
        const genre = inputs.genre || 'fantasy';
        const mode = inputs.mode || 'collaborative';
        const opening = inputs.opening?.trim();
        const rounds = inputs.rounds || '5';

        if (opening) {
            return `GENRE: ${genre.toUpperCase()}
MODE: ${mode}
TOTAL ROUNDS: ${rounds}

The player has started the story with:
"${opening}"

Please continue this story with 2-3 paragraphs, add a twist, and provide a prompt for the next contribution.`;
        } else {
            return `GENRE: ${genre.toUpperCase()}
MODE: ${mode}
TOTAL ROUNDS: ${rounds}

Please START a brand new ${genre} story with an engaging opening (2-3 paragraphs), introduce the main character(s), add an early twist or hook, and provide a prompt for the player to continue.`;
        }
    }
};
