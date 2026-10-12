// Minimal stand-in for Claude Code's Workflow runtime: runs a workflow script body with scripted agents.
import fs from 'node:fs'
export async function run(scriptPath, args, agentImpl) {
  const src = fs.readFileSync(scriptPath, 'utf8').replace(/^export const meta/m, 'const meta')
  const logs = [], calls = []
  const log = (m) => logs.push(String(m))
  const phase = () => {}
  const agent = async (prompt, opts = {}) => { calls.push({ label: opts.label, model: opts.model, effort: opts.effort, agentType: opts.agentType, prompt }); return agentImpl(prompt, opts) }
  const parallel = async (thunks) => Promise.all(thunks.map(t => Promise.resolve().then(t).catch(() => null)))
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let prev = item
    for (const st of stages) { try { prev = await st(prev, item, i) } catch (e) { return null } }
    return prev
  }))
  const fn = new Function('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', `return (async () => {\n${src}\n})()`)
  const result = await fn(args, agent, parallel, pipeline, phase, log, { total: null, spent: () => 0, remaining: () => Infinity })
  return { result, logs, calls }
}
