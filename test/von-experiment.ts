/**
 * von reliability experiment — von ONLY, no Jev anywhere (bare HTTP).
 *
 * For each of the 10 grounded cases (test/cases.ts) run three state variants
 * against the local von server and score each against the pre-registered
 * expected verdicts:
 *   v0  baseline  (original state from cases.ts)
 *   v1  digested  (arithmetic/lookup conclusions pre-computed; decision rules
 *                  stated; nothing for von to multiply or compare)
 *   v2  strong    (v1 + explicit true/false rubrics on noul, anchored level
 *                  labels on score, shuffled option order on choices)
 * plus a pseudo-ensemble: majority verdict across v0/v1/v2 per question.
 *
 * Run:  node test/von-experiment.ts   (env: VON_URL, default LAN von)
 * Writes test/von-experiment-results.md
 */
import { writeFileSync } from "node:fs";
import { CASES, type Case, type Question } from "./cases.ts";

const VON_URL = process.env.VON_URL ?? "http://192.168.1.56:8000/v1/systemone";
const VON_MODEL = process.env.VON_MODEL ?? "von-latest";
const TIMEOUT_MS = 15000;

type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence?: number }
  | { type: "score"; score: number; confidence?: number };

const pct = (v: number) => `${Math.round(v * 100)}%`;

function verdictText(a: Answer): { text: string; conf: number; level?: number } {
  if (a.type === "noul") return { text: a.noul >= 0.5 ? "Yes" : "No", conf: Math.max(a.noul, 1 - a.noul) };
  if (a.type === "choice") return { text: a.choice, conf: a.confidence ?? 1 };
  return { text: `lvl${Math.round(a.score)}`, conf: a.confidence ?? 1, level: Math.round(a.score) };
}

function matches(v: Answer, exp: Case["expected"][string]): boolean {
  const t = verdictText(v);
  if (exp.kind === "noul") return t.text === (exp.value === "YES" ? "Yes" : "No");
  if (exp.kind === "choice") return t.text === exp.value;
  return typeof t.level === "number" && Math.abs(t.level - exp.index) <= 1;
}

function buildWire(questions: Question[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  questions.forEach((q, i) => {
    const key = (q.id ?? "").trim() || `q${i + 1}`;
    if (q.options) {
      const criteria: Record<string, string | null> = {};
      for (const o of q.options) {
        criteria[typeof o === "string" ? o : o.label] = typeof o === "string" ? null : (o.description ?? null);
      }
      out[key] = { type: "choice", instructions: q.instructions, criteria };
    } else if (q.levels) {
      out[key] = { type: "score", instructions: q.instructions, criteria: q.levels };
    } else if (q.criteria?.true || q.criteria?.false) {
      out[key] = { type: "noul", instructions: q.instructions, criteria: { true: q.criteria.true ?? "", false: q.criteria.false ?? "" } };
    } else {
      out[key] = { type: "noul", instructions: q.instructions };
    }
  });
  return out;
}

async function callVon(state: string, questions: Question[]): Promise<{ answers: Record<string, Answer>; ms: number; model: string; ok: boolean; error?: string }> {
  try {
    const started = Date.now();
    const res = await fetch(VON_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state, model: VON_MODEL, questions: buildWire(questions) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, answers: {}, ms, model: "", error: `HTTP ${res.status}` };
    const data = (await res.json()) as { model?: string; answers?: Record<string, Answer> };
    return { ok: true, answers: data.answers ?? {}, ms, model: data.model ?? "" };
  } catch (err) {
    return { ok: false, answers: {}, ms: -1, model: "", error: err instanceof Error ? err.message : String(err) };
  }
}

/* ---------- experiment variants ---------- */

type VariantDef = { state: string; questions?: Question[] };

const VARIANTS: Record<string, { v1: VariantDef; v2: VariantDef }> = {
  done1: {
    v1: {
      state:
        "Task: add a hello-world script. Requirements: (1) the script runs; (2) a license header is present. Facts: the script runs; license header present: NO. One requirement is unmet.",
    },
    v2: {
      state:
        "Task: add a hello-world script. Requirements: (1) the script runs; (2) a license header is present. Facts: the script runs; license header present: NO. One requirement is unmet.",
      questions: [
        {
          id: "complete",
          instructions: "Is the task completed per its definition?",
          criteria: { true: "Both requirements are met", false: "At least one requirement (license header) is unmet" },
        },
      ],
    },
  },
  done2: {
    v1: {
      state:
        "Task: OAuth2 login. The task definition has TWO required parts: (1) implement login, (2) document the new env vars in the README. Facts: login works (tests pass, callback returns 302, token refresh verified); README env vars documented: NO. The definition is not fully satisfied.",
    },
    v2: {
      state:
        "Task: OAuth2 login. The task definition has TWO required parts: (1) implement login, (2) document the new env vars in the README. Facts: login works (tests pass, callback returns 302, token refresh verified); README env vars documented: NO.",
      questions: [
        {
          id: "complete",
          instructions: "Is this task completed per its definition?",
          criteria: { true: "Every part of the task definition is satisfied by the facts", false: "A required part (README documentation of env vars) is missing" },
        },
      ],
    },
  },
  delegate: {
    v1: {
      state:
        "Current agent is mid-flow on an unrelated feature. Pending work: verify a 14-file automated codemod that rewrites TypeScript conditional spreads; it already corrupted 2 lines once and needed manual repair. This review is bounded, read-only, and a fresh-context subagent can do it while the main agent continues. Risk of not delegating: context-switching and tunnel vision on a known-risky transform.",
    },
    v2: {
      state:
        "Current agent is mid-flow on an unrelated feature. Pending work: verify a 14-file automated codemod that rewrites TypeScript conditional spreads; it already corrupted 2 lines once and needed manual repair. This review is bounded, read-only, and a fresh-context subagent can do it while the main agent continues.",
      questions: [
        {
          id: "delegate",
          instructions: "Should this review be delegated to the subagent?",
          criteria: { true: "Delegation is appropriate: bounded, isolatable, fresh context better", false: "The work must stay with the main agent" },
        },
      ],
    },
  },
  route: {
    v1: {
      state:
        "Immediate task: locate which change broke a spread in a runner file. Method: diff bisection and archaeology — NOT writing new code, NOT a design pass. Candidates match by capability: debugger = diff bisection/root-causing; reviewer = design/quality review; implementer = writing fixes.",
    },
    v2: {
      state:
        "Immediate task: locate which change broke a spread in a runner file. Method: diff bisection and archaeology — NOT writing new code, NOT a design pass. Candidates match by capability: debugger = diff bisection/root-causing; reviewer = design/quality review; implementer = writing fixes.",
      questions: [
        {
          id: "next",
          instructions: "Which candidate should handle the next step?",
          options: [
            { label: "reviewer", description: "design and quality review" },
            { label: "debugger", description: "root-cause via diff bisection" },
            { label: "implementer", description: "writes the fix" },
          ],
        },
      ],
    },
  },
  design: {
    v1: {
      state:
        "Design rules: (1) touch target >= 44px; (2) contrast >= 4.5:1; (3) disabled state visibly distinct. Measured facts: touch target 40px -> violates rule 1; contrast 2.6:1 -> violates rule 2; disabled styling distinct -> rule 3 ok. Conclusion: two of three rules are violated.",
    },
    v2: {
      state:
        "Design rules: (1) touch target >= 44px; (2) contrast >= 4.5:1; (3) disabled state visibly distinct. Measured facts: touch target 40px -> violates rule 1; contrast 2.6:1 -> violates rule 2; disabled styling distinct -> rule 3 ok.",
      questions: [
        {
          id: "ok",
          instructions: "Does this button comply with the design rules?",
          criteria: { true: "The button complies with all three rules", false: "The button violates one or more rules (touch target and/or contrast)" },
        },
      ],
    },
  },
  secret: {
    v1: {
      state:
        "Text to persist contains: a password ('hunter2-9245'), an API key ('sk-test-abcdef1234567890'), and an export flag. Policy: never persist credentials.",
    },
    v2: {
      state:
        "Text to persist contains: a password ('hunter2-9245'), an API key ('sk-test-abcdef1234567890'), and an export flag. Policy: never persist credentials.",
      questions: [
        {
          id: "has_secret",
          instructions: "Does this text contain credentials that must not be persisted?",
          criteria: { true: "Contains credentials (a password or API key)", false: "Contains no credentials" },
        },
      ],
    },
  },
  tests: {
    v1: {
      state:
        "Change: a new HTTP transport in an agent tool. Coverage present: 33 unit tests of pure functions; type check; lint. Coverage absent: any integration or end-to-end test of the network path itself. The change's core behavior IS the network path.",
    },
    v2: {
      state:
        "Change: a new HTTP transport in an agent tool. Coverage present: 33 unit tests of pure functions; type check; lint. Coverage absent: any integration or end-to-end test of the network path itself. The change's core behavior IS the network path.",
      questions: [
        {
          id: "sufficient",
          instructions: "Is the current verification sufficient to merge this change?",
          criteria: { true: "Verification fully covers the changed behavior", false: "The changed behavior (network transport) has no end-to-end test" },
        },
      ],
    },
  },
  severity: {
    v1: {
      state:
        "Incident: checkout endpoint 503s for 40 minutes during business hours; 2 customers affected; no data loss; rollback ready; root cause unknown.",
      questions: [
        {
          id: "severity",
          instructions: "Rate the severity of this incident",
          levels: [
            "Low: one user, easy workaround, no revenue impact",
            "Medium: few users, partial workaround, minor revenue impact",
            "High: core purchase path down during business hours, revenue impact, mitigation pending",
            "Critical: total outage or data loss",
          ],
        },
      ],
    },
    v2: {
      state:
        "Incident: checkout endpoint 503s for 40 minutes during business hours; 2 customers affected; no data loss; rollback ready; root cause unknown.",
      questions: [
        {
          id: "severity",
          instructions: "Rate the severity considering impact, blast radius, and available mitigations",
          levels: [
            "Low: one user, easy workaround, no revenue impact",
            "Medium: few users, partial workaround, minor revenue impact",
            "High: core purchase path down during business hours, revenue impact, mitigation pending",
            "Critical: total outage or data loss",
          ],
        },
      ],
    },
  },
  urgent: {
    v1: {
      state:
        "Billing API 500s started 25 minutes ago; business hours; 5% of traffic failing; payment provider integration suspected; oncall available; rollback procedure exists and needs an operator now.",
    },
    v2: {
      state:
        "Billing API 500s started 25 minutes ago; business hours; 5% of traffic failing; payment provider integration suspected; oncall available; rollback procedure exists and needs an operator now.",
      questions: [
        {
          id: "today",
          instructions: "Must this be handled today?",
          criteria: { true: "Requires same-day action (revenue path down in business hours)", false: "Can wait" },
        },
      ],
    },
  },
  incident: {
    v1: {
      state:
        "Facts: 503s began right after the 14:02 deploy; the deploy is the only change in the window; rollback is ready and fast; a hotfix would take 30+ minutes; customers are affected now. Standard practice: when the only change in the window is the deploy and rollback is ready, roll back immediately, investigate after the service is healthy.",
    },
    v2: {
      state:
        "Facts: 503s began right after the 14:02 deploy; the deploy is the only change in the window; rollback is ready and fast; a hotfix would take 30+ minutes; customers are affected now. Standard practice: when the only change in the window is the deploy and rollback is ready, roll back immediately, investigate after the service is healthy.",
      questions: [
        {
          id: "next_step",
          instructions: "What is the right immediate move?",
          options: [
            { label: "hotfix", description: "patch forward in 30+ min" },
            { label: "rollback", description: "revert the 14:02 deploy immediately" },
            { label: "investigate", description: "complete root-cause analysis before acting" },
          ],
        },
      ],
    },
  },
};

/* ---------- main ---------- */

async function main(): Promise<void> {
  const lines: string[] = [];
  const push = (s: string) => {
    lines.push(s);
  };

  push(`von reliability experiment (von ONLY, no Jev) — ${VON_URL}`);
  push(`run: ${new Date().toISOString()} · model requested: ${VON_MODEL}`);
  push("");

  // Determinism probe: same input twice.
  const probe = CASES[0];
  const probeQ = probe.questions;
  const [p1, p2] = await Promise.all([callVon(probe.state, probeQ), callVon(probe.state, probeQ)]);
  const same =
    p1.ok && p2.ok && Object.keys(p1.answers).every((k) => verdictText(p1.answers[k]).text === verdictText(p2.answers[k]).text);
  push(`determinism probe (done1 v0 x2): ${same ? "deterministic" : "NON-deterministic"}${!p1.ok ? ` (${p1.error ?? "?"})` : ""}`);
  push("");

  const stats = { v0: 0, v1: 0, v2: 0, ensemble: 0, total: 0 };
  const confByVariant: Record<string, Record<string, string>> = { v0: {}, v1: {}, v2: {} };

  for (const c of CASES) {
    const variants: VariantDef[] = [
      { state: c.state },
      ...(VARIANTS[c.id] ? [VARIANTS[c.id].v1, VARIANTS[c.id].v2] : []),
    ];
    const runs = await Promise.all(variants.map((v) => callVon(v.state, v.questions ?? c.questions)));

    push(`## ${c.id} — ${c.title}`);
    push(`> ${c.note}`);
    for (let i = 0; i < runs.length; i++) {
      const tag = i === 0 ? "v0" : i === 1 ? "v1" : "v2";
      if (!runs[i].ok) {
        push(`- ${tag}: ERROR ${runs[i].error ?? "?"}`);
        continue;
      }
      for (const q of c.questions) {
        const qid = (q.id ?? "").trim() || "q1";
        const a = runs[i].answers[qid];
        const exp = c.expected[qid];
        const expText = exp.kind === "score" ? `lvl${exp.index}` : exp.kind === "choice" ? exp.value : exp.value;
        const v = a ? verdictText(a) : undefined;
        const mark = a ? (matches(a, exp) ? "✓" : "✗") : "?";
        if (a && matches(a, exp)) stats[(tag as "v0") === "v0" || tag === "v1" || tag === "v2" ? (tag as "v0" | "v1" | "v2") : "v0"]++;
        // record confidence per variant for the summary
        if (a) confByVariant[tag][qid] = `${v?.text ?? "?"} ${pct(v?.conf ?? 0)}`;
        push(`- ${tag}.${qid} (expected ${expText}): ${v ? `${v.text} ${pct(v.conf)}` : "—"} ${mark}${!a ? " (no answer)" : ""}`);
      }
    }

    // pseudo-ensemble: majority across variants per question
    const ens: string[] = [];
    for (const q of c.questions) {
      const qid = (q.id ?? "").trim() || "q1";
      const exp = c.expected[qid];
      const votes = runs.filter((r) => r.ok && r.answers[qid]).map((r) => {
        const v = verdictText(r.answers[qid]);
        return exp.kind === "score" ? `lvl${v.level ?? Math.round(Number(v.text.replace("lvl", "")))}` : v.text;
      });
      if (votes.length === 0) continue;
      const counts = new Map<string, number>();
      for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
      const pick = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const expText = exp.kind === "score" ? `lvl${exp.index}` : exp.kind === "choice" ? exp.value : exp.value;
      const ok =
        exp.kind === "score"
          ? Math.abs(Number(pick.replace("lvl", "")) - exp.index) <= 1
          : pick === (exp.value === "YES" ? "Yes" : exp.value === "NO" ? "No" : exp.value);
      if (ok) stats.ensemble++;
      ens.push(`(${votes.join("/")}) -> ${pick} ${ok ? "✓" : "✗"} (expected ${expText})`);
    }
    push(`- **ensemble**: ${ens.join("  ·  ")}`);
    if (runs.some((r) => !r.ok)) push(`- (a variant errored: ${runs.find((r) => !r.ok)?.error})`);
    push("");
    stats.total++;
  }

  push("## Summary");
  push(`| variant | matches expected |`);
  push(`|---|---|`);
  push(`| v0 baseline | ${stats.v0}/${stats.total} |`);
  push(`| v1 digested | ${stats.v1}/${stats.total} |`);
  push(`| v2 strong | ${stats.v2}/${stats.total} |`);
  push(`| **ensemble (v0+v1+v2)** | **${stats.ensemble}/${stats.total}** |`);
  push("");

  const out = lines.join("\n");
  console.log(out);
  writeFileSync("test/von-experiment-results.md", `${out}\n`);
}

main().catch((err) => {
  console.error("experiment failed:", err);
  process.exit(1);
});