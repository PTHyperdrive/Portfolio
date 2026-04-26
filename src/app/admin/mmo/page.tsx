"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Plus, Trash2, Upload, Package, X, AlertTriangle, Check,
    Layers, Tag, Database, ChevronDown, FileText
} from "lucide-react";

type InventoryCategory = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    schema: string;
    pricePerUnit: number;
    active: boolean;
    sortOrder: number;
    unsoldCount: number;
    soldCount: number;
    totalCount: number;
};

export default function AdminMmoPage() {
    const t = useThemeTokens();
    const [categories, setCategories] = useState<InventoryCategory[]>([]);
    const [loading, setLoading] = useState(true);

    // ─── New Category Form ───
    const [newName, setNewName] = useState("");
    const [newSlug, setNewSlug] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newImageUrl, setNewImageUrl] = useState("");
    const [newPrice, setNewPrice] = useState("");
    const [schemaFields, setSchemaFields] = useState<string[]>([]);
    const [fieldInput, setFieldInput] = useState("");
    const [createErr, setCreateErr] = useState("");
    const [createOk, setCreateOk] = useState("");
    const fieldInputRef = useRef<HTMLInputElement>(null);

    // ─── Inventory Loader ───
    const [selectedCatId, setSelectedCatId] = useState("");
    const [bulkText, setBulkText] = useState("");
    const [rowInputs, setRowInputs] = useState<string[]>([]);
    const [pendingItems, setPendingItems] = useState<string[]>([]);
    const [uploadErr, setUploadErr] = useState("");
    const [uploadOk, setUploadOk] = useState("");
    const [uploading, setUploading] = useState(false);

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "10px 14px", boxSizing: "border-box",
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "0.85rem",
        fontFamily: t.fontFamily, outline: "none",
    };

    const labelStyle: React.CSSProperties = {
        fontSize: "0.75rem", fontWeight: 700, color: t.textSecondary,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, display: "block",
    };

    // ─── Fetch categories ───
    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch("/api/mmo/inventory");
            if (res.ok) setCategories(await res.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchCategories(); }, [fetchCategories]);

    // ─── Auto-generate slug from name ───
    useEffect(() => {
        setNewSlug(newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }, [newName]);

    // ─── Selected category for inventory loader ───
    const selectedCat = categories.find((c) => c.id === selectedCatId);
    const selectedFields = selectedCat ? selectedCat.schema.split("|") : [];

    // Initialize row inputs when category changes
    useEffect(() => {
        setRowInputs(selectedFields.map(() => ""));
        setPendingItems([]);
        setBulkText("");
        setUploadErr("");
        setUploadOk("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCatId]);

    // ─── Schema tag-input handlers ───
    const addSchemaField = () => {
        const v = fieldInput.trim().replace(/[|]/g, "").replace(/\s+/g, "_");
        if (!v || schemaFields.includes(v)) return;
        setSchemaFields((prev) => [...prev, v]);
        setFieldInput("");
        fieldInputRef.current?.focus();
    };

    const removeSchemaField = (idx: number) => {
        setSchemaFields((prev) => prev.filter((_, i) => i !== idx));
    };

    // ─── Create category ───
    const handleCreate = async () => {
        setCreateErr("");
        setCreateOk("");
        if (!newName.trim() || !newSlug.trim() || schemaFields.length === 0 || !newPrice) {
            setCreateErr("Name, slug, at least one schema field, and price are required.");
            return;
        }
        try {
            const res = await fetch("/api/mmo/category", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newName.trim(),
                    slug: newSlug,
                    description: newDesc.trim() || null,
                    imageUrl: newImageUrl.trim() || null,
                    schema: schemaFields.join("|"),
                    pricePerUnit: Number(newPrice),
                }),
            });
            const data = await res.json();
            if (!res.ok) { setCreateErr(data.error || "Failed to create"); return; }
            setCreateOk(`Category "${data.name}" created!`);
            setNewName(""); setNewDesc(""); setNewImageUrl(""); setNewPrice(""); setSchemaFields([]); setFieldInput("");
            fetchCategories();
            setTimeout(() => setCreateOk(""), 3000);
        } catch {
            setCreateErr("Network error");
        }
    };

    // ─── Add single row to pending ───
    const addRow = () => {
        if (rowInputs.some((v) => !v.trim())) return;
        const row = rowInputs.join("|");
        setPendingItems((prev) => [...prev, row]);
        setRowInputs(selectedFields.map(() => ""));
    };

    // ─── Parse bulk text ───
    const parseBulk = () => {
        const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
        const validLines: string[] = [];
        const errors: string[] = [];
        lines.forEach((line, i) => {
            const count = line.split("|").length;
            if (count !== selectedFields.length) {
                errors.push(`Line ${i + 1}: expected ${selectedFields.length} fields, got ${count}`);
            } else {
                validLines.push(line);
            }
        });
        if (errors.length > 0) {
            setUploadErr(errors.slice(0, 5).join("; ") + (errors.length > 5 ? `... and ${errors.length - 5} more` : ""));
        } else {
            setUploadErr("");
        }
        if (validLines.length > 0) {
            setPendingItems((prev) => [...prev, ...validLines]);
            setBulkText("");
        }
    };

    // ─── Upload to API ───
    const handleUpload = async () => {
        if (pendingItems.length === 0 || !selectedCatId) return;
        setUploading(true);
        setUploadErr("");
        setUploadOk("");
        try {
            const res = await fetch("/api/mmo/inventory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId: selectedCatId, items: pendingItems }),
            });
            const data = await res.json();
            if (!res.ok) {
                setUploadErr(data.error || "Upload failed");
                return;
            }
            setUploadOk(`${data.created} item(s) added successfully!`);
            setPendingItems([]);
            fetchCategories();
            setTimeout(() => setUploadOk(""), 3000);
        } catch {
            setUploadErr("Network error");
        } finally {
            setUploading(false);
        }
    };

    // ─── Deactivate category ───
    const deactivateCat = async (id: string) => {
        if (!confirm("Deactivate this category? It will be hidden from the storefront.")) return;
        try {
            await fetch("/api/mmo/category", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            fetchCategories();
        } catch { /* silent */ }
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>
                    Admin &bull; MMO Inventory
                </p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                    <Database style={{ width: 24, height: 24, color: t.statusWarning }} />
                    MMO <span style={{ color: t.statusWarning }}>Inventory</span>
                </h1>
                <p style={{ color: t.textMuted, fontSize: "0.875rem", marginTop: 6 }}>
                    Manage product categories and stock digital inventory with pipe-delimited data.
                </p>
            </div>

            {/* ══════════════════ Section 1: Category Manager ══════════════════ */}
            <div style={{ ...card, padding: 24, marginBottom: 24 }}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: t.textPrimary, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                    <Layers style={{ width: 18, height: 18, color: t.accentPrimary }} />
                    Create Category
                </h2>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div>
                        <label style={labelStyle}>Category Name</label>
                        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Netflix Premium Accounts" style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Slug</label>
                        <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="netflix-premium" style={{ ...inputStyle, fontFamily: t.fontMono }} />
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div>
                        <label style={labelStyle}>Description</label>
                        <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Premium accounts with UHD subscription" style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Price (Credits/unit)</label>
                        <input type="number" min={1} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="500" style={{ ...inputStyle, fontFamily: t.fontMono }} />
                    </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Image URL</label>
                    <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="https://example.com/product-image.png" style={{ ...inputStyle, fontFamily: t.fontMono }} />
                </div>

                {/* ─── Schema Tag Input ─── */}
                <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Data Schema (pipe-delimited fields)</label>
                    <div style={{
                        ...inputStyle, display: "flex", flexWrap: "wrap", gap: 8,
                        padding: "8px 12px", minHeight: 44, alignItems: "center", cursor: "text",
                    }}
                        onClick={() => fieldInputRef.current?.focus()}
                    >
                        {schemaFields.map((f, i) => (
                            <span key={i} style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "4px 10px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 600,
                                background: t.accentPrimaryMuted, color: t.accentPrimary,
                                border: `1px solid ${t.accentPrimary}44`, fontFamily: t.fontMono,
                            }}>
                                {f}
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeSchemaField(i); }}
                                    style={{
                                        width: 16, height: 16, borderRadius: "50%", border: "none",
                                        background: "transparent", color: t.accentPrimary, cursor: "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                                    }}
                                ><X style={{ width: 10, height: 10 }} /></button>
                            </span>
                        ))}
                        <input
                            ref={fieldInputRef}
                            value={fieldInput}
                            onChange={(e) => setFieldInput(e.target.value.replace(/[|]/g, ""))}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab" || e.key === ",") { e.preventDefault(); addSchemaField(); } }}
                            placeholder={schemaFields.length === 0 ? "Type field name + Enter (e.g. email)" : "Add more..."}
                            style={{
                                flex: 1, minWidth: 120, border: "none", outline: "none",
                                background: "transparent", color: t.textPrimary, fontSize: "0.82rem",
                                fontFamily: t.fontMono,
                            }}
                        />
                    </div>
                    {schemaFields.length > 0 && (
                        <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 6, fontFamily: t.fontMono }}>
                            Preview: <span style={{ color: t.accentPrimary }}>{schemaFields.join("|")}</span>
                        </p>
                    )}
                </div>

                {/* Create errors/success */}
                {createErr && (
                    <div style={{ padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, fontSize: "0.82rem", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                        <AlertTriangle style={{ width: 13, height: 13 }} /> {createErr}
                    </div>
                )}
                {createOk && (
                    <div style={{ padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, fontSize: "0.82rem", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                        <Check style={{ width: 13, height: 13 }} /> {createOk}
                    </div>
                )}

                <button onClick={handleCreate} style={{
                    padding: "10px 24px", borderRadius: t.buttonRadius,
                    background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff",
                    fontWeight: 700, fontSize: "0.85rem", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                }}>
                    <Plus style={{ width: 14, height: 14 }} /> Create Category
                </button>
            </div>

            {/* ══════════════════ Existing Categories Table ══════════════════ */}
            <div style={{ ...card, padding: 24, marginBottom: 24 }}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: t.textPrimary, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                    <Package style={{ width: 18, height: 18, color: t.accentPrimary }} />
                    Categories
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: t.textMuted, marginLeft: 4 }}>({categories.length})</span>
                </h2>

                {loading ? (
                    <p style={{ color: t.textMuted, fontSize: "0.85rem" }}>Loading...</p>
                ) : categories.length === 0 ? (
                    <p style={{ color: t.textMuted, fontSize: "0.85rem" }}>No categories yet. Create one above.</p>
                ) : (
                    <div style={{ borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, overflow: "hidden" }}>
                        {/* Table header */}
                        <div style={{
                            display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 80px",
                            padding: "10px 14px", background: t.bgTertiary, gap: 12,
                        }}>
                            {["Name", "Schema", "Price", "Stock", "Sold", ""].map((h) => (
                                <span key={h} style={{ fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                            ))}
                        </div>
                        {/* Table rows */}
                        {categories.map((cat, idx) => (
                            <div key={cat.id} style={{
                                display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 80px",
                                padding: "12px 14px", gap: 12, alignItems: "center",
                                borderTop: `1px solid ${t.borderSecondary}`,
                                background: idx % 2 === 0 ? "transparent" : t.bgSecondary,
                                opacity: cat.active ? 1 : 0.5,
                            }}>
                                <div>
                                    <p style={{ fontWeight: 700, fontSize: "0.85rem", color: t.textPrimary }}>{cat.name}</p>
                                    <p style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>{cat.slug}</p>
                                </div>
                                <p style={{ fontSize: "0.75rem", color: t.accentPrimary, fontFamily: t.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {cat.schema}
                                </p>
                                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: t.textPrimary }}>{cat.pricePerUnit.toLocaleString()} Cr</span>
                                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: t.statusSuccess }}>{cat.unsoldCount.toLocaleString()}</span>
                                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: t.textMuted }}>{cat.soldCount.toLocaleString()}</span>
                                <div style={{ display: "flex", gap: 6 }}>
                                    {cat.active && (
                                        <button onClick={() => deactivateCat(cat.id)} title="Deactivate" style={{
                                            width: 28, height: 28, borderRadius: t.buttonRadius,
                                            border: `1px solid ${t.statusError}44`, background: t.statusErrorBg,
                                            color: t.statusError, cursor: "pointer",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                        }}>
                                            <Trash2 style={{ width: 12, height: 12 }} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ══════════════════ Section 2: Inventory Loader ══════════════════ */}
            <div style={{ ...card, padding: 24 }}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: t.textPrimary, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                    <Upload style={{ width: 18, height: 18, color: t.statusSuccess }} />
                    Stock Inventory
                </h2>

                {/* Category selector */}
                <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Select Category</label>
                    <div style={{ position: "relative" }}>
                        <select
                            value={selectedCatId}
                            onChange={(e) => setSelectedCatId(e.target.value)}
                            style={{
                                ...inputStyle, appearance: "none", paddingRight: 36, cursor: "pointer",
                            }}
                        >
                            <option value="">Choose a category...</option>
                            {categories.filter((c) => c.active).map((c) => (
                                <option key={c.id} value={c.id}>{c.name} ({c.unsoldCount} in stock)</option>
                            ))}
                        </select>
                        <ChevronDown style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: t.textMuted, pointerEvents: "none" }} />
                    </div>
                </div>

                {selectedCat && (
                    <>
                        {/* Schema badge */}
                        <div style={{
                            padding: "10px 14px", borderRadius: t.buttonRadius,
                            background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}44`,
                            marginBottom: 20, display: "flex", alignItems: "center", gap: 8,
                        }}>
                            <Tag style={{ width: 13, height: 13, color: t.textMuted }} />
                            <span style={{ fontSize: "0.78rem", color: t.textSecondary }}>
                                Schema: <span style={{ color: t.accentPrimary, fontWeight: 700, fontFamily: t.fontMono }}>{selectedCat.schema}</span>
                            </span>
                        </div>

                        {/* ─── Row-by-row input ─── */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={labelStyle}>Add Single Item</label>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                                {selectedFields.map((field, i) => (
                                    <div key={field} style={{ flex: 1, minWidth: 120 }}>
                                        <p style={{ fontSize: "0.68rem", color: t.textMuted, marginBottom: 4, fontFamily: t.fontMono }}>{field}</p>
                                        <input
                                            value={rowInputs[i] || ""}
                                            onChange={(e) => {
                                                const copy = [...rowInputs];
                                                copy[i] = e.target.value.replace(/[|]/g, "");
                                                setRowInputs(copy);
                                            }}
                                            onKeyDown={(e) => { if (e.key === "Enter") addRow(); }}
                                            placeholder={field}
                                            style={{ ...inputStyle, fontSize: "0.8rem", fontFamily: t.fontMono }}
                                        />
                                    </div>
                                ))}
                                <button onClick={addRow} style={{
                                    padding: "10px 16px", borderRadius: t.buttonRadius,
                                    background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}44`,
                                    color: t.statusSuccess, fontWeight: 700, fontSize: "0.82rem",
                                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4, height: 40,
                                }}>
                                    <Plus style={{ width: 14, height: 14 }} /> Add
                                </button>
                            </div>
                        </div>

                        {/* ─── Bulk paste ─── */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={labelStyle}>
                                <FileText style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                                Bulk Paste (one item per line, pipe-delimited)
                            </label>
                            <textarea
                                value={bulkText}
                                onChange={(e) => setBulkText(e.target.value)}
                                placeholder={`user1@mail.com|Pass123|recov1@mail.com\nuser2@mail.com|Pass456|recov2@mail.com`}
                                rows={5}
                                style={{
                                    ...inputStyle, fontFamily: t.fontMono, fontSize: "0.78rem",
                                    resize: "vertical", lineHeight: 1.6, marginBottom: 8,
                                }}
                            />
                            <button onClick={parseBulk} disabled={!bulkText.trim()} style={{
                                padding: "8px 16px", borderRadius: t.buttonRadius,
                                background: t.bgSecondary, border: `1px solid ${t.borderPrimary}`,
                                color: t.textSecondary, fontWeight: 600, fontSize: "0.8rem",
                                cursor: "pointer", opacity: !bulkText.trim() ? 0.5 : 1,
                            }}>
                                Parse & Add to Queue
                            </button>
                        </div>

                        {/* ─── Pending queue ─── */}
                        {pendingItems.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                    <span style={{ ...labelStyle, marginBottom: 0 }}>
                                        Pending Queue ({pendingItems.length} item{pendingItems.length !== 1 ? "s" : ""})
                                    </span>
                                    <button onClick={() => setPendingItems([])} style={{
                                        fontSize: "0.72rem", color: t.statusError, background: "transparent",
                                        border: "none", cursor: "pointer", fontWeight: 600,
                                    }}>Clear All</button>
                                </div>
                                <div style={{
                                    borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`,
                                    maxHeight: 240, overflowY: "auto",
                                }}>
                                    {/* Header */}
                                    <div style={{
                                        display: "grid",
                                        gridTemplateColumns: `repeat(${selectedFields.length}, 1fr) 32px`,
                                        padding: "8px 12px", background: t.bgTertiary, gap: 8,
                                        position: "sticky", top: 0,
                                    }}>
                                        {selectedFields.map((f) => (
                                            <span key={f} style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", fontFamily: t.fontMono }}>{f}</span>
                                        ))}
                                        <span />
                                    </div>
                                    {pendingItems.map((item, idx) => (
                                        <div key={idx} style={{
                                            display: "grid",
                                            gridTemplateColumns: `repeat(${selectedFields.length}, 1fr) 32px`,
                                            padding: "6px 12px", gap: 8, alignItems: "center",
                                            borderTop: `1px solid ${t.borderSecondary}`,
                                            background: idx % 2 === 0 ? "transparent" : t.bgSecondary,
                                        }}>
                                            {item.split("|").map((v, vi) => (
                                                <span key={vi} style={{ fontSize: "0.75rem", color: t.textPrimary, fontFamily: t.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                                            ))}
                                            <button onClick={() => setPendingItems((p) => p.filter((_, i) => i !== idx))} style={{
                                                width: 24, height: 24, borderRadius: "50%", border: "none",
                                                background: "transparent", color: t.statusError, cursor: "pointer",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                            }}>
                                                <X style={{ width: 12, height: 12 }} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Upload errors/success */}
                        {uploadErr && (
                            <div style={{ padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, fontSize: "0.82rem", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                                <AlertTriangle style={{ width: 13, height: 13 }} /> {uploadErr}
                            </div>
                        )}
                        {uploadOk && (
                            <div style={{ padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, fontSize: "0.82rem", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                                <Check style={{ width: 13, height: 13 }} /> {uploadOk}
                            </div>
                        )}

                        {/* Submit button */}
                        {pendingItems.length > 0 && (
                            <button onClick={handleUpload} disabled={uploading} style={{
                                padding: "12px 28px", borderRadius: t.buttonRadius,
                                background: t.statusSuccess, color: t.isMono ? t.bgPrimary : "#fff",
                                fontWeight: 800, fontSize: "0.9rem", border: "none",
                                cursor: uploading ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", gap: 8, opacity: uploading ? 0.6 : 1,
                            }}>
                                <Upload style={{ width: 16, height: 16 }} />
                                {uploading ? "Uploading..." : `Upload ${pendingItems.length} Item${pendingItems.length !== 1 ? "s" : ""}`}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
