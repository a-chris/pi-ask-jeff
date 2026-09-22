/**
 * Ten decision-gate use cases drawn from pi-ask-jeff session/memory history.
 * Shared contract with the ask_jeff tool: state + questions with
 * { instructions, options?, levels?, criteria? } — kind is inferred.
 * Each case carries an `expected` verdict justified by the evidence in state,
 * plus a `note` saying where the situation came from.
 */

export type Question = {
  id?: string;
  instructions: string;
  options?: (string | { label: string; description?: string })[];
  levels?: string[];
  criteria?: { true?: string; false?: string };
};

export type Case = {
  id: string;
  title: string;
  note: string;
  state: string;
  questions: Question[];
  /** expected verdicts keyed by question id */
  expected: Record<string, { kind: "noul"; value: "YES" | "NO" } | { kind: "choice"; value: string } | { kind: "score"; index: number }>;
};

export const CASES: Case[] = [
  {
    id: "done1",
    title: "Task completion — script missing its required license header",
    note: "Our first live pi-ask-jeff verification: a hello-world script that runs, but the task definition requires a license header and none was added.",
    state:
      "Task: add a hello-world script. Task definition: the script must run AND carry a license header. Evidence: A) script file exists B) script runs and prints hello C) no license header present. FACT UNKNOWN: none — all required artifacts inspected.",
    questions: [{ id: "complete", instructions: "Is the task completed per its definition?" }],
    expected: { complete: { kind: "noul", value: "NO" } },
  },
  {
    id: "done2",
    title: "Task completion — feature done but required README docs missing",
    note: "Canonical example from the README: OAuth2 login ships but the definition requires documenting the new env vars.",
    state:
      "Task: add OAuth2 login. Definition: implement login AND update README with the new env vars. Evidence: A) npm test 47/47 pass B) auth callback route returns 302 on success C) token refresh verified manually D) README env vars not yet documented.",
    questions: [{ id: "complete", instructions: "Is this task completed per its definition?" }],
    expected: { complete: { kind: "noul", value: "NO" } },
  },
  {
    id: "delegate",
    title: "Should I delegate — risky multi-file codemod review",
    note: "pi-subagents history: an automated codemod corrupted real lines in a runner file; a fresh-context review pass would have caught it. The decision: is this work better delegated?",
    state:
      "Current agent is mid-flow on an unrelated feature. Pending: review a 14-file automated codemod of TypeScript that rewrites conditional spreads; it already corrupted 2 lines once yesterday, fixed by hand. Subagent capability: a fresh-context reviewer runs read-only analysis and reports findings. Constraints: main agent is deep in another task; codemod risk is known.",
    questions: [{ id: "delegate", instructions: "Should this review be delegated to the subagent?" }],
    expected: { delegate: { kind: "noul", value: "YES" } },
  },
  {
    id: "route",
    title: "Subagent routing — who handles the root-cause hunt",
    note: "Same investigation: a corrupted spread caused a runtime failure; the next step is root-causing it, not reviewing design or writing new code.",
    state:
      "Symptom: a TypeScript runner crashed on an unexpected 'fileMutation' property spread. Suspect: a recent automated codemod. Candidates: debugger (archaeology, diff bisection), reviewer (design/quality pass), implementer (writes the fix). Nobody has root-caused it yet.",
    questions: [
      { id: "next", instructions: "Which candidate should handle the next step?", options: [{ label: "debugger", description: "root-cause via diff bisection" }, { label: "reviewer", description: "design and quality review" }, { label: "implementer", description: "writes the fix" }] },
    ],
    expected: { next: { kind: "choice", value: "debugger" } },
  },
  {
    id: "design",
    title: "Design compliance — button contrast below the rule",
    note: "From this project's design-compliance gate; matches Chris's rule-first workflow (guidelines defined up front, pages must not drift).",
    state:
      "Design rules: (1) primary action has min 44px touch target (2) text contrast must be >= 4.5:1 (3) disabled state must be visibly distinct. Button: 40px tall, gray bg, text #9CA3AF on #FFFFFF measured at 2.6:1, tagged disabled.",
    questions: [
      { id: "ok", instructions: "Does this button comply with the design rules?", criteria: { true: "Complies with all three rules", false: "Violates at least one rule" } },
    ],
    expected: { ok: { kind: "noul", value: "NO" } },
  },
  {
    id: "secret",
    title: "Secret guard — does this text contain credentials",
    note: "Real event: a memory_add was blocked because the content contained a key-like env var name. The guard is a perfect System One decision.",
    state:
      "Candidate text to persist: 'deploy password = hunter2-9245, api key = sk-test-abcdef1234567890, and note the export flag'. Decision: must this text be refused because it contains credentials?",
    questions: [{ id: "has_secret", instructions: "Does this text contain credentials that must not be persisted?" }],
    expected: { has_secret: { kind: "noul", value: "YES" } },
  },
  {
    id: "tests",
    title: "Gate — is test coverage sufficient to merge",
    note: "This project's verification stage: 33+ unit checks passed but nothing exercised the network transport end-to-end; we added a live mock run before declaring it done.",
    state:
      "Change: new HTTP client transport in an agent tool. Coverage: 33 unit tests of pure helpers pass; no integration or end-to-end test of the network path; type check clean; lint clean. Merge policy: changes must be verified, not just typed.",
    questions: [{ id: "sufficient", instructions: "Is the current verification sufficient to merge this change?" }],
    expected: { sufficient: { kind: "noul", value: "NO" } },
  },
  {
    id: "severity",
    title: "Incident severity — rate on a scale",
    note: "From the README's rating example (checkout 503s) — an ordered Low->Critical rubric.",
    state:
      "Incident: checkout endpoint 503s for 40 minutes during business hours; 2 customers affected; no data loss; rollback ready; root cause unknown. Customers can still reach the site but cannot complete purchases.",
    questions: [
      { id: "severity", instructions: "Rate the severity of this incident", levels: ["Low", "Medium", "High", "Critical"] },
    ],
    expected: { severity: { kind: "score", index: 2 } }, // High (tolerance ±1 level)
  },
  {
    id: "urgent",
    title: "Handle today — production billing API down in business hours",
    note: "Urgency gate: time-sensitivity of a production payment failure during revenue hours.",
    state:
      "Production billing API started returning 500s 25 minutes ago during business hours; ~5% of traffic fails; payment provider integration is the suspect; oncall is available now; a rollback procedure exists.",
    questions: [{ id: "today", instructions: "Must this be handled today?" }],
    expected: { today: { kind: "noul", value: "YES" } },
  },
  {
    id: "incident",
    title: "Incident response — roll back, hotfix, or investigate first",
    note: "Classic incident decision gate: the deploy is the likely cause, rollback is ready, customers are affected now.",
    state:
      "Production incident: 503s started immediately after the 14:02 deploy; deploy is the only change in the window; rollback is prepared and quick; hotfix would take 30+ min to test. Customers are affected now. Investigators disagree on root cause.",
    questions: [
      { id: "next_step", instructions: "What is the right immediate move?", options: [{ label: "rollback", description: "revert the 14:02 deploy immediately" }, { label: "hotfix", description: "patch forward in 30+ min" }, { label: "investigate", description: "complete root-cause analysis before acting" }] },
    ],
    expected: { next_step: { kind: "choice", value: "rollback" } },
  },
];