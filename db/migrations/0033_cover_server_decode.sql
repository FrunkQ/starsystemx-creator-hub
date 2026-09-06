-- Whether the Worker may decode a picture itself (D-53, D-54). Run after 0032. Safe to run twice.
--
-- OFF, and on a free plan it should stay off. Decoding a 4.9 megapixel screenshot in pure
-- JavaScript was measured at 168 milliseconds; the Workers free plan allows 10 of CPU, and going
-- over is not an error page, it is Cloudflare killing the request with a 1102. The creator's
-- browser prepares the pixels instead and posts them to /api/cover/fit, which costs the Worker
-- nothing at all.
--
-- The owner, 2026-09-06, choosing that over a paid plan: "i dont wanna be on the hook for any
-- runaway cost."
--
-- Turn it on only if the hub ever runs somewhere with CPU to spend. It is a fallback for a picture
-- nobody's browser has prepared, not a feature.
insert into config (key, value, note)
values ('cover_server_decode', 'false'::jsonb,
        'Let the Worker decode and fit a cover picture itself. Leave FALSE on the Workers free plan: it is ~168ms of CPU against a 10ms budget, and going over is a 1102. The browser does it instead.')
on conflict (key) do nothing;
