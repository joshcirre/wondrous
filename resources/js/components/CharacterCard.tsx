import type { Character } from "../types";
import {
    HeartIcon,
    BoltIcon,
    ShieldCheckIcon,
} from "@heroicons/react/16/solid";
export function Portrait({
    id,
    className = "",
}: {
    id: string;
    className?: string;
}) {
    return (
        <img
            className={className}
            src={`/images/characters/${id}.png`}
            alt=""
            loading="lazy"
        />
    );
}
export default function CharacterCard({
    character: c,
    selected = false,
    onClick,
    disabled = false,
    tag,
    compact = false,
}: {
    character: Character;
    selected?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    tag?: string;
    compact?: boolean;
}) {
    const content = (
        <>
            <div className="card-art">
                <Portrait id={c.id} />
                <div className="card-shading" />
                {tag && <div className="card-tag">{tag}</div>}
                <div className="card-role">{c.role}</div>
            </div>
            <div className="card-copy">
                <h3>{c.name}</h3>
                <p>{c.title}</p>
                <div className="card-stats">
                    <span title="Health">
                        <HeartIcon />
                        {c.hp}
                    </span>
                    <span title="Attack">
                        <BoltIcon />
                        {c.attack}
                    </span>
                    <span title="Armor">
                        <ShieldCheckIcon />
                        {c.armor}
                    </span>
                </div>
                {!compact && (
                    <div className="card-skill">
                        <strong>{c.skill.name}</strong>
                        <p>{c.skill.description}</p>
                        <small>
                            {c.skill.cost} mana · {c.skill.cooldown} turn
                            cooldown
                        </small>
                    </div>
                )}
            </div>
        </>
    );
    return onClick ? (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className={`character-card ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
            style={{ "--character-color": c.color } as React.CSSProperties}
        >
            {content}
        </button>
    ) : (
        <article
            className={`character-card ${compact ? "compact" : ""}`}
            style={{ "--character-color": c.color } as React.CSSProperties}
        >
            {content}
        </article>
    );
}
