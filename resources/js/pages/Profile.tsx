import { Head, useForm, usePage } from "@inertiajs/react";
import Shell, { Eyebrow } from "../components/Shell";
import type { Shared } from "../types";

export default function Profile() {
    const { auth, catalog } = usePage<Shared>().props;
    const user = auth.user!;
    const profile = useForm({
        name: user.name,
        username: user.username,
        email: user.email,
        avatar_character_id: user.avatar_character_id || "warden",
        current_password: "",
    });
    const password = useForm({
        current_password: "",
        password: "",
        password_confirmation: "",
    });
    return (
        <Shell>
            <Head title="Commander profile" />
            <div className="page-heading">
                <div>
                    <Eyebrow>Your identity in the arena</Eyebrow>
                    <h1>Behind the banner.</h1>
                    <p className="muted">
                        Choose your champion portrait and manage your account.
                    </p>
                </div>
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                    gap: 32,
                    alignItems: "start",
                }}
            >
                <section className="loadout-panel">
                    <h2>Commander profile</h2>
                    <form
                        className="auth-form"
                        style={{ width: "100%", maxWidth: "none" }}
                        onSubmit={(e) => {
                            e.preventDefault();
                            profile.patch("/profile", {
                                preserveScroll: true,
                                onSuccess: () =>
                                    profile.reset("current_password"),
                            });
                        }}
                    >
                        <label>
                            Commander name
                            <input
                                name="name"
                                autoComplete="nickname"
                                required
                                maxLength={24}
                                value={profile.data.name}
                                onChange={(e) =>
                                    profile.setData("name", e.target.value)
                                }
                            />
                        </label>
                        <label>
                            Username
                            <input
                                name="username"
                                autoComplete="username"
                                required
                                minLength={3}
                                maxLength={24}
                                pattern="[A-Za-z0-9_]+"
                                value={profile.data.username}
                                onChange={(e) =>
                                    profile.setData("username", e.target.value)
                                }
                            />
                        </label>
                        <p className="hint">
                            Use your username and password to sign in. Changing
                            it changes your sign-in name.
                        </p>
                        <label>
                            Recovery email
                            <input
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={profile.data.email}
                                onChange={(e) =>
                                    profile.setData("email", e.target.value)
                                }
                            />
                        </label>
                        {profile.data.email !== user.email && (
                            <label>
                                Current password to change email
                                <input
                                    name="current_password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={profile.data.current_password}
                                    onChange={(e) =>
                                        profile.setData(
                                            "current_password",
                                            e.target.value,
                                        )
                                    }
                                />
                            </label>
                        )}
                        <fieldset
                            style={{ border: 0, padding: 0, margin: "24px 0" }}
                        >
                            <legend>Choose your avatar</legend>
                            <p className="hint">
                                All twelve portraits are available to everyone.
                            </p>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(4, 1fr)",
                                    gap: 10,
                                }}
                            >
                                {Object.values(catalog).map((c) => (
                                    <button
                                        type="button"
                                        key={c.id}
                                        aria-label={`Choose ${c.name} avatar`}
                                        aria-pressed={
                                            profile.data.avatar_character_id ===
                                            c.id
                                        }
                                        onClick={() =>
                                            profile.setData(
                                                "avatar_character_id",
                                                c.id,
                                            )
                                        }
                                        style={{
                                            padding: 3,
                                            borderRadius: 8,
                                            border:
                                                profile.data
                                                    .avatar_character_id ===
                                                c.id
                                                    ? "2px solid var(--gold)"
                                                    : "2px solid transparent",
                                            background: "var(--surface)",
                                        }}
                                    >
                                        <img
                                            src={`/images/characters/${c.id}.png`}
                                            alt=""
                                            style={{
                                                width: "100%",
                                                aspectRatio: "1",
                                                objectFit: "cover",
                                                objectPosition: "50% 20%",
                                                borderRadius: 5,
                                            }}
                                        />
                                        <span style={{ fontSize: 11 }}>
                                            {c.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        {Object.entries(profile.errors).map(
                            ([key, message]) => (
                                <p
                                    key={key}
                                    className="form-error"
                                    role="alert"
                                >
                                    {message}
                                </p>
                            ),
                        )}
                        <button
                            type="submit"
                            className="button primary"
                            disabled={profile.processing}
                        >
                            {profile.processing ? "Saving…" : "Save profile"}
                        </button>
                    </form>
                </section>
                <section className="loadout-panel">
                    <h2>Change password</h2>
                    <p className="muted">
                        Choose a password with at least eight characters.
                    </p>
                    <form
                        className="auth-form"
                        style={{ width: "100%", maxWidth: "none" }}
                        onSubmit={(e) => {
                            e.preventDefault();
                            password.put("/profile/password", {
                                preserveScroll: true,
                                onSuccess: () => password.reset(),
                            });
                        }}
                    >
                        <label>
                            Current password
                            <input
                                name="current_password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password.data.current_password}
                                onChange={(e) =>
                                    password.setData(
                                        "current_password",
                                        e.target.value,
                                    )
                                }
                            />
                        </label>
                        <label>
                            New password
                            <input
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                minLength={8}
                                required
                                value={password.data.password}
                                onChange={(e) =>
                                    password.setData("password", e.target.value)
                                }
                            />
                        </label>
                        <label>
                            Confirm new password
                            <input
                                name="password_confirmation"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={password.data.password_confirmation}
                                onChange={(e) =>
                                    password.setData(
                                        "password_confirmation",
                                        e.target.value,
                                    )
                                }
                            />
                        </label>
                        {Object.entries(password.errors).map(
                            ([key, message]) => (
                                <p
                                    key={key}
                                    className="form-error"
                                    role="alert"
                                >
                                    {message}
                                </p>
                            ),
                        )}
                        <button
                            type="submit"
                            className="button"
                            disabled={password.processing}
                        >
                            {password.processing
                                ? "Updating…"
                                : "Update password"}
                        </button>
                    </form>
                </section>
            </div>
        </Shell>
    );
}
