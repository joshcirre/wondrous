import { Head, Link, usePage } from "@inertiajs/react";
import Shell, { Eyebrow } from "../components/Shell";
import { ArrowRightIcon } from "@heroicons/react/16/solid";
import type { Shared } from "../types";
import "../../css/replay.css";
type Match = {
    code: string;
    name: string;
    ranked: boolean;
    time_control: string;
    players: { id: number; name: string }[];
    winner_id: number | null;
    finished_at: string;
};
type Pagination = {
    data: Match[];
    current_page: number;
    last_page: number;
    total: number;
    prev_page_url: string | null;
    next_page_url: string | null;
};
export default function ReplayArchive() {
    const { matches, result, auth } = usePage<
        Shared & { matches: Pagination; result: string }
    >().props;
    return (
        <Shell>
            <Head title="Match archive" />
            <div className="page-heading">
                <div>
                    <Eyebrow>Learn from every battle</Eyebrow>
                    <h1>Your match archive.</h1>
                    <p className="muted">
                        Revisit every draft, formation and decisive move.
                    </p>
                </div>
                <p>{matches.total} recorded matches</p>
            </div>
            <nav className="archive-filters" aria-label="Filter match results">
                {["all", "won", "lost", "draw"].map((r) => (
                    <Link
                        key={r}
                        className={`button small ${result === r ? "selected-filter" : ""}`}
                        aria-current={result === r ? "page" : undefined}
                        href={`/replays?result=${r}`}
                    >
                        {
                            {
                                all: "All matches",
                                won: "Victories",
                                lost: "Defeats",
                                draw: "Draws",
                            }[r]
                        }
                    </Link>
                ))}
            </nav>
            <div className="archive-list">
                {matches.data.length ? (
                    matches.data.map((g) => (
                        <Link
                            href={`/games/${g.code}/replay`}
                            className="active-game-row"
                            key={g.code}
                        >
                            <div>
                                <h2>{g.name}</h2>
                                <p>
                                    {g.players.map((p) => p.name).join(" vs ")}{" "}
                                    ·{" "}
                                    {g.time_control === "correspondence"
                                        ? "Correspondence"
                                        : g.ranked
                                          ? "Ranked"
                                          : "Friendly"}
                                </p>
                            </div>
                            <div>
                                <strong>
                                    {g.winner_id === null
                                        ? "Draw"
                                        : g.winner_id === auth.user!.id
                                          ? "Victory"
                                          : "Defeat"}
                                </strong>
                                <time dateTime={g.finished_at}>
                                    {new Date(
                                        g.finished_at,
                                    ).toLocaleDateString()}
                                </time>
                            </div>
                            <span>Review</span>
                            <ArrowRightIcon />
                        </Link>
                    ))
                ) : (
                    <div className="empty-arena">
                        <h2>No matches here yet.</h2>
                        <p>Finished games will appear here, ready to replay.</p>
                        <Link className="button" href="/">
                            Find your next rival
                        </Link>
                    </div>
                )}
            </div>
            <nav
                className="archive-pagination"
                aria-label="Match archive pages"
            >
                {matches.prev_page_url ? (
                    <Link className="button small" href={matches.prev_page_url}>
                        Previous page
                    </Link>
                ) : (
                    <span />
                )}
                <p>
                    Page {matches.current_page} of {matches.last_page}
                </p>
                {matches.next_page_url ? (
                    <Link className="button small" href={matches.next_page_url}>
                        Next page
                    </Link>
                ) : (
                    <span />
                )}
            </nav>
        </Shell>
    );
}
