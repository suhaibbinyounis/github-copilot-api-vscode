/**
 * ADR Draftsman App
 * 
 * Generates Architecture Decision Records (ADRs) based on technical constraints and requirements.
 */

import { AppDefinition, AppContext, AppOutput } from '../types';

export const adrDraftsmanApp: AppDefinition = {
    id: 'adr-draftsman',
    name: 'ADR Draftsman',
    description: 'Draft Architecture Decision Records (ADRs)',
    icon: '🏛️',
    category: 'architecture',
    helpDocumentation: `
### What is this?
The **ADR Draftsman** helps maintain a clear technical history by generating Architecture Decision Records (ADRs). It ensures that "Why" a decision was made is captured alongside the "What".

### How to use it:
1. **Title**: Give your decision a clear, searchable name.
2. **Provide Context**: Explain the current problem or constraint driving this decision.
3. **List Options**: (Optional) Mention what other approaches were considered and why they were rejected.
4. **Result**: The AI will draft a professional record including Status, Context, Decision, and Consequences.

### Use cases:
- Documenting a change in database provider.
- Formalizing the adoption of a new frontend framework.
- Recording technical debt trade-offs.
    `,

    inputs: [
        {
            id: 'title',
            label: 'Decision Title',
            type: 'text',
            placeholder: 'e.g., Use Postgres instead of MongoDB for User Service',
            required: true,
            hint: 'A clear, descriptive title for the architectural decision.'
        },
        {
            id: 'context',
            label: 'Context & Problem',
            type: 'textarea',
            placeholder: 'Describe the problem we are trying to solve and any constraints...',
            required: true,
            rows: 3,
            hint: 'What is the current situation? Why is this decision being made now?'
        },
        {
            id: 'options',
            label: 'Options Considered',
            type: 'textarea',
            placeholder: 'List the options you have looked at...',
            required: false,
            rows: 2,
            hint: 'Optional: List other alternatives and why they were or weren\'t chosen.'
        }
    ],

    primaryAction: 'Draft ADR',

    systemPrompt: `You are a Senior Software Architect. 
Your goal is to help teams document their architectural decisions clearly and concisely using the ADR (Architecture Decision Record) format.

## ADR Format
Use the standard MADR or similar template:
1. **Title**: The name of the decision.
2. **Status**: Proposed / Accepted / Superseded.
3. **Context**: Why are we doing this? What is the problem?
4. **Decision**: What are we doing?
5. **Consequences**: What is the impact? (Good and Bad).

## Tone
Professional, objective, and analytical.`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        return `Draft an ADR for:
        
Title: ${inputs.title}
Context: ${inputs.context}
Options: ${inputs.options || 'Not specified'}`;
    },

    parseResponse: (response: string): AppOutput => {
        return {
            type: 'markdown',
            content: response,
            actions: [
                { label: 'Copy ADR', icon: '📋', action: 'copy' },
                { label: 'Save as ADR', icon: '💾', action: 'newFile', fileExtension: '.md', suggestedFilename: 'ADR-XXX.md' }
            ]
        };
    }
};
