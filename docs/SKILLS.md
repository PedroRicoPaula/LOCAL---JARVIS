# SKILLS.md — Skill Authoring Guide

Skills are the point. The platform exists to host them. If adding a new
capability takes more than a weekend, the platform is wrong and should be fixed
before the skill is written.

---

## 1. Anatomy

Every skill is a self-contained directory. Nothing about a skill lives outside
it except one line in the registry.

```
skills/nutrition/
├── manifest.ts        identity, intents, capabilities, version
├── index.ts           the Skill implementation
├── persona.md         how this skill speaks
├── prompts/           internal prompts — English, JSON-returning
│   ├── identify.md
│   └── confirm.md
├── schema.sql         skill-owned tables, namespaced skill_nutrition_*
├── fixtures/          test data, sample images, canned model responses
└── index.test.ts      must pass with no network and no models
```

Rules:

- A skill **owns its tables**, prefixed `skill_<id>_`. It reads shared `events`
  and `facts` through `ctx.memory`; it never writes to them directly.
- A skill **cannot import an executor.** Enforced by ESLint, not convention.
- A skill **must load and run with fakes.** If it needs the camera, it takes a
  frame source from context. If it needs a model, it goes through `ctx.router`.
- A skill that throws on load is **disabled and reported**, never fatal to core.

---

## 2. The manifest

The manifest is what the skill router reads. It is data, not code, so it can be
inspected, embedded and tested without executing anything.

```ts
import type { SkillManifest } from "@shared/types";

export const manifest: SkillManifest = {
  id: "nutrition",
  version: "1.0.0",
  description: "Logs what the owner ate, using owner-declared quantities.",

  intents: [
    {
      id: "log_meal",
      description: "Record a meal the owner is describing now.",
      examples: [
        "log a meal",
        "I just ate",
        "record my lunch",
        "add this to my food log",
        "I had chicken and rice",
      ],
      lanes: ["converse"],
    },
    {
      id: "log_meal_with_camera",
      description: "Identify food from the camera, then ask for quantities.",
      examples: [
        "help me log this meal",
        "what's on this plate",
        "here's my lunch, log it",
      ],
      lanes: ["see"],
      requiresCamera: true,
    },
    {
      id: "review_diet",
      description: "Report patterns in the food log. Never totals.",
      examples: [
        "how have I been eating",
        "what patterns do you see in my food",
        "review my week",
      ],
      lanes: ["converse", "reason"],
    },
  ],

  capabilities: ["MEMORY_READ", "MEMORY_WRITE", "CAMERA"],

  // Optional. Skills that touch anything sensitive declare it so the gate can
  // apply stricter rules and the dashboard can label it.
  sensitivity: "personal",
};
```

`examples` are not documentation. They are embedded at load time and used for
intent matching. Write them the way you actually speak, including the terse
and sloppy versions. Five to eight per intent.

---

## 3. Intent routing — two stages

Stage one is the **router** (`SPEC.md` § 3): which lane. Stage two is the
**skill router**: which skill, which intent.

```
utterance
   ↓
lane classifier            reflex | converse | reason | see | act
   ↓
skill router
   ├─ embed the utterance (local, free)
   ├─ cosine match against all manifest examples
   ├─ if top score > 0.72 and margin over runner-up > 0.08  → dispatch
   ├─ if ambiguous → converse lane disambiguates with the top 3 candidates
   └─ if nothing matches → general conversation, no skill
   ↓
skill.handle(input, ctx)
```

Design notes:

- Embedding match is cheap, local and deterministic. It handles the 80% case
  with no model call and no latency.
- The disambiguation step is the only place a model chooses a skill, and it
  chooses from a shortlist, never from the full set.
- Thresholds live in config, not code. Tune them during SOAK with real data.
- Every routing decision is logged with scores. When the wrong skill fires, the
  log tells you whether to add an example or move a threshold.

---

## 4. The Skill interface

```ts
export interface Skill {
  readonly manifest: SkillManifest;

  /** Optional. Called once at load. Throwing here disables the skill. */
  init?(ctx: SkillInitContext): Promise<void>;

  handle(input: SkillInput, ctx: SkillContext): Promise<SkillResult>;

  /** Optional. Called when the owner cancels mid-interaction. */
  cancel?(sessionId: string): Promise<void>;
}
```

### What context gives you

```ts
export interface SkillContext {
  /** All model access. Never call a provider directly. */
  router: Router;

  /** Reads are free. Writes go through propose(). */
  memory: Memory;

  /** Camera. Only available if the manifest declares CAMERA. */
  camera: CameraHandle;

  /** The only way to cause a side effect. Returns after the owner decides. */
  propose(action: ProposedAction): Promise<ApprovalOutcome>;

  /** Speak now. Streams sentence by sentence — do not batch. */
  say(text: string): void;

  /** Ask the owner something and wait for a spoken answer. */
  ask(question: string, opts?: { timeoutMs?: number }): Promise<string>;

  /** Skill-owned storage. Namespaced automatically. */
  store: SkillStore;

  sessionId: string;
  now(): number;
  log: Logger;
}
```

`ctx.ask` is what makes conversational skills possible. It is a first-class
primitive, not something each skill reinvents.

---

## 5. Worked example — the confirmation loop

This is the shape most skills should have: propose, confirm, then write.

```ts
export const skill: Skill = {
  manifest,

  async handle(input, ctx) {
    // 1. Optionally use vision to *identify*. Never to quantify.
    let identified: string[] = [];
    if (input.intent === "log_meal_with_camera") {
      const frame = await ctx.camera.capture();
      const seen = await ctx.router.see({
        imagePath: frame.path,
        prompt: PROMPTS.identify,      // returns { items: string[] }
        timeoutMs: 10_000,
      });
      identified = (seen.structured as { items: string[] })?.items ?? [];

      ctx.say(
        identified.length
          ? `I can see ${list(identified)}. I can't judge weights — tell me the quantities.`
          : `I can't make out the items clearly. Tell me what's there.`,
      );
    }

    // 2. The owner supplies the facts. Always.
    const spoken = await ctx.ask("Go ahead.");
    const parsed = await parseItems(ctx.router, spoken);   // → FoodItem[]

    // 3. Read it back. Nothing is written before the owner confirms.
    ctx.say(`${summarise(parsed)}. Confirm and log?`);
    const answer = await ctx.ask("");
    if (!isAffirmative(answer)) {
      return { speech: "Nothing logged." };
    }

    // 4. Calories come from a lookup table, not from a model.
    const enriched = await lookupNutrition(ctx.store, parsed);

    // 5. Writing memory is a capability. It goes through the gate.
    const outcome = await ctx.propose({
      capability: "MEMORY_WRITE",
      humanSummary: `Log meal: ${summarise(parsed)}`,
      payload: { items: enriched, at: ctx.now() },
    });

    return outcome.ok
      ? { speech: "Logged." }
      : { speech: "Not logged." };
  },
};
```

Note what is absent: no model ever produces a number that gets stored. The
owner declares quantities; a static table converts them. See `SPEC.md` § 7.

---

## 6. Persona

Each skill ships a `persona.md` fragment describing how *it* speaks. The core
persona in `core/persona.md` sets the baseline; the skill fragment adjusts it.

```markdown
# nutrition — voice

Brief. Transactional. This runs while the owner is holding a fork.

- Read back exactly what was said. Do not paraphrase food into other food.
- Never comment on whether a meal is good or bad. That is the coach's job,
  and only when asked.
- Never state a daily total.
- If a quantity was not given, ask for it once. If it is still not given,
  log the item without a quantity rather than guessing.
```

Keeping tone in a file per skill is what stops the whole assistant from
drifting into one flat voice.

---

## 7. Testing

A skill's tests must pass with no network, no models, no camera, no database
file. Everything is injected.

```ts
const ctx = makeFakeContext({
  router: fakeRouter({
    see: { qualitative: "chicken, rice, salad",
           structured: { items: ["grilled chicken", "white rice", "green salad"] },
           confidence: 0.8 },
  }),
  answers: ["180 grams chicken, 150 grams rice", "yes"],
  camera: fakeCamera("fixtures/lunch.jpg"),
});

const result = await skill.handle({ intent: "log_meal_with_camera", ... }, ctx);

expect(ctx.proposals).toHaveLength(1);
expect(ctx.proposals[0].capability).toBe("MEMORY_WRITE");
expect(result.speech).toBe("Logged.");
```

Required tests for every skill:

1. Happy path.
2. Owner rejects at the confirmation step → nothing proposed.
3. The model returns garbage → skill degrades, does not throw.
4. A proposal is rejected by the gate → skill reports it, does not retry.
5. `cancel()` mid-interaction leaves no partial state.

---

## 8. Adding a skill — the 30-minute test

```bash
make new-skill id=wardrobe
```

Scaffolds the directory, a manifest with one intent, a passing test, and the
registry line. From there to a working no-op skill should take under 30
minutes.

Time it. If it takes longer, the platform has a defect — fix the platform, not
the skill. This is the acceptance criterion for Phase 5 and the thing that
determines whether this project has ten skills in a year or three.

---

## 9. Skill checklist

Before a skill is considered done:

- [ ] Manifest examples cover terse, verbose and sloppy phrasings
- [ ] Every capability in the manifest is actually used; none is over-declared
- [ ] No executor import (lint passes)
- [ ] Tests pass offline with all five required cases
- [ ] `persona.md` written; the skill does not sound like every other skill
- [ ] Owner-facing numbers are measured or declared, never model-generated
- [ ] Failure mode is a spoken sentence, not a stack trace
- [ ] Added to the table in `SPEC.md` § 5
