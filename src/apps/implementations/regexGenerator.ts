import { AppDefinition } from '../types';

export const regexGeneratorApp: AppDefinition = {
    id: 'regex-generator',
    name: 'Regex Generator',
    description: 'Describe what you want to match, get a working regex',
    icon: '🔣',
    category: 'developer',
    primaryAction: '✨ Generate Regex',
    helpDocumentation: `### What is this?
The **Regex Generator** helps you create regular expressions by describing what you want to match in plain English.

### How to use it
1. Describe the pattern you want to match (e.g., "email addresses", "phone numbers with country code", "URLs starting with https").
2. Optionally specify the target language/flavor (JavaScript, Python, etc.).
3. Click **Generate Regex** to get a working pattern with explanation.

### Use cases
- Validating user input (emails, phones, IDs)
- Extracting data from text
- Search and replace operations
- Log parsing and analysis`,
    inputs: [
        {
            id: 'description',
            label: 'What do you want to match?',
            type: 'textarea',
            placeholder: 'e.g., Match email addresses that end with .com or .org',
            required: true,
            rows: 3,
            hint: 'Be as specific as possible about the pattern'
        },
        {
            id: 'flavor',
            label: 'Regex Flavor',
            type: 'select',
            options: [
                { value: 'javascript', label: 'JavaScript / TypeScript' },
                { value: 'python', label: 'Python' },
                { value: 'java', label: 'Java' },
                { value: 'csharp', label: 'C# / .NET' },
                { value: 'go', label: 'Go' },
                { value: 'pcre', label: 'PCRE (PHP, Perl)' }
            ],
            defaultValue: 'javascript'
        },
        {
            id: 'testCases',
            label: 'Test Cases (optional)',
            type: 'textarea',
            placeholder: 'One example per line:\nvalid@email.com (should match)\ninvalid-email (should not match)',
            rows: 4,
            hint: 'Provide examples to validate the regex'
        }
    ],
    systemPrompt: `You are an expert regex engineer. Create precise, efficient regular expressions based on user descriptions.

Your response MUST include:
1. **The Regex Pattern** - The actual regex, properly escaped for the target language
2. **Explanation** - Break down each part of the regex
3. **Usage Example** - Code snippet showing how to use it
4. **Test Results** - If test cases provided, show which ones match/don't match
5. **Edge Cases** - Mention any limitations or edge cases

Keep patterns as simple as possible while being accurate. Prefer readability over cleverness.`,
    buildUserPrompt: (inputs) => {
        let prompt = `Create a regex pattern for: ${inputs.description}\n\nTarget language/flavor: ${inputs.flavor}`;
        if (inputs.testCases?.trim()) {
            prompt += `\n\nTest cases:\n${inputs.testCases}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'markdown',
        content: response,
        sections: [{ title: 'Generated Regex', content: response }]
    })
};
