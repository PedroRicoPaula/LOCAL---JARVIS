import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMetrics } from "../metrics.ts";
import type { MemoryEvent } from "../../shared/types.ts";
import type { RoutingStatRow } from "../memory/routingStats.ts";

const NOW = Date.parse("2026-08-05T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function utterance(ts: number): MemoryEvent {
  return { id: `e-${ts}`, ts, kind: "utterance", actor: "owner", content: "x" };
}

test("counts utterances within today and this week, ignores older ones and non-utterance kinds", () => {
  const events: MemoryEvent[] = [
    utterance(NOW - 1000), // today
    utterance(NOW - 2 * DAY_MS), // this week, not today
    utterance(NOW - 10 * DAY_MS), // outside the week
    { id: "r-1", ts: NOW - 1000, kind: "response", actor: "jarvis", content: "y" },
  ];
  const metrics = computeMetrics(events, [], NOW);
  assert.equal(metrics.utterancesToday, 1);
  assert.equal(metrics.utterancesThisWeek, 2);
});

test("lane distribution counts every routing decision by lane", () => {
  const stats: RoutingStatRow[] = [
    { ts: NOW, lane: "converse", skillId: "weather", intentId: "get", matched: true },
    { ts: NOW, lane: "converse", skillId: null, intentId: null, matched: false },
    { ts: NOW, lane: "act", skillId: "launcher", intentId: "open_app", matched: true },
  ];
  const metrics = computeMetrics([], stats, NOW);
  assert.deepEqual(metrics.laneDistribution, { converse: 2, act: 1 });
});

test("skill hit rate aggregates by skill.intent, sorted most-used first", () => {
  const stats: RoutingStatRow[] = [
    { ts: NOW, lane: "converse", skillId: "weather", intentId: "get", matched: true },
    { ts: NOW, lane: "converse", skillId: "weather", intentId: "get", matched: true },
    { ts: NOW, lane: "act", skillId: "launcher", intentId: "open_app", matched: true },
  ];
  const metrics = computeMetrics([], stats, NOW);
  assert.deepEqual(metrics.skillHitRate, [
    { skillId: "weather", intentId: "get", count: 2 },
    { skillId: "launcher", intentId: "open_app", count: 1 },
  ]);
});

test("no-skill-matched rate is a fraction of all routing decisions, not just today's", () => {
  const stats: RoutingStatRow[] = [
    { ts: NOW, lane: "converse", skillId: "weather", intentId: "get", matched: true },
    { ts: NOW, lane: "converse", skillId: null, intentId: null, matched: false },
    { ts: NOW, lane: "see", skillId: null, intentId: null, matched: false },
  ];
  const metrics = computeMetrics([], stats, NOW);
  assert.equal(metrics.noSkillMatchedCount, 2);
  assert.equal(metrics.totalRoutingDecisions, 3);
  assert.equal(metrics.noSkillMatchedRate, 2 / 3);
});

test("empty input degrades to honest zeros, not NaN or a throw", () => {
  const metrics = computeMetrics([], [], NOW);
  assert.deepEqual(metrics, {
    utterancesToday: 0,
    utterancesThisWeek: 0,
    laneDistribution: {},
    skillHitRate: [],
    noSkillMatchedCount: 0,
    noSkillMatchedRate: 0,
    totalRoutingDecisions: 0,
  });
});
