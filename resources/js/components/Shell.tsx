import { Link, router, usePage } from "@inertiajs/react";
import { useState, type ReactNode } from "react";
import {
    Bars3Icon,
    XMarkIcon,
    ArrowRightStartOnRectangleIcon,
    SparklesIcon,
} from "@heroicons/react/16/solid";
import type { Shared } from "../types";
import { Portrait } from "./CharacterCard";
export function Brand() {
    return (
        <Link href="/" className="brand" aria-label="Homepage">
            <img src="/favicon.svg" alt="" />
            <div>
                Wondrous<small>The sixfold arena</small>
            </div>
        </Link>
    );
}
export default function Shell({
    children,
    wide = false,
}: {
    children: ReactNode;
    wide?: boolean;
}) {
    const { auth, flash } = usePage<Shared>().props;
    const [open, setOpen] = useState(false);
    const url = usePage().url;
    const links = [
        ["/", "The arena"],
        ["/collection", "Your warband"],
        ["/rankings", "Rankings"],
        ["/replays", "Replays"],
        ["/guide", "Field guide"],
        ...(auth.user ? [["/profile", "Profile"]] : []),
    ];
    return (
        <div className="app-shell isolate">
            <header className="site-header">
                <Brand />
                <nav className="desktop-nav" aria-label="Main navigation">
                    {links.map(([href, name]) => (
                        <Link
                            key={href}
                            href={href}
                            className={url === href ? "active" : ""}
                        >
                            {name}
                        </Link>
                    ))}
                </nav>
                <div className="account-nav">
                    {auth.user && (
                        <>
                            <div
                                className="wallet"
                                title="Earn crowns through battle"
                            >
                                <SparklesIcon />
                                {auth.user.currency}
                                <span>crowns</span>
                            </div>
                            <Link
                                href="/profile"
                                className="account-avatar profile-avatar"
                                title={`View ${auth.user.name}'s profile`}
                                aria-label={`View profile for ${auth.user.name}`}
                            >
                                {auth.user.avatar_character_id ? (
                                    <Portrait
                                        id={auth.user.avatar_character_id}
                                    />
                                ) : (
                                    auth.user.name.slice(0, 1)
                                )}
                            </Link>
                            <button
                                type="button"
                                className="icon-button"
                                aria-label="Sign out"
                                onClick={() => router.post("/logout")}
                            >
                                <ArrowRightStartOnRectangleIcon />
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className="icon-button mobile-toggle"
                        aria-label="Toggle navigation"
                        aria-expanded={open}
                        onClick={() => setOpen(!open)}
                    >
                        {open ? <XMarkIcon /> : <Bars3Icon />}
                    </button>
                </div>
            </header>
            {open && (
                <nav className="mobile-nav" aria-label="Mobile navigation">
                    {links.map(([href, name]) => (
                        <Link
                            key={href}
                            href={href}
                            onClick={() => setOpen(false)}
                        >
                            {name}
                        </Link>
                    ))}
                </nav>
            )}
            {flash?.message && (
                <div role="status" className="flash">
                    {flash.message}
                </div>
            )}
            <main className={wide ? "main wide" : "main"}>{children}</main>
            <footer className="site-footer">
                <span>
                    Wondrous <b>✦</b> Six champions. One victor.
                </span>
                <span>All strength is earned on the board.</span>
            </footer>
        </div>
    );
}
export function Eyebrow({ children }: { children: ReactNode }) {
    return <p className="eyebrow">{children}</p>;
}
export function ErrorBanner({ message }: { message: string }) {
    return message ? (
        <div className="error-banner" role="alert">
            {message}
        </div>
    ) : null;
}
