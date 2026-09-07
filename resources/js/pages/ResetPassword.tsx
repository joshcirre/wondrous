import { Head, Link, useForm, usePage } from "@inertiajs/react";
import { Brand, Eyebrow } from "../components/Shell";
export default function ResetPassword() {
    const { token, email } = usePage<{ token: string; email: string }>().props;
    const form = useForm({
        token,
        email,
        password: "",
        password_confirmation: "",
    });
    return (
        <div
            className="auth-form-area min-h-dvh"
            style={{
                backgroundImage:
                    "linear-gradient(rgba(30, 23, 18, 0.86), rgba(24, 19, 16, 0.96)), url(/images/autumn-realm.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        >
            <Head title="Reset password" />
            <div
                className="auth-form"
                style={{
                    padding: "32px",
                    borderRadius: 16,
                    background: "rgba(33, 27, 22, 0.94)",
                    border: "1px solid rgba(191, 153, 94, 0.24)",
                }}
            >
                <Brand />
                <Eyebrow>A fresh beginning</Eyebrow>
                <h2>Choose a new password.</h2>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.post("/reset-password", {
                            onFinish: () =>
                                form.reset("password", "password_confirmation"),
                        });
                    }}
                >
                    <label>
                        Recovery email
                        <input
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={form.data.email}
                            onChange={(e) =>
                                form.setData("email", e.target.value)
                            }
                        />
                    </label>
                    <label>
                        New password
                        <input
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={form.data.password}
                            onChange={(e) =>
                                form.setData("password", e.target.value)
                            }
                        />
                    </label>
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
                    {Object.entries(form.errors).map(([key, message]) => (
                        <p key={key} className="form-error" role="alert">
                            {message}
                        </p>
                    ))}
                    <button
                        type="submit"
                        className="button primary full"
                        disabled={form.processing}
                    >
                        {form.processing ? "Resetting…" : "Reset password"}
                    </button>
                </form>
                <p className="hint">
                    <Link href="/forgot-password">Request another link</Link> ·{" "}
                    <Link href="/">Back to sign in</Link>
                </p>
            </div>
        </div>
    );
}
