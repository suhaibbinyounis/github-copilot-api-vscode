/**
 * IaC Generator App
 * 
 * Generates Infrastructure as Code (Terraform, Pulumi, CloudFormation) from natural language descriptions.
 */

import { AppDefinition, AppContext, AppOutput } from '../types';

export const iacGeneratorApp: AppDefinition = {
    id: 'iac-generator',
    name: 'IaC Generator',
    description: 'Generate Infrastructure as Code (Terraform, Pulumi, etc.)',
    icon: '☁️',
    category: 'devops',
    helpDocumentation: `
### What is this?
The **IaC Generator** accelerates cloud infrastructure deployment by converting natural language requirements into production-ready Infrastructure as Code (IaC).

### How to use it:
1. **Describe Infrastructure**: Provide a detailed description of the resources you need (e.g., "A VPC with 3 subnets and an RDS instance").
2. **Select Provider**: Choose between AWS, Azure, Google Cloud, or Kubernetes.
3. **Select Tool**: Choose your preferred IaC tool (Terraform, Pulumi, CloudFormation, or CDK).
4. **Generate**: The AI will produce well-commented code following best practices for naming, tagging, and security.

### Use cases:
- Scaffolding new environments.
- Translating architecture diagrams into code.
- Learning the syntax of a new IaC provider or tool.
    `,

    inputs: [
        {
            id: 'requirement',
            label: 'Infrastructure Requirements',
            type: 'textarea',
            placeholder: 'e.g., A highly available AWS VPC with 2 public and 2 private subnets across 2 AZs...',
            required: true,
            rows: 4
        },
        {
            id: 'provider',
            label: 'Cloud Provider',
            type: 'select',
            defaultValue: 'aws',
            options: [
                { value: 'aws', label: 'AWS', icon: '☁️' },
                { value: 'azure', label: 'Azure', icon: '☁️' },
                { value: 'gcp', label: 'Google Cloud', icon: '☁️' },
                { value: 'kubernetes', label: 'Kubernetes', icon: '☸️' }
            ]
        },
        {
            id: 'tool',
            label: 'IaC Tool',
            type: 'select',
            defaultValue: 'terraform',
            options: [
                { value: 'terraform', label: 'Terraform', icon: '🏗️' },
                { value: 'pulumi', label: 'Pulumi', icon: '🏗️' },
                { value: 'cloudformation', label: 'CloudFormation', icon: '🏗️' },
                { value: 'cdk', label: 'AWS CDK', icon: '🏗️' }
            ]
        }
    ],

    primaryAction: 'Generate IaC',

    systemPrompt: `You are an expert DevOps and Infrastructure Engineer. 
Your goal is to provide high-quality, production-ready Infrastructure as Code (IaC) snippets based on natural language descriptions.

## Guidelines
1. **Best Practices**: Use official provider modules or best practices (e.g., tagging, variables).
2. **Security**: Ensure secure defaults (e.g., private subnets, least privilege).
3. **Modular**: Structure the code to be reusable.
4. **Explanation**: Provide a brief explanation of the architecture created.

## Output Format
1. **Brief Summary**: What this code creates.
2. **Code Block**: The actual IaC code.
3. **Prerequisites**: Any steps needed to run this (e.g., CLI config).`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        return `Generate IaC for the following requirements:
        
Requirements: ${inputs.requirement}
Provider: ${inputs.provider}
Tool: ${inputs.tool}

Please include variables and tags for better resource management.`;
    },

    parseResponse: (response: string, inputs: Record<string, string>): AppOutput => {
        const langMap: Record<string, string> = {
            terraform: 'hcl',
            pulumi: 'typescript',
            cloudformation: 'yaml',
            cdk: 'typescript'
        };

        return {
            type: 'code',
            content: response,
            language: langMap[inputs.tool] || 'hcl',
            actions: [
                { label: 'Copy Code', icon: '📋', action: 'copy' },
                { label: 'Save File', icon: '💾', action: 'newFile', suggestedFilename: `main.${inputs.tool === 'terraform' ? 'tf' : 'ts'}` }
            ]
        };
    }
};
