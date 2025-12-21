import { AppDefinition } from '../types';

export const apiDocWriterApp: AppDefinition = {
    id: 'api-doc-writer',
    name: 'API Documentation Writer',
    description: 'Generate OpenAPI/Swagger docs from code or descriptions',
    icon: '📖',
    category: 'developer',
    primaryAction: '📝 Generate Docs',
    helpDocumentation: `### What is this?
The **API Documentation Writer** generates professional API documentation in OpenAPI/Swagger format from your code or plain-text descriptions.

### How to use it
1. Paste your API endpoint code (controller, route handler) or describe the endpoints.
2. Select the output format (OpenAPI 3.0, Swagger 2.0, or Markdown).
3. Click **Generate Docs** to get structured documentation.

### Use cases
- Documenting existing REST APIs
- Creating API specs before implementation
- Generating client SDK documentation
- Preparing API references for external developers`,
    inputs: [
        {
            id: 'apiCode',
            label: 'API Code or Description',
            type: 'textarea',
            placeholder: 'Paste your endpoint code or describe the API...\n\nExample:\nGET /users - List all users\nPOST /users - Create a new user (body: name, email)\nGET /users/:id - Get user by ID',
            required: true,
            rows: 10,
            hint: 'Paste code or describe endpoints with methods, paths, and parameters'
        },
        {
            id: 'format',
            label: 'Output Format',
            type: 'radio',
            options: [
                { value: 'openapi3', label: 'OpenAPI 3.0 (YAML)', description: 'Modern standard, widely supported' },
                { value: 'swagger2', label: 'Swagger 2.0 (JSON)', description: 'Legacy format for older tools' },
                { value: 'markdown', label: 'Markdown', description: 'Human-readable documentation' }
            ],
            defaultValue: 'openapi3'
        },
        {
            id: 'apiTitle',
            label: 'API Title',
            type: 'text',
            placeholder: 'My Service API',
            hint: 'Name of your API for the documentation header'
        }
    ],
    systemPrompt: `You are a technical writer specializing in API documentation. Generate clean, accurate API documentation from code or descriptions.

Guidelines:
- Infer request/response schemas from the code when possible
- Include example values for all fields
- Document error responses (400, 401, 404, 500)
- Use consistent naming conventions
- Add brief descriptions for each endpoint
- Include authentication requirements if detectable

For OpenAPI/Swagger, produce valid YAML/JSON that can be used directly with tools like Swagger UI.`,
    buildUserPrompt: (inputs) => {
        let prompt = `Generate ${inputs.format === 'openapi3' ? 'OpenAPI 3.0 YAML' : inputs.format === 'swagger2' ? 'Swagger 2.0 JSON' : 'Markdown'} documentation for the following API:\n\n${inputs.apiCode}`;
        if (inputs.apiTitle?.trim()) {
            prompt += `\n\nAPI Title: ${inputs.apiTitle}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'code',
        content: response,
        language: 'yaml',
        sections: [{ title: 'API Documentation', content: response }]
    })
};
