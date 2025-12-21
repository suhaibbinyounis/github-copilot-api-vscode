/**
 * Performance Review Writer - Leadership App
 * 
 * Help managers write fair, constructive performance reviews.
 */

import { AppDefinition, AppOutput } from '../types';

export const performanceReviewApp: AppDefinition = {
    id: 'performance-review-writer',
    name: 'Performance Review Writer',
    description: 'Write balanced and constructive performance reviews',
    icon: '📊',
    category: 'leadership',
    tags: ['reviews', 'feedback', 'hr', 'management'],
    helpDocumentation: `
### What is this?
Generate well-structured, fair, and constructive performance reviews.

### How to use:
1. Enter employee details and review period
2. Add achievements and areas for improvement
3. Choose review style and tone
4. Generate a professional review
    `,

    inputs: [
        {
            id: 'employeeName',
            label: 'Employee Name',
            type: 'text',
            placeholder: 'e.g., Alex Johnson',
            required: true
        },
        {
            id: 'role',
            label: 'Role',
            type: 'text',
            placeholder: 'e.g., Product Manager',
            required: true
        },
        {
            id: 'reviewPeriod',
            label: 'Review Period',
            type: 'text',
            placeholder: 'e.g., Q4 2024, H2 2024',
            defaultValue: 'Last 6 months'
        },
        {
            id: 'overallRating',
            label: 'Overall Performance Rating',
            type: 'select',
            defaultValue: 'meets',
            options: [
                { value: 'exceptional', label: '⭐ Exceptional - Far exceeds expectations' },
                { value: 'exceeds', label: '🌟 Exceeds Expectations' },
                { value: 'meets', label: '✅ Meets Expectations' },
                { value: 'developing', label: '📈 Developing - Some improvement needed' },
                { value: 'needs-improvement', label: '⚠️ Needs Significant Improvement' }
            ]
        },
        {
            id: 'achievements',
            label: 'Key Achievements',
            type: 'textarea',
            placeholder: `List key accomplishments:\n- Led successful launch of feature X\n- Mentored 2 junior engineers\n- Improved system performance by 30%`,
            rows: 5,
            required: true
        },
        {
            id: 'areasForGrowth',
            label: 'Areas for Growth',
            type: 'textarea',
            placeholder: `Areas to develop:\n- Need to improve communication with stakeholders\n- Could delegate more effectively\n- Time management during sprints`,
            rows: 4
        },
        {
            id: 'goals',
            label: 'Goals for Next Period',
            type: 'textarea',
            placeholder: 'What should they focus on going forward?',
            rows: 3
        },
        {
            id: 'tone',
            label: 'Review Tone',
            type: 'radio',
            defaultValue: 'balanced',
            options: [
                { value: 'formal', label: '📋 Formal / Corporate' },
                { value: 'balanced', label: '⚖️ Balanced / Professional' },
                { value: 'encouraging', label: '💪 Encouraging / Supportive' }
            ]
        }
    ],

    primaryAction: 'Generate Performance Review',

    systemPrompt: `You are an expert HR consultant helping managers write effective performance reviews.

## Guidelines:
1. **Be Specific**: Use concrete examples, not vague statements
2. **Be Balanced**: Include both strengths and growth areas
3. **Be Constructive**: Frame feedback positively
4. **Be Fair**: Avoid bias and focus on behaviors/outcomes
5. **Be Forward-Looking**: Include actionable goals

## Output Structure:
1. **Executive Summary** (2-3 sentences)
2. **Key Accomplishments** (bulleted, specific)
3. **Strengths Demonstrated**
4. **Areas for Development** (constructive framing)
5. **Goals for Next Period** (SMART format)
6. **Overall Assessment**
7. **Manager Recommendations**`,

    buildUserPrompt: (inputs: Record<string, string>): string => {
        const ratingLabels: Record<string, string> = {
            'exceptional': 'Exceptional - Far exceeds expectations',
            'exceeds': 'Exceeds Expectations',
            'meets': 'Meets Expectations',
            'developing': 'Developing - Needs some improvement',
            'needs-improvement': 'Needs Significant Improvement'
        };

        return `## Performance Review Request

**Employee:** ${inputs.employeeName}
**Role:** ${inputs.role}
**Review Period:** ${inputs.reviewPeriod}
**Overall Rating:** ${ratingLabels[inputs.overallRating] || inputs.overallRating}
**Tone:** ${inputs.tone}

## Key Achievements
${inputs.achievements}

## Areas for Growth
${inputs.areasForGrowth || 'None specified'}

## Suggested Goals
${inputs.goals || 'To be determined'}

Please write a comprehensive, professional performance review.`;
    },

    parseResponse: (response: string): AppOutput => ({
        type: 'markdown',
        content: response,
        actions: [
            { label: 'Copy', icon: '📋', action: 'copy' },
            { label: 'Save as Doc', icon: '💾', action: 'newFile', fileExtension: '.md' }
        ]
    }),

    requirements: { copilot: true }
};
