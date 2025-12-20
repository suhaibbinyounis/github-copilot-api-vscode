import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export async function createDesktopShortcut() {
    console.log('Creating desktop shortcut...');
    const osType = os.platform();
    if (osType !== 'darwin') {
        vscode.window.showErrorMessage('Desktop shortcut creation is currently only supported on macOS.');
        return;
    }

    try {
        const homeDir = os.homedir();
        const desktopPath = path.join(homeDir, 'Desktop');

        // Define the deep link URL
        // Format: vscode://<publisher>.<extension>/<path>
        const linkUrl = 'vscode://suhaibbinyounis.github-copilot-api-vscode/dashboard';

        // Create a .command file (Shell Script) for macOS
        // This is more reliable for opening custom URI schemes than .webloc
        const shortcutContent = `#!/bin/bash
open "${linkUrl}"
`;

        const shortcutPath = path.join(desktopPath, 'Copilot Dashboard.command');

        await fs.promises.writeFile(shortcutPath, shortcutContent, 'utf8');

        // Make it executable
        await fs.promises.chmod(shortcutPath, 0o755);

        vscode.window.showInformationMessage(`SHORTCUT CREATED: "Copilot Dashboard.command" has been added to your Desktop.`);

        console.log(`Shortcut created at ${shortcutPath}`);
    } catch (error) {
        console.error('Failed to create shortcut:', error);
        vscode.window.showErrorMessage(`Failed to create desktop shortcut: ${error instanceof Error ? error.message : String(error)}`);
    }
}
