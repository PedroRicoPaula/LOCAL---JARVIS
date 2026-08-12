/**
 * core/tests/handGeometry.test.ts — tests for `ui/src/lib/hand.ts`'s pure
 * geometry (pinch detection, open-palm detection, note mapping).
 *
 * Lives here, not under `ui/`, because `ui/` is its own Next.js project
 * with no test runner wired into `make check` (it only runs `next lint`/
 * `next build`) -- and this logic is exactly the part worth testing:
 * plain math over coordinate arrays, no DOM, no browser, no camera. The
 * import reaches across into `ui/src/lib/` deliberately; that file
 * imports nothing but a type.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPinch,
  distance2d,
  extendedFingerCount,
  isOpenPalm,
  isPinching,
  noteForY,
  PENTATONIC_HZ,
  pinchPoint,
  type DragState,
} from "../../ui/src/lib/hand.ts";
import type { HandLandmarks } from "../../shared/types.ts";

/** Builds a hand with every landmark at the origin, then applies
 * overrides -- keeps each test's setup to only the points it cares
 * about, since MediaPipe hands always have exactly 21. */
function hand(overrides: Record<number, { x: number; y: number; z?: number }>): HandLandmarks {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [index, point] of Object.entries(overrides)) {
    landmarks[Number(index)] = { x: point.x, y: point.y, z: point.z ?? 0 };
  }
  return { handedness: "Right", landmarks };
}

test("distance2d ignores z -- depth units aren't comparable to the image plane", () => {
  assert.equal(distance2d({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("pinching: thumb and index tips close together relative to hand size", () => {
  const h = hand({
    0: { x: 0.5, y: 0.9 }, // wrist
    5: { x: 0.5, y: 0.5 }, // index base -- hand size 0.4
    4: { x: 0.5, y: 0.3 }, // thumb tip
    8: { x: 0.52, y: 0.3 }, // index tip, 0.02 away
  });

  assert.equal(isPinching(h), true);
});

test("not pinching: tips far apart relative to hand size", () => {
  const h = hand({
    0: { x: 0.5, y: 0.9 },
    5: { x: 0.5, y: 0.5 },
    4: { x: 0.3, y: 0.3 },
    8: { x: 0.7, y: 0.3 }, // 0.4 apart, same as the whole hand's size
  });

  assert.equal(isPinching(h), false);
});

test("pinch detection scales with hand size -- the same finger gap reads differently near vs far", () => {
  // Identical 0.05 thumb/index gap; only the hand's apparent size differs.
  const nearCamera = hand({ 0: { x: 0.5, y: 0.9 }, 5: { x: 0.5, y: 0.3 }, 4: { x: 0.5, y: 0.2 }, 8: { x: 0.55, y: 0.2 } });
  const farAway = hand({ 0: { x: 0.5, y: 0.55 }, 5: { x: 0.5, y: 0.45 }, 4: { x: 0.5, y: 0.4 }, 8: { x: 0.55, y: 0.4 } });

  assert.equal(isPinching(nearCamera), true, "big hand, small gap -> pinch");
  assert.equal(isPinching(farAway), false, "small hand, same absolute gap -> not a pinch");
});

test("pinchPoint is the midpoint between the two tips, not either one", () => {
  const h = hand({ 4: { x: 0.2, y: 0.4 }, 8: { x: 0.4, y: 0.6 } });

  assert.deepEqual(pinchPoint(h), { x: 0.30000000000000004, y: 0.5 });
});

test("extendedFingerCount counts tips further from the wrist than their own joint", () => {
  const h = hand({
    0: { x: 0.5, y: 1.0 }, // wrist at the bottom
    6: { x: 0.4, y: 0.6 }, 8: { x: 0.4, y: 0.3 }, // index extended
    10: { x: 0.5, y: 0.6 }, 12: { x: 0.5, y: 0.3 }, // middle extended
    14: { x: 0.6, y: 0.6 }, 16: { x: 0.6, y: 0.7 }, // ring curled (tip closer than joint)
    18: { x: 0.7, y: 0.6 }, 20: { x: 0.7, y: 0.75 }, // pinky curled
  });

  assert.equal(extendedFingerCount(h), 2);
});

test("open palm: four fingers extended and not pinching", () => {
  const h = hand({
    0: { x: 0.5, y: 1.0 },
    5: { x: 0.45, y: 0.6 },
    4: { x: 0.2, y: 0.5 }, // thumb far from index tip -- not a pinch
    6: { x: 0.4, y: 0.6 }, 8: { x: 0.4, y: 0.2 },
    10: { x: 0.5, y: 0.6 }, 12: { x: 0.5, y: 0.2 },
    14: { x: 0.6, y: 0.6 }, 16: { x: 0.6, y: 0.2 },
    18: { x: 0.7, y: 0.6 }, 20: { x: 0.7, y: 0.25 },
  });

  assert.equal(isOpenPalm(h), true);
});

test("a pinching hand is never reported as an open palm, even with fingers extended", () => {
  const h = hand({
    0: { x: 0.5, y: 1.0 },
    5: { x: 0.45, y: 0.6 },
    4: { x: 0.4, y: 0.19 }, 8: { x: 0.4, y: 0.2 }, // thumb touching index tip
    6: { x: 0.4, y: 0.6 },
    10: { x: 0.5, y: 0.6 }, 12: { x: 0.5, y: 0.2 },
    14: { x: 0.6, y: 0.6 }, 16: { x: 0.6, y: 0.2 },
    18: { x: 0.7, y: 0.6 }, 20: { x: 0.7, y: 0.25 },
  });

  assert.equal(isPinching(h), true);
  assert.equal(isOpenPalm(h), false);
});

test("noteForY: raising the hand plays a higher note", () => {
  const low = noteForY(1.0); // bottom of frame
  const high = noteForY(0.0); // top of frame

  assert.equal(low, PENTATONIC_HZ[0]);
  assert.equal(high, PENTATONIC_HZ[PENTATONIC_HZ.length - 1]);
  assert.ok(high > low);
});

test("noteForY clamps out-of-range values instead of returning undefined", () => {
  assert.equal(noteForY(-5), PENTATONIC_HZ[PENTATONIC_HZ.length - 1]);
  assert.equal(noteForY(99), PENTATONIC_HZ[0]);
});

test("a hand with missing landmarks degrades to 'not pinching', never throws", () => {
  const empty: HandLandmarks = { handedness: "Right", landmarks: [] };

  assert.equal(isPinching(empty), false);
  assert.equal(pinchPoint(empty), null);
  assert.equal(extendedFingerCount(empty), 0);
});

// --- applyPinch (pinch-to-drag) --------------------------------------

function dragState(): DragState {
  return {
    shapes: [
      { id: "a", x: 0.2, y: 0.2, color: "#000", label: "◆" },
      { id: "b", x: 0.8, y: 0.8, color: "#000", label: "●" },
    ],
    grabbedId: null,
  };
}

test("pinching near a shape grabs it and moves it to the pinch point", () => {
  const next = applyPinch(dragState(), { x: 0.22, y: 0.21 });

  assert.equal(next.grabbedId, "a");
  assert.deepEqual(
    next.shapes.find((s) => s.id === "a"),
    { id: "a", x: 0.22, y: 0.21, color: "#000", label: "◆" },
  );
});

test("pinching in empty space grabs nothing and returns the identical object (no re-render)", () => {
  const state = dragState();

  const next = applyPinch(state, { x: 0.5, y: 0.5 }); // far from both shapes

  assert.equal(next, state, "same reference -- nothing changed");
  assert.equal(next.grabbedId, null);
});

test("a grabbed shape stays grabbed when dragged past another one -- no mid-drag jumping", () => {
  let state = applyPinch(dragState(), { x: 0.2, y: 0.2 }); // grab "a"
  assert.equal(state.grabbedId, "a");

  state = applyPinch(state, { x: 0.8, y: 0.8 }); // dragged right on top of "b"

  assert.equal(state.grabbedId, "a", "still holding the original shape");
  assert.deepEqual(state.shapes.find((s) => s.id === "a")?.x, 0.8);
  assert.deepEqual(state.shapes.find((s) => s.id === "b")?.x, 0.8, "b never moved from its own spot");
});

test("releasing the pinch clears the grab, leaving the shape where it was dropped", () => {
  let state = applyPinch(dragState(), { x: 0.2, y: 0.2 });
  state = applyPinch(state, { x: 0.55, y: 0.45 });

  const released = applyPinch(state, null);

  assert.equal(released.grabbedId, null);
  assert.deepEqual(released.shapes.find((s) => s.id === "a")?.x, 0.55);
});

test("no pinch and nothing held returns the identical object -- the common idle frame is free", () => {
  const state = dragState();

  assert.equal(applyPinch(state, null), state);
});

test("holding perfectly still returns the identical object rather than a new one every frame", () => {
  const grabbed = applyPinch(dragState(), { x: 0.2, y: 0.2 });

  const again = applyPinch(grabbed, { x: 0.2, y: 0.2 });

  assert.equal(again, grabbed);
});
