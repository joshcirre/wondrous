# Wondrous rules (MVP)

## Equal access and draft

Two players draft six distinct characters each, alternating visible picks from three randomized offers. Both players have access to the same twelve characters: eight standards and four specialist loans. Owning cards never increases combat stats or removes your opponent's access. A loadout can contain up to four distinct owned specialists; its first character is guaranteed in the first draft offer. Remaining offer slots use weighted sampling without replacement from that player's undrafted pool: each character has one draw ticket, and every preferred owned specialist has one extra ticket (weight two). All four preferences therefore influence offers throughout the draft, while both players retain the full shared pool. Choosing a character removes both of its tickets, so an offer cannot contain duplicates. Each side can field the same character as its opponent, but cannot draft a character twice themselves.

Specialists drafted as loans are recorded as reward candidates. Match persistence determines winner rewards, currency and ranked rating. Rating and currency never modify the engine's combat stats. Strategic skill still matters: equal access does not promise equal win rates between players of very different skill.

## Deployment and turns

The board is 8 × 8. Host deploys in rows 6 and 7, guest in rows 0 and 1. Moving onto another friendly deployment tile swaps units. Ready locks that player's deployment. Both must ready before battle; host acts first.

A player activates one living, unstunned, nonrecovering character per turn. That character can move once and attack OR cast once, in either order. Facing may be adjusted freely during that activation. End turn is explicit, and passing is always allowed. All units regain five mana at the end of their owner's turn, capped at maximum.

Movement is orthogonal, measured by a shortest traversable path. Living units block movement; there is no jumping or diagonal movement. Defeated units do not block tiles. Attacks and skills measure Manhattan distance. Ranged attacks and spells arc over intervening units: this MVP does not use line of sight or terrain occlusion.

## Combat and timing

Basic attacks roll server-side accuracy (1–100), then directional block. Frontal block uses the defender's full block chance, side attacks half (rounded down), and rear attacks zero. Diagonal relative positions use the dominant displacement axis; exact ties use the vertical axis. Armor subtracts from damage, with a minimum of one damage on a successful hit. Rolls and outcomes are written into the match log, retained for the most recent 80 messages; persistent events retain action history.

Skills always hit valid targets and bypass block. Armor still applies unless the skill explicitly ignores armor. A skill costs mana and starts its individual cooldown even if its healing would exceed maximum health. Basic attacks consume the action and cause recovery even on miss or block. A unit can still complete its movement after attacking.

Recovery and cooldown are separate. An attack or skill makes a unit skip its next owner turn. Arcane Lance skips the next two owner turns. Movement or facing alone does not cause recovery. Cooldowns indicate subsequent owner turns during which the skill cannot be used. Internally both are assigned one extra counter on activation, because counters tick at the end of the owner's current turn. Thus a freshly acting unit may show recovery 2; after ending that turn it shows 1, remains unavailable next owner turn, and becomes available the following owner turn.

Statuses count down at the end of their owner's turn. Stun prevents activation for one enemy turn. Root prevents movement for two enemy turns but allows attacking, casting, and facing. Burn deals eight damage at the end of each of the next two enemy turns. Ward adds twelve armor while active (two owner end-turn ticks). Druid Renewal removes burn, root, and stun; it cannot revive defeated characters. Healing and mana restoration are capped.

## Characters

| Character | Tactical role | Skill |
| --- | --- | --- |
| Iron Warden | Frontal tank | Bastion grants an ally +12 armor |
| Ashen Ranger | Ranged pressure | Piercing Shot ignores armor |
| Dawn Knight | Durable melee | Shield Bash damages and stuns |
| Violet Arcanist | Burst mage | Arcane Lance ignores armor with extra recovery |
| Sun Cleric | Healer | Mending Light restores 38 health |
| Velvet Rogue | Mobile assassin | Backstab deals extra damage from behind |
| Thorn Pikeman | Reach fighter | Pinning Thrust damages and roots |
| Crown Herald | Aura support | Rally heals and restores mana to all allies |
| Ember Witch | Damage over time | Wildfire damages and burns |
| Frost Weaver | Movement control | Winter Chains damages and roots |
| Briar Druid | Counter support | Renewal heals and cleanses |
| Hollow Revenant | Sustained melee | Soul Tithe ignores armor and heals for damage dealt |

The living Herald grants +4 armor to allies, including itself, within Manhattan distance two. On its defeat, the opposing team gains twelve mana per living unit. Burn kills grant that benefit to the originating enemy team. Victory requires eliminating all opposing characters. A participant may resign during any unfinished phase. Finished matches reject further game actions.

## Authority

The server validates phase, membership, turn, ownership, recovery, targeting, resources, range and board geometry. Coordinates must be actual integers from 0 through 7. Clients supply intentions, never resulting health, random rolls, mana, positions for enemy units, or a winner. The persistence layer serializes actions with a version precondition to prevent concurrent double actions. The pure engine accepts an injectable random callback for repeatable tests; production uses `random_int`.


## Correspondence matches

Live matches have no turn deadline and each player may have one unfinished live match. Correspondence matches are unranked, allow multiple simultaneous games, and give 24 hours per draft pick or complete battle turn. The clock begins when an opponent joins; an empty lobby never expires. Each new picker or player turn starts a fresh 24-hour window. Moving, attacking, casting, and changing facing do not restart it.

Deployment gives both players the same 24-hour window. Ready locks your formation and satisfies your deadline; it does not extend the opponent's time. If one player misses the cutoff, the ready player wins. If both miss it, the match is a draw. A missed draft or battle deadline loses the match. The server resolves deadlines even if the browser is closed, with a scheduled check every minute and an immediate check when the match is read or acted on. Correspondence never changes ranked rating. Battle rewards still require eight completed turns; earlier phases and draws award none.

After a match finishes, both participants can replay its recorded decisions and combat outcomes. Replays reveal both deployments but omit every player's private draft offers and collection provenance.
