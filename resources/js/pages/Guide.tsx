import { Head, Link } from "@inertiajs/react";
import Shell, { Eyebrow } from "../components/Shell";
export default function Guide() {
    return (
        <Shell>
            <Head title="Field guide" />
            <div className="page-heading">
                <div>
                    <Eyebrow>A commander's companion</Eyebrow>
                    <h1>Know the field. Shape the battle.</h1>
                    <p className="muted">
                        The rules are simple. What you do with them is anything
                        but.
                    </p>
                </div>
            </div>
            <div className="guide-layout">
                <aside>
                    <a href="#draft">01 · The draft</a>
                    <a href="#deployment">02 · Deployment</a>
                    <a href="#turns">03 · Taking a turn</a>
                    <a href="#combat">04 · Combat & facing</a>
                    <a href="#recovery">05 · Mana & recovery</a>
                    <a href="#victory">06 · Victory & rewards</a>
                </aside>
                <div className="guide-chapters">
                    <section id="draft">
                        <Eyebrow>01 · Gather your company</Eyebrow>
                        <h2>Six champions. One shared foundation.</h2>
                        <p>
                            Both commanders draw from the same twelve champions:
                            eight standard units and four specialists. Alternate
                            picks from three random offers until you have six
                            distinct champions. Your rival's picks are visible,
                            so adapt as their team takes shape.
                        </p>
                        <p>
                            You can prioritize up to four owned specialists in
                            your collection. The first appears in your opening
                            offer. Without a collection, you still have access
                            to every specialist as a match loan. Ownership never
                            adds health, damage, or other stats.
                        </p>
                    </section>
                    <section id="deployment">
                        <Eyebrow>02 · Claim your ground</Eyebrow>
                        <h2>Your first move happens before battle.</h2>
                        <p>
                            Position your six champions anywhere in your two
                            home rows. Select a champion and click a highlighted
                            tile, or use the destination menu. Placing one onto
                            a friendly champion swaps them. Your rival cannot
                            see your positions until both commanders lock their
                            formation.
                        </p>
                        <p>
                            Put sturdy fighters between fragile casters and the
                            enemy. Keep the Crown Herald within two squares of
                            key allies for its armor aura.
                        </p>
                    </section>
                    <section id="turns">
                        <Eyebrow>03 · Make it count</Eyebrow>
                        <h2>One champion acts each turn.</h2>
                        <p>
                            Choose a ready champion. It may move once and make
                            one basic attack or cast one skill, in either order.
                            Moving or changing facing commits that champion for
                            the turn. You cannot switch to another until your
                            next turn.
                        </p>
                        <p>
                            Movement follows orthogonal paths and cannot pass
                            through living units. Attacks and skills use
                            Manhattan distance: count horizontal and vertical
                            squares, not diagonals. Ranged attacks arc over
                            other champions.
                        </p>
                        <p>
                            Press End turn when finished. You may pass without
                            acting, including when your entire warband is
                            recovering. Live games have no turn clock.
                            Correspondence gives you 24 hours to finish the
                            whole turn; partial actions never restart that
                            clock. Reconnecting restores your match.
                        </p>
                    </section>
                    <section id="combat">
                        <Eyebrow>04 · Read the angles</Eyebrow>
                        <h2>A shield cannot face every direction.</h2>
                        <p>
                            Basic attacks roll against the attacker's accuracy,
                            then the defender's block chance. Blocking is
                            strongest from the front, half as strong from the
                            side, and impossible from behind. Stunned champions
                            cannot block. Rolls and outcomes appear in the
                            chronicle.
                        </p>
                        <p>
                            Armor reduces damage, with a minimum of one damage
                            on a successful hit. Skills always hit valid targets
                            and bypass blocking, though armor still applies
                            unless the skill says otherwise. Skills that ignore
                            armor counter heavily protected champions.
                        </p>
                        <p>
                            Change facing with the direction control before
                            ending your turn. Root prevents movement; stun
                            prevents acting. The Briar Druid removes burn, root,
                            and stun from allies. The Sun Cleric offers stronger
                            direct healing.
                        </p>
                    </section>
                    <section id="recovery">
                        <Eyebrow>05 · Think a turn ahead</Eyebrow>
                        <h2>Power has a rhythm.</h2>
                        <p>
                            Attacking or casting normally makes that champion
                            sit out your next turn. Arcane Lance requires two
                            recovery turns. Simply moving does not cause
                            recovery. Rest counters tick at the end of the
                            owner's turns; a newly used attack displays two
                            until you end the current turn.
                        </p>
                        <p>
                            Each living champion restores five mana at the end
                            of its owner's turn. Skill cooldowns also tick then;
                            the displayed skill description gives the number of
                            future owner turns required. Burn deals eight damage
                            per turn for two turns. Root and stun count down at
                            the end of the affected owner's turns.
                        </p>
                    </section>
                    <section id="victory">
                        <Eyebrow>06 · A name worth remembering</Eyebrow>
                        <h2>Outlast the opposing warband.</h2>
                        <p>
                            Eliminate all six enemy champions to win. You may
                            also resign. The Crown Herald is valuable, but it is
                            not a king: losing it does not end the match. Its
                            death removes its armor aura and restores twelve
                            mana to each living enemy champion.
                        </p>
                        <p>
                            Ranked battles use Elo with a K-factor of 32.
                            Friendly matches do not change rating. Wins earn 100
                            crowns and losses earn 30 after at least eight
                            battle turns. A winning commander may keep one
                            specialist loan drafted that match; owned duplicates
                            return 40 crowns.
                        </p>
                        <p>
                            A summon costs 100 crowns. Each of the four
                            specialists has an equal 25% chance; a duplicate
                            returns 40 crowns. Nothing permanently increases
                            your combat stats.
                        </p>
                        <h2>Play at your own pace. Learn from every game.</h2>
                        <p>
                            Choose Correspondence in the arena for an unranked
                            game with a 24-hour response deadline. Each draft
                            pick and formation setup also has 24 hours. A missed
                            deadline forfeits the match; if neither player locks
                            their formation in time, the match is a draw. You
                            can keep multiple correspondence games open
                            alongside one live game. My games shows which board
                            needs your attention next.
                        </p>
                        <p>
                            Open Replays to review any of your completed games.
                            Step through actions, scrub the timeline, jump
                            between turns, or switch sides of the board. Select
                            a champion to inspect its recorded resources. Every
                            roll and outcome is preserved. Fullscreen and
                            Display settings work in both matches and replays.
                        </p>
                        <Link className="button primary" href="/">
                            Enter the arena
                        </Link>
                    </section>
                </div>
            </div>
        </Shell>
    );
}
