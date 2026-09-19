import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cityStateLabel } from "./placeLabel.ts";

const chicago = [
  {
    address_components: [
      { long_name: "Chicago", short_name: "Chicago", types: ["locality", "political"] },
      { long_name: "Cook County", short_name: "Cook County", types: ["administrative_area_level_2", "political"] },
      { long_name: "Illinois", short_name: "IL", types: ["administrative_area_level_1", "political"] },
      { long_name: "United States", short_name: "US", types: ["country", "political"] },
    ],
  },
];

Deno.test("cityStateLabel reads locality + state abbreviation", () => {
  assertEquals(cityStateLabel(chicago), "Chicago, IL");
});

Deno.test("cityStateLabel falls back to sublocality, then county, when there is no locality", () => {
  const brooklyn = [{ address_components: [
    { long_name: "Brooklyn", short_name: "Brooklyn", types: ["sublocality_level_1", "sublocality", "political"] },
    { long_name: "New York", short_name: "NY", types: ["administrative_area_level_1", "political"] },
  ] }];
  assertEquals(cityStateLabel(brooklyn), "Brooklyn, NY");
  const rural = [{ address_components: [
    { long_name: "Lake County", short_name: "Lake County", types: ["administrative_area_level_2", "political"] },
    { long_name: "Indiana", short_name: "IN", types: ["administrative_area_level_1", "political"] },
  ] }];
  assertEquals(cityStateLabel(rural), "Lake County, IN");
});

Deno.test("cityStateLabel returns null when nothing usable is present", () => {
  assertEquals(cityStateLabel([]), null);
  assertEquals(cityStateLabel([{ address_components: [] }]), null);
  assertEquals(cityStateLabel(undefined), null);
});

Deno.test("cityStateLabel scans several results, since the first may be a street address without a locality", () => {
  const results = [
    { address_components: [{ long_name: "123 Main St", short_name: "123 Main St", types: ["street_address"] }] },
    ...chicago,
  ];
  assertEquals(cityStateLabel(results), "Chicago, IL");
});
