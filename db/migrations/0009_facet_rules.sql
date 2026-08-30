-- Rule-driven facets: what the hub counts in a map, declared rather than coded.
--
-- WHY THIS IS A ROW. The interesting contents of a map are a moving target. Today the hub can count
-- custom calendars and tag categories, because those already ride in the save. When Star System
-- Explorer gains custom gases, fuels and engines, adding "Custom Gases: 3" should be an edit here -
-- not a deploy. src/lib/bundle/facetRules.ts carries the same list as a code default.
--
-- THE FIELD THAT MATTERS MOST IS `baseline`: the names that SHIP with SSE. `temporal_registry`
-- always contains "Earth Gregorian", so counting its keys naively would report one custom calendar
-- for every map ever made - true, universal, and therefore worthless.

alter table systems add column facet_results jsonb not null default '[]'::jsonb;

insert into config (key, value, note) values
  ('facet_rules', 'null',
   'Overrides the built-in facet rules. null = use the defaults in src/lib/bundle/facetRules.ts. Otherwise a JSON array of {id, label, category, countKeysAt?, countItemsAt?, baseline?, tagPattern?, collectValues?, minCount?, enabled?}. Set enabled:true on the custom-gases/liquids/fuels/engines rules once the engine writes those containers into a save.');
