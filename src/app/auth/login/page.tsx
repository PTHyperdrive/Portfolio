"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("Invalid email or password.");
            } else {
                router.push("/dashboard");
            }
        } catch {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "100px 24px" }}>
            <div
                className="glass-card animate-fade-in-up"
                style={{
                    width: "100%",
                    maxWidth: "440px",
                    padding: "48px 40px",
                }}
            >
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "36px" }}>
                    <div
                        style={{
                            width: 48, height: 48, borderRadius: "12px",
                            background: "var(--gradient-primary)",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: "1.2rem", color: "var(--text-inverse)",
                            marginBottom: "16px",
                        }}
                    >
                        NR
                    </div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "8px" }}>Welcome Back</h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                        Sign in to your account
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div
                        style={{
                            padding: "12px 16px",
                            borderRadius: "8px",
                            background: "rgba(255,0,110,0.1)",
                            border: "1px solid rgba(255,0,110,0.2)",
                            color: "var(--accent-magenta)",
                            fontSize: "0.85rem",
                            marginBottom: "20px",
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            className="input-field"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                            Password
                        </label>
                        <input
                            type="password"
                            className="input-field"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ width: "100%", marginTop: "8px", opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                <div style={{ textAlign: "center", marginTop: "24px" }}>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        Don&apos;t have an account?{" "}
                        <Link href="/auth/register" style={{ color: "var(--accent-cyan)", textDecoration: "none", fontWeight: 600 }}>
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </section>
    );
}
