import { AppDefinition } from '../types';

export const sqlQueryBuilderApp: AppDefinition = {
    id: 'sql-query-builder',
    name: 'SQL Query Builder',
    description: 'Describe your data need in plain English, get the SQL query',
    icon: '🗃️',
    category: 'developer',
    primaryAction: '⚡ Build Query',
    helpDocumentation: `### What is this?
The **SQL Query Builder** translates plain-English data requests into SQL queries, helping you construct complex queries without memorizing syntax.

### How to use it
1. Describe what data you need (e.g., "Get all orders from last month with total > $100").
2. Optionally provide your table schema for more accurate queries.
3. Select your database dialect (PostgreSQL, MySQL, etc.).
4. Click **Build Query** to get the SQL.

### Use cases
- Writing complex JOINs and subqueries
- Aggregation and reporting queries
- Data migration scripts
- Quick prototyping before optimization`,
    inputs: [
        {
            id: 'request',
            label: 'What data do you need?',
            type: 'textarea',
            placeholder: 'e.g., Show me the top 10 customers by total order value in the last 30 days, including their email and order count',
            required: true,
            rows: 4,
            hint: 'Describe your data requirements in plain English'
        },
        {
            id: 'schema',
            label: 'Table Schema (optional)',
            type: 'textarea',
            placeholder: 'users (id, name, email, created_at)\norders (id, user_id, total, status, created_at)\nproducts (id, name, price, category_id)',
            rows: 5,
            hint: 'Provide table structure for more accurate queries'
        },
        {
            id: 'dialect',
            label: 'SQL Dialect',
            type: 'select',
            options: [
                { value: 'postgresql', label: 'PostgreSQL' },
                { value: 'mysql', label: 'MySQL / MariaDB' },
                { value: 'sqlite', label: 'SQLite' },
                { value: 'mssql', label: 'SQL Server' },
                { value: 'oracle', label: 'Oracle' }
            ],
            defaultValue: 'postgresql'
        }
    ],
    systemPrompt: `You are a database expert. Generate accurate, optimized SQL queries based on natural language requests.

Guidelines:
- Use proper syntax for the specified dialect
- Include comments explaining complex parts
- Suggest indexes if relevant for performance
- Handle NULL values appropriately
- Use parameterized queries where user input is involved
- Provide alternative approaches for complex queries

Format your response as:
1. **The Query** - Ready-to-use SQL
2. **Explanation** - What each part does
3. **Notes** - Performance tips or alternative approaches`,
    buildUserPrompt: (inputs) => {
        let prompt = `Generate a ${inputs.dialect.toUpperCase()} query for: ${inputs.request}`;
        if (inputs.schema?.trim()) {
            prompt += `\n\nTable schema:\n${inputs.schema}`;
        }
        return prompt;
    },
    parseResponse: (response) => ({
        type: 'code',
        content: response,
        language: 'sql',
        sections: [{ title: 'SQL Query', content: response }]
    })
};
