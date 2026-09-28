# Wondrous board clarity: spec (Brief, 2026-09-28)

Goal: a new player can take a full turn from the board alone. This builds on what's already on main (server legal options, tile highlights, hover previews, spent dimming). No new art is needed. Plate's [`board-clarity-look.md`](board-clarity-look.md) and [`board-clarity.png`](board-clarity.png) set every colour and shape; this file only names the states and the pass checks.

Rules this must respect (`docs/RULES.md`): only one champion acts per turn. It can move once and attack **or** cast once, in either order, and it can still finish its move after attacking.

## 1. Who can act
On your turn, with nothing selected, every champion that can act has a clear "ready" marker at its base. Champions that are resting, stunned or already spent are dimmed and have no marker.
- Pass: from a screenshot alone, you can say which champions can act.
- Pass: clicking a dimmed champion doesn't select it. Hovering it shows the server's reason, such as "Resting, 1 turn."
- Pass: once you've moved or acted with a champion, the others lose their ready marker.

## 2. Hover before you commit
With nothing selected, hovering a ready champion shows a faint preview of the tiles it can reach and the targets it can hit from where it stands.
- Pass: move the mouse off and the preview disappears. Nothing is selected until you click.

## 3. Select, then move
Clicking a ready champion selects it and lights up its move tiles strongly. Its **action targets** get a separate state at the same time: enemies for a basic attack, or whatever the server lists for the selected skill once the A/S strip switches to it (allies for heals and buffs, the caster's own tile for a self-cast, enemies for offensive skills).
- Pass: move tiles and action targets look clearly different at a glance, and neither is the current thin 28% gold.
- Pass: hovering a move tile shows the path and outlines the targets you could hit from that tile. If the server doesn't already send "attackable from here" for each reachable tile, add it to the server payload. Don't work it out in the browser.
- Pass: clicking a move tile moves the champion, and the action targets update to match the new tile.
- Pass: switching the strip to a heal (for example Mending Light) shows its ally targets; nothing is left without something to click.

## 4. Act (attack or cast)
Only valid targets are marked. Hovering one shows the existing aim chip, and clicking acts.
- Pass: targets out of range have no marker and do nothing on click.
- Pass: if the champion acted first, the action targets clear but its move tiles stay lit (strip reads "Action used · Move still open").
- Pass: every highlight clears only once both the move and the action are spent, or the turn ends.

## 5. A cleaner screen
The board is the game.
- The move log on the left is hidden by default. A small "Log" toggle opens it as a drawer.
- The right panel shows only the lesson card and the selected (or hovered) champion's compact card.
- The champion strip under the board is removed; the ready markers do its job.
- The header bar keeps the turn, Log, a ••• menu and End turn. No "N ready" count. End turn is highlighted once no champion can act.
- Pass: at 1440 px wide, the board takes up most of the screen, and a new player never needs the side panels to take a turn.

## Art
None for this pass. Highlights, rings and outlines are shaders or simple meshes. Blender only comes in if a later pass wants new ready or resting poses on the miniatures.

## Proof
- A real practice match, with a still for each check above.
- Stills and clips must come from a real browser window on the agent's desktop, or Chrome with software rendering on. Headless Chrome renders a blank 3D board. The board and miniatures must be visible in shot 1; a blank board fails the proof regardless of tests.
- Two short clips of full turns: hover, select, move, attack, End turn; and hover, select, attack, then move, End turn.
- A heal-skill turn still showing ally targets.
