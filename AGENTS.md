# pi-ask-jeff

An advisor extension for pi: the `ask_jeff` tool sends one state block plus a
batch of questions to a Jev-compatible System One backend (OpenRouter, TypeSafe,
jev-agent, or a local von server) and returns calibrated verdicts with
confidence scores.

## Commands

```bash
node test/unit.ts                            # 59+ pure-helper checks, offline, no key — run after every change
npx -y -p typescript tsc -p tsconfig.json    # type check — run after every change
node test/compare.ts                         # 10-case backend comparison -> rewrites test/compare-results.md; needs OPENROUTER_API_KEY (network)
node test/local-wiring.ts                    # host validation wiring; needs a backend on 127.0.0.1:8000
```

## Running the tests

- Every change lands with `node test/unit.ts` and the type check green. No
  exceptions — if one fails, fix it before committing.
- Wording is not cosmetic: rewording a question, a careful framing, or a
  threshold silently shifts every confidence number. Whenever you touch wording
  or scoring, run `node test/compare.ts` and read the diff against
  `test/compare-results.md` before committing; if a score moved, say so in the
  commit message.
- `test/compare.ts` and `test/local-wiring.ts` need network and keys — never
  let their absence block the offline suite (`unit.ts` + `tsc`).

## Improving the tests over time

The suite is a living thing, not a chore. When you work here, leave it bigger
and sharper than you found it:

- **Fixing a bug?** Add the failing case to `test/unit.ts` first (it must fail
  without the fix), then fix, then re-run.
- **Learning how Jeff answers?** New decision patterns belong in
  `test/cases.ts` with expectations reviewed into `test/compare-results.md`
  — a behavior nobody pinned down is a behavior that will silently regress.
- **Adding a helper or option to `extensions/index.ts`?** It gets at least one
  `check(...)` in `test/unit.ts` in the same commit.
- **A test that only ever passes is not testing anything.** If you add a check,
  make sure it can fail: corrupt the input once locally and watch it go red.

## Conventions

- The repo is public: no real LAN IPs, hostnames, keys, or personal paths in
  code, tests, docs, or committed results.
- Commits group changes by affinity; one concern per commit.
