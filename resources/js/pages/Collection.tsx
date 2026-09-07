import Dialog from "../components/Dialog";
import { Head, router, usePage } from "@inertiajs/react";
import { useState } from "react";
import { SparklesIcon, CheckIcon, XMarkIcon } from "@heroicons/react/16/solid";
import Shell, { Eyebrow, ErrorBanner } from "../components/Shell";
import CharacterCard, { Portrait } from "../components/CharacterCard";
import { api, errorMessage } from "../api";
import type { Shared } from "../types";
export default function Collection() {
    const props = usePage<Shared & { owned: string[]; loadout: string[] }>()
        .props;
    const { catalog } = props;
    const [owned, setOwned] = useState(props.owned);
    const [loadout, setLoadout] = useState(props.loadout);
    const [filter, setFilter] = useState("All champions");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [reveal, setReveal] = useState<{
        character_id: string;
        duplicate: boolean;
    } | null>(null);
    const [inspect, setInspect] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    async function summon() {
        setBusy(true);
        setError("");
        try {
            const r = await api.post("/collection/pull");
            setOwned(r.data.owned);
            setReveal(r.data);
            router.reload({ only: ["auth"] });
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    }
    function toggle(id: string) {
        setSaved(false);
        setLoadout((current) =>
            current.includes(id)
                ? current.filter((c) => c !== id)
                : current.length < 4
                  ? [...current, id]
                  : current,
        );
    }
    const chars = Object.values(catalog).filter(
        (c) =>
            filter === "All champions" ||
            (filter === "Shared roster" && c.standard) ||
            (filter === "Specialists" && !c.standard) ||
            (filter === "Owned" && (c.standard || owned.includes(c.id))),
    );
    return (
        <Shell>
            <Head title="Your warband" />
            <div className="page-heading">
                <div>
                    <Eyebrow>The living collection</Eyebrow>
                    <h1>Many paths to victory.</h1>
                    <p className="muted">
                        Master their strengths. Know their counters. Choose your
                        company.
                    </p>
                </div>
                <div className="collection-total">
                    <strong>
                        {8 + owned.length}
                        <span> / 12</span>
                    </strong>
                    <small>Champions in your collection</small>
                </div>
            </div>
            <section className="collection-top">
                <div className="loadout-panel">
                    <div className="section-heading">
                        <div>
                            <Eyebrow>Your draft preferences</Eyebrow>
                            <h2>A familiar face in the draw.</h2>
                        </div>
                        <button
                            type="button"
                            className="button small"
                            onClick={() =>
                                router.post(
                                    "/collection/loadout",
                                    { cards: loadout },
                                    {
                                        preserveScroll: true,
                                        onSuccess: () => setSaved(true),
                                    },
                                )
                            }
                        >
                            {saved ? (
                                <>
                                    <CheckIcon />
                                    Saved
                                </>
                            ) : (
                                "Save preferences"
                            )}
                        </button>
                    </div>
                    <p>
                        Prioritize up to four owned specialists. Your first
                        choice appears in your opening offer. Every player still
                        draws from the same full roster.
                    </p>
                    <div className="loadout-slots">
                        {Array.from({ length: 4 }, (_, i) =>
                            loadout[i] ? (
                                <button
                                    type="button"
                                    key={i}
                                    title={`Remove ${catalog[loadout[i]].name}`}
                                    onClick={() => toggle(loadout[i])}
                                >
                                    <Portrait id={loadout[i]} />
                                    <span>{catalog[loadout[i]].name}</span>
                                    <XMarkIcon />
                                </button>
                            ) : (
                                <div key={i}>
                                    <span>＋</span>Preference {i + 1}
                                </div>
                            ),
                        )}
                    </div>
                    <p className="hint">
                        Select an owned specialist below to add it. No permanent
                        stat upgrades.
                    </p>
                </div>
                <aside className="summon-panel">
                    <SparklesIcon />
                    <Eyebrow>Answer the calling</Eyebrow>
                    <h2>A new ally awaits.</h2>
                    <p>
                        Open a summon to keep a specialist. Each has a 25%
                        chance; duplicates return 40 crowns.
                    </p>
                    <button
                        type="button"
                        className="button primary full"
                        disabled={
                            busy || (props.auth.user?.currency || 0) < 100
                        }
                        onClick={summon}
                    >
                        <SparklesIcon />
                        {busy ? "Calling a champion…" : "Summon · 100 crowns"}
                    </button>
                    <small>
                        Earn 100 crowns for a win, 30 for a loss.
                        <br />
                        Requires at least eight battle turns.
                    </small>
                </aside>
            </section>
            <ErrorBanner message={error} />
            <div className="collection-filter">
                <div className="tabs">
                    {[
                        "All champions",
                        "Shared roster",
                        "Specialists",
                        "Owned",
                    ].map((f) => (
                        <button
                            type="button"
                            className={filter === f ? "active" : ""}
                            key={f}
                            onClick={() => setFilter(f)}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <p>{chars.length} champions</p>
            </div>
            <div className="collection-grid">
                {chars.map((c) => (
                    <div key={c.id} className="collection-item">
                        <CharacterCard
                            character={c}
                            tag={
                                c.standard
                                    ? "Always available"
                                    : owned.includes(c.id)
                                      ? "In your collection"
                                      : "Available as a match loan"
                            }
                            onClick={() => setInspect(c.id)}
                        />
                        {!c.standard && owned.includes(c.id) && (
                            <button
                                type="button"
                                className={`button small full ${loadout.includes(c.id) ? "chosen" : ""}`}
                                onClick={() => toggle(c.id)}
                                disabled={
                                    !loadout.includes(c.id) &&
                                    loadout.length >= 4
                                }
                            >
                                {loadout.includes(c.id)
                                    ? "✓ Preferred in draft"
                                    : "+ Add to draft preferences"}
                            </button>
                        )}
                    </div>
                ))}
            </div>
            {(reveal || inspect) && (
                <Dialog
                    className="card-modal"
                    label={reveal ? "Summon revealed" : "Champion details"}
                    onClose={() => {
                        setReveal(null);
                        setInspect(null);
                    }}
                >
                    <button
                        type="button"
                        className="icon-button modal-close"
                        aria-label="Close champion details"
                        onClick={() => {
                            setReveal(null);
                            setInspect(null);
                        }}
                    >
                        <XMarkIcon />
                    </button>
                    <Eyebrow>
                        {reveal
                            ? reveal.duplicate
                                ? "A familiar ally · 40 crowns returned"
                                : "A champion answers your call"
                            : "Know your champion"}
                    </Eyebrow>
                    <CharacterCard
                        character={catalog[reveal?.character_id || inspect!]}
                    />
                    <p>{catalog[reveal?.character_id || inspect!].passive}</p>
                    <button
                        type="button"
                        className="button primary full"
                        onClick={() => {
                            setReveal(null);
                            setInspect(null);
                        }}
                    >
                        {reveal
                            ? "Welcome to the warband"
                            : "Back to collection"}
                    </button>
                </Dialog>
            )}
        </Shell>
    );
}
