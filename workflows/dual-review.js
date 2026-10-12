export const meta = {
  name: 'dual-review',
  description: 'Joint change review sized to the change: independent Opus 5.5 xhigh seats (correctness + intent on a small change of <=150 lines and <=3 files that touches no sensitive domain; correctness + robustness + intent otherwise) plus one fresh-eyes seat (open lens) on every review — Sonnet 5.5 (claude-sonnet-5-5) xhigh by default since 2026-10-04 (b), Fable 5.1 xhigh only when the user explicitly asked for Fable in this review (args.fable) — then severity-routed adversarial cross-refutation between seat groups. Every seat and verifier fetches the diff itself with git. Seats report every critical/major and at most 3 minors (the workflow drops and counts the rest). A dead fresh-eyes seat (Sonnet or Fable) or Fable cross job re-runs its identical prompt on Opus (never rephrased). args.security=true seats four Opus 5.5 seats (correctness, robustness, intent, defensive) whatever the size, plus the fresh-eyes seat (originating only), runs every Cross lane on Opus, writes the findings to a file and returns routing-level rows only. Without args.fable no Fable model runs: group-A criticals are verified by an independent Opus 5.5 context at xhigh (2026-10-04 replay: xhigh matched max on 45/45 verdicts with zero flips at 3.6x less cost); args.noFable=true (Fable ceiling reached, or Fable opted out) overrides args.fable and keeps the Sonnet 5.5 fresh-eyes seat.',
  whenToUse: 'ONCE per task, for its tier only: sensitive domains (security surfaces with security: true, which also needs reportDir + date; every sensitive domain with sensitive: true), new user-facing behavior, changed design decisions (pass design: true). One run per change: when any part of it is security-flavored, a single security: true run over the whole change, never a standard run plus a security run over split file lists. Pass args.scale ({ files, lines } as measured with git diff --shortstat, plus untracked files\' lines) so the panel is sized; without it the panel defaults to the standard size. Fixes derived from a review never re-trigger it — a critical\'s fix gets one single-reviewer re-check scoped to the fix diff, never a second dual-review. Always pass args.context, in English; pass args.repo when the session cwd is not the repository. Pass args.fable only when the user explicitly asked for Fable in this review. JUMBO GATE: over ~1.5k changed lines or ~15 files, get a blocking user OK with the projected scale (3-4 Opus 5.5 seats + 1 fresh-eyes seat: Sonnet 5.5, or Fable when requested, + ~1 verifier per 3 critical/major findings) BEFORE launching.',
  phases: [
    { title: 'Review', detail: 'independent seats over the same change: Opus 5.5 correctness + intent on a small change outside the sensitive domains, correctness + robustness + intent otherwise; plus one fresh-eyes seat on every review, any size — Sonnet 5.5 xhigh by default, Fable 5.1 xhigh only on the user\'s explicit request (args.fable; never under noFable); security mode: 4× Opus 5.5 (correctness, robustness, intent, defensive) at any size, plus the fresh-eyes seat (originating only); at most 3 minors kept per seat; a dead fresh-eyes seat re-runs its identical prompt on Opus 5.5 xhigh (security: then once on Opus 5 if still dead)' },
    { title: 'Cross', detail: 'severity-routed adversarial verification: criticals at xhigh (2026-10-04 replay: xhigh matched max on 45/45 verdicts with zero flips at 3.6x less cost) (cross-model on Fable only when Fable was requested, is up and the surface is not security; otherwise an independent Opus 5.5 context), majors Opus 5.5 at high, minors pass through unverified; Sonnet 5.5 never verifies; a refuted Fable major is contested, not vetoed (a refuted Sonnet major is an ordinary refutation); security mode: every lane on Opus' },
    { title: 'Write', detail: 'security mode only: the findings go to a file; the session gets routing-level rows' },
  ],
}

// args: {
//   context: string    — REQUIRED in practice, in English: what was asked (quote the user's words), what was
//                        implemented, and the CLAUDE.md/memory constraints that apply. The intent seat is
//                        worthless without it.
//   repo?: string      — absolute path of the repository when the session cwd is not it; every git command
//                        then runs with `-C "<repo>"`.
//   range?: string     — git range (e.g. "HEAD~1..HEAD"); absent = uncommitted working tree vs HEAD (untracked included).
//   files?: string[]   — restrict the review to these paths.
//   focus?: string     — optional extra lens for all seats.
//   scale?: { files: number, lines: number } — the size of the reviewed change as the session measured it
//                        (git diff --shortstat over the range or the working tree, plus untracked files' lines,
//                        restricted to `files` when given). Both fields must be finite non-negative numbers;
//                        anything else counts as absent. Small = lines <= 150 AND files <= 3 (standard review
//                        without `sensitive`: two Opus seats, correctness + intent, plus the fresh-eyes seat);
//                        jumbo = lines > 1500 OR files > 15 (recorded in panel.size and gates the launch; it seats
//                        nothing extra). Absent → size 'unknown', one WARN, the standard-size panel.
//   sensitive?: bool   — the session sets it when the change touches a sensitive domain (auth, payments/billing —
//                        including code that decides whether money is spent on a paid external call, wherever it lives —
//                        data persistence/migrations, security, deploy/release config): it vetoes the small tier,
//                        so a small sensitive change keeps the robustness seat (full three-seat Opus panel). No
//                        effect on a security review (its panel never shrinks) or on a standard/jumbo size.
//   design?: bool      — the change alters a design decision (architecture, data model, public API/contract, a
//                        project rule or policy): recorded in panel.design; it seats nothing (the fresh-eyes seat
//                        is on every review since 2026-10-04 (b); only args.fable puts Fable in it).
//   fable?: bool       — the session sets it ONLY when the user explicitly asked for Fable in this review
//                        (2026-10-04: /duo is Fable-free by default, pending re-evaluation at the Fable 5.5
//                        launch). The fresh-eyes seat then runs on Fable 5.1 xhigh (key fable-fresh) instead of
//                        Sonnet 5.5, at any size, standard or security review, and on a standard review group-A
//                        critical verification moves to Fable at xhigh. noFable overrides it.
//   security?: bool    — the reviewed surface is security-flavored: four Opus 5.5 xhigh seats (correctness,
//                        robustness, intent, and a defensive seat that only ORIGINATES) whatever the size, plus
//                        the fresh-eyes seat (also originating only, with the security brief hygiene): Sonnet 5.5,
//                        or Fable when args.fable and not noFable — Fable never holds the defensive seat; every
//                        Cross lane runs on Opus; the full
//                        findings are written to `<reportDir>/<repo>-<date>-duo.md` and the session receives
//                        routing-level rows (id, seat, severity, file, line, verdict) plus counts — never
//                        claim/scenario/evidence text (CLAUDE.md security rule (4)). Needs reportDir + date. One
//                        security run covers the WHOLE change: never split a change into a standard run plus a
//                        security run.
//   reportDir?: string — security mode: directory OUTSIDE the repo for the report (from /duo: ~/.claude/audits).
//   date?: string      — security mode: YYYY-MM-DD from the session (scripts cannot read the clock).
//   noFable?: bool     — the Fable 50% ceiling is reached, or the user opts
//                        out of Fable. It overrides args.fable (one WARN when both are set): no Fable model runs,
//                        exactly the default without args.fable — the fresh-eyes seat stays on Sonnet 5.5, group-A
//                        criticals verified by an independent Opus 5.5 context at xhigh (a security review's Cross
//                        lanes are all Opus already). Composes with security.
// }

// Self-defense: args can arrive as a JSON-encoded STRING if the caller serialized it
// (real incident 2026-07-27: all three seats ran with "(no context provided)" despite a
// written context). Parse it back instead of silently losing every field.
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = null } }
const ctx = (A && A.context) || ''
const repo = (A && A.repo) || null
const range = (A && A.range) || null
const files = (A && A.files) || null
const focus = (A && A.focus) || null
const noFable = !!(A && A.noFable)
const fable = !!A && A.fable === true // strict, like security-audit.js: a truthy string never seats Fable
const security = !!(A && A.security)
const reportDir = (A && A.reportDir) || null
const date = (A && A.date) || null
const design = !!(A && A.design)
const sensitive = !!(A && A.sensitive)
const finiteNonNeg = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0
const scale = (A && A.scale && typeof A.scale === 'object' && finiteNonNeg(A.scale.files) && finiteNonNeg(A.scale.lines)) ? { files: A.scale.files, lines: A.scale.lines } : null
if (security && (!reportDir || !date)) return { error: 'security mode needs args.reportDir (a directory outside the repo) and args.date (YYYY-MM-DD): the findings are written to a file and only routing-level rows return to the session' }
if (security && repo && (reportDir === repo || reportDir.startsWith(repo.replace(/\/+$/, '') + '/'))) return { error: 'args.reportDir must lie outside the repository under review' }

// Group B is the fresh-eyes seat — on every review since 2026-10-04 (b): Sonnet 5.5 (claude-sonnet-5-5) xhigh by
// default, Fable 5.1 xhigh only when the user explicitly asked for Fable (args.fable, never under noFable) — and,
// on a security review, the Opus defensive seat next to it. Since 2026-10-04 /duo is Fable-free by default
// (pending re-evaluation at the Fable 5.5 launch): without args.fable group A's criticals are cross-examined by an
// independent Opus 5.5 context; with it, by Fable on a standard review — unless Fable has died in Review. Sonnet
// 5.5 only ORIGINATES, never verifies: its criticals and majors go to Opus lanes, and a refuted Sonnet major is an
// ordinary refutation (the Opus verifier is the stronger model). On security surfaces every Cross lane stays on
// Opus and the fresh-eyes seat only ORIGINATES. Background (2026-09-28): Fable seats were 27% of /duo spend for 4
// of 47 unique confirmed findings. Fable never holds the defensive seat (it
// raised 0 unique confirmed findings in 10 security runs), and a Fable verifier that tripped a classifier
// would leave Opus criticals UNVERIFIED (→ uncertain → never fixed). A fresh-eyes seat (Sonnet or Fable) or a
// Fable cross job that dies re-runs its IDENTICAL prompt on Opus — the sanctioned re-route (CLAUDE.md: never
// rephrased).
// 2026-09-22: on security surfaces an Opus 5.5 lane that DIES (returns null) re-runs its IDENTICAL prompt once
// on Opus 5; never rephrased. It fires only on a dead lane. With switchModelsOnFlag off, a cyber-classifier
// trip is expected to stop the lane rather than switch its model, so the re-run can fire; with it on, a trip
// silently lands on Opus 4.8 and returns a normal-looking result — no re-run fires, and only
// hooks/model-drift.sh reports it. Claude Code does not document how a workflow subagent behaves on a trip:
// model-drift.sh is the ground truth. Update this id at each model launch.
const SEC_FALLBACK = 'claude-opus-5'
// Every lane without its own agent type runs as the kit's minimal `lane` agent (agents/lane.md: Bash, Read, Glob, Grep,
// Write): a default workflow agent loads every session tool and the skill listing, ~45k tokens it never uses (2026-10-07).
const LANE = 'lane'

const shq = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`
const git = repo ? `git -C ${shq(repo)}` : 'git'
const where = repo ? `The repository is at ${shq(repo)} — run every git command with \`-C ${shq(repo)}\` and read files under that path.` : ''
const diffSpec = [
  where,
  range
    ? `The change under review is the git range \`${range}\`: run \`${git} log --oneline ${range}\` and \`${git} diff ${range}\` to see it.`
    : `The change under review is the uncommitted working tree: run \`${git} status --porcelain\` and \`${git} diff HEAD\`, and Read any untracked files it lists.`,
].filter(Boolean).join(' ')
const fileScope = files && files.length ? `Restrict the review strictly to these paths: ${files.join(', ')}.` : ''

// Size class (2026-09-28): measured /duo cost did not track change size, so the panel now does. Small
// changes that do not touch security get two Opus seats (plus the fresh-eyes seat every review gets); jumbo is
// recorded (and gates the launch) but seats nothing extra (Fable is opt-in via args.fable since 2026-10-04).
const SMALL_LINES = 150, SMALL_FILES = 3, JUMBO_LINES = 1500, JUMBO_FILES = 15
const size = !scale ? 'unknown'
  : (scale.lines > JUMBO_LINES || scale.files > JUMBO_FILES) ? 'jumbo'
  : (scale.lines <= SMALL_LINES && scale.files <= SMALL_FILES) ? 'small'
  : 'standard'
if (size === 'unknown') log('WARN: args.scale absent or invalid (needs finite non-negative files and lines) — size class unknown, the panel defaulted to the standard size')
// Seats report every critical/major and at most MINOR_CAP minors (77% of all findings were minors that are
// never verified or fixed); the script drops the excess per seat and counts it.
const MINOR_CAP = 3

// 2026-10-04: the shared diff packet (a Sonnet 5.5 transcriber + POSIX cksum check) was removed — it exceeded its
// 28 KB limit in 5 of 5 real runs (31-244 KB), so seats always fetched the diff themselves anyway.

const FINDINGS = {
  type: 'object',
  required: ['findings', 'assessment', 'ship'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'claim', 'failure_scenario', 'evidence', 'severity'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          claim: { type: 'string', description: 'One-sentence statement of the defect' },
          failure_scenario: { type: 'string', description: 'Concrete inputs/state that produce the wrong outcome' },
          evidence: { type: 'string', description: 'Verbatim code backing the claim' },
          severity: { enum: ['critical', 'major', 'minor'] },
          pre_existing: { type: 'boolean', description: 'true if the defect pre-dates the change under review (reported and verified, but not auto-fixed)' },
          fix_hint: { type: 'string' },
        },
      },
    },
    assessment: { type: 'string', description: '2-4 sentences: overall quality of the change through your lens' },
    ship: { type: 'boolean', description: 'Would you ship this change as-is' },
  },
}

const VERDICTS = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'verdict', 'reason'],
        properties: {
          id: { type: 'string' },
          verdict: { enum: ['CONFIRMED', 'REFUTED', 'UNCERTAIN'] },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const WRITTEN = {
  type: 'object',
  required: ['path', 'ok'],
  properties: { path: { type: 'string' }, ok: { type: 'boolean' }, count: { type: 'integer' }, note: { type: 'string' } },
}

// Prompt order keeps every lens-agnostic part first, so the seats share one byte-identical prefix (prompt
// cache); the lens and the optional focus come LAST.
const seatPrompt = (lens) => `You are one independent seat of a joint review panel examining a code change.

Task context (what was asked and what was implemented):
${ctx || '(no context provided — review the change on its own terms)'}

${diffSpec}
${fileScope}

Rules:
- Report EVERY critical and major finding you find — never hold one back, never downgrade one to fit a cap. Report at most ${MINOR_CAP} minor findings, the ones most worth the user's attention: the workflow drops minors beyond ${MINOR_CAP}, and minors reach the user unverified and are never auto-fixed. Leave out style, naming and speculative observations. Critical and major findings are adversarially verified downstream. Severity accuracy therefore matters more than volume: reserve critical/major for defects whose failure scenario you can state concretely. A defect a person would see in the user interface — clipped, overlapping or illegible text or controls, internal codes or ids shown to the user, a screen left empty without explanation, a step that blocks them — is at least major, never minor.
- Read the surrounding code, not just the diff — a change can be wrong only in the context of the functions and invariants it touches.
- Gather context in parallel: when you need several files, searches or commands, issue those tool calls together in one turn instead of one per turn.
- Every finding needs a concrete failure_scenario (inputs/state → wrong outcome) and verbatim evidence with file:line. Without a failure scenario it is an observation, not a finding — leave it out of findings and mention it in assessment if it matters.
- A defect that pre-dates this change is still a finding — report it with pre_existing: true (it gets verified but not auto-fixed). Do not silently drop it, and do not flag as pre_existing anything this change introduces or worsens.
- The deliverable is your assessment. Report your findings and stop — do not fix anything.

Your lens: ${lens}
Stay in your lens; the other seats cover the rest.${focus ? `\nAdditional focus requested by the user: ${focus}` : ''}`

// Security brief hygiene (security rule (5)): appended to the fresh seat's lens on a security run; the defensive
// lens carries the same sentences in its own wording.
const SECURITY_HYGIENE = 'On this security review, act as a defender who proposes fixes. Do not write exploit code or proofs of concept; do not read binary or image files; never paste base64 or other encoded blobs into your context; stay inside this repository'

const LENS = {
  correctness: 'correctness — logic errors, regressions vs previous behavior, broken invariants, missed edge cases, state/lifecycle bugs, platform gates (iOS/Android) violated',
  robustness: 'robustness — security, data handling, failure modes (network, timeouts, nulls, races), concurrency, resource leaks, errors swallowed silently',
  intent: 'intent and design — does the change do what the task context actually asked, at the intended scope? Missing pieces, unrequested additions, simpler designs forgone, wrong abstractions, comments/docs that now lie',
  fresh: 'fresh eyes — everything in scope: correctness, robustness, and intent/design against the task context. You run on a different model from the other seats and from the architect (Opus 5.5) who planned the change, so prioritize what a single-model panel is likely to miss: misreadings of the user\'s own words in the task context, assumptions baked into the plan that the diff inherited, invariants nobody stated',
  defensive: 'defensive security review of our own code, as a defender who proposes fixes — input validation and authorization checks that are missing or bypassable, injection into queries, commands, templates or paths, unsafe deserialization, secrets and token handling, insecure defaults, error paths that leak information or fail open. Every finding carries the concrete failure scenario and the fix. Do not write exploit code or proofs of concept; do not read binary or image files; never paste base64 or other encoded blobs into your context; stay inside this repository',
}

// Group A: the Opus lens seats. Group B: the fresh-eyes seat (every review), plus the Opus defensive seat on a
// security review.
// The cross-examination runs between GROUPS (independent contexts), not between models per se — this is
// what keeps the refutation adversarial even when both groups run on Opus.
// Effort: every seat at xhigh — Opus 5.5 thinks more per level than Opus 5 (Anthropic: medium >= Opus 5
// high); critical verification runs at xhigh too since the 2026-10-04 replay (xhigh matched max on 45/45
// verdicts, zero flips, 3.6x cheaper and 4.6x faster), so no lane uses max.
// The Sonnet 5.5 fresh seat runs at xhigh too (the 2026-09-28 bench: Sonnet 5.5 reached Opus 5.5 low on
// behavioral tracing only at high effort).
// 2026-09-28 — the panel is sized to the change (measured over 25 runs: seats were 84% of run cost, cost did
// not track change size, and only 20% of confirmed critical/major findings came from a single seat):
// - security: four Opus 5.5 seats (correctness, robustness, intent, defensive) whatever the size — the size
//   class never shrinks a security panel — plus the fresh-eyes seat (an originating group-B seat next to the
//   defensive one, with the security hygiene suffix; every Cross lane stays on Opus).
// - standard: correctness + intent on a small change, correctness + robustness + intent otherwise — args.sensitive
//   vetoes the small tier, so a small change in a sensitive domain (payments, persistence, deploy config...)
//   keeps the robustness lens.
// 2026-10-04 — Fable is opt-in per review: the Fable seat joins, at any size, standard or security, only when the
//   user explicitly asked for Fable (args.fable). The 2026-09-28 rule (seat it on design or jumbo changes) is
//   retired pending re-evaluation at the Fable 5.5 launch; background: Fable seats were 27% of /duo spend for 4
//   of 47 unique confirmed findings. Under noFable Fable is never seated, even when requested.
// 2026-10-04 (b) — the slot Fable left is filled by default: every review, any size, standard or security, seats
//   one fresh-eyes seat — Sonnet 5.5 (claude-sonnet-5-5) xhigh, or Fable 5.1 xhigh when args.fable and not
//   noFable. noFable only means "no Fable": the Sonnet seat stays. The Sonnet seat's cost and yield are
//   unmeasured; they get measured on the first real runs.
const small = size === 'small'
const smallVetoed = !security && small && sensitive
const fableOn = fable && !noFable
if (fable && noFable) log('WARN: Fable was requested (args.fable) but noFable is set — the fresh-eyes seat runs on Sonnet 5.5, not Fable')
const freshModel = fableOn ? 'fable' : 'sonnet'
const freshReason = fableOn ? 'requested' : 'default'
const fresh = true // one fresh-eyes seat on every review since 2026-10-04 (b)
const freshLens = security ? `${LENS.fresh}. ${SECURITY_HYGIENE}` : LENS.fresh
const freshSeat = fableOn
  ? { key: 'fable-fresh', model: 'fable', group: 'B', effort: 'xhigh', lens: freshLens }
  : { key: 'sonnet-fresh', model: 'claude-sonnet-5-5', group: 'B', effort: 'xhigh', lens: freshLens }
const seatA = {
  correctness: { key: 'opus-correctness', model: 'opus', group: 'A', effort: 'xhigh', lens: LENS.correctness },
  robustness: { key: 'opus-robustness', model: 'opus', group: 'A', effort: 'xhigh', lens: LENS.robustness },
  intent: { key: 'opus-intent', model: 'opus', group: 'A', effort: 'xhigh', lens: LENS.intent },
}
const seats = security
  ? [
      seatA.correctness, seatA.robustness, seatA.intent,
      { key: 'opus-defensive', model: 'opus', group: 'B', effort: 'xhigh', lens: LENS.defensive },
      freshSeat,
    ]
  : [
      ...(small && !smallVetoed ? [seatA.correctness, seatA.intent] : [seatA.correctness, seatA.robustness, seatA.intent]),
      freshSeat,
    ]
// freshModel names the fresh-eyes seat's model as planned ('sonnet' | 'fable'); a fallback shows in `fallbacks`.
const panel = { size, seats: seats.map(s => s.key), fresh, freshReason, sensitive, design, fable: fableOn, freshModel }

const SIZE_NOTE = { small: 'small change', standard: 'standard size', jumbo: 'jumbo change', unknown: 'size unknown' }
const opusSeats = seats.filter(s => s.model === 'opus')
const baseLabel = `${security ? 'security' : 'standard'} (${opusSeats.length}× Opus 5.5: ${opusSeats.map(s => s.key.replace(/^opus-/, '')).join(', ')}${fableOn ? ' + Fable 5.1 fresh eyes (requested)' : ' + Sonnet 5.5 fresh eyes'}) · ${SIZE_NOTE[size]}${smallVetoed ? ', sensitive → full panel' : ''}${fable && noFable ? ' · Fable requested, noFable' : noFable ? ' · noFable' : ''}`

phase('Review')
log(`dual-review: ${seats.length} seats over ${range || 'the working tree'} · ${baseLabel}`)
const reviews = await parallel(seats.map(s => () =>
  agent(seatPrompt(s.lens), { agentType: LANE, label: `seat:${s.key}`, phase: 'Review', model: s.model, effort: s.effort, schema: FINDINGS })
))
const seatRuns = seats.map((s, i) => ({ ...s, r: reviews[i], ranOn: s.model }))
const fallbacks = [] // every re-route that happened (Fable or Sonnet 5.5 → Opus 5.5; security: Opus 5.5 → Opus 5), and whether it worked

// A dead Fable seat (ceiling reached, overload, classifier refusal) re-runs the IDENTICAL prompt on
// Opus 5.5 at xhigh: the lens is never simply absent from the panel. Findings from a fallback seat carry
// by: 'opus' — they get no Fable-tier privileges downstream.
const deadFable = seatRuns.filter(x => !x.r && x.model === 'fable')
if (deadFable.length) {
  log(`WARN: seat(s) ${deadFable.map(x => x.key).join(', ')} died on Fable — re-running the identical seat prompt on Opus 5.5 xhigh (never rephrased)`)
  const again = await parallel(deadFable.map(x => () =>
    agent(seatPrompt(x.lens), { agentType: LANE, label: `seat:${x.key}:opus-fallback`, phase: 'Review', model: 'opus', effort: 'xhigh', schema: FINDINGS })))
  deadFable.forEach((x, i) => { x.r = again[i]; x.ranOn = 'opus'; fallbacks.push({ seat: x.key, model: 'fable', fallback: 'opus', ok: !!again[i] }) })
}
// A dead Sonnet 5.5 fresh-eyes seat (overload, or a classifier trip that stopped the lane) re-runs the IDENTICAL
// prompt once on Opus 5.5 at xhigh, exactly like a dead Fable seat. Its findings then carry by: 'opus'.
const deadSonnet = seatRuns.filter(x => !x.r && x.model === 'claude-sonnet-5-5')
if (deadSonnet.length) {
  log(`WARN: seat(s) ${deadSonnet.map(x => x.key).join(', ')} died on Sonnet 5.5 — re-running the identical seat prompt on Opus 5.5 xhigh (never rephrased)`)
  const again = await parallel(deadSonnet.map(x => () =>
    agent(seatPrompt(x.lens), { agentType: LANE, label: `seat:${x.key}:opus-fallback`, phase: 'Review', model: 'opus', effort: 'xhigh', schema: FINDINGS })))
  deadSonnet.forEach((x, i) => { x.r = again[i]; x.ranOn = 'opus'; fallbacks.push({ seat: x.key, model: 'claude-sonnet-5-5', fallback: 'opus', ok: !!again[i] }) })
}
// Security only: a seat still dead on Opus 5.5 (a fresh-eyes seat that already fell back included) re-runs its
// IDENTICAL prompt once on SEC_FALLBACK. Its findings carry by: SEC_FALLBACK — no Fable-tier privileges.
if (security) {
  const deadOpus = seatRuns.filter(x => !x.r && x.ranOn === 'opus')
  if (deadOpus.length) {
    log(`WARN: seat(s) ${deadOpus.map(x => x.key).join(', ')} died on Opus 5.5 on a security surface — re-running the identical seat prompt once on ${SEC_FALLBACK} (never rephrased)`)
    const again = await parallel(deadOpus.map(x => () =>
      agent(seatPrompt(x.lens), { agentType: LANE, label: `seat:${x.key}:opus5-fallback`, phase: 'Review', model: SEC_FALLBACK, effort: x.effort, schema: FINDINGS })))
    deadOpus.forEach((x, i) => { x.r = again[i]; x.ranOn = SEC_FALLBACK; fallbacks.push({ seat: x.key, model: 'opus', fallback: SEC_FALLBACK, ok: !!again[i] }) })
  }
}
const fableDown = deadFable.length > 0
const seated = seatRuns.filter(x => x.r && Array.isArray(x.r.findings))
const dead = seatRuns.filter(x => !(x.r && Array.isArray(x.r.findings)))
if (dead.length) log(`WARN: ${dead.length} seat(s) produced nothing and were dropped: ${dead.map(s => `${s.key} (${s.ranOn})`).join(', ')} — panel ran degraded, its lens is missing${security && dead.some(s => s.model === 'fable') ? ' (a dead Fable seat on a security surface usually means a classifier refusal: the Opus seats keep coverage, report it, never rephrase)' : ''}`)
// mode reflects what actually ran, not the input flag — a dead seat must not be reported as a full dual review.
// Recomputed after Cross and Write so it counts every re-route, not only the seats'.
const modeOf = () => {
  const modeBase = fallbacks.length ? `${baseLabel} — re-routed (${fallbacks.length} re-route(s)): ${fallbacks.map(f => `${f.seat || f.cross || f.writer} ${f.model}→${f.fallback}`).join(', ')}` : baseLabel
  return dead.length
    ? `degraded (${modeBase}; ${seated.length}/${seats.length} seats ran: ${seated.map(x => x.key).join(', ')} — died: ${dead.map(s => s.key).join(', ')})`
    : modeBase
}
let mode = modeOf()
const degraded = dead.map(x => ({ seat: x.key, model: x.model }))
if (!seated.length) return { error: 'all seats failed or were cancelled', mode, security, degraded, fallbacks, panel, confirmed: [], contested: [], uncertain: [], refuted: [], minors: [], assessments: [] }

// Normalize severity BEFORE lane routing: an off-enum value ("high", "Critical", missing) would
// match no lane and vanish from every output bucket with no trace. Unknown → major (gets verified).
const normSev = (f) => {
  const s = String(f.severity || '').toLowerCase()
  if (s === 'critical' || s === 'major' || s === 'minor') return { ...f, severity: s }
  log(`WARN: finding ${f.id} (${f.file}) has unknown severity "${f.severity}" — treated as major so it gets verified`)
  return { ...f, severity: 'major' }
}
// Minors cap backstop: per seat, every critical/major stays and only the first MINOR_CAP minors in that seat's
// order survive. It runs after normalization (an off-enum severity became major and is kept) and after ids are
// assigned, so the surviving ids are the seat's own, unique and stable.
const minorsDropped = {} // seat key → minors dropped
const capMinors = (list) => {
  const kept = {}
  return list.filter(f => {
    if (f.severity !== 'minor') return true
    kept[f.seat] = (kept[f.seat] || 0) + 1
    if (kept[f.seat] <= MINOR_CAP) return true
    minorsDropped[f.seat] = (minorsDropped[f.seat] || 0) + 1
    return false
  })
}
const aFindings = capMinors(seated.filter(x => x.group === 'A')
  .flatMap((x, xi) => x.r.findings.map((f, i) => ({ ...f, id: `A${xi + 1}.${i + 1}`, seat: x.key, by: x.ranOn }))).map(normSev))
const bFindings = capMinors(seated.filter(x => x.group === 'B')
  .flatMap((x, xi) => x.r.findings.map((f, i) => ({ ...f, id: `B${xi + 1}.${i + 1}`, seat: x.key, by: x.ranOn }))).map(normSev))
const minorsDroppedTotal = Object.values(minorsDropped).reduce((n, k) => n + k, 0)
if (minorsDroppedTotal) log(`WARN: minors cap (${MINOR_CAP} per seat) dropped ${minorsDroppedTotal} minor finding(s): ${Object.entries(minorsDropped).map(([k, n]) => `${k} ${n}`).join(', ')}`)

const crossPrompt = (list, who) => `You are the ${who} cross-examination seat of a joint review panel. OTHER seats produced the findings below about a code change. Adversarially verify EACH one against the actual code: your job is to try to refute it.

${diffSpec}
${fileScope}
Task context: ${ctx || '(none provided)'}

Findings to verify (JSON):
${JSON.stringify(list.map(({ id, file, line, claim, failure_scenario, evidence, pre_existing }) => ({ id, file, line, claim, failure_scenario, evidence, pre_existing })), null, 2)}

For each id return a verdict:
- CONFIRMED — you independently reproduced the reasoning against the real code and the failure scenario holds.
- REFUTED — you have concrete evidence the claim is wrong (quote it in reason).
- UNCERTAIN — it hinges on runtime facts you cannot check from the code.
Read the real files; never judge from the JSON alone. Return a verdict for every id.
Gather context in parallel: when you need several files, searches or commands, issue those tool calls together in one turn instead of one per turn.`

phase('Cross')
// Severity-routed verification: spend concentrates where a verdict can change the outcome.
// - critical: at xhigh effort (max until the 2026-10-04 replay: xhigh matched it on 45/45 verdicts, zero
//   flips, 3.6x cheaper), cross-model on Fable only when the user requested Fable (args.fable, not noFable),
//   Fable is up and the surface is not security — otherwise an independent Opus 5.5 context (the default since
//   2026-10-04). The asymmetric veto (contested) lives here, and it is the ONLY Cross work that can draw Fable.
//   Sonnet 5.5 never verifies: the Sonnet fresh seat's criticals go to the B-crit lane (Opus 5.5 at xhigh), its
//   majors to the pooled major lane.
// - major: Opus 5.5 at high effort in an independent context. Context-independence is kept; model
//   diversity is reserved for criticals — the same trade noFable mode accepts for everything.
// - minor: NOT verified. The closure only ever reports minors one line each, verified or not,
//   so a high-effort verdict on a minor changes nothing actionable. They return under `minors`.
// Origin: 2026-08-08 — a 4k-line review spawned 13 cross agents (10 of them Fable max, ~1M of
// the rationed bucket) mostly verifying minors. Fan-out multiplies diff re-reads; route it.
const crossModelA = (!fableOn || security || fableDown) ? 'opus' : 'fable'
const crossNameA = crossModelA === 'fable' ? 'Fable 5.1' : 'Opus 5.5 (independent context)'
const CHUNK = 3
const chunk = (list) => {
  const out = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}
const sev = (list, s) => list.filter(f => f.severity === s)
const minors = [...sev(aFindings, 'minor'), ...sev(bFindings, 'minor')]
  .map(f => ({ ...f, verdict: 'SKIPPED', verdict_reason: 'minor — reported without verification by design (severity-routed Cross)' }))
// Majors from BOTH groups pool into one lane: per-lane ceil() otherwise inflates the agent count
// on small find-counts (1 crit + 1 major per group would spawn 4 agents where the old code used 2).
const lanes = [
  { list: sev(aFindings, 'critical'), model: crossModelA, who: crossNameA, effort: 'xhigh', tag: 'A-crit' },
  { list: sev(bFindings, 'critical'), model: 'opus', who: 'Opus 5.5', effort: 'xhigh', tag: 'B-crit' },
  { list: [...sev(aFindings, 'major'), ...sev(bFindings, 'major')], model: 'opus', who: 'Opus 5.5 (independent context)', effort: 'high', tag: 'major' },
]
const crossJobs = []
const jobIds = []     // jobIds[i] = the finding ids job i is allowed to return verdicts for
const jobMeta = []    // jobMeta[i] = { prompt, label, model, effort } — needed to re-run a dead job (Fable → Opus 5.5; security: Opus 5.5 → Opus 5)
for (const lane of lanes) {
  const cs = chunk(lane.list)
  cs.forEach((c, i) => {
    const label = `cross:${lane.model}-verifies-${lane.tag}${cs.length > 1 ? ` ${i + 1}/${cs.length}` : ''}`
    const prompt = crossPrompt(c, lane.who)
    jobIds.push(new Set(c.map(f => f.id)))
    jobMeta.push({ prompt, label, model: lane.model, effort: lane.effort })
    crossJobs.push(() => agent(prompt, { agentType: LANE, label, phase: 'Cross', model: lane.model, effort: lane.effort, schema: VERDICTS }))
  })
}
const sent = lanes.flatMap(lane => lane.list)
if (minors.length) log(`${minors.length} minor findings pass through unverified — only critical/major drive fixes`)

const normVerdict = (v) => {
  const s = String(v || '').trim().toUpperCase()
  return (s === 'CONFIRMED' || s === 'REFUTED' || s === 'UNCERTAIN') ? s : null
}
const verdictById = {}
if (crossJobs.length) {
  // No .filter(Boolean): index alignment with jobIds matters. A verdict is only accepted from the
  // agent that was assigned that finding — otherwise a hallucinated id from the cheap major lane
  // could silently override an xhigh critical verdict.
  const crossResults = await parallel(crossJobs)
  // A dead Fable cross job re-runs its identical prompt on Opus 5.5 at xhigh (veto tier) (same jobIds guard applies).
  const ranOn = jobMeta.map(m => m.model) // the model each job last ran on — a Fable job that fell back is 'opus'
  const retry = []
  crossResults.forEach((cr, i) => { if (!cr && jobMeta[i].model === 'fable') retry.push(i) })
  if (retry.length) {
    log(`WARN: ${retry.length} Fable cross job(s) died — re-running the identical prompt(s) on Opus 5.5 xhigh`)
    const again = await parallel(retry.map(i => () =>
      agent(jobMeta[i].prompt, { agentType: LANE, label: `${jobMeta[i].label}:opus-fallback`, phase: 'Cross', model: 'opus', effort: 'xhigh', schema: VERDICTS })))
    retry.forEach((i, k) => { crossResults[i] = again[k]; ranOn[i] = 'opus'; fallbacks.push({ cross: jobMeta[i].label, model: 'fable', fallback: 'opus', ok: !!again[k] }) })
  }
  // Standard runs: an Opus 5.5 cross job that died (not a Fable fallback) re-runs its identical prompt once on
  // Opus 5.5 at its own effort, so a transient failure does not leave its findings UNVERIFIED.
  if (!security) {
    const retryO = []
    crossResults.forEach((cr, i) => { if (!cr && jobMeta[i].model === 'opus') retryO.push(i) })
    if (retryO.length) {
      log(`WARN: ${retryO.length} Opus 5.5 cross job(s) died — re-running the identical prompt(s) once`)
      const againO = await parallel(retryO.map(i => () =>
        agent(jobMeta[i].prompt, { agentType: LANE, label: `${jobMeta[i].label}:retry`, phase: 'Cross', model: 'opus', effort: jobMeta[i].effort, schema: VERDICTS })))
      retryO.forEach((i, k) => { crossResults[i] = againO[k]; fallbacks.push({ cross: jobMeta[i].label, model: 'opus', fallback: 'opus', ok: !!againO[k] }) })
    }
  }
  // Security only: a cross job still dead on Opus 5.5 re-runs its identical prompt once on SEC_FALLBACK
  // at that job's effort (same jobIds guard applies).
  if (security) {
    const retry5 = []
    crossResults.forEach((cr, i) => { if (!cr && ranOn[i] === 'opus') retry5.push(i) })
    if (retry5.length) {
      log(`WARN: ${retry5.length} Opus 5.5 cross job(s) died on a security surface — re-running the identical prompt(s) once on ${SEC_FALLBACK}`)
      const again5 = await parallel(retry5.map(i => () =>
        agent(jobMeta[i].prompt, { agentType: LANE, label: `${jobMeta[i].label}:opus5-fallback`, phase: 'Cross', model: SEC_FALLBACK, effort: jobMeta[i].effort, schema: VERDICTS })))
      retry5.forEach((i, k) => { crossResults[i] = again5[k]; ranOn[i] = SEC_FALLBACK; fallbacks.push({ cross: jobMeta[i].label, model: 'opus', fallback: SEC_FALLBACK, ok: !!again5[k] }) })
    }
  }
  crossResults.forEach((cr, i) => {
    if (!cr || !Array.isArray(cr.verdicts)) return
    for (const v of cr.verdicts) {
      if (!jobIds[i].has(v.id)) { log(`WARN: cross agent ${i + 1} returned a verdict for unassigned id ${v.id} — ignored`); continue }
      const nv = normVerdict(v.verdict)
      if (!nv) { log(`WARN: cross agent ${i + 1} returned an unknown verdict "${v.verdict}" for ${v.id} — counted as UNVERIFIED`); continue }
      verdictById[v.id] = { ...v, verdict: nv }
    }
  })
  const missing = sent.map(f => f.id).filter(id => !verdictById[id])
  if (missing.length) log(`WARN: no verdict returned for ${missing.join(', ')} — counted as UNVERIFIED, shown under uncertain`)
} else {
  log('0 critical/major findings — Cross phase skipped')
}

const rank = { critical: 0, major: 1, minor: 2 }
const all = sent.map(f => ({
  ...f,
  verdict: (verdictById[f.id] && verdictById[f.id].verdict) || 'UNVERIFIED',
  verdict_reason: (verdictById[f.id] && verdictById[f.id].reason) || null,
}))
const bySeverity = (a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3)
const confirmed = all.filter(f => f.verdict === 'CONFIRMED').sort(bySeverity)
const uncertain = all.filter(f => f.verdict === 'UNCERTAIN' || f.verdict === 'UNVERIFIED').sort(bySeverity)
// Asymmetric veto: a refuted CRITICAL survives as "contested" — the user sees the claim and the
// refutation side by side and makes the call. Dropping a false positive costs nothing; silently
// dropping a real critical costs a build. Since 2026-09-01 the same holds for a refuted MAJOR from the
// Fable seat (by === 'fable', i.e. the seat actually ran on Fable): the major lane runs on Opus at high,
// a lower tier than the finder, so it may contest a Fable finding but never veto it. A same-family
// refutation (Opus verifying Opus, fallback seats included) still kills a major's fix — never its
// visibility (it returns under `refuted`). So does a refuted major from the Sonnet 5.5 fresh seat
// (by === 'claude-sonnet-5-5'): its Opus verifier is the stronger model, so the refutation is ordinary.
const isContested = (f) => f.verdict === 'REFUTED' && (f.severity === 'critical' || f.by === 'fable')
const contested = all.filter(isContested).sort(bySeverity)
const refuted = all.filter(f => f.verdict === 'REFUTED' && !isContested(f))
const assessments = seated.map(x => ({ seat: x.key, model: x.ranOn, ship: x.r.ship, assessment: x.r.assessment }))
const counts = { findings: all.length + minors.length, critical: sev(all, 'critical').length, major: sev(all, 'major').length, minor: minors.length, minors_dropped: minorsDroppedTotal, confirmed: confirmed.length, contested: contested.length, uncertain: uncertain.length, refuted: refuted.length }

log(`dual-review: ${confirmed.length} confirmed · ${contested.length} contested · ${uncertain.length} uncertain · ${refuted.length} refuted · ${minors.length} minors unverified${fallbacks.length ? ` · ${fallbacks.length} re-route(s)` : ''}`)

mode = modeOf()
if (!security) {
  return { mode, security: false, degraded, fallbacks, panel, counts, confirmed, contested, uncertain, refuted, minors, assessments }
}

// Security mode: the findings go to a file (raw JSON first, so a writer failure loses nothing; then a
// readable report). The session gets routing-level rows only — CLAUDE.md security rule (4).
phase('Write')
const repoBase = repo ? (repo.split('/').filter(Boolean).pop() || 'repo') : 'worktree'
const rawPath = `${reportDir}/${repoBase}-${date}-duo-raw.json`
const reportPath = `${reportDir}/${repoBase}-${date}-duo.md`
const payload = JSON.stringify({ repo, range, files, date, context: ctx, mode, fallbacks, degraded, counts, confirmed, contested, uncertain, refuted, minors, assessments }, null, 2)
// Pinned by id since 2026-09-28: the `sonnet` alias resolves differently across Claude Code versions (Sonnet 5 before 2.1.284, Sonnet 5.5 from it).
const raw = await agent(`Write the following JSON VERBATIM (byte for byte, no reformatting, no commentary) to the file \`${rawPath}\`, creating \`${reportDir}\` if it does not exist and overwriting any existing file. Then run \`wc -c < ${shq(rawPath)}\` and return the path, ok: true and count = the byte count it prints. Do nothing else.

${payload}`, { agentType: LANE, label: 'write:raw-json', phase: 'Write', model: 'claude-sonnet-5-5', effort: 'low', schema: WRITTEN })
// The script cannot read the file back, so the dump is checked by size: the transcriber's `wc -c` must match the
// payload's UTF-8 byte length (one trailing newline tolerated). A claimed ok with any other count is not trusted —
// a truncated or altered dump would otherwise silently corrupt the report.
const payloadBytes = unescape(encodeURIComponent(payload)).length
const rawClaimed = !!(raw && raw.ok)
const rawOk = rawClaimed && Number.isInteger(raw.count) && raw.count >= payloadBytes && raw.count <= payloadBytes + 1
if (!rawOk) log(`WARN: the raw dump did not confirm writing ${rawPath}${rawClaimed ? ` (claimed ${raw.count ?? 'no'} bytes, expected ${payloadBytes})` : ''} — the report writer gets the data inline; the full findings also live in this run's journal`)
const reportPrompt = `You are the report writer of a security-mode joint code review (dual-review). Write the full review as Markdown to \`${reportPath}\` (create \`${reportDir}\` if missing; overwrite if it exists).
${rawOk ? `The data is the JSON file at \`${rawPath}\` — read it with the Read tool.` : `Data (JSON):\n${payload}`}

Structure: title with repository, date and mode; seats and any re-routes (Fable or Sonnet 5.5→Opus 5.5, Opus 5.5→Opus 5); a summary table by severity and verdict; then the findings — CONFIRMED by severity, then CONTESTED (claim and refutation side by side: the reader decides), then UNCERTAIN (say why), then MINORS (labeled unverified), then REFUTED in an appendix with the refutation. Each finding: id, seat, file:line, claim, failure scenario, evidence, fix hint, verdict and verdict reason, pre-existing flag. Close with each seat's ship verdict and assessment. Plain, direct prose; no praise. Read nothing beyond the data — the code was already read by the seats. Return the path and ok: true once the file is written.`
let report = await agent(reportPrompt, { agentType: LANE, label: 'write:duo-report', phase: 'Write', model: 'opus', effort: 'high', schema: WRITTEN })
if (!report) {
  log(`WARN: the report writer died on Opus 5.5 — re-running the identical prompt once on ${SEC_FALLBACK}`)
  report = await agent(reportPrompt, { agentType: LANE, label: 'write:duo-report:opus5-fallback', phase: 'Write', model: SEC_FALLBACK, effort: 'high', schema: WRITTEN })
  fallbacks.push({ writer: 'write:duo-report', model: 'opus', fallback: SEC_FALLBACK, ok: !!report })
  mode = modeOf()
}
if (!report || !report.ok) log(`WARN: the report writer did not confirm writing ${reportPath}`)

const row = (f) => ({ id: f.id, seat: f.seat, by: f.by, severity: f.severity, file: f.file, line: f.line ?? null, verdict: f.verdict, pre_existing: !!f.pre_existing })
return {
  mode,
  security: true,
  degraded,
  fallbacks,
  panel,
  counts,
  confirmed: confirmed.map(row),
  contested: contested.map(row),
  uncertain: uncertain.map(row),
  refuted: refuted.map(row),
  minors: minors.map(row),
  assessments: assessments.map(a => ({ seat: a.seat, model: a.model, ship: a.ship })),
  report: (report && report.ok) ? reportPath : null,
  raw: rawOk ? rawPath : null,
}
