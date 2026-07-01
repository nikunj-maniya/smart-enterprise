---
description: Stage all changes and commit locally with a generated message
---

Commit the current working-tree changes to git. Steps:

1. Run `git status` and `git diff` (staged + unstaged) to see what changed.
2. Stage all changes with `git add -A`.
3. Write a concise Conventional Commits message (e.g. `feat:`, `fix:`, `chore:`, `docs:`) summarizing the actual diff — one subject line, plus a short body only if the change needs explanation.
4. If currently on the `main` branch, do NOT commit directly — tell the user and stop.
5. Commit locally. Do NOT push.
6. End the commit message with:
   ```
   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   ```
7. After committing, print the resulting `git log -1 --oneline`.

Constraints:
- Commit only. Never push.
- Never use `git commit -a` blindly; stage explicitly.
- If there are no changes to commit, say so and stop.
