#!/usr/bin/env bash
# UserPromptSubmit hook: scores each substantive prompt against CLAUDE.md Rule 6
# (specificity/constraints, examples/output format, decomposition/role framing) via a
# headless `claude -p` call, then injects the score + a gap-filled rewrite as
# additionalContext. Non-blocking: any failure here just means no context gets injected.
set -uo pipefail

# Recursion guard: the `claude -p` call below runs in this same project, so it would
# re-trigger this very hook on its own rubric text. Skip immediately when we're that call.
if [ -n "${PROMPT_QUALITY_EVAL_NESTED:-}" ]; then
  exit 0
fi

input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty')"

# Skip empty/trivial prompts (acks, "continue", typo fixes) so we don't spend a model
# call on every one-word reply.
word_count=$(printf '%s' "$prompt" | wc -w)
if [ -z "$prompt" ] || [ "$word_count" -lt 6 ]; then
  exit 0
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log_file="$script_dir/../prompt-eval.log"

rubric="You are a prompt-quality scorer. Score the USER_PROMPT below on three axes from CLAUDE.md Rule 6, each 1-5 (5 = best):
1. SPECIFICITY - are requirements/constraints/acceptance criteria clear?
2. EXAMPLES - was an input/output example or format/schema given or clearly implied?
3. DECOMPOSITION - if this is multi-step/cross-cutting, is it broken into steps/roles?
Then write REWRITE: the same prompt with any real gaps closed by explicitly stated
assumptions (never invented facts) - or the original prompt unchanged if there are no gaps.
Respond with ONLY this exact format, no other text:
SPECIFICITY: <1-5>
EXAMPLES: <1-5>
DECOMPOSITION: <1-5>
REWRITE: <rewritten prompt on one line>

USER_PROMPT:
$prompt"

result="$(PROMPT_QUALITY_EVAL_NESTED=1 claude -p "$rubric" --output-format text 2>/dev/null)"
if [ -z "$result" ]; then
  exit 0
fi

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  printf -- '--- %s ---\n' "$timestamp"
  printf 'PROMPT: %s\n' "$prompt"
  printf '%s\n\n' "$result"
} >> "$log_file" 2>/dev/null

context="[prompt-eval] Objective score of this prompt against CLAUDE.md Rule 6 (1-5 per axis) and a gap-filled rewrite follow. Use the rewrite only to close real gaps with stated assumptions - do not treat it as the literal request if it invented facts. Full log: .claude/prompt-eval.log

$result"

jq -n --arg ctx "$context" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'
