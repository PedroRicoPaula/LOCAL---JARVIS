# JARVIS Dashboard

The live control panel for JARVIS (ROADMAP.md's Phase 7): approval queue,
thought stream, transcript, timeline, and skill health. Talks to `core`
only over HTTP/WS -- never imports `core/` directly (enforced by
`eslint.config.mjs`'s `no-restricted-imports` rule).

A separate Next.js project from the repo root on purpose -- its own
`package.json`, its own dependencies. See `DECISIONS.md`'s ADR-022 for why.

## Run it

`core` must already be running (`make dev` from the repo root) so it has
something to connect to. Then:

```bash
npm install
cp .env.example .env.local   # only if core isn't on the default port
npm run dev
```

Open http://localhost:3000. `NEXT_PUBLIC_JARVIS_CORE_URL` (default
`http://localhost:8787`) points at `core`'s dashboard server
(`JARVIS_DASHBOARD_PORT` on that side).

## Layout

- `src/lib/types.ts` -- hand-mirrors the wire subset of `shared/types.ts`
  (`ui/` can't import it directly across the process boundary).
- `src/lib/use-jarvis.ts` -- the one hook everything reads from: REST
  backfill on mount, then live `ServerEvent`s over a reconnecting WS.
- `src/components/` -- `Panel`/`CornerBracket` (the shared visual unit,
  styled after the Figma reference) plus one component per dashboard
  panel.
