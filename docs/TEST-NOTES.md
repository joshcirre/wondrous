# Verification notes

## Automated coverage

`php artisan test`: **53 tests, 729 assertions pass**. Engine coverage includes twelve picks, equal roster access, weighted preferences, phase/turn rules, deployment swaps, path blocking, strict coordinates, one-character activation, directional blocking, misses, recovery, mana, cooldowns, elimination, ownership, roots, burns, healing limits and Herald bonuses.

Eight HTTP integration tests use authenticated requests and an isolated in-memory SQLite database. They cover the match lifecycle, private offers/deployment, stale versions, unauthorized access, persisted records and Verbs events, one-time rating/currency/claims, duplicate refunds, loadout validation, authentication and private channel authorization. Replay deletes snapshots and rebuilds the board without rerolling combat.

`npm run typecheck`, `npm run build`, and `vendor/bin/pint --test` also pass. The lazily loaded 3D bundle is approximately 929 kB / 249 kB gzip; Vite reports its size warning. Browser checks, including actual private Reverb frames, are recorded in [BROWSER-QA.md](BROWSER-QA.md).

## Integration findings

- MatchAdvanced initially imported a nonexistent `Thunk\Verbs\Attributes\StateId`. Verbs requires `Thunk\Verbs\Attributes\Autodiscovery\StateId`; otherwise game creation raises CannotResolveParameter. Corrected by integration owner; full event flow passes.
- Registration initially normalized email after checking uniqueness. On SQLite, an uppercase duplicate passed validation and failed with an SQL unique constraint. Normalize before validation. Corrected before validation; regression assertion passes.

- Unprefixed Laravel throttles shared a user signature across match actions, claims and collection pulls. Playing more than ten actions incorrectly throttled a first reward claim. Corrected with separate throttle prefixes; completed-game claim regression passes.
- Private broadcast auth passes for both players and rejects outsiders using a local Pusher signer; no network traffic is involved.

- Verbs replay test deletes all snapshots, clears cached states, disables engine randomness with a throwing callback, and rebuilds the exact board and logged combat rolls from persisted events without creating new events.
- Create and join now share a player activity lock to prevent concurrent entry into multiple games.

All integration tests pass after the corrections above. HTTP and engine tests do not validate art quality, GPU performance, live Reverb delivery, Cloud infrastructure, production-scale concurrency, or game balance across repeated matches.

## September 7 additions

Correspondence tests cover simultaneous boards, exact deadline cutoffs, unchanged deadlines after partial moves/deployment, both-player deployment draws, scheduler/read/action expiration, one-time timeout rewards and event reconstruction. Replay tests cover participant privacy, faithful historical states, completed-only access, archive pagination and outcome filters. Profile/auth tests cover username-only login, existing-account migration, profanity normalization, avatar validation, protected email/password changes and Laravel password broker single-use/expired tokens.
