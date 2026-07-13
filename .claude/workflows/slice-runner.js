export const meta = {
  name: 'slice-runner',
  description: 'Implement one OpenSpec slice via parallel specialist subagents per dependency wave, QA-gated two ways, updating tasks.md on pass',
  phases: [
    { title: 'Plan' },
    { title: 'Design Review' },
    { title: 'Implement' },
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
          role: { type: 'string', enum: ['database', 'backend', 'frontend', 'shared', 'ux', 'other'] },
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

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { change, slice } = parsedArgs

phase('Plan')
const plan = await agent(
  `You are the Engineering Manager for smartEnterprise, a multi-tenant enterprise HR/ops platform (React/TS frontend, Node/Express/Prisma backend, pnpm monorepo).

The user wants Slice ${slice} of the OpenSpec change "${change}" implemented.

1. Read openspec/changes/${change}/tasks.md and extract every task line carrying the literal marker "_(Slice ${slice})_".
2. Read openspec/changes/${change}/proposal.md, openspec/changes/${change}/design.md (if it exists), and the spec deltas under openspec/changes/${change}/specs/ to understand acceptance criteria for those tasks.
3. For each task assign: id (its task number, e.g. "5.1"), title (one line), role (database | backend | frontend | shared | ux | other), filesHint (best-guess concrete paths/globs it will touch), and a wave number.
4. Wave rule: wave 0 = tasks with no dependency on any other task in this slice. Wave N = tasks that depend only on wave <N output. Two tasks share a wave ONLY if they touch disjoint files and have no data dependency — when unsure, put a task in a later wave rather than risk a false-parallel conflict.
5. Set uiTouched = true if any task's role is frontend or ux.

${QUALITY_BAR}

If the marker "_(Slice ${slice})_" matches nothing in tasks.md, return an empty tasks array.`,
  { schema: PLAN_SCHEMA, label: 'EM: plan slice' }
)

if (!plan.tasks.length) {
  log(`No tasks tagged _(Slice ${slice})_ found in openspec/changes/${change}/tasks.md`)
  return { status: 'no-tasks', change, slice }
}

log(`Plan: ${plan.tasks.length} task(s) across ${plan.waveCount} wave(s)${plan.uiTouched ? ' — UI touched, running design review' : ''}`)

let designNotes = ''
if (plan.uiTouched) {
  phase('Design Review')
  const uiTasks = plan.tasks.filter(t => t.role === 'frontend' || t.role === 'ux')
  designNotes = await agent(
    `Fetch the relevant markup for this OpenSpec slice from the Claude Design project via the DesignSync tool: get_file, projectId "053346e7-8a9a-4991-b4a0-26705793f93b", file "Smart Enterprise - Prototype.dc.html".

The frontend/UX tasks in this slice are:
${uiTasks.map(t => `- ${t.id}: ${t.title} (${t.filesHint})`).join('\n')}

Report back a concise summary of the relevant markup, structure, and design tokens (colors, spacing, interactive states) for these tasks — enough detail that another engineer could implement pixel-accurate, behavior-accurate UI from your summary alone.`,
    { label: 'UX: design reference' }
  )
}

phase('Implement')
const wavesByNumber = {}
for (const t of plan.tasks) {
  if (!wavesByNumber[t.wave]) wavesByNumber[t.wave] = []
  wavesByNumber[t.wave].push(t)
}
const waveNumbers = Object.keys(wavesByNumber).map(Number).sort((a, b) => a - b)

function implementPrompt(task, waveMates, retryContext) {
  const roleName = {
    database: 'Database Engineer',
    backend: 'Backend Engineer',
    frontend: 'Frontend Engineer',
    shared: 'Shared/Platform Engineer',
    ux: 'UX/UI Engineer',
    other: 'Engineer',
  }[task.role]
  return `You are the ${roleName} on smartEnterprise. Implement this OpenSpec task from Slice ${slice} of change "${change}":

Task ${task.id}: ${task.title}
Likely files: ${task.filesHint}

Read openspec/changes/${change}/tasks.md, proposal.md, and the relevant spec deltas under openspec/changes/${change}/specs/ for full acceptance criteria on this exact task before writing code.
${designNotes ? `\nDesign reference (from the UX review pass):\n${designNotes}\n` : ''}
Running in parallel with you this wave (disjoint file scope — if you find you need to touch one of their files, STOP and report the conflict instead of proceeding): ${waveMates.length ? waveMates.map(m => `${m.id} (${m.filesHint})`).join(', ') : 'none'}.

${QUALITY_BAR}

Do NOT edit openspec/changes/${change}/tasks.md — checkbox updates happen in a later step.
${retryContext ? `\nThis is a retry.\n${retryContext}\nFix the actual defect — do not just silence the check.` : ''}

Make the code changes for this task only. Report a summary of what you changed and why, the exact list of files you touched, and any assumptions you made.`
}

const results = []
for (const w of waveNumbers) {
  const waveTasks = wavesByNumber[w]
  const waveResults = await parallel(
    waveTasks.map(t => () =>
      agent(implementPrompt(t, waveTasks.filter(x => x.id !== t.id), null), { phase: 'Implement', label: `${t.role}:${t.id}`, schema: IMPLEMENT_SCHEMA })
        .then(output => ({ task: t, output }))
    )
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
        const retryOutput = await agent(
          implementPrompt(t, waveTasks.filter(x => x.id !== t.id), `A parallel teammate this wave also touched: ${overlappingFiles.join(', ')}. Re-inspect the current state of these files (another agent already edited them) and reconcile your change with what's actually there now — do not blindly re-apply your original diff.`),
          { phase: 'Implement', label: `${t.role}:${t.id}:conflict-retry`, schema: IMPLEMENT_SCHEMA }
        )
        const idx = results.findIndex(x => x.task.id === t.id)
        if (idx >= 0) results[idx] = { task: t, output: retryOutput }
      }
    }
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
      `Run automated verification for Slice ${slice} of "${change}" on the smartEnterprise monorepo (pnpm workspaces).
1. Run "pnpm typecheck" and "pnpm build" from the repo root.
2. For any workspace package touched by this slice's tasks that has a "test" script in its package.json (check packages/shared, apps/api, apps/web), run it too (e.g. "pnpm --filter @se/shared test").
3. Report pass=true only if every command above exits clean.
4. If something fails, map each failure to the task id(s) whose filesHint most plausibly caused it (best-effort file-path matching), and include the raw error text in notes.

Tasks in this slice:
${plan.tasks.map(t => `${t.id}: ${t.title} (${t.filesHint})`).join('\n')}`,
      { phase: 'QA', label: `automated checks (attempt ${qaAttempt + 1})`, schema: QA_SCHEMA }
    ),
    () => agent(
      `You are the QA Engineer for smartEnterprise. Adversarially validate the implementation of Slice ${slice} of "${change}" — do not assume the code works.

Tasks implemented this slice:
${plan.tasks.map(t => `${t.id}: ${t.title} (${t.filesHint})`).join('\n')}

1. Read openspec/changes/${change}/tasks.md and the spec deltas under openspec/changes/${change}/specs/ for this slice's acceptance criteria (and the "Verify" section if this slice's criteria live there).
2. Inspect the actual diff (git status / git diff) against those criteria — functional correctness, edge cases, tenant-scoping/permission checks, error/loading/empty states, validation, no dead code, no leftover TODOs.
3. Report pass=true only if every task's acceptance criteria are actually met by the code as written.
4. On failure, list the specific task id(s) that failed and exactly what's wrong (repro steps / expected vs actual) in notes.`,
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

  log(`QA failed (attempt ${qaAttempt}/${MAX_QA_RETRIES}): re-running task(s) ${failedIds.join(', ')}`)
  const retryContext = `Automated checks: ${autoQA ? autoQA.notes : 'n/a'}\nQA engineer: ${reasoningQA ? reasoningQA.notes : 'n/a'}`
  const retryTasks = plan.tasks.filter(t => failedIds.includes(t.id))
  const retryResults = await parallel(
    retryTasks.map(t => () =>
      agent(implementPrompt(t, retryTasks.filter(x => x.id !== t.id), retryContext), { phase: 'Implement', label: `retry:${t.id}`, schema: IMPLEMENT_SCHEMA })
        .then(output => ({ task: t, output }))
    )
  )
  for (const r of retryResults.filter(Boolean)) {
    const idx = results.findIndex(x => x.task.id === r.task.id)
    if (idx >= 0) results[idx] = r
    else results.push(r)
  }
}

phase('Report')
const report = await agent(
  `You are the Engineering Manager closing out Slice ${slice} of "${change}" on smartEnterprise.

Tasks in scope:
${plan.tasks.map(t => `${t.id}: ${t.title} (role: ${t.role})`).join('\n')}

Final QA status: ${finalPass ? 'PASS' : 'FAIL'}
Automated checks notes: ${autoQA ? autoQA.notes : 'n/a'}
QA engineer notes: ${reasoningQA ? reasoningQA.notes : 'n/a'}

Specialist output per task:
${results.map(r => `--- ${r.task.id} (${r.task.role}) ---\n${r.output.summary}\nFiles changed: ${(r.output.filesChanged || []).join(', ') || 'none reported'}\nAssumptions: ${r.output.assumptions || 'none'}`).join('\n\n')}

1. If Final QA status is PASS: open openspec/changes/${change}/tasks.md and flip "- [ ]" to "- [x]" for exactly the task lines carrying "_(Slice ${slice})_", appending a short outcome note in the same style/tone as the other completed tasks already in that file. Do not touch any other slice's lines.
2. If Final QA status is FAIL: do NOT edit tasks.md.
3. Produce the final report in this exact structure: Executive Summary, Specialist Contributions (per role involved), Files Changed (every file), Risks, Recommendations, Final QA Status (PASS/FAIL), Confidence Score (1-100%).

Return the final report as your response.`,
  { label: 'EM: final report' }
)

log(finalPass ? 'Slice complete — tasks.md updated.' : 'Slice QA FAILED after retries — tasks.md left unchanged.')

return { change, slice, finalPass, report }
