/**
 * pi-ask-jeff — an advisor called Jeff for pi.
 *
 * Jeff is always right: behind the scenes Jeff is a Jev-compatible (System One)
 * decision model. Jeff does not write prose, read files, or see the session —
 * it returns a verdict with a confidence percentage for the concise,
 * self-contained context you put in `state`.
 *
 * - Tool:  `ask_jeff` — ask Jeff one or more batched decisions.
 * - Command: `/jeff` — status; `/jeff test` — smoke call.
 * - Advisor: a `<jeff-advisor>` section is injected into the system prompt
 *   (toggle with `advisor` in ~/.pi/agent/ask-jeff.json, default on).
 *
 * Transport: OpenRouter (default, uses OPENROUTER_API_KEY), TypeSafe
 * (TYPESAFE_API_KEY), jev-agent (JEV_AGENT_KEY / jv_live_ keys), or a local
 * von server (ASK_JEFF_HOST=von, no key required on loopback).
 * All env-free options go in ~/.pi/agent/ask-jeff.json.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import {
  getAgentDir,
  type AgentToolResult,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

type Host = "typesafe" | "jev-agent" | "openrouter" | "von";
type QuestionKind = "noul" | "choice" | "score";

interface JeffConfig {
  /** API key (env vars take precedence over this). */
  apiKey?: string;
  /** Explicit host; otherwise auto-detected from the key. */
  host?: Host;
  /** Full systemone URL override. */
  url?: string;
  /** Model id. Defaults per host (openrouter: typesafe/jev-1.13). */
  model?: string;
  /** Answers below this confidence are flagged for verification. */
  minConfidence?: number;
  /** Hard cap on state length in characters (Jev budget: 32k tokens). */
  stateCharLimit?: number;
  /** HTTP timeout in ms. */
  timeoutMs?: number;
  /** Inject the <jeff-advisor> system prompt section. Default true. */
  advisor?: boolean;
}

function loadConfig(): JeffConfig {
  try {
    const file = join(getAgentDir(), "ask-jeff.json");
    return JSON.parse(readFileSync(file, "utf8")) as JeffConfig;
  } catch {
    return {};
  }
}

const cfg = loadConfig();
const env = process.env;

const apiKey =
  env.ASK_JEFF_API_KEY ??
  env.TYPESAFE_API_KEY ??
  env.JEV_AGENT_KEY ??
  env.OPENROUTER_API_KEY ??
  cfg.apiKey;

function apiKeySource(): string {
  if (env.ASK_JEFF_API_KEY) return "ASK_JEFF_API_KEY";
  if (env.TYPESAFE_API_KEY) return "TYPESAFE_API_KEY";
  if (env.JEV_AGENT_KEY) return "JEV_AGENT_KEY";
  if (env.OPENROUTER_API_KEY) return "OPENROUTER_API_KEY";
  if (cfg.apiKey) return "ask-jeff.json";
  return "";
}

function resolveHost(): Host {
  if (cfg.host) return cfg.host;
  const h = env.ASK_JEFF_HOST;
  if (h === "typesafe" || h === "jev-agent" || h === "openrouter" || h === "von") return h;
  if (env.ASK_JEFF_API_KEY || env.TYPESAFE_API_KEY) return "typesafe";
  if (env.JEV_AGENT_KEY) return "jev-agent";
  if ((apiKey ?? "").startsWith("jv_live_")) return "jev-agent";
  return "openrouter";
}

const host = resolveHost();

/** Canonical endpoints per host. The only URLs fetch() is allowed to hit. */
const HOST_ENDPOINTS: Record<Host, string> = {
  typesafe: "https://api.typesafe.ai/v1/systemone",
  "jev-agent": "https://jev-agent.com/api/v1/systemone",
  openrouter: "https://openrouter.ai/api/v1/systemone",
  // Von: local open-source System One engine, same /v1/systemone contract.
  // http is allowed for loopback only (see safeEndpointUrl).
  von: "http://127.0.0.1:8000/v1/systemone",
};

/** Loopback hostnames — always trusted for http. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isLoopbackUrl(u: URL | null): boolean {
  if (!u) return false;
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(hostname) || hostname.startsWith("127.") || hostname === "::1";
}

/** RFC1918 private ranges — a local/LAN engine (e.g. von on a home server). */
function isPrivateLanHost(hostname: string): boolean {
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

/** http allowed on loopback or private LAN; https allowed everywhere. */
function httpAllowed(u: URL): boolean {
  if (isLoopbackUrl(u)) return true;
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  return isPrivateLanHost(hostname);
}

/**
 * Resolve the systemone endpoint.
 *
 * The LLM never controls this: the tool has no URL parameter. Only a
 * user-authored local override (~/.pi/agent/ask-jeff.json or ASK_JEFF_URL)
 * may replace the canonical endpoints. https is always allowed; http is
 * allowed only for loopback and private LAN addresses (local engines such
 * as von); http to a public internet address is rejected. Invalid overrides
 * never throw at load — they surface as a config problem reported by the
 * tool and /jeff.
 */
const configProblems: string[] = [];

function safeEndpointUrl(input: string, problem: string): URL | null {
  try {
    const u = new URL(input);
    const ok = u.protocol === "https:" || (u.protocol === "http:" && httpAllowed(u));
    if (!ok) {
      configProblems.push(problem);
      return null;
    }
    return u;
  } catch {
    configProblems.push(problem);
    return null;
  }
}

function resolveEndpointUrl(): URL | null {
  const override = cfg.url ?? env.ASK_JEFF_URL;
  if (override) {
    return safeEndpointUrl(
      override,
      `url override "${override}" is not a valid endpoint (https, or http on loopback/private LAN)`,
    );
  }
  return safeEndpointUrl(HOST_ENDPOINTS[host], `missing endpoint for host ${host}`);
}

const resolvedConfig = {
  host,
  endpointUrl: resolveEndpointUrl(),
  model:
    cfg.model ??
    env.ASK_JEFF_MODEL ??
    (host === "openrouter" ? "typesafe/jev-1.13" : host === "von" ? "von-latest" : "jev-latest"),
  minConfidence: cfg.minConfidence ?? 0.6,
  stateCharLimit: cfg.stateCharLimit ?? 20000,
  timeoutMs: cfg.timeoutMs ?? 15000,
  advisorEnabled: cfg.advisor ?? true,
};

/** True when Jeff talks over plaintext http (loopback or private LAN) — no API key required, no ambient key sent. */
const localEndpoint = (resolvedConfig.endpointUrl?.protocol ?? "") === "http:";

/**
 * Key sent on the wire. Local endpoints get no ambient (OpenRouter/TypeSafe)
 * key unless one is explicitly configured for Jeff; remote endpoints use the
 * resolved key chain.
 */
const sendKey = localEndpoint ? (env.ASK_JEFF_API_KEY ?? cfg.apiKey ?? "") : (apiKey ?? "");

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const optionSchema = Type.Union([
  /** Short label shorthand — Jeff returns the label as-is. */
  Type.String({ minLength: 1 }),
  /** Label + optional detail Jeff should weigh when choosing. */
  Type.Object(
    {
      label: Type.String({ minLength: 1 }),
      description: Type.Optional(Type.String({ minLength: 1 })),
    },
    { additionalProperties: false },
  ),
]);

const questionSchema = Type.Object(
  {
    id: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
    instructions: Type.String({ minLength: 1 }),
    /** Provide to make this a "pick one" question: 2..10 candidates. */
    options: Type.Optional(Type.Array(optionSchema, { minItems: 2, maxItems: 10 })),
    /** Provide to make this a "rate on a scale" question: 2..10 descriptions, low first. */
    levels: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 2, maxItems: 10 })),
    /** Optional clarifications for a plain yes/no question. */
    criteria: Type.Optional(
      Type.Object(
        {
          true: Type.Optional(Type.String({ minLength: 1 })),
          false: Type.Optional(Type.String({ minLength: 1 })),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const paramsSchema = Type.Object(
  {
    /** Concise, self-contained facts Jeff needs to decide. Jeff never sees this session. */
    state: Type.String({ minLength: 1 }),
    /** One or more independent decisions, evaluated in parallel against the same state. */
    questions: Type.Array(questionSchema, { minItems: 1, maxItems: 10 }),
    /** High-stakes mode: ask each question through 3 procedural framings and majority-vote. Costs 3 requests. */
    careful: Type.Optional(Type.Boolean({ description: "3-framing majority vote for high-stakes decisions" })),
  },
  { additionalProperties: false },
);

type AskJeffParams = Static<typeof paramsSchema>;
type AskJeffQuestion = AskJeffParams["questions"][number];

/* ------------------------------------------------------------------ */
/* Jev wire types                                                      */
/* ------------------------------------------------------------------ */

type JevQuestion = {
  type: QuestionKind;
  instructions: string;
  criteria?: unknown;
};

type JevNoulAnswer = { type: "noul"; noul: number };
type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
};
type JevScoreAnswer = {
  type: "score";
  score: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
  confidence?: number;
};
type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
  quota?: { remaining?: number; limit?: number };
}

/* ------------------------------------------------------------------ */
/* Pure helpers (exported for tests)                                   */
/* ------------------------------------------------------------------ */

export function buildJevQuestions(questions: AskJeffQuestion[], suffix = ""): Record<string, JevQuestion> {
  const used = new Set<string>();
  const out: Record<string, JevQuestion> = {};
  questions.forEach((q, i) => {
    const base = (q.id ?? "").trim() || `q${i + 1}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    out[id] = toJevQuestion(q, suffix);
  });
  return out;
}

/** Infer the Jev question shape from what the caller provides — the caller never names it. */
function toJevQuestion(q: AskJeffQuestion, suffix: string): JevQuestion {
  const instructions = `${q.instructions}${suffix}`;
  if (q.options && q.levels) {
    throw new Error(`Question "${q.id ?? "?"}": provide options (pick one) OR levels (rate on a scale), not both.`);
  }
  if (q.options) {
    const criteria: Record<string, string | null> = {};
    for (const o of q.options) {
      const label = typeof o === "string" ? o : o.label;
      if (label in criteria) {
        throw new Error(`Question "${q.id ?? "?"}": duplicate option label "${label}". Labels must be unique.`);
      }
      criteria[label] = typeof o === "string" ? null : (o.description ?? null);
    }
    return { type: "choice", instructions, criteria };
  }
  if (q.levels) {
    return { type: "score", instructions, criteria: q.levels };
  }
  if (q.criteria?.true || q.criteria?.false) {
    return {
      type: "noul",
      instructions,
      criteria: { true: q.criteria.true ?? "", false: q.criteria.false ?? "" },
    };
  }
  return { type: "noul", instructions };
}

export function capState(state: string, limit: number): { state: string; truncated: boolean; dropped: number } {
  const s = state.trim();
  if (s.length <= limit) return { state: s, truncated: false, dropped: 0 };
  return {
    state: s.slice(0, limit) + "\n…[truncated by pi-ask-jeff]",
    truncated: true,
    dropped: s.length - limit,
  };
}

export function answerConfidence(a: JevAnswer): number {
  if (a.type === "noul") return Math.max(a.noul, 1 - a.noul);
  return a.confidence ?? 1;
}

export interface RenderedRow {
  id: string;
  line: string;
  confidence: number;
}

function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function formatScore(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export function renderRows(answers: Record<string, JevAnswer>, minConfidence = 0.6): RenderedRow[] {
  return Object.entries(answers).map(([id, a]) => {
    if (a.type === "noul") {
      const p = a.noul;
      const verdict = p >= 0.5 ? "Yes" : "No";
      const conf = Math.max(p, 1 - p);
      return { id, line: `${id}: ${verdict} — confidence ${percent(conf)}`, confidence: conf };
    }
    if (a.type === "choice") {
      const conf = a.confidence ?? 1;
      const line = `${id}: ${a.choice} — confidence ${percent(conf)}`;
      if (conf < minConfidence && a.probabilities) {
        const runnerUp = Object.entries(a.probabilities)
          .filter(([k]) => k !== a.choice)
          .sort((x, y) => y[1] - x[1])[0];
        if (runnerUp && runnerUp[1] > 0) {
          return { id, line: `${line} (runner-up: ${runnerUp[0]} ${percent(runnerUp[1])})`, confidence: conf };
        }
      }
      return { id, line, confidence: conf };
    }
    const legend = a.legend ?? {};
    const scale = Object.keys(legend).length > 0 ? ` on ${Object.values(legend).join(" → ")}` : "";
    const conf = a.confidence ?? 1;
    return { id, line: `${id}: ${formatScore(a.score)}${scale} — confidence ${percent(conf)}`, confidence: conf };
  });
}

/** Procedural framings used by careful mode — same facts, re-worded question. */
const CAREFUL_FRAMES = [
  "",
  " Answer only from the facts stated above.",
  " Weigh every fact in the state equally before answering.",
];

/**
 * Majority-vote aggregation across framing runs (careful mode).
 * These models are deterministic per input, so the only variance source is
 * the wording; a majority verdict across framings is the robust pick, and a
 * split vote (2/3) is flagged so the caller knows reliability is lower.
 */
export function aggregateCareful(
  runs: Array<Record<string, JevAnswer>>,
  questionIds: string[],
): { answers: Record<string, JevAnswer>; consensus: Record<string, number> } {
  const answers: Record<string, JevAnswer> = {};
  const consensus: Record<string, number> = {};
  for (const qid of questionIds) {
    const present = runs.map((r) => r[qid]).filter((a): a is JevAnswer => !!a);
    if (present.length === 0) continue;

    if (present[0].type === "noul") {
      const ps = (present as JevNoulAnswer[]).map((a) => a.noul).sort((a, b) => a - b);
      const mid = Math.floor(ps.length / 2);
      const median = ps.length % 2 === 1 ? (ps[mid] as number) : ((ps[mid - 1] as number) + (ps[mid] as number)) / 2;
      const majorityVerdict = median >= 0.5 ? "Yes" : "No";
      const votes = (present as JevNoulAnswer[]).filter(
        (a) => (a.noul >= 0.5 ? "Yes" : "No") === majorityVerdict,
      ).length;
      answers[qid] = { type: "noul", noul: median };
      consensus[qid] = votes;
    } else if (present[0].type === "choice") {
      const byLabel = new Map<string, { conf: number; count: number }>();
      const globalProb: Record<string, number> = {};
      for (const a of present as JevChoiceAnswer[]) {
        const cur = byLabel.get(a.choice) ?? { conf: 0, count: 0 };
        cur.count += 1;
        cur.conf += a.confidence ?? 1;
        byLabel.set(a.choice, cur);
        for (const [k, v] of Object.entries(a.probabilities ?? {})) globalProb[k] = (globalProb[k] ?? 0) + v;
      }
      const winner = [...byLabel.entries()].sort((x, y) => y[1].count - x[1].count || y[1].conf - x[1].conf)[0];
      const [label, stat] = winner as [string, { conf: number; count: number }];
      const probabilities: Record<string, number> = {};
      for (const [k, v] of Object.entries(globalProb)) probabilities[k] = v / present.length;
      answers[qid] = { type: "choice", choice: label, probabilities, confidence: stat.conf / stat.count };
      consensus[qid] = stat.count;
    } else {
      const scores = present as JevScoreAnswer[];
      const levels = scores.map((a) => Math.round(a.score));
      const counts = new Map<number, number>();
      for (const lv of levels) counts.set(lv, (counts.get(lv) ?? 0) + 1);
      const level = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0];
      const votes = levels.filter((lv) => lv === level).length;
      const meanScore = scores.reduce((s, a) => s + a.score, 0) / scores.length;
      const meanConf = scores.reduce((s, a) => s + (a.confidence ?? 1), 0) / scores.length;
      answers[qid] = { type: "score", score: meanScore, legend: scores[0].legend, confidence: meanConf };
      consensus[qid] = votes;
    }
  }
  return { answers, consensus };
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

async function httpError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown; detail?: unknown };
    detail = JSON.stringify(body.error ?? body.message ?? body.detail ?? body);
  } catch {
    /* non-JSON error body */
  }
  switch (res.status) {
    case 401:
    case 403:
      return new Error(
        `Jeff could not authenticate (HTTP ${res.status}). Check your ${host === "openrouter" ? "OPENROUTER_API_KEY" : "Jev/TypeSafe"} API key. ${detail}`,
      );
    case 422:
      return new Error(
        `Jeff rejected the request (HTTP 422). ${detail}\nCheck your question shape: choice needs options, score needs levels, instructions must be non-empty.`,
      );
    case 429:
      return new Error(`Jeff is rate-limited (HTTP 429). ${detail} Retry shortly.`);
    default:
      return new Error(`Jeff call failed (HTTP ${res.status}). ${detail}`);
  }
}

async function jevCall(
  state: string,
  questions: Record<string, JevQuestion>,
  signal?: AbortSignal,
): Promise<JevResponse> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(new Error("Jeff call aborted"));
  if (signal) {
    if (signal.aborted) controller.abort(new Error("Jeff call aborted"));
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort(new Error(`Jeff timed out after ${Math.round(resolvedConfig.timeoutMs / 1000)}s`)),
    resolvedConfig.timeoutMs,
  );
  const body = { state, model: resolvedConfig.model, questions };
  // fetch() target: canonical allowlisted endpoint, or a validated https override
  // from the user's own local config — never from model input (the tool has no URL parameter).
  const endpointUrl = resolvedConfig.endpointUrl;
  if (!endpointUrl) {
    throw new Error("Jeff endpoint is not configured"); // guarded upstream by runAskJeff
  }

  try {
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (sendKey) headers.authorization = `Bearer ${sendKey}`;
      const res = await fetch(endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) return (await res.json()) as JevResponse;

      // One retry on transient errors (429 / 529 / 5xx).
      const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
      if (retryable && attempt === 0) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        await sleep(Math.min(Number.isFinite(retryAfter) ? retryAfter : 1, 5) * 1000, controller.signal);
        continue;
      }
      throw await httpError(res);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/* ------------------------------------------------------------------ */
/* Request log                                                         */
/* ------------------------------------------------------------------ */

/** Central append-only ledger of every Jeff API attempt — successes and
 *  failures alike — in one file, unlike the per-session `ask-jeff` entry.
 *  Never contains the API key. */
export function jeffLogPath(): string {
  return join(getAgentDir(), "ask-jeff-log.jsonl");
}

/** Append one JSON line (`ts` is stamped by default). Best-effort:
 *  logging must never break the tool. */
export function appendJeffLog(entry: Record<string, unknown>, file = jeffLogPath()): void {
  try {
    appendFileSync(file, `${JSON.stringify({ ts: Date.now(), ...entry })}\n`);
  } catch {
    /* best-effort */
  }
}

/* ------------------------------------------------------------------ */
/* Tool                                                                */
/* ------------------------------------------------------------------ */

function toolError(text: string, cause?: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    details: { fatal: true, cause: cause instanceof Error ? cause.message : String(cause ?? "") },
  };
}

async function runAskJeff(params: AskJeffParams, signal?: AbortSignal): Promise<AgentToolResult<unknown>> {
  if (!localEndpoint && !apiKey) {
    return toolError(
      "Jeff is not configured: no API key found. Set OPENROUTER_API_KEY (or ASK_JEFF_API_KEY, TYPESAFE_API_KEY, JEV_AGENT_KEY, or apiKey in ~/.pi/agent/ask-jeff.json). Run /jeff for status.",
    );
  }
  if (!resolvedConfig.endpointUrl) {
    return toolError(`Jeff is not configured: ${configProblems.join("; ")}. Fix the url/host in ~/.pi/agent/ask-jeff.json or ASK_JEFF_URL and reload.`);
  }

  // Shape validation beyond the schema (TypeBox already enforces lengths).
  for (const q of params.questions) {
    if (q.options && q.levels) {
      return toolError(`Question "${q.id ?? "?"}": provide options (pick one) OR levels (rate on a scale), not both.`);
    }
    if (q.options) {
      const seen = new Set<string>();
      for (const o of q.options) {
        const label = typeof o === "string" ? o : o.label;
        if (seen.has(label)) {
          return toolError(`Question "${q.id ?? "?"}": duplicate option label "${label}". Labels must be unique.`);
        }
        seen.add(label);
      }
    }
  }

  const { state, truncated, dropped } = capState(params.state, resolvedConfig.stateCharLimit);
  const questionIds = params.questions.map((q, i) => (q.id ?? "").trim() || `q${i + 1}`);
  const frames = params.careful === true ? CAREFUL_FRAMES : [""];
  const careful = frames.length > 1;
  const started = Date.now();
  const questionLog = params.questions.map((q) => ({
    id: q.id,
    instructions: q.instructions.slice(0, 400),
  }));

  let runs: JevResponse[];
  try {
    runs = await Promise.all(
      frames.map((frame) => jevCall(state, buildJevQuestions(params.questions, frame), signal)),
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    appendJeffLog({
      ok: false,
      host,
      url: resolvedConfig.endpointUrl?.toString() ?? null,
      model: resolvedConfig.model,
      careful,
      stateChars: state.length,
      truncated,
      questions: questionLog,
      error,
      latencyMs: Date.now() - started,
    });
    return toolError(error, err);
  }

  const latencyMs = Date.now() - started;
  let answers: Record<string, JevAnswer>;
  let consensus: Record<string, number> | undefined;
  if (careful) {
    const agg = aggregateCareful(runs.map((r) => r.answers ?? {}), questionIds);
    answers = agg.answers;
    consensus = agg.consensus;
  } else {
    answers = runs[0].answers ?? {};
  }

  const rows = renderRows(answers, resolvedConfig.minConfidence);
  const lows = rows.filter((r) => r.confidence < resolvedConfig.minConfidence);
  const usage = runs[0].usage ?? {};

  const text = rows.map((r) => {
    const marker =
      consensus && consensus[r.id] !== undefined ? ` (consensus ${consensus[r.id]}/${runs.length})` : "";
    return r.line.replace(" — confidence", `${marker} — confidence`);
  });
  if (truncated) text.push(`\n(state truncated to ${resolvedConfig.stateCharLimit} chars; ${dropped} chars dropped)`);
  if (lows.length > 0) {
    text.push(
      `\n⚠ LOW CONFIDENCE on: ${lows.map((r) => `${r.id} (${percent(r.confidence)})`).join(", ")} — Jeff is unsure here; verify before acting on these.`,
    );
  }
  text.push(`\nAct on answers with confidence ≥ ${percent(resolvedConfig.minConfidence)}.`);

  // Audit trail: survive restarts, lets you tune thresholds empirically.
  try {
    piRef.appendEntry("ask-jeff", {
      ts: Date.now(),
      host,
      url: resolvedConfig.endpointUrl.toString(),
      model: runs[0].model ?? resolvedConfig.model,
      stateChars: state.length,
      truncated,
      careful,
      consensus,
      questions: questionLog,
      answers,
      usage,
      lowConfidence: lows.map((r) => r.id),
      latencyMs,
    });
  } catch {
    /* session persistence is best-effort */
  }

  // Central ledger: survives session pruning, includes failures, greppable in one place.
  appendJeffLog({
    ok: true,
    host,
    url: resolvedConfig.endpointUrl.toString(),
    model: runs[0].model ?? resolvedConfig.model,
    careful,
    consensus,
    stateChars: state.length,
    truncated,
    questions: questionLog,
    answers,
    usage,
    lowConfidence: lows.map((r) => r.id),
    latencyMs,
  });

  return {
    content: [{ type: "text", text: text.join("\n") }],
    details: {
      host,
      url: resolvedConfig.endpointUrl.toString(),
      model: runs[0].model ?? resolvedConfig.model,
      careful,
      consensus,
      answers,
      usage,
      lowConfidence: lows.map((r) => r.id),
      truncated,
      latencyMs,
      quotaRemaining: runs[0].quota?.remaining,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tool copy                                                           */
/* ------------------------------------------------------------------ */

const TOOL_DESCRIPTION = `Consult Jeff, your advisor, for a high-stakes decision. Jeff is always right: it decides from your context alone and returns a verdict with a confidence percentage — never prose, never file access, never memory of this session. Jeff answers only what you put in "state".

HOW TO WRITE STATE (Jeff's only input — this decides the answer):
- Concise and factual: evidence, constraints, criteria, options, exact numbers. No filler, no politeness, no meta-commentary.
- Self-contained: Jeff cannot see this chat, your files, or tool results. Include everything Jeff needs; quote exact numbers, code, names, messages.
- Scope or intent questions ("am I on track?", "is this off-task?", "should I delegate?"): include the original request this work belongs to — the first ask, the goal — not just the latest message. "Now the tests" means nothing without the task it hangs off.
- Declarative, not commands: "tests: 47/47 pass" beats "please check the tests".
- Mark unknowns explicitly as "FACT UNKNOWN: ..." instead of omitting them.
- If relevant, separate facts from your own opinion with "SELF-ASSESSMENT: ...".
- Do the math for Jeff: state conclusions as facts ("contrast 2.6:1 vs required 4.5:1 -> contrast fails"); don't ask Jeff to compare numbers.
- Spell the decision rule: for "pick one", state what the immediate situation demands; for incident gates, state the standard practice.
- For yes/no questions, provide criteria rubrics — they raise confidence.

WHAT YOU CAN ASK (Jeff infers the shape from what you provide):
- A yes/no question — just give "instructions". Use for gates: "Is this task completed per its definition?", "Should I delegate this to a subagent?", "Does this button comply with the design rules?".
- "Pick one" — also give "options" (2-10). Each option is a short label Jeff returns (e.g. "ops"), or { "label": "ops", "description": "runs infra checks" } to attach detail to the option. Use for routing: "Which subagent should handle this?".
- "Rate on a scale" — instead give "levels" (2-10 short descriptions, low to high). Use for risk / quality / urgency.
- Provide options OR levels, never both.

BATCHING:
- One question = one judgment: never fuse several concerns (done? + safe? + ship?) into a single instruction — each concern gets its own question in the batch; a blended question returns one mediocre probability that stands for nothing.
- "questions" may hold several independent decisions sharing the same "state"; they run in parallel in one call (one billing, one latency). Typical batch: "done?" + "delegate?" + "which agent?".
- Never batch questions that depend on each other's answers (they do not see each other); make follow-up calls instead.

CONFIDENCE:
- Every answer is a verdict with a confidence percentage. Act on answers at or above the configured threshold (≥ 60% by default); the tool flags lower-confidence answers for verification before you act on them.
- For extra reliability on high-stakes decisions set "careful": true: each question runs through 3 procedural framings and is majority-voted; split votes are marked (2/3). Costs 3 requests.`;

const PROMPT_GUIDELINES = [
  "Use ask_jeff before declaring a task complete, before delegating to a subagent, and before choosing between subagents.",
  "Write ask_jeff state as concise, self-contained facts — Jeff cannot see this session, your files, or tool results, so include every fact and option Jeff needs.",
  "Act on ask_jeff answers with confidence at or above the configured minConfidence; verify low-confidence answers before acting on them.",
  "Batch only independent ask_jeff questions into one call (done? + delegate? + which agent?); never chain questions that depend on each other's answers.",
  "Set ask_jeff careful: true for high-stakes gates (completion, delegation, incident choices): the tool majority-votes 3 framings and marks split votes.",
];

const ADVISOR_SECTION = `Jeff is your always-right advisor. Jeff gives typed, calibrated decisions only — no prose, no file access; it cannot see this session, so it answers only what you put in its context.

When to consult Jeff (ask_jeff tool):
- "Is this task completed?" — put the task definition and the evidence in state.
- "Should I delegate this to a subagent?" — put the task, constraints, and known capabilities in state.
- "Which subagent?" — list the candidates and their capabilities as options.
- "Does this output comply with the design rules?" — put the rules and the artifact in state.

How to consult: give ask_jeff the minimal state that fully determines the answer — evidence, constraints, criteria, options, exact numbers. Mark unknowns ("FACT UNKNOWN: ..."). Do the math yourself and state conclusions as facts; provide rubrics on yes/no questions. Batch independent decisions into one ask_jeff call; never chain questions that depend on each other's answers. Set careful: true on ask_jeff for high-stakes calls.

Trust answers with confidence at or above minConfidence. When Jeff flags low confidence, verify before acting and say so.`;

/* ------------------------------------------------------------------ */
/* Command                                                             */
/* ------------------------------------------------------------------ */

function lastCallCount(ctx: { sessionManager: { getBranch(): ReadonlyArray<{ type: string; customType?: string }> } }): number {
  try {
    return ctx.sessionManager
      .getBranch()
      .filter((e) => e.type === "custom" && e.customType === "ask-jeff").length;
  } catch {
    return 0;
  }
}

export interface JeffResolvedInfo {
  host: Host;
  url: string | null;
  model: string;
  keyPresent: boolean;
  keySource: string;
  keyRequired: boolean;
  /** True when the endpoint is plaintext http (loopback or private LAN). */
  localEndpoint: boolean;
  minConfidence: number;
  stateCharLimit: number;
  timeoutMs: number;
  advisorEnabled: boolean;
  configProblems: string[];
}

/** Resolved configuration facts — used by /jeff status and by tests. */
export function jeffResolvedInfo(): JeffResolvedInfo {
  return {
    host,
    url: resolvedConfig.endpointUrl?.toString() ?? null,
    model: resolvedConfig.model,
    keyPresent: !!apiKey,
    keySource: apiKeySource(),
    keyRequired: !localEndpoint && !!resolvedConfig.endpointUrl,
    localEndpoint,
    minConfidence: resolvedConfig.minConfidence,
    stateCharLimit: resolvedConfig.stateCharLimit,
    timeoutMs: resolvedConfig.timeoutMs,
    advisorEnabled: resolvedConfig.advisorEnabled,
    configProblems: [...configProblems],
  };
}

export function buildStatusText(contextLines: { calls: number }): string {
  const info = jeffResolvedInfo();
  let keyLine: string;
  if (info.keySource) {
    keyLine = `key: found (${info.keySource})`;
  } else if (info.localEndpoint) {
    keyLine = "key: not required (plaintext http endpoint)";
  } else {
    keyLine = "MISSING — set OPENROUTER_API_KEY, TYPESAFE_API_KEY, JEV_AGENT_KEY, ASK_JEFF_API_KEY, or apiKey in ~/.pi/agent/ask-jeff.json";
  }
  return [
    "pi-ask-jeff — Jeff advisor",
    keyLine,
    `host: ${info.host} → ${info.url ?? "(invalid config)"}`,
    `model: ${info.model}`,
    `minConfidence: ${info.minConfidence} (${percent(info.minConfidence)}) · stateCharLimit: ${info.stateCharLimit} chars · timeout: ${info.timeoutMs}ms · advisor section: ${info.advisorEnabled ? "on" : "off"}`,
    `ask_jeff calls this session: ${contextLines.calls}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Extension                                                           */
/* ------------------------------------------------------------------ */

let piRef: ExtensionAPI;

export default function askJeffExtension(pi: ExtensionAPI) {
  piRef = pi;

  pi.registerTool({
    name: "ask_jeff",
    label: "Ask Jeff",
    description: TOOL_DESCRIPTION,
    promptSnippet: "Consult Jeff for high-stakes decisions (completion, delegation, subagent routing, design compliance)",
    promptGuidelines: PROMPT_GUIDELINES,
    parameters: paramsSchema,
    async execute(_toolCallId, params, signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "Jeff is deliberating…" }], details: {} });
      return runAskJeff(params, signal);
    },
  });

  pi.registerCommand("jeff", {
    description: "Jeff advisor status; /jeff test runs a smoke call",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const say = (text: string) => {
        if (ctx.hasUI) ctx.ui.notify(text, "info");
        else process.stdout.write(text + "\n");
      };

      if (trimmed === "test") {
        if (!localEndpoint && !apiKey) {
          say("Jeff is not configured: no API key found. Set OPENROUTER_API_KEY etc. and reload.");
          return;
        }
        say("Jeff smoke test — asking…");
        const started = Date.now();
        try {
          const data = await jevCall(
            "pi-ask-jeff smoke test. This message is a test.",
            {
              is_test: {
                type: "noul",
                instructions: "Is this a smoke test?",
                criteria: { true: "Clearly a test", false: "Not a test" },
              },
            },
            undefined,
          );
          const row = renderRows(data.answers ?? {})[0];
          const usage = data.usage ?? {};
          say(
            [
              `Jeff answered (model ${data.model} · ${Date.now() - started}ms · ${usage.input_tokens ?? "?"} in tok):`,
              row?.line ?? "no answer",
              data.quota?.remaining !== undefined ? `quota remaining: ${data.quota.remaining}/${data.quota.limit ?? "?"}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          );
        } catch (err) {
          say(`Jeff smoke test failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      const text = buildStatusText({ calls: lastCallCount(ctx) });
      say(text);

      if (trimmed && trimmed !== "" && trimmed !== "help") {
        say(`Unknown /jeff argument "${trimmed}". Usage: /jeff (status) or /jeff test.`);
      }
    },
  });

  pi.on("before_agent_start", (event) => {
    if (!resolvedConfig.advisorEnabled) return;
    event.systemPromptOptions.sections["jeff-advisor"] = ADVISOR_SECTION;
  });
}