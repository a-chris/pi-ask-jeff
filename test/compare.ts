/**
 * Compare pi-ask-jeff use cases across two System One backends using bare HTTP
 * (no pi extension involved):
 *   - von   (local engine) : http://192.168.1.56:8000/v1/systemone
 *   - Jev   (OpenRouter)   : https://openrouter.ai/api/v1/systemone (typesafe/jev-1.13)
 *
 * Run:  node test/compare.ts
 * Env:  VON_URL (default http://192.168.1.56:8000/v1/systemone),
 *       JEV_URL (default https://openrouter.ai/api/v1/systemone),
 *       JEV_MODEL (default typesafe/jev-1.13), VON_MODEL (default von-latest),
 *       and the OpenRouter key env var (for Jev only — never sent to von).
 * Writes test/compare-results.md.
 */
import { writeFileSync } from "node:fs";
import { CASES, type Case, type Question } from "./cases.ts";

const VON_URL = process.env.VON_URL ?? "http://192.168.1.56:8000/v1/systemone";
const JEV_URL = process.env.JEV_URL ?? "https://openrouter.ai/api/v1/systemone";
const VON_MODEL = process.env.VON_MODEL ?? "von-latest";
const JEV_MODEL = process.env.JEV_MODEL ?? "typesafe/jev-1.13";
const JEV_KEY = process.env.OPENROUTER_API_KEY ?? "";
const TIMEOUT_MS = 15000;

type HostId = "von" | "jev";

interface HostResult {
  ok: boolean;
  latencyMs?: number;
  tokensIn?: number;
  model?: string;
  answers?: Record<string, Answer>;
  error?: string;
}

type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence?: number; probabilities?: Record<string, number> }
  | { type: "score"; score: number; confidence?: number; legend?: Record<string, string> };

interface WireAnswer {
  text: string;
  conf: number;
  kind: "noul" | "choice" | "score";
  score?: number;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function verdict(a: Answer): WireAnswer {
  if (a.type === "noul") return { text: a.noul >= 0.5 ? "Yes" : "No", conf: Math.max(a.noul, 1 - a.noul), kind: "noul" };
  if (a.type === "choice") return { text: a.choice, conf: a.confidence ?? 1, kind: "choice" };
  return { text: `${a.score}`, conf: a.confidence ?? 1, kind: "score", score: a.score };
}

function scoreLevel(a: Answer): number {
  return Math.round((a as { score: number }).score);
}

function buildWireQuestions(questions: Question[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const used = new Set<string>();
  questions.forEach((q, i) => {
    let key = (q.id ?? "").trim() || `q${i + 1}`;
    let n = 2;
    while (used.has(key)) key = `${key}_${n++}`;
    used.add(key);
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

/* Bare HTTP call (both hosts speak the same /v1/systemone contract). */
async function callHost(
  url: string,
  model: string,
  apiKey: string,
  state: string,
  questions: Record<string, unknown>,
): Promise<HostResult> {
  const started = Date.now();
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ state, model, questions }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 200)}`, latencyMs: Date.now() - started };
    }
    const data = (await res.json()) as { model?: string; answers?: Record<string, Answer>; usage?: { input_tokens?: number } };
    return {
      ok: true,
      latencyMs: Date.now() - started,
      tokensIn: data.usage?.input_tokens,
      model: data.model,
      answers: data.answers ?? {},
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - started };
  }
}

/* ---------- expectations ---------- */

function matchesExpected(v: WireAnswer, exp: Case["expected"][string]): boolean {
  if (exp.kind === "noul") return v.kind === "noul" && v.text === (exp.value === "YES" ? "Yes" : "No");
  if (exp.kind === "choice") return v.kind === "choice" && v.text === exp.value;
  return v.kind === "score" && Math.abs(scoreLevel({ score: v.score ?? 0 } as Answer) - exp.index) <= 1;
}

function verdictsAgree(a: Answer, b: Answer): boolean {
  const va = verdict(a);
  const vb = verdict(b);
  if (va.kind === "score" && vb.kind === "score") return Math.abs(scoreLevel(a) - scoreLevel(b)) <= 1;
  return va.text === vb.text;
}

function renderAnswerCell(r: HostResult | undefined, qid: string, exp: Case["expected"][string]): string {
  if (!r?.ok) return `— (error)`;
  const a = r.answers?.[qid];
  if (!a) return "— (no answer)";
  const v = verdict(a);
  const mark = matchesExpected(v, exp) ? " ✓" : " ✗";
  const line = `${v.text} ${pct(v.conf)}${mark}`;
  return v.kind === "score" && v.score !== undefined ? `${line} [lvl ${scoreLevel(a)}]` : line;
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  const rows: string[] = [];
  const markdown: string[] = [];
  const push = (s: string) => {
    rows.push(s);
    markdown.push(s);
  };

  push(`pi-ask-jeff — backends: von (${VON_URL}) vs Jev (${JEV_MODEL} via ${JEV_URL})`);
  push(`run: ${new Date().toISOString()} · Jev key: ${JEV_KEY ? "set" : "MISSING (Jev results will fail)"}`);
  push("");

  const summary = {
    von: { cases: 0, correct: 0, latency: [] as number[], tokens: 0 },
    jev: { cases: 0, correct: 0, latency: [] as number[], tokens: 0 },
    agree: 0,
    compared: 0,
  };

  for (const c of CASES) {
    const wire = buildWireQuestions(c.questions);
    const [vonR, jevR] = await Promise.all([
      callHost(VON_URL, VON_MODEL, "", c.state, wire),
      callHost(JEV_URL, JEV_MODEL, JEV_KEY, c.state, wire),
    ]);

    push(`## ${c.id} — ${c.title}`);
    push(`> ${c.note}`);
    push(`state: ${c.state.slice(0, 160)}${c.state.length > 160 ? "…" : ""}`);
    push("");

    for (const q of c.questions) {
      const qid = (q.id ?? "").trim() || "q1";
      const exp = c.expected[qid];
      const va = vonR.ok ? vonR.answers?.[qid] : undefined;
      const vb = jevR.ok ? jevR.answers?.[qid] : undefined;
      const expText = exp.kind === "score" ? `level ${exp.index}` : exp.kind === "choice" ? exp.value : exp.value;

      const agree = va && vb ? verdictsAgree(va, vb) : false;
      if (va && vb) summary.compared++;

      const vonMatch = va ? matchesExpected(verdict(va), exp) : false;
      const jevMatch = vb ? matchesExpected(verdict(vb), exp) : false;
      if (va && vonMatch) summary.von.correct++;
      if (vb && jevMatch) summary.jev.correct++;
      if (va) {
        summary.von.cases++;
        if (vonR.latencyMs !== undefined) summary.von.latency.push(vonR.latencyMs);
        summary.von.tokens += vonR.tokensIn ?? 0;
      }
      if (vb) {
        summary.jev.cases++;
        if (jevR.latencyMs !== undefined) summary.jev.latency.push(jevR.latencyMs);
        summary.jev.tokens += jevR.tokensIn ?? 0;
      }
      if (agree) summary.agree++;

      push(
        `- **${qid}** (expected ${expText}): von → ${renderAnswerCell(vonR, qid, exp)}  ·  jev → ${renderAnswerCell(jevR, qid, exp)}  ·  ${agree ? "AGREE" : "disagree"}`,
      );
    }
    if (vonR.error) push(`- von error: ${vonR.error}`);
    if (jevR.error) push(`- jev error: ${jevR.error}`);
    push("");
  }

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  push("## Summary");
  push("| host | cases | matches expectation | avg latency | input tokens |");
  push("|---|---|---|---|---|");
  push(`| von | ${summary.von.cases}/${CASES.length} | ${summary.von.correct}/${summary.von.cases} | ${avg(summary.von.latency)}ms | ${summary.von.tokens} |`);
  push(`| jev | ${summary.jev.cases}/${CASES.length} | ${summary.jev.correct}/${summary.jev.cases} | ${avg(summary.jev.latency)}ms | ${summary.jev.tokens} |`);
  push(
    `| agreement | ${summary.compared ? `${summary.agree}/${summary.compared}` : "n/a"} shared verdicts | — | — | — |`,
  );
  push(
    `jev approx cost: $${((summary.jev.tokens / 1_000_000) * 0.042).toFixed(6)}`,
  );

  const out = rows.join("\n");
  console.log(out);
  writeFileSync("test/compare-results.md", `${out}\n`);
}

main().catch((err) => {
  console.error("compare failed:", err);
  process.exit(1);
});