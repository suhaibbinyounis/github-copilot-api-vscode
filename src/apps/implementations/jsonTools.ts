import { AppDefinition } from '../types';

export const jsonToolsApp: AppDefinition = {
    id: 'json-tools',
    name: 'JSON Tools',
    description: 'Format, validate, transform, and generate types from JSON',
    icon: '🔧',
    category: 'developer',
    primaryAction: '🔄 Process JSON',
    helpDocumentation: `### What is this?
**JSON Tools** is a Swiss Army knife for working with JSON data.

### Features
- **Format** - Pretty print with proper indentation
- **Minify** - Remove whitespace for production
- **Validate** - Check for syntax errors
- **To TypeScript** - Generate TypeScript interfaces
- **To Schema** - Generate JSON Schema
- **Query** - Extract data using JSONPath`,
    inputs: [
        {
            id: 'json',
            label: 'Your JSON',
            type: 'textarea',
            placeholder: '{"name": "example", "value": 123}',
            required: true,
            rows: 10,
            hint: 'Paste your JSON here'
        },
        {
            id: 'action',
            label: 'Action',
            type: 'select',
            options: [
                { value: 'format', label: '🎨 Format (Pretty Print)' },
                { value: 'minify', label: '📦 Minify' },
                { value: 'validate', label: '✅ Validate' },
                { value: 'typescript', label: '📘 Generate TypeScript Types' },
                { value: 'schema', label: '📋 Generate JSON Schema' },
                { value: 'query', label: '🔍 Query with JSONPath' }
            ],
            defaultValue: 'format'
        },
        {
            id: 'query',
            label: 'JSONPath Query (if querying)',
            type: 'text',
            placeholder: '$.store.book[*].author',
            hint: 'Only used when action is Query'
        },
        {
            id: 'typeName',
            label: 'Type Name (for TypeScript)',
            type: 'text',
            placeholder: 'MyDataType',
            defaultValue: 'RootObject',
            hint: 'Name for the generated TypeScript interface'
        }
    ],
    systemPrompt: `You are a JSON processing expert. Perform the requested action on the provided JSON.

For each action:
- **format**: Pretty print with 2-space indentation
- **minify**: Remove all unnecessary whitespace
- **validate**: Check for errors and report line/column if any
- **typescript**: Generate accurate TypeScript interfaces with proper types
- **schema**: Generate a complete JSON Schema (draft-07)
- **query**: Execute the JSONPath query and return results

Always show the result in a code block with the appropriate language.`,
    buildUserPrompt: (inputs) => {
        let prompt = `Action: ${inputs.action}\n\nJSON:\n\`\`\`json\n${inputs.json}\n\`\`\``;
        if (inputs.action === 'query' && inputs.query?.trim()) {
            prompt += `\n\nJSONPath Query: ${inputs.query}`;
        }
        if (inputs.action === 'typescript' && inputs.typeName?.trim()) {
            prompt += `\n\nRoot type name: ${inputs.typeName}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Result', content: response }]
    })
};
