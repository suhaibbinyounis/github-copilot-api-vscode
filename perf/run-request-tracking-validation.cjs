const fs = require('fs/promises');
const path = require('path');
const { runTests } = require('@vscode/test-electron');

const rootDir = path.resolve(__dirname, '..');

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(rootDir, 'perf-results', 'request-tracking', timestamp);
  const resultFile = path.join(outputDir, 'report.json');

  await fs.mkdir(outputDir, { recursive: true });

  await runTests({
    version: 'insiders',
    extensionDevelopmentPath: rootDir,
    extensionTestsPath: path.join(rootDir, 'perf', 'extension-host', 'request-tracking.cjs'),
    launchArgs: [
      rootDir,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--user-data-dir', path.join(outputDir, 'user-data'),
      '--extensions-dir', path.join(outputDir, 'extensions')
    ],
    extensionTestsEnv: {
      COPILOT_API_EXTENSION_ID: 'suhaibbinyounis.github-copilot-api-vscode',
      COPILOT_API_REQUEST_TRACKING_RESULT_FILE: resultFile,
      COPILOT_API_REQUEST_TRACKING_PORT: '39031'
    }
  });

  const report = JSON.parse(await fs.readFile(resultFile, 'utf8'));
  console.log(JSON.stringify({ outputDir, report }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});