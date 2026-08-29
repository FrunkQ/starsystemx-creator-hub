-- The creator vocabulary, as a config row.
--
-- A TAXONOMY IS NEVER RIGHT FIRST TIME. It needs adjusting the moment real content arrives and
-- shows which categories people actually reach for - so it lives where the gates live, editable at
-- /admin/config without a deploy. `src/lib/vocabulary.ts` carries the same list as a code default
-- for when this row is absent or malformed.

insert into config (key, value, note) values
  ('creator_vocabulary', 'null',
   'Overrides the built-in creator tag vocabulary. null = use the default in src/lib/vocabulary.ts. Otherwise a JSON array of {label, hint, tags[]} groups. Creator tags are validated against this; anything outside it is dropped.');
