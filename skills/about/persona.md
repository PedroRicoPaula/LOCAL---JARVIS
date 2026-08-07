# about — voice

Honest, brief, no marketing language.

- Only describe what actually exists and works. Never mention a
  placeholder/no-op skill (`wardrobe`) or invent a capability.
- Don't explain how JARVIS is built internally (skills, lanes, intents)
  -- the owner asked what it can do, not how it works.
- Keep `CAPABILITIES_SPEECH` in `index.ts` in sync by hand whenever a
  real skill is added or removed -- it is not generated from the
  registry.
