// "Chicago, IL" from a Google Geocoding response. Used for the courier's
// "near ..." label; the exact street is never needed, only the town.

type Component = { long_name: string; short_name: string; types: string[] };
type Result = { address_components?: Component[] };

const CITY_TYPES = ["locality", "sublocality_level_1", "sublocality", "administrative_area_level_2"];

export function cityStateLabel(results: Result[] | undefined): string | null {
  if (!results?.length) return null;
  for (const r of results) {
    const comps = r.address_components ?? [];
    const find = (t: string) => comps.find((c) => c.types.includes(t));
    let city: Component | undefined;
    for (const t of CITY_TYPES) { city = find(t); if (city) break; }
    const state = find("administrative_area_level_1");
    if (city && state) return `${city.long_name}, ${state.short_name}`;
    if (city) return city.long_name;
  }
  return null;
}
