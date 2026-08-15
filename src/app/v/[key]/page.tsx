import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isVaultPath, vaultConfigured } from "@/lib/vault-auth";
import VaultClient from "./VaultClient";

/**
 * The unlisted entrance.
 *
 * Any path but the configured one 404s exactly as a missing route would, so
 * the page cannot be found by probing. The secret is compared in constant time
 * (see isVaultPath) and, on its own, grants nothing — the TOTP keypad is still
 * the gate. That matters because a URL is the one credential that ends up in
 * browser history, proxy logs and Referer headers.
 */

/** Keep it out of every index, and send no referrer onward. */
export const metadata: Metadata = {
    robots: { index: false, follow: false, nocache: true },
    title: "—",
};

export const dynamic = "force-dynamic";

export default async function VaultPage({ params }: { params: Promise<{ key: string }> }) {
    const { key } = await params;

    if (!vaultConfigured() || !isVaultPath(key)) notFound();

    return <VaultClient />;
}
