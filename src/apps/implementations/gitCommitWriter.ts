import { AppDefinition } from '../types';

export const gitCommitWriterApp: AppDefinition = {
    id: 'git-commit-writer',
    name: 'Git Commit Writer',
    description: 'Generate professional git commit messages from your changes',
    icon: '📝',
    category: 'developer',
    primaryAction: '✨ Write Commit Message',
    helpDocumentation: `### What is this?
The **Git Commit Writer** generates professional, conventional commit messages from your code changes.

### How to use it
1. Paste your git diff or describe your changes
2. Select your preferred commit style (Conventional, Gitmoji, etc.)
3. Click **Write Commit Message** to get a perfect commit

### Commit formats supported
- **Conventional Commits** - feat:, fix:, docs:, refactor:, etc.
- **Gitmoji** - 🎨 ✨ 🐛 📝 🔥 etc.
- **Angular** - type(scope): subject`,
    inputs: [
        {
            id: 'changes',
            label: 'Your Changes',
            type: 'textarea',
            placeholder: 'Paste your git diff or describe what you changed...',
            required: true,
            rows: 8,
            hint: 'You can paste `git diff --staged` output or just describe the changes'
        },
        {
            id: 'style',
            label: 'Commit Style',
            type: 'select',
            options: [
                { value: 'conventional', label: 'Conventional Commits' },
                { value: 'gitmoji', label: 'Gitmoji' },
                { value: 'angular', label: 'Angular Style' },
                { value: 'simple', label: 'Simple (Just a message)' }
            ],
            defaultValue: 'conventional'
        },
        {
            id: 'scope',
            label: 'Scope (optional)',
            type: 'text',
            placeholder: 'e.g., auth, api, ui',
            hint: 'Component or area affected'
        }
    ],
    systemPrompt: `You are an expert at writing git commit messages. Generate clean, professional commit messages following best practices.

Rules:
1. Subject line max 50 characters, body lines max 72 characters
2. Use imperative mood ("Add feature" not "Added feature")
3. Explain WHAT and WHY, not HOW
4. Include breaking changes if any

Output format:
1. **Commit Message** - The full commit message (subject + body if needed)
2. **Type** - The commit type (feat, fix, docs, etc.)
3. **Why this message** - Brief explanation of your choice`,
    buildUserPrompt: (inputs) => {
        let prompt = `Generate a ${inputs.style} style git commit message for these changes:\n\n${inputs.changes}`;
        if (inputs.scope?.trim()) {
            prompt += `\n\nScope: ${inputs.scope}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Commit Message', content: response }]
    })
};
