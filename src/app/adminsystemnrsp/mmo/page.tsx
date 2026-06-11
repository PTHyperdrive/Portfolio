"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Store, Plus, Upload, Package, Trash2, Edit3, ChevronDown,
    ChevronRight, RefreshCw, AlertTriangle, CheckCircle2, X,
    Loader2, Eye, EyeOff, Tag, Hash, Layers,
} from "lucide-react";

/* ── Types ── */
interface Category {
    id: string; slug: string; name: string; description: string | null;
    imageUrl: string | null; schema: string; pricePerUnit: number;
    active: boolean; sortOrder: number; createdAt: string;
    unsoldCount: number; soldCount: number; totalCount: number;
}

type FormMode = "idle" | "create" | "edit";

/* ── Component ── */
export default function MmoAdminPage() {
    const t = useThemeTokens();

    /* ── State ── */
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [formMode, setFormMode] = useState<FormMode>("idle");
    const [editId, setEditId] = useState<string | null>(null);

    // Form fields
    const [fName, setFName] = useState("");
    const [fSlug, setFSlug] = useState("");
    const [fDesc, setFDesc] = useState("");
    const [fImg, setFImg] = useState("");
    const [fSchema, setFSchema] = useState("");
    const [fPrice, setFPrice] = useState("");
    const [fOrder, setFOrder] = useState("0");
    const [formErr, setFormErr] = useState("");
    const [formBusy, setFormBusy] = useState(false);

    // Bulk import
    const [importCatId, setImportCatId] = useState("");
    const [importData, setImportData] = useState("");
    const [importResult, setImportResult] = useState<{ created?: number; errors?: string[] } | null>(null);
    const [importBusy, setImportBusy] = useState(false);

    // Expand/collapse
    const [expandedCat, setExpandedCat] = useState<string | null>(null);

    /* ── Fetch ── */
    const loadCategories = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch("/api/mmo/inventory");
            if (r.ok) setCategories(await r.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadCategories(); }, [loadCategories]);

    /* ── Styles ── */
    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };
    const inputStyle: React.CSSProperties = {
        width: "100%", boxSizing: "border-box", padding: "9px 12px",
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, color: t.textPrimary,
        fontSize: "0.85rem", fontFamily: t.fontFamily, outline: "none",
    };
    const labelStyle: React.CSSProperties = {
        fontSize: "0.72rem", fontWeight: 700, color: t.textMuted,
        textTransform: "uppercase" as const, letterSpacing: "0.08em",
        marginBottom: 4, display: "block",
    };

    /* ── Form Handlers ── */
    const resetForm = () => {
        setFormMode("idle"); setEditId(null); setFormErr("");
        setFName(""); setFSlug(""); setFDesc(""); setFImg("");
        setFSchema(""); setFPrice(""); setFOrder("0");
    };

    const openCreate = () => { resetForm(); setFormMode("create"); };
    const openEdit = (cat: Category) => {
        setFormMode("edit"); setEditId(cat.id); setFormErr("");
        setFName(cat.name); setFSlug(cat.slug);
        setFDesc(cat.description || ""); setFImg(cat.imageUrl || "");
        setFSchema(cat.schema); setFPrice(String(cat.pricePerUnit));
        setFOrder(String(cat.sortOrder));
    };

    const submitForm = async () => {
        setFormErr("");
        if (!fName.trim()) { setFormErr("Name is required"); return; }
        if (!fSlug.trim()) { setFormErr("Slug is required"); return; }
        if (!fSchema.trim()) { setFormErr("Schema is required (pipe-delimited)"); return; }
        if (!fPrice.trim() || isNaN(Number(fPrice))) { setFormErr("Valid price required"); return; }

        setFormBusy(true);
        try {
            const payload: Record<string, unknown> = {
                name: fName.trim(), slug: fSlug.trim(),
                description: fDesc.trim() || null, imageUrl: fImg.trim() || null,
                schema: fSchema.trim(), pricePerUnit: Number(fPrice),
                sortOrder: Number(fOrder) || 0,
            };

            let r;
            if (formMode === "create") {
                r = await fetch("/api/mmo/category", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                r = await fetch("/api/mmo/category", {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: editId, ...payload }),
                });
            }

            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                throw new Error(d.error || `HTTP ${r.status}`);
            }
            resetForm(); loadCategories();
        } catch (e) { setFormErr(e instanceof Error ? e.message : "Failed"); }
        finally { setFormBusy(false); }
    };

    const deactivateCat = async (id: string) => {
        if (!confirm("Deactivate this category? It will be hidden from the storefront.")) return;
        try {
            await fetch("/api/mmo/category", {
                method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            loadCategories();
        } catch { /* silent */ }
    };

    /* ── Bulk Import ── */
    const handleImport = async () => {
        setImportResult(null);
        if (!importCatId) { setImportResult({ errors: ["Select a category first"] }); return; }
        const lines = importData.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) { setImportResult({ errors: ["Paste at least one line of data"] }); return; }

        setImportBusy(true);
        try {
            const r = await fetch("/api/mmo/inventory", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId: importCatId, items: lines }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "Import failed");
            setImportResult(d);
            if (d.created > 0) { setImportData(""); loadCategories(); }
        } catch (e) { setImportResult({ errors: [e instanceof Error ? e.message : "Import failed"] }); }
        finally { setImportBusy(false); }
    };

    const selectedSchema = categories.find(c => c.id === importCatId)?.schema || "";

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>Admin System &bull; MMO Management</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Store style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>MMO Admin</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Manage product categories and inventory stock.</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: t.cardRadius, border: "none", background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>
                            <Plus style={{ width: 14, height: 14 }} /> New Category
                        </button>
                        <button onClick={loadCategories} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20, alignItems: "start" }}>
                {/* Left: Category List */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Category Form (create/edit) */}
                    {formMode !== "idle" && (
                        <div style={{ ...card, padding: "20px 24px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary }}>
                                    {formMode === "create" ? "Create Category" : "Edit Category"}
                                </h3>
                                <button onClick={resetForm} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer" }}>
                                    <X style={{ width: 16, height: 16 }} />
                                </button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                    <label style={labelStyle}>Name</label>
                                    <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Netflix Premium" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Slug</label>
                                    <input value={fSlug} onChange={e => setFSlug(e.target.value)} placeholder="netflix-premium" style={inputStyle} />
                                </div>
                                <div style={{ gridColumn: "span 2" }}>
                                    <label style={labelStyle}>Description</label>
                                    <input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Premium accounts with full access" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Image URL</label>
                                    <input value={fImg} onChange={e => setFImg(e.target.value)} placeholder="https://..." style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Price (Credits)</label>
                                    <input value={fPrice} onChange={e => setFPrice(e.target.value)} placeholder="100" type="number" style={inputStyle} />
                                </div>
                                <div style={{ gridColumn: "span 2" }}>
                                    <label style={labelStyle}>Schema (pipe-delimited field names)</label>
                                    <input value={fSchema} onChange={e => setFSchema(e.target.value)} placeholder="email|password|recovery|2fa" style={{ ...inputStyle, fontFamily: t.fontMono, letterSpacing: "0.04em" }} />
                                    {fSchema && (
                                        <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                                            {fSchema.split("|").filter(Boolean).map((f, i) => (
                                                <span key={i} style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: 4, background: t.accentPrimaryMuted, color: t.accentPrimary, fontWeight: 600 }}>{f}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label style={labelStyle}>Sort Order</label>
                                    <input value={fOrder} onChange={e => setFOrder(e.target.value)} type="number" style={inputStyle} />
                                </div>
                            </div>
                            {formErr && <p style={{ fontSize: "0.75rem", color: t.statusError, marginTop: 10 }}>{formErr}</p>}
                            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                                <button onClick={submitForm} disabled={formBusy} style={{ padding: "9px 20px", borderRadius: t.cardRadius, border: "none", background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: formBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                                    {formBusy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: 14, height: 14 }} />}
                                    {formMode === "create" ? "Create" : "Save Changes"}
                                </button>
                                <button onClick={resetForm} style={{ padding: "9px 16px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.82rem", cursor: "pointer" }}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* Categories Table */}
                    <div style={card}>
                        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Layers style={{ width: 15, height: 15, color: t.accentPrimary }} />
                                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: t.textPrimary }}>Product Categories</span>
                            </div>
                            <span style={{ padding: "2px 8px", borderRadius: 8, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.7rem", fontWeight: 700 }}>{categories.length}</span>
                        </div>
                        {loading ? (
                            <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>
                                <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
                                <p style={{ fontSize: "0.82rem" }}>Loading categories...</p>
                            </div>
                        ) : categories.length === 0 ? (
                            <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>
                                <Store style={{ width: 32, height: 32, opacity: 0.3, margin: "0 auto 12px" }} />
                                <p style={{ fontSize: "0.85rem" }}>No categories yet. Create one to get started.</p>
                            </div>
                        ) : (
                            <div>
                                {categories.map(cat => (
                                    <div key={cat.id} style={{ borderBottom: `1px solid ${t.borderSecondary}` }}>
                                        {/* Row */}
                                        <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                                            onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}>
                                            {expandedCat === cat.id
                                                ? <ChevronDown style={{ width: 14, height: 14, color: t.textMuted, flexShrink: 0 }} />
                                                : <ChevronRight style={{ width: 14, height: 14, color: t.textMuted, flexShrink: 0 }} />}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: t.textPrimary }}>{cat.name}</span>
                                                    {!cat.active && <span style={{ fontSize: "0.6rem", padding: "1px 5px", borderRadius: 3, background: t.statusErrorBg, color: t.statusError, fontWeight: 700 }}>Inactive</span>}
                                                </div>
                                                <p style={{ fontSize: "0.7rem", color: t.textMuted, marginTop: 2 }}>{cat.schema.split("|").join(" / ")}</p>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                                                <div style={{ textAlign: "center" }}>
                                                    <p style={{ fontSize: "0.95rem", fontWeight: 800, color: t.statusSuccess, fontFamily: t.fontMono }}>{cat.unsoldCount}</p>
                                                    <p style={{ fontSize: "0.58rem", color: t.textMuted, fontWeight: 600 }}>Available</p>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <p style={{ fontSize: "0.95rem", fontWeight: 800, color: t.textMuted, fontFamily: t.fontMono }}>{cat.soldCount}</p>
                                                    <p style={{ fontSize: "0.58rem", color: t.textMuted, fontWeight: 600 }}>Sold</p>
                                                </div>
                                                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: t.accentPrimary, fontFamily: t.fontMono }}>{cat.pricePerUnit} Cr</span>
                                            </div>
                                        </div>
                                        {/* Expanded Detail */}
                                        {expandedCat === cat.id && (
                                            <div style={{ padding: "0 20px 14px", display: "flex", gap: 8 }}>
                                                <button onClick={() => openEdit(cat)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                                                    <Edit3 style={{ width: 12, height: 12 }} /> Edit
                                                </button>
                                                <button onClick={() => deactivateCat(cat.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: t.buttonRadius, border: `1px solid ${t.statusError}44`, background: t.statusErrorBg, color: t.statusError, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                                                    <Trash2 style={{ width: 12, height: 12 }} /> Deactivate
                                                </button>
                                                <div style={{ marginLeft: "auto", fontSize: "0.68rem", color: t.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <Tag style={{ width: 11, height: 11 }} /> {cat.slug}
                                                    <Hash style={{ width: 11, height: 11, marginLeft: 8 }} /> {cat.id.slice(-8)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Bulk Import Panel */}
                <div style={{ ...card, position: "sticky", top: 20 }}>
                    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                        <Upload style={{ width: 15, height: 15, color: t.statusWarning }} />
                        <span style={{ fontWeight: 700, fontSize: "0.9rem", color: t.textPrimary }}>Bulk Import</span>
                    </div>
                    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                        {/* Category selector */}
                        <div>
                            <label style={labelStyle}>Target Category</label>
                            <select value={importCatId} onChange={e => setImportCatId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                                <option value="">Select category...</option>
                                {categories.filter(c => c.active).map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.unsoldCount} in stock)</option>
                                ))}
                            </select>
                        </div>

                        {/* Schema preview */}
                        {selectedSchema && (
                            <div style={{ padding: "8px 12px", borderRadius: t.buttonRadius, background: t.bgSecondary, border: `1px solid ${t.borderSecondary}` }}>
                                <p style={{ fontSize: "0.68rem", color: t.textMuted, fontWeight: 700, marginBottom: 4 }}>Expected Format</p>
                                <p style={{ fontSize: "0.8rem", fontFamily: t.fontMono, color: t.accentPrimary, letterSpacing: "0.04em" }}>{selectedSchema}</p>
                            </div>
                        )}

                        {/* Data textarea */}
                        <div>
                            <label style={labelStyle}>Pipe-Delimited Data (one item per line)</label>
                            <textarea
                                value={importData}
                                onChange={e => setImportData(e.target.value)}
                                placeholder={"user@ex.com|Pass123!|recov@x.com|TOTP\nuser2@ex.com|Pass456!|recov2@x.com|SMS"}
                                rows={10}
                                style={{
                                    ...inputStyle, resize: "vertical", minHeight: 180,
                                    fontFamily: t.fontMono, fontSize: "0.78rem", lineHeight: 1.6,
                                }}
                            />
                            <p style={{ fontSize: "0.65rem", color: t.textMuted, marginTop: 4 }}>
                                {importData.split("\n").filter(l => l.trim()).length} lines ready
                            </p>
                        </div>

                        {/* Import button */}
                        <button onClick={handleImport} disabled={importBusy || !importCatId || !importData.trim()} style={{
                            width: "100%", padding: "10px", borderRadius: t.cardRadius,
                            border: "none", fontWeight: 700, fontSize: "0.85rem", cursor: importBusy ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            background: !importCatId || !importData.trim() ? t.bgTertiary : t.statusWarning,
                            color: !importCatId || !importData.trim() ? t.textMuted : "#000",
                        }}>
                            {importBusy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Upload style={{ width: 14, height: 14 }} />}
                            {importBusy ? "Importing..." : "Import Items"}
                        </button>

                        {/* Result */}
                        {importResult && (
                            <div style={{
                                padding: "10px 14px", borderRadius: t.cardRadius,
                                background: importResult.errors ? t.statusErrorBg : t.statusSuccessBg,
                                border: `1px solid ${importResult.errors ? t.statusError : t.statusSuccess}44`,
                            }}>
                                {importResult.created !== undefined && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: importResult.errors ? 6 : 0 }}>
                                        <CheckCircle2 style={{ width: 14, height: 14, color: t.statusSuccess }} />
                                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: t.statusSuccess }}>
                                            {importResult.created} items imported
                                        </span>
                                    </div>
                                )}
                                {importResult.errors?.map((err, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: i > 0 ? 4 : 0 }}>
                                        <AlertTriangle style={{ width: 12, height: 12, color: t.statusError, flexShrink: 0, marginTop: 2 }} />
                                        <span style={{ fontSize: "0.72rem", color: t.statusError }}>{err}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
