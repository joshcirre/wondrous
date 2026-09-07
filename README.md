# Wondrous

A playable multiplayer fantasy tactics MVP: Laravel 13, React 19 + Inertia 2, Three.js / React Three Fiber, Reverb and Thunk Verbs. Six champions per commander on an 8×8 tabletop battlefield.

## Run locally

Requires PHP **8.4.1+**, Composer 2, Node 22+ (Node 24 LTS recommended), npm. SQLite is the default; no Redis required.

```bash
./bin/setup
./bin/dev
```

Open **http://127.0.0.1:8005**. The dev command runs Laravel, the database queue worker, Reverb on 8080, the correspondence scheduler, and Vite. Override the web port with `WONDROUS_PORT=8006 ./bin/dev` and update APP_URL if needed. Set `WONDROUS_PHP=/path/to/php` to choose a PHP executable. Scripts also recognize Homebrew PHP 8.4 if the system PHP fails.

Create two accounts in separate browser profiles/private sessions. One creates an arena, copies the invite, and the other joins. The draft starts immediately when the second commander joins. Draft six champions each, arrange both formations, lock them, and play alternating turns. A browser refresh restores the saved match.

Optional **local-only** accounts:

```bash
php artisan db:seed --class=DemoSeeder
```

- `rowan` / `wondrous-demo`
- `elara` / `wondrous-demo`

The demo seeder refuses production and never resets existing accounts. There is no demo-login bypass.

## What is playable

- Username/password registration and sign-in, recovery email, editable display names with local profanity screening, twelve character avatars, and password management using Laravel sessions and the password broker.
- Ranked/friendly live games and unranked correspondence: 24 hours per complete battle turn, per draft pick, and per formation setup. Multiple correspondence boards can run alongside one live game, with deadlines shown in My games.
- Alternating three-card offers, six unique picks, eight shared champions plus four equally available specialist loans. Up to four owned specialist preferences influence draft offers without changing stats.
- Full-width play, browser fullscreen and focus views, saved UI density/panel/board-height settings. Hidden pregame positioning, true 3D mesh miniatures, orbit/zoom, selectable units and highlighted valid tiles. A destination dropdown provides a second way to move.
- One active champion per turn: move plus attack OR skill, facing, mana, cooldowns, recovery, directional blocks, hit rolls, burn, stun, root, healing, armor, and Herald aura/death bonus.
- Win by eliminating the enemy team or concession. Elo rating, crown rewards, random specialist pulls, duplicate refunds, and one-time winning loan claims. Currency/claims require eight completed battle turns; early battle concessions still settle rating.
- Autumn woodland court with animated leaves, castle scenery, warm medieval UI, an original illustrated landscape, twelve champion portraits, collection, rankings and a field guide.
- Participant-only completed match archive and 3D replay: play/pause/speed, scrub actions, jump turns, change perspective and inspect exact health/mana/status changes.
- Server-authoritative validation and randomness, optimistic version checks, serialized match updates, transactional rewards, private WebSocket invalidations, polling recovery, and Verbs event replay without rerolling.

## Account recovery

Sign in with your **username**, not email. The local demo recovery emails remain `rowan@wondrous.test` and `elara@wondrous.test`. Use Profile to change your portrait, display name, sign-in name or email. Changing the recovery email requires your current password.

Forgot password uses Laravel's standard password broker, expiring tokens and reset notification. Local `MAIL_MAILER=log` writes reset messages to `storage/logs/laravel.log`; configure a mail provider for delivery in production. Never publish that log. Existing accounts are preserved and receive unique usernames during migration.

## Checks

```bash
php artisan test
npm run typecheck
npm run build
```

Tests cover engine rules, HTTP match lifecycle, auth/privacy, stale and rejected requests, economic idempotence, and replay from events after deleting snapshots. Browser QA notes and screenshots are in `docs/BROWSER-QA.md` and `output/playwright/` after verification. The test DB is isolated in-memory SQLite.

## Deployment & design

- [Laravel Cloud setup](docs/LARAVEL-CLOUD.md)
- [Architecture and MVP boundaries](docs/ARCHITECTURE.md)
- [Complete game rules](docs/RULES.md)
- [Generated artwork prompts](docs/asset-prompts.md)

Initial balance requires playtesting; rating and collection ownership grant no permanent combat stats. The practice opponent uses a basic tactical search. No automated coaching, automatic matchmaking, live-game turn clock, spectators, chat, or payments in this MVP. Local name filtering is a baseline, not comprehensive contextual moderation.


## Solo practice and safe updates

Choose **Play against computer** in the arena to start a private practice game. Pick any six champions, test your formation, and fight under the normal combat rules. One practice game can remain open alongside multiplayer matches; use **Resume practice** to return. Practice has no timer or rewards and does not affect ratings or win/loss records. End practice to review the replay and try a new team.

After future deployments, an **Update is ready** prompt offers **Refresh and resume** or **Later**. It preserves the current URL and saved board, waits for pending commands, and never retries an action automatically. Connection interruptions retain the last saved board while polling reconnects. See `docs/LARAVEL-CLOUD.md` for the session and backwards-compatibility requirements that keep this safe.
