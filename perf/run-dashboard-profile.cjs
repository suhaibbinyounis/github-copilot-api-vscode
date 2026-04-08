const fs = require('fs/promises');
const path = require('path');
const { runTests } = require('@vscode/test-electron');

const rootDir = path.resolve(__dirname, '..');

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(rootDir, 'perf-results', 'dashboard-profile', timestamp);
  const resultFile = path.join(outputDir, 'report.json');
  const cpuProfileFile = path.join(outputDir, 'dashboard-open.cpuprofile');

  await fs.mkdir(outputDir, { recursive: true });

  await runTests({
    version: 'insiders',
    extensionDevelopmentPath: rootDir,
    extensionTestsPath: path.join(rootDir, 'perf', 'extension-host', 'index.cjs'),
    launchArgs: [
      rootDir,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--user-data-dir', path.join(outputDir, 'user-data'),
      '--extensions-dir', path.join(outputDir, 'extensions')
    ],
    extensionTestsEnv: {
      COPILOT_API_EXTENSION_ID: 'suhaibbinyounis.github-copilot-api-vscode',
      COPILOT_API_PERF_RESULTS_FILE: resultFile,
      COPILOT_API_CPU_PROFILE_FILE: cpuProfileFile
    }
  });

  const report = JSON.parse(await fs.readFile(resultFile, 'utf8'));
  console.log(JSON.stringify({
    outputDir,
    cpuProfileFile,
    phases: report.phases,
    counters: report.report.counters
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});