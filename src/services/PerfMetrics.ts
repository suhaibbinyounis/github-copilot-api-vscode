type CounterMap = Record<string, number>;

export type PerfCounterSnapshot = {
    webviewMessagesSent: number;
    webviewMessagesReceived: number;
    webviewHtmlWrites: number;
    dashboardCreates: number;
    dashboardReveals: number;
    sidebarResolves: number;
    statusEvents: number;
    sentByTarget: CounterMap;
    sentByType: CounterMap;
    receivedByTarget: CounterMap;
    receivedByType: CounterMap;
    htmlWritesByTarget: CounterMap;
    htmlBytesByTarget: CounterMap;
};

export type PerfPhaseResult = {
    name: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    cpuUserMicros: number;
    cpuSystemMicros: number;
    counters: PerfCounterSnapshot;
    memory: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
        arrayBuffers: number;
    };
};

export type PerfReport = {
    generatedAt: string;
    processUptimeMs: number;
    totalCpuUsageMicros: NodeJS.CpuUsage;
    counters: PerfCounterSnapshot;
    activePhases: string[];
    completedPhases: PerfPhaseResult[];
};

type PhaseState = {
    name: string;
    startedAtMs: number;
    startedAtIso: string;
    cpuStart: NodeJS.CpuUsage;
    counterStart: PerfCounterSnapshot;
};

function createEmptyCounterSnapshot(): PerfCounterSnapshot {
    return {
        webviewMessagesSent: 0,
        webviewMessagesReceived: 0,
        webviewHtmlWrites: 0,
        dashboardCreates: 0,
        dashboardReveals: 0,
        sidebarResolves: 0,
        statusEvents: 0,
        sentByTarget: {},
        sentByType: {},
        receivedByTarget: {},
        receivedByType: {},
        htmlWritesByTarget: {},
        htmlBytesByTarget: {},
    };
}

function cloneCounterMap(counterMap: CounterMap): CounterMap {
    return { ...counterMap };
}

function cloneSnapshot(snapshot: PerfCounterSnapshot): PerfCounterSnapshot {
    return {
        ...snapshot,
        sentByTarget: cloneCounterMap(snapshot.sentByTarget),
        sentByType: cloneCounterMap(snapshot.sentByType),
        receivedByTarget: cloneCounterMap(snapshot.receivedByTarget),
        receivedByType: cloneCounterMap(snapshot.receivedByType),
        htmlWritesByTarget: cloneCounterMap(snapshot.htmlWritesByTarget),
        htmlBytesByTarget: cloneCounterMap(snapshot.htmlBytesByTarget),
    };
}

function incrementCounter(counterMap: CounterMap, key: string, delta = 1): void {
    counterMap[key] = (counterMap[key] ?? 0) + delta;
}

function diffCounterMap(current: CounterMap, start: CounterMap): CounterMap {
    const keys = new Set([...Object.keys(current), ...Object.keys(start)]);
    const diff: CounterMap = {};
    for (const key of keys) {
        const delta = (current[key] ?? 0) - (start[key] ?? 0);
        if (delta !== 0) {
            diff[key] = delta;
        }
    }
    return diff;
}

function diffSnapshot(current: PerfCounterSnapshot, start: PerfCounterSnapshot): PerfCounterSnapshot {
    return {
        webviewMessagesSent: current.webviewMessagesSent - start.webviewMessagesSent,
        webviewMessagesReceived: current.webviewMessagesReceived - start.webviewMessagesReceived,
        webviewHtmlWrites: current.webviewHtmlWrites - start.webviewHtmlWrites,
        dashboardCreates: current.dashboardCreates - start.dashboardCreates,
        dashboardReveals: current.dashboardReveals - start.dashboardReveals,
        sidebarResolves: current.sidebarResolves - start.sidebarResolves,
        statusEvents: current.statusEvents - start.statusEvents,
        sentByTarget: diffCounterMap(current.sentByTarget, start.sentByTarget),
        sentByType: diffCounterMap(current.sentByType, start.sentByType),
        receivedByTarget: diffCounterMap(current.receivedByTarget, start.receivedByTarget),
        receivedByType: diffCounterMap(current.receivedByType, start.receivedByType),
        htmlWritesByTarget: diffCounterMap(current.htmlWritesByTarget, start.htmlWritesByTarget),
        htmlBytesByTarget: diffCounterMap(current.htmlBytesByTarget, start.htmlBytesByTarget),
    };
}

export class PerfMetrics {
    private static counters: PerfCounterSnapshot = createEmptyCounterSnapshot();
    private static activePhases = new Map<string, PhaseState>();
    private static completedPhases: PerfPhaseResult[] = [];

    public static reset(): void {
        this.counters = createEmptyCounterSnapshot();
        this.activePhases.clear();
        this.completedPhases = [];
    }

    public static beginPhase(name: string): PerfPhaseResult | undefined {
        const trimmedName = name.trim();
        if (!trimmedName) {
            throw new Error('Phase name is required.');
        }

        if (this.activePhases.has(trimmedName)) {
            throw new Error(`Perf phase already active: ${trimmedName}`);
        }

        this.activePhases.set(trimmedName, {
            name: trimmedName,
            startedAtMs: Date.now(),
            startedAtIso: new Date().toISOString(),
            cpuStart: process.cpuUsage(),
            counterStart: cloneSnapshot(this.counters),
        });
        return undefined;
    }

    public static endPhase(name: string): PerfPhaseResult {
        const trimmedName = name.trim();
        const phase = this.activePhases.get(trimmedName);
        if (!phase) {
            throw new Error(`Perf phase not active: ${trimmedName}`);
        }

        this.activePhases.delete(trimmedName);
        const cpu = process.cpuUsage(phase.cpuStart);
        const result: PerfPhaseResult = {
            name: trimmedName,
            startedAt: phase.startedAtIso,
            endedAt: new Date().toISOString(),
            durationMs: Date.now() - phase.startedAtMs,
            cpuUserMicros: cpu.user,
            cpuSystemMicros: cpu.system,
            counters: diffSnapshot(this.counters, phase.counterStart),
            memory: process.memoryUsage(),
        };
        this.completedPhases.push(result);
        return result;
    }

    public static recordWebviewMessageSent(target: string, type: string): void {
        this.counters.webviewMessagesSent += 1;
        incrementCounter(this.counters.sentByTarget, target);
        incrementCounter(this.counters.sentByType, `${target}:${type}`);
    }

    public static recordWebviewMessageReceived(target: string, type: string): void {
        this.counters.webviewMessagesReceived += 1;
        incrementCounter(this.counters.receivedByTarget, target);
        incrementCounter(this.counters.receivedByType, `${target}:${type}`);
    }

    public static recordWebviewHtmlWrite(target: string, htmlLength: number): void {
        this.counters.webviewHtmlWrites += 1;
        incrementCounter(this.counters.htmlWritesByTarget, target);
        incrementCounter(this.counters.htmlBytesByTarget, target, htmlLength);
    }

    public static recordDashboardCreate(): void {
        this.counters.dashboardCreates += 1;
    }

    public static recordDashboardReveal(): void {
        this.counters.dashboardReveals += 1;
    }

    public static recordSidebarResolve(): void {
        this.counters.sidebarResolves += 1;
    }

    public static recordStatusEvent(): void {
        this.counters.statusEvents += 1;
    }

    public static getReport(): PerfReport {
        return {
            generatedAt: new Date().toISOString(),
            processUptimeMs: Math.round(process.uptime() * 1000),
            totalCpuUsageMicros: process.cpuUsage(),
            counters: cloneSnapshot(this.counters),
            activePhases: [...this.activePhases.keys()],
            completedPhases: [...this.completedPhases],
        };
    }
}