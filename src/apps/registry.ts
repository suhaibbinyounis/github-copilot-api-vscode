/**
 * App Registry - Central registry for all apps
 * 
 * This module provides an easy way to register and discover apps.
 * Adding a new app is as simple as importing and adding it to the registry.
 */

import { AppDefinition, AppCategory } from './types';

// Import app implementations
import { codeReviewApp } from './implementations/codeReview';
import { testCaseGeneratorApp } from './implementations/testCaseGenerator';
import { bugReportWriterApp } from './implementations/bugReportWriter';
import { meetingNotesToActionsApp } from './implementations/meetingNotesToActions';
import { standupSummaryApp } from './implementations/standupSummary';
import { playwrightGeneratorApp } from './implementations/playwrightGenerator';
import { vulnerabilityScannerApp } from './implementations/vulnerabilityScanner';
import { iacGeneratorApp } from './implementations/iacGenerator';
import { adrDraftsmanApp } from './implementations/adrDraftsman';
import { prdDraftsmanApp } from './implementations/prdDraftsman';

// New apps
import { regexGeneratorApp } from './implementations/regexGenerator';
import { apiDocWriterApp } from './implementations/apiDocWriter';
import { sqlQueryBuilderApp } from './implementations/sqlQueryBuilder';
import { accessibilityCheckerApp } from './implementations/accessibilityChecker';
import { jiraStoryWriterApp } from './implementations/jiraStoryWriter';
import { sprintRetroApp } from './implementations/sprintRetro';
import { emailComposerApp } from './implementations/emailComposer';
import { slackPolisherApp } from './implementations/slackPolisher';
import { brainstormingPartnerApp } from './implementations/brainstormingPartner';
import { promptExplorerApp } from './implementations/promptExplorer';
import { dailyInspirationApp } from './implementations/dailyInspiration';
import { rubberDuckTherapistApp } from './implementations/rubberDuckTherapist';
import { gratitudeJournalApp } from './implementations/gratitudeJournal';
import { focusMindfulnessApp } from './implementations/focusMindfulness';
import { ecardRecognitionApp } from './implementations/ecardRecognition';
import { emailResponseHelperApp } from './implementations/emailResponseHelper';
// General Purpose
import { decisionDoctorApp } from './implementations/decisionDoctor';
import { skillSprinterApp } from './implementations/skillSprinter';
import { universalSummarizerApp } from './implementations/universalSummarizer';
import { icebreakerChefApp } from './implementations/icebreakerChef';

// Games
import { storyChainApp } from './implementations/games/storyChain';
import { triviaShowdownApp } from './implementations/games/triviaShowdown';
import { captionBattleApp } from './implementations/games/captionBattle';
import { debateArenaApp } from './implementations/games/debateArena';

// Leadership
import { oneOnOnePrepApp } from './implementations/oneOnOnePrep';
import { performanceReviewApp } from './implementations/performanceReview';
import { teamFeedbackApp } from './implementations/teamFeedback';


/**
 * All registered apps
 * 
 * To add a new app:
 * 1. Create the app definition in src/apps/implementations/
 * 2. Import it here
 * 3. Add it to this array
 * 4. (Optional) Custom UI in AppsPanel.ts
 */
export const appRegistry: AppDefinition[] = [
    // General / Everyone
    decisionDoctorApp,
    skillSprinterApp,
    universalSummarizerApp,
    icebreakerChefApp,

    // Existing apps
    codeReviewApp,
    testCaseGeneratorApp,
    bugReportWriterApp,
    meetingNotesToActionsApp,
    standupSummaryApp,
    // Leadership
    oneOnOnePrepApp,
    performanceReviewApp,
    teamFeedbackApp,
    playwrightGeneratorApp,
    vulnerabilityScannerApp,
    iacGeneratorApp,
    adrDraftsmanApp,
    prdDraftsmanApp,
    // Developer
    regexGeneratorApp,
    apiDocWriterApp,
    sqlQueryBuilderApp,
    // QA
    accessibilityCheckerApp,
    // JIRA
    jiraStoryWriterApp,
    sprintRetroApp,
    // Communication
    emailComposerApp,
    slackPolisherApp,
    ecardRecognitionApp,
    emailResponseHelperApp,
    // Inspiration
    brainstormingPartnerApp,
    promptExplorerApp,
    dailyInspirationApp,
    // Wellness
    rubberDuckTherapistApp,
    gratitudeJournalApp,
    focusMindfulnessApp,
    // Games
    storyChainApp,
    triviaShowdownApp,
    captionBattleApp,
    debateArenaApp,
];

/**
 * Get an app by ID
 */
export function getAppById(id: string): AppDefinition | undefined {
    return appRegistry.find(app => app.id === id);
}

/**
 * Get all apps in a category
 */
export function getAppsByCategory(category: AppCategory): AppDefinition[] {
    return appRegistry.filter(app => app.category === category);
}

/**
 * Get apps grouped by category
 */
export function getAppsGroupedByCategory(): Record<AppCategory, AppDefinition[]> {
    const grouped: Record<AppCategory, AppDefinition[]> = {
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

    for (const app of appRegistry) {
        grouped[app.category].push(app);
    }

    return grouped;
}

/**
 * Search apps by name or description
 */
export function searchApps(query: string): AppDefinition[] {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
        return appRegistry;
    }

    return appRegistry.filter(app =>
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
