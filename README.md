# paperclip-github-ship

GitHub workflow, pull request, and merge helper plugin for Paperclip.

## Current Scope

This package is a Paperclip plugin scaffold for GitHub-oriented engineering
flows that sit outside Paperclip core:

- store per-company GitHub repository settings
- preview a deploy-oriented GitHub Actions workflow file
- create pull requests through the GitHub REST API
- merge pull requests through the GitHub REST API
- expose a small dashboard, issue-detail, and settings UI surface

The current implementation is intentionally thin. It is meant to be the
starting point for a real GitHub integration plugin, not the finished product.

## Actions

- `save-repo-config`
- `preview-deploy-workflow`
- `create-pr`
- `merge-pr`

`create-pr` and `merge-pr` support dry-run mode by default. Set `execute: true`
and provide a configured GitHub token secret ref to perform the live API call.

## Config Shape

Store per-company config with `save-repo-config`:

```json
{
  "companyId": "<company-id>",
  "owner": "acme",
  "repo": "platform",
  "baseBranch": "main",
  "deployBranch": "main",
  "tokenRef": "github_pat_secret_ref",
  "workflowName": "Deploy",
  "nodeVersion": "20",
  "deployHostSecretName": "DEPLOY_HOST",
  "deployUserSecretName": "DEPLOY_USER",
  "deployKeySecretName": "DEPLOY_SSH_KEY",
  "deployPathSecretName": "DEPLOY_PATH",
  "deployScriptSecretName": "DEPLOY_SCRIPT"
}
```

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Install Into Paperclip

```bash
curl -X POST http://127.0.0.1:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName":"/absolute/path/to/paperclip-github-ship","isLocalPath":true}'
```

## Publishable Identity

- npm package: `@picory/paperclip-github-ship`
- plugin id: `picory.paperclip-github-ship`
- repository: [picory/paperclip-github-ship](https://github.com/picory/paperclip-github-ship)
