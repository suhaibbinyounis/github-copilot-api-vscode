const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const resultsDir = path.join(rootDir, 'perf-results');

const vscodeMockSource = String.raw`
const state = globalThis.__perfVscodeState ??= {};

class EventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = (listener) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
  }

  fire(value) {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  dispose() {
    this.listeners.clear();
  }
}

function getSectionState(section) {
  return state.configStore?.[section] ?? {};
}

function createConfiguration(section) {
  return {
    get(key, defaultValue) {
      const sectionState = getSectionState(section);
      if (typeof key === 'undefined') {
        return sectionState ?? defaultValue;
      }
      return key in sectionState ? sectionState[key] : defaultValue;
    },
    async update(key, value) {
      const sectionState = state.configStore[section] ?? (state.configStore[section] = {});
      sectionState[key] = value;
    }
  };
}

class MarkdownString {
  constructor(value = '') {
    this.value = value;
    this.isTrusted = false;
  }
}

class ThemeColor {
  constructor(id) {
    this.id = id;
  }
}

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

const workspace = {
  getConfiguration(section = '') {
    return createConfiguration(section);
  },
  onDidChangeConfiguration() {
    return { dispose() {} };
  },
  fs: {
    async createDirectory() {},
    async writeFile() {}
  }
};

const window = {
  activeTextEditor: { viewColumn: 1 },
  createWebviewPanel(...args) {
    return state.createWebviewPanel(...args);
  },
  async showInformationMessage() { return undefined; },
  async showWarningMessage() { return undefined; },
  async showErrorMessage() { return undefined; },
  async withProgress(_options, task) { return task(); }
};

const commands = {
  async executeCommand(...args) {
    state.executedCommands = state.executedCommands ?? [];
    state.executedCommands.push(args);
    return undefined;
  }
};

const env = {
  async openExternal() { return true; },
  clipboard: {
    async writeText() {}
  }
};

const extensions = {
  get all() {
    return state.extensions ?? [];
  }
};

const lm = {
  selectChatModels() {
    return state.selectChatModels();
  }
};

const ViewColumn = { One: 1 };
const ProgressLocation = { Notification: 15 };
const QuickPickItemKind = { Separator: -1 };
const ConfigurationTarget = { Global: 1 };

const Uri = {
  parse(value) {
    return { scheme: 'file', fsPath: String(value), toString() { return String(value); } };
  },
  file(value) {
    return { scheme: 'file', fsPath: String(value), toString() { return String(value); } };
  },
  joinPath(base, ...parts) {
    const fsPath = [base.fsPath, ...parts].join('/');
    return { scheme: base.scheme ?? 'file', fsPath, toString() { return fsPath; } };
  }
};

export {
  commands,
  ConfigurationTarget,
  env,
  EventEmitter,
  extensions,
  lm,
  MarkdownString,
  ProgressLocation,
  QuickPickItemKind,
  Range,
  ThemeColor,
  Uri,
  ViewColumn,
  window,
  workspace
};

export default {
  commands,
  ConfigurationTarget,
  env,
  EventEmitter,
  extensions,
  lm,
  MarkdownString,
  ProgressLocation,
  QuickPickItemKind,
  Range,
  ThemeColor,
  Uri,
  ViewColumn,
  window,
  workspace
};
`;

const auditServiceMockSource = String.raw`
export class AuditService {
  constructor() {}

  async getLifetimeStats() {
    return { totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0 };
  }

  async getTodayStats() {
    return { totalRequests: 0, requests: 0, tokensIn: 0, tokensOut: 0 };
  }

  async getDailyStats(lastDays = 7) {
    return Array.from({ length: lastDays }, (_, index) => ({
      date: new Date(Date.now() - index * 86400000).toISOString().slice(0, 10),
      totalRequests: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      tokensIn: 0,
      tokensOut: 0
    })).reverse();
  }

  async getAuditLogs(page = 1, pageSize = 10) {
    return { entries: [], total: 0, page, pageSize };
  }

  async appendEntry() {}
}

export class AuditEntry {}
`;

const mcpServiceMockSource = String.raw`
export class McpService {
  constructor() {}
  async initialize() {}
  getConnectedServers() { return []; }
  getTools() { return []; }
  dispose() {}
}
`;

function createPerfPlugin() {
  return {
    name: 'perf-mocks',
    setup(build) {
      build.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'perf-mock' }));
      build.onResolve({ filter: /AuditService$/ }, () => ({ path: 'AuditService', namespace: 'perf-mock' }));
      build.onResolve({ filter: /McpService$/ }, () => ({ path: 'McpService', namespace: 'perf-mock' }));

      build.onLoad({ filter: /^vscode$/, namespace: 'perf-mock' }, () => ({ contents: vscodeMockSource, loader: 'js' }));
      build.onLoad({ filter: /^AuditService$/, namespace: 'perf-mock' }, () => ({ contents: auditServiceMockSource, loader: 'js' }));
      build.onLoad({ filter: /^McpService$/, namespace: 'perf-mock' }, () => ({ contents: mcpServiceMockSource, loader: 'js' }));
    }
  };
}

function createGlobalState() {
  const executedCommands = [];
  const configStore = {
    githubCopilotApi: {
      'server.enabled': false,
      'server.enableHttp': true,
      'server.enableWebSocket': false,
      'server.enableHttps': false,
      'server.tlsCertPath': '',
      'server.tlsKeyPath': '',
      'server.host': '127.0.0.1',
      'server.port': 3030,
      'server.maxConcurrentRequests': 4,
      'server.defaultModel': 'gpt-4o-copilot',
      'server.apiKey': '',
      'server.enableLogging': false,
      'server.rateLimitPerMinute': 60,
      'server.defaultSystemPrompt': '',
      'server.redactionPatterns': [],
      'server.ipAllowlist': [],
      'server.requestTimeoutSeconds': 180,
      'server.maxPayloadSizeMb': 1,
      'server.maxConnectionsPerIp': 10,
    },
    'githubCopilotApi.mcp': { enabled: false },
    'githubCopilotApi.tunnel': { cloudflaredPath: '' }
  };

  return {
    configStore,
    executedCommands,
    extensions: [
      { id: 'GitHub.copilot', packageJSON: { publisher: 'GitHub', name: 'copilot' } },
      { id: 'GitHub.copilot-chat', packageJSON: { publisher: 'GitHub', name: 'copilot-chat' } }
    ],
    selectChatModels: async () => []
  };
}

function createContext(tempDir) {
  const store = new Map();
  return {
    extensionUri: { scheme: 'file', fsPath: tempDir, toString() { return tempDir; } },
    globalStorageUri: { scheme: 'file', fsPath: tempDir, toString() { return tempDir; } },
    globalState: {
      get(key, defaultValue) {
        return store.has(key) ? store.get(key) : defaultValue;
      },
      async update(key, value) {
        store.set(key, value);
      }
    },
    subscriptions: []
  };
}

function createOutputChannel() {
  return {
    appendLine() {},
    show() {},
    dispose() {}
  };
}

function createStatusBarItem() {
  return {
    text: '',
    tooltip: undefined,
    backgroundColor: undefined,
    command: undefined,
    show() {},
    dispose() {}
  };
}

function createEmitter() {
  const listeners = new Set();
  return {
    event(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    fire(value) {
      for (const listener of [...listeners]) {
        listener(value);
      }
    }
  };
}

function createFakeWebview(name) {
  const listeners = new Set();
  let htmlValue = '';
  const webview = {
    cspSource: `perf-${name}`,
    options: undefined,
    htmlWrites: 0,
    postMessages: [],
    onDidReceiveMessage(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    async postMessage(message) {
      webview.postMessages.push(message);
      return true;
    },
    emitMessage(message) {
      for (const listener of [...listeners]) {
        listener(message);
      }
    }
  };

  Object.defineProperty(webview, 'html', {
    get() {
      return htmlValue;
    },
    set(value) {
      htmlValue = value;
      webview.htmlWrites += 1;
    }
  });

  return webview;
}

function createFakePanel(name) {
  const disposeListeners = new Set();
  return {
    visible: true,
    revealCount: 0,
    webview: createFakeWebview(name),
    reveal() {
      this.revealCount += 1;
      this.visible = true;
    },
    onDidDispose(listener, _thisArg, disposables) {
      disposeListeners.add(listener);
      const disposable = { dispose: () => disposeListeners.delete(listener) };
      if (Array.isArray(disposables)) {
        disposables.push(disposable);
      }
      return disposable;
    },
    dispose() {
      for (const listener of [...disposeListeners]) {
        listener();
      }
    }
  };
}

async function buildBundle(entryFile, outfile) {
  await esbuild.build({
    entryPoints: [entryFile],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    plugins: [createPerfPlugin()],
    logLevel: 'silent'
  });

  delete require.cache[outfile];
  return require(outfile);
}

function createGatewayStatus() {
  return {
    running: true,
    isHttps: false,
    activeRequests: 0,
    copilot: {
      installed: true,
      chatInstalled: true,
      signedIn: true,
      ready: true,
      totalModels: 2,
      vendors: ['copilot', 'anthropic']
    },
    config: {
      host: '127.0.0.1',
      port: 3030,
      defaultModel: 'gpt-4o-copilot'
    },
    stats: {
      totalRequests: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      requestsPerMinute: 0,
      avgLatencyMs: 0,
      errorRate: 0,
      uptimeMs: 1000,
      startTime: Date.now()
    },
    realtimeStats: {
      requestsPerMinute: 0,
      avgLatencyMs: 0,
      errorRate: 0
    },
    tunnel: { running: false, url: null },
    networkInfo: { localIPs: ['127.0.0.1'] }
  };
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-api-perf-'));
  const state = createGlobalState();
  global.__perfVscodeState = state;

  const gatewayModule = await buildBundle(path.join(rootDir, 'src', 'CopilotApiGateway.ts'), path.join(tempDir, 'CopilotApiGateway.cjs'));
  const panelModule = await buildBundle(path.join(rootDir, 'src', 'CopilotPanel.ts'), path.join(tempDir, 'CopilotPanel.cjs'));

  const { CopilotApiGateway } = gatewayModule;
  const { CopilotPanel } = panelModule;
  const iterations = 50;
  const output = createOutputChannel();
  const statusItem = createStatusBarItem();

  state.selectChatModelsCalls = 0;
  state.selectChatModels = async () => {
    state.selectChatModelsCalls += 1;
    return [
      { id: 'gpt-4o-copilot', vendor: 'copilot' },
      { id: 'claude-3.7-sonnet', vendor: 'anthropic' }
    ];
  };

  let start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const gateway = new CopilotApiGateway(output, statusItem, createContext(path.join(tempDir, `health-${index}`)));
    await gateway.getCopilotHealth();
    gateway.dispose();
  }
  const noCacheMs = Number((performance.now() - start).toFixed(2));
  const noCacheSelectCalls = state.selectChatModelsCalls;

  state.selectChatModelsCalls = 0;
  const cachedGateway = new CopilotApiGateway(output, statusItem, createContext(path.join(tempDir, 'health-cached')));
  start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await cachedGateway.getCopilotHealth();
  }
  const cachedMs = Number((performance.now() - start).toFixed(2));
  const cachedSelectCalls = state.selectChatModelsCalls;
  cachedGateway.dispose();

  const redactionGateway = new CopilotApiGateway(output, statusItem, createContext(path.join(tempDir, 'redaction')));
  redactionGateway.config.redactionPatterns = [
    { id: 'token', name: 'Token', pattern: 'sk-[a-zA-Z0-9]{20,}', enabled: true, isBuiltin: false },
    { id: 'mail', name: 'Mail', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', enabled: true, isBuiltin: false }
  ];
  const samplePayload = {
    prompt: 'Reach me at perf@example.com with key sk-abcdefghijklmnopqrstuvwxyz123456',
    messages: [
      { role: 'user', content: 'Email perf@example.com now.' },
      { role: 'assistant', content: 'Stored key sk-abcdefghijklmnopqrstuvwxyz123456 safely.' }
    ]
  };

  const oldRedact = (value, patterns) => {
    const apply = (input) => {
      if (typeof input === 'string') {
        let result = input;
        for (const pattern of patterns) {
          if (!pattern.enabled) {
            continue;
          }
          result = result.replace(new RegExp(pattern.pattern, 'gi'), '[REDACTED]');
        }
        return result;
      }
      if (Array.isArray(input)) {
        return input.map(apply);
      }
      if (input && typeof input === 'object') {
        return Object.fromEntries(Object.entries(input).map(([key, entryValue]) => [key, apply(entryValue)]));
      }
      return input;
    };

    return apply(value);
  };

  start = performance.now();
  for (let index = 0; index < 5000; index += 1) {
    oldRedact(samplePayload, redactionGateway.config.redactionPatterns);
  }
  const redactionOldMs = Number((performance.now() - start).toFixed(2));

  start = performance.now();
  for (let index = 0; index < 5000; index += 1) {
    redactionGateway.redactSensitiveData(samplePayload);
  }
  const redactionNewMs = Number((performance.now() - start).toFixed(2));
  redactionGateway.dispose();

  const statusEmitter = createEmitter();
  const requestEmitter = createEmitter();
  const requestStartEmitter = createEmitter();
  const panelStatus = createGatewayStatus();
  const fakeGateway = {
    onDidChangeStatus: statusEmitter.event,
    onDidLogRequest: requestEmitter.event,
    onDidLogRequestStart: requestStartEmitter.event,
    async getStatus() {
      return panelStatus;
    },
    getServerStatus() {
      return { activeConnections: 0 };
    },
    getVersion() {
      return 'perf-test';
    },
    getHistory() {
      return [];
    },
    async getDailyStats(lastDays) {
      return Array.from({ length: lastDays }, (_, index) => ({
        date: new Date(Date.now() - index * 86400000).toISOString().slice(0, 10),
        totalRequests: 0,
        totalTokensIn: 0,
        totalTokensOut: 0
      })).reverse();
    },
    getAuditService() {
      return {
        async getLifetimeStats() {
          return { totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0 };
        },
        async getTodayStats() {
          return { tokensIn: 0, tokensOut: 0 };
        }
      };
    }
  };

  let createdDashboardPanel;
  state.createWebviewPanel = () => {
    createdDashboardPanel = createFakePanel('dashboard');
    return createdDashboardPanel;
  };

  const sidebarView = createFakePanel('sidebar');
  const provider = new CopilotPanel({ scheme: 'file', fsPath: rootDir }, async () => fakeGateway);
  await provider.resolveWebviewView(sidebarView, {}, {});
  await CopilotPanel.createOrShow({ scheme: 'file', fsPath: rootDir }, async () => fakeGateway);
  const initialHtmlWrites = createdDashboardPanel.webview.htmlWrites;

  statusEmitter.fire();
  await new Promise(resolve => setTimeout(resolve, 10));

  const panelResult = {
    initialHtmlWrites,
    htmlWritesAfterStableStatus: createdDashboardPanel.webview.htmlWrites,
    postMessagesAfterStableStatus: createdDashboardPanel.webview.postMessages.length,
    statsSnapshotMessagesAfterStableStatus: createdDashboardPanel.webview.postMessages.filter(message => message.type === 'statsSnapshot').length
  };

  const result = {
    generatedAt: new Date().toISOString(),
    copilotHealth: {
      iterations,
      noCacheMs,
      cachedMs,
      noCacheSelectCalls,
      cachedSelectCalls,
      speedup: Number((noCacheMs / Math.max(cachedMs, 0.01)).toFixed(2))
    },
    redaction: {
      iterations: 5000,
      oldMs: redactionOldMs,
      newMs: redactionNewMs,
      speedup: Number((redactionOldMs / Math.max(redactionNewMs, 0.01)).toFixed(2))
    },
    panel: panelResult
  };

  await fs.mkdir(resultsDir, { recursive: true });
  const resultFile = path.join(resultsDir, `runtime-bench-${timestamp}.json`);
  await fs.writeFile(resultFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ ...result, resultFile }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});