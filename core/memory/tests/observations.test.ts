import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { addObservation, getObservation } from "../observations.ts";

test("addObservation roundtrips through getObservation, including structured data", () => {
  const db = openDb(":memory:");
  const observation = addObservation(db, {
    imagePath: "/data/frames/x.jpg",
    provider: "ollama",
    qualitative: "a red mug on a desk",
    structured: { color: "red" },
    confidence: 0.8,
  });

  assert.deepEqual(getObservation(db, observation.id), observation);
});

test("structured may be null -- vision isn't required to produce it", () => {
  const db = openDb(":memory:");
  const observation = addObservation(db, {
    imagePath: "/data/frames/x.jpg",
    provider: "ollama",
    qualitative: "unclear",
    structured: null,
    confidence: 0.3,
  });

  assert.equal(getObservation(db, observation.id)?.structured, null);
});
