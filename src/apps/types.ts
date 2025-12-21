/**
 * Enterprise Apps Hub - Core Type Definitions
 * 
 * This module defines the interfaces for building modular AI-powered apps
 * that run directly through VS Code's Language Model API.
 */

/**
 * Category of the app - used for filtering and organization
 */
export type AppCategory = 'developer' | 'qa' | 'leadership' | 'productivity' | 'security' | 'devops' | 'architecture' | 'product' | 'jira' | 'communication' | 'inspiration' | 'wellness' | 'games';

/**
 * Input field types supported by the app system
 */
export type InputFieldType =
    | 'text'           // Single line text
    | 'textarea'       // Multi-line text
    | 'code'           // Code editor with syntax highlighting
    | 'select'         // Dropdown selection
    | 'multi-select'   // Multiple selection checkboxes
    | 'checkbox-group' // Multiple checkboxes (returns array)
    | 'project-picker' // Folder picker for projects
    | 'file-picker'    // File picker
    | 'model-picker'   // AI model picker (from vscode.lm)
    | 'radio'          // Radio button group
    | 'checkbox';      // Single checkbox

/**
 * Output types for app results
 */
export type OutputType = 'markdown' | 'code' | 'structured' | 'diff' | 'sections';

/**
 * Actions that can be performed on output
 */
export type OutputActionType = 'copy' | 'insert' | 'newFile' | 'openInEditor' | 'export';

/**
 * Definition for an input field in an app
 */
export interface InputField {
    /** Unique identifier for the field */
    id: string;

    /** Display label */
    label: string;

    /** Type of input control */
    type: InputFieldType;

    /** Placeholder text */
    placeholder?: string;

    /** Whether the field is required */
    required?: boolean;

    /** Default value */
    defaultValue?: string;

    /** Options for select/radio/multi-select types */
    options?: SelectOption[];

    /** Hint text shown below the field */
    hint?: string;

    /** For code type: syntax highlighting language */
    language?: string;

    /** For textarea/code: number of rows */
    rows?: number;

    /** Validation regex pattern */
    pattern?: string;

    /** Custom validation error message */
    validationMessage?: string;

    /** Conditional visibility based on other field values */
    showIf?: {
        field: string;
        equals: string | string[];
    };
}

/**
 * Option for select/radio/multi-select fields
 */
export interface SelectOption {
    value: string;
    label: string;
    icon?: string;
    description?: string;
}

/**
 * Context gathered for an app execution
 */
export interface AppContext {
    /** Git diff content */
    gitDiff?: string;

    /** File contents that were read */
    fileContents?: Array<{ path: string; content: string }>;

    /** Project paths involved */
    projectPaths?: string[];

    /** Additional metadata */
    metadata?: Record<string, unknown>;

    /** Errors encountered during context fetch */
    errors?: string[];
}

/**
 * Action button for output
 */
export interface OutputAction {
    /** Button label */
    label: string;

    /** Icon (emoji or codicon) */
    icon: string;

    /** Action type */
    action: OutputActionType;

    /** Additional data for the action */
    data?: string;

    /** File extension for newFile action */
    fileExtension?: string;

    /** Suggested filename for newFile action */
    suggestedFilename?: string;
}

/**
 * Section within structured output
 */
export interface OutputSection {
    /** Section title */
    title: string;

    /** Section content (markdown) */
    content: string;

    /** Severity/importance level */
    severity?: 'critical' | 'warning' | 'info' | 'success';

    /** Collapsible section */
    collapsible?: boolean;

    /** Initially collapsed */
    collapsed?: boolean;

    /** Actions specific to this section */
    actions?: OutputAction[];
}

/**
 * Output from an app execution
 */
export interface AppOutput {
    /** Type of output */
    type: OutputType;

    /** Raw content */
    content: string;

    /** Structured sections (for structured output type) */
    sections?: OutputSection[];

    /** Global actions for the entire output */
    actions?: OutputAction[];

    /** Summary line */
    summary?: string;

    /** Language for code output */
    language?: string;
}

/**
 * Result of an app execution
 */
export interface AppResult {
    /** Whether execution was successful */
    success: boolean;

    /** The output (if successful) */
    output?: AppOutput;

    /** Error message (if failed) */
    error?: string;

    /** Execution duration in milliseconds */
    durationMs: number;

    /** Token usage */
    tokens?: {
        input: number;
        output: number;
    };
}

/**
 * Main app definition interface
 */
export interface AppDefinition {
    /** Unique identifier */
    id: string;

    /** Display name */
    name: string;

    /** Short description */
    description: string;

    /** Icon (emoji or codicon) */
    icon: string;

    /** Category for organization */
    category: AppCategory;

    /** Optional tags for better discovery */
    tags?: string[];

    /** Input fields configuration */
    inputs: InputField[];

    /** Primary action button text */
    primaryAction: string;

    /** System prompt for the LLM */
    systemPrompt: string;

    /**
     * Build the user prompt from inputs and context
     */
    buildUserPrompt: (inputs: Record<string, string>, context?: AppContext) => string;

    /**
     * Optional: Fetch additional context before execution
     * (e.g., git diff, file contents)
     */
    fetchContext?: (inputs: Record<string, string>) => Promise<AppContext>;

    /**
     * Optional: Parse the LLM response into structured output
     */
    parseResponse?: (response: string, inputs: Record<string, string>) => AppOutput;

    /**
     * Optional: Default output actions
     */
    defaultActions?: OutputAction[];

    /**
     * Optional: Example inputs for help/demo
     */
    examples?: Array<{
        name: string;
        inputs: Record<string, string>;
    }>;

    /**
     * Optional: Whether the app requires specific context (git, files, etc.)
     */
    requirements?: {
        git?: boolean;
        workspace?: boolean;
        copilot?: boolean;
    };

    /**
     * Optional: Detailed documentation on what the app is and how to use it.
     * Supports markdown-like formatting for display in the UI.
     */
    helpDocumentation?: string;
}

/**
 * Saved project for Code Review app
 */
export interface SavedProject {
    /** Unique ID */
    id: string;

    /** Project path */
    path: string;

    /** Display name (folder name) */
    name: string;

    /** Last used timestamp */
    lastUsed: number;

    /** Is this a favorite? */
    favorite?: boolean;
}

/**
 * User preferences for the Apps Hub
 */
export interface AppsHubPreferences {
    /** Favorite app IDs */
    favoriteApps: string[];

    /** Recent app IDs (ordered, most recent first) */
    recentApps: string[];

    /** Saved projects for Code Review */
    savedProjects: SavedProject[];

    /** Per-app settings */
    appSettings: Record<string, Record<string, unknown>>;

    /** Default AI model ID for apps */
    defaultModelId?: string;

    /** Jira integration config (used by multiple apps) */
    jiraConfig?: {
        baseUrl: string;   // e.g., https://yourcompany.atlassian.net
        email: string;     // User email
        token: string;     // API token
    };
}

/**
 * State of the Apps Hub
 */
export interface AppsHubState {
    /** Currently selected app ID */
    selectedAppId?: string;

    /** Current input values */
    inputValues: Record<string, string>;

    /** Is processing */
    isProcessing: boolean;

    /** Current result */
    result?: AppResult;

    /** Active tab in the hub */
    activeTab: 'browse' | 'app';
}
