---
name: run-slice
description: Implement one OpenSpec slice by running the multi-agent slice-runner Workflow — fans work out to parallel specialist subagents per dependency wave, QA-gates it two ways (automated checks + a QA agent), and updates tasks.md on pass. Use when the user gives a slice number to implement (e.g. "do Slice 5", "/run-slice form-engine 5").
---

Implement one OpenSpec slice via the `slice-runner` Workflow instead of implementing it directly.

**Input**: `<change> <slice-number>` (e.g. `form-engine 5`). Slice number is required. Change name is optional — infer it the same way `openspec-apply-change` does.

**Steps**

1. **Resolve the change name**
   - If given, use it.
   - Otherwise infer from conversation context.
   - If ambiguous, run `openspec list` and ask which change in plain text — do not use a pick-list.
   - Announce: "Running Slice `<N>` of `<change>` via slice-runner."

2. **Sanity-check the slice exists**
   - Grep `openspec/changes/<change>/tasks.md` for the literal marker `_(Slice <N>)_`.
   - If nothing matches, report that and stop — do not invoke the workflow on an empty slice.

3. **Run the workflow**
   - Call `Workflow` with `name: 'slice-runner'` and `args: { change: '<change>', slice: <N> }` (slice as a number, not a string).
   - The workflow runs in the background. Tell the user it's running and that you'll report when it completes. Do not fabricate progress, results, or QA status before the completion notification arrives.

4. **On completion**
   - Relay the workflow's final report verbatim (Executive Summary / Specialist Contributions / Files Changed / Risks / Recommendations / Final QA Status / Confidence Score).
   - If the workflow returned `status: 'no-tasks'`, tell the user no tasks are tagged for that slice and stop.
   - If Final QA Status is FAIL after retries, say so plainly and show what's still broken. Do not automatically start a second workflow run — ask the user how they want to proceed (retry, hand-fix, or hand off to a specific specialist).

**Guardrails**
- Once this skill is invoked, don't hand-implement the slice yourself — the workflow does the implementation, QA, and the `tasks.md` checkbox update. Your job here is: resolve the change name, sanity-check the slice, invoke the workflow, and relay its result.
- Never guess or predict the workflow's findings while it is still running.
