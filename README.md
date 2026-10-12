# Multi-agent code review

A workflow that reviews a code change with a small panel of AI agents, cross-examines every serious finding, and hands a person only what survives. It is part of KVRA Orquesta, the agent system my team at KVRA Agency uses daily on Claude Code, and it has reviewed real changes since July 2026.

Shared as a work sample. The workflow is copied unchanged from the private kit; the tests are its scenarios from the kit's suite.

## How a review runs

1. **Independent seats.** Two to four reviewer agents on Claude Opus 5.5 read the same change, each through one lens: correctness, robustness, intent (does the change do what the person actually asked?) and, on security-sensitive changes, defensive security. One more seat runs on a different model, Claude Sonnet 5.5, with an open lens, so the panel does not share one model's blind spots. Every finding must carry a concrete failure scenario and verbatim evidence.
2. **Cross-examination.** Each critical or major finding goes to a separate verifier agent, in a fresh context, whose only job is to refute it against the real code. Criticals are verified at extra-high effort, majors at high, and minors are reported without verification.
3. **Verdicts.** The result splits findings into confirmed, contested, uncertain and refuted. A refuted critical is never dropped silently: it comes back as contested, with the claim and the refutation side by side, because reading one false alarm costs a person far less than losing a real critical.

## Rules that came from measurement

Each dated comment in the code records a decision taken from real runs:

- **The panel is sized to the change.** Across 25 measured reviews, the seats were 84% of the cost and the cost did not follow the size of the change, so a small change now gets two lens seats instead of three.
- **At most three minors per seat.** 77% of all findings were minors that nobody ever fixed.
- **A seat taken out of the default.** One model's seat cost 27% of review spend for 4 of 47 unique confirmed findings. It now runs only on request, and a cheaper model holds the different-model seat.
- **A step deleted.** A shared copy of the diff went over its size limit in 5 of 5 real runs, so every agent now fetches the diff itself.
- **Lower effort where it lost nothing.** Replaying past verification prompts, extra-high effort matched maximum effort on 45 of 45 verdicts with no flips, at 3.6 times less cost.

## Built for agents that fail

- Arguments that arrive as a JSON string are parsed back. A real incident: every seat once ran without its context.
- A verdict counts only from the agent that was assigned that finding, so an id invented by the cheaper lane cannot overturn a critical verdict.
- An unknown severity is treated as major, so it still gets verified; an unknown verdict counts as unverified.
- A dead different-model seat or verifier re-runs its identical prompt on Opus, never a reworded one, and on security reviews any dead lane gets one more try on a fallback model. The result lists every re-route and every missing seat, so a degraded run never reads as a full review.
- In security mode the findings go to a file outside the repository, and the session that launched the review receives only ids, severities, files and verdicts.

## Reading the code

`workflows/dual-review.js` (named after its first version, a two-model panel) runs on Claude Code's Workflow runtime: `agent()` starts a subagent with a given model, effort and output schema, and `parallel()` runs several at once. Good places to start:

- [The seat prompt](workflows/dual-review.js#L184-L203)
- [How the panel is chosen](workflows/dual-review.js#L242-L269)
- [Severity-routed cross-examination](workflows/dual-review.js#L374-L418)
- [Accepting verdicts only from the assigned agent](workflows/dual-review.js#L426-L476)
- [The asymmetric veto](workflows/dual-review.js#L490-L500)

`tests/dual-review.test.mjs` runs the workflow offline against scripted agents: dead seats, invented ids, unknown severities, the panel for every size class, and the security-mode output. It needs only Node.js:

```
node tests/dual-review.test.mjs
```

Comments that mention CLAUDE.md rules or other files refer to parts of the private kit.

Written with Claude Code under my direction; I made every routing decision from the measured runs.

Jerick Castro Ortiz · [jerickcastro.pages.dev](https://jerickcastro.pages.dev)
