import { Head, usePage } from "@inertiajs/react";
import { TrophyIcon } from "@heroicons/react/16/solid";
import Shell, { Eyebrow } from "../components/Shell";
import { Portrait } from "../components/CharacterCard";
import type { Shared, User } from "../types";
export default function Rankings() {
    const { players, auth } = usePage<Shared & { players: User[] }>().props;
    return (
        <Shell>
            <Head title="Rankings" />
            <div className="page-heading">
                <div>
                    <Eyebrow>The hall of banners</Eyebrow>
                    <h1>Names the arena remembers.</h1>
                    <p className="muted">
                        Standing is earned through decisions. Rating never
                        changes a champion's strength.
                    </p>
                </div>
                <TrophyIcon className="page-symbol" />
            </div>
            <div className="ranking-intro">
                <div>
                    <strong>{auth.user?.rating}</strong>
                    <span>Your arena rating</span>
                </div>
                <p>
                    Commanders begin at 1,000. Ranked victories and defeats
                    adjust your rating with Elo. Friendly battles leave it
                    untouched.
                </p>
            </div>
            <div className="table-scroll">
                <table className="ranking-table">
                    <thead>
                        <tr>
                            <th>Standing</th>
                            <th>Commander</th>
                            <th>Rating</th>
                            <th>Victories</th>
                            <th>Defeats</th>
                            <th>Win rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {players.map((p, i) => (
                            <tr
                                key={p.id}
                                className={
                                    p.id === auth.user?.id ? "is-you" : ""
                                }
                            >
                                <td>
                                    <span
                                        className={i < 3 ? "rank gold" : "rank"}
                                    >
                                        {String(i + 1).padStart(2, "0")}
                                    </span>
                                </td>
                                <td>
                                    <div className="commander-cell">
                                        <div className="account-avatar">
                                            {p.avatar_character_id ? (
                                                <Portrait
                                                    id={p.avatar_character_id}
                                                />
                                            ) : (
                                                p.name[0]
                                            )}
                                        </div>
                                        {p.name}
                                        {p.id === auth.user?.id && (
                                            <small>You</small>
                                        )}
                                    </div>
                                </td>
                                <td className="rating-number">{p.rating}</td>
                                <td>{p.wins}</td>
                                <td>{p.losses}</td>
                                <td>
                                    {p.wins + p.losses
                                        ? `${Math.round((p.wins / (p.wins + p.losses)) * 100)}%`
                                        : "—"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="ranking-note">
                The top 100 commanders · Equal stats, every battle.
            </p>
        </Shell>
    );
}
