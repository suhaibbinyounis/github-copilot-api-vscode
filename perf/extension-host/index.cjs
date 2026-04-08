const fs = require('fs/promises');
const path = require('path');
const vscode = require('vscode');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, intervalMs = 100) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const result = await predicate();
    if (result) {
      return result;
    }
    await delay(intervalMs);
  }

  throw new Error(`Timed out after ${timeoutMs}ms.`);
}

async function getMetrics() {
  return vscode.commands.executeCommand('github-copilot-api-vscode.perf.getMetrics');
}

async function findExtension() {
  const requestedId = process.env.COPILOT_API_EXTENSION_ID;
  if (requestedId) {
    const byId = vscode.extensions.getExtension(requestedId);
    if (byId) {
      return byId;
    }
  }

  return vscode.extensions.all.find(extension => extension.packageJSON?.name === 'github-copilot-api-vscode');
}

async function run() {
  const resultFile = process.env.COPILOT_API_PERF_RESULTS_FILE;
  const cpuProfileFile = process.env.COPILOT_API_CPU_PROFILE_FILE;
  if (!resultFile || !cpuProfileFile) {
    throw new Error('COPILOT_API_PERF_RESULTS_FILE and COPILOT_API_CPU_PROFILE_FILE must be set.');
  }

  const extension = await findExtension();
  if (!extension) {
    throw new Error('Unable to locate extension under test.');
  }

  await extension.activate();

  await vscode.commands.executeCommand('github-copilot-api-vscode.perf.resetMetrics');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await delay(1200);

  await vscode.commands.executeCommand('github-copilot-api-vscode.perf.beginPhase', 'before-open-idle');
  await delay(1500);
  const beforeOpenIdle = await vscode.commands.executeCommand('github-copilot-api-vscode.perf.endPhase', 'before-open-idle');

  await vscode.commands.executeCommand('github-copilot-api-vscode.perf.startCpuProfile', 'dashboard-open');
  await vscode.commands.executeCommand('github-copilot-api-vscode.perf.beginPhase', 'open-dashboard');
  await vscode.commands.executeCommand('github-copilot-api-vscode.openDashboard');

  await waitFor(async () => {
    const report = await getMetrics();
    if (report.counters.dashboardCreates >= 1 || report.counters.dashboardReveals >= 1) {
      return report;
    }
    return undefined;
  }, 10000);

  await delay(2500);
  const openDashboard = await vscode.commands.executeCommand('github-copilot-api-vscode.perf.endPhase', 'open-dashboard');
  const cpuProfile = await vscode.commands.executeCommand('github-copilot-api-vscode.perf.stopCpuProfile', cpuProfileFile);

  await vscode.commands.executeCommand('github-copilot-api-vscode.perf.beginPhase', 'after-open-idle');
  await delay(1500);
  const afterOpenIdle = await vscode.commands.executeCommand('github-copilot-api-vscode.perf.endPhase', 'after-open-idle');
  const report = await getMetrics();

  const result = {
    generatedAt: new Date().toISOString(),
    cpuProfile,
    phases: {
      beforeOpenIdle,
      openDashboard,
      afterOpenIdle
    },
    report
  };

  await fs.mkdir(path.dirname(resultFile), { recursive: true });
  await fs.writeFile(resultFile, JSON.stringify(result, null, 2), 'utf8');
}

module.exports = { run };