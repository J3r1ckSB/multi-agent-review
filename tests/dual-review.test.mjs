// dual-review.test.mjs — scenario tests for workflows/dual-review.js under a stub Workflow runtime
// (tests/wf-harness.mjs). Run from the repository root: node tests/dual-review.test.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { run as runWf } from './wf-harness.mjs'
const WF = fileURLToPath(new URL('../workflows/', import.meta.url))
const DR = `${WF}dual-review.js`
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('PASS:', m) } else { fail++; console.log('FAIL:', m) } }
// Every dual-review call runs as the minimal `lane` agent (2026-10-07: a default workflow agent loads
// ~45k tokens of tools and skill listing it never uses).
const laneTally = { calls: 0, bad: [] }
const run = async (path, a, impl) => {
  const out = await runWf(path, a, impl)
  if (path === DR) for (const c of out.calls) {
    laneTally.calls++
    const want = 'lane'
    if (c.agentType !== want) laneTally.bad.push(`${c.label}=${c.agentType}`)
  }
  return out
}
const F = (sev, file = 'a.js') => ({ file, line: 1, claim: `CLAIM-${sev}`, failure_scenario: 'S', evidence: 'E', severity: sev })
const seatOut = (fs) => ({ findings: fs, assessment: 'ASSESS-TEXT', ship: false })
const verdictsFor = (prompt, verdict) => ({ verdicts: [...prompt.matchAll(/"id": "([AB]\d+\.\d+)"/g)].map(m => ({ id: m[1], verdict: typeof verdict === 'function' ? verdict(m[1]) : verdict, reason: 'R' })) })
// The raw-JSON writer stub reports what a faithful `wc -c` would print: the payload's UTF-8 bytes (it follows the
// prompt's first blank line), plus `extra` to simulate a truncated or padded file.
const rawOut = (p, extra = 0) => ({ path: '', ok: true, count: Buffer.byteLength(p.slice(p.indexOf('\n\n') + 2), 'utf8') + extra })
// Every dual-review run made through runDR is tallied: since 2026-10-04 no packet:build agent may spawn, no result may
// carry a `packet` field, and every Cross agent runs at xhigh (criticals) or high (majors) — never max.
const drTally = { runs: 0, packetCalls: 0, packetFields: 0, cross: 0, badCross: [] }
const runDR = async (a, impl) => {
  const out = await run(DR, a, impl)
  drTally.runs++
  drTally.packetCalls += out.calls.filter(c => c.label === 'packet:build').length
  if (out.result && 'packet' in out.result) drTally.packetFields++
  for (const c of out.calls.filter(c => c.label && c.label.startsWith('cross:'))) { drTally.cross++; if (c.effort !== 'xhigh' && c.effort !== 'high') drTally.badCross.push(`${c.label}@${c.effort}`) }
  return out
}
const STD = { files: 5, lines: 400 } // a standard-size change: three Opus seats + the fresh-eyes seat (Sonnet 5.5; Fable with args.fable)

// ---------- dual-review: standard, all alive ----------
{
  const impl = async (p, o) => {
    if (o.label === 'seat:opus-correctness') return seatOut([])
    if (o.label === 'seat:opus-robustness') return seatOut([F('critical'), F('major')])
    if (o.label === 'seat:opus-intent') return seatOut([F('major')])
    if (o.label === 'seat:fable-fresh') return seatOut([F('major'), F('minor')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, id => id === 'B1.1' ? 'refuted' : 'CONFIRMED')
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls } = await runDR({ context: 'ctx', repo: '/tmp/x y', fable: true, design: true, scale: STD }, impl)
  ok(!r.error && r.security === false, 'standard: runs without error')
  ok(calls.filter(c => c.label.startsWith('seat:')).length === 4, 'standard fable requested: 4 seats')
  ok(['seat:opus-correctness', 'seat:opus-robustness', 'seat:opus-intent'].every(l => { const c = calls.find(x => x.label === l); return c && c.model === 'opus' && c.effort === 'xhigh' }) && calls.filter(c => c.label.startsWith('seat:') && c.model === 'opus').length === 3, 'standard: 3 Opus seats (correctness/robustness/intent) at xhigh')
  ok(calls.some(c => c.label === 'seat:fable-fresh' && c.model === 'fable' && c.effort === 'xhigh' && /fresh eyes/.test(c.prompt)), 'standard fable requested: Fable fresh-eyes seat at xhigh')
  ok(r.mode === 'standard (3× Opus 5.5: correctness, robustness, intent + Fable 5.1 fresh eyes (requested)) · standard size', 'standard fable requested: mode label')
  ok(JSON.stringify(r.panel) === JSON.stringify({ size: 'standard', seats: ['opus-correctness', 'opus-robustness', 'opus-intent', 'fable-fresh'], fresh: true, freshReason: 'requested', sensitive: false, design: true, fable: true, freshModel: 'fable' }), 'standard fable requested: panel field')
  ok(!calls.some(c => c.label.startsWith('seat:sonnet-fresh') || (c.label.startsWith('seat:') && /sonnet/i.test(c.model || ''))), 'standard fable requested: fable-fresh replaces sonnet-fresh, no Sonnet seat')
  ok(!('packet' in r) && !calls.some(c => c.label === 'packet:build') && calls[0].label.startsWith('seat:'), 'standard: no packet:build agent and no packet field (packet removed 2026-10-04); the seats run first')
  ok(calls.some(c => c.label === 'cross:fable-verifies-A-crit' && c.model === 'fable' && c.effort === 'xhigh'), 'standard fable requested: A-crit lane on Fable at xhigh')
  ok(r.contested.length === 1 && r.contested[0].id === 'B1.1' && r.contested[0].severity === 'major', 'standard: refuted Fable major is contested (lower-case verdict normalized)')
  ok(r.confirmed.length === 3 && r.minors.length === 1 && r.fallbacks.length === 0, 'standard: buckets and no fallbacks')
  ok(calls[0].prompt.includes('git -C "/tmp/x y"'), 'standard: repo path quoted in git commands')
}
// ---------- dual-review: Fable seat dies → Opus fallback, A-crit lane moves to Opus ----------
{
  const impl = async (p, o) => {
    if (o.label === 'seat:fable-fresh') return null
    if (o.label === 'seat:fable-fresh:opus-fallback') return seatOut([F('major')])
    if (o.label.startsWith('seat:')) return seatOut([F('critical')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, id => id.startsWith('B') ? 'REFUTED' : 'CONFIRMED')
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls } = await runDR({ context: 'ctx', fable: true }, impl)
  const fb = calls.find(c => c.label === 'seat:fable-fresh:opus-fallback')
  ok(fb && fb.model === 'opus' && fb.effort === 'xhigh', 'fable seat dead: identical prompt re-run on Opus xhigh')
  ok(fb && fb.prompt === calls.find(c => c.label === 'seat:fable-fresh').prompt, 'fable seat dead: prompt is byte-identical')
  ok(r.fallbacks.length === 1 && r.fallbacks[0].ok === true && r.degraded.length === 0, 'fable seat dead: fallbacks recorded, not degraded')
  ok(calls.some(c => c.label.startsWith('cross:opus-verifies-A-crit')) && !calls.some(c => c.label.startsWith('cross:fable-')), 'fable seat dead: A-crit lane re-routed to Opus')
  ok(calls.filter(c => c.label.startsWith('cross:opus-verifies-A-crit')).every(c => c.model === 'opus' && c.effort === 'xhigh'), 'fable seat dead: A-crit lane still at xhigh on Opus')
  ok(r.refuted.length === 1 && r.contested.length === 0 && r.refuted[0].by === 'opus', 'fable seat dead: fallback seat major refuted is NOT contested (by=opus)')
  ok(r.mode.includes('re-routed'), 'fable seat dead: mode says re-routed')
}
// ---------- dual-review: standard noFable → three Opus seats + the Sonnet 5.5 fresh seat (group B) ----------
{
  const impl = async (p, o) => {
    if (o.label.startsWith('seat:')) return seatOut([F('critical'), F('major')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls } = await runDR({ context: 'ctx', noFable: true }, impl)
  const seatCalls = calls.filter(c => c.label.startsWith('seat:'))
  ok(seatCalls.length === 4 && seatCalls.filter(c => c.label.startsWith('seat:opus-')).length === 3 && seatCalls.filter(c => c.label.startsWith('seat:opus-')).every(c => c.model === 'opus' && c.effort === 'xhigh') && seatCalls.some(c => c.label === 'seat:sonnet-fresh' && c.model === 'claude-sonnet-5-5' && c.effort === 'xhigh') && !calls.some(c => c.model === 'fable') && !seatCalls.some(c => c.label.includes('fable')), 'standard noFable: 3 Opus seats + seat:sonnet-fresh on claude-sonnet-5-5 xhigh, no Fable seat')
  ok(calls.some(c => c.label.startsWith('cross:opus-verifies-A-crit') && c.model === 'opus' && c.effort === 'xhigh'), 'standard noFable: A-crit lane on Opus at xhigh')
  ok(calls.some(c => c.label === 'cross:opus-verifies-B-crit' && c.model === 'opus' && c.effort === 'xhigh') && calls.filter(c => c.label.startsWith('cross:')).every(c => c.model === 'opus'), 'standard noFable: the Sonnet seat\'s critical goes to the B-crit lane on Opus at xhigh; every Cross lane on Opus')
  ok(r.mode === 'standard (3× Opus 5.5: correctness, robustness, intent + Sonnet 5.5 fresh eyes) · size unknown · noFable' && r.confirmed.length === 8 && r.fallbacks.length === 0 && r.degraded.length === 0 && r.panel.freshModel === 'sonnet' && r.panel.freshReason === 'default', 'standard noFable: mode label, all findings verified, not degraded, panel.freshModel sonnet')
}
// ---------- dual-review: default small change → 2 Opus seats + the Sonnet 5.5 fresh seat, no Fable anywhere ----------
{
  const impl = async (p, o) => {
    if (o.label === 'seat:sonnet-fresh') return seatOut([F('critical', 's.ts'), F('major', 's.ts')])
    if (o.label.startsWith('seat:')) return seatOut([F('critical')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, id => id.startsWith('B') && p.includes('"claim": "CLAIM-major"') && !p.includes('"claim": "CLAIM-critical"') ? 'REFUTED' : 'CONFIRMED')
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls } = await runDR({ context: 'ctx', scale: { files: 1, lines: 30 } }, impl)
  const seatCalls = calls.filter(c => c.label.startsWith('seat:'))
  ok(seatCalls.map(c => c.label).join() === 'seat:opus-correctness,seat:opus-intent,seat:sonnet-fresh' && seatCalls.find(c => c.label === 'seat:sonnet-fresh').model === 'claude-sonnet-5-5' && seatCalls.every(c => c.effort === 'xhigh'), 'default small: 3 seats — opus-correctness, opus-intent, sonnet-fresh (claude-sonnet-5-5), all xhigh')
  ok(!calls.some(c => c.model === 'fable') && r.panel.freshModel === 'sonnet' && r.panel.fresh === true && r.panel.freshReason === 'default' && r.panel.fable === false, 'default small: no agent on Fable; panel.freshModel sonnet, freshReason default')
  ok(calls.some(c => c.label === 'cross:opus-verifies-A-crit' && c.model === 'opus' && c.effort === 'xhigh') && calls.filter(c => c.label.startsWith('cross:')).every(c => c.model === 'opus'), 'default small: A-crit cross on Opus at xhigh, Sonnet never verifies')
  const sp = seatCalls.find(c => c.label === 'seat:sonnet-fresh').prompt
  ok(/fresh eyes/.test(sp) && sp.includes('a different model from the other seats and from the architect (Opus 5.5)') && !sp.includes('model family') && !/Do not write exploit code/.test(sp), 'default small: sonnet-fresh prompt carries the reworded fresh lens, no security hygiene')
  ok(r.refuted.length === 1 && r.refuted[0].seat === 'sonnet-fresh' && r.refuted[0].by === 'claude-sonnet-5-5' && r.refuted[0].severity === 'major' && r.contested.length === 0, 'default small: a refuted Sonnet major is an ordinary refutation (by=claude-sonnet-5-5), not contested')
  ok(r.mode === 'standard (2× Opus 5.5: correctness, intent + Sonnet 5.5 fresh eyes) · small change', 'default small: mode label')
}
// ---------- dual-review: dead Sonnet fresh seat → identical prompt re-run on Opus 5.5 xhigh ----------
{
  const impl = (opusOk) => async (p, o) => {
    if (o.label === 'seat:sonnet-fresh') return null
    if (o.label === 'seat:sonnet-fresh:opus-fallback') return opusOk ? seatOut([F('major', 's.ts')]) : null
    if (o.label.startsWith('seat:')) return seatOut([])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'REFUTED')
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls } = await runDR({ context: 'ctx', scale: STD }, impl(true))
  const orig = calls.find(c => c.label === 'seat:sonnet-fresh'), fb = calls.filter(c => c.label === 'seat:sonnet-fresh:opus-fallback')
  ok(fb.length === 1 && fb[0].model === 'opus' && fb[0].effort === 'xhigh' && fb[0].prompt === orig.prompt, 'sonnet seat dead: one identical re-run on Opus 5.5 xhigh')
  ok(JSON.stringify(r.fallbacks) === JSON.stringify([{ seat: 'sonnet-fresh', model: 'claude-sonnet-5-5', fallback: 'opus', ok: true }]) && r.degraded.length === 0 && /re-routed \(1 re-route\(s\)\): sonnet-fresh claude-sonnet-5-5→opus/.test(r.mode), 'sonnet seat dead: fallback recorded, not degraded, mode names the re-route')
  ok(r.refuted.length === 1 && r.refuted[0].by === 'opus' && r.contested.length === 0 && !calls.some(c => c.label.includes('opus5-fallback')), 'sonnet seat dead: fallback findings carry by=opus; non-security → no Opus 5 re-run')
  const { result: r2 } = await runDR({ context: 'ctx', scale: STD }, impl(false))
  ok(r2.degraded.length === 1 && r2.degraded[0].seat === 'sonnet-fresh' && r2.degraded[0].model === 'claude-sonnet-5-5' && r2.fallbacks.length === 1 && r2.fallbacks[0].ok === false && /^degraded/.test(r2.mode), 'sonnet seat dead twice (non-security): degraded, fallback recorded not ok')
}
// ---------- dual-review: Fable cross job dies → Opus fallback ----------
{
  const impl = async (p, o) => {
    if (o.label.startsWith('seat:opus-robustness')) return seatOut([F('critical')])
    if (o.label.startsWith('seat:')) return seatOut([])
    if (o.label === 'cross:fable-verifies-A-crit') return null
    if (o.label === 'cross:fable-verifies-A-crit:opus-fallback') return verdictsFor(p, 'CONFIRMED')
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls } = await runDR({ context: 'ctx', fable: true }, impl)
  ok(calls.some(c => c.label === 'cross:fable-verifies-A-crit:opus-fallback' && c.model === 'opus' && c.effort === 'xhigh'), 'fable cross dead: re-run on Opus at xhigh')
  ok(r.confirmed.length === 1 && r.uncertain.length === 0 && r.fallbacks.some(f => f.cross), 'fable cross dead: critical confirmed via fallback, recorded')
}
// ---------- dual-review: dead Opus cross job on a standard run → one identical retry on Opus 5.5 ----------
{
  const impl = async (p, o) => {
    if (o.label === 'seat:opus-intent') return seatOut([F('major')])
    if (o.label.startsWith('seat:')) return seatOut([])
    if (o.label === 'cross:opus-verifies-major') return null
    if (o.label === 'cross:opus-verifies-major:retry') return verdictsFor(p, 'CONFIRMED')
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls } = await runDR({ context: 'ctx', scale: STD }, impl)
  const orig = calls.find(c => c.label === 'cross:opus-verifies-major'), re = calls.find(c => c.label === 'cross:opus-verifies-major:retry')
  ok(re && re.model === 'opus' && re.effort === orig.effort && re.prompt === orig.prompt, 'standard opus cross dead: one identical retry on Opus 5.5 at the same effort')
  ok(r.confirmed.length === 1 && r.uncertain.length === 0 && r.fallbacks.some(f => f.cross === 'cross:opus-verifies-major' && f.fallback === 'opus' && f.ok), 'standard opus cross dead: retry verdicts accepted and recorded')
  ok(!calls.some(c => c.label.includes('opus5-fallback')), 'standard opus cross dead: no Opus 5 re-run outside security')
}
// ---------- dual-review: args.fable must be exactly true ----------
{
  const impl = async (p, o) => o.label.startsWith('seat:') ? seatOut([]) : (() => { throw new Error('unexpected ' + o.label) })()
  const { calls } = await runDR({ context: 'ctx', scale: STD, fable: 'yes' }, impl)
  ok(calls.some(c => c.label === 'seat:sonnet-fresh') && !calls.some(c => c.model === 'fable'), 'fable: "yes" (truthy string) does not seat Fable — the Sonnet fresh seat runs')
}
// ---------- dual-review: security mode ----------
{
  const impl = async (p, o) => {
    if (o.label === 'seat:opus-defensive') return seatOut([F('critical', 'auth.ts'), F('minor')])
    if (o.label.startsWith('seat:')) return seatOut([F('major')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    if (o.label === 'write:raw-json') return rawOut(p)
    if (o.label === 'write:duo-report') return { path: '', ok: true }
    throw new Error('unexpected ' + o.label)
  }
  const e1 = await runDR({ context: 'ctx', security: true }, impl)
  ok(!!e1.result.error, 'security: missing reportDir/date → error')
  const e2 = await runDR({ context: 'ctx', security: true, repo: '/r', reportDir: '/r/sub', date: '2026-09-01' }, impl)
  ok(!!e2.result.error, 'security: reportDir inside repo → error')
  const { result: r, calls } = await runDR({ context: 'ctx', security: true, repo: '/r/app', reportDir: '/h/audits', date: '2026-09-01' }, impl)
  ok(calls.filter(c => c.label.startsWith('seat:')).length === 5 && calls.some(c => c.label === 'seat:opus-defensive' && c.model === 'opus' && c.effort === 'xhigh'), 'security: 5 seats incl. the Opus defensive seat')
  ok(['seat:opus-correctness', 'seat:opus-robustness', 'seat:opus-intent'].every(l => calls.some(c => c.label === l && c.model === 'opus' && c.effort === 'xhigh')) && calls.some(c => c.label === 'seat:sonnet-fresh' && c.model === 'claude-sonnet-5-5' && c.effort === 'xhigh') && !calls.some(c => c.label === 'seat:fable-fresh') && !calls.some(c => c.model === 'fable'), 'security: 3 Opus xhigh + defensive + seat:sonnet-fresh (claude-sonnet-5-5 xhigh), no Fable call at all')
  ok((p => /fresh eyes/.test(p) && /Do not write exploit code/.test(p) && /stay inside this repository/.test(p))(calls.find(c => c.label === 'seat:sonnet-fresh').prompt), 'security: sonnet-fresh prompt carries the security brief hygiene')
  ok(calls.filter(c => c.label.startsWith('cross:')).every(c => c.model === 'opus'), 'security: every Cross lane on Opus')
  ok(calls.some(c => c.label === 'write:raw-json' && c.model === 'claude-sonnet-5-5' && c.effort === 'low') && calls.some(c => c.label === 'write:duo-report' && c.model === 'opus'), 'security: raw dump (claude-sonnet-5-5 low) then report (Opus)')
  ok(r.mode === 'security (4× Opus 5.5: correctness, robustness, intent, defensive + Sonnet 5.5 fresh eyes) · size unknown' && r.panel.fresh === true && r.panel.freshModel === 'sonnet' && r.panel.seats.join() === 'opus-correctness,opus-robustness,opus-intent,opus-defensive,sonnet-fresh' && !('packet' in r), 'security: mode label and panel in the return, no packet field')
  const s = JSON.stringify(r)
  ok(!s.includes('CLAIM-') && !s.includes('ASSESS-TEXT') && !s.includes('"evidence"'), 'security: no claim/evidence/assessment text in the return')
  ok(r.report === '/h/audits/app-2026-09-01-duo.md' && r.raw === '/h/audits/app-2026-09-01-duo-raw.json', 'security: report and raw paths')
  ok(r.confirmed.length === 5 && r.confirmed[0].file === 'auth.ts' && r.confirmed[0].verdict === 'CONFIRMED' && r.counts.minor === 1 && r.confirmed.some(f => f.seat === 'sonnet-fresh' && f.by === 'claude-sonnet-5-5'), 'security: rows carry id/file/verdict and counts; sonnet-fresh rows carry by=claude-sonnet-5-5')
  ok(calls.find(c => c.label === 'write:duo-report').prompt.includes('/h/audits/app-2026-09-01-duo-raw.json'), 'security: report writer reads the raw file')
  ok((sc => sc.length === 2 && sc.every(c => ['write:raw-json', 'seat:sonnet-fresh'].includes(c.label) && c.model === 'claude-sonnet-5-5'))(calls.filter(c => /sonnet/i.test(c.model || ''))), 'security: the Sonnet calls are the write:raw-json transcriber and seat:sonnet-fresh, each pinned to claude-sonnet-5-5')
}
// ---------- dual-review security: the raw dump is trusted only when `wc -c` matches the payload's UTF-8 bytes ----------
{
  const SEC = { context: 'ctx — ñ€ (multibyte: bytes differ from chars)', security: true, repo: '/r/app', reportDir: '/h/audits', date: '2026-09-22' }
  const rawPath = '/h/audits/app-2026-09-22-duo-raw.json'
  const implFor = (extra) => async (p, o) => {
    if (o.label === 'seat:opus-defensive') return seatOut([F('critical', 'auth.ts')])
    if (o.label.startsWith('seat:')) return seatOut([])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    if (o.label === 'write:raw-json') return rawOut(p, extra)
    if (o.label === 'write:duo-report') return { path: '', ok: true }
    throw new Error('unexpected ' + o.label)
  }
  const rp = (x) => x.calls.find(c => c.label === 'write:duo-report').prompt
  const short = await runDR(SEC, implFor(-1))
  ok(short.result.raw === null && rp(short).includes('Data (JSON):') && rp(short).includes('CLAIM-critical') && !rp(short).includes(rawPath) && short.logs.some(l => /raw dump did not confirm.*claimed \d+ bytes, expected \d+/.test(l)) && short.calls.filter(c => c.label.startsWith('write:raw-json')).length === 1, 'dual-review raw short count: not trusted, report gets the data inline, WARN names claimed vs expected bytes, no raw re-run')
  const exact = await runDR(SEC, implFor(0))
  ok(exact.result.raw === rawPath && rp(exact).includes(rawPath) && !rp(exact).includes('Data (JSON):') && !rp(exact).includes('CLAIM-') && exact.calls.find(c => c.label === 'write:raw-json').prompt.includes('wc -c <'), 'dual-review raw matching count: report reads the file, no inline data; transcriber asked for wc -c')
  const plus1 = await runDR(SEC, implFor(1))
  ok(plus1.result.raw === rawPath && rp(plus1).includes(rawPath) && !plus1.logs.some(l => l.includes('raw dump did not confirm')), 'dual-review raw count = bytes + 1: accepted (trailing newline)')
}
// ---------- dual-review security: dead Opus 5.5 lanes re-run once on Opus 5 ----------
{
  const SEC = { context: 'ctx', security: true, repo: '/r/app', reportDir: '/h/audits', date: '2026-09-22' }
  // seat dies on Opus 5.5 → identical prompt on claude-opus-5 at the seat's effort, not degraded
  const impl = async (p, o) => {
    if (o.label === 'seat:opus-robustness') return null
    if (o.label === 'seat:opus-robustness:opus5-fallback') return seatOut([F('major')])
    if (o.label.startsWith('seat:')) return seatOut([])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    if (o.label === 'write:raw-json') return rawOut(p)
    if (o.label.startsWith('write:')) return { path: '', ok: true }
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls } = await runDR(SEC, impl)
  const fb = calls.filter(c => c.label === 'seat:opus-robustness:opus5-fallback')
  ok(fb.length === 1 && fb[0].model === 'claude-opus-5' && fb[0].effort === 'xhigh' && fb[0].prompt === calls.find(c => c.label === 'seat:opus-robustness').prompt, 'security opus seat dead: one identical re-run on claude-opus-5 at the seat effort')
  ok(r.fallbacks.some(f => f.seat === 'opus-robustness' && f.model === 'opus' && f.fallback === 'claude-opus-5' && f.ok) && r.degraded.length === 0, 'security opus seat dead: fallback recorded, not degraded')
  ok(r.confirmed.length === 1 && r.confirmed[0].by === 'claude-opus-5' && /re-route/.test(r.mode), 'security opus seat dead: findings carry by=claude-opus-5, mode counts the re-route')
  // cross job on Opus dies → re-run on claude-opus-5 at the same effort, its verdicts accepted
  const implC = async (p, o) => {
    if (o.label === 'seat:opus-intent') return seatOut([F('major')])
    if (o.label.startsWith('seat:')) return seatOut([])
    if (o.label === 'cross:opus-verifies-major') return null
    if (o.label === 'cross:opus-verifies-major:opus5-fallback') return verdictsFor(p, 'CONFIRMED')
    if (o.label === 'write:raw-json') return rawOut(p)
    if (o.label.startsWith('write:')) return { path: '', ok: true }
    throw new Error('unexpected ' + o.label)
  }
  const { result: rc, calls: cc } = await runDR(SEC, implC)
  const orig = cc.find(c => c.label === 'cross:opus-verifies-major'), fc = cc.find(c => c.label === 'cross:opus-verifies-major:opus5-fallback')
  ok(fc && fc.model === 'claude-opus-5' && fc.effort === orig.effort && fc.prompt === orig.prompt, 'security opus cross dead: identical re-run on claude-opus-5 at the same effort')
  ok(rc.confirmed.length === 1 && rc.uncertain.length === 0 && rc.fallbacks.some(f => f.cross === 'cross:opus-verifies-major' && f.fallback === 'claude-opus-5'), 'security opus cross dead: fallback verdicts accepted and recorded')
  // report writer dies → re-run on claude-opus-5
  const implW = async (p, o) => o.label === 'write:duo-report' ? null : (o.label === 'write:duo-report:opus5-fallback' ? { path: '', ok: true } : impl(p, o))
  const { result: rw, calls: cw } = await runDR(SEC, implW)
  ok(cw.some(c => c.label === 'write:duo-report:opus5-fallback' && c.model === 'claude-opus-5') && rw.report === '/h/audits/app-2026-09-22-duo.md' && rw.fallbacks.some(f => f.writer === 'write:duo-report'), 'security report writer dead: re-run on claude-opus-5, report path returned')
  // NON-security: a dead Opus seat gets NO opus5 re-run and is degraded as before
  const implN = async (p, o) => {
    if (o.label === 'seat:opus-robustness') return null
    if (o.label.startsWith('seat:')) return seatOut([])
    return null
  }
  const { result: rn, calls: cn } = await runDR({ context: 'ctx' }, implN)
  ok(!cn.some(c => c.label.includes('opus5-fallback') || c.model === 'claude-opus-5') && rn.degraded.some(d => d.seat === 'opus-robustness') && rn.fallbacks.length === 0, 'non-security opus seat dead: no Opus 5 re-run, degraded as before')
}
// ---------- dual-review: panel matrix (size class, design, noFable, security) ----------
{
  const impl = async (p, o) => {
    if (o.label.startsWith('seat:')) return seatOut([F('critical'), F('major')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    if (o.label === 'write:raw-json') return rawOut(p)
    if (o.label.startsWith('write:')) return { path: '', ok: true }
    throw new Error('unexpected ' + o.label)
  }
  const seatsOf = (calls) => calls.filter(c => c.label.startsWith('seat:')).map(c => c.label)
  const SEC = { context: 'ctx', security: true, repo: '/r/app', reportDir: '/h/audits', date: '2026-09-28' }
  const SEC4 = ['seat:opus-correctness', 'seat:opus-robustness', 'seat:opus-intent', 'seat:opus-defensive']
  const SECS = [...SEC4, 'seat:sonnet-fresh']
  const SONNET_OK = (calls) => calls.filter(c => c.label === 'seat:sonnet-fresh').length === 1 && calls.find(c => c.label === 'seat:sonnet-fresh').model === 'claude-sonnet-5-5' && calls.find(c => c.label === 'seat:sonnet-fresh').effort === 'xhigh'
  // security: four Opus seats whatever the size + the Sonnet 5.5 fresh seat, no Fable call at all unless args.fable (and never under noFable)
  for (const [extra, what] of [[{}, 'no scale'], [{ scale: { files: 1, lines: 10 } }, 'small scale'], [{ scale: { files: 40, lines: 5000 }, design: true }, 'jumbo + design, Fable not requested'], [{ scale: { files: 40, lines: 5000 }, design: true, noFable: true }, 'jumbo + design + noFable'], [{ noFable: true }, 'noFable']]) {
    const { result: r, calls } = await runDR({ ...SEC, ...extra }, impl)
    ok(seatsOf(calls).join() === SECS.join() && calls.filter(c => c.label.startsWith('seat:opus-')).every(c => c.model === 'opus' && c.effort === 'xhigh') && SONNET_OK(calls) && !calls.some(c => c.model === 'fable') && calls.filter(c => c.label.startsWith('cross:')).every(c => c.model === 'opus') && r.panel.seats.join() === SECS.map(l => l.slice(5)).join() && r.panel.fresh === true && r.panel.freshReason === 'default' && r.panel.freshModel === 'sonnet', `panel security (${what}): 4 Opus xhigh seats incl. seat:opus-defensive + seat:sonnet-fresh xhigh, Cross on Opus, no Fable call at all`)
  }
  const sm = await runDR({ ...SEC, scale: { files: 1, lines: 10 } }, impl)
  ok(sm.result.mode === 'security (4× Opus 5.5: correctness, robustness, intent, defensive + Sonnet 5.5 fresh eyes) · small change' && sm.result.panel.size === 'small', 'panel security small: the size class is recorded but never shrinks the panel')
  // standard small → exactly correctness + intent + the Sonnet fresh seat
  const s1 = await runDR({ context: 'ctx', scale: { files: 3, lines: 150 } }, impl)
  ok(seatsOf(s1.calls).join() === 'seat:opus-correctness,seat:opus-intent,seat:sonnet-fresh' && s1.calls.filter(c => c.label.startsWith('seat:opus-')).every(c => c.model === 'opus' && c.effort === 'xhigh') && SONNET_OK(s1.calls), 'panel standard small (3 files, 150 lines): exactly seat:opus-correctness + seat:opus-intent on Opus xhigh + seat:sonnet-fresh')
  ok(s1.result.mode === 'standard (2× Opus 5.5: correctness, intent + Sonnet 5.5 fresh eyes) · small change' && JSON.stringify(s1.result.panel) === JSON.stringify({ size: 'small', seats: ['opus-correctness', 'opus-intent', 'sonnet-fresh'], fresh: true, freshReason: 'default', sensitive: false, design: false, fable: false, freshModel: 'sonnet' }) && !s1.logs.some(l => l.includes('args.scale')), 'panel standard small: mode label, panel field, no scale WARN')
  ok(s1.calls.some(c => c.label === 'cross:opus-verifies-A-crit' && c.model === 'opus' && c.effort === 'xhigh') && !s1.calls.some(c => c.model === 'fable') && s1.result.confirmed.length === 6, 'panel standard small (default): group-A criticals verified by an independent Opus context at xhigh, no Fable call')
  // scale absent or invalid → 3 Opus seats + the Sonnet seat + one WARN
  for (const [a, what] of [[{}, 'absent'], [{ scale: { files: -1, lines: 10 } }, 'negative'], [{ scale: { files: 2, lines: '10' } }, 'string'], [{ scale: { files: 2, lines: Infinity } }, 'infinite'], [{ scale: { files: 2 } }, 'lines missing'], [{ scale: 'big' }, 'not an object']]) {
    const x = await runDR({ context: 'ctx', ...a }, impl)
    ok(seatsOf(x.calls).join() === 'seat:opus-correctness,seat:opus-robustness,seat:opus-intent,seat:sonnet-fresh' && x.result.panel.size === 'unknown' && x.logs.filter(l => /WARN: args\.scale absent or invalid.*defaulted to the standard size/.test(l)).length === 1 && x.result.mode === 'standard (3× Opus 5.5: correctness, robustness, intent + Sonnet 5.5 fresh eyes) · size unknown', `panel scale ${what}: 3 Opus seats + Sonnet fresh seat, size unknown, one WARN`)
  }
  // boundaries: 151 lines or 4 files → standard; 1500 lines / 15 files → standard; 1501 lines or 16 files → jumbo
  for (const [sc, size] of [[{ files: 3, lines: 151 }, 'standard'], [{ files: 4, lines: 10 }, 'standard'], [{ files: 15, lines: 1500 }, 'standard'], [{ files: 2, lines: 1501 }, 'jumbo'], [{ files: 16, lines: 20 }, 'jumbo'], [{ files: 0, lines: 0 }, 'small']]) {
    const x = await runDR({ context: 'ctx', scale: sc }, impl)
    ok(x.result.panel.size === size && x.result.panel.seats.length === (size === 'small' ? 3 : 4) && x.result.panel.seats[x.result.panel.seats.length - 1] === 'sonnet-fresh' && !x.calls.some(c => c.model === 'fable'), `panel boundary ${sc.files} files / ${sc.lines} lines → ${size}`)
  }
  // 2026-10-04: Fable is opt-in — design and jumbo no longer seat it; only args.fable does
  const d = await runDR({ context: 'ctx', design: true, scale: { files: 20, lines: 900 } }, impl)
  ok(seatsOf(d.calls).join() === 'seat:opus-correctness,seat:opus-robustness,seat:opus-intent,seat:sonnet-fresh' && !d.calls.some(c => c.model === 'fable') && d.calls.some(c => c.label === 'cross:opus-verifies-A-crit' && c.model === 'opus' && c.effort === 'xhigh') && JSON.stringify(d.result.panel) === JSON.stringify({ size: 'jumbo', seats: ['opus-correctness', 'opus-robustness', 'opus-intent', 'sonnet-fresh'], fresh: true, freshReason: 'default', sensitive: false, design: true, fable: false, freshModel: 'sonnet' }) && d.result.mode === 'standard (3× Opus 5.5: correctness, robustness, intent + Sonnet 5.5 fresh eyes) · jumbo change', 'panel default design + jumbo: no seat:fable-fresh (the Sonnet seat instead), no Fable call anywhere, A-crit on Opus at xhigh, panel.design recorded')
  const fq = await runDR({ context: 'ctx', fable: true, scale: { files: 1, lines: 5 } }, impl)
  ok(seatsOf(fq.calls).join() === 'seat:opus-correctness,seat:opus-intent,seat:fable-fresh' && fq.calls.some(c => c.label === 'seat:fable-fresh' && c.model === 'fable' && c.effort === 'xhigh') && !fq.calls.some(c => c.label.startsWith('seat:sonnet-fresh')) && fq.result.panel.fresh === true && fq.result.panel.freshReason === 'requested' && fq.result.panel.freshModel === 'fable' && fq.result.panel.fable === true && fq.result.panel.design === false && fq.result.mode === 'standard (2× Opus 5.5: correctness, intent + Fable 5.1 fresh eyes (requested)) · small change', 'panel fable requested (small): fable-fresh seated on Fable xhigh instead of sonnet-fresh, reason requested, panel.fable true, freshModel fable')
  ok(fq.calls.some(c => c.label === 'cross:fable-verifies-A-crit' && c.model === 'fable' && c.effort === 'xhigh') && !fq.calls.some(c => c.label.startsWith('cross:opus-verifies-A-crit')), 'panel fable requested (small): group-A criticals verified cross-model by Fable at xhigh')
  for (const [a, what] of [[{ scale: STD }, 'standard'], [{ design: true, scale: { files: 30, lines: 3000 } }, 'design + jumbo']]) {
    const x = await runDR({ context: 'ctx', fable: true, noFable: true, ...a }, impl)
    ok(!seatsOf(x.calls).includes('seat:fable-fresh') && SONNET_OK(x.calls) && !x.calls.some(c => c.model === 'fable') && x.calls.some(c => c.label === 'cross:opus-verifies-A-crit') && x.result.panel.fresh === true && x.result.panel.freshModel === 'sonnet' && x.result.panel.fable === false && / \+ Sonnet 5\.5 fresh eyes\) · .* · Fable requested, noFable$/.test(x.result.mode) && x.logs.filter(l => /^WARN: Fable was requested \(args\.fable\) but noFable is set — the fresh-eyes seat runs on Sonnet 5\.5, not Fable$/.test(l)).length === 1, `panel fable + noFable (${what}): the Sonnet seat instead of Fable, no Fable agent, one WARN, mode names both`)
  }
  // noFable + design (and + jumbo) → the Sonnet fresh seat, no Fable call
  for (const [a, what] of [[{ design: true, scale: STD }, 'design'], [{ design: true, scale: { files: 30, lines: 3000 } }, 'design + jumbo']]) {
    const x = await runDR({ context: 'ctx', noFable: true, ...a }, impl)
    ok(!seatsOf(x.calls).includes('seat:fable-fresh') && SONNET_OK(x.calls) && !x.calls.some(c => c.model === 'fable') && x.result.panel.fresh === true && x.result.panel.freshReason === 'default' && / · noFable$/.test(x.result.mode) && !x.logs.some(l => l.startsWith('WARN: Fable was requested')), `panel noFable + ${what}: the Sonnet fresh seat, no Fable call, mode names noFable`)
  }
  // standard, not design, not jumbo → the Sonnet fresh seat in group B
  const n = await runDR({ context: 'ctx', scale: STD }, impl)
  ok(seatsOf(n.calls).join() === 'seat:opus-correctness,seat:opus-robustness,seat:opus-intent,seat:sonnet-fresh' && n.result.panel.fresh === true && n.result.mode === 'standard (3× Opus 5.5: correctness, robustness, intent + Sonnet 5.5 fresh eyes) · standard size' && n.calls.some(c => c.label === 'cross:opus-verifies-B-crit' && c.model === 'opus' && c.effort === 'xhigh'), 'panel standard non-design non-jumbo: 3 Opus seats + the Sonnet fresh seat, its criticals in the B-crit lane on Opus xhigh')
  // sensitive vetoes the small tier on a standard review
  const OPUS3 = 'seat:opus-correctness,seat:opus-robustness,seat:opus-intent'
  const sv = await runDR({ context: 'ctx', sensitive: true, scale: { files: 1, lines: 10 } }, impl)
  ok(seatsOf(sv.calls).join() === `${OPUS3},seat:sonnet-fresh` && sv.calls.filter(c => c.label.startsWith('seat:opus-')).every(c => c.model === 'opus' && c.effort === 'xhigh') && sv.result.mode === 'standard (3× Opus 5.5: correctness, robustness, intent + Sonnet 5.5 fresh eyes) · small change, sensitive → full panel' && JSON.stringify(sv.result.panel) === JSON.stringify({ size: 'small', seats: ['opus-correctness', 'opus-robustness', 'opus-intent', 'sonnet-fresh'], fresh: true, freshReason: 'default', sensitive: true, design: false, fable: false, freshModel: 'sonnet' }), 'panel small + sensitive: full 3-seat Opus panel + Sonnet fresh seat, mode names the veto, panel.sensitive true')
  const ss = await runDR({ context: 'ctx', sensitive: true, scale: STD }, impl)
  ok(seatsOf(ss.calls).join() === `${OPUS3},seat:sonnet-fresh` && ss.result.mode === 'standard (3× Opus 5.5: correctness, robustness, intent + Sonnet 5.5 fresh eyes) · standard size' && ss.result.panel.sensitive === true, 'panel standard size + sensitive: no effect, no veto note in the mode')
  // sensitive has no effect on a security run
  const secS = await runDR({ ...SEC, sensitive: true, scale: { files: 1, lines: 10 } }, impl)
  ok(seatsOf(secS.calls).join() === SECS.join() && !secS.calls.some(c => c.model === 'fable') && secS.result.mode === 'security (4× Opus 5.5: correctness, robustness, intent, defensive + Sonnet 5.5 fresh eyes) · small change' && secS.result.panel.sensitive === true && secS.result.panel.seats.length === 5, 'panel security + small + sensitive: sensitive has no effect (same 4 Opus seats + Sonnet seat, same mode label)')
  // security + fable requested (any size) → the Fable fresh-eyes seat joins as an originating group-B seat; every Cross lane stays on Opus
  const implF = async (p, o) => {
    if (o.label === 'seat:fable-fresh') return seatOut([F('critical', 'f.ts'), F('major', 'f.ts'), F('minor')])
    if (o.label.startsWith('seat:')) return seatOut([F('critical'), F('major')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    if (o.label === 'write:raw-json') return rawOut(p)
    if (o.label.startsWith('write:')) return { path: '', ok: true }
    throw new Error('unexpected ' + o.label)
  }
  const SEC5 = [...SEC4, 'seat:fable-fresh']
  const ROW = 'id,seat,by,severity,file,line,verdict,pre_existing'
  for (const [extra, what, size, sizeNote] of [[{ fable: true }, 'fable', 'unknown', 'size unknown'], [{ fable: true, scale: { files: 1, lines: 10 } }, 'fable + small', 'small', 'small change']]) {
    const { result: r, calls } = await runDR({ ...SEC, ...extra }, implF)
    const cross = calls.filter(c => c.label.startsWith('cross:'))
    ok(seatsOf(calls).join() === SEC5.join() && calls.some(c => c.label === 'seat:fable-fresh' && c.model === 'fable' && c.effort === 'xhigh' && /fresh eyes/.test(c.prompt)) && calls.filter(c => c.label.startsWith('seat:opus-')).every(c => c.model === 'opus' && c.effort === 'xhigh'), `security + ${what}: 5 seats — 4 Opus xhigh + seat:fable-fresh on Fable xhigh`)
    ok(r.mode === `security (4× Opus 5.5: correctness, robustness, intent, defensive + Fable 5.1 fresh eyes (requested)) · ${sizeNote}` && JSON.stringify(r.panel) === JSON.stringify({ size, seats: SEC5.map(l => l.slice(5)), fresh: true, freshReason: 'requested', sensitive: false, design: false, fable: true, freshModel: 'fable' }) && !calls.some(c => c.label.startsWith('seat:sonnet-fresh')), `security + ${what}: mode label and panel, no Sonnet seat`)
    ok(['A-crit', 'B-crit', 'major'].every(t => cross.some(c => c.label.includes(t))) && cross.every(c => c.model === 'opus') && calls.filter(c => c.model === 'fable').map(c => c.label).join() === 'seat:fable-fresh', `security + ${what}: every Cross lane (A-crit, B-crit, major) on Opus; Fable only in the fresh seat`)
    const s = JSON.stringify(r)
    ok(r.confirmed.some(f => f.seat === 'fable-fresh' && f.by === 'fable' && /^B2\./.test(f.id)) && !s.includes('CLAIM-') && !s.includes('ASSESS-TEXT') && !s.includes('"evidence"') && ['confirmed', 'contested', 'uncertain', 'refuted', 'minors'].every(k => r[k].every(row => Object.keys(row).join() === ROW)) && r.report !== null && r.raw !== null, `security + ${what}: fresh findings originate in group B (B2.x), the return stays routing-level rows only`)
  }
  const hy = p => /Do not write exploit code/.test(p) && /stay inside this repository/.test(p)
  const hs = await runDR({ ...SEC, fable: true }, implF), hstd = await runDR({ context: 'ctx', fable: true, scale: STD }, implF)
  ok(hy(hs.calls.find(c => c.label === 'seat:fable-fresh').prompt), 'security + fable: fable-fresh prompt carries the security brief hygiene')
  ok(!/Do not write exploit code|stay inside this repository/.test(hstd.calls.find(c => c.label === 'seat:fable-fresh').prompt), 'standard + fable: fable-fresh prompt carries no security hygiene')
  const sn = await runDR({ ...SEC, design: true, noFable: true }, implF)
  ok(seatsOf(sn.calls).join() === SECS.join() && !sn.calls.some(c => c.model === 'fable') && sn.calls.filter(c => c.label.startsWith('cross:')).every(c => c.model === 'opus') && sn.result.panel.fresh === true && sn.result.panel.freshReason === 'default' && sn.result.mode === 'security (4× Opus 5.5: correctness, robustness, intent, defensive + Sonnet 5.5 fresh eyes) · size unknown · noFable', 'security + design + noFable: the 4 Opus seats + the Sonnet fresh seat, no Fable call')
  ok(hy(sn.calls.find(c => c.label === 'seat:sonnet-fresh').prompt), 'security + noFable: sonnet-fresh prompt carries the security brief hygiene')
  // a dead sonnet-fresh on security → identical prompt on Opus 5.5 xhigh, then (still dead) once on claude-opus-5
  const implS = (opusOk) => async (p, o) => {
    if (o.label === 'seat:sonnet-fresh') return null
    if (o.label === 'seat:sonnet-fresh:opus-fallback') return opusOk ? seatOut([F('major', 's.ts')]) : null
    if (o.label === 'seat:sonnet-fresh:opus5-fallback') return seatOut([F('major', 's.ts')])
    return implF(p, o)
  }
  const sd = await runDR(SEC, implS(false))
  const so = sd.calls.find(c => c.label === 'seat:sonnet-fresh'), s1f = sd.calls.filter(c => c.label === 'seat:sonnet-fresh:opus-fallback'), s2f = sd.calls.filter(c => c.label === 'seat:sonnet-fresh:opus5-fallback')
  ok(so.model === 'claude-sonnet-5-5' && s1f.length === 1 && s1f[0].model === 'opus' && s1f[0].effort === 'xhigh' && s1f[0].prompt === so.prompt && s2f.length === 1 && s2f[0].model === 'claude-opus-5' && s2f[0].effort === 'xhigh' && s2f[0].prompt === so.prompt, 'security sonnet-fresh dead twice: identical prompt on Opus 5.5 xhigh, then once on claude-opus-5')
  ok(JSON.stringify(sd.result.fallbacks) === JSON.stringify([{ seat: 'sonnet-fresh', model: 'claude-sonnet-5-5', fallback: 'opus', ok: false }, { seat: 'sonnet-fresh', model: 'opus', fallback: 'claude-opus-5', ok: true }]) && sd.result.degraded.length === 0 && sd.result.confirmed.some(f => f.seat === 'sonnet-fresh' && f.by === 'claude-opus-5') && sd.calls.filter(c => c.label.startsWith('cross:')).every(c => c.model === 'opus'), 'security sonnet-fresh dead twice: both re-routes recorded, not degraded, findings carry by=claude-opus-5, Cross on Opus')
  const sd1 = await runDR(SEC, implS(true))
  ok(!sd1.calls.some(c => c.label.includes('opus5-fallback')) && JSON.stringify(sd1.result.fallbacks) === JSON.stringify([{ seat: 'sonnet-fresh', model: 'claude-sonnet-5-5', fallback: 'opus', ok: true }]) && sd1.result.confirmed.some(f => f.seat === 'sonnet-fresh' && f.by === 'opus'), 'security sonnet-fresh dead once: the Opus 5.5 re-run suffices, no Opus 5 call, findings carry by=opus')
  // a dead fable-fresh on security → identical prompt on Opus 5.5, then (still dead) once on claude-opus-5
  const implD = (opusOk) => async (p, o) => {
    if (o.label === 'seat:fable-fresh') return null
    if (o.label === 'seat:fable-fresh:opus-fallback') return opusOk ? seatOut([F('major', 'f.ts')]) : null
    if (o.label === 'seat:fable-fresh:opus5-fallback') return seatOut([F('major', 'f.ts')])
    return implF(p, o)
  }
  const dd = await runDR({ ...SEC, fable: true }, implD(false))
  const orig = dd.calls.find(c => c.label === 'seat:fable-fresh'), f1 = dd.calls.filter(c => c.label === 'seat:fable-fresh:opus-fallback'), f2 = dd.calls.filter(c => c.label === 'seat:fable-fresh:opus5-fallback')
  ok(f1.length === 1 && f1[0].model === 'opus' && f1[0].effort === 'xhigh' && f1[0].prompt === orig.prompt && f2.length === 1 && f2[0].model === 'claude-opus-5' && f2[0].effort === 'xhigh' && f2[0].prompt === orig.prompt, 'security fable-fresh dead twice: identical prompt on Opus 5.5 xhigh, then once on claude-opus-5')
  ok(JSON.stringify(dd.result.fallbacks) === JSON.stringify([{ seat: 'fable-fresh', model: 'fable', fallback: 'opus', ok: false }, { seat: 'fable-fresh', model: 'opus', fallback: 'claude-opus-5', ok: true }]) && dd.result.degraded.length === 0 && dd.result.confirmed.some(f => f.seat === 'fable-fresh' && f.by === 'claude-opus-5') && dd.calls.filter(c => c.label.startsWith('cross:')).every(c => c.model === 'opus') && /re-routed \(2 re-route\(s\)\)/.test(dd.result.mode), 'security fable-fresh dead twice: both re-routes recorded, not degraded, findings carry by=claude-opus-5, Cross on Opus')
  const d1 = await runDR({ ...SEC, fable: true }, implD(true))
  ok(!d1.calls.some(c => c.label.includes('opus5-fallback')) && d1.result.fallbacks.length === 1 && d1.result.fallbacks[0].fallback === 'opus' && d1.result.fallbacks[0].ok === true && d1.result.confirmed.some(f => f.seat === 'fable-fresh' && f.by === 'opus'), 'security fable-fresh dead once: the Opus 5.5 re-run suffices, no Opus 5 call')
}
// ---------- dual-review: minors cap (3 per seat, backstop in code) ----------
{
  const M = (tag) => ({ ...F('minor'), claim: `MINOR-${tag}` })
  const impl = async (p, o) => {
    if (o.label === 'seat:opus-correctness') return seatOut([M(1), F('major'), M(2), M(3), F('major'), M(4), M(5)])
    if (o.label === 'seat:opus-intent') return seatOut([M('i1')])
    if (o.label === 'seat:sonnet-fresh') return seatOut([])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    throw new Error('unexpected ' + o.label)
  }
  const { result: r, calls, logs } = await runDR({ context: 'ctx', scale: { files: 1, lines: 20 } }, impl)
  const cross = calls.filter(c => c.label.startsWith('cross:'))
  const sentIds = cross.flatMap(c => [...c.prompt.matchAll(/"id": "([AB]\d+\.\d+)"/g)].map(m => m[1]))
  ok(sentIds.sort().join() === 'A1.2,A1.5' && r.confirmed.map(f => f.id).sort().join() === 'A1.2,A1.5', 'minors cap: both majors verified and confirmed')
  ok(r.minors.map(f => f.id).join() === 'A1.1,A1.3,A1.4,A2.1' && r.minors.filter(f => f.seat === 'opus-correctness').map(f => f.claim).join() === 'MINOR-1,MINOR-2,MINOR-3', 'minors cap: the first 3 minors of the seat kept in seat order, ids stable; another seat\'s minor untouched')
  ok(r.counts.minors_dropped === 2 && r.counts.minor === 4 && r.counts.findings === 6, 'minors cap: counts.minors_dropped === 2, dropped minors not counted as findings')
  ok(logs.filter(l => /minors cap/.test(l)).length === 1 && logs.some(l => /minors cap.*dropped 2.*opus-correctness 2/.test(l)), 'minors cap: one log line names the per-seat drop counts')
  ok(!JSON.stringify(r).includes('MINOR-4') && !JSON.stringify(r).includes('MINOR-5'), 'minors cap: dropped minors appear nowhere in the return')
  const sp = calls.find(c => c.label === 'seat:opus-correctness').prompt
  ok(sp.includes('Report EVERY critical and major finding') && sp.includes('at most 3 minor findings') && sp.includes('never downgrade one to fit a cap') && sp.includes('reserve critical/major for defects whose failure scenario you can state concretely') && !sp.includes('Report EVERYTHING'), 'minors cap: seat prompt carries the new rule and keeps the severity-accuracy sentence')
  const none = await runDR({ context: 'ctx', scale: { files: 1, lines: 20 } }, async (p, o) => o.label.startsWith('seat:') ? seatOut([M(1), M(2), M(3)]) : null)
  ok(none.result.counts.minors_dropped === 0 && !none.logs.some(l => /minors cap/.test(l)) && none.result.minors.length === 9, 'minors cap: 3 minors per seat (3 seats) → nothing dropped, no log line')
}
// ---------- dual-review: seats and verifiers fetch the diff themselves (the shared packet was removed 2026-10-04) ----------
{
  const impl = async (p, o) => {
    if (o.label.startsWith('seat:')) return seatOut([F('critical'), F('major')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    throw new Error('unexpected ' + o.label)
  }
  const A0 = { context: 'ctx', repo: '/r/app', files: ['a.js', 'b c.js'], scale: STD }
  const { result: r, calls } = await runDR(A0, impl)
  const seatCalls = calls.filter(c => c.label.startsWith('seat:')), crossCalls = calls.filter(c => c.label.startsWith('cross:'))
  const WT = 'The change under review is the uncommitted working tree: run `git -C "/r/app" status --porcelain` and `git -C "/r/app" diff HEAD`'
  ok(!r.error && seatCalls.length === 4 && seatCalls.every(c => c.prompt.includes(WT) && !c.prompt.includes('```diff') && !/packet/i.test(c.prompt) && c.prompt.includes('The repository is at "/r/app"') && c.prompt.includes('Restrict the review strictly to these paths: a.js, b c.js')), 'diff fetch: every seat prompt tells the seat to run git itself, keeps the repo sentence and file scope, no packet text')
  ok(crossCalls.length > 0 && crossCalls.every(c => c.prompt.includes(WT) && !c.prompt.includes('```diff') && !/packet/i.test(c.prompt) && c.prompt.includes('Gather context in parallel')), 'diff fetch: every cross prompt tells the verifier to run git itself and keeps the parallel-reads rule, no packet text')
  const pre = (c) => c.prompt.slice(0, c.prompt.indexOf('\nYour lens:'))
  ok(seatCalls.every(c => c.prompt.indexOf('\nYour lens:') > 0) && new Set(seatCalls.map(pre)).size === 1, 'diff fetch: the four seat prompts (3 Opus + Sonnet fresh) are byte-identical up to the "Your lens:" line')
  ok(seatCalls.every(c => { const p = c.prompt, lens = p.indexOf('\nYour lens:'), rules = p.indexOf('\nRules:'), stay = p.indexOf('Stay in your lens'); return rules > p.indexOf(WT) && lens > p.lastIndexOf('\n- ') && lens > rules && stay > lens && p.indexOf('Gather context in parallel') > rules && p.indexOf('Gather context in parallel') < lens }), 'diff fetch: order change spec → Rules (incl. parallel reads) → lens line, stay-in-lens sentence after the lens line')
  const fc = await runDR({ ...A0, focus: 'FOCUS-X' }, impl)
  ok(fc.calls.filter(c => c.label.startsWith('seat:')).every(c => c.prompt.endsWith('\nAdditional focus requested by the user: FOCUS-X') && c.prompt.indexOf('FOCUS-X') > c.prompt.indexOf('\nYour lens:')), 'diff fetch: the optional focus line comes last, after the lens line')
  const rg = await runDR({ context: 'ctx', repo: '/r/app', range: 'HEAD~2..HEAD', scale: STD }, impl)
  ok(rg.calls.filter(c => c.label.startsWith('seat:') || c.label.startsWith('cross:')).every(c => c.prompt.includes('`git -C "/r/app" log --oneline HEAD~2..HEAD`') && c.prompt.includes('`git -C "/r/app" diff HEAD~2..HEAD`')), 'diff fetch: a range review tells seats and verifiers to read the commit log and the range diff')
}
// ---------- dual-review security: rows stay routing-level whatever the raw dump outcome ----------
{
  const implFor = (extra) => async (p, o) => {
    if (o.label === 'seat:opus-defensive') return seatOut([F('critical', 'auth.ts'), F('minor')])
    if (o.label.startsWith('seat:')) return seatOut([F('major')])
    if (o.label.startsWith('cross:')) return verdictsFor(p, 'CONFIRMED')
    if (o.label === 'write:raw-json') return rawOut(p, extra)
    if (o.label.startsWith('write:')) return { path: '', ok: true }
    throw new Error('unexpected ' + o.label)
  }
  const SEC = { context: 'ctx', security: true, repo: '/r/app', reportDir: '/h/audits', date: '2026-09-28', scale: { files: 2, lines: 40 } }
  for (const [extra, what] of [[0, 'raw dump confirmed'], [-1, 'raw dump rejected → inline data']]) {
    const { result: r } = await runDR(SEC, implFor(extra))
    ok(!('packet' in r) && !JSON.stringify(r).includes('CLAIM-') && ['confirmed', 'contested', 'uncertain', 'refuted', 'minors'].every(k => r[k].every(row => Object.keys(row).join() === 'id,seat,by,severity,file,line,verdict,pre_existing')), `security (${what}): rows stay routing-level only, no packet field`)
  }
}
// ---------- Sonnet lanes pinned by id: static check over the workflow source ----------
{
  const lines = fs.readFileSync(DR, 'utf8').split(/\r?\n/) // CRLF-agnostic: a CRLF checkout keeps '\r' otherwise
  const sonnetLines = lines.filter(l => /model\s*:\s*['"`][^'"`]*sonnet/i.test(l) && !l.includes('fallbacks.push(')) // re-route records name the dead lane's model; they are not lanes
  ok(sonnetLines.length === 2 && sonnetLines.filter(l => l.includes("label: 'write:raw-json'")).length === 1 && sonnetLines.filter(l => l.includes("key: 'sonnet-fresh'")).length === 1 && sonnetLines.every(l => /model\s*:\s*'claude-sonnet-5-5'/.test(l)), 'static: exactly two Sonnet model lines (write:raw-json and the sonnet-fresh seat), each pinned to claude-sonnet-5-5')
  ok(lines.every(l => !/effort\s*:\s*'max'/.test(l)) && !lines.some(l => /packet/i.test(l) && !l.startsWith('//')), 'static: no lane uses effort max; the code never mentions the packet outside comments')
}
// ---------- dual-review: aggregate over every runDR run ----------
ok(drTally.runs > 20 && drTally.packetCalls === 0 && drTally.packetFields === 0, `dual-review aggregate: no packet:build agent and no packet field across ${drTally.runs} runs`)
ok(drTally.cross > 20 && drTally.badCross.length === 0, `dual-review aggregate: all ${drTally.cross} Cross agents (standard, security, noFable, fable, dead-Fable re-runs) at xhigh or high, never max${drTally.badCross.length ? ` — offenders: ${drTally.badCross.join(', ')}` : ''}`)
ok(laneTally.calls > 200 && laneTally.bad.length === 0, `dual-review aggregate: all ${laneTally.calls} agent calls run as agentType lane${laneTally.bad.length ? ` — offenders: ${[...new Set(laneTally.bad)].join(', ')}` : ''}`)
console.log('----'); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
