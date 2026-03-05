"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
    const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
        setFieldErrors({});
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setFieldErrors({});
        setLoading(true);

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.details) {
                    setFieldErrors(data.details);
                } else {
                    setError(data.error || "Registration failed.");
                }
                return;
            }

            router.push("/auth/login?registered=true");
        } catch {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const getFieldError = (field: string) => {
        return fieldErrors[field]?.[0];
    };

    return (
        <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "100px 24px" }}>
            <div
                className="glass-card animate-fade-in-up"
                style={{ width: "100%", maxWidth: "440px", padding: "48px 40px" }}
            >
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "36px" }}>
                    <div
                        style={{
                            width: 48, height: 48, borderRadius: "12px",
                            background: "var(--gradient-primary)",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: "1.2rem", color: "var(--text-inverse)", marginBottom: "16px",
                        }}
                    >
                        NR
                    </div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "8px" }}>Create Account</h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                        Join thousands of users on our platform
                    </p>
                </div>

                {error && (
                    <div style={{
                        padding: "12px 16px", borderRadius: "8px",
                        background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.2)",
                        color: "var(--accent-magenta)", fontSize: "0.85rem", marginBottom: "20px",
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                            Full Name
                        </label>
                        <input
                            type="text"
                            name="name"
                            className="input-field"
                            placeholder="John Doe"
                            value={form.name}
                            onChange={handleChange}
                            required
                            autoComplete="name"
                        />
                        {getFieldError("name") && (
                            <p style={{ color: "var(--accent-magenta)", fontSize: "0.78rem", marginTop: "4px" }}>{getFieldError("name")}</p>
                        )}
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            name="email"
                            className="input-field"
                            placeholder="you@example.com"
                            value={form.email}
                            onChange={handleChange}
                            required
                            autoComplete="email"
                        />
                        {getFieldError("email") && (
                            <p style={{ color: "var(--accent-magenta)", fontSize: "0.78rem", marginTop: "4px" }}>{getFieldError("email")}</p>
                        )}
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                            Password
                        </label>
                        <input
                            type="password"
                            name="password"
                            className="input-field"
                            placeholder="Min 8 chars, uppercase, lowercase, number"
                            value={form.password}
                            onChange={handleChange}
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                        {getFieldError("password") && (
                            <p style={{ color: "var(--accent-magenta)", fontSize: "0.78rem", marginTop: "4px" }}>{getFieldError("password")}</p>
                        )}
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                            Confirm Password
                        </label>
                        <input
                            type="password"
                            name="confirmPassword"
                            className="input-field"
                            placeholder="Re-enter your password"
                            value={form.confirmPassword}
                            onChange={handleChange}
                            required
                            autoComplete="new-password"
                        />
                        {getFieldError("confirmPassword") && (
                            <p style={{ color: "var(--accent-magenta)", fontSize: "0.78rem", marginTop: "4px" }}>{getFieldError("confirmPassword")}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ width: "100%", marginTop: "8px", opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? "Creating account..." : "Create Account"}
                    </button>
                </form>

                <div style={{ textAlign: "center", marginTop: "24px" }}>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        Already have an account?{" "}
                        <Link href="/auth/login" style={{ color: "var(--accent-cyan)", textDecoration: "none", fontWeight: 600 }}>
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </section>
    );
}
