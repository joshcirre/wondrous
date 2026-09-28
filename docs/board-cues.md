# Wondrous board cues (Plate, 2026-09-26)

Mockup: Plate `board-cues.png` (positions and numbers are samples). All highlights and chances come from the server's legal-options payload; the client never computes rules.

## Colour rules
- Gold (`#edce91` / `#d5b676`) means you can act: legal tiles, enemies you can hit, the selected champion, hover.
- Teal (`#82b7a4`) and red (`#d99088`) are team colours on base rings only. They never mark a tile or a choice. Today's teal move tiles change to gold.
- Violet (`#b79cf2`) is a skill that's switched on; green (`#8fd19e`) is a heal and also means rear, no block.
- Grey (`#7d8479`) is spent: resting, stunned, or already acted. Dimmed, never hidden.

## Select and move
- **1. Selected.** Gold ring on the base, plus a faint outer halo. Portrait card in the side panel lights up. Nothing else changes colour.
- **2. Where you can go.** Every legal tile from the server gets a soft gold wash. Gold always means “you can click this.” Teal and red stay as team colours only; today’s teal move tiles read as “my team.”
- **3. Hover a tile.** That tile goes bright, a dotted trail shows the real path, and a ghost ring with a facing arrow sits where the champion will end up. Click to move.
- **4. Nothing in the way.** Any miniature standing between the camera and the hovered tile or target fades to 35% with its outline kept. That is the look for Weld’s click fix.

## Aim
- **5. Point at an enemy.** Here the Ranger has moved within range. Crosshair corners around the target, a dotted line from your champion, and one chip. The big number is the chance it lands. Below it: hit, block and which side you are on, then damage and the other sides’ block.
- **6. Who you can hit.** After a move (or right away), every enemy in range gets a gold tile outline, so moving shows you the attack without hunting for a button.
- **7. Attack or skill.** A small strip under the selected champion. Attack is on by default (A). The skill is one tap or S, and turns the aim cues violet (green for heals). The side panel keeps the portrait and stats only; Move, Attack, Facing and the Destination list go.
- **F. Facing ring.** On the target, the base ring splits into front (steel), sides (tan) and rear (green, “no block”). The same ring, with four arrows, is how you turn your own champion.

## What happened
- **8. Results at the target.** Hit: big damage number in ember, “HIT” under it. Blocked: steel “Blocked” with the chance. Miss: grey “Miss” with the chance (the Ranger’s real miss chance is 10%). They float up and fade. No more reading dice rolls in the log.
- **9. Resting.** Base goes grey and dashed, a moon badge shows turns left, and the miniature dims to 60%. You can see who is spent before you click. This is the Ranger’s real resting state from the audit; today it only shows as “2 REST” in the side panel.
- **10. Defeated.** The miniature tips and sinks, and a small banner in the fallen side’s colour stays on its tile until the next turn, so a death is never just a vanishing piece.
- **11. Turn change.** A short “Your turn” or “Elara’s turn” banner low on the board. The computer’s moves play one at a time while its banner is up.

## Deployment swap
- With a champion selected during deployment, hovering another of your own champions gives both bases a gold ring and draws a small two-way arrow between them, so the click reads as swap before it happens. On click, the two slide past each other over about 160 ms. Hovering an empty home-row tile shows the gold wash and ghost ring, the same as a move.

## Lethal preview
- When the server marks a target `lethal` (from `damage_on_hit`, capped at remaining health), the damage line reads "Defeats on a hit" for a basic attack, or just "Defeats" for a skill (skills always hit; use the option type the server sends), in ember instead of a number, and the target's health bar pulses. The chip shows only numbers the server sends; the client does no math.

## Motion
- **Move.** Hops tile to tile along the server path, 160 ms per tile, with a small lift. Never cuts through other pieces.
- **Melee attack.** Lunge 180 ms, hit flash 90 ms on the target, step back 120 ms.
- **Ranged / skill.** Projectile or cast glow, 250 ms. Each skill gets its own colour and shape: Piercing Shot is a gold streak, Shield Bash a steel ring, Mending Light a green rise.
- **Block / miss.** Block is a steel shield flash, 200 ms. Miss is a quick sidestep by the target, 120 ms.
- **Floating text.** Rises about 24 px over 900 ms and fades in the last 300 ms.
- **Death.** Tip and sink over 450 ms, then the banner marker.
- **Opponent turns.** Each step plays as its own beat, about 350 ms apart, then the board snaps to the server’s state. Clicks wait until it finishes.
- **Reduced motion.** Skip straight to the final board. Floating text still shows, without moving, for 900 ms.

## Reduced board (per-match setting, first match)
- Breakdown hidden (turns 1–2): the chip shows only the big "lands" number, the same size and in the same spot, with no second line. The target's base ring stays the plain team ring, with no front/side/rear split.
- Skill hidden (turns 1–3): hide the whole action strip. Don't leave a lone "Attack · A" pill there, because clicking an enemy already means attack.

## Follow-ups (2026-09-28)
### Lesson card
- Move it off the board into the top of the right side panel. That panel is empty ("Select a champion.") until a champion is selected, so the card lives there, and it sits above the champion card once one is selected.
- Styling: the "LESSON 1" label in gold mono uppercase, the title in Cinzel, one or two body lines in Inter, and "Dismiss" as a small muted text link. Use the same hairline and surface as the panel, with no drop shadow. The card should never cover a tile.
- When the lesson steps forward, fade the card over 140 ms. No slide.

### Result box vs. status badges
- Anchor the result box above the target's badge row, or above its health bar when it has no badges, never on top of the badges.
- While the result shows, hide the target's own badges and fade them back in afterwards. Neighbouring badges stay put under the box, with the box drawn on top.

### Status badge colours
- Every badge is the same dark chip (surface `#191f1a` with a hairline border). The glyph carries the colour and the count uses the text colour `#eae7db`.
- Rest and stun use grey `#a6ad9f`, because both mean spent.
- Burn uses ember `#e0894a`, the damage-number orange and not the red team colour.
- Ward uses steel `#9fb3c8`.
- Root uses moss `#8f9a5b`. Not tan, which is already the side colour on the facing ring.
- No gold on any badge, because gold means you can act.
