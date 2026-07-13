---
name: team-task
description: Run CLAUDE.md's full Multi-Agent Engineering Workflow (EM -> specialist waves -> QA -> report) for one non-trivial task that is NOT tracked as an OpenSpec slice — via the team-task Workflow. Use for ad-hoc feature requests, bug fixes, or any other non-trivial task the user hands you directly, instead of manually role-playing EM/specialists/QA inline. For OpenSpec slices, use run-slice instead.
---

Implement one non-trivial, non-OpenSpec task via the `team-task` Workflow instead of implementing it directly.

**Input**: a free-text description of the task (e.g. "Add a status filter dropdown to the requests list page" or "Fix the self-approval bug on the leave request flow").

**Steps**

1. **Trivial-task carve-out first**
   - If this is genuinely a one-liner (typo fix, obvious single-line change), CLAUDE.md's own carve-out applies — just make the change directly and skip this skill entirely.
   - If the task is already tracked as an OpenSpec slice (has a change name + slice number), use `run-slice` instead, not this skill.

2. **Announce and run**
   - Announce: "Running this via the team-task workflow (EM -> specialist waves -> QA -> report)."
   - Call `Workflow` with `name: 'team-task'` and `args: { task: '<the task description, as given or lightly clarified>' }`.
   - The workflow runs in the background. Tell the user it's running and that you'll report when it completes. Do not fabricate progress, results, or QA status before the completion notification arrives.

3. **On completion**
   - Relay the workflow's final report verbatim (Executive Summary / Specialist Contributions / Files Changed / Risks / Recommendations / Final QA Status / Confidence Score).
   - If Final QA Status is FAIL after retries, say so plainly and show what's still broken. Do not automatically start a second workflow run — ask the user how they want to proceed (retry, hand-fix, or hand off to a specific specialist).

**Guardrails**
- Once this skill is invoked, don't hand-implement the task yourself — the workflow does the planning, implementation, QA, and report. Your job here is: apply the trivial-task carve-out check, announce, invoke the workflow, and relay its result.
- Never guess or predict the workflow's findings while it is still running.
- This skill exists specifically to close the gap where non-OpenSpec work had no scripted enforcement of CLAUDE.md's Multi-Agent Engineering Workflow — prefer it over ad-hoc inline role-playing for any non-trivial task.
