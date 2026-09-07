# Wondrous architecture

Laravel 13 / PHP 8.4.1+, React 19 + TypeScript / Inertia 2, Three.js via React Three Fiber, Laravel Reverb, Thunk Verbs 0.9. The installed Verbs release supports Laravel 13. Sessions use JSON serialization and cache values do not allow PHP object deserialization.

## Authoritative match state

The client only sends intent. `GameEngine` validates participant, phase, turn, ownership, reachability, target, resources, and recovery. Only the server rolls randomness. An accepted command produces a resolved board and a `MatchAdvanced` Verbs event; its `apply()` restores that result without executing randomness. Full resolved state in each event is a deliberate MVP tradeoff: larger events, simple reliable replay and a stable record across balancing changes. `MatchState` is rebuilt from events; `games.state` is the indexed query projection. `game_records` is a sequential diagnostic history, unique on game/version.

Match mutations acquire a shared cache lock and a DB row lock, require the expected version, then commit board, event, audit history and any rewards inside one database transaction. Explicit Verbs commits run before releasing the lock; auto-commit is disabled. Cache/session/queue defaults are database-backed, so one app instance requires no Redis. Creation and joining also share a per-player activity lock to permit at most one active live match per player. Correspondence matches have no such per-player limit.

`GameUpdated` broadcasts only a version on a private participant channel, after transaction commit. Clients fetch their filtered view: opponent offers/deck provenance and deployment positions stay private. A three-second polling fallback and focus/reconnect refresh recover from dropped messages or socket interruption. The lobby uses a public invalidation-only channel with no private data.

## Correspondence and replay

Games default to `time_control=live`. `correspondence` games are always unranked and can run alongside a live match or other correspondence matches. An indexed `games.turn_due_at` stores the obligation deadline. Lobbies have no clock. Joining starts a 24-hour draft-pick deadline; every accepted draft pick resets it for the next picker. Entering deployment starts a shared 24-hour deadline: each player must ready before that same cutoff. Repositioning or the first ready never extends it. Battle gives 24 hours per whole player turn. Move, attack, skill, and facing actions never extend the clock; end turn does.

`games:expire` runs every minute through Laravel's scheduler; match reads and actions also resolve overdue games under the same cache and row locks as player commands. Deadline equality counts as expired. Overdue commands are rejected after the timeout transaction commits. A timed-out player loses; if both players miss deployment, the result is a draw. System timeouts are versioned Verbs events and audit frames with a null actor, and settlement runs once. Correspondence never changes Elo, including timeouts. Battle wins/losses and earned currency follow the existing completed-turn reward gate; draft/deployment timeouts and draws pay nothing.

Participants can view completed matches at `/games/{code}/replay` or fetch `/games/{code}/replay-data`. Frames are ordered accepted-command records, preserving resolved outcomes rather than re-running the engine. All historical offers, pools, loadouts, and reward candidates are stripped for both players. Deployment units are fully revealed only in the completed-match replay. Replays do not expose action payloads or permit mutations; the action endpoint independently rejects completed matches.

## Collection and rewards

Every account draws from the full 12-character pool. Eight are standard; four can be owned or borrowed. The first owned preference is guaranteed in the opening offer; preferences have double weight in random draws. This is a preference, not a stat buff. User collection/loadout is stored as arrays for the small MVP roster.

Settlement locks both user rows in ascending order, writes rating/currency once with unique reward ledger sources, and marks the game settled. Ranked Elo K=32 starts at1000. Battle forfeits affect rating; at least eight battle turns are required for currency and loan-card claims. Summons and claims lock affected rows; duplicates refund40. Match claims are one-time and restricted to the winner's drafted loans. Early draft/deployment concessions pay nothing.

## Rendering

The game scene is a true WebGL 3D board with procedural mesh miniatures; card illustrations are static original generated PNGs in public/images/characters. No remote model or environment URLs are required. React state is only interaction selection and the latest server projection; it never independently resolves combat. Real game state persists in the database, not localStorage.

## MVP boundaries

No matchmaking queue, spectators, chat, live-match turn clock, paid currency, or stat upgrades. Players create/join named lobbies and can use invite links. These are explicit future extensions. Accounts sign in with a unique username and password, using Laravel session auth with CSRF, rate limits, password hashing and session regeneration. Profiles provide a moderated display name, a username, a recovery email and any of the twelve character avatars. Email and password changes require the current password. Laravel’s password broker provides email reset links with expiring, single-use tokens; local mail uses the log driver. Display-name and username moderation is a local baseline filter, not comprehensive contextual abuse detection. Public production should configure transactional email delivery and add verified email before broad distribution. Desktop is the primary play target; narrow layouts remain usable but are not a mobile game design.

Match balance is initial tuning, not proven fairness. Stronger players still benefit from skill. Rank never grants mechanical power. Full board event snapshots should be compacted/versioned if event volume becomes large. Use managed Postgres/MySQL and optional shared Redis for scaled Cloud deployments; don't split Verbs connections because transaction atomicity relies on one database.


## Practice games

`games.mode` separates `multiplayer` (the default for existing games) and `practice`. Practice has one real host, no guest user row, and a computer participant with ID `-1` only inside engine state. Computer audit actors are null. Access and private channel authorization still use actual game participants. Practice never enters public joinable listings and cannot be joined by another user.

Each user can keep one active practice game alongside their live and correspondence games. Creating practice again resumes it. The human can draft any six distinct champions from the full catalog; the computer drafts from normal offers. Formation privacy and combat rules are unchanged. Practice has no deadline, rating, wins/losses, currency, or card claims. Finished games remain available as private replays.

The computer performs a bounded tactical search using an isolated, deterministic engine for candidate evaluation, then executes selected commands through the real engine. It values damage, finishing blows, healing, useful statuses, movement into range, and exposure. It does not inspect the human's hidden draft offers or deployment positions. Simulated randomness never affects actual combat rolls. A human command and the resulting computer draft/deployment/turn commit atomically under the existing game lock, including individual event/replay frames. No pending bot job can be lost during a deployment. This is a baseline tactical practice opponent, not a difficulty-scaled or learning AI.

## Deployment continuity

Vite emits a fresh `build/release.json` on every production build. Its opaque hash is exposed in initial Inertia props and the uncached `/release` endpoint. An app-level prompt checks every 30 seconds and on focus/reconnect. Updates stay optional; Later collapses the prompt. Refresh is disabled while an API mutation or Inertia visit is pending and reloads the current URL. Mutations are never automatically retried. Missing lazy assets and expired sessions offer deliberate recovery instead of silently discarding the board. Login returns to the intended game URL.

Inertia asset mismatch redirects are disabled in favor of this prompt, including requests from the previous frontend release. Existing boards remain rendered during network interruptions; version-ordered polling restores authoritative state. The first release introducing this prompt needs to be loaded once before a tab can display future update notices.

Keep APP_KEY, session cookie name, session driver/storage, and session serialization stable across routine deployments. Database migrations and state/API changes must remain additive and compatible with open clients and persisted matches; retire old fields only after a compatibility window. A toast does not make a breaking combat-rule change safe. Do not flush sessions, reset games, or seed production as part of deploy. Cloud uses a shared database, stable sessions, managed queues, and Reverb.
