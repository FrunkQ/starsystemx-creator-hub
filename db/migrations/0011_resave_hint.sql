-- The "worth re-saving" hint.
--
-- An old export still works. But it carries no format stamp, no build stamp, and - until the
-- engine's save-hygiene work lands - app defaults written in as though the creator had authored
-- them. Re-opening it in a current SSE and saving again costs ten seconds and gives the page more
-- to show.
--
-- A VERSION, NOT A BOOLEAN, so the bar can be raised as the engine gains things worth having. Empty
-- disables the check entirely, which is the right setting if the nudge ever becomes noise.

insert into config (key, value, note) values
  ('recommend_resave_below_version', '""',
   'Suggest re-saving when a upload was made with an SSE version older than this - e.g. "3.0.190". Empty disables the version check; the hint still appears for saves with no format or build stamp at all. Raise it when the engine starts writing something the hub can use.');
