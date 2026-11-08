# Claude supervisor + Codex implementer

## Purpose
Claude is the planning and independent-review supervisor. OpenAI Codex implements a requested task, and receives one automatic correction attempt if Claude or the deterministic checks find a problem. GitHub Actions runs the sequence. **ChatGPT Work remains a separate assistant** that can be used for research and connected-app workflows; this does not invoke ChatGPT Work programmatically.

## Current state
The configuration is installed but **not activated or tested**. It is manual-only; it does not monitor continuously, trigger itself, or automatically make production releases. Before the first run the workflow must exist on GitHub's default branch, and the owner must configure provider credentials. No service credentials are stored in Git.

## Setup (Android browser is sufficient)
1. Configure repository Actions secrets in Settings → Secrets and variables → Actions:
   - `OPENAI_API_KEY` (required for Codex GitHub Action)
   - `ANTHROPIC_API_KEY` **or** `CLAUDE_CODE_OAUTH_TOKEN` (required for Claude Code Action)
2. Review API pricing/budgets. These GitHub Actions use provider API/OAuth authentication; **ChatGPT Plus does not pay for OpenAI API usage**, and Claude subscription availability for OAuth depends on account support. Limit spending in provider settings.
3. After the workflow is approved and promoted through the existing repository release rules so it is on the *default branch*, open GitHub → Actions → **Claude supervises Codex** → Run workflow. Enter one specific task with acceptance criteria.
4. Check the Actions run, test logs and the resulting development branch or PR. Do not treat model review as a replacement for production verification.

## Repository-specific safety
- Integration branch: `develop`.
- Work mode: isolated task branch and PR targeting `develop` only; production is never targeted.
- Deterministic gate: `npm run typecheck && npm test && npm run lint`.
- Maximum two Codex implementation passes and two Claude reviews; a failed final gate stops publication.
- No production merge/deployment step. No silent privilege escalation or credential storage.
- If app changes require browser/device screenshots, provider setup or secrets, the run cannot prove those outcomes merely from unit tests.

## Important operational limits
- `workflow_dispatch` appears in GitHub Actions only after the workflow exists on the default branch; staging on a development branch alone is insufficient.
- GitHub Actions initiated by the default `GITHUB_TOKEN` may not trigger other Actions workflows on the generated pull request or push. Review the actual check runs; do not assume CI has executed.
- The official Codex action's `:workspace` permission profile restricts direct agent network access; install dependencies before invoking it.
- A workflow run is bounded; it cannot guarantee an unlimited unattended repair loop. Reopen or rerun after investigating a blocked gate.
- There is no public direct API in this setup for Claude to launch ChatGPT Work sessions. Codex in CI is the executor; ChatGPT Work can still be used separately.
- This is a starter configuration pending live validation with credentials, not a claim that autonomous operation is active.
