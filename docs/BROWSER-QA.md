# Browser verification

Verified locally on September 6, 2026 (Phoenix), using two isolated Chromium sessions at 1440 × 1000 and a 390 × 844 narrow viewport. Local server: http://127.0.0.1:8005. Screenshots are local QA artifacts under `output/playwright/` and are ignored by Git.

## Completed journey

- Registered/authenticated separate accounts; opened arena and collection pages.
- Rowan summoned Frost Weaver for 100 crowns and saved it as a draft preference. The card appeared in the opening draft offer.
- Elara created ranked arena `7X3HD7`, The Sunken Court. Rowan joined by invitation. Both clients displayed Live.
- Alternated all twelve draft selections through the UI, producing six distinct characters on each team.
- Moved Ember Witch to B2 and Frost Weaver to B7 using the accessible destination control. Both locked formation; concealed opposing deployment became visible for battle.
- Moved Ember Witch to B4 and cast Wildfire on Frost Weaver: 26 damage after armor, burn applied. Rowan cast Winter Chains: 22 damage after armor and root applied. Burn ticked twice for 8 damage each.
- Received real `game.updated` WebSocket frames on the private match channel at versions 20 and 21. This independently confirms Reverb delivery beyond polling.
- Reloaded during battle and confirmed persisted health, mana, recovery, root, cooldowns and positions. Clicking the actual 3D miniature selected Ember Witch and displayed its correct state.
- Completed eight battle turns, then Rowan conceded through the confirmation dialog. Elara received +16 Elo and 100 crowns; Rowan received -16 Elo and 30 crowns.
- Elara kept the drafted Ember Witch. Reloading left crowns at 250 and removed all claim buttons; collection showed 9/12 owned. Rankings showed Elara 1016 (1 win) and Rowan 984 (1 loss).
- Narrow battlefield rendered at 390 px with document width 390 px: no horizontal overflow. Desktop remains the primary supported experience.
- Temporarily disabled the Vite hot-file marker and loaded the compiled production app from `/build/assets/app-B148F36R.js`. The 3D canvas rendered and private connection displayed Live. Restored the hot marker afterward.

## Visual artifacts

- `auth-desktop.png`: original knight artwork and authentication.
- `lobby-desktop.png`, `lobby-invite.png`: lobby and invitation.
- `draft-desktop.png`: three illustrated offers (captured before the final compact desktop spacing refinement).
- `battle-desktop.png`: actual two-player combat with distinct 3D miniatures.
- `battle-narrow.png`: narrow responsive battlefield.
- `victory-production.png`: completed match rendered with compiled production assets.

## Limits and observations

Stable gameplay and production rendering had zero application console errors. Three.js emits an upstream `THREE.Clock` deprecation warning through React Three Fiber. Rebuilding assets during the live QA session produced expected Inertia asset-version 409 reloads. The final compiled build loaded successfully.

Automated coverage additionally verifies illegal actions, privacy, reward idempotence and event replay. These checks do not establish competitive balance, production load capacity, broad GPU/browser compatibility, or Laravel Cloud deployment. No production deployment was performed.


## September 7: display, replay, correspondence, profiles and autumn UI

- Verified browser fullscreen with `document.fullscreenElement`, then exited via the visible button. Focus view fills the available window; full-width board was inspected at 1935 × 1131. Chronicle visibility and compact settings persisted after reload.
- Replayed prior completed match `7X3HD7`: action 20 restored Wildfire's original 26 damage, mana 65 → 43, recovery 0 → 2, cooldown 0 → 3, and burn 0 → 2. Previous/next actions, autoplay/pause and perspective selection worked. Replay archive showed the completed match and links correctly.
- Inspected autumn battlefield and corrected foreground tree/castle occlusion. All twelve miniatures now remain visible in the tested starting view. Original landscape appears in lobby and sign-in; woodland uses instanced trees/leaves.
- Created two unranked correspondence games through the UI: `DR0NOF` (Autumn Letters I) and `T047AA` (Autumn Letters II). Rowan joined both while the first was still active. Each received its own 24-hour draft deadline and both appeared in My games. These demo games remain open for review. Exact timeout/partial-action behavior is covered by automated time-travel tests.
- Profile rejected a profanity disguised with separators, then saved Rowan's Ashen Ranger avatar. Reload confirmed the portrait in the account navigation. Username `rowan` with existing demo password signed in successfully.
- Forgot-password form accepted the local demo recovery email and displayed its neutral confirmation. Local `MAIL_MAILER=log` was verified; no external email was sent. Full broker reset behavior is covered in tests.
- Replay, replay archive and profile had document width 390 at a 390 × 844 viewport. Profile exposes all twelve avatar choices. Desktop screenshots: `autumn-replay-focus.png`, `autumn-lobby.png`, `autumn-signin.png`, `profile-desktop.png`; narrow replay: `replay-narrow.png`.
- Started the scheduler and observed `games:expire` run successfully. Updated bin/dev starts it automatically on future runs.
- PHP: 53 tests / 729 assertions; TypeScript, Pint and production build pass. Remaining 3D bundle-size/Three.Clock warnings are upstream/rendering observations, not application errors.

Final production smoke: temporarily disabled Vite hot marker, loaded the compiled app bundle, and rendered the replay canvas at 1440 × 1000 with no application console errors; restored development hot marker.

## Practice and deployment continuity (2026-09-07)

Verified against an isolated SQLite preview database at localhost, with real browser session cookies:

- Registered a test account, opened Play against computer, and drafted six distinct champions from the full roster. The computer completed its draft and formation automatically.
- Locked formation and ended a turn. The computer moved its ranger and used Piercing Shot; control returned to the human on turn 3.
- Simulated a newer `/release` response while the game was open. The optional prompt appeared without navigation; Later collapsed it.
- Delayed an action request and asserted Refresh and resume was disabled during the pending command. After the response, refreshed and verified the same game URL and turn 3 were restored.
- Simulated a 503 on board polling. The saved board stayed visible with a reconnect notice, then recovered after the endpoint became available.
- Inspected 1440×1000 desktop and 390×844 mobile screenshots. The mobile update prompt remained usable and the page had no horizontal overflow.
- Screenshots are local artifacts in `output/playwright/` (gitignored). The injected 503 accounts for the expected browser console error during reconnection testing.
