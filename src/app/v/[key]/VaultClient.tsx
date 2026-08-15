"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Delete, ShieldCheck, Loader2 } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { setVaultToken, onVaultExpired } from "@/lib/api-client";
import ConversationSidebar from "@/components/ai/ConversationSidebar";
import AiChatView from "@/components/ai/AiChatView";
import { apiFetch } from "@/lib/api-client";
import type { ConversationSummary } from "@/components/ai/types";

/**
 * The vault: a keypad, and behind it the Studio and nothing else.
 *
 * ── Why the digits move ────────────────────────────────────────────
 *
 * The keys are shuffled on every attempt, so the physical positions tapped
 * carry no information. Someone watching the screen, a recording, or a
 * compromised extension observing click coordinates learns a sequence of
 * positions that means something different next time.
 *
 * ── Why there is no keyboard ───────────────────────────────────────
 *
 * The code is never typed, pasted, or held in a form field, so a keylogger or
 * an autofill extension has nothing to read. It exists only as React state
 * between the last tap and the HMAC, and is discarded immediately after.
 *
 * ── Why the code is not sent ───────────────────────────────────────
 *
 * The browser answers a server nonce with HMAC(code, nonce) computed in
 * WebCrypto. The code itself never leaves the machine, and the nonce is spent
 * on use, so a captured request cannot be replayed.
 *
 * This is not protection against a broken TLS connection — anyone who can read
 * the response sees the token that comes back and can use it until it expires.
 * It removes the reusable secret from the wire; it does not remove the need for
 * TLS.
 *
 * ── Why nothing is stored ──────────────────────────────────────────
 *
 * The token lives in a module variable. No cookie, no localStorage, no service
 * worker. Reload, navigate away, or lose the server process, and you are back
 * at the keypad — which is the requested behaviour, and it is also the reason
 * this page cannot be resumed from a stolen device.
 */

type Phase = "locked" | "checking" | "open";

/** Fisher-Yates, seeded from the platform CSPRNG rather than Math.random. */
function shuffled(): number[] {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const rand = new Uint32Array(digits.length);
    crypto.getRandomValues(rand);
    for (let i = digits.length - 1; i > 0; i--) {
        const j = rand[i] % (i + 1);
        [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits;
}

const CODE_LENGTH = 6;

export default function VaultClient() {
    const t = useThemeTokens();

    const [phase, setPhase] = useState<Phase>("locked");
    const [entered, setEntered] = useState("");
    const [keys, setKeys] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    // Guards a double submit when the sixth key lands twice in a tick.
    const submitting = useRef(false);

    useEffect(() => { setKeys(shuffled()); }, []);

    /** Back to the keypad, with everything from the last session dropped. */
    const lock = useCallback((message?: string) => {
        setVaultToken(null);
        setPhase("locked");
        setEntered("");
        setKeys(shuffled());
        setConversations([]);
        setActiveId(null);
        if (message) setError(message);
    }, []);

    // The server holds tokens in memory, so a restart invalidates ours. Rather
    // than leave a UI where every action fails, drop straight back to the keypad.
    useEffect(() => onVaultExpired(() => lock("Session ended. Enter the current code.")), [lock]);

    const loadConversations = useCallback(async () => {
        try {
            const res = await apiFetch("/api/ai/conversations");
            if (!res.ok) return;
            const data = await res.json();
            setConversations(data.conversations ?? []);
        } catch { /* the Studio still works without the list */ }
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        setConversations(prev => prev.filter(c => c.id !== id));
        setActiveId(prev => (prev === id ? null : prev));
        try {
            await apiFetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
        } finally {
            void loadConversations();
        }
    }, [loadConversations]);

    /** Answer the challenge without ever transmitting the code. */
    const submit = useCallback(async (code: string) => {
        if (submitting.current) return;
        submitting.current = true;
        setPhase("checking");
        setError(null);

        try {
            const challengeRes = await fetch("/api/vault/challenge", { method: "POST" });
            if (!challengeRes.ok) throw new Error(
                challengeRes.status === 429
                    ? "Too many attempts. Wait a few minutes."
                    : "Unavailable.",
            );
            const { id, nonce } = await challengeRes.json();

            // HMAC-SHA256 keyed by the code, over the nonce. Done here so the
            // code stays on this machine.
            const key = await crypto.subtle.importKey(
                "raw",
                new TextEncoder().encode(code),
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign"],
            );
            const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(nonce));
            const proof = Array.from(new Uint8Array(sig))
                .map(b => b.toString(16).padStart(2, "0"))
                .join("");

            const verifyRes = await fetch("/api/vault/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, proof }),
            });
            const data = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(data.error || "Rejected.");

            setVaultToken(data.token);
            setEntered("");
            setPhase("open");
            void loadConversations();
        } catch (err) {
            setEntered("");
            setKeys(shuffled());
            setPhase("locked");
            setError(err instanceof Error ? err.message : "Rejected.");
        } finally {
            submitting.current = false;
        }
    }, [loadConversations]);

    const press = (digit: number) => {
        if (phase !== "locked") return;
        setError(null);
        const next = entered + String(digit);
        setEntered(next);
        if (next.length === CODE_LENGTH) void submit(next);
    };

    const backspace = () => {
        if (phase !== "locked") return;
        setEntered(e => e.slice(0, -1));
    };

    /* ── Unlocked: the Studio, and nothing else ──────────────────── */
    if (phase === "open") {
        return (
            <div style={{ display: "flex", height: "100dvh", background: t.bgPrimary, overflow: "hidden" }}>
                <ConversationSidebar
                    conversations={conversations}
                    activeId={activeId}
                    onSelect={setActiveId}
                    onCreate={() => setActiveId(null)}
                    onDelete={handleDelete}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <AiChatView
                        activeId={activeId}
                        onActiveChange={setActiveId}
                        onConversationsChanged={loadConversations}
                    />
                </div>
            </div>
        );
    }

    /* ── Locked: the keypad ──────────────────────────────────────── */
    const busy = phase === "checking";

    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "100dvh", background: t.bgPrimary, fontFamily: t.fontFamily,
            padding: 24,
        }}>
            <div style={{
                width: "100%", maxWidth: 320,
                display: "flex", flexDirection: "column", alignItems: "center",
            }}>
                <ShieldCheck style={{ width: 26, height: 26, color: t.accentPrimary, marginBottom: 18 }} />

                {/* Progress dots. The code is never rendered, even masked. */}
                <div style={{ display: "flex", gap: 12, marginBottom: 10, height: 14 }}>
                    {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                        <span
                            key={i}
                            style={{
                                width: 11, height: 11, borderRadius: "50%",
                                background: i < entered.length ? t.accentPrimary : "transparent",
                                border: `1px solid ${i < entered.length ? t.accentPrimary : t.borderPrimary}`,
                                transition: "background 0.12s",
                            }}
                        />
                    ))}
                </div>

                <div style={{
                    height: 34, marginBottom: 10,
                    display: "flex", alignItems: "center",
                    fontSize: "0.78rem", color: error ? t.statusError : t.textMuted,
                    textAlign: "center", lineHeight: 1.4,
                }}>
                    {busy
                        ? <><Loader2 style={{ width: 13, height: 13, marginRight: 6, animation: "vSpin 0.9s linear infinite" }} /> Checking…</>
                        : error || ""}
                </div>

                <div style={{
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, width: "100%",
                    opacity: busy ? 0.4 : 1, pointerEvents: busy ? "none" : "auto",
                    transition: "opacity 0.15s",
                }}>
                    {keys.map(digit => (
                        <button
                            key={digit}
                            type="button"
                            onClick={() => press(digit)}
                            // Nothing focusable by keyboard: the code cannot be
                            // typed, only tapped.
                            tabIndex={-1}
                            style={{
                                aspectRatio: "1", borderRadius: "50%",
                                border: `1px solid ${t.borderPrimary}`,
                                background: t.bgCard, color: t.textPrimary,
                                fontSize: "1.35rem", fontWeight: 600, fontFamily: t.fontFamily,
                                cursor: "pointer", userSelect: "none",
                                transition: "transform 0.08s, background 0.12s",
                            }}
                            onMouseDown={e => { e.currentTarget.style.transform = "scale(0.93)"; }}
                            onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                        >
                            {digit}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={backspace}
                        tabIndex={-1}
                        aria-label="Delete last digit"
                        style={{
                            gridColumn: "3", aspectRatio: "1", borderRadius: "50%",
                            border: `1px solid ${t.borderPrimary}`,
                            background: "transparent", color: t.textMuted,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                        }}
                    >
                        <Delete style={{ width: 18, height: 18 }} />
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes vSpin { to { transform: rotate(360deg) } }
                /* Nothing on this page should be selectable or draggable — it
                   is a keypad, and a text selection is only ever a leak. */
                body { user-select: none; -webkit-user-select: none; }
            `}</style>
        </div>
    );
}
