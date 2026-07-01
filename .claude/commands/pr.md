---
description: Run checks (types, lint, vulnerabilities, build), then push and open a PR
---

Validate the current branch and open a pull request. Run the checks FIRST; only create the PR if they all pass.

## 1. Preflight
- Run `git status`. If there are uncommitted changes, tell the user to run `/commit` first and stop.
- Run `git branch --show-current`. If on `main`, stop and tell the user to switch to a feature branch (never open a PR from `main`).

## 2. Checks (run all; collect every failure before reporting)
Run these from the repo root:
- **Type errors:** `pnpm typecheck`
- **Lint / code errors:** `pnpm lint`
- **Vulnerabilities:** `pnpm audit --audit-level=high`
- **Build:** `pnpm build`

> Note: this repo has no test script. If one is added later, run it here too.

If ANY check fails:
- Print a short summary of each failure (which check, key error lines).
- Do NOT create the PR. Stop and let the user fix the issues.

## 3. Create the PR (only if all checks pass)
- Push the current branch: `git push -u origin HEAD`.
- Create the PR with `gh pr create`:
  - Title: concise summary of the branch's changes.
  - Body: what changed + why, and a checklist showing the checks that passed (types, lint, audit, build).
  - End the body with:
    ```
    🤖 Generated with [Claude Code](https://claude.com/claude-code)
    ```
- Print the PR URL that `gh` returns.

## Constraints
- Never open a PR if any check failed.
- Never open a PR from `main`.
- Report check output faithfully — if something failed, say so with the output; do not claim success on a skipped or failed step.
