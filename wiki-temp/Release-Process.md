# Release Process

This repository uses **automated releases**.

## How to Release 🚀

1.  **Ensure CI Passes**: Make sure the `CI` workflow on `main` is green.
2.  **Tag a Version**: Push a git tag starting with `v` (e.g., `v1.0.0`).
    ```bash
    git tag v1.0.0
    git push origin v1.0.0
    ```
3.  **Wait**: The `release` workflow will run automatically.
    - It builds the extension.
    - It publishes it to the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=SuhaibBinYounis.github-copilot-api-vscode).
    - It creates a GitHub Release with the `.vsix` file attached.

## Setup Requirements

To enable this, the following **Repository Secret** must be configured in Settings:
- `VSCE_PAT`: A Personal Access Token from the VS Code Marketplace with `publish` permissions.
