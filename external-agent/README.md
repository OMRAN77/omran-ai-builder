# Omran External Agent

Standalone control plane for project analysis, GitHub pull requests, preview deployments, and a Notion-backed knowledge base.

## Deployment model

The service is deployed separately from the main application. It uses:

1. Notion as the knowledge source.
2. A GitHub App for repository access.
3. Vercel scoped tokens for preview deployments.
4. A model-provider API for planning and execution.
5. Explicit approval before production deployment or any financial action.

## Required environment variables

```text
NOTION_TOKEN=
NOTION_DATABASE_ID=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_INSTALLATION_ID=
VERCEL_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=
AI_PROVIDER_API_KEY=
APPROVAL_SECRET=
```

Never commit real values. Store production values in the external service's deployment environment.

## Safety rules

- Preview deployment can be automated after tests pass.
- Production deployment requires an approval record.
- Payments are never executed automatically: the agent can draft a payment request only.
- Every task stores its plan, tools used, result, and approval status.
