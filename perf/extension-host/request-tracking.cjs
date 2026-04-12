const fs = require('fs/promises');
const vscode = require('vscode');
const TEST_PORT = Number(process.env.COPILOT_API_REQUEST_TRACKING_PORT || '39031');

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
  const extension = await findExtension();
  if (!extension) {
    throw new Error('Unable to locate extension under test.');
  }

  await extension.activate();

  const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
  await config.update('showNotifications', false, vscode.ConfigurationTarget.Global);
  await config.update('host', '127.0.0.1', vscode.ConfigurationTarget.Global);
  await config.update('port', TEST_PORT, vscode.ConfigurationTarget.Global);

  const result = await vscode.commands.executeCommand('github-copilot-api-vscode.perf.validateRequestTracking', 25);

  const resultFile = process.env.COPILOT_API_REQUEST_TRACKING_RESULT_FILE;
  if (resultFile) {
    await fs.mkdir(require('path').dirname(resultFile), { recursive: true });
    await fs.writeFile(resultFile, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(JSON.stringify(result, null, 2));
}

module.exports = { run };