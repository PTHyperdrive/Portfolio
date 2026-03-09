/**
 * Windows ISO Configuration
 * 
 * Edit this file to add/remove Windows ISO options shown to users
 * when reinstalling their VPS. Each ISO must be uploaded to your
 * Proxmox storage first (e.g., local:iso/Win11_23H2.iso).
 * 
 * Format:
 *   id       — unique identifier (used in API calls)
 *   name     — display name shown to users
 *   iso      — Proxmox storage path (storage:content/filename)
 *   category — grouping for the UI dropdown
 */

export const WINDOWS_ISOS = [
    // ─── Windows 11 ───────────────────────────────────────────────
    { id: "win11-24h2", name: "Windows 11 24H2", iso: "local:iso/Win11_24H2.iso", category: "Windows 11" },
    { id: "win11-23h2", name: "Windows 11 23H2", iso: "local:iso/Win11_23H2.iso", category: "Windows 11" },
    { id: "win11-22h2", name: "Windows 11 22H2", iso: "local:iso/Win11_22H2.iso", category: "Windows 11" },

    // ─── Windows 10 ───────────────────────────────────────────────
    { id: "win10-22h2", name: "Windows 10 22H2", iso: "local:iso/Win10_22H2.iso", category: "Windows 10" },

    // ─── Windows Server ───────────────────────────────────────────
    { id: "ws2022", name: "Windows Server 2022", iso: "local:iso/WinServer2022.iso", category: "Server" },
    { id: "ws2019", name: "Windows Server 2019", iso: "local:iso/WinServer2019.iso", category: "Server" },
] as const;

export type WindowsIsoId = typeof WINDOWS_ISOS[number]["id"];

export function getIsoById(id: string) {
    return WINDOWS_ISOS.find((iso) => iso.id === id);
}

export function getIsosByCategory() {
    const grouped: Record<string, typeof WINDOWS_ISOS[number][]> = {};
    for (const iso of WINDOWS_ISOS) {
        if (!grouped[iso.category]) grouped[iso.category] = [];
        grouped[iso.category].push(iso);
    }
    return grouped;
}
