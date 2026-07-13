export const meta = {
  name: 'team-task',
  description: 'Run the full EM -> specialist waves -> QA -> report multi-agent workflow (CLAUDE.md) for one non-trivial task that is not tracked as an OpenSpec slice',
  phases: [
    { title: 'Plan' },
    { title: 'Design Review' },
    { title: 'Implement' },
    { title: 'UX Review' },
    { title: 'QA' },
    { title: 'Report' },
  ],
}

const MAX_QA_RETRIES = 2

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    uiTouched: { type: 'boolean' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          role: { type: 'string', enum: ['database', 'backend', 'frontend', 'ux', 'shared', 'other'] },
          filesHint: { type: 'string' },
          wave: { type: 'integer' },
        },
        required: ['id', 'title', 'role', 'filesHint', 'wave'],
      },
    },
    waveCount: { type: 'integer' },
  },
  required: ['uiTouched', 'tasks', 'waveCount'],
}

const QA_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    failedTaskIds: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['pass', 'failedTaskIds', 'notes'],
}

const UX_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
        },
        required: ['summary', 'severity'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['findings', 'notes'],
}

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'string' },
  },
  required: ['summary', 'filesChanged', 'assumptions'],
}

const QUALITY_BAR = `Quality bar (non-negotiable): no duplicated code, strong typing (no "any" escapes), proper error/loading/empty-state handling where applicable, input validation at boundaries, accessible & responsive UI where applicable, secure implementation (no injection, no leaked secrets, tenant-scoped queries), no dead code, minimal surgical diffs matching the existing code style exactly. Backend Engineers never edit the Prisma schema directly — coordinate through a Database Engineer task instead. Frontend Engineers never touch backend logic. Database Engineers never implement frontend or business logic.`

const ROLE_NAME = {
  database: 'Database Engineer',
  backend: 'Backend Engineer',
  frontend: 'Frontend Engineer',
  ux: 'Frontend Engineer',
  shared: 'Shared/Platform Engineer',
  other: 'Engineer',
}

const parsedArgs = typeof args === 'string' ? { task: args } : args
const { task } = parsedArgs

phase('Plan')
const plan = await agent(
  `You are the Engineering Manager for smartEnterprise, a multi-tenant enterprise HR/ops platform (React/TS frontend, Node/Express/Prisma backend, pnpm monorepo).

The user wants this task implemented (it is NOT tracked as an OpenSpec slice — treat the description below as the full spec):

"""
${task}
"""

1. Read enough of the current codebase (git status/diff for existing in-progress work, relevant modules under apps/api/src or apps/web/src, PRD.md sections if the task touches a documented feature/form/workflow) to scope this accurately.
2. Break the task into the smallest set of subtasks needed. For each: id (e.g. "T1"), title (one line), role (database | backend | frontend | ux | shared | other), filesHint (best-guess concrete paths/globs it will touch), and a wave number.
3. Wave rule: wave 0 = tasks with no dependency on any other task here. Wave N = tasks that depend only on wave <N output. Two tasks share a wave ONLY if they touch disjoint files and have no data dependency — when unsure, put a task in a later wave rather than risk a false-parallel conflict. A schema change (role: database) must be in an earlier wave than any backend task consuming it.
4. Set uiTouched = true if any task's role is frontend or ux.
5. If the task is trivial enough that this whole ceremony is overkill (a true one-liner), still return it as a single wave-0 task — the caller decides whether to route trivial work here at all.

${QUALITY_BAR}`,
  { schema: PLAN_SCHEMA, label: 'EM: plan task' }
)

log(`Plan: ${plan.tasks.length} task(s) across ${plan.waveCount} wave(s)${plan.uiTouched ? ' — UI touched, running design review' : ''}`)

let designNotes = ''
if (plan.uiTouched) {
  phase('Design Review')
  const uiTasks = plan.tasks.filter(t => t.role === 'frontend' || t.role === 'ux')
  designNotes = await agent(
    `Fetch the relevant markup for this task from the Claude Design project via the DesignSync tool: get_file, projectId "053346e7-8a9a-4991-b4a0-26705793f93b", file "Smart Enterprise - Prototype.dc.html".

The frontend/UX subtasks are:
${uiTasks.map(t => `- ${t.id}: ${t.title} (${t.filesHint})`).join('\n')}

Report back a concise summary of the relevant markup, structure, and design tokens (colors, spacing, interactive states) for these tasks — enough detail that another engineer could implement pixel-accurate, behavior-accurate UI from your summary alone.`,
    { label: 'Design reference' }
  )
}

phase('Implement')
const wavesByNumber = {}
for (const t of plan.tasks) {
  if (!wavesByNumber[t.wave]) wavesByNumber[t.wave] = []
  wavesByNumber[t.wave].push(t)
}
const waveNumbers = Object.keys(wavesByNumber).map(Number).sort((a, b) => a - b)

function implementPrompt(t, waveMates, retryContext) {
  return `You are the ${ROLE_NAME[t.role]} on smartEnterprise. Implement this subtask of the requested task:

"""
${task}
"""

Subtask ${t.id}: ${t.title}
Likely files: ${t.filesHint}
${designNotes ? `\nDesign reference (from the design-review pass):\n${designNotes}\n` : ''}
Running in parallel with you this wave (disjoint file scope — if you find you need to touch one of their files, STOP and report the conflict instead of proceeding): ${waveMates.length ? waveMates.map(m => `${m.id} (${m.filesHint})`).join(', ') : 'none'}.

${QUALITY_BAR}
${retryContext ? `\nThis is a retry.\n${retryContext}\nFix the actual defect — do not just silence the check.` : ''}

Make the code changes for this subtask only. Report a summary of what you changed and why, the exact list of files you touched, and any assumptions you made.`
}

const results = []
for (const w of waveNumbers) {
  const waveTasks = wavesByNumber[w]
  const waveResults = await parallel(
    waveTasks.map(t => () => {
      const opts = { phase: 'Implement', label: `${t.role}:${t.id}`, schema: IMPLEMENT_SCHEMA }
      return agent(implementPrompt(t, waveTasks.filter(x => x.id !== t.id), null), opts).then(output => ({ task: t, output }))
    })
  )
  results.push(...waveResults.filter(Boolean))

  if (waveTasks.length > 1) {
    const fileOwners = {}
    for (const r of waveResults.filter(Boolean)) {
      for (const f of r.output.filesChanged || []) {
        ;(fileOwners[f] ||= []).push(r.task.id)
      }
    }
    const conflictedIds = [...new Set(Object.values(fileOwners).filter(o => o.length > 1).flat())]
    if (conflictedIds.length) {
      log(`Wave ${w}: file overlap detected for task(s) ${conflictedIds.join(', ')} — re-running sequentially to reconcile`)
      for (const id of conflictedIds) {
        const t = waveTasks.find(x => x.id === id)
        const overlappingFiles = Object.entries(fileOwners).filter(([, o]) => o.includes(id) && o.length > 1).map(([f]) => f)
        const opts = { phase: 'Implement', label: `${t.role}:${t.id}:conflict-retry`, schema: IMPLEMENT_SCHEMA }
        const retryOutput = await agent(
          implementPrompt(t, waveTasks.filter(x => x.id !== t.id), `A parallel teammate this wave also touched: ${overlappingFiles.join(', ')}. Re-inspect the current state of these files (another agent already edited them) and reconcile your change with what's actually there now — do not blindly re-apply your original diff.`),
          opts
        )
        const idx = results.findIndex(x => x.task.id === t.id)
        if (idx >= 0) results[idx] = { task: t, output: retryOutput }
      }
    }
  }
}

let uxNotes = ''
if (plan.uiTouched) {
  phase('UX Review')
  const uxReview = await agent(
    `You are the UX/UI Engineer on smartEnterprise, reviewing (not implementing) the UI changes just made for this task:

"""
${task}
"""

Subtasks implemented: ${plan.tasks.filter(t => t.role === 'frontend' || t.role === 'ux').map(t => `${t.id}: ${t.title}`).join(', ')}

Inspect the actual diff (git status / git diff) against the design reference below (if present) and general visual hierarchy, accessibility, responsiveness, and state-coverage (loading/empty/error/success) standards. You are reviewing only — do not edit any files.
${designNotes ? `\nDesign reference:\n${designNotes}\n` : ''}
This is advisory, not a blocking gate — report findings but do not fail the task over them.`,
    { schema: UX_SCHEMA, phase: 'UX Review', label: 'UX review' }
  )
  uxNotes = uxReview.notes || ''
  if (uxReview.findings?.length) {
    log(`UX review: ${uxReview.findings.length} advisory finding(s) (see final report)`)
  }
}

phase('QA')
let qaAttempt = 0
let autoQA = null
let reasoningQA = null
let finalPass = false

while (qaAttempt <= MAX_QA_RETRIES) {
  const qaPair = await parallel([
    () => agent(
      `Run automated verification for this task on the smartEnterprise monorepo (pnpm workspaces).
1. Run "pnpm typecheck" and "pnpm build" from the repo root.
2. For any workspace package touched by this task's subtasks that has a "test" script in its package.json (check packages/shared, apps/api, apps/web), run it too (e.g. "pnpm --filter @se/shared test").
3. Report pass=true only if every command above exits clean.
4. If something fails, map each failure to the subtask id(s) whose filesHint most plausibly caused it (best-effort file-path matching), and include the raw error text in notes.

Subtasks:
${plan.tasks.map(t => `${t.id}: ${t.title} (${t.filesHint})`).join('\n')}`,
      { phase: 'QA', label: `automated checks (attempt ${qaAttempt + 1})`, schema: QA_SCHEMA }
    ),
    () => agent(
      `You are the QA Engineer for smartEnterprise. Adversarially validate the implementation of this task — do not assume the code works, and do not edit any files:

"""
${task}
"""

Subtasks implemented:
${plan.tasks.map(t => `${t.id}: ${t.title} (${t.filesHint})`).join('\n')}

1. Inspect the actual diff (git status / git diff) against the task description above — functional correctness, edge cases, tenant-scoping/permission checks, error/loading/empty states, validation, no dead code, no leftover TODOs.
2. Report pass=true only if the task's intent is actually met by the code as written.
3. On failure, list the specific subtask id(s) that failed and exactly what's wrong (repro steps / expected vs actual) in notes.`,
      { phase: 'QA', label: `QA engineer (attempt ${qaAttempt + 1})`, schema: QA_SCHEMA }
    ),
  ])
  autoQA = qaPair[0]
  reasoningQA = qaPair[1]

  finalPass = Boolean(autoQA && autoQA.pass && reasoningQA && reasoningQA.pass)
  if (finalPass) break

  const failedIds = [...new Set([...((autoQA && autoQA.failedTaskIds) || []), ...((reasoningQA && reasoningQA.failedTaskIds) || [])])]
  qaAttempt++
  if (!failedIds.length || qaAttempt > MAX_QA_RETRIES) break

  log(`QA failed (attempt ${qaAttempt}/${MAX_QA_RETRIES}): re-running subtask(s) ${failedIds.join(', ')}`)
  const retryContext = `Automated checks: ${autoQA ? autoQA.notes : 'n/a'}\nQA engineer: ${reasoningQA ? reasoningQA.notes : 'n/a'}`
  const retryTasks = plan.tasks.filter(t => failedIds.includes(t.id))
  const retryResults = await parallel(
    retryTasks.map(t => () => {
      const opts = { phase: 'Implement', label: `retry:${t.id}`, schema: IMPLEMENT_SCHEMA }
      return agent(implementPrompt(t, retryTasks.filter(x => x.id !== t.id), retryContext), opts).then(output => ({ task: t, output }))
    })
  )
  for (const r of retryResults.filter(Boolean)) {
    const idx = results.findIndex(x => x.task.id === r.task.id)
    if (idx >= 0) results[idx] = r
    else results.push(r)
  }
}

phase('Report')
const report = await agent(
  `You are the Engineering Manager closing out this task on smartEnterprise:

"""
${task}
"""

Subtasks in scope:
${plan.tasks.map(t => `${t.id}: ${t.title} (role: ${t.role})`).join('\n')}

Final QA status: ${finalPass ? 'PASS' : 'FAIL'}
Automated checks notes: ${autoQA ? autoQA.notes : 'n/a'}
QA engineer notes: ${reasoningQA ? reasoningQA.notes : 'n/a'}
UX review notes (advisory): ${uxNotes || 'n/a'}

Specialist output per subtask:
${results.map(r => `--- ${r.task.id} (${r.task.role}) ---\n${r.output.summary}\nFiles changed: ${(r.output.filesChanged || []).join(', ') || 'none reported'}\nAssumptions: ${r.output.assumptions || 'none'}`).join('\n\n')}

Produce the final report in this exact structure (per CLAUDE.md): Executive Summary, Specialist Contributions (per role involved), Files Changed (every file), Risks, Recommendations (fold in any advisory UX findings here), Final QA Status (PASS/FAIL), Confidence Score (1-100%).

Return the final report as your response.`,
  { label: 'EM: final report' }
)

log(finalPass ? 'Task complete.' : 'Task QA FAILED after retries.')

return { task, finalPass, report }
