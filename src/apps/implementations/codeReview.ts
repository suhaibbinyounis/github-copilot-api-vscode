/**
 * Code Review App
 * 
 * Comprehensive code review using git diff with multi-project support.
 * Provides severity-based findings (Critical, Warning, Suggestion).
 */

import { AppDefinition, AppContext, AppOutput, OutputSection } from '../types';
import { projectManager } from '../ProjectManager';

export const codeReviewApp: AppDefinition = {
    id: 'code-review',
    name: 'Code Review',
    description: 'Full project code review using git diff',
    icon: '🔍',
    category: 'developer',
    helpDocumentation: `
### What is this?
The **Code Review** app provides an AI-powered senior engineer's perspective on your changes. It analyzes your git diff and provides constructive feedback on code quality, security, and performance.

### How to use it:
1. **Select Projects**: Add the local folders you want to review.
2. **Choose Diff Type**: Review staged changes, unstaged work, recent commits, or compare two branches.
3. **Set Depth**: Choose from Quick, Thorough, or category-specific focus (Security/Performance).
4. **Execution**: The AI will generate a structured report with Critical, Warning, and Suggestion findings.

### Use cases:
- Preparing a PR for review.
- Auditing a colleague's complex changes.
- Quick security sanity checks on recent work.
    `,

    inputs: [
        {
            id: 'projectPaths',
            label: 'Project Folders',
            type: 'project-picker',
            placeholder: 'Add project folders to review...',
            required: true,
            hint: 'Select the folders you want to review. Use "Pick Project Folder" to add new ones.'
        },
        {
            id: 'diffType',
            label: 'What to Review',
            type: 'radio',
            required: true,
            defaultValue: 'unstaged',
            options: [
                { value: 'staged', label: 'Staged Changes', icon: '📦', description: 'Changes added to git staging' },
                { value: 'unstaged', label: 'Unstaged Changes', icon: '📝', description: 'Current working directory changes' },
                { value: 'commits', label: 'Last N Commits', icon: '📜', description: 'Review recent commits' },
                { value: 'branches', label: 'Branch Comparison', icon: '🔀', description: 'Compare between branches' }
            ]
        },
        {
            id: 'numCommits',
            label: 'Number of Commits',
            type: 'text',
            defaultValue: '5',
            placeholder: '5',
            rows: 5,
            hint: 'We\'ll enhance these into professional reproduction steps with clear preconditions.',
            showIf: { field: 'diffType', equals: 'commits' }
        },
        {
            id: 'baseBranch',
            label: 'Base Branch',
            type: 'text',
            defaultValue: 'main',
            placeholder: 'main',
            hint: 'The branch to compare against',
            showIf: { field: 'diffType', equals: 'branches' }
        },
        {
            id: 'targetBranch',
            label: 'Target Branch',
            type: 'text',
            defaultValue: 'HEAD',
            placeholder: 'HEAD or branch name',
            hint: 'The branch with your changes',
            showIf: { field: 'diffType', equals: 'branches' }
        },
        {
            id: 'reviewFocus',
            label: 'Review Focus (optional)',
            type: 'textarea',
            placeholder: 'e.g., Focus on security vulnerabilities, performance issues, and error handling...',
            rows: 3,
            hint: 'Describe what went wrong. Be as specific as possible about the error symptoms.'
        },
        {
            id: 'reviewType',
            label: 'Review Depth',
            type: 'select',
            defaultValue: 'thorough',
            options: [
                { value: 'quick', label: '⚡ Quick Scan', description: 'High-level overview, critical issues only' },
                { value: 'thorough', label: '🔍 Thorough Review', description: 'Comprehensive analysis' },
                { value: 'security', label: '🔒 Security Focus', description: 'Deep security analysis' },
                { value: 'performance', label: '⚡ Performance Focus', description: 'Performance and optimization' }
            ]
        }
    ],

    primaryAction: 'Start Code Review',

    systemPrompt: `You are a senior software engineer conducting a thorough, constructive code review.
Your goal is to help improve code quality while being respectful and educational.

## Review Guidelines

1. **Be Constructive**: Frame feedback as suggestions, not criticisms
2. **Explain Why**: Always explain the reason behind each suggestion
3. **Prioritize**: Focus on issues that matter most
4. **Be Specific**: Reference exact files and line numbers when possible
5. **Acknowledge Good Work**: Mention well-written code too

## Output Format

Structure your review using these sections:

### 📋 Summary
- Brief overview of changes reviewed
- Overall assessment (1-2 sentences)

### 🔴 Critical Issues (Must Fix)
Issues that could cause bugs, security vulnerabilities, or data loss.
Format each as:
- **[File:Line]** Issue title
  - What: Description of the issue
  - Why: Why this is critical
  - Fix: Specific recommendation

### 🟡 Warnings (Should Fix)
Issues that could cause problems or are bad practices.
Same format as above.

### 💡 Suggestions (Nice to Have)
Improvements for code quality, readability, or maintainability.
Same format as above.

### ✅ What's Good
Acknowledge well-written code, good patterns, or improvements.

### 📊 Summary Stats
- Files changed: X
- Critical: X | Warnings: X | Suggestions: X

If the diff is empty or there are no changes, say so clearly and suggest the user check their git status.`,

    buildUserPrompt: (inputs: Record<string, string>, context?: AppContext): string => {
        const parts: string[] = [];

        // Add review focus if provided
        if (inputs.reviewFocus) {
            parts.push(`## Review Focus\n${inputs.reviewFocus}\n`);
        }

        // Add review type context
        const reviewTypeDescriptions: Record<string, string> = {
            quick: 'Perform a quick scan focusing only on critical issues and obvious bugs.',
            thorough: 'Perform a comprehensive review covering all aspects of code quality.',
            security: 'Focus heavily on security vulnerabilities, input validation, authentication, authorization, and data protection.',
            performance: 'Focus on performance issues, memory leaks, inefficient algorithms, and optimization opportunities.'
        };

        if (inputs.reviewType && reviewTypeDescriptions[inputs.reviewType]) {
            parts.push(`## Review Type\n${reviewTypeDescriptions[inputs.reviewType]}\n`);
        }

        // Add the diff content
        if (context?.gitDiff) {
            parts.push(`## Git Diff to Review\n\`\`\`diff\n${context.gitDiff}\n\`\`\``);
        } else if (context?.errors && context.errors.length > 0) {
            parts.push(`## Errors\nCould not retrieve git diff:\n${context.errors.join('\n')}`);
        } else {
            parts.push('## Note\nNo diff content available. The diff may be empty or there may be no changes to review.');
        }

        // Add project context
        if (context?.projectPaths && context.projectPaths.length > 0) {
            parts.push(`\n## Projects Reviewed\n${context.projectPaths.join('\n')}`);
        }

        return parts.join('\n\n');
    },

    fetchContext: async (inputs: Record<string, string>): Promise<AppContext> => {
        const context: AppContext = {
            projectPaths: [],
            errors: []
        };

        // Parse project paths (comma-separated or JSON array)
        let projectPaths: string[] = [];
        try {
            if (inputs.projectPaths.startsWith('[')) {
                projectPaths = JSON.parse(inputs.projectPaths);
            } else {
                projectPaths = inputs.projectPaths.split(',').map(p => p.trim()).filter(Boolean);
            }
        } catch {
            projectPaths = [inputs.projectPaths];
        }

        if (projectPaths.length === 0) {
            context.errors!.push('No project paths provided');
            return context;
        }

        context.projectPaths = projectPaths;

        // Get diff from each project
        const allDiffs: string[] = [];

        for (const projectPath of projectPaths) {
            const diffResult = await projectManager.getGitDiff(projectPath, {
                type: inputs.diffType as any,
                commits: inputs.numCommits ? parseInt(inputs.numCommits, 10) : 5,
                baseBranch: inputs.baseBranch || 'main',
                targetBranch: inputs.targetBranch || 'HEAD'
            });

            if (diffResult.error) {
                context.errors!.push(`${projectPath}: ${diffResult.error}`);
            }

            if (diffResult.diff) {
                allDiffs.push(`# Project: ${projectPath}\n${diffResult.diff}`);
            }
        }

        context.gitDiff = allDiffs.join('\n\n---\n\n');

        // Truncate if too large (keep first 50k chars to avoid token limits)
        if (context.gitDiff.length > 50000) {
            context.gitDiff = context.gitDiff.substring(0, 50000) +
                '\n\n[... diff truncated due to size. Showing first 50,000 characters ...]';
        }

        return context;
    },

    parseResponse: (response: string, inputs: Record<string, string>): AppOutput => {
        // Try to extract sections from the response
        const sections: OutputSection[] = [];

        // Check for critical issues section
        const criticalMatch = response.match(/### 🔴 Critical Issues[\s\S]*?(?=###|$)/i);
        if (criticalMatch && !criticalMatch[0].includes('None') && criticalMatch[0].length > 50) {
            sections.push({
                title: '🔴 Critical Issues',
                content: criticalMatch[0].replace(/### 🔴 Critical Issues[^\n]*\n/, '').trim(),
                severity: 'critical',
                collapsible: true,
                collapsed: false
            });
        }

        // Check for warnings section
        const warningsMatch = response.match(/### 🟡 Warnings[\s\S]*?(?=###|$)/i);
        if (warningsMatch && !warningsMatch[0].includes('None') && warningsMatch[0].length > 50) {
            sections.push({
                title: '🟡 Warnings',
                content: warningsMatch[0].replace(/### 🟡 Warnings[^\n]*\n/, '').trim(),
                severity: 'warning',
                collapsible: true,
                collapsed: false
            });
        }

        // Check for suggestions section
        const suggestionsMatch = response.match(/### 💡 Suggestions[\s\S]*?(?=###|$)/i);
        if (suggestionsMatch && !suggestionsMatch[0].includes('None') && suggestionsMatch[0].length > 50) {
            sections.push({
                title: '💡 Suggestions',
                content: suggestionsMatch[0].replace(/### 💡 Suggestions[^\n]*\n/, '').trim(),
                severity: 'info',
                collapsible: true,
                collapsed: true
            });
        }

        // If we couldn't parse sections, return as plain markdown
        if (sections.length === 0) {
            return {
                type: 'markdown',
                content: response,
                actions: [
                    { label: 'Copy Review', icon: '📋', action: 'copy' },
                    { label: 'Save as Markdown', icon: '💾', action: 'newFile', fileExtension: '.md', suggestedFilename: 'code-review.md' }
                ]
            };
        }

        return {
            type: 'structured',
            content: response,
            sections,
            summary: `Found ${sections.filter(s => s.severity === 'critical').length} critical, ${sections.filter(s => s.severity === 'warning').length} warnings`,
            actions: [
                { label: 'Copy Review', icon: '📋', action: 'copy' },
                { label: 'Save as Markdown', icon: '💾', action: 'newFile', fileExtension: '.md', suggestedFilename: 'code-review.md' }
            ]
        };
    },

    defaultActions: [
        { label: 'Copy Review', icon: '📋', action: 'copy' },
        { label: 'Save as Markdown', icon: '💾', action: 'newFile', fileExtension: '.md', suggestedFilename: 'code-review.md' }
    ],

    requirements: {
        git: true,
        copilot: true
    },

    examples: [
        {
            name: 'Review staged changes',
            inputs: {
                diffType: 'staged',
                reviewType: 'thorough',
                reviewFocus: 'Focus on security and error handling'
            }
        },
        {
            name: 'Security review of recent commits',
            inputs: {
                diffType: 'commits',
                numCommits: '10',
                reviewType: 'security'
            }
        }
    ]
};
