# Publishing Guide

This guide explains how to publish the `copilot-proxy` package to GitHub Packages.

## Prerequisites

- Maintainer access to the repository
- Package is configured to publish to GitHub Packages (npm registry)

## Publishing Process

The package is automatically published to GitHub Packages when a new release is created.

### Publishing via GitHub Release (Recommended)

1. **Update the version** in `proxy-server/package.json`:
   ```bash
   cd proxy-server
   npm version patch  # or minor, major
   ```

2. **Commit and push** the version change:
   ```bash
   git add package.json package-lock.json
   git commit -m "chore: bump version to v3.0.1"
   git push
   ```

3. **Create a new release** on GitHub:
   - Go to the repository on GitHub
   - Click "Releases" → "Draft a new release"
   - Click "Choose a tag" and create a new tag (e.g., `v3.0.1`)
   - Fill in the release title and description
   - Click "Publish release"

4. The GitHub Actions workflow will automatically:
   - Run tests
   - Build the package
   - Publish to GitHub Packages

### Manual Publishing via Workflow Dispatch

You can also manually trigger the publish workflow:

1. Go to "Actions" → "Publish Package"
2. Click "Run workflow"
3. Enter the tag name (e.g., `v3.0.1`)
4. Click "Run workflow"

## Installing from GitHub Packages

Users need to configure npm to use GitHub Packages for the `@vaibhavsing` scope:

1. **Create or edit** `~/.npmrc`:
   ```
   @vaibhavsing:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
   ```

2. **Install the package**:
   ```bash
   npm install @vaibhavsing/copilot-proxy
   ```

### Creating a GitHub Token

To install packages from GitHub Packages, users need a Personal Access Token with `read:packages` scope:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name (e.g., "npm packages")
4. Select the `read:packages` scope
5. Click "Generate token"
6. Copy the token and use it in your `~/.npmrc` file

## Publishing to npm Registry (Optional)

If you want to also publish to the public npm registry:

1. Update `proxy-server/package.json` to remove or modify `publishConfig`
2. Create a new workflow or modify the existing one to publish to npm
3. Add `NPM_TOKEN` secret to the repository settings
4. Update the workflow to use the npm registry

## Troubleshooting

### Package name conflicts

GitHub Packages requires scoped package names. If you encounter naming issues, ensure the package name in `package.json` includes the scope (e.g., `@vaibhavsing/copilot-proxy`).

### Authentication errors

Ensure that:
- The `GITHUB_TOKEN` has the correct permissions
- The repository settings allow GitHub Actions to create packages
- The package visibility settings are correct

### Build failures

The workflow runs all tests and checks before publishing. If publishing fails:
1. Check the GitHub Actions logs
2. Fix any failing tests or build issues
3. Create a new release or re-run the workflow
