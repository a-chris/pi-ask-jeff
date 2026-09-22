pi-ask-jeff — backends: von (http://192.168.1.56:8000/v1/systemone) vs Jev (typesafe/jev-1.13 via https://openrouter.ai/api/v1/systemone)
run: 2026-09-22T21:30:49.509Z · Jev key: set

## done1 — Task completion — script missing its required license header
> Our first live pi-ask-jeff verification: a hello-world script that runs, but the task definition requires a license header and none was added.
state: Task: add a hello-world script. Task definition: the script must run AND carry a license header. Evidence: A) script file exists B) script runs and prints hello…

- **complete** (expected NO): von → No 80% ✓  ·  jev → No 96% ✓  ·  AGREE

## done2 — Task completion — feature done but required README docs missing
> Canonical example from the README: OAuth2 login ships but the definition requires documenting the new env vars.
state: Task: add OAuth2 login. Definition: implement login AND update README with the new env vars. Evidence: A) npm test 47/47 pass B) auth callback route returns 302…

- **complete** (expected NO): von → Yes 57% ✗  ·  jev → No 92% ✓  ·  disagree

## delegate — Should I delegate — risky multi-file codemod review
> pi-subagents history: an automated codemod corrupted real lines in a runner file; a fresh-context review pass would have caught it. The decision: is this work better delegated?
state: Current agent is mid-flow on an unrelated feature. Pending: review a 14-file automated codemod of TypeScript that rewrites conditional spreads; it already corru…

- **delegate** (expected YES): von → Yes 63% ✓  ·  jev → Yes 84% ✓  ·  AGREE

## route — Subagent routing — who handles the root-cause hunt
> Same investigation: a corrupted spread caused a runtime failure; the next step is root-causing it, not reviewing design or writing new code.
state: Symptom: a TypeScript runner crashed on an unexpected 'fileMutation' property spread. Suspect: a recent automated codemod. Candidates: debugger (archaeology, di…

- **next** (expected debugger): von → reviewer 6% ✗  ·  jev → debugger 98% ✓  ·  disagree

## design — Design compliance — button contrast below the rule
> From this project's design-compliance gate; matches Chris's rule-first workflow (guidelines defined up front, pages must not drift).
state: Design rules: (1) primary action has min 44px touch target (2) text contrast must be >= 4.5:1 (3) disabled state must be visibly distinct. Button: 40px tall, gr…

- **ok** (expected NO): von → Yes 65% ✗  ·  jev → No 98% ✓  ·  disagree

## secret — Secret guard — does this text contain credentials
> Real event: a memory_add was blocked because the content contained a key-like env var name. The guard is a perfect System One decision.
state: Candidate text to persist: 'deploy password = hunter2-9245, api key = sk-test-abcdef1234567890, and note the export flag'. Decision: must this text be refused b…

- **has_secret** (expected YES): von → Yes 67% ✓  ·  jev → Yes 97% ✓  ·  AGREE

## tests — Gate — is test coverage sufficient to merge
> This project's verification stage: 33+ unit checks passed but nothing exercised the network transport end-to-end; we added a live mock run before declaring it done.
state: Change: new HTTP client transport in an agent tool. Coverage: 33 unit tests of pure helpers pass; no integration or end-to-end test of the network path; type ch…

- **sufficient** (expected NO): von → No 57% ✓  ·  jev → No 88% ✓  ·  AGREE

## severity — Incident severity — rate on a scale
> From the README's rating example (checkout 503s) — an ordered Low->Critical rubric.
state: Incident: checkout endpoint 503s for 40 minutes during business hours; 2 customers affected; no data loss; rollback ready; root cause unknown. Customers can sti…

- **severity** (expected level 2): von → 1.29 14% ✓ [lvl 1]  ·  jev → 1.96 69% ✓ [lvl 2]  ·  AGREE

## urgent — Handle today — production billing API down in business hours
> Urgency gate: time-sensitivity of a production payment failure during revenue hours.
state: Production billing API started returning 500s 25 minutes ago during business hours; ~5% of traffic fails; payment provider integration is the suspect; oncall is…

- **today** (expected YES): von → Yes 61% ✓  ·  jev → Yes 94% ✓  ·  AGREE

## incident — Incident response — roll back, hotfix, or investigate first
> Classic incident decision gate: the deploy is the likely cause, rollback is ready, customers are affected now.
state: Production incident: 503s started immediately after the 14:02 deploy; deploy is the only change in the window; rollback is prepared and quick; hotfix would take…

- **next_step** (expected rollback): von → investigate 7% ✗  ·  jev → rollback 100% ✓  ·  disagree

## Summary
| host | cases | matches expectation | avg latency | input tokens |
|---|---|---|---|---|
| von | 10/10 | 6/10 | 261ms | 710 |
| jev | 10/10 | 10/10 | 429ms | 3529 |
| agreement | 6/10 shared verdicts | — | — | — |
jev approx cost: $0.000148
