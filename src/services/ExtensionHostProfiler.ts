import * as fs from 'fs/promises';
import * as inspector from 'inspector';
import * as path from 'path';

type ActiveProfile = {
    label: string;
    session: inspector.Session;
    startedAtMs: number;
    startedAtIso: string;
};

type ProfilerStopResult = {
    profile: unknown;
};

export class ExtensionHostProfiler {
    private activeProfile: ActiveProfile | undefined;

    public async start(label: string): Promise<{ label: string; startedAt: string }> {
        const trimmedLabel = label.trim();
        if (!trimmedLabel) {
            throw new Error('CPU profile label is required.');
        }
        if (this.activeProfile) {
            throw new Error(`CPU profile already running: ${this.activeProfile.label}`);
        }

        const session = new inspector.Session();
        session.connect();
        await this.post(session, 'Profiler.enable');
        await this.post(session, 'Profiler.start');

        this.activeProfile = {
            label: trimmedLabel,
            session,
            startedAtMs: Date.now(),
            startedAtIso: new Date().toISOString(),
        };

        return {
            label: trimmedLabel,
            startedAt: this.activeProfile.startedAtIso,
        };
    }

    public async stop(outputPath: string): Promise<{ label: string; startedAt: string; endedAt: string; durationMs: number; outputPath: string }> {
        const activeProfile = this.activeProfile;
        if (!activeProfile) {
            throw new Error('No CPU profile is currently running.');
        }

        const trimmedOutputPath = outputPath.trim();
        if (!trimmedOutputPath) {
            throw new Error('CPU profile output path is required.');
        }

        this.activeProfile = undefined;

        try {
            const result = await this.post<ProfilerStopResult>(activeProfile.session, 'Profiler.stop');
            await this.post(activeProfile.session, 'Profiler.disable');
            await fs.mkdir(path.dirname(trimmedOutputPath), { recursive: true });
            await fs.writeFile(trimmedOutputPath, JSON.stringify(result.profile), 'utf8');

            return {
                label: activeProfile.label,
                startedAt: activeProfile.startedAtIso,
                endedAt: new Date().toISOString(),
                durationMs: Date.now() - activeProfile.startedAtMs,
                outputPath: trimmedOutputPath,
            };
        } finally {
            activeProfile.session.disconnect();
        }
    }

    public dispose(): void {
        if (!this.activeProfile) {
            return;
        }

        this.activeProfile.session.disconnect();
        this.activeProfile = undefined;
    }

    private post<T>(session: inspector.Session, method: string, params?: Record<string, unknown>): Promise<T> {
        return new Promise((resolve, reject) => {
            session.post(method, params ?? {}, (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve((result ?? {}) as T);
            });
        });
    }
}