import { Head, Link, useForm, usePage } from "@inertiajs/react";
import { Brand, Eyebrow } from "../components/Shell";
export default function ForgotPassword() {
    const { flash } = usePage<{ flash?: { message?: string } }>().props;
    const form = useForm({ email: "" });
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
            <Head title="Recover your account" />
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
                <Eyebrow>Find your way back</Eyebrow>
                <h2>Forgot your password?</h2>
                <p className="muted">
                    Enter the recovery email on your account. We’ll send a link
                    to choose a new password.
                </p>
                {flash?.message && <p role="status">{flash.message}</p>}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.post("/forgot-password");
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
                    {form.errors.email && (
                        <p className="form-error" role="alert">
                            {form.errors.email}
                        </p>
                    )}
                    <button
                        type="submit"
                        className="button primary full"
                        disabled={form.processing}
                    >
                        {form.processing ? "Requesting…" : "Send reset link"}
                    </button>
                </form>
                <p className="hint">
                    <Link href="/">Back to sign in</Link>
                </p>
            </div>
        </div>
    );
}
