von reliability experiment (von ONLY, no Jev) — http://192.168.1.56:8000/v1/systemone
run: 2026-09-22T21:43:56.446Z · model requested: von-latest

determinism probe (done1 v0 x2): deterministic

## done1 — Task completion — script missing its required license header
> Our first live pi-ask-jeff verification: a hello-world script that runs, but the task definition requires a license header and none was added.
- v0.complete (expected NO): No 80% ✓
- v1.complete (expected NO): No 78% ✓
- v2.complete (expected NO): No 75% ✓
- **ensemble**: (No/No/No) -> No ✓ (expected NO)

## done2 — Task completion — feature done but required README docs missing
> Canonical example from the README: OAuth2 login ships but the definition requires documenting the new env vars.
- v0.complete (expected NO): Yes 57% ✗
- v1.complete (expected NO): No 66% ✓
- v2.complete (expected NO): No 85% ✓
- **ensemble**: (Yes/No/No) -> No ✓ (expected NO)

## delegate — Should I delegate — risky multi-file codemod review
> pi-subagents history: an automated codemod corrupted real lines in a runner file; a fresh-context review pass would have caught it. The decision: is this work better delegated?
- v0.delegate (expected YES): Yes 63% ✓
- v1.delegate (expected YES): Yes 63% ✓
- v2.delegate (expected YES): No 52% ✗
- **ensemble**: (Yes/Yes/No) -> Yes ✓ (expected YES)

## route — Subagent routing — who handles the root-cause hunt
> Same investigation: a corrupted spread caused a runtime failure; the next step is root-causing it, not reviewing design or writing new code.
- v0.next (expected debugger): reviewer 6% ✗
- v1.next (expected debugger): debugger 41% ✓
- v2.next (expected debugger): debugger 19% ✓
- **ensemble**: (reviewer/debugger/debugger) -> debugger ✓ (expected debugger)

## design — Design compliance — button contrast below the rule
> From this project's design-compliance gate; matches Chris's rule-first workflow (guidelines defined up front, pages must not drift).
- v0.ok (expected NO): Yes 65% ✗
- v1.ok (expected NO): No 85% ✓
- v2.ok (expected NO): No 67% ✓
- **ensemble**: (Yes/No/No) -> No ✓ (expected NO)

## secret — Secret guard — does this text contain credentials
> Real event: a memory_add was blocked because the content contained a key-like env var name. The guard is a perfect System One decision.
- v0.has_secret (expected YES): Yes 67% ✓
- v1.has_secret (expected YES): No 62% ✗
- v2.has_secret (expected YES): Yes 66% ✓
- **ensemble**: (Yes/No/Yes) -> Yes ✓ (expected YES)

## tests — Gate — is test coverage sufficient to merge
> This project's verification stage: 33+ unit checks passed but nothing exercised the network transport end-to-end; we added a live mock run before declaring it done.
- v0.sufficient (expected NO): No 57% ✓
- v1.sufficient (expected NO): No 59% ✓
- v2.sufficient (expected NO): No 68% ✓
- **ensemble**: (No/No/No) -> No ✓ (expected NO)

## severity — Incident severity — rate on a scale
> From the README's rating example (checkout 503s) — an ordered Low->Critical rubric.
- v0.severity (expected lvl2): lvl1 14% ✓
- v1.severity (expected lvl2): lvl2 22% ✓
- v2.severity (expected lvl2): lvl1 34% ✓
- **ensemble**: (lvl1/lvl2/lvl1) -> lvl1 ✓ (expected lvl2)

## urgent — Handle today — production billing API down in business hours
> Urgency gate: time-sensitivity of a production payment failure during revenue hours.
- v0.today (expected YES): Yes 61% ✓
- v1.today (expected YES): Yes 61% ✓
- v2.today (expected YES): Yes 91% ✓
- **ensemble**: (Yes/Yes/Yes) -> Yes ✓ (expected YES)

## incident — Incident response — roll back, hotfix, or investigate first
> Classic incident decision gate: the deploy is the likely cause, rollback is ready, customers are affected now.
- v0.next_step (expected rollback): investigate 7% ✗
- v1.next_step (expected rollback): rollback 55% ✓
- v2.next_step (expected rollback): rollback 63% ✓
- **ensemble**: (investigate/rollback/rollback) -> rollback ✓ (expected rollback)

## Summary
| variant | matches expected |
|---|---|
| v0 baseline | 6/10 |
| v1 digested | 9/10 |
| v2 strong | 9/10 |
| **ensemble (v0+v1+v2)** | **10/10** |

