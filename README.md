# pi-ask-jeff

An advisor called **Jeff** for [pi](https://pi.dev). Jeff is always right: behind the
scenes Jeff is a **Jev-compatible System One** decision model — but you never need
to know that. To you (and to the agent calling the tool) Jeff is simply an
advisor that reads your context and returns **a verdict with a confidence
percentage**.

Jeff wants one thing from you: **concise, clear, self-contained context**. It
cannot read your files, see your chat, or remember anything. What you put in
`state` is all it knows — so the tool coaches you to write exactly that.

- **Tool:** `ask_jeff` — ask Jeff one or more batched decisions.
- **Command:** `/jeff` → status, `/jeff test` → live smoke call.
- **Advisor:** a `<jeff-advisor>` section in the system prompt tells the agent
  *when* to consult Jeff (completion checks, delegation, subagent routing,
  design compliance) and how to write state.

## How it works

```
agent (pi) ── call ask_jeff({ state, questions: [...] })
      │
      ▼
Jev System One API  { state, questions }   (transported via OpenRouter / TypeSafe / jev-agent / local von)
      │
      ▼
verdicts + calibrated confidence  →  rendered as plain text, no internals
      │
      └── every call is logged to the session (audit trail)
```

You never name a response type. Jeff infers it from what you provide:

| What you provide | You get back | Use for |
|------------------|--------------|---------|
| just `instructions` | `Yes` / `No` + confidence | gates — "is the task done?", "should I delegate?", "does this comply?" |
| `instructions` + `options` (2–10) | one picked **label** + confidence | routing — "which subagent?" |
| `instructions` + `levels` (2–10, low→high) | a position on your scale + confidence | risk / quality / urgency ratings |

Provide `options` **or** `levels`, never both.

For `options`, each entry is a **short label** — that exact string is what
Jeff returns. To attach detail to an option without bloating the label, use
`{ "label": "ops", "description": "runs infra checks" }`; the description is
sent to Jeff as the option's description and the answer still comes back as
`ops`. Duplicate labels are rejected.

Example output (nothing but verdicts, verbatim):

```
completed: No — confidence 96%
next_step_owner: ops — confidence 73%
```

Several **independent** questions sharing one `state` can be batched into a
single call — evaluated in parallel, billed once. Never batch questions that
depend on each other's answers; make follow-up calls for those.

## Installation

From git:

```bash
pi install git:github.com/a-chris/pi-ask-jeff
```

Locally (or place a copy in `~/.pi/agent/extensions/`):

```bash
pi install /path/to/pi-ask-jeff
```

Needs an API key. **OpenRouter** (recommended) — just have
`OPENROUTER_API_KEY` in your environment (the same key pi may already use):

```bash
export OPENROUTER_API_KEY=sk-or-v1-...    # already set on this machine
```

Also supported: `TYPESAFE_API_KEY` (api.typesafe.ai) and `JEV_AGENT_KEY`
(free `jv_live_` key from jev-agent.com). Host is auto-detected from which key
is set; override with `ASK_JEFF_HOST` or `host` in the config file. A **local
von server** needs no key at all — see below.

## Configuration

Environment variables (highest precedence):

| var | meaning |
|-----|---------|
| `ASK_JEFF_API_KEY` / `TYPESAFE_API_KEY` / `JEV_AGENT_KEY` / `OPENROUTER_API_KEY` | API key (first one set wins) |
| `ASK_JEFF_HOST` | `typesafe` \| `jev-agent` \| `openrouter` \| `von` |
| `ASK_JEFF_URL` | full systemone endpoint override (https, or http on loopback/private LAN) |
| `ASK_JEFF_MODEL` | model id (default: `typesafe/jev-1.13` on openrouter, `jev-latest` elsewhere) |

`~/.pi/agent/ask-jeff.json` (everything optional):

```json
{
  "apiKey": "sk-or-v1-...",
  "host": "openrouter",
  "model": "typesafe/jev-1.13",
  "minConfidence": 0.6,
  "stateCharLimit": 20000,
  "timeoutMs": 15000,
  "advisor": true
}
```

- `minConfidence` (0.6 = 60%) — answers below this are flagged
  `⚠ LOW CONFIDENCE` for verification. This is the "fallback behind every Jev
  action" rule, expressed in plain confidence.
- `stateCharLimit` — hard cap on state length (the backend budget is 32k tokens).
- `advisor` — toggle the `<jeff-advisor>` system prompt section.

## Local von server

[Von](https://github.com/wfzyx/von) is an open-source, locally hosted System
One engine exposing the same `/v1/systemone` contract (yes/no, pick-one,
rate-on-scale + confidence). Point Jeff at it:

```bash
von serve                        # default http://127.0.0.1:8000
ASK_JEFF_HOST=von pi            # or "host": "von" in ask-jeff.json
```

- **No API key needed on plaintext http endpoints** (loopback *or* private LAN)
  — the extension sends no ambient (OpenRouter/TypeSafe) key over http.
  `/jeff` shows `key: not required (plaintext http endpoint)`.
- If your von server enforces a key (server-side `VON_API_KEY`), set
  `ASK_JEFF_API_KEY` (or `apiKey`) to the same value.
- **Shared von on your LAN**: `http:` is accepted on loopback and RFC1918
  private ranges (`10.x`, `172.16–31.x`, `192.168.x`) — e.g.
  `ASK_JEFF_URL=http://192.168.1.56:8000/v1/systemone`. http to public
  internet addresses is rejected.
- Custom loopback port: `ASK_JEFF_URL=http://127.0.0.1:8123/v1/systemone`.
- Model defaults to `von-latest` (override with `ASK_JEFF_MODEL` or `model`).

## Using it

Typical calls the agent makes (all one `ask_jeff` call):

```json
{
  "state": "Task: add OAuth2 login. Evidence: A) npm test 47/47 B) callback route 302s C) README env vars not documented. Definition requires README update.",
  "questions": [
    { "instructions": "Is this task completed per its definition?" }
  ]
}
```

```json
{
  "state": "Task: fix login redirect. Evidence: A) fix in place B) unit tests pass C) manual redirect test not run. Candidates: implementer (writes code), tester (manual verification), reviewer (design/quality).",
  "questions": [
    { "id": "done", "instructions": "Is this task completed?" },
    { "id": "next", "instructions": "Who handles the next step?", "options": [
      { "label": "implementer", "description": "writes code" },
      { "label": "tester", "description": "runs manual verification" },
      { "label": "reviewer", "description": "checks design and quality" }
    ] }
  ]
}
```

Design compliance:

```json
{
  "state": "Rules: (1) primary action has min 44px touch target (2) contrast >= 4.5:1 (3) disabled state must be visibly distinct. Button: 40px tall, gray bg on white, text #9CA3AF on #FFFFFF = 2.6:1. Tagged disabled.",
  "questions": [
    { "instructions": "Does this button comply with the rules?" }
  ]
}
```

Rating on a scale:

```json
{
  "state": "Incident: checkout 503s for 40 min; 2 customers affected; rollback ready; no data loss.",
  "questions": [
    { "id": "severity", "instructions": "Rate the severity", "levels": ["Low", "Medium", "High", "Critical"] }
  ]
}
```

## Writing good state (Jeff's only input)

- **Concise + factual**: evidence, constraints, criteria, options, exact numbers.
- **Self-contained**: quote everything Jeff needs — it can't see the session.
- **Declarative**: `"tests: 47/47 pass"` beats `"please check the tests"`.
- **Mark unknowns**: `"FACT UNKNOWN: whether CI passed"` instead of omitting.
- **Separate opinion**: `"SELF-ASSESSMENT: I believe it works"`.
- **Do the math for Jeff**: state conclusions as facts (`"contrast 2.6:1 vs required 4.5:1 -> contrast fails"`) instead of asking it to compare numbers. This was the single biggest accuracy win for a small local engine in the reliability experiment (6/10 → 9/10).
- **Spell the decision rule**: for "pick one", say what the immediate situation demands; for incident gates, state the standard practice.
- **Provide rubrics on yes/no questions** (`criteria`): they raise confidence (`done2` 66→85%, `urgent` 61→91% in the experiment).

## Confidence rule

Every answer is a verdict with a calibrated confidence percentage. Act on
answers at or above `minConfidence` (≥ 60% by default); when a call is flagged
`⚠ LOW CONFIDENCE`, verify before acting — and say so. A strong-looking
`No — confidence 95%` means Jeff is 95% sure the answer is No, not 95% done.

## careful mode (high-stakes)

Set `"careful": true` on a call to trade 3× requests for a majority-vote
verdict:

```json
{
  "careful": true,
  "state": "...",
  "questions": [
    { "id": "done", "instructions": "Is this task completed per its definition?" },
    { "id": "next", "instructions": "Who handles the next step?", "options": ["ops", "dev", "qa"] }
  ]
}
```

Each question is asked through 3 procedural framings and aggregated: median
probability for yes/no, majority label for pick-one, majority level for
ratings. Outputs carry a consensus marker:

```text
done: No (consensus 3/3) — confidence 93%
risk: 0.8 on Low → Medium → High (consensus 2/3) — confidence 47%
```

A split vote (`2/3`) tells you the backend was genuinely torn — weigh that
before acting. This is the reliability machine from `test/von-experiment.ts`
(6/10 → 10/10 locally) folded into the tool.

Honest caveat: these engines are deterministic per input, so the procedural
framings produce limited diversity for already-stable answers — the big win in
the experiment came from *state-level* rewording (which the extension cannot
do safely). careful still rescues borderline flip-flops and surfaces exact
agreement, so use it for completion gates, delegation, and incident choices.

## Audit trail

Each `ask_jeff` call is appended to the session as an `ask-jeff` entry
(state length, questions, answers, model, tokens, low-confidence flags). It
survives restarts and gives you labelled data to tune `minConfidence`
empirically.

## Development

```bash
node test/unit.ts            # pure-helper smoke tests (no network)
node test/compare.ts         # bare-HTTP von vs Jev comparison on 10 grounded use cases → test/compare-results.md
node test/von-experiment.ts   # von-only reliability experiment (state variants + ensemble) → test/von-experiment-results.md
npx -y -p typescript tsc -p tsconfig.json   # type check
```

## Notes / future

- Transport: OpenRouter (default), TypeSafe, jev-agent, or a local **von**
  server — all the same contract behind one extension. A URL override
  (`ASK_JEFF_URL`) is validated at load (https anywhere, http only on
  loopback); the LLM can never choose the endpoint.
- Optional v2: a "Jeff gate" that intercepts the agent when it tries to
  conclude (task done / delegate) and forces an `ask_jeff` check first.
- The caller never sees Jev internals (`noul`/`choice`/`score`, probabilities,
  model ids) — verdicts and confidence in, verdicts and confidence out.