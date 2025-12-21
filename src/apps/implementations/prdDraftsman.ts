/**
 * PRD Draftsman App
 * 
 * Converts rough product ideas into structured Product Requirements Documents (PRDs).
 */

import { AppDefinition, AppContext, AppOutput } from '../types';

export const prdDraftsmanApp: AppDefinition = {
    id: 'prd-draftsman',
    name: 'PRD Draftsman',
    description: 'Turn ideas into Product Requirements Documents',
    icon: '📈',
    category: 'product',
    helpDocumentation: `
### What is this?
The **PRD Draftsman** bridges the gap between rough ideas and engineering reality. It transforms feature concepts into professional Product Requirements Documents (PRDs).

### How to use it:
1. **Describe the Idea**: Provide a high-level overview of the feature or product you're envisioning.
2. **Define Audience**: (Optional) Specify who the intended users are to help focus the requirements.
3. **Draft**: The AI will generate a structured PRD including Goals, User Stories, Functional Requirements, and Success Metrics.

### Use cases:
- Preparing for a product-engineering sync.
- Flesh out a "brainstorm" into a formal proposal.
- Creating standardized documentation for new feature requests.
    `,

    inputs: [
        {
            id: 'idea',
            label: 'Product Idea / Feature',
            type: 'textarea',
            placeholder: 'e.g., A mobile app for tracking local coffee shop rewards points...',
            required: true,
            rows: 4,
            hint: 'What is the core idea? What problem does it solve for the user?'
        },
        {
            id: 'audience',
            label: 'Target Audience',
            type: 'text',
            placeholder: 'e.g., Coffee enthusiasts, local business owners',
            required: false,
            hint: 'Who are we building this for?'
        }
    ],

    primaryAction: 'Generate PRD',

    systemPrompt: `You are an expert Product Manager.
Your goal is to take a raw feature idea and flesh it out into a professional PRD.

## PRD Structure
1. **Goal**: What problem are we solving?
2. **User Stories**: What can the user do?
3. **Functional Requirements**: Detailed breakdown of features.
4. **Non-Functional Requirements**: Performance, Security, etc.
5. **Success Metrics**: How do we measure success?

## Tone
Structured, visionary, yet practical.`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        return `Generate a PRD for:
        
Idea: ${inputs.idea}
Target Audience: ${inputs.audience || 'General users'}`;
    },

    parseResponse: (response: string): AppOutput => {
        return {
            type: 'markdown',
            content: response,
            actions: [
                { label: 'Copy PRD', icon: '📋', action: 'copy' },
                { label: 'Save as PRD', icon: '💾', action: 'newFile', fileExtension: '.md', suggestedFilename: 'PRD.md' }
            ]
        };
    }
};
