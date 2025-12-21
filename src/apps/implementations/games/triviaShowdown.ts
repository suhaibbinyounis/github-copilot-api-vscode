/**
 * Trivia Showdown - Dynamic LLM-Powered Trivia Game
 * 
 * Endless trivia on any topic with dynamically generated questions,
 * difficulty scaling, and streak bonuses.
 */

import { AppDefinition } from '../../types';

export const triviaShowdownApp: AppDefinition = {
    id: 'trivia-showdown',
    name: 'Trivia Showdown',
    icon: '🧠',
    description: 'Endless trivia on any topic - test your knowledge!',
    category: 'games',
    tags: ['team', 'trivia', 'knowledge', 'competitive'],

    inputs: [
        {
            id: 'topic',
            label: 'Trivia Topic',
            type: 'text',
            required: true,
            placeholder: 'e.g., 90s Movies, World Geography, Programming Languages...',
            hint: 'Be specific for better questions!'
        },
        {
            id: 'difficulty',
            label: 'Difficulty Level',
            type: 'radio',
            required: true,
            defaultValue: 'medium',
            options: [
                { value: 'easy', label: '🟢 Easy', description: 'Warm-up questions' },
                { value: 'medium', label: '🟡 Medium', description: 'Challenging but fair' },
                { value: 'hard', label: '🔴 Hard', description: 'Expert level' },
                { value: 'impossible', label: '💀 Impossible', description: 'Good luck!' }
            ]
        },
        {
            id: 'questionCount',
            label: 'Number of Questions',
            type: 'select',
            defaultValue: '5',
            options: [
                { value: '3', label: '3 Questions (Quick)' },
                { value: '5', label: '5 Questions (Standard)' },
                { value: '10', label: '10 Questions (Marathon)' }
            ]
        },
        {
            id: 'format',
            label: 'Question Format',
            type: 'radio',
            defaultValue: 'multiple',
            options: [
                { value: 'multiple', label: '📝 Multiple Choice', description: '4 options per question' },
                { value: 'truefalse', label: '✅ True/False', description: 'Quick fire!' }
            ]
        }
    ],

    primaryAction: '🎯 Start Trivia',

    systemPrompt: `You are a trivia game master creating engaging quiz questions.

RULES:
1. Generate the requested number of questions on the specified topic
2. Match the difficulty level accurately
3. Make questions interesting and educational
4. For multiple choice: 1 correct answer + 3 plausible wrong answers
5. Include a fun fact after each answer
6. Shuffle answer order (don't always put correct first)

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

---QUESTION_1---
**Question:** [The question text]

A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]

<details>
<summary>🎯 Reveal Answer</summary>

**Correct Answer:** [Letter]

**Fun Fact:** [An interesting related fact]
</details>

---QUESTION_2---
[Continue same format...]

At the end, add:
---FINAL_SCORE---
Rate yourself! How many did you get right?
🏆 All correct = Trivia Champion!
⭐ Most correct = Strong showing!
📚 Some correct = Keep learning!`,

    buildUserPrompt: (inputs) => {
        const topic = inputs.topic || 'General Knowledge';
        const difficulty = inputs.difficulty || 'medium';
        const count = inputs.questionCount || '5';
        const format = inputs.format || 'multiple';

        return `Generate ${count} ${difficulty}-difficulty trivia questions about: "${topic}"

Format: ${format === 'multiple' ? 'Multiple choice with 4 options (A, B, C, D)' : 'True/False only'}

Make questions ${difficulty === 'easy' ? 'accessible for beginners' : difficulty === 'hard' ? 'challenging for experts' : difficulty === 'impossible' ? 'incredibly obscure - only specialists would know' : 'moderately challenging'}.

Remember to:
- Make wrong answers plausible (not obviously wrong)
- Add fun facts that teach something new
- Keep a playful, game-show host tone`;
    }
};
