import assert from "node:assert/strict";
import { test } from "node:test";
import { describeWeatherCode, fetchCurrentWeather, geocode } from "./api.ts";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      json: async () => body,
    }) as Response) as typeof fetch;
}

test("geocode returns the first result's name and coordinates", async () => {
  const fetchFn = fakeFetch(200, { results: [{ name: "Ponta Delgada", latitude: 37.74, longitude: -25.67 }] });

  const result = await geocode("Ponta Delgada", fetchFn);

  assert.deepEqual(result, { name: "Ponta Delgada", lat: 37.74, lon: -25.67 });
});

test("geocode returns null for an unknown place, not a throw", async () => {
  const fetchFn = fakeFetch(200, { results: [] });

  const result = await geocode("Nowhereville", fetchFn);

  assert.equal(result, null);
});

test("geocode returns null on an HTTP error", async () => {
  const fetchFn = fakeFetch(500, {});

  const result = await geocode("Ponta Delgada", fetchFn);

  assert.equal(result, null);
});

test("fetchCurrentWeather returns temp/wind/code from the real response shape", async () => {
  const fetchFn = fakeFetch(200, { current: { temperature_2m: 21.3, wind_speed_10m: 14.2, weather_code: 2 } });

  const result = await fetchCurrentWeather(37.74, -25.67, fetchFn);

  assert.deepEqual(result, { tempC: 21.3, windKph: 14.2, code: 2 });
});

test("fetchCurrentWeather returns null when the API has nothing", async () => {
  const fetchFn = fakeFetch(200, {});

  const result = await fetchCurrentWeather(0, 0, fetchFn);

  assert.equal(result, null);
});

test("describeWeatherCode covers common codes and degrades honestly for unknown ones", () => {
  assert.equal(describeWeatherCode(0), "clear sky");
  assert.equal(describeWeatherCode(61), "light rain");
  assert.match(describeWeatherCode(9999), /don't have a description/);
});
