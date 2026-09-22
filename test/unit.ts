/**
 * Pure-helper smoke tests for pi-ask-jeff (no network, no pi runtime).
 * Run: node test/unit.ts
 */
import {
  answerConfidence,
  buildJevQuestions,
  buildStatusText,
  capState,
  jeffResolvedInfo,
  renderRows,
} from "../extensions/index.ts";

let failed = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failed++;
    console.error(`✗ ${label}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

/* ---------- buildJevQuestions: kind inference (no "kind" concept) ---------- */

const q = buildJevQuestions([
  { instructions: "Is it done?" },
  { instructions: "Which agent?", options: ["reviewer", "implementer"], id: "which" },
  { instructions: "Rate risk", levels: ["Low", "High"], id: "risk" },
  { instructions: "Done again?", id: "q1" },
]);
check("4 questions mapped", Object.keys(q).length === 4);
check("bare question -> yes/no (noul)", (q.q1 as { type: string }).type === "noul");
check("options -> pick one", (q.which as { type: string }).type === "choice");
const choice = q.which as { type: "choice"; criteria: Record<string, null> };
check("choice criteria keys", Object.keys(choice.criteria).join(",") === "reviewer,implementer");
check("choice criteria values null", Object.values(choice.criteria).every((v) => v === null));
check("levels -> rate on scale", (q.risk as { type: string }).type === "score");
const score = q.risk as { type: "score"; criteria: string[] };
check("score criteria array", JSON.stringify(score.criteria) === JSON.stringify(["Low", "High"]));
check("dup id deduped q1_2", !!q.q1_2 && (q.q1_2 as { type: string }).type === "noul");

/* ---------- options: short labels vs { label, description } ---------- */

const qObj = buildJevQuestions([
  {
    instructions: "Who handles next?",
    options: [{ label: "ops", description: "runs infra checks" }, "dev", { label: "qa" }],
  },
]);
const cObj = qObj.q1 as { type: "choice"; criteria: Record<string, string | null> };
check("object option maps label -> description", cObj.criteria.ops === "runs infra checks");
check("string option -> null", cObj.criteria.dev === null);
check("object without description -> null", cObj.criteria.qa === null);
check("labels are the keys (short labels round-trip)", Object.keys(cObj.criteria).join(",") === "ops,dev,qa");

let threwDup = false;
try {
  buildJevQuestions([{ instructions: "Pick", options: ["a", "a"] }]);
} catch {
  threwDup = true;
}
check("duplicate option labels rejected", threwDup);
let threwDupObj = false;
try {
  buildJevQuestions([{ instructions: "Pick", options: [{ label: "a", description: "x" }, { label: "a" }] }]);
} catch {
  threwDupObj = true;
}
check("duplicate object labels rejected", threwDupObj);

const qN = buildJevQuestions([{ instructions: "Urgent?", criteria: { true: "Time-sensitive", false: "Can wait" } }]);
check("yes/no with criteria", (qN.q1 as { criteria: { true: string } }).criteria.true === "Time-sensitive");
const qN2 = buildJevQuestions([{ instructions: "Bare" }]);
check("bare question has no criteria", !(qN2.q1 as { criteria?: unknown }).criteria);

let threw = false;
try {
  buildJevQuestions([{ instructions: "Both?", options: ["a", "b"], levels: ["Low", "High"] }]);
} catch {
  threw = true;
}
check("options AND levels rejected", threw);

/* ---------- capState ---------- */

check("cap no-op under limit", capState("hello", 10).state === "hello" && !capState("hello", 10).truncated);
const capped = capState("abcdefghij", 5);
check("cap truncates", capped.truncated && capped.dropped === 5 && capped.state.startsWith("abcde"));
check("cap trims whitespace", capState("  x  ", 100).state === "x");

/* ---------- rendering: plain language, no Jev vocabulary ---------- */

const rows = renderRows({
  done: { type: "noul", noul: 0.92 },
  which: { type: "choice", choice: "reviewer", probabilities: { reviewer: 0.85, implementer: 0.1 }, confidence: 0.85 },
  risk: { type: "score", score: 1.4, legend: { "0": "Low", "1": "Medium", "2": "High" }, confidence: 0.7 },
});
check("yes/no: verdict + human confidence", rows[0]?.line === "done: Yes — confidence 92%");
check("choice: option + confidence", rows[1]?.line === "which: reviewer — confidence 85%");
check("score: position + scale + confidence", rows[2]?.line === "risk: 1.4 on Low → Medium → High — confidence 70%");

const strongNo = renderRows({ tc: { type: "noul", noul: 0.05 } })[0];
check("strong NO shows verdict confidence (the misread fix)", strongNo?.line === "tc: No — confidence 95%");

const lowChoice = renderRows({
  c: { type: "choice", choice: "reviewer", probabilities: { reviewer: 0.55, implementer: 0.4, tester: 0.05 }, confidence: 0.55 },
})[0];
check("low-confidence choice shows runner-up", lowChoice?.line === "c: reviewer — confidence 55% (runner-up: implementer 40%)");
const highChoice = renderRows({
  c: { type: "choice", choice: "reviewer", probabilities: { reviewer: 0.9, implementer: 0.1 }, confidence: 0.9 },
})[0];
check("high-confidence choice hides detail", highChoice?.line === "c: reviewer — confidence 90%");

const intScore = renderRows({ s: { type: "score", score: 2, legend: { "0": "Low", "1": "Med", "2": "High" }, confidence: 0.8 } })[0];
check("integer score formatted plainly", intScore?.line === "s: 2 on Low → Med → High — confidence 80%");
const noLegend = renderRows({ s: { type: "score", score: 1.25, confidence: 0.6 } })[0];
check("score without legend", noLegend?.line === "s: 1.25 — confidence 60%");

check("choice confidence", Math.abs(answerConfidence({ type: "choice", choice: "x", confidence: 0.85 }) - 0.85) < 1e-9);
check("noul confidence = max(p,1-p)", Math.abs(answerConfidence({ type: "noul", noul: 0.31 }) - 0.69) < 1e-9);

/* ---------- status ---------- */

const status = buildStatusText({ calls: 3 });
check("status mentions host", status.includes("host:"));
check("status shows percentage threshold", status.includes("minConfidence: 0.6 (60%)"));
check("status counts calls", status.includes("calls this session: 3"));

/* ---------- resolved info (default environment) ---------- */

const info = jeffResolvedInfo();
check("default model on openrouter host", info.model === "typesafe/jev-1.13");
check("resolved url is the openrouter systemone endpoint", info.url === "https://openrouter.ai/api/v1/systemone");
check("minConfidence default 0.6", info.minConfidence === 0.6);
check("advisor on by default", info.advisorEnabled === true);
check("no config problems by default", info.configProblems.length === 0);
check("remote endpoint requires a key", info.keyRequired === true);
check("localEndpoint false on remote host", info.localEndpoint === false);

console.log(failed === 0 ? "\nAll unit checks passed" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);