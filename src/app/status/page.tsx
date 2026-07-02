import { Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { pveFetch } from "@/lib/proxmox";
import { pingRouter } from "@/lib/mikrotik";

export const metadata = {
    title: "System Status — NotRespond",
    description: "Operational status of NotRespond cloud services.",
};

// Re-check at most once a minute — this page is public, so caching keeps
// visitors from turning it into a ping amplifier against the backend.
export const revalidate = 60;

type ServiceStatus = "operational" | "outage" | "coming-soon";

async function checkDatabase(): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

async function checkProxmox(): Promise<boolean> {
    try {
        await pveFetch("/version", {}, 4_000);
        return true;
    } catch {
        return false;
    }
}

async function checkRouter(): Promise<boolean> {
    try {
        return (await pingRouter()).reachable;
    } catch {
        return false;
    }
}

const STATUS_META: Record<ServiceStatus, { label: string; color: string }> = {
    "operational": { label: "Operational", color: "var(--accent-green)" },
    "outage":      { label: "Outage",      color: "#f28b82" },
    "coming-soon": { label: "Coming Soon", color: "var(--text-muted)" },
};

export default async function StatusPage() {
    const [dbUp, pveUp, routerUp] = await Promise.all([
        checkDatabase(),
        checkProxmox(),
        checkRouter(),
    ]);

    const up = (ok: boolean): ServiceStatus => (ok ? "operational" : "outage");
    const services: { name: string; status: ServiceStatus }[] = [
        { name: "Compute (VPS)",          status: up(pveUp) },
        { name: "Block & Object Storage", status: up(pveUp) },
        { name: "Networking & VPN",       status: up(routerUp) },
        { name: "Console (noVNC)",        status: up(pveUp) },
        { name: "Billing & Credits",      status: up(dbUp) },
        { name: "TimoSMS",                status: "coming-soon" },
        { name: "Support",                status: up(dbUp) },
    ];

    const allOk = services.every(s => s.status !== "outage");
    const checkedAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

    return (
        <div style={{ paddingTop: "100px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: 760 }}>
                <div style={{ textAlign: "center", marginBottom: "40px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Activity style={{ width: 14, height: 14 }} /> STATUS
                    </span>
                    <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, marginBottom: 16, letterSpacing: "-0.03em" }}>
                        System <span className="gradient-text">Status</span>
                    </h1>
                </div>

                <div className="glass-card" style={{ padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, borderColor: allOk ? "rgba(0,200,120,0.3)" : "rgba(242,139,130,0.35)" }}>
                    {allOk
                        ? <CheckCircle2 style={{ width: 22, height: 22, color: "var(--accent-green)" }} />
                        : <AlertTriangle style={{ width: 22, height: 22, color: "#f28b82" }} />}
                    <div>
                        <p style={{ fontWeight: 700, color: allOk ? "var(--accent-green)" : "#f28b82" }}>
                            {allOk ? "All systems operational" : "Some systems are experiencing issues"}
                        </p>
                        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
                            Last checked: {checkedAt} UTC — refreshes every minute.
                        </p>
                    </div>
                </div>

                <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                    {services.map((s, i) => {
                        const meta = STATUS_META[s.status];
                        return (
                            <div key={s.name} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "14px 22px",
                                borderTop: i === 0 ? "none" : "1px solid var(--glass-border)",
                            }}>
                                <span style={{ fontSize: "0.92rem", color: "var(--text-primary)", fontWeight: 600 }}>{s.name}</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: meta.color, fontWeight: 600 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} /> {meta.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
