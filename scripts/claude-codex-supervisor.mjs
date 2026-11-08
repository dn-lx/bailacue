#!/usr/bin/env node
// Subscription-only orchestration for a trusted persistent GitHub Codespace.
// Claude Code plans and reviews; Codex CLI edits. No API keys or automatic pushes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const configs = {
  pagechime: { integration: 'develop', production: 'main', direct: true, checks: 'npm run check' },
  bailacue: { integration: 'develop', production: 'main', direct: false, checks: 'npm run typecheck && npm test && npm run lint' },
  lexora: { integration: 'dev', production: 'prod', direct: false, checks: 'npm test && npm run typecheck && npm run check:docs' }
};
const project = process.env.AI_PROJECT || 'bailacue';
const cfg = configs[project];
const task = process.argv.slice(2).join(' ').trim();
const dir = join(process.cwd(), '.ai-review');
function stop(message) { console.error('BLOCKED: ' + message); process.exit(1); }
function run(binary, args, opts = {}) {
  const p = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
  if (p.error || p.status !== 0) stop(binary + ' failed: ' + (p.error?.message || p.stderr || 'exit ' + p.status).slice(-900));
  return p.stdout || '';
}
function git(...args) { return run('git', args).trim(); }
function save(name, content) { writeFileSync(join(dir, name), content); }
function supervisor(prompt, json = false) {
  const args = ['-p', '--tools', 'Read,Glob,Grep', '--disallowedTools', 'mcp__*',
    '--permission-prompts', 'none', '--max-turns', '10', '--output-format', json ? 'json' : 'text'];
  if (json) args.push('--json-schema', JSON.stringify({
    type: 'object',
    properties: { verdict: { type: 'string', enum: ['PASS', 'FIX'] }, feedback: { type: 'string' } },
    required: ['verdict', 'feedback'], additionalProperties: false
  }));
  const result = run('claude', [...args, prompt]);
  if (!json) return result;
  let data;
  try { const parsed = JSON.parse(result); data = parsed.structured_output || parsed; }
  catch { stop('Claude did not return a valid JSON review.'); }
  if (!['PASS', 'FIX'].includes(data?.verdict) || typeof data.feedback !== 'string')
    stop('Claude did not return a valid review verdict.');
  return data;
}
function verify() {
  const p = spawnSync('bash', ['-lc', cfg.checks], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (p.error) stop('Verification could not start: ' + p.error.message);
  const output = (p.stdout || '') + '\n' + (p.stderr || '');
  save('checks.log', output);
  console.log('Verification: ' + (p.status === 0 ? 'PASS' : 'FAIL'));
  console.log(output.slice(-2300));
  return p.status === 0;
}

if (!cfg || !task) stop('Provide AI_PROJECT and a task with acceptance criteria.');
for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY'])
  if (process.env[key]) stop(key + ' exists: unset API keys before subscription-only operation.');
const claudeStatus = JSON.parse(run('claude', ['auth', 'status']));
if (claudeStatus.authMethod !== 'claude.ai') stop('Claude is not authenticated with a Claude subscription.');
if (!/chatgpt/i.test(run('codex', ['login', 'status'])))
  stop('Codex is not signed in with ChatGPT; run codex login --device-auth.');
if (git('status', '--porcelain')) stop('Working tree must be clean; commit or stash existing work first.');
let branch = git('branch', '--show-current');
if (branch === cfg.production) stop('Cannot run on the production branch.');
if (cfg.direct) {
  if (branch !== cfg.integration) stop('Current policy requires direct work on ' + cfg.integration);
} else if (branch === cfg.integration) {
  branch = 'chore/claude-codex-' + Date.now();
  run('git', ['switch', '-c', branch]);
}
mkdirSync(dir, { recursive: true });
appendFileSync(git('rev-parse', '--git-path', 'info/exclude'), '\n.ai-review/\n');

console.log('Claude supervises Codex using subscription logins. Branch: ' + branch);
const plan = supervisor('Read AGENTS.md and relevant project rules. Plan the following task with acceptance criteria, risks, and verification. You must not change any files. TASK:\n' + task);
if (!plan.trim()) stop('Claude returned an empty plan.');
save('plan.md', plan);
let implementation = 'Follow the owner task and Claude plan; inspect AGENTS.md and project policy. Implement with tests. Do not commit, push, deploy, merge, or touch credentials. TASK:\n' + task + '\nCLAUDE PLAN:\n' + plan;
for (let attempt = 1; attempt <= 2; attempt++) {
  console.log('Codex implementation attempt ' + attempt + ' of 2');
  run('codex', ['exec', '--sandbox', 'workspace-write', '-'], {
    input: implementation, stdio: ['pipe', 'inherit', 'inherit']
  });
  const ok = verify();
  run('git', ['add', '-N', '.']);
  const diff = git('diff', '--no-ext-diff', '--binary', 'HEAD');
  if (!diff) stop('Codex produced no changes.');
  if (diff.length > 140000) stop('Diff is too large for this bounded review; inspect manually.');
  save('changes.diff', diff);
  const prompt = 'Independently review the final candidate in read-only mode. Follow REVIEW.md if present. A failing test always requires FIX. Check the original request, tests, security and diff. Respond with PASS or FIX and concise, actionable feedback. Do not change any files.\nTASK:\n' + task + '\nPLAN:\n' + plan + '\nTESTS PASS: ' + ok + '\nTEST LOG:\n' + readFileSync(join(dir, 'checks.log'), 'utf8').slice(-10000) + '\nDIFF:\n' + diff;
  const review = supervisor(prompt, true);
  save('review-' + attempt + '.json', JSON.stringify(review, null, 2));
  console.log('Claude review: ' + review.verdict);
  if (ok && review.verdict === 'PASS') {
    console.log('PASS: implementation and independent review. Local changes remain uncommitted.');
    console.log('Review .ai-review/ and git diff; publish only under repository policy.');
    process.exit(0);
  }
  if (attempt === 2) stop('Still failing after one correction attempt. Review .ai-review.');
  implementation = 'Correct the confirmed review findings and failed tests without unrelated changes. Follow AGENTS.md. Do not commit, push, merge, deploy or change secrets. TASK:\n' + task + '\nCLAUDE FEEDBACK:\n' + review.feedback + '\nTEST LOG:\n' + readFileSync(join(dir, 'checks.log'), 'utf8').slice(-10000);
}
