# Wondrous board clarity: how each state looks (Plate, 2026-09-28)

Mockup: [`board-clarity.png`](board-clarity.png). Positions and numbers are samples. Every highlight comes from the server's legal options; the client never works out rules. This goes with Brief's `docs/board-clarity.md` and replaces the "gold for enemies you can hit" rule in `docs/board-cues.md`. Attack targets are now ember.

## Colour lock
| State | Look | Colour |
|---|---|---|
| Ready to act | Gold base ring with a soft halo, plus a gold diamond above the health bar (opacity 0.7 to 1.0 over 1.6 s; held still with reduced motion). Replaces the teal ring on your turn. | gold `#edce91` |
| Selected | Ivory ring 3.5 px with a wider gold halo at 35%. The miniature lifts 4 px (80 ms ease-out). The diamond hides. | ivory `#fff4d8` |
| Can move here | Raised plate: tile quad 2–3 mm above the tile, 55% gold fill, 2 px ivory edge at 85%, and a darker lip (`#7a5f2c`) offset below. | gold |
| Hovered move tile | 55% ivory fill with a 2.5 px ivory edge, the dotted path and a ghost ring. | ivory |
| Attackable from the hovered tile | 1.8 px dashed outline around the enemy's tile. Needs the server to send targets per reachable tile. | ember `#e0894a` |
| Can attack | Filled tile at 38%, 2.5 px edge in `#ffb07a`. Hovering adds corner brackets, a dotted line and the existing aim chip. | ember |
| Heal or buff target | Same filled tile with a `#c4f0cf` edge, plus a small "+" badge above the ally. | green `#8fd19e` |
| Enemy skill target | Same filled tile. | violet `#b79cf2` |
| Can't act (resting, stunned, spent) | Grey 3 px dashed ring. The miniature is desaturated and at about 55%, and keeps its existing turns-left badge. No diamond, not selectable, not-allowed cursor; hover shows the server's reason in a pill. | grey `#7d8479` |
| Board dim while selected | A 34% ink quad (`#111613`) on every tile the selected champion can't use. Miniatures stay undimmed. | ink |
| Hover preview (nothing selected) | Move tiles at 30% gold with no edge or lip, and targets as ember outlines at 45%. A thin ivory ring on the hovered base. Clears when the pointer leaves. | gold / ember |

Gold always means "you can go here or act with this", and ember always means "you can hit this". Teal and red stay team colours for rings on the opponent's turn and on enemies.

## Turn order (from RULES.md)
- Move and act can happen in either order. If the champion acts first, only the action targets clear. The move plates stay lit and the strip under the champion reads "Action used · Move still open". Everything clears once both are spent or the turn ends.
- If the champion moves first, a "Moved" tag sits under the strip and the targets update to match the new tile.
- As soon as one champion has moved or acted, every other champion loses its ready diamond and ring.
- Switching the strip to the skill (click or S) changes the targets to whatever the server lists for that skill: green for allies, violet for enemies, and the caster's own tile for a self-cast.

## Screen
- One 56 px bar: match name, "Your turn · Turn N", then Log, a ••• menu and End turn. No ready count (only one champion acts per turn; the board markers show who can).
- End turn is a gold outline while any champion can act. It goes solid gold with a slow pulse once none can.
- The site nav, stepper and page title row are hidden during a battle.
- The chronicle becomes a left drawer, closed by default and opened with Log.
- Remove the champion strip under the board. The ready diamonds do its job.
- The right panel (340 px) holds only the lesson card and the hovered or selected champion's compact card: portrait, name, role, health, mana, badges and one ability line.
- End practice, Leave and Field guide go into the ••• menu.

## Art
Blender isn't needed. Every state is a ring, a tile quad, an outline or a material change in the existing scene. New idle or resting poses would be a separate, optional follow-up.
