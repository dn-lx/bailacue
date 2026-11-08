# Claude supervisor + Codex (subscription-only)

This supersedes the earlier GitHub Action that required OpenAI API billing. **Do not set API keys.**

## How it works
In a persistent GitHub Codespace Claude Code plans and independently reviews, while Codex CLI implements the changes using your existing **ChatGPT** sign-in. Automated checks run between passes, and Codex gets at most one correction pass. The script stops on failing checks or review; it never commits, pushes, merges, or deploys. ChatGPT Work is a separate tool and is not called directly by the script.

## Android setup
1. In the mobile browser, open this GitHub repository → Code → Codespaces → create/open a Codespace.
2. In its terminal install the two CLIs:
   npm install -g @openai/codex @anthropic-ai/claude-code
3. Sign in to your existing subscriptions:
   codex login --device-auth
   claude auth login
   codex login status
   claude auth status
   Claude must report authMethod = claude.ai; Codex must report ChatGPT login. If Claude browser login fails in a Codespace, try the Claude Code VS Code extension's browser code flow.
4. Remove OPENAI_API_KEY, CODEX_API_KEY, and ANTHROPIC_API_KEY from the shell environment before running. The script rejects any of these keys to prevent pay-as-you-go calls.
5. Install project dependencies with npm ci. Start on the integration branch with a clean working tree. Run a specific task:
   node scripts/claude-codex-supervisor.mjs "Fix [problem]. Acceptance: [concrete tests]."
6. Inspect .ai-review/ logs and git diff. Commit and share the result only after reviewing changes and following the branch/release rules below.

## Repository branch rules

BailaCue: make changes on an isolated working branch from develop; release to main separately.

## Charges and boundaries
- Codex uses existing ChatGPT subscription usage limits, not the OpenAI API.
- Claude Code uses Claude Pro/Max/Ultra subscription usage limits, not Anthropic API billing.
- GitHub Codespaces may charge for cloud compute/storage beyond included allowances. Stop it when unused.
- The environment must stay running while the script executes. There is no 24/7 background automation.
- Never share or commit ~/.codex/auth.json or Claude authentication caches; they contain sensitive tokens.
- A real subscribed login and complete agent run have not been tested yet; this is a staged implementation.

Official docs: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan and https://learn.chatgpt.com/docs/non-interactive-mode and https://code.claude.com/docs/en/cli-reference
