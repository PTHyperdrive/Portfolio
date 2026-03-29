import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Console — Notrespond.com",
};

export default function ConsoleWindowLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#000" }}>
            {children}
        </div>
    );
}
