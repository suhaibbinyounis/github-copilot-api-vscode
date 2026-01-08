/**
 * App Registry - Central registry for all apps (Lazy Loading)
 * 
 * This module provides lightweight metadata for app discovery,
 * with full app implementations loaded on-demand.
 */

import { AppDefinition, AppCategory } from './types';

/**
 * Lightweight app metadata for registry listing (no heavy imports)
 */
export interface AppMetadata {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: AppCategory;
    tags?: string[];
}

/**
 * App loaders - dynamic imports for each app
 */
const appLoaders: Record<string, () => Promise<AppDefinition>> = {
    // General / Everyone
    'decision-doctor': () => import('./implementations/decisionDoctor').then(m => m.decisionDoctorApp),
    'skill-sprinter': () => import('./implementations/skillSprinter').then(m => m.skillSprinterApp),
    'universal-summarizer': () => import('./implementations/universalSummarizer').then(m => m.universalSummarizerApp),
    'icebreaker-chef': () => import('./implementations/icebreakerChef').then(m => m.icebreakerChefApp),

    // Developer
    'code-review': () => import('./implementations/codeReview').then(m => m.codeReviewApp),
    'test-case-generator': () => import('./implementations/testCaseGenerator').then(m => m.testCaseGeneratorApp),
    'bug-report-writer': () => import('./implementations/bugReportWriter').then(m => m.bugReportWriterApp),
    'regex-generator': () => import('./implementations/regexGenerator').then(m => m.regexGeneratorApp),
    'api-doc-writer': () => import('./implementations/apiDocWriter').then(m => m.apiDocWriterApp),
    'sql-query-builder': () => import('./implementations/sqlQueryBuilder').then(m => m.sqlQueryBuilderApp),
    'git-commit-writer': () => import('./implementations/gitCommitWriter').then(m => m.gitCommitWriterApp),
    'json-tools': () => import('./implementations/jsonTools').then(m => m.jsonToolsApp),
    'code-explainer': () => import('./implementations/codeExplainer').then(m => m.codeExplainerApp),

    // Productivity
    'meeting-notes-to-actions': () => import('./implementations/meetingNotesToActions').then(m => m.meetingNotesToActionsApp),
    'standup-summary': () => import('./implementations/standupSummary').then(m => m.standupSummaryApp),

    // Leadership
    'one-on-one-prep': () => import('./implementations/oneOnOnePrep').then(m => m.oneOnOnePrepApp),
    'performance-review': () => import('./implementations/performanceReview').then(m => m.performanceReviewApp),
    'team-feedback': () => import('./implementations/teamFeedback').then(m => m.teamFeedbackApp),

    // QA
    'playwright-generator': () => import('./implementations/playwrightGenerator').then(m => m.playwrightGeneratorApp),
    'accessibility-checker': () => import('./implementations/accessibilityChecker').then(m => m.accessibilityCheckerApp),

    // Security
    'vulnerability-scanner': () => import('./implementations/vulnerabilityScanner').then(m => m.vulnerabilityScannerApp),

    // DevOps
    'iac-generator': () => import('./implementations/iacGenerator').then(m => m.iacGeneratorApp),

    // Architecture
    'adr-draftsman': () => import('./implementations/adrDraftsman').then(m => m.adrDraftsmanApp),

    // Product
    'prd-draftsman': () => import('./implementations/prdDraftsman').then(m => m.prdDraftsmanApp),

    // JIRA
    'jira-story-writer': () => import('./implementations/jiraStoryWriter').then(m => m.jiraStoryWriterApp),
    'sprint-retro': () => import('./implementations/sprintRetro').then(m => m.sprintRetroApp),

    // Communication
    'email-composer': () => import('./implementations/emailComposer').then(m => m.emailComposerApp),
    'slack-polisher': () => import('./implementations/slackPolisher').then(m => m.slackPolisherApp),
    'ecard-recognition': () => import('./implementations/ecardRecognition').then(m => m.ecardRecognitionApp),
    'email-response-helper': () => import('./implementations/emailResponseHelper').then(m => m.emailResponseHelperApp),

    // Inspiration
    'brainstorming-partner': () => import('./implementations/brainstormingPartner').then(m => m.brainstormingPartnerApp),
    'prompt-explorer': () => import('./implementations/promptExplorer').then(m => m.promptExplorerApp),
    'daily-inspiration': () => import('./implementations/dailyInspiration').then(m => m.dailyInspirationApp),

    // Wellness
    'rubber-duck-therapist': () => import('./implementations/rubberDuckTherapist').then(m => m.rubberDuckTherapistApp),
    'gratitude-journal': () => import('./implementations/gratitudeJournal').then(m => m.gratitudeJournalApp),
    'focus-mindfulness': () => import('./implementations/focusMindfulness').then(m => m.focusMindfulnessApp),

    // Games
    'story-chain': () => import('./implementations/games/storyChain').then(m => m.storyChainApp),
    'trivia-showdown': () => import('./implementations/games/triviaShowdown').then(m => m.triviaShowdownApp),
    'caption-battle': () => import('./implementations/games/captionBattle').then(m => m.captionBattleApp),
    'debate-arena': () => import('./implementations/games/debateArena').then(m => m.debateArenaApp),
};

/**
 * Static metadata for all apps (lightweight, no function imports)
 * This allows the registry to be browsed without loading implementations
 */
const appMetadataList: AppMetadata[] = [
    // General / Everyone
    { id: 'decision-doctor', name: 'Decision Doctor', description: 'Get AI help making tough decisions', icon: '🩺', category: 'productivity' },
    { id: 'skill-sprinter', name: 'Skill Sprinter', description: 'Quick micro-learning sessions', icon: '🏃', category: 'productivity' },
    { id: 'universal-summarizer', name: 'Universal Summarizer', description: 'Summarize any text quickly', icon: '📝', category: 'productivity' },
    { id: 'icebreaker-chef', name: 'Icebreaker Chef', description: 'Generate fun team icebreakers', icon: '🧊', category: 'productivity' },

    // Developer
    { id: 'code-review', name: 'Code Review', description: 'Full project code review using git diff', icon: '🔍', category: 'developer' },
    { id: 'test-case-generator', name: 'Test Case Generator', description: 'Generate comprehensive test cases', icon: '🧪', category: 'developer' },
    { id: 'bug-report-writer', name: 'Bug Report Writer', description: 'Write detailed bug reports', icon: '🐛', category: 'developer' },
    { id: 'regex-generator', name: 'Regex Generator', description: 'Generate and explain regex patterns', icon: '🔣', category: 'developer' },
    { id: 'api-doc-writer', name: 'API Doc Writer', description: 'Generate API documentation', icon: '📚', category: 'developer' },
    { id: 'sql-query-builder', name: 'SQL Query Builder', description: 'Build complex SQL queries', icon: '🗃️', category: 'developer' },
    { id: 'git-commit-writer', name: 'Git Commit Writer', description: 'Generate professional commit messages', icon: '📝', category: 'developer' },
    { id: 'json-tools', name: 'JSON Tools', description: 'Format, validate, and transform JSON', icon: '🔧', category: 'developer' },
    { id: 'code-explainer', name: 'Code Explainer', description: 'Understand any code with explanations', icon: '🎓', category: 'developer' },

    // Productivity
    { id: 'meeting-notes-to-actions', name: 'Meeting Notes to Actions', description: 'Convert meeting notes to action items', icon: '📋', category: 'productivity' },
    { id: 'standup-summary', name: 'Standup Summary', description: 'Generate standup updates', icon: '🎯', category: 'productivity' },

    // Leadership
    { id: 'one-on-one-prep', name: '1:1 Prep', description: 'Prepare for one-on-one meetings', icon: '👥', category: 'leadership' },
    { id: 'performance-review', name: 'Performance Review', description: 'Draft performance reviews', icon: '📊', category: 'leadership' },
    { id: 'team-feedback', name: 'Team Feedback', description: 'Generate constructive feedback', icon: '💬', category: 'leadership' },

    // QA
    { id: 'playwright-generator', name: 'Playwright Generator', description: 'Generate Playwright test scripts', icon: '🎭', category: 'qa' },
    { id: 'accessibility-checker', name: 'Accessibility Checker', description: 'Check accessibility compliance', icon: '♿', category: 'qa' },

    // Security
    { id: 'vulnerability-scanner', name: 'Vulnerability Scanner', description: 'Scan code for vulnerabilities', icon: '🔒', category: 'security' },

    // DevOps
    { id: 'iac-generator', name: 'IaC Generator', description: 'Generate infrastructure as code', icon: '☁️', category: 'devops' },

    // Architecture
    { id: 'adr-draftsman', name: 'ADR Draftsman', description: 'Draft Architecture Decision Records', icon: '🏗️', category: 'architecture' },

    // Product
    { id: 'prd-draftsman', name: 'PRD Draftsman', description: 'Draft Product Requirements Documents', icon: '📄', category: 'product' },

    // JIRA
    { id: 'jira-story-writer', name: 'Jira Story Writer', description: 'Write Jira user stories', icon: '🎫', category: 'jira' },
    { id: 'sprint-retro', name: 'Sprint Retro', description: 'Generate sprint retrospective notes', icon: '🔄', category: 'jira' },

    // Communication
    { id: 'email-composer', name: 'Email Composer', description: 'Compose professional emails', icon: '✉️', category: 'communication' },
    { id: 'slack-polisher', name: 'Slack Polisher', description: 'Polish Slack messages', icon: '💬', category: 'communication' },
    { id: 'ecard-recognition', name: 'E-Card Recognition', description: 'Create recognition e-cards', icon: '🏆', category: 'communication' },
    { id: 'email-response-helper', name: 'Email Response Helper', description: 'Draft email responses', icon: '↩️', category: 'communication' },

    // Inspiration
    { id: 'brainstorming-partner', name: 'Brainstorming Partner', description: 'AI brainstorming companion', icon: '💡', category: 'inspiration' },
    { id: 'prompt-explorer', name: 'Prompt Explorer', description: 'Explore and refine prompts', icon: '🔮', category: 'inspiration' },
    { id: 'daily-inspiration', name: 'Daily Inspiration', description: 'Get daily inspiration quotes', icon: '✨', category: 'inspiration' },

    // Wellness
    { id: 'rubber-duck-therapist', name: 'Rubber Duck Therapist', description: 'Talk through problems', icon: '🦆', category: 'wellness' },
    { id: 'gratitude-journal', name: 'Gratitude Journal', description: 'Daily gratitude prompts', icon: '🙏', category: 'wellness' },
    { id: 'focus-mindfulness', name: 'Focus & Mindfulness', description: 'Mindfulness and focus exercises', icon: '🧘', category: 'wellness' },

    // Games
    { id: 'story-chain', name: 'Story Chain', description: 'Collaborative storytelling game', icon: '📖', category: 'games' },
    { id: 'trivia-showdown', name: 'Trivia Showdown', description: 'Team trivia game', icon: '❓', category: 'games' },
    { id: 'caption-battle', name: 'Caption Battle', description: 'Caption contest game', icon: '🖼️', category: 'games' },
    { id: 'debate-arena', name: 'Debate Arena', description: 'Friendly debate game', icon: '⚔️', category: 'games' },
];

/**
 * Cache for loaded app definitions
 */
const loadedApps: Map<string, AppDefinition> = new Map();

/**
 * Get app metadata by ID (lightweight, no loading)
 */
export function getAppMetadataById(id: string): AppMetadata | undefined {
    return appMetadataList.find(app => app.id === id);
}

/**
 * Get full app definition by ID (loads on first access)
 */
export async function getAppByIdAsync(id: string): Promise<AppDefinition | undefined> {
    // Check cache first
    if (loadedApps.has(id)) {
        return loadedApps.get(id);
    }

    // Load dynamically
    const loader = appLoaders[id];
    if (!loader) {
        return undefined;
    }

    try {
        const app = await loader();
        loadedApps.set(id, app);
        return app;
    } catch (error) {
        console.error(`Failed to load app "${id}":`, error);
        return undefined;
    }
}

/**
 * Synchronous version for backward compatibility
 * Returns cached app or undefined if not loaded yet
 * @deprecated Use getAppByIdAsync instead
 */
export function getAppById(id: string): AppDefinition | undefined {
    // If already loaded, return from cache
    if (loadedApps.has(id)) {
        return loadedApps.get(id);
    }

    // Trigger async load in background
    const loader = appLoaders[id];
    if (loader) {
        loader().then(app => {
            loadedApps.set(id, app);
        }).catch(err => {
            console.error(`Failed to preload app "${id}":`, err);
        });
    }

    return undefined;
}

/**
 * Preload an app (for use when user hovers or shows interest)
 */
export function preloadApp(id: string): void {
    if (!loadedApps.has(id)) {
        const loader = appLoaders[id];
        if (loader) {
            loader().then(app => {
                loadedApps.set(id, app);
            }).catch(() => { /* ignore preload errors */ });
        }
    }
}

/**
 * Get all app metadata (lightweight registry listing)
 */
export function getAppRegistry(): AppMetadata[] {
    return appMetadataList;
}

/**
 * Legacy compatibility: appRegistry array
 * Note: This triggers loading of all apps - avoid using
 * @deprecated Use getAppRegistry() for metadata or getAppByIdAsync() for full apps
 */
export const appRegistry: AppMetadata[] = appMetadataList;

/**
 * Get all apps in a category (metadata only)
 */
export function getAppsByCategory(category: AppCategory): AppMetadata[] {
    return appMetadataList.filter(app => app.category === category);
}

/**
 * Get apps grouped by category (metadata only)
 */
export function getAppsGroupedByCategory(): Record<AppCategory, AppMetadata[]> {
    const grouped: Record<AppCategory, AppMetadata[]> = {
        wellness: [],
        inspiration: [],
        communication: [],
        developer: [],
        qa: [],
        leadership: [],
        productivity: [],
        security: [],
        devops: [],
        architecture: [],
        product: [],
        jira: [],
        games: [],
    };

    for (const app of appMetadataList) {
        grouped[app.category].push(app);
    }

    return grouped;
}

/**
 * Search apps by name or description (metadata only)
 */
export function searchApps(query: string): AppMetadata[] {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
        return appMetadataList;
    }

    return appMetadataList.filter(app =>
        app.name.toLowerCase().includes(lowerQuery) ||
        app.description.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Get category metadata
 */
export const categoryMetadata: Record<AppCategory, { label: string; icon: string; description: string }> = {
    developer: {
        label: 'Developer',
        icon: '👨‍💻',
        description: 'Tools for software developers'
    },
    qa: {
        label: 'QA & Testing',
        icon: '🧪',
        description: 'Tools for quality assurance'
    },
    leadership: {
        label: 'Leadership',
        icon: '📊',
        description: 'Tools for tech leads and managers'
    },
    productivity: {
        label: 'Productivity',
        icon: '⚡',
        description: 'General productivity tools'
    },
    security: {
        label: 'Security & Compliance',
        icon: '🛡️',
        description: 'Tools for code safety and regulatory alignment'
    },
    devops: {
        label: 'DevOps & Infrastructure',
        icon: '☁️',
        description: 'Streamlining cloud operations and manifest management'
    },
    architecture: {
        label: 'Architecture & Design',
        icon: '🏗️',
        description: 'Supporting high-level technical decision-making and planning'
    },
    product: {
        label: 'Product & Strategy',
        icon: '📈',
        description: 'Bridging the gap between engineering and business'
    },
    jira: {
        label: 'JIRA & Project Management',
        icon: '🎫',
        description: 'Tools for story writing and sprint management'
    },
    communication: {
        label: 'Communication',
        icon: '💬',
        description: 'Email, messaging, and professional writing'
    },
    inspiration: {
        label: 'Inspiration & Ideas',
        icon: '✨',
        description: 'Brainstorming, prompts, and creative thinking'
    },
    wellness: {
        label: 'Wellness & Mindfulness',
        icon: '🧘',
        description: 'Mental well-being and focus tools'
    },
    games: {
        label: 'Team Games',
        icon: '🎮',
        description: 'Fun interactive games for team engagement'
    },
};
