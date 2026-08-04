/**
 * skills/weather/api.ts — Open-Meteo (open-meteo.com): free, no API key,
 * matches CLAUDE.md § 0.2's "free tier only, no paid provider." Two
 * calls: geocode a city name to lat/lon, then current conditions for
 * that point. `fetchFn` injectable, same convention as `core/router/
 * providers/ollama.ts` -- tests run with no network (CLAUDE.md § 3).
 */

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
}

export async function geocode(city: string, fetchFn: typeof fetch = fetch): Promise<GeocodeResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  const res = await fetchFn(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: { name: string; latitude: number; longitude: number }[] };
  const first = data.results?.[0];
  return first ? { name: first.name, lat: first.latitude, lon: first.longitude } : null;
}

export interface CurrentWeather {
  tempC: number;
  windKph: number;
  code: number;
}

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: "clear sky",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  80: "rain showers",
  81: "rain showers",
  82: "violent rain showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "thunderstorm with heavy hail",
};

export function describeWeatherCode(code: number): string {
  return WEATHER_CODE_DESCRIPTIONS[code] ?? "conditions I don't have a description for";
}

export async function fetchCurrentWeather(lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<CurrentWeather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code`;
  const res = await fetchFn(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    current?: { temperature_2m: number; wind_speed_10m: number; weather_code: number };
  };
  if (!data.current) return null;
  return { tempC: data.current.temperature_2m, windKph: data.current.wind_speed_10m, code: data.current.weather_code };
}
