import assert from "node:assert/strict";
import { test } from "node:test";
import { Registry } from "../registry.ts";
import { FakeProvider } from "./fakes.ts";

test("chainFor returns providers in registration order", () => {
  const registry = new Registry();
  const first = new FakeProvider({ id: "first", lanes: ["converse"] });
  const second = new FakeProvider({ id: "second", lanes: ["converse"] });

  registry.register(first);
  registry.register(second);

  assert.deepEqual(
    registry.chainFor("converse").map((p) => p.id),
    ["first", "second"],
  );
});

test("chainFor on an unregistered lane returns empty, not throw", () => {
  const registry = new Registry();
  assert.deepEqual(registry.chainFor("reason"), []);
});

test("register can target a subset of the provider's own lanes", () => {
  const registry = new Registry();
  const provider = new FakeProvider({ id: "p", lanes: ["converse", "reason"] });
  registry.register(provider, ["reason"]);

  assert.equal(registry.chainFor("converse").length, 0);
  assert.equal(registry.chainFor("reason").length, 1);
});
