import { Head, Link, useForm, usePage } from "@inertiajs/react";
import { useState } from "react";
import { Brand, Eyebrow } from "../components/Shell";
import { ArrowRightIcon } from "@heroicons/react/16/solid";
export default function Auth() {
    const [register, setRegister] = useState(false);
    const { flash } = usePage<{ flash?: { message?: string } }>().props;
    const form = useForm({
        name: "",
        username: "",
        email: "",
        password: "",
        password_confirmation: "",
        remember: true,
    });
    return (
        <div className="auth-page">
            <Head title="Enter the arena" />
            <div className="auth-art">
                <img
                    className="auth-backdrop"
                    src="/images/autumn-realm.png"
                    alt="An autumn woodland overlooking a medieval castle"
                />
                <div className="auth-art-overlay" />
                <div className="auth-brand">
                    <Brand />
                </div>
                <div className="auth-story">
                    <Eyebrow>A new chapter of rivalry</Eyebrow>
                    <h1>
                        Fortune deals.
                        <br />
                        Strategy decides.
                    </h1>
                    <p>
                        Six champions. A thousand possibilities.
                        <br />
                        Your legend begins across the board.
                    </p>
                    <div className="auth-features">
                        <span>1 vs 1</span>
                        <span>Turn-based tactics</span>
                        <span>True 3D battles</span>
                    </div>
                </div>
            </div>
            <div className="auth-form-area">
                <div className="auth-form">
                    <Eyebrow>Welcome to Wondrous</Eyebrow>
                    <h2>{register ? "Raise your banner." : "Welcome back."}</h2>
                    <p className="muted">
                        {register
                            ? "Build a warband. Find your rival. Make your move."
                            : "Your next great rivalry awaits."}
                    </p>
                    <div className="form-tabs">
                        <button
                            type="button"
                            className={register ? "active" : ""}
                            onClick={() => {
                                setRegister(true);
                                form.clearErrors();
                            }}
                        >
                            Create account
                        </button>
                        <button
                            type="button"
                            className={!register ? "active" : ""}
                            onClick={() => {
                                setRegister(false);
                                form.clearErrors();
                            }}
                        >
                            Sign in
                        </button>
                    </div>
                    {flash?.message && <p role="status">{flash.message}</p>}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            form.post(register ? "/register" : "/login");
                        }}
                    >
                        {register && (
                            <label>
                                Commander name
                                <input
                                    name="name"
                                    autoComplete="nickname"
                                    required
                                    maxLength={24}
                                    value={form.data.name}
                                    onChange={(e) =>
                                        form.setData("name", e.target.value)
                                    }
                                    placeholder="How will the arena know you?"
                                />
                            </label>
                        )}
                        <label>
                            Username
                            <input
                                name="username"
                                autoComplete="username"
                                required
                                minLength={3}
                                maxLength={24}
                                pattern="[A-Za-z0-9_]+"
                                value={form.data.username}
                                onChange={(e) =>
                                    form.setData("username", e.target.value)
                                }
                                placeholder="Your sign-in name"
                            />
                        </label>
                        {register && (
                            <p className="hint">
                                3–24 letters, numbers, or underscores. Your
                                commander name is shown in the arena.
                            </p>
                        )}
                        {register && (
                            <label>
                                Recovery email
                                <input
                                    name="email"
                                    autoComplete="email"
                                    type="email"
                                    required
                                    value={form.data.email}
                                    onChange={(e) =>
                                        form.setData("email", e.target.value)
                                    }
                                    placeholder="you@example.com"
                                />
                            </label>
                        )}
                        <label>
                            Password
                            <input
                                name="password"
                                type="password"
                                minLength={8}
                                autoComplete={
                                    register
                                        ? "new-password"
                                        : "current-password"
                                }
                                required
                                value={form.data.password}
                                onChange={(e) =>
                                    form.setData("password", e.target.value)
                                }
                                placeholder="At least 8 characters"
                            />
                        </label>
                        {register && (
                            <label>
                                Confirm password
                                <input
                                    name="password_confirmation"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    value={form.data.password_confirmation}
                                    onChange={(e) =>
                                        form.setData(
                                            "password_confirmation",
                                            e.target.value,
                                        )
                                    }
                                />
                            </label>
                        )}
                        {Object.entries(form.errors).map(([key, message]) => (
                            <p className="form-error" key={key} role="alert">
                                {message}
                            </p>
                        ))}
                        <button
                            type="submit"
                            className="button primary full"
                            disabled={form.processing}
                        >
                            {form.processing
                                ? "Preparing your banner…"
                                : register
                                  ? "Enter the arena"
                                  : "Sign in"}
                            <ArrowRightIcon />
                        </button>
                    </form>
                    {!register && (
                        <p className="hint">
                            <Link href="/forgot-password">
                                Forgot your password?
                            </Link>
                        </p>
                    )}
                    <p className="auth-fair">
                        Every commander starts on equal ground. Collections
                        unlock choices, never stronger stats.
                    </p>
                </div>
                <p className="auth-foot">A game of foresight, not firepower.</p>
            </div>
        </div>
    );
}
