# CI/CD & Automation

This repository uses GitHub Actions to automate testing and build processes.

## Workflows

### 1. Build & Lint (`ci.yml`)
- **Trigger**: Pushes and Pull Requests to `main`.
- **Jobs**:
    - `build`: Runs `npm ci` followed by `npm run compile`.
    - `compile` executes:
        - `tsc --noEmit` (Type Checking)
        - `eslint src` (Linting)
        - `node esbuild.js` (Build verification)
- **Goal**: Ensures that no broken code is merged into `main`.

## Dependency Management

### Dependabot
- **Configuration**: `.github/dependabot.yml`
- **Schedule**:
    - `npm`: Weekly updates.
    - `github-actions`: Monthly updates.
- **Goal**: Keeps dependencies secure and up-to-date automatically.

## Issue Labels
We use standard labels to categorize issues:
- `bug` 🐛: Something isn't working.
- `enhancement` ✨: New feature requests.
- `documentation` 📚: Improvements to docs.
- `good first issue` 🚀: Good for newcomers.
