/**
 * ui/src/lib/hand.ts — pure geometry over MediaPipe's hand landmarks.
 *
 * Kept out of the React component on purpose: this is the part with real
 * logic worth testing (pinch detection, note mapping), and it's testable
 * with plain coordinate arrays and no DOM, no camera, no browser.
 *
 * MediaPipe's 21-point topology is fixed and documented -- the indices
 * below are its convention, not this project's choice.
 */

import type { HandLandmarks } from "./types";

export const THUMB_TIP = 4;
export const INDEX_TIP = 8;
export const MIDDLE_TIP = 12;
export const RING_TIP = 16;
export const PINKY_TIP = 20;
export const WRIST = 0;

/** MediaPipe's own hand-skeleton connections, for drawing bones between
 * landmarks. Five fingers plus the palm's own cross-links. */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm base
];

export interface Point {
  x: number;
  y: number;
}

/** Normalized (0..1) distance between two landmarks, in the image plane.
 * Z is deliberately ignored: MediaPipe's z is relative depth in loosely
 * calibrated units, and mixing it in makes the pinch threshold behave
 * differently depending on how far the hand is from the camera. */
export function distance2d(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A pinch is thumb-tip and index-tip close together, scaled by the
 * hand's own size (wrist-to-index-base) rather than a fixed number --
 * without this, a hand near the camera (large on screen) could never
 * pinch, and one far away would always look pinched. */
export function isPinching(hand: HandLandmarks, threshold = 0.35): boolean {
  const thumb = hand.landmarks[THUMB_TIP];
  const index = hand.landmarks[INDEX_TIP];
  const wrist = hand.landmarks[WRIST];
  const indexBase = hand.landmarks[5];
  if (!thumb || !index || !wrist || !indexBase) return false;
  const handSize = distance2d(wrist, indexBase);
  if (handSize === 0) return false;
  return distance2d(thumb, index) / handSize < threshold;
}

/** Midpoint of the pinch -- the natural "grab point" to drag from,
 * rather than either fingertip alone. */
export function pinchPoint(hand: HandLandmarks): Point | null {
  const thumb = hand.landmarks[THUMB_TIP];
  const index = hand.landmarks[INDEX_TIP];
  if (!thumb || !index) return null;
  return { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
}

/** How many fingers are extended, by comparing each tip's distance from
 * the wrist against its own middle joint's. Used for the open-palm
 * gesture that arms the theremin -- a deliberately coarse test, since a
 * precise finger-curl model isn't needed to tell "open hand" from
 * "pinch" or "fist". */
export function extendedFingerCount(hand: HandLandmarks): number {
  const wrist = hand.landmarks[WRIST];
  if (!wrist) return 0;
  const fingers: [number, number][] = [
    [INDEX_TIP, 6],
    [MIDDLE_TIP, 10],
    [RING_TIP, 14],
    [PINKY_TIP, 18],
  ];
  let count = 0;
  for (const [tip, joint] of fingers) {
    const t = hand.landmarks[tip];
    const j = hand.landmarks[joint];
    if (t && j && distance2d(wrist, t) > distance2d(wrist, j)) count += 1;
  }
  return count;
}

export function isOpenPalm(hand: HandLandmarks): boolean {
  return extendedFingerCount(hand) >= 4 && !isPinching(hand);
}

/** A pentatonic scale, so any finger position sounds musical rather than
 * dissonant -- the point is a playable instrument, not a frequency
 * readout. Two octaves of C major pentatonic. */
export const PENTATONIC_HZ: readonly number[] = [
  261.63, 293.66, 329.63, 392.0, 440.0, // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, 783.99, 880.0, // C5 D5 E5 G5 A5
];

/** Maps a normalized y (0 = top of frame) to a note. Inverted so a
 * raised hand plays a higher note, which is what everyone expects. */
export function noteForY(y: number): number {
  const clamped = Math.min(1, Math.max(0, y));
  const index = Math.round((1 - clamped) * (PENTATONIC_HZ.length - 1));
  return PENTATONIC_HZ[index]!;
}

// --- pinch-to-drag ---------------------------------------------------

export interface Shape {
  id: string;
  /** Normalized 0..1, the same coordinate space as landmarks -- so a
   * pinch position can be compared to a shape position directly. */
  x: number;
  y: number;
  color: string;
  label: string;
}

export interface DragState {
  shapes: Shape[];
  grabbedId: string | null;
}

/** How close a pinch must be to a shape to pick it up. */
export const GRAB_RADIUS = 0.12;

/** Pure: current drag state + where the pinch is (`null` = not pinching)
 * -> new drag state. Returns the *same object reference* when nothing
 * changed, so a caller deriving this during render can skip the setState
 * and avoid a render loop. Once a shape is grabbed it stays grabbed
 * until the pinch opens, even if the hand moves past another shape --
 * otherwise a drag would "jump" between shapes mid-gesture. */
export function applyPinch(state: DragState, grab: Point | null): DragState {
  if (!grab) {
    return state.grabbedId === null ? state : { ...state, grabbedId: null };
  }

  let held = state.grabbedId;
  if (!held) {
    let closestDist = GRAB_RADIUS;
    for (const s of state.shapes) {
      const d = Math.hypot(s.x - grab.x, s.y - grab.y);
      if (d < closestDist) {
        held = s.id;
        closestDist = d;
      }
    }
    if (!held) return state; // pinching in empty space
  }

  const current = state.shapes.find((s) => s.id === held);
  if (current && current.x === grab.x && current.y === grab.y && state.grabbedId === held) {
    return state; // already exactly there
  }
  return {
    grabbedId: held,
    shapes: state.shapes.map((s) => (s.id === held ? { ...s, x: grab.x, y: grab.y } : s)),
  };
}
