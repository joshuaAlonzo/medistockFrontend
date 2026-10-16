import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import CropModal from "../components/CropModal";
import { useLocation } from "wouter";
import { Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, Building2, Camera, Check, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, Clock3, Droplets, Eye, FileText, FlaskConical, Heart, ImageIcon, Lock, MapPin, PackagePlus, Pencil, Pill, Plus, Search, ShieldCheck, ShoppingBag, ShoppingCart, Syringe, Tags, Thermometer, Trash2, Truck, Users, Wind, X } from "lucide-react";
import AppShell from "../components/AppShell";
import { AddressMapPicker } from "../components/AddressMapPicker";
import DeliveryAreaMap, { findKnownPhilippineLocation } from "../components/DeliveryAreaMap";
import { useAuth } from "../contexts/AuthContext";
import { api, getActivity, getAllUsers, getCart, getCategories, getCustomerOrders, getDisplayCurrency, getMedicines, getOrders, getPurchaseOrders, getPurchaseOrderItems, getRoles, getSuppliers, getUser, getUserActivity, labelForRole, medicineImageSrc, MEDICINE_PLACEHOLDER, searchActivity, type ActivityLog, type CartItem, type Category, type Medicine, type Order, type PageResult, type PurchaseOrder, type PurchaseOrderItem, type RoleName, type Session, type Supplier, type UserRecord, type UserRole } from "../lib/pharmacyApi";
import { demoActivity, demoCart, demoCategories, demoMedicines, demoOrders, demoRoles, demoSuppliers, demoUsers } from "../lib/demoData";

type SectionData = {
  medicines: Medicine[]; categories: Category[]; suppliers: Supplier[]; orders: Order[];
  cart: CartItem[]; users: UserRecord[]; roles: UserRole[]; activity: ActivityLog[]; profile: UserRecord | null;
  purchaseOrders: PurchaseOrder[];
};
const EMPTY: SectionData = { medicines: [], categories: [], suppliers: [], orders: [], cart: [], users: [], roles: [], activity: [], profile: null, purchaseOrders: [] };
const ROLE_SECTIONS: Record<RoleName, readonly string[]> = {
  admin: ["overview", "medicines", "categories", "suppliers", "orders", "users", "roles", "activity", "profile"],
  staff: ["overview", "medicines", "categories", "suppliers", "orders", "activity", "profile"],
  customer: ["overview", "shop", "cart", "orders", "profile"],
};
type EditorKind = "medicine" | "category" | "supplier" | "user" | "role";
type EditorState = { kind: EditorKind; item?: Medicine | Category | Supplier | UserRecord | UserRole };
type ConfirmState = { title: string; body: string; danger?: boolean; onConfirm: () => void };

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: getDisplayCurrency(), maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const number = (value: number) => new Intl.NumberFormat("en-PH").format(Number.isFinite(value) ? value : 0);
const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  let iso = String(value).trim();
  if (!iso) return null;
  if (!iso.includes("Z") && !/[+-]\d{2}(:\d{2})?$/.test(iso)) {
    iso = `${iso.replace(" ", "T")}Z`;
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date(value) : d;
};
const date = (value?: string | null) => {
  const d = parseDate(value);
  return d && !isNaN(d.getTime()) ? d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
};
const dateShort = (value?: string | null) => {
  const d = parseDate(value);
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";
};
const getCategory = (categories: Category[], id: number) => categories.find((item) => item.categoryId === id)?.categoryName || `Category #${id || "—"}`;
const cartLineSubtotal = (item: CartItem, medicines: Medicine[]) => {
  const currentPrice = medicines.find((medicine) => medicine.medicineId === item.medicineId)?.price;
  const unitPrice = currentPrice ?? item.subtotal / Math.max(1, item.quantity);
  return Number.isFinite(unitPrice) ? unitPrice * item.quantity : 0;
};
const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (["available", "active", "completed", "ready", "delivered"].some((word) => value.includes(word))) return "green";
  if (["pending", "processing", "low", "in progress"].some((word) => value.includes(word))) return "amber";
  if (["out", "cancel", "inactive", "rejected"].some((word) => value.includes(word))) return "red";
  return "neutral";
};
function Status({ value }: { value: string }) { return <span className={`status-pill status-${statusTone(value)}`}>{value || "Unknown"}</span>; }
function Empty({ title, text, icon = <Boxes size={22} /> }: { title: string; text: string; icon?: ReactNode }) { return <div className="empty-state">{icon}<strong>{title}</strong>{text}</div>; }
function Metric({ label, value, note, icon, tone = "normal" }: { label: string; value: string; note: string; icon: ReactNode; tone?: "normal" | "good" | "warn" }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className={`metric-note ${tone}`}>{note}</div></div>;
}
function PageHeading({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><h2>{title}</h2><p>{description}</p></div>{actions && <div className="page-heading-actions">{actions}</div>}</div>;
}
function Pager({ count, page, setPage, pageSize = 8 }: { count: number; page: number; setPage: (value: number) => void; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const start = count ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(count, page * pageSize);
  if (count <= pageSize) return <div className="pagination"><span>{count ? `Showing all ${count} records` : "No records"}</span><span>Complete result set</span></div>;
  return <div className="pagination"><span>Showing {start}–{end} of {count} records</span><div className="pagination-controls"><button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button></div></div>;
}
function SearchBox({ value, onChange, placeholder = "Filter these records…" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="table-search"><Search size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><span className="sr-only">Search records</span></label>;
}
function Notice({ errors, onSettings }: { errors: string[]; onSettings: () => void }) {
  if (errors.length === 0) return null;
  const noUrl = errors.some((error) => error.includes("API URL"));
  return <div className="inline-alert error" style={{ marginBottom: 15 }}><CircleAlert size={16} /><span><strong>{noUrl ? "API connection required" : "Some pharmacy data could not be loaded"}</strong>{noUrl ? "Enter your deployed API URL to load live records. Sample data is available only by choosing an explicit preview role on the sign-in page." : errors.join(" · ")} <button onClick={onSettings}>API settings</button></span></div>;
}

function EditorDialog({ editor, categories, roles, onClose, onSubmit }: { editor: EditorState; categories: Category[]; roles: UserRole[]; onClose: () => void; onSubmit: (values: Record<string, string>) => void }) {
  const item = editor.item as Record<string, unknown> | undefined;
  const fields: { key: string; label: string; type?: string; options?: string[]; full?: boolean; required?: boolean }[] = editor.kind === "medicine" ? [
    { key: "brandName", label: "Brand name", required: true }, { key: "genericName", label: "Generic name", required: true },
    { key: "categoryId", label: "Category", type: "category", required: true }, { key: "dosage", label: "Dosage / pack" },
    { key: "manufacturer", label: "Manufacturer" }, { key: "price", label: "Unit price", type: "number", required: true },
    { key: "stockQty", label: "Stock quantity", type: "number", required: true }, { key: "status", label: "Status", type: "select", options: ["Available", "Out of stock", "Inactive"] },
    { key: "image", label: "Image", type: "image", full: true }, { key: "description", label: "Description", type: "textarea", full: true },
  ] : editor.kind === "category" ? [{ key: "categoryName", label: "Category name", required: true }] : editor.kind === "supplier" ? [
    { key: "supplierName", label: "Supplier name", required: true }, { key: "contactPerson", label: "Contact person" },
    { key: "contactNumber", label: "Contact number" }, { key: "email", label: "Email", type: "email" },
    { key: "address", label: "Address", full: true }, { key: "status", label: "Status", type: "select", options: ["Active", "Inactive"] },
  ] : editor.kind === "user" ? [
    { key: "firstName", label: "First name", required: true }, { key: "lastName", label: "Last name", required: true },
    { key: "email", label: "Email", type: "email" }, { key: "contactNumber", label: "Contact number" },
    { key: "username", label: "Username", required: true }, { key: "roleId", label: "Role", type: "role", required: true },
    ...(!editor.item ? [{ key: "password", label: "Initial password", type: "password", required: true }] : [{ key: "newPassword", label: "New password (optional)", type: "password" }]),
  ] : [{ key: "userRole", label: "Role name", required: true }];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    fields.forEach((field) => { const value = item?.[field.key]; initial[field.key] = value == null ? "" : String(value); });
    if (editor.kind === "medicine" && !initial.status) initial.status = "Available";
    if (editor.kind === "supplier" && !initial.status) initial.status = "Active";
    if (editor.kind === "user" && !initial.roleId) initial.roleId = "3";
    return initial;
  });
  const title = `${editor.item ? "Edit" : "Add"} ${editor.kind === "medicine" ? "medicine" : editor.kind === "category" ? "category" : editor.kind === "supplier" ? "supplier" : editor.kind === "user" ? "user" : "role"}`;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="modal-head">
          <div><h2 id="editor-title">{title}</h2><p>Enter all available record details. Values are sent to your configured API.</p></div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}>
          <div className="form-grid">
            {fields.map((field) => (
              <div className={`form-field ${field.full ? "full" : ""}`} key={field.key}>
                <label htmlFor={`edit-${field.key}`}>{field.label}</label>
                {field.type === "image" ? (
                  <div
                    className="image-dropzone"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = ""; }}
                    onDrop={(e) => {
                      e.preventDefault(); e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "";
                      const file = e.dataTransfer.files[0];
                      if (file && file.type.startsWith("image/")) {
                        const r = new FileReader();
                        r.onload = (ev) => setValues({ ...values, [field.key]: ev.target?.result as string });
                        r.readAsDataURL(file);
                      }
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file"; input.accept = "image/*";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const r = new FileReader();
                          r.onload = (ev) => setValues({ ...values, [field.key]: ev.target?.result as string });
                          r.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                    style={{ border: "2px dashed var(--border)", borderRadius: "8px", padding: "20px", textAlign: "center", cursor: "pointer", minHeight: "120px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
                  >
                    {values[field.key] ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <img src={medicineImageSrc(values[field.key])} style={{ maxHeight: 100, maxWidth: "100%", objectFit: "contain", borderRadius: 4 }} alt="Preview" onError={(e) => { e.currentTarget.src = MEDICINE_PLACEHOLDER; }} />
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Click or drag to replace image</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
                        <ImageIcon size={32} style={{ opacity: 0.5 }} />
                        <span>Drag & drop an image here, or click to browse</span>
                      </div>
                    )}
                  </div>
                ) : field.type === "textarea" ? (
                  <textarea id={`edit-${field.key}`} required={field.required} value={values[field.key] || ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />
                ) : field.type === "select" || field.type === "category" || field.type === "role" ? (
                  <select id={`edit-${field.key}`} required={field.required} value={values[field.key] || ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>
                    {field.type !== "select" && <option value="">Choose…</option>}
                    {(field.type === "category" ? categories.map((row) => ({ value: String(row.categoryId), label: row.categoryName })) : field.type === "role" ? roles.map((row) => ({ value: String(row.userRoleId), label: `${row.userRole} · ${row.userRoleId}` })) : field.options!.map((option) => ({ value: option, label: option }))).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input id={`edit-${field.key}`} type={field.type || "text"} min={field.type === "number" ? "0" : undefined} step={field.key === "price" ? "0.01" : undefined} required={field.required} value={values[field.key] || ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-green"><Check size={14} />Save record</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConfirmModal({ dialog, onClose }: { dialog: ConfirmState; onClose: () => void }) {
  const isDanger = dialog.danger !== false;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal confirm-modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" style={{ maxWidth: 460, padding: "24px 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", flexShrink: 0, background: isDanger ? "#fee2e2" : "#e0f2fe", color: isDanger ? "#dc2626" : "#0284c7" }}>
            {isDanger ? <AlertCircle size={22} /> : <CircleAlert size={22} />}
          </div>
          <div style={{ flex: 1 }}>
            <h2 id="confirm-modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 650, color: "#111827", letterSpacing: "-0.4px" }}>{dialog.title}</h2>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "12px" }}>Confirmation required</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "13px 15px", marginBottom: 18 }}>
          <p style={{ margin: 0, color: "#334155", fontSize: "13px", lineHeight: "1.5" }}>{dialog.body}</p>
        </div>
        <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 9, paddingTop: 0 }}>
          <button type="button" className="button" onClick={onClose} style={{ minHeight: 36, padding: "0 15px" }}>Keep record</button>
          <button
            type="button"
            className={`button ${isDanger ? "button-danger" : "button-green"}`}
            style={{ minHeight: 36, padding: "0 16px", fontWeight: 600, ...(isDanger ? { background: "#dc2626", color: "#ffffff", borderColor: "#dc2626" } : {}) }}
            onClick={() => { onClose(); dialog.onConfirm(); }}
          >
            {isDanger ? "Yes, confirm" : "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}

function getSupplierKeywords(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\b(co|company|inc|incorporated|corp|corporation|supply|supplies|distribution|distributors|distributor|wholesale|wholesalers|pharma|pharmaceuticals|pharmaceutical|medical|med|health|laboratories|lab|labs|ltd|limited|holdings|enterprises|philippines|phil)\b/gi, "")
    .trim();
  return cleaned.split(/[\s\-&,/]+/).filter((w) => w.length >= 3);
}

interface SupplierDivisionMapping {
  manufacturers: string[];
  brandNames: string[];
}

function getCanonicalSupplierMapping(supplier: Supplier): SupplierDivisionMapping | null {
  const name = supplier.supplierName.toLowerCase();
  const id = supplier.supplierId;

  // Supplier 2: Unilab Supply Co. (ID 2 or name has unilab)
  if (name.includes("unilab") || id === 2) {
    return {
      manufacturers: ["unilab", "pascual", "united laboratories"],
      brandNames: [
        "biogesic", "medicol", "alaxan", "allerta", "alerta",
        "bioflu", "enervon", "poten-cee", "neozep", "solmux",
        "tuseran", "kremil", "omepron", "diatabs"
      ],
    };
  }

  // Supplier 3: Zuellig Pharma (ID 3 or name has zuellig)
  if (name.includes("zuellig") || id === 3) {
    return {
      manufacturers: [
        "pfizer", "gsk", "glaxosmithkline", "bayer", "novartis",
        "boehringer", "boehringer ingelheim", "merck", "sanofi", "astrazeneca"
      ],
      brandNames: [
        "ponstan", "amoxil", "augmentin", "zithromax", "cravit",
        "claritin", "centrum", "stresstabs", "robitussin",
        "canesten", "lamisil", "norvasc", "co-micardis", "micardis"
      ],
    };
  }

  // Supplier 1: MedPharma Distributors (ID 1 or name has medpharma)
  if (name.includes("medpharma") || name.includes("med pharma") || id === 1) {
    return {
      manufacturers: [
        "taisho", "mundipharma", "green cross", "reckitt", "reckitt benckiser",
        "johnson & johnson", "johnson and johnson", "j&j", "philusa"
      ],
      brandNames: [
        "tempra", "betadine", "green cross", "gaviscon", "imodium", "daktarin"
      ],
    };
  }

  // Demo Fallback Suppliers
  if (name.includes("northstar") || id === 11) {
    return {
      manufacturers: ["northstar"],
      brandNames: ["amoxicillin", "omeprazole", "breathe easy"],
    };
  }
  if (name.includes("wellspring") || id === 12) {
    return {
      manufacturers: ["wellspring", "apex"],
      brandNames: ["daily d3", "cetirizine", "paracetamol", "ibuprofen"],
    };
  }
  if (name.includes("healthfirst") || id === 13) {
    return {
      manufacturers: ["healthfirst", "medicore"],
      brandNames: ["freshshield", "gentlecare"],
    };
  }

  return null;
}

function getSupplierProvidedMedicines(supplier: Supplier | undefined, allMedicines: Medicine[], _catalogVersion = 0): Medicine[] {
  if (!supplier) return allMedicines;

  // 1. Check custom saved assignments in localStorage
  try {
    const raw = localStorage.getItem(`supplier_catalog_${supplier.supplierId}`);
    if (raw) {
      const customIds: number[] = JSON.parse(raw);
      if (Array.isArray(customIds) && customIds.length > 0) {
        const customMeds = allMedicines.filter((m) => customIds.includes(m.medicineId));
        if (customMeds.length > 0) return customMeds;
      }
    }
  } catch {}

  // 2. Canonical 3-supplier division mapping
  const mapping = getCanonicalSupplierMapping(supplier);
  if (mapping) {
    const matched = allMedicines.filter((m) => {
      const mfg = (m.manufacturer || "").toLowerCase().trim();
      const bName = m.brandName.toLowerCase().trim();
      const gName = (m.genericName || "").toLowerCase().trim();
      const mfgMatch = mapping.manufacturers.some((mf) => mfg.includes(mf) || mf.includes(mfg));
      const brandMatch = mapping.brandNames.some((bn) => bName.includes(bn) || gName.includes(bn));
      return mfgMatch || brandMatch;
    });
    if (matched.length > 0) return matched;
  }

  // 3. Keyword & token matching fallback
  const supTokens = getSupplierKeywords(supplier.supplierName);
  const supLower = supplier.supplierName.toLowerCase();

  const matched = allMedicines.filter((m) => {
    const mfg = (m.manufacturer || "").toLowerCase().trim();
    if (!mfg && supTokens.length === 0) return false;

    // Direct match between manufacturer and supplier name
    if (mfg && (supLower.includes(mfg) || mfg.includes(supLower))) {
      return true;
    }

    // Token matching on manufacturer
    const mfgTokens = getSupplierKeywords(m.manufacturer || "");
    if (supTokens.some((st) => mfgTokens.some((mt) => st.includes(mt) || mt.includes(st)))) {
      return true;
    }

    // Check brand name mentioning supplier keyword
    if (supTokens.some((st) => m.brandName.toLowerCase().includes(st))) {
      return true;
    }

    return false;
  });

  return matched.length > 0 ? matched : allMedicines;
}

function getSupplierCategories(
  supplier: Supplier | undefined,
  allMedicines: Medicine[],
  allCategories: Category[],
  _catalogVersion = 0
): { category: Category; medicines: Medicine[] }[] {
  if (!supplier) return [];
  const meds = getSupplierProvidedMedicines(supplier, allMedicines, _catalogVersion);
  const map = new Map<number, Medicine[]>();
  for (const m of meds) {
    const list = map.get(m.categoryId) || [];
    list.push(m);
    map.set(m.categoryId, list);
  }
  const result: { category: Category; medicines: Medicine[] }[] = [];
  map.forEach((cMeds, catId) => {
    const cat = allCategories.find((c) => c.categoryId === catId) || {
      categoryId: catId,
      categoryName: `Category #${catId}`,
    };
    result.push({ category: cat, medicines: cMeds });
  });
  result.sort((a, b) => a.category.categoryName.localeCompare(b.category.categoryName));
  return result;
}

interface PackagingOption {
  key: string;
  label: string;
  shortLabel: string;
  multiplier: number;
}

function getPackagingOptions(med?: Medicine): PackagingOption[] {
  if (!med) {
    return [
      { key: "single", label: "Per piece / unit", shortLabel: "pc", multiplier: 1 },
      { key: "strip", label: "1 Strip / Pack (10 pcs)", shortLabel: "strip (10)", multiplier: 10 },
      { key: "box", label: "1 Box (100 pcs)", shortLabel: "box (100)", multiplier: 100 },
      { key: "case", label: "1 Master Case (500 pcs)", shortLabel: "case (500)", multiplier: 500 },
    ];
  }

  const text = `${med.brandName} ${med.genericName} ${med.dosage || ""} ${med.description || ""}`.toLowerCase();
  const isLiquid = text.includes("ml") || text.includes("drops") || text.includes("alcohol") || text.includes("syrup") || text.includes("solution") || text.includes("suspension") || text.includes("antiseptic");
  const isCapsule = text.includes("capsule") || text.includes("softgel") || text.includes("cap");

  if (isLiquid) {
    return [
      { key: "single", label: "1 Bottle / Piece", shortLabel: "bottle", multiplier: 1 },
      { key: "pack6", label: "1 Pack of 6 Bottles", shortLabel: "pack of 6", multiplier: 6 },
      { key: "box12", label: "1 Box of 12 Bottles", shortLabel: "box of 12", multiplier: 12 },
      { key: "case24", label: "1 Wholesale Case (24 Bottles)", shortLabel: "case of 24", multiplier: 24 },
    ];
  }

  const unitName = isCapsule ? "capsule" : "tablet";
  const capitalUnit = unitName.charAt(0).toUpperCase() + unitName.slice(1);
  return [
    { key: "single", label: `Per ${capitalUnit} (1×)`, shortLabel: unitName, multiplier: 1 },
    { key: "strip", label: `1 Strip / Pack (10 ${unitName}s)`, shortLabel: `strip (10)`, multiplier: 10 },
    { key: "box", label: `1 Box (100 ${unitName}s)`, shortLabel: `box (100)`, multiplier: 100 },
    { key: "case", label: `1 Master Case (500 ${unitName}s)`, shortLabel: `case (500)`, multiplier: 500 },
  ];
}

interface PoItem {
  medicineId: number;
  qty: number;
  packageType: string;
  packageMultiplier: number;
  unitCost: number;
}

function createDefaultPoLine(med: Medicine): PoItem {
  const opts = getPackagingOptions(med);
  return {
    medicineId: med.medicineId,
    qty: 1,
    packageType: opts[0].key,
    packageMultiplier: opts[0].multiplier,
    unitCost: med.price,
  };
}

interface SupplierCatalogModalProps {
  supplier: Supplier;
  allMedicines: Medicine[];
  categories: Category[];
  onClose: () => void;
  onSave: (count: number) => void;
}

function SupplierCatalogModal({ supplier, allMedicines, categories, onClose, onSave }: SupplierCatalogModalProps) {
  const currentSaved = (() => {
    try {
      const raw = localStorage.getItem(`supplier_catalog_${supplier.supplierId}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr as number[];
      }
    } catch {}
    return getSupplierProvidedMedicines(supplier, allMedicines).map((m) => m.medicineId);
  })();

  const [selectedIds, setSelectedIds] = useState<number[]>(currentSaved);
  const [catalogSearch, setCatalogSearch] = useState("");

  const toggleMed = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const selectAll = () => setSelectedIds(allMedicines.map((m) => m.medicineId));
  const clearAll = () => setSelectedIds([]);
  const saveCatalog = () => {
    localStorage.setItem(`supplier_catalog_${supplier.supplierId}`, JSON.stringify(selectedIds));
    onSave(selectedIds.length);
  };

  const q = catalogSearch.toLowerCase().trim();
  const visibleMeds = allMedicines.filter(
    (m) =>
      !q ||
      [m.brandName, m.genericName, m.manufacturer, m.dosage].some((t) => (t || "").toLowerCase().includes(q))
  );

  const map = new Map<number, Medicine[]>();
  for (const m of visibleMeds) {
    const list = map.get(m.categoryId) || [];
    list.push(m);
    map.set(m.categoryId, list);
  }
  const groups: { categoryId: number; categoryName: string; medicines: Medicine[] }[] = [];
  map.forEach((meds, catId) => {
    const cat = categories.find((c) => c.categoryId === catId);
    groups.push({ categoryId: catId, categoryName: cat?.categoryName || `Category #${catId}`, medicines: meds });
  });
  groups.sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-catalog-title"
        style={{ maxWidth: 580, maxHeight: "88vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-head">
          <div>
            <h2 id="manage-catalog-title">Medicines from {supplier.supplierName}</h2>
            <p>Check the medicines this supplier can provide when creating purchase orders.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid #edf0ed",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            placeholder="Search catalog medicines…"
            style={{ flex: 1, fontSize: 12, padding: "7px 11px", borderRadius: 8, border: "1px solid #dcdfdc" }}
          />
          <button
            type="button"
            className="button"
            onClick={selectAll}
            style={{ minHeight: 30, padding: "0 10px", fontSize: 11 }}
          >
            Select all
          </button>
          <button
            type="button"
            className="button"
            onClick={clearAll}
            style={{ minHeight: 30, padding: "0 10px", fontSize: 11 }}
          >
            Clear all
          </button>
        </div>
        <div style={{ padding: "12px 24px", overflowY: "auto", flex: 1, maxHeight: 420, display: "grid", gap: 14 }}>
          {groups.map((grp) => {
            const grpMeds = grp.medicines;
            const grpCheckedCount = grpMeds.filter((m) => selectedIds.includes(m.medicineId)).length;
            const allGrpChecked = grpCheckedCount === grpMeds.length;
            const toggleGrp = () => {
              const grpIds = grpMeds.map((m) => m.medicineId);
              if (allGrpChecked) {
                setSelectedIds((prev) => prev.filter((id) => !grpIds.includes(id)));
              } else {
                setSelectedIds((prev) => Array.from(new Set([...prev, ...grpIds])));
              }
            };
            return (
              <div
                key={grp.categoryId}
                style={{ background: "#ffffff", border: "1px solid #e1e9e4", borderRadius: 10, padding: 12 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    paddingBottom: 6,
                    borderBottom: "1px solid #f0f4f2",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: 13, color: "#19211d" }}>{grp.categoryName}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#1d7a52",
                        background: "#eef7f2",
                        padding: "1px 7px",
                        borderRadius: 10,
                        fontWeight: 600,
                      }}
                    >
                      {grpCheckedCount}/{grpMeds.length} active
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button"
                    style={{ minHeight: 24, padding: "0 8px", fontSize: 11 }}
                    onClick={toggleGrp}
                  >
                    {allGrpChecked ? "Deselect category" : "Select all in category"}
                  </button>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {grpMeds.map((med) => {
                    const isChecked = selectedIds.includes(med.medicineId);
                    return (
                      <label
                        key={med.medicineId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "6px 10px",
                          borderRadius: 8,
                          background: isChecked ? "#f0f9f4" : "#fafafa",
                          border: isChecked ? "1px solid #bfe3cf" : "1px solid #edf0ed",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMed(med.medicineId)}
                          style={{ width: 16, height: 16, accentColor: "#1d7a52" }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                            {med.brandName} <span style={{ fontWeight: 400, color: "#666" }}>— {med.genericName}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#8a928e" }}>
                            {med.manufacturer ? `Mfg: ${med.manufacturer}` : "No mfg"} · Stock: {med.stockQty} · {money(med.price)}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="modal-actions"
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #edf0ed",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "#666" }}>
            {selectedIds.length} of {allMedicines.length} medicines selected
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="button button-green" onClick={saveCatalog}>
              <Check size={14} />
              Save medicines
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MedicineCardImage({ image, brandName }: { image?: string | null; brandName: string }) {
  const trimmed = (image || "").trim();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const src = trimmed ? medicineImageSrc(trimmed) : "";
  const isFailed = !src || failedSrc === src || src === MEDICINE_PLACEHOLDER;

  if (isFailed) {
    return (
      <div className="product-image-fallback" aria-label={`${brandName} (no photo available)`}>
        <div className="product-fallback-icon-wrap">
          <Pill size={32} strokeWidth={1.6} />
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={brandName}
      loading="lazy"
      onError={() => setFailedSrc(src)}
    />
  );
}

export type CustomerStockStatus = "In stock" | "Low stock" | "No stock";

export function getCustomerStockStatus(med: { stockQty: number; status?: string }): {
  status: CustomerStockStatus;
  key: "in_stock" | "low_stock" | "no_stock";
  isOrderable: boolean;
} {
  const isInactiveOrOut = med.status
    ? med.status.toLowerCase().includes("inactive") || med.status.toLowerCase().includes("out")
    : false;

  if (med.stockQty <= 0 || isInactiveOrOut) {
    return { status: "No stock", key: "no_stock", isOrderable: false };
  }
  if (med.stockQty < 5) {
    return { status: "Low stock", key: "low_stock", isOrderable: true };
  }
  return { status: "In stock", key: "in_stock", isOrderable: true };
}

function CustomerStockBadge({ status }: { status: CustomerStockStatus }) {
  if (status === "In stock") {
    return <span className="stock-badge stock-badge-in">In stock</span>;
  }
  if (status === "Low stock") {
    return <span className="stock-badge stock-badge-low">Low stock</span>;
  }
  return <span className="stock-badge stock-badge-no">No stock</span>;
}

function MedicineDetailsModal({
  medicine,
  categories,
  suppliers,
  catalogVersion,
  onClose,
  onBuy,
  onAdd,
}: {
  medicine: Medicine;
  categories: Category[];
  suppliers: Supplier[];
  catalogVersion: number;
  onClose: () => void;
  onBuy: (med: Medicine) => void;
  onAdd: (med: Medicine) => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  const stockInfo = getCustomerStockStatus(medicine);
  const catName = getCategory(categories, medicine.categoryId);

  const supplier =
    suppliers.find((s) =>
      getSupplierProvidedMedicines(s, [medicine], catalogVersion).some((m) => m.medicineId === medicine.medicineId)
    ) ||
    suppliers.find((s) =>
      medicine.manufacturer && (s.supplierName.toLowerCase().includes(medicine.manufacturer.toLowerCase()) ||
      medicine.manufacturer.toLowerCase().includes(s.supplierName.toLowerCase()))
    );
  const supplierDisplay = supplier?.supplierName || medicine.manufacturer || "Verified Pharmacy Supplier";

  useEffect(() => {
    previouslyFocusedElement.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const closeBtn = modalRef.current?.querySelector<HTMLElement>(".modal-close");
    closeBtn?.focus();

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedElement.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop medicine-details-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={modalRef}
        className="modal medicine-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="medicine-details-title"
      >
        <div className="modal-head medicine-details-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 3 }}>
              <h2 id="medicine-details-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>
                {medicine.brandName}
              </h2>
              <CustomerStockBadge status={stockInfo.status} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--subtle)", fontWeight: 500 }}>
              {medicine.genericName || "Pharmaceutical formula"}
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="medicine-details-body">
          <div className="medicine-details-art">
            <MedicineCardImage image={medicine.image} brandName={medicine.brandName} />
          </div>

          <div className="medicine-details-desc">
            <h4>Description</h4>
            <p>{medicine.description?.trim() ? medicine.description.trim() : "No description available."}</p>
          </div>

          <div className="medicine-details-specs">
            <div className="spec-item">
              <span className="spec-label">Category</span>
              <strong className="spec-value">{catName}</strong>
            </div>
            <div className="spec-item">
              <span className="spec-label">Strength / Dosage</span>
              <strong className="spec-value">{medicine.dosage || "Not specified"}</strong>
            </div>
            <div className="spec-item full-width">
              <span className="spec-label">Supplier</span>
              <strong className="spec-value">{supplierDisplay}</strong>
            </div>
          </div>
        </div>

        <div className="modal-actions medicine-details-footer">
          <div className="medicine-details-price-box">
            <span className="price-label">Price</span>
            <span className="price-value">{money(medicine.price)}</span>
          </div>

          <div className="medicine-details-actions">
            <button
              type="button"
              className="button"
              disabled={!stockInfo.isOrderable}
              title={stockInfo.isOrderable ? "Buy now" : "Out of stock"}
              onClick={() => onBuy(medicine)}
            >
              <ShoppingBag size={14} /> Buy now
            </button>
            <button
              type="button"
              className="button button-green"
              disabled={!stockInfo.isOrderable}
              title={stockInfo.isOrderable ? "Add to cart" : "Out of stock"}
              onClick={() => onAdd(medicine)}
            >
              <Plus size={14} /> Add to cart
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage({ role }: { role: RoleName }) {
  const { session, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [data, setData] = useState<SectionData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityMatches, setActivityMatches] = useState<ActivityLog[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityRefresh, setActivityRefresh] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | null>(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("Cash on delivery");
  // Purchase Order modal
  const [poModal, setPoModal] = useState<{ supplierId: number; supplierName: string } | null>(null);
  const [poForm, setPoForm] = useState<{ notes: string; expectedAt: string; status: string; items: PoItem[] }>({ notes: "", expectedAt: "", status: "Ordered", items: [] });
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [viewPo, setViewPo] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[]; loading: boolean } | null>(null);
  const [filterBySupplierOnly, setFilterBySupplierOnly] = useState(true);
  const [manageCatalogSupplier, setManageCatalogSupplier] = useState<Supplier | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [activeSupplierTab, setActiveSupplierTab] = useState<number | null>(null);
  const [poCategoryFilter, setPoCategoryFilter] = useState<string>("all");
  const avatarStorageKey = session?.userId ? `profile_avatar_${session.userId}` : null;
  const [profileMode, setProfileMode] = useState<"avatar" | "image">(() => { if (!session?.userId) return "avatar"; const saved = localStorage.getItem(`profile_mode_${session.userId}`); return saved === "image" ? "image" : "avatar"; });
  const [profileImage, setProfileImage] = useState<string | null>(() => { if (!session?.userId) return null; return localStorage.getItem(`profile_avatar_${session.userId}`) || null; });
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Philippine address selector state
  const [phRegions, setPhRegions] = useState<Array<{region_code: string; region_name: string}>>([]);
  const [phProvinces, setPhProvinces] = useState<Array<{province_code: string; province_name: string; region_code: string}>>([]);
  const [phCities, setPhCities] = useState<Array<{city_code: string; city_name: string; province_code: string}>>([]);
  const [phBarangays, setPhBarangays] = useState<Array<{brgy_code: string; brgy_name: string; city_code: string}>>([]);
  const [addrRegion, setAddrRegion] = useState("");
  const [addrProvince, setAddrProvince] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrBarangay, setAddrBarangay] = useState(""); // stores brgy_code
  const [addrStreet, setAddrStreet] = useState("");
  const [addrLatitude, setAddrLatitude] = useState<number | null>(null);
  const [addrLongitude, setAddrLongitude] = useState<number | null>(null);
  const [phLoading, setPhLoading] = useState<"provinces" | "cities" | "barangays" | null>(null);
  function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setCropSrc(reader.result as string); };
    reader.readAsDataURL(file);
    event.target.value = "";
  }
  function handleCropDone(croppedDataUrl: string) {
    setProfileImage(croppedDataUrl);
    setProfileMode("image");
    if (avatarStorageKey) { localStorage.setItem(avatarStorageKey, croppedDataUrl); localStorage.setItem(`profile_mode_${session!.userId}`, "image"); }
    setCropSrc(null);
  }
  function switchToAvatar() {
    setProfileMode("avatar");
    if (session?.userId) localStorage.setItem(`profile_mode_${session.userId}`, "avatar");
  }

  // PH Address loader helpers — local JSON files in /public
  async function phSelectRegion(regionCode: string) {
    setAddrRegion(regionCode); setAddrProvince(""); setAddrCity(""); setAddrBarangay(""); setPhBarangays([]);
    if (!regionCode) return;
    if (phProvinces.length === 0) {
      setPhLoading("provinces");
      try {
        const res = await fetch("/ph-province.json");
        setPhProvinces(await res.json());
      } catch { /* offline */ } finally { setPhLoading(null); }
    }
  }
  async function phSelectProvince(provinceCode: string) {
    setAddrProvince(provinceCode); setAddrCity(""); setAddrBarangay(""); setPhBarangays([]);
    if (!provinceCode) return;
    if (phCities.length === 0) {
      setPhLoading("cities");
      try {
        const res = await fetch("/ph-city.json");
        setPhCities(await res.json());
      } catch { /* offline */ } finally { setPhLoading(null); }
    }
  }
  // City just updates state — barangay loading is handled by the useEffect below
  function phSelectCity(cityCode: string) {
    setAddrCity(cityCode); setAddrBarangay(""); setPhBarangays([]);
  }
  const currentSection = location.split("/").filter(Boolean)[1] || "overview";
  const section = role === "staff" && currentSection === "inventory" ? "medicines" : currentSection;

  const load = useCallback(async () => {
    setLoading(true);
    const failed: string[] = [];
    const safely = async <T,>(label: string, task: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await task(); } catch (error) { failed.push(`${label}: ${error instanceof Error ? error.message : "request failed"}`); return fallback; }
    };
    if (session?.mode === "demo") {
      const sampleOrders = role === "customer" ? demoOrders.filter((order) => order.userId === 301).concat(demoOrders.slice(0, 2).map((order) => ({ ...order, userId: 301 }))) : demoOrders;
      const demoProfile = { userId: session.userId, firstName: role === "admin" ? "Admin" : role === "staff" ? "Staff" : "Sample", lastName: role === "customer" ? "Customer" : "User", email: role === "customer" ? "customer@example.test" : `${role}@example.test`, contactNumber: "+63 917 000 0000", username: session.username, roleId: role === "admin" ? 1 : role === "staff" ? 2 : 3, createdAt: "2026-09-01T08:00:00Z" };
      const next: SectionData = { medicines: [...demoMedicines], categories: [...demoCategories], suppliers: [...demoSuppliers], orders: sampleOrders, cart: role === "customer" ? [...demoCart] : [], users: [...demoUsers], roles: [...demoRoles], activity: role === "staff" ? demoActivity.filter((row) => row.userId === session.userId) : [...demoActivity], profile: demoProfile, purchaseOrders: [] };
      setData(next); setActivityTotal(next.activity.length); setActivityMatches(null); setErrors([]); setLoading(false); return;
    }
    if (!session) { setData(EMPTY); setActivityTotal(0); setActivityMatches(null); setErrors(["No active session. Sign in to connect the API."]); setLoading(false); return; }

    const [medicines, categories, suppliers, orders, users, roles, activity, cart, customerOrders, profile, purchaseOrders] = await Promise.all([
      safely("Medicines", getMedicines, [] as Medicine[]),
      safely("Categories", getCategories, [] as Category[]),
      role !== "customer" ? safely("Suppliers", getSuppliers, [] as Supplier[]) : Promise.resolve([] as Supplier[]),
      role !== "customer" ? safely("Orders", getOrders, [] as Order[]) : Promise.resolve([] as Order[]),
      role === "admin" ? safely("Users", getAllUsers, [] as UserRecord[]) : Promise.resolve([] as UserRecord[]),
      role === "admin" ? safely("Roles", getRoles, [] as UserRole[]) : Promise.resolve([] as UserRole[]),
      role === "admin" ? safely("Activity log", () => getActivity(1, 10), { items: [] as ActivityLog[], totalCount: 0, pageSize: 10, currentPage: 1 } as PageResult<ActivityLog>) : role === "staff" ? safely("My activity", () => getUserActivity(session.userId), [] as ActivityLog[]) : Promise.resolve([] as ActivityLog[]),
      role === "customer" && session.userId ? safely("Cart", () => getCart(session.userId), [] as CartItem[]) : Promise.resolve([] as CartItem[]),
      role === "customer" && session.userId ? safely("Orders", () => getCustomerOrders(session.userId), [] as Order[]) : Promise.resolve([] as Order[]),
      session?.userId ? safely("Profile", () => getUser(session.userId), null as UserRecord | null) : Promise.resolve(null as UserRecord | null),
      role !== "customer" ? safely("Purchase orders", getPurchaseOrders, [] as PurchaseOrder[]) : Promise.resolve([] as PurchaseOrder[]),
    ]);
    const activityRows = Array.isArray(activity) ? activity : activity.items;
    const loadedActivityTotal = Array.isArray(activity) ? activityRows.length : activity.totalCount;
    setData({ medicines, categories, suppliers, orders: role === "customer" ? customerOrders : orders, cart, users, roles, activity: activityRows, profile, purchaseOrders });
    setActivityTotal(loadedActivityTotal); setActivityMatches(null);
    setErrors(failed); setLoading(false);
  }, [role, session]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); setTableSearch(""); setStatusFilter("all"); setCategoryFilter("all"); }, [section]);
  useEffect(() => {
    if (role !== "admin" || section !== "activity" || session?.mode !== "api") return;
    let cancelled = false;
    const query = `${search} ${tableSearch}`.trim();
    setActivityLoading(true);
    setActivityMatches(null);
    const loadActivity = async () => {
      try {
        if (query) {
          const matches = await searchActivity(query);
          if (cancelled) return;
          setActivityMatches(matches); setActivityTotal(matches.length);
        } else {
          const result = await getActivity(page, 10);
          if (cancelled) return;
          setData((old) => ({ ...old, activity: result.items })); setActivityTotal(result.totalCount);
        }
        if (!cancelled) setErrors((old) => old.filter((error) => !error.startsWith("Activity log:")));
      } catch (error) {
        if (cancelled) return;
        setActivityMatches(query ? [] : null);
        if (!query) setData((old) => ({ ...old, activity: [] }));
        setActivityTotal(0);
        setErrors((old) => [...old.filter((item) => !item.startsWith("Activity log:")), `Activity log: ${error instanceof Error ? error.message : "request failed"}`]);
      } finally { if (!cancelled) setActivityLoading(false); }
    };
    const timer = window.setTimeout(() => { void loadActivity(); }, query ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [role, section, session?.mode, page, search, tableSearch, activityRefresh]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 4600); return () => window.clearTimeout(timer); }, [toast]);
  // Load region list the first time the profile section is opened
  useEffect(() => {
    if (section !== "profile" || phRegions.length > 0) return;
    fetch("/ph-region.json").then((r) => r.json()).then(setPhRegions).catch(() => {});
  }, [section, phRegions.length]);
  // When addrCity changes (after React commits state), load matching barangays
  useEffect(() => {
    if (!addrCity) return;
    let cancelled = false;
    setPhLoading("barangays");
    fetch("/ph-barangay.json")
      .then((r) => r.json())
      .then((all) => { if (!cancelled) { setPhBarangays(all); setPhLoading(null); } })
      .catch(() => { if (!cancelled) setPhLoading(null); });
    return () => { cancelled = true; };
  }, [addrCity]);
  // Pre-populate street input and hydrating cascading selectors from saved address when profile loads
  useEffect(() => {
    if (section !== "profile" || !data.profile) return;
    let cancelled = false;
    
    setAddrStreet(data.profile.street || "");
    if (data.profile.latitude != null) setAddrLatitude(data.profile.latitude);
    if (data.profile.longitude != null) setAddrLongitude(data.profile.longitude);
    const hydrate = async () => {
      try {
        if (!data.profile?.region) return;
        const regions: Array<{region_code: string; region_name: string}> = await fetch("/ph-region.json").then((r) => r.json());
        if (cancelled) return;
        const region = regions.find((r) => r.region_name === data.profile!.region);
        if (region) { setPhRegions(regions); setAddrRegion(region.region_code); }

        if (!data.profile?.province) return;
        const provinces: Array<{province_code: string; province_name: string; region_code: string}> = await fetch("/ph-province.json").then((r) => r.json());
        if (cancelled) return;
        const province = provinces.find((p) => p.province_name === data.profile!.province);
        if (province) { setPhProvinces(provinces); setAddrProvince(province.province_code); }

        if (!data.profile?.cityMunicipality) return;
        const cities: Array<{city_code: string; city_name: string; province_code: string}> = await fetch("/ph-city.json").then((r) => r.json());
        if (cancelled) return;
        const city = cities.find((c) => c.city_name === data.profile!.cityMunicipality);
        if (city) { setPhCities(cities); setAddrCity(city.city_code); }

        if (!data.profile?.barangay) return;
        const barangays: Array<{brgy_code: string; brgy_name: string; city_code: string}> = await fetch("/ph-barangay.json").then((r) => r.json());
        if (cancelled) return;
        const barangay = barangays.find((b) => b.brgy_name === data.profile!.barangay && b.city_code === city?.city_code);
        if (barangay) { setPhBarangays(barangays); setAddrBarangay(barangay.brgy_code); }
      } catch (e) {
        // fail silently for hydration
      }
    };
    void hydrate();
    
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, data.profile?.userId]);

  const notify = (text: string, error = false) => setToast({ text, error });
  const askConfirm = (title: string, body: string, onConfirm: () => void, danger = true) => setConfirmDialog({ title, body, danger, onConfirm });
  const commit = async (label: string, task: () => Promise<unknown>, demoAction?: () => void): Promise<boolean> => {
    try {
      if (session?.mode === "demo") { demoAction?.(); notify(`${label} — sample preview only.`); }
      else { await task(); await load(); notify(`${label} saved.`); }
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : `Could not ${label.toLowerCase()}.`, true); return false; }
  };
  const logout = () => { signOut(); setLocation("/login"); };
  const goSettings = () => setLocation("/settings");
  const refresh = () => { void load(); if (role === "admin" && section === "activity") setActivityRefresh((value) => value + 1); };
  const lowerSearch = `${search} ${tableSearch}`.trim().toLowerCase();
  const matchingText = (values: unknown[]) => !lowerSearch || values.some((value) => String(value ?? "").toLowerCase().includes(lowerSearch));
  const lowStock = data.medicines.filter((item) => item.stockQty > 0 && item.stockQty <= 20);
  const unavailable = data.medicines.filter((item) => item.stockQty <= 0 || item.status.toLowerCase().includes("out"));
  const pendingOrders = data.orders.filter((order) => ["pending", "processing", "ready", "in progress"].some((status) => order.orderStatus.toLowerCase().includes(status)));
  const recordedValue = data.orders.filter((order) => !["cancelled", "rejected"].some((value) => order.orderStatus.toLowerCase().includes(value))).reduce((total, order) => total + order.totalAmount, 0);
  const availableProducts = data.medicines.filter((item) => item.stockQty > 0 && !item.status.toLowerCase().includes("inactive") && !item.status.toLowerCase().includes("out"));
  const currentCartTotal = data.cart.reduce((total, item) => total + cartLineSubtotal(item, data.medicines), 0);

  async function saveRecord(values: Record<string, string>) {
    if (!editor) return;
    const existing = editor.item as Record<string, unknown> | undefined;
    const key = editor.kind;
    let saved = false;
    if (key === "medicine") {
      const payload = { brandName: values.brandName.trim(), genericName: values.genericName.trim(), categoryId: Number(values.categoryId), description: values.description, dosage: values.dosage, manufacturer: values.manufacturer, price: Number(values.price), stockQty: Number(values.stockQty), image: values.image, status: values.status || "Available" };
      const id = Number(existing?.medicineId || 0);
      saved = await commit(id ? "Medicine updated" : "Medicine added", () => id ? api.updateMedicine(id, payload) : api.createMedicine(payload), () => setData((old) => ({ ...old, medicines: id ? old.medicines.map((row) => row.medicineId === id ? { ...row, ...payload, updatedAt: new Date().toISOString() } : row) : [{ ...payload, medicineId: Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...old.medicines] })));
    } else if (key === "category") {
      const id = Number(existing?.categoryId || 0);
      saved = await commit(id ? "Category updated" : "Category added", () => id ? api.updateCategory(id, values.categoryName.trim()) : api.createCategory(values.categoryName.trim()), () => setData((old) => ({ ...old, categories: id ? old.categories.map((row) => row.categoryId === id ? { ...row, categoryName: values.categoryName.trim() } : row) : [{ categoryId: Date.now(), categoryName: values.categoryName.trim() }, ...old.categories] })));
    } else if (key === "supplier") {
      const payload = { supplierName: values.supplierName.trim(), contactPerson: values.contactPerson, contactNumber: values.contactNumber, email: values.email, address: values.address, status: values.status || "Active" };
      const id = Number(existing?.supplierId || 0);
      saved = await commit(id ? "Supplier updated" : "Supplier added", () => id ? api.updateSupplier(id, payload) : api.createSupplier(payload), () => setData((old) => ({ ...old, suppliers: id ? old.suppliers.map((row) => row.supplierId === id ? { ...row, ...payload } : row) : [{ ...payload, supplierId: Date.now() }, ...old.suppliers] })));
    } else if (key === "user") {
      const roleId = Number(values.roleId || 3); const id = Number(existing?.userId || 0);
      if (id) {
        const payload = { firstName: values.firstName, lastName: values.lastName, email: values.email, contactNumber: values.contactNumber, username: values.username.trim(), roleId, newPassword: values.newPassword || undefined };
        saved = await commit("User updated", () => api.updateUser(id, payload), () => setData((old) => ({ ...old, users: old.users.map((row) => row.userId === id ? { ...row, ...payload } : row) })));
      } else {
        const payload = { firstName: values.firstName, lastName: values.lastName, email: values.email, contactNumber: values.contactNumber, username: values.username.trim(), roleId, password: values.password };
        saved = await commit("User added", () => api.createUser(payload), () => setData((old) => ({ ...old, users: [{ ...payload, userId: Date.now(), createdAt: new Date().toISOString() }, ...old.users] })));
      }
    } else {
      const id = Number(existing?.userRoleId || 0);
      saved = await commit(id ? "Role updated" : "Role added", () => id ? api.updateRole(id, values.userRole.trim()) : api.createRole(values.userRole.trim()), () => setData((old) => ({ ...old, roles: id ? old.roles.map((row) => row.userRoleId === id ? { ...row, userRole: values.userRole.trim() } : row) : [{ userRoleId: Date.now(), userRole: values.userRole.trim() }, ...old.roles] })));
    }
    if (saved) setEditor(null);
  }

  function deleteRecord(kind: "medicine" | "category" | "supplier" | "user" | "role" | "order", id: number) {
    const labels: Record<string, string> = { medicine: "Medicine", category: "Category", supplier: "Supplier", user: "User account", role: "Role", order: "Order" };
    askConfirm(`Delete ${labels[kind] || kind}`, `Are you sure you want to delete ${kind} #${id}? This action is permanent and cannot be undone.`, async () => {
      if (kind === "medicine") await commit("Medicine deleted", () => api.deleteMedicine(id), () => setData((old) => ({ ...old, medicines: old.medicines.filter((row) => row.medicineId !== id) })));
      if (kind === "category") await commit("Category deleted", () => api.deleteCategory(id), () => setData((old) => ({ ...old, categories: old.categories.filter((row) => row.categoryId !== id) })));
      if (kind === "supplier") await commit("Supplier deleted", () => api.deleteSupplier(id), () => setData((old) => ({ ...old, suppliers: old.suppliers.filter((row) => row.supplierId !== id) })));
      if (kind === "user") await commit("User deleted", () => api.deleteUser(id), () => setData((old) => ({ ...old, users: old.users.filter((row) => row.userId !== id) })));
      if (kind === "role") await commit("Role deleted", () => api.deleteRole(id), () => setData((old) => ({ ...old, roles: old.roles.filter((row) => row.userRoleId !== id) })));
      if (kind === "order") await commit("Order deleted", () => api.deleteOrder(id), () => setData((old) => ({ ...old, orders: old.orders.filter((row) => row.orderId !== id) })));
    });
  }

  async function savePurchaseOrder() {
    if (!poModal || !session) return;
    if (poForm.items.length === 0) {
      notify("Please add at least one medicine to the purchase order.", true);
      return;
    }
    setPoSubmitting(true);
    const poNumber = `PO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const payload = {
      purchaseOrderNumber: poNumber,
      supplierId: poModal.supplierId,
      status: poForm.status || "Ordered",
      orderedAt: new Date().toISOString(),
      expectedAt: poForm.expectedAt ? new Date(poForm.expectedAt).toISOString() : null,
      receivedAt: poForm.status === "Received" ? new Date().toISOString() : null,
      createdByUserId: session.userId,
      notes: poForm.notes || null,
    };
    const itemsToSave = [...poForm.items];
    const ok = await commit("Purchase order created", async () => {
      const res = await api.createPurchaseOrder(payload);
      let createdPoId = (res as { purchaseOrderId?: number })?.purchaseOrderId;
      if (!createdPoId) {
        const all = await getPurchaseOrders();
        const match = all.find((p) => p.purchaseOrderNumber === poNumber);
        if (match) createdPoId = match.purchaseOrderId;
      }
      if (createdPoId) {
        for (const item of itemsToSave) {
          const med = data.medicines.find((m) => m.medicineId === item.medicineId);
          const supplierPrice = med?.price ?? item.unitCost;
          const multiplier = item.packageMultiplier || 1;
          const totalUnits = item.qty * multiplier;
          const opts = getPackagingOptions(med);
          const opt = opts.find((o) => o.key === item.packageType) || opts[0];
          const packLabel = `${item.qty} × ${opt.label}`;

          await api.createPurchaseOrderItem({
            purchaseOrderId: createdPoId,
            medicineId: item.medicineId,
            quantityOrdered: totalUnits,
            quantityReceived: poForm.status === "Received" ? totalUnits : 0,
            unitCost: supplierPrice,
            notes: packLabel,
          });
        }
      }
      if (poForm.status === "Received") {
        for (const item of itemsToSave) {
          const med = data.medicines.find((m) => m.medicineId === item.medicineId);
          if (med) {
            const multiplier = item.packageMultiplier || 1;
            const totalUnits = item.qty * multiplier;
            await api.updateMedicine(med.medicineId, {
              ...med,
              stockQty: med.stockQty + totalUnits,
            });
          }
        }
      }
    }, () => {
      const newPo: PurchaseOrder = { ...payload, purchaseOrderId: Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setData((old) => ({ ...old, purchaseOrders: [newPo, ...old.purchaseOrders] }));
    });
    setPoSubmitting(false);
    if (ok) { setPoModal(null); setPoForm({ notes: "", expectedAt: "", status: "Ordered", items: [] }); }
  }

  async function openViewPo(po: PurchaseOrder) {
    setViewPo({ po, items: [], loading: true });
    try {
      const items = await getPurchaseOrderItems(po.purchaseOrderId);
      setViewPo({ po, items, loading: false });
    } catch {
      setViewPo({ po, items: [], loading: false });
    }
  }

  function deletePurchaseOrder(poId: number) {
    askConfirm("Delete purchase order", `Delete PO #${poId}? This cannot be undone.`, async () => {
      await commit("Purchase order deleted", () => api.deletePurchaseOrder(poId), () => setData((old) => ({ ...old, purchaseOrders: old.purchaseOrders.filter((po) => po.purchaseOrderId !== poId) })));
    });
  }

  // PO status flow: Draft → Ordered → PartiallyReceived → Received. Cancelled is allowed from any status.
  const PO_STATUS_ORDER = ["Draft", "Ordered", "PartiallyReceived", "Received"] as const;
  function getNextAllowedPoStatuses(current: string): string[] {
    const idx = PO_STATUS_ORDER.findIndex((s) => s.toLowerCase() === current.toLowerCase());
    if (idx === -1) return [...PO_STATUS_ORDER, "Cancelled"];
    const allowed: string[] = [PO_STATUS_ORDER[idx]]; // keep current
    if (idx + 1 < PO_STATUS_ORDER.length) allowed.push(PO_STATUS_ORDER[idx + 1]); // next step
    if (current.toLowerCase() !== "cancelled" && current.toLowerCase() !== "received") allowed.push("Cancelled"); // cancel from any non-terminal
    return allowed;
  }
  function getPoStatusStepLabel(current: string): string {
    const idx = PO_STATUS_ORDER.findIndex((s) => s.toLowerCase() === current.toLowerCase());
    if (current.toLowerCase() === "cancelled") return "This order has been cancelled.";
    if (current.toLowerCase() === "received") return "✓ Fully received — stock has been updated.";
    if (idx === -1) return "";
    const next = PO_STATUS_ORDER[idx + 1];
    return next ? `Next step → ${next}` : "";
  }

  async function updatePoStatus(poId: number, newStatus: string) {
    const po = data.purchaseOrders.find((p) => p.purchaseOrderId === poId);
    if (!po) return;
    // Validate sequential transition
    const allowed = getNextAllowedPoStatuses(po.status);
    if (!allowed.some((s) => s.toLowerCase() === newStatus.toLowerCase())) {
      const idx = PO_STATUS_ORDER.findIndex((s) => s.toLowerCase() === po.status.toLowerCase());
      const nextStep = idx >= 0 && idx + 1 < PO_STATUS_ORDER.length ? PO_STATUS_ORDER[idx + 1] : null;
      notify(
        `⚠️ Cannot skip status steps. Current status is "${po.status}"${nextStep ? ` — next allowed step is "${nextStep}"` : ""}. Follow the process: Draft → Ordered → PartiallyReceived → Received.`,
        true
      );
      return;
    }
    if (newStatus.toLowerCase() === po.status.toLowerCase()) return; // no change
    const isNowReceived = newStatus === "Received" && po.status !== "Received";
    const payload = {
      purchaseOrderNumber: po.purchaseOrderNumber,
      supplierId: po.supplierId,
      status: newStatus,
      orderedAt: po.orderedAt ? new Date(po.orderedAt).toISOString() : null,
      expectedAt: po.expectedAt ? new Date(po.expectedAt).toISOString() : null,
      receivedAt: newStatus === "Received" ? new Date().toISOString() : (po.receivedAt ? new Date(po.receivedAt).toISOString() : null),
      createdByUserId: po.createdByUserId,
      notes: po.notes,
    };
    await commit("PO status updated", async () => {
      await api.updatePurchaseOrder(poId, payload as Parameters<typeof api.updatePurchaseOrder>[1]);
      if (isNowReceived) {
        try {
          const items = await getPurchaseOrderItems(poId);
          for (const item of items) {
            const med = data.medicines.find((m) => m.medicineId === item.medicineId);
            if (med) {
              await api.updateMedicine(med.medicineId, {
                ...med,
                stockQty: med.stockQty + item.quantityOrdered,
              });
            }
          }
        } catch {
          // ignore
        }
      }
    }, () => setData((old) => ({ ...old, purchaseOrders: old.purchaseOrders.map((p) => p.purchaseOrderId === poId ? { ...p, status: newStatus } : p) })));
  }

  async function setOrderStatus(orderId: number, next: string) {
    const demoAction = () => setData((old) => ({ ...old, orders: old.orders.map((row) => row.orderId === orderId ? { ...row, orderStatus: next } : row) }));
    await commit(`Order #${orderId} status updated`, () => api.updateOrderStatus(orderId, next), demoAction);
  }

  async function cancelOrder(orderId: number) {
    const demoAction = () => setData((old) => ({ ...old, orders: old.orders.map((row) => row.orderId === orderId ? { ...row, orderStatus: "Cancelled" } : row) }));
    await commit(`Order #${orderId} cancelled`, () => api.cancelOrder(orderId), demoAction);
  }

  async function addCart(medicine: Medicine) {
    const existing = data.cart.find((row) => row.medicineId === medicine.medicineId);
    const quantity = (existing?.quantity || 0) + 1;
    if (quantity > medicine.stockQty) { notify("The requested quantity is above the stock amount currently shown.", true); return; }
    await commit(`${medicine.brandName} added to cart`, () => api.addToCart(session!.userId, medicine.medicineId, 1, medicine.price), () => setData((old) => ({ ...old, cart: existing ? old.cart.map((row) => row.medicineId === medicine.medicineId ? { ...row, quantity, subtotal: medicine.price * quantity } : row) : [{ cartId: Date.now(), userId: session!.userId, medicineId: medicine.medicineId, quantity: 1, subtotal: medicine.price, addedAt: new Date().toISOString() }, ...old.cart] })));
  }

  async function updateCartQuantity(row: CartItem, quantity: number) {
    const medicine = data.medicines.find((item) => item.medicineId === row.medicineId);
    if (quantity <= 0) { await removeCart(row); return; }
    if (medicine && quantity > medicine.stockQty) { notify(`Only ${medicine.stockQty} units are currently shown in stock.`, true); return; }
    const subtotal = (medicine?.price ?? row.subtotal / Math.max(1, row.quantity)) * quantity;
    await commit("Cart quantity updated", () => api.updateCart(row.cartId, quantity, subtotal), () => setData((old) => ({ ...old, cart: old.cart.map((item) => item.cartId === row.cartId ? { ...item, quantity, subtotal } : item) })));
  }

  async function removeCart(row: CartItem) {
    await commit("Cart item removed", () => api.removeCart(row.cartId), () => setData((old) => ({ ...old, cart: old.cart.filter((item) => item.cartId !== row.cartId) })));
  }

  function clearCart() {
    askConfirm("Clear cart", "Remove every item from your cart? This cannot be undone.", async () => {
      await commit("Cart cleared", () => api.clearCart(session!.userId), () => setData((old) => ({ ...old, cart: [] })));
    });
  }

  // Compose the saved profile address into the same comma-separated string the
  // profile page shows, so checkout can pre-fill it for the customer.
  const composedProfileAddress = data.profile
    ? [
        data.profile.street,
        data.profile.barangay,
        data.profile.cityMunicipality,
        data.profile.province,
        data.profile.region,
      ].filter(Boolean).join(", ")
    : "";

  // Open the checkout modal pre-filled from the customer's saved profile address
  // and coordinates. The address stays editable, so it can still be overridden
  // before placing the order. Customers without a saved address keep the empty field.
  function openCheckout() {
    if (composedProfileAddress) setDeliveryAddress(composedProfileAddress);
    if (data.profile?.latitude != null) setDeliveryLatitude(data.profile.latitude);
    if (data.profile?.longitude != null) setDeliveryLongitude(data.profile.longitude);
    setCheckoutOpen(true);
  }

  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (!deliveryAddress.trim()) { notify("Enter a delivery address before checkout.", true); return; }
    const placed = await commit("Order placed", () => api.checkout(session!.userId, paymentMethod, deliveryAddress.trim(), deliveryLatitude ?? undefined, deliveryLongitude ?? undefined), () => {
      const items = data.cart.map((item) => { const medicine = data.medicines.find((row) => row.medicineId === item.medicineId); return { orderId: Date.now(), medicineId: item.medicineId, quantity: item.quantity, unitPrice: medicine?.price || 0, subtotal: cartLineSubtotal(item, data.medicines), brandName: medicine?.brandName, genericName: medicine?.genericName }; });
      const totalAmount = data.cart.reduce((total, item) => total + cartLineSubtotal(item, data.medicines), 0);
      setData((old) => ({ ...old, cart: [], orders: [{ orderId: Date.now(), userId: session!.userId, orderDate: new Date().toISOString(), totalAmount, paymentMethod, deliveryAddress: deliveryAddress.trim(), deliveryLatitude: deliveryLatitude ?? old.profile?.latitude, deliveryLongitude: deliveryLongitude ?? old.profile?.longitude, orderStatus: "Pending", items }, ...old.orders] }));
    });
    if (placed) setCheckoutOpen(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    // Build separate address fields from the cascading selector state
    const regionName   = addrRegion   ? phRegions.find((r) => r.region_code   === addrRegion)?.region_name   ?? "" : "";
    const provinceName = addrProvince ? phProvinces.find((p) => p.province_code === addrProvince)?.province_name ?? "" : "";
    const cityName     = addrCity     ? phCities.find((c) => c.city_code       === addrCity)?.city_name       ?? "" : "";
    const barangayName = addrBarangay ? phBarangays.find((b) => b.brgy_code    === addrBarangay)?.brgy_name   ?? "" : "";
    const fullAddr = [addrStreet, barangayName, cityName, provinceName, regionName].filter(Boolean).join(", ");
    let lat = addrLatitude ?? data.profile?.latitude ?? undefined;
    let lng = addrLongitude ?? data.profile?.longitude ?? undefined;
    if (lat == null || lng == null) {
      const known = findKnownPhilippineLocation(fullAddr);
      if (known) {
        lat = known.lat;
        lng = known.lng;
      }
    }

    const payload = {
      firstName:       String(form.get("firstName")    || ""),
      lastName:        String(form.get("lastName")     || ""),
      email:           String(form.get("email")        || ""),
      contactNumber:   String(form.get("contactNumber") || ""),
      region:          regionName   || data.profile?.region   || "",
      province:        provinceName || data.profile?.province || "",
      cityMunicipality: cityName   || data.profile?.cityMunicipality || "",
      barangay:        barangayName || data.profile?.barangay || "",
      street:          addrStreet   || data.profile?.street   || "",
      latitude:        lat,
      longitude:       lng,
      username:        String(form.get("username") || "").trim(),
      roleId:          session?.roleId ?? 3,
    };
    await commit("Profile updated", () => api.updateUser(session!.userId, payload), () => setData((old) => ({ ...old, profile: { ...(old.profile || { userId: session!.userId, createdAt: new Date().toISOString() }), ...payload } })));
  }

  const navTitle: Record<string, string> = { overview: "Overview", medicines: role === "staff" ? "Inventory" : "Medicines", categories: "Categories", suppliers: "Suppliers", orders: role === "customer" ? "My orders" : "Orders", users: "People", roles: "Roles", activity: role === "staff" ? "My activity" : "Activity log", shop: "Browse medicines", cart: "My cart", profile: "My profile" };
  const pageDescription: Record<string, string> = { overview: "Your pharmacy, at a glance.", medicines: "Complete medicine details, availability, and stock controls.", categories: "Organize the medicine catalog by category.", suppliers: "Supplier directory and order fulfillment records.", orders: "Review every order, line item, address, payment method, and status.", users: "Manage available account profiles and role assignments.", roles: "Review and maintain API role definitions.", activity: role === "staff" ? "Audit details of your recent actions." : "Audit details and activity logs.", shop: "Browse our catalog of available medicines and healthcare products.", cart: "Review each item, change quantities, and continue to checkout.", profile: "Review and update your supported account details." };

  const getCustomerUsername = useCallback((userId: number): string | null => {
    const user = data.users.find((u) => u.userId === userId);
    if (user?.username) return user.username;
    if (data.profile?.userId === userId && data.profile?.username) return data.profile.username;
    if (session?.userId === userId && session?.username) return session.username;
    return null;
  }, [data.users, data.profile, session]);

  const getCustomerDisplay = useCallback((userId: number): string => {
    const username = getCustomerUsername(userId);
    const user = data.users.find((u) => u.userId === userId);
    const firstName = user?.firstName || (data.profile?.userId === userId ? data.profile.firstName : "");
    const lastName = user?.lastName || (data.profile?.userId === userId ? data.profile.lastName : "");
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    if (username) {
      return fullName ? `${username} · ${fullName}` : username;
    }
    return fullName || `ID ${userId}`;
  }, [getCustomerUsername, data.users, data.profile]);

  const filteredMedicines = data.medicines.filter((row) =>
    matchingText([row.brandName, row.genericName, row.description, row.dosage, row.manufacturer, row.status, row.medicineId]) &&
    (categoryFilter === "all" || String(row.categoryId) === categoryFilter) &&
    (statusFilter === "all" ||
      (role === "customer"
        ? (statusFilter === "in_stock"
            ? getCustomerStockStatus(row).key === "in_stock"
            : statusFilter === "low_stock"
            ? getCustomerStockStatus(row).key === "low_stock"
            : statusFilter === "no_stock"
            ? getCustomerStockStatus(row).key === "no_stock"
            : statusFilter === "available"
            ? getCustomerStockStatus(row).isOrderable
            : statusFilter === "out"
            ? getCustomerStockStatus(row).key === "no_stock"
            : getCustomerStockStatus(row).status.toLowerCase() === statusFilter.toLowerCase())
        : (statusFilter === "low"
            ? row.stockQty > 0 && row.stockQty <= 20
            : statusFilter === "out"
            ? row.stockQty <= 0 || row.status.toLowerCase().includes("out")
            : statusFilter === "available"
            ? row.stockQty > 0 && !row.status.toLowerCase().includes("inactive")
            : row.status.toLowerCase() === statusFilter)
      )
    )
  );
  const filteredOrders = data.orders.filter((row) => matchingText([row.orderId, row.userId, getCustomerUsername(row.userId), row.orderStatus, row.paymentMethod, row.deliveryAddress, row.items.map((item) => `${item.brandName} ${item.genericName} ${item.quantity}`).join(" ")]) && (statusFilter === "all" || row.orderStatus.toLowerCase() === statusFilter));
  const apiAdminActivity = role === "admin" && section === "activity" && session?.mode === "api";
  const activitySearchQuery = `${search} ${tableSearch}`.trim();
  const activityRows = apiAdminActivity ? activitySearchQuery ? activityMatches || [] : data.activity : data.activity.filter((row) => matchingText([row.logId, row.userId, row.activity, row.activityDate, row.ipAddress]));
  const activityVisibleRows = apiAdminActivity && !activitySearchQuery ? activityRows : activityRows.slice((page - 1) * 10, page * 10);
  const activityResultCount = apiAdminActivity && !activitySearchQuery ? activityTotal : activityRows.length;

  if (!ROLE_SECTIONS[role].includes(section)) return <AppShell role={role} session={session!} userProfile={data.profile} onLogout={logout} search={search} onSearch={setSearch} profileImage={profileImage} orders={data.orders} suppliers={data.suppliers} purchaseOrders={data.purchaseOrders} users={data.users} cartItems={data.cart} medicines={data.medicines}><Notice errors={errors} onSettings={goSettings} /><section className="panel panel-pad permission-panel"><ShieldCheck size={24} /><h2>This section isn't available for your workspace role</h2><p>Use the navigation for the sections assigned to your account. Restricted records and controls are not loaded here.</p><button className="button button-green" onClick={() => setLocation(`/${role}`)}>Return to overview</button></section></AppShell>;

  return <AppShell role={role} session={session!} userProfile={data.profile} onLogout={logout} search={search} onSearch={setSearch} profileImage={profileImage} orders={data.orders} suppliers={data.suppliers} purchaseOrders={data.purchaseOrders} users={data.users} cartItems={data.cart} medicines={data.medicines}>
    <Notice errors={errors} onSettings={goSettings} />
    {loading && <div className="panel loading-state"><span className="spinner" />Loading pharmacy workspace…</div>}
    {!loading && section === "overview" && <Overview role={role} data={data} userName={data.profile?.firstName || session?.username || "there"} lowStock={lowStock} unavailable={unavailable} pendingOrders={pendingOrders} recordedValue={recordedValue} availableProducts={availableProducts} go={setLocation} />}
    {!loading && (section === "medicines" || section === "inventory") && <>
      <PageHeading title={navTitle.medicines} description={pageDescription.medicines} actions={(role === "admin" || role === "staff") ? <button className="button button-green" onClick={() => setEditor({ kind: "medicine" })}><Plus size={15} />Add medicine</button> : undefined} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search brand, generic, manufacturer…" /><select className="filter-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{data.categories.map((row) => <option key={row.categoryId} value={row.categoryId}>{row.categoryName}</option>)}</select><select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All stock states</option><option value="available">Available</option><option value="low">Low stock ≤ 20</option><option value="out">Out of stock</option></select><span className="table-count">{filteredMedicines.length} matching · {data.medicines.length} loaded</span></div>
        {filteredMedicines.length === 0 ? <Empty title="No medicines found" text="Change the filters or add a medicine record." /> : <><div className="table-wrap"><table><thead><tr><th>Medicine record</th><th>Category</th><th>Dosage / manufacturer</th><th>Price</th><th>Stock</th><th>Status</th><th>Dates</th><th>Actions</th></tr></thead><tbody>{filteredMedicines.slice((page - 1) * 8, page * 8).map((row) => <tr key={row.medicineId}><td><div className="medicine-cell"><img src={medicineImageSrc(row.image)} alt="" onError={(event) => { event.currentTarget.src = MEDICINE_PLACEHOLDER; }} /><span><span className="cell-primary">{row.brandName || "Unnamed medicine"}</span><span className="cell-secondary">{row.genericName || "Generic name not provided"} · ID {row.medicineId}</span><span className="record-detail">{row.description || "No description supplied."}</span></span></div></td><td>{getCategory(data.categories, row.categoryId)}<span className="cell-secondary">Category ID {row.categoryId || "—"}</span></td><td>{row.dosage || "Not provided"}<span className="cell-secondary">{row.manufacturer || "Manufacturer not provided"}</span></td><td className="cell-primary">{money(row.price)}</td><td><strong>{number(row.stockQty)}</strong><span className="cell-secondary">units</span></td><td><Status value={row.status || (row.stockQty > 0 ? "Available" : "Out of stock")} /></td><td>{dateShort(row.updatedAt)}<span className="cell-secondary">Created {dateShort(row.createdAt)}<br />Updated {date(row.updatedAt)}</span></td><td><div className="cell-actions">{(role === "admin" || role === "staff") && <button className="table-action" onClick={() => setEditor({ kind: "medicine", item: row })} title="Edit medicine"><Pencil size={13} />Edit</button>}{role === "admin" && <button className="table-action danger" onClick={() => void deleteRecord("medicine", row.medicineId)} title="Delete medicine"><Trash2 size={13} /></button>}</div></td></tr>)}</tbody></table></div><Pager count={filteredMedicines.length} page={page} setPage={setPage} /></>}

      </section></>}
    {!loading && section === "categories" && <>
      <PageHeading title="Medicine categories" description="Every category available to group and filter the catalog." actions={(role === "admin" || role === "staff") ? <button className="button button-green" onClick={() => setEditor({ kind: "category" })}><Plus size={15} />Add category</button> : undefined} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Find a category…" /><span className="table-count">{data.categories.length} categories loaded</span></div>
        {data.categories.filter((row) => matchingText([row.categoryId, row.categoryName])).length === 0 ? <Empty title="No categories available" text="Categories returned by the API will appear here." icon={<Tags size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Category ID</th><th>Category name</th><th>Medicines in category</th><th>Suppliers providing</th><th>Actions</th></tr></thead><tbody>{data.categories.filter((row) => matchingText([row.categoryId, row.categoryName])).slice((page - 1) * 10, page * 10).map((row) => {
          const suppliersForCat = data.suppliers.filter((s) => {
            const sMeds = getSupplierProvidedMedicines(s, data.medicines, catalogVersion);
            return sMeds.some((m) => m.categoryId === row.categoryId);
          });
          return <tr key={row.categoryId}><td className="cell-primary">{row.categoryId}</td><td><span className="cell-primary">{row.categoryName}</span></td><td>{data.medicines.filter((medicine) => medicine.categoryId === row.categoryId).length} records</td><td><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{suppliersForCat.length > 0 ? suppliersForCat.map((s) => <span key={s.supplierId} style={{ fontSize: 11, padding: "2px 7px", background: "#f0f7f3", color: "#1d7a52", borderRadius: 6, border: "1px solid #d4e7dc", fontWeight: 550 }}>{s.supplierName}</span>) : <span style={{ fontSize: 11, color: "#a0a8a4" }}>None assigned</span>}</div></td><td><div className="cell-actions">{(role === "admin" || role === "staff") && <><button className="table-action" onClick={() => setEditor({ kind: "category", item: row })}><Pencil size={13} />Edit</button><button className="table-action danger" onClick={() => void deleteRecord("category", row.categoryId)}><Trash2 size={13} /></button></>}</div></td></tr>;
        })}</tbody></table></div>}
        <Pager count={data.categories.filter((row) => matchingText([row.categoryId, row.categoryName])).length} page={page} setPage={setPage} pageSize={10} />
      </section></>}
    {!loading && section === "suppliers" && <>
      <PageHeading title="Suppliers & Purchase Orders" description="Manage your supplier directory, divided catalogs, and stock replenishment orders." actions={(role === "admin" || role === "staff") ? <button className="button button-green" onClick={() => setEditor({ kind: "supplier" })}><Plus size={15} />Add supplier</button> : undefined} />

      {/* 3-Supplier Division Showcase */}
      {data.suppliers.length > 0 && (
        <section className="panel" style={{ marginBottom: 16, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Boxes size={18} color="#1d7a52" />
                Supplier Catalogs & Category Division
              </h3>
              <p style={{ margin: "4px 0 0", color: "#6e7772", fontSize: 13 }}>
                Medicines and categories partitioned across your {data.suppliers.length} authorized pharmaceutical suppliers.
              </p>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.suppliers.map((s) => {
                const sMeds = getSupplierProvidedMedicines(s, data.medicines, catalogVersion);
                const sCats = getSupplierCategories(s, data.medicines, data.categories, catalogVersion);
                const isSelected = (activeSupplierTab ?? data.suppliers[0]?.supplierId) === s.supplierId;
                return (
                  <button
                    key={s.supplierId}
                    type="button"
                    className="button"
                    style={{
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      background: isSelected ? "#1d7a52" : "#f5f8f6",
                      color: isSelected ? "#ffffff" : "#2d3330",
                      borderColor: isSelected ? "#1d7a52" : "#d8e2dc",
                      boxShadow: isSelected ? "0 2px 6px rgba(29, 122, 82, 0.25)" : "none",
                    }}
                    onClick={() => setActiveSupplierTab(s.supplierId)}
                  >
                    <span>{s.supplierName}</span>
                    <span style={{
                      marginLeft: 6,
                      padding: "1px 6px",
                      borderRadius: 10,
                      fontSize: 11,
                      background: isSelected ? "rgba(255,255,255,0.25)" : "#e2eae5",
                      color: isSelected ? "#fff" : "#1d7a52"
                    }}>
                      {sMeds.length} meds · {sCats.length} cats
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Supplier Details Card */}
          {(() => {
            const selectedSupplier = data.suppliers.find((s) => s.supplierId === (activeSupplierTab ?? data.suppliers[0]?.supplierId)) || data.suppliers[0];
            if (!selectedSupplier) return null;
            const sMeds = getSupplierProvidedMedicines(selectedSupplier, data.medicines, catalogVersion);
            const sCats = getSupplierCategories(selectedSupplier, data.medicines, data.categories, catalogVersion);
            return (
              <div style={{ background: "#fbfcfb", border: "1px solid #e2ebe6", borderRadius: 12, padding: 16 }}>
                {/* Supplier summary banner */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, borderBottom: "1px solid #eef2f0", paddingBottom: 14, marginBottom: 14 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#19211d" }}>{selectedSupplier.supplierName}</span>
                      <span style={{ padding: "2px 8px", background: "#eaf6ef", color: "#1d7a52", fontSize: 11, fontWeight: 600, borderRadius: 12, border: "1px solid #c8e7d6" }}>
                        Supplier #{selectedSupplier.supplierId}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#6d7771", marginTop: 3 }}>
                      Contact: {selectedSupplier.contactPerson || "Not provided"} {selectedSupplier.contactNumber ? `· ${selectedSupplier.contactNumber}` : ""} {selectedSupplier.email ? `· ${selectedSupplier.email}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(role === "admin" || role === "staff") && (
                      <>
                        <button
                          type="button"
                          className="button button-green"
                          style={{ fontSize: 12, padding: "0 12px", minHeight: 32 }}
                          onClick={() => {
                            const firstMed = sMeds[0] || data.medicines[0];
                            setPoModal({ supplierId: selectedSupplier.supplierId, supplierName: selectedSupplier.supplierName });
                            setFilterBySupplierOnly(true);
                            setPoCategoryFilter("all");
                            setPoForm({ notes: "", expectedAt: "", status: "Ordered", items: firstMed ? [createDefaultPoLine(firstMed)] : [] });
                          }}
                        >
                          <PackagePlus size={14} /> Order from {selectedSupplier.supplierName}
                        </button>
                        <button
                          type="button"
                          className="button"
                          style={{ fontSize: 12, padding: "0 12px", minHeight: 32 }}
                          onClick={() => setManageCatalogSupplier(selectedSupplier)}
                        >
                          <Pencil size={13} /> Customize catalog
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Categories Division list */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#48534e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <Tags size={13} color="#1d7a52" />
                    Categories Divided to this Supplier ({sCats.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {sCats.map(({ category, medicines: cMeds }) => (
                      <div
                        key={category.categoryId}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: "#ffffff",
                          border: "1px solid #d5e2da",
                          fontSize: 12,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
                        }}
                      >
                        <span style={{ fontWeight: 650, color: "#1d7a52" }}>{category.categoryName}</span>
                        <span style={{ background: "#eef6f1", color: "#1d7a52", padding: "1px 6px", borderRadius: 10, fontSize: 10.5, fontWeight: 700 }}>
                          {cMeds.length} med{cMeds.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Medicines grouped by category */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#48534e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Boxes size={13} color="#1d7a52" />
                    Medicines by Category ({sMeds.length} total)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
                    {sCats.map(({ category, medicines: cMeds }) => (
                      <div key={category.categoryId} style={{ background: "#ffffff", border: "1px solid #e1e9e4", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0f4f2", paddingBottom: 6, marginBottom: 8 }}>
                          <strong style={{ fontSize: 13, color: "#19211d" }}>{category.categoryName}</strong>
                          <span style={{ fontSize: 11, color: "#7a8580", background: "#f2f7f4", padding: "1px 7px", borderRadius: 8 }}>
                            {cMeds.length} item{cMeds.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {cMeds.map((med) => (
                            <div key={med.medicineId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0" }}>
                              <div>
                                <div style={{ fontWeight: 600, color: "#222" }}>{med.brandName}</div>
                                <div style={{ fontSize: 11, color: "#8a948e" }}>{med.genericName} · {med.dosage || "No dosage"}</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontWeight: 650, color: "#1d7a52" }}>{money(med.price)}</div>
                                <div style={{ fontSize: 10, color: "#8a948e" }}>{med.stockQty} in stock</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* Supplier directory table */}
      <section className="panel table-panel" style={{ marginBottom: 16 }}>
        <div className="panel-title-row" style={{ padding: "16px 19px 0" }}>
          <div><h3>Supplier directory</h3><p>{data.suppliers.length} active suppliers</p></div>
        </div>
        <div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search suppliers and contacts…" /><span className="table-count">{data.suppliers.length} records loaded</span></div>
        {data.suppliers.filter((row) => matchingText([row.supplierId, row.supplierName, row.contactPerson, row.contactNumber, row.email, row.address, row.status])).length === 0 ? <Empty title="No supplier records" text="Supplier records will appear when returned by your API." icon={<Building2 size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Supplier</th><th>Categories provided</th><th>Contact person</th><th>Contact number</th><th>Email</th><th>Address</th><th>Status</th><th>POs</th><th>Actions</th></tr></thead><tbody>{data.suppliers.filter((row) => matchingText([row.supplierId, row.supplierName, row.contactPerson, row.contactNumber, row.email, row.address, row.status])).slice((page - 1) * 8, page * 8).map((row) => {
          const supplierPos = data.purchaseOrders.filter((po) => po.supplierId === row.supplierId);
          const activePos = supplierPos.filter((po) => ["ordered", "partiallyreceived"].includes(po.status.toLowerCase()));
          const sCats = getSupplierCategories(row, data.medicines, data.categories, catalogVersion);
          return <tr key={row.supplierId}><td><span className="cell-primary">{row.supplierName}</span><span className="cell-secondary">Supplier ID {row.supplierId}</span></td><td><div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 220 }}>{sCats.slice(0, 4).map(({ category, medicines: cMeds }) => <span key={category.categoryId} style={{ fontSize: 10.5, padding: "2px 6px", background: "#f0f7f3", color: "#1d7a52", borderRadius: 6, border: "1px solid #d4e7dc", whiteSpace: "nowrap" }}>{category.categoryName} ({cMeds.length})</span>)}{sCats.length > 4 && <span style={{ fontSize: 10, color: "#7a8580", padding: "2px 4px" }}>+{sCats.length - 4} more</span>}</div></td><td>{row.contactPerson || "Not provided"}</td><td>{row.contactNumber || "Not provided"}</td><td>{row.email || "Not provided"}</td><td><span className="record-detail">{row.address || "Not provided"}</span></td><td><Status value={row.status} /></td><td><span className="cell-primary">{supplierPos.length} total</span><span className="cell-secondary">{activePos.length} active</span></td><td><div className="cell-actions">{(role === "admin" || role === "staff") && <><button className="table-action" style={{ background: "#eef7f2", color: "#1d7a52", borderColor: "#c5e0d2" }} onClick={() => { const supplierMeds = getSupplierProvidedMedicines(row, data.medicines, catalogVersion); const firstMed = supplierMeds[0] || data.medicines[0]; setPoModal({ supplierId: row.supplierId, supplierName: row.supplierName }); setFilterBySupplierOnly(true); setPoCategoryFilter("all"); setPoForm({ notes: "", expectedAt: "", status: "Ordered", items: firstMed ? [createDefaultPoLine(firstMed)] : [] }); }} title="Create purchase order"><PackagePlus size={13} />Order stock</button><button className="table-action" onClick={() => setManageCatalogSupplier(row)} title="Manage medicines provided by this supplier"><Boxes size={13} />Catalog ({getSupplierProvidedMedicines(row, data.medicines, catalogVersion).length})</button><button className="table-action" onClick={() => setEditor({ kind: "supplier", item: row })}><Pencil size={13} /></button><button className="table-action danger" onClick={() => void deleteRecord("supplier", row.supplierId)}><Trash2 size={13} /></button></>}</div></td></tr>;
        })}</tbody></table></div>}
        <Pager count={data.suppliers.filter((row) => matchingText([row.supplierId, row.supplierName, row.contactPerson, row.contactNumber, row.email, row.address, row.status])).length} page={page} setPage={setPage} />
      </section>
      {/* Purchase Orders panel */}
      <section className="panel table-panel">
        <div className="panel-title-row" style={{ padding: "16px 19px 0" }}>
          <div><h3>Purchase orders</h3><p>{data.purchaseOrders.length} total · {data.purchaseOrders.filter((po) => ["ordered", "partiallyreceived"].includes(po.status.toLowerCase())).length} in transit</p></div>
          {(role === "admin" || role === "staff") && data.suppliers.length > 0 && <button className="button button-green" onClick={() => { const first = data.suppliers[0]; const supplierMeds = getSupplierProvidedMedicines(first, data.medicines, catalogVersion); const firstMed = supplierMeds[0] || data.medicines[0]; setPoModal({ supplierId: first.supplierId, supplierName: first.supplierName }); setFilterBySupplierOnly(true); setPoCategoryFilter("all"); setPoForm({ notes: "", expectedAt: "", status: "Ordered", items: firstMed ? [createDefaultPoLine(firstMed)] : [] }); }}><PackagePlus size={14} />New purchase order</button>}
        </div>
        {data.purchaseOrders.length === 0 ? <Empty title="No purchase orders" text="Create a purchase order from a supplier above to replenish your stock." icon={<Truck size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>PO Number</th><th>Supplier</th><th>Status</th><th>Ordered</th><th>Expected</th><th>Notes</th>{(role === "admin" || role === "staff") && <th>Actions</th>}</tr></thead><tbody>{data.purchaseOrders.map((po) => {
          const supplier = data.suppliers.find((s) => s.supplierId === po.supplierId);
          return <tr key={po.purchaseOrderId}><td><span className="cell-primary">{po.purchaseOrderNumber}</span><span className="cell-secondary">PO #{po.purchaseOrderId}</span></td><td>{supplier?.supplierName || `Supplier #${po.supplierId}`}</td><td>{(role === "admin" || role === "staff") ? <div><select className="filter-select status-select" value={po.status} onChange={(e) => void updatePoStatus(po.purchaseOrderId, e.target.value)} aria-label={`Update status for ${po.purchaseOrderNumber}`}>{getNextAllowedPoStatuses(po.status).map((s) => <option key={s}>{s}</option>)}</select><span style={{ display: "block", fontSize: 10, color: po.status.toLowerCase() === "received" ? "#1d7a52" : po.status.toLowerCase() === "cancelled" ? "#c53030" : "#8a928e", marginTop: 3, fontWeight: 500 }}>{getPoStatusStepLabel(po.status)}</span></div> : <Status value={po.status} />}</td><td>{dateShort(po.orderedAt)}</td><td>{po.expectedAt ? dateShort(po.expectedAt) : <span style={{ color: "#a0a8a4" }}>Not set</span>}</td><td><span className="record-detail">{po.notes || "—"}</span></td>{(role === "admin" || role === "staff") && <td><div className="cell-actions"><button className="table-action" onClick={() => void openViewPo(po)} title="View items in this purchase order"><Eye size={13} />Items</button><button className="table-action danger" onClick={() => deletePurchaseOrder(po.purchaseOrderId)} title="Delete purchase order"><Trash2 size={13} /></button></div></td>}</tr>;
        })}</tbody></table></div>}
      </section>
    </>}

    {!loading && section === "orders" && <>
      <PageHeading title={navTitle.orders} description={pageDescription.orders} actions={<button className="button" onClick={refresh}><Activity size={14} />Refresh</button>} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search order, customer, item, address…" /><select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{[...new Set(data.orders.map((row) => row.orderStatus))].filter(Boolean).map((status) => <option key={status} value={status.toLowerCase()}>{status}</option>)}</select><span className="table-count">{filteredOrders.length} of {data.orders.length} loaded</span></div>
        {filteredOrders.length === 0 ? <Empty title="No orders to show" text="Orders returned by the API will appear here. Change the status filter to see other records." icon={<ClipboardList size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Order / customer</th><th>Date / status</th><th>All order items</th><th>Total / payment label</th><th>Delivery address</th>{(role === "admin" || role === "staff") && <th>Actions</th>}</tr></thead><tbody>{filteredOrders.slice((page - 1) * 8, page * 8).map((row) => <tr key={row.orderId}><td><span className="cell-primary">Order #{row.orderId}</span><span className="cell-secondary">{getCustomerDisplay(row.userId)}</span></td><td>{date(row.orderDate)}<span className="cell-secondary"><Status value={row.orderStatus} /></span></td><td>{row.items.length ? row.items.map((item, index) => { const medicine = data.medicines.find((record) => record.medicineId === item.medicineId); return <span className="order-item-line" key={`${row.orderId}-${item.orderItemId || item.medicineId}-${index}`}><strong>{item.brandName || medicine?.brandName || `Medicine #${item.medicineId}`}</strong> · {item.genericName || medicine?.genericName || "Generic name unavailable"}<span className="cell-secondary">Line item #{item.orderItemId || "not returned"} · Order #{item.orderId || row.orderId} · Medicine ID {item.medicineId} · {item.quantity} × {money(item.unitPrice)} = {money(item.subtotal)}</span></span>; }) : <span className="record-detail">No order-item rows included in this response.</span>}</td><td><span className="cell-primary">{money(row.totalAmount)}</span><span className="cell-secondary">{row.paymentMethod || "Payment label not provided"}</span></td><td><span className="record-detail">{row.deliveryAddress || "Address not provided"}</span></td>{(role === "admin" || role === "staff") && <td><div className="cell-actions">{(role === "admin" || role === "staff") && <select className="filter-select status-select" aria-label={`Update order ${row.orderId} status`} value={row.orderStatus} onChange={(event) => void setOrderStatus(row.orderId, event.target.value)}>{["Pending", "Processing", "Ready", "Delivered", "Completed", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select>}{role === "admin" && <button className="table-action danger" title="Delete order" onClick={() => void deleteRecord("order", row.orderId)}><Trash2 size={13} /></button>}</div></td>}</tr>)}</tbody></table></div>}
        <Pager count={filteredOrders.length} page={page} setPage={setPage} />
      </section></>}
    {!loading && section === "users" && <>
      <PageHeading title="People & accounts" description="" actions={<button className="button button-green" onClick={() => setEditor({ kind: "user" })}><Plus size={15} />Add user</button>} />

      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search name, username, email, or ID…" /><span className="table-count">{data.users.length} users loaded</span></div>
        {data.users.filter((row) => matchingText([row.userId, row.firstName, row.lastName, row.username, row.email, row.contactNumber, labelForRole(row.roleId)])).length === 0 ? <Empty title="No user records available" text="The API may require an administrator token for this section." icon={<Users size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Contact number</th><th>Role</th><th>Account created</th><th>Actions</th></tr></thead><tbody>{data.users.filter((row) => matchingText([row.userId, row.firstName, row.lastName, row.username, row.email, row.contactNumber, labelForRole(row.roleId)])).slice((page - 1) * 8, page * 8).map((row) => { const rowAvatar = localStorage.getItem(`profile_avatar_${row.userId}`); const rowInitials = ((row.firstName?.[0] || "") + (row.lastName?.[0] || "")).toUpperCase() || (row.username?.[0] || "?").toUpperCase(); return <tr key={row.userId}><td><div style={{ display: "flex", alignItems: "center", gap: 9 }}>{rowAvatar ? <img src={rowAvatar} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid #e8eae8" }} /> : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#e5f4ed", color: "#126b57", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, border: "1.5px solid #c9e0d4" }}>{rowInitials}</div>}<span className="cell-primary">{row.firstName} {row.lastName}</span></div></td><td>{row.username}</td><td>{row.email || "Not provided"}</td><td>{row.contactNumber || "Not provided"}</td><td><Status value={labelForRole(row.roleId)} /></td><td>{date(row.createdAt)}</td><td><div className="cell-actions"><button className="table-action" onClick={() => setEditor({ kind: "user", item: row })}><Pencil size={13} />Edit</button><button className="table-action danger" onClick={() => void deleteRecord("user", row.userId)}><Trash2 size={13} /></button></div></td></tr>; })}</tbody></table></div>}
        <Pager count={data.users.filter((row) => matchingText([row.userId, row.firstName, row.lastName, row.username, row.email, row.contactNumber, labelForRole(row.roleId)])).length} page={page} setPage={setPage} />
      </section></>}
    {!loading && section === "roles" && <>
      <PageHeading title="Role definitions" description="" actions={<button className="button button-green" onClick={() => setEditor({ kind: "role" })}><Plus size={15} />Add role</button>} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search role names…" /><span className="table-count">{data.roles.length} role definitions</span></div><div className="table-wrap"><table><thead><tr><th>Role ID</th><th>Role name</th><th>Current app mapping</th><th>Actions</th></tr></thead><tbody>{data.roles.filter((row) => matchingText([row.userRoleId, row.userRole])).slice((page - 1) * 10, page * 10).map((row) => <tr key={row.userRoleId}><td>{row.userRoleId}</td><td className="cell-primary">{row.userRole}</td><td>{row.userRoleId === 1 ? "Administrator" : row.userRoleId === 2 ? "Staff / mod" : row.userRoleId === 3 ? "Customer / user" : "Unmapped role"}</td><td><div className="cell-actions"><button className="table-action" onClick={() => setEditor({ kind: "role", item: row })}><Pencil size={13} /></button><button className="table-action danger" onClick={() => void deleteRecord("role", row.userRoleId)}><Trash2 size={13} /></button></div></td></tr>)}</tbody></table></div><Pager count={data.roles.filter((row) => matchingText([row.userRoleId, row.userRole])).length} page={page} setPage={setPage} pageSize={10} /></section></>}
    {!loading && section === "activity" && <>
      <PageHeading title={navTitle.activity} description={role === "admin" ? "API full-text search covers activity and IP address. Unfiltered results use the API's date-descending paginated endpoint; matching search results are paged here because the API search returns a list." : ""} actions={<button className="button" onClick={refresh}><Activity size={14} />Refresh activity</button>} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={(value) => { setTableSearch(value); setPage(1); }} placeholder={role === "admin" ? "Search activity description or IP…" : "Search my activity entries…"} /><span className="table-count">{number(activityResultCount)} {activitySearchQuery ? "matching" : "log"} entries{apiAdminActivity && !activitySearchQuery ? " · API paginated" : ""}</span></div>{activityLoading ? <Empty title="Loading activity" text="Requesting audit records from the API…" icon={<Activity size={22} />} /> : activityVisibleRows.length === 0 ? <Empty title="No activity entries" text="The API did not return activity records for this role or search." icon={<Activity size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Log ID</th><th>Date and time</th><th>User ID</th><th>Full activity</th><th>IP address</th></tr></thead><tbody>{activityVisibleRows.map((row) => <tr key={row.logId}><td className="cell-primary">#{row.logId}</td><td>{date(row.activityDate)}</td><td>{row.userId}</td><td><span className="record-detail">{row.activity}</span></td><td>{row.ipAddress || "Not recorded"}</td></tr>)}</tbody></table></div>}<Pager count={activityResultCount} page={page} setPage={setPage} pageSize={10} /></section></>}
    {!loading && section === "shop" && <>
      <PageHeading title="Browse medicines" description={pageDescription.shop} actions={<button className="button" onClick={() => setLocation("/customer/cart")}><ShoppingCart size={15} />Cart · {data.cart.length}</button>} />
      <div className="table-toolbar panel" style={{ marginBottom: 13 }}>
        <SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search brand, generic, or description…" />
        <select className="filter-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {data.categories.map((row) => (
            <option key={row.categoryId} value={row.categoryId}>{row.categoryName}</option>
          ))}
        </select>
        <select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="no_stock">No stock</option>
        </select>
        <span className="table-count">{filteredMedicines.length} {filteredMedicines.length === 1 ? "medicine" : "medicines"} available</span>
      </div>
      {filteredMedicines.length === 0 ? (
        <section className="panel">
          <Empty title="No medicines match your search" text="Try searching for another medicine name or selecting a different category." icon={<ShoppingBag size={22} />} />
        </section>
      ) : (
        <div className="shop-grid">
          {filteredMedicines.slice((page - 1) * 12, page * 12).map((row) => {
            const stockInfo = getCustomerStockStatus(row);
            return (
              <article
                className={`panel product-card ${stockInfo.key === "no_stock" ? "product-card-out" : ""}`}
                key={row.medicineId}
                tabIndex={0}
                role="button"
                aria-label={`View details for ${row.brandName}`}
                onClick={() => setSelectedMedicine(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedMedicine(row);
                  }
                }}
              >
                <div className="product-art">
                  <MedicineCardImage image={row.image} brandName={row.brandName} />
                </div>
                <div className="product-content">
                  <div className="product-header">
                    <h3 className="product-title" title={row.brandName}>{row.brandName}</h3>
                    <CustomerStockBadge status={stockInfo.status} />
                  </div>
                  <div className="product-bottom">
                    <span className="product-price">{money(row.price)}</span>
                    <div className="product-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="button button-small"
                        disabled={!stockInfo.isOrderable}
                        title={stockInfo.isOrderable ? "Buy now" : "Out of stock"}
                        onClick={(e) => {
                          e.stopPropagation();
                          addCart(row).then(() => setLocation("/customer/cart"));
                        }}
                      >
                        <ShoppingBag size={13} />Buy
                      </button>
                      <button
                        type="button"
                        className="button button-green button-small"
                        disabled={!stockInfo.isOrderable}
                        title={stockInfo.isOrderable ? "Add to cart" : "Out of stock"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void addCart(row);
                        }}
                      >
                        <Plus size={13} />Add
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: 12 }}><Pager count={filteredMedicines.length} page={page} setPage={setPage} pageSize={12} /></div>
    </>}
    {!loading && section === "cart" && <>
      <PageHeading title="Your medicine cart" description="Review full item details and quantities before creating an order." actions={<button className="button" onClick={() => setLocation("/customer/shop")}><ShoppingBag size={14} />Continue browsing</button>} />
      {data.cart.length === 0 ? <section className="panel"><Empty title="Your cart is empty" text="Browse available medicines and add an item to get started." icon={<ShoppingCart size={22} />} /><div style={{ textAlign: "center", padding: "0 0 22px" }}><button className="button button-green" onClick={() => setLocation("/customer/shop")}>Browse medicines <ArrowRight size={14} /></button></div></section> : <div className="cart-layout"><section className="panel panel-pad"><div className="panel-title-row"><div><h3>Items in this cart</h3><p>{data.cart.length} distinct medicine records</p></div><button className="table-action danger" onClick={() => void clearCart()}>Clear cart</button></div>{data.cart.slice((page - 1) * 8, page * 8).map((item) => { const medicine = data.medicines.find((row) => row.medicineId === item.medicineId); const unitPrice = medicine?.price ?? item.subtotal / Math.max(1, item.quantity); return <div className="cart-item" key={item.cartId}><div className="mini-icon"><img src={medicineImageSrc(medicine?.image)} alt="" onError={(event) => { event.currentTarget.src = MEDICINE_PLACEHOLDER; }} /></div><div className="list-copy"><strong>{medicine?.brandName || `Medicine #${item.medicineId}`}</strong><span>{medicine?.genericName || "Generic name not returned"} · {medicine ? getCategory(data.categories, medicine.categoryId) : "Category unavailable"}</span><span>{medicine?.dosage || "Dosage not supplied"} · Added {date(item.addedAt)}</span><span>Cart ID {item.cartId} · Account ID {item.userId}</span><div className="quantity-control" style={{ marginTop: 9 }}><button aria-label="Decrease quantity" onClick={() => void updateCartQuantity(item, item.quantity - 1)}>−</button><span>{item.quantity}</span><button aria-label="Increase quantity" onClick={() => void updateCartQuantity(item, item.quantity + 1)}>+</button><span style={{ marginLeft: 8, color: "#77817b" }}>{money(unitPrice)} each</span></div></div><div style={{ textAlign: "right" }}><strong>{money(unitPrice * item.quantity)}</strong><span className="cell-secondary">Subtotal</span><button className="table-action danger" style={{ marginTop: 8 }} onClick={() => void removeCart(item)}><Trash2 size={13} />Remove</button></div></div>; })}<Pager count={data.cart.length} page={page} setPage={setPage} /></section><aside className="panel panel-pad"><div className="panel-title-row"><div><h3>Order summary</h3><p>Price totals use the current medicine record.</p></div></div><div className="checkout-summary"><div className="summary-line"><span>Items ({data.cart.reduce((total, row) => total + row.quantity, 0)} units)</span><strong>{money(currentCartTotal)}</strong></div><div className="summary-line"><span>Delivery</span><span>Set at checkout</span></div><div className="summary-total"><span>Estimated total</span><strong>{money(currentCartTotal)}</strong></div><div className="inline-alert"><CircleAlert size={14} /><span>This API records a payment-method label only. Checkout here does not collect or charge payment.</span></div><button className="button button-green" onClick={openCheckout}><Check size={14} />Continue to checkout</button></div></aside></div>}
    </>}
    {!loading && section === "profile" && <div className="profile-page-container">
      <PageHeading title="My profile" description={role === "customer" ? "Review and update your account details and delivery address." : "Review and update your account details."} />
      {!data.profile ? <section className="panel"><Empty title="Profile unavailable" text="The API did not return this profile. Check your account ID, token, and API permissions." icon={<Users size={22} />} /></section> : <section className="panel panel-pad profile-panel">
        <div className="profile-layout">
          <div className="profile-photo-col">
            <div className="profile-photo-card">
              <p className="profile-photo-label">Profile picture</p>
              <div className="profile-avatar-preview">
                {profileMode === "image" && profileImage
                  ? <img src={profileImage} alt="Profile" className="profile-avatar-img" />
                  : <div className="profile-avatar-initials">{(data.profile.firstName?.[0] || data.profile.username?.[0] || "?").toUpperCase()}{(data.profile.lastName?.[0] || "").toUpperCase()}</div>
                }
                <button type="button" className="profile-camera-btn" title="Upload photo" aria-label="Upload profile photo" onClick={() => photoInputRef.current?.click()}>
                  <Camera size={14} />
                </button>
              </div>
              {/* Single hidden file input always in the DOM */}
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="sr-only" />

              {profileMode === "image" && profileImage && <button type="button" className="profile-remove-photo" onClick={() => { setProfileImage(null); setProfileMode("avatar"); if (avatarStorageKey) localStorage.removeItem(avatarStorageKey); if (session?.userId) localStorage.setItem(`profile_mode_${session.userId}`, "avatar"); }}>Remove photo</button>}
              {profileMode === "avatar" && <p className="profile-photo-hint">Your initials are used as your avatar. Switch to Photo to upload a custom image.</p>}
              {profileMode === "image" && !profileImage && <button type="button" className="profile-upload-area" onClick={() => photoInputRef.current?.click()}>
                <ImageIcon size={22} /><span>Click to upload a photo</span><small>JPG, PNG or WEBP</small>
              </button>}
            </div>
          </div>
          <form className="auth-form profile-form-col" onSubmit={saveProfile}>
            <div className="form-grid">
              <div className="form-field"><label>First name</label><input name="firstName" required defaultValue={data.profile.firstName} /></div>
              <div className="form-field"><label>Last name</label><input name="lastName" required defaultValue={data.profile.lastName} /></div>
              <div className="form-field"><label>Email</label><input name="email" type="email" defaultValue={data.profile.email} /></div>
              <div className="form-field"><label>Contact number</label><input name="contactNumber" defaultValue={data.profile.contactNumber || ""} /></div>
              <div className="form-field full"><label>Username</label><input name="username" required defaultValue={data.profile.username} /></div>
              {/* Philippine Address Selector — Region → Province → City → Barangay + Street */}
              <div className="form-field full" style={{ gap: 8 }}>
                <label style={{ marginBottom: 4 }}>Delivery address</label>
                {/* Show currently saved address from database */}
                {(data.profile.region || data.profile.barangay || data.profile.cityMunicipality || data.profile.street) && (
                  <div style={{ padding: "8px 12px", background: "var(--surface-hover, #f0faf5)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "12.5px", color: "var(--text-secondary)", marginBottom: 6 }}>
                    <strong style={{ color: "var(--text-primary)" }}>Currently saved:</strong>{" "}
                    {[data.profile.street, data.profile.barangay, data.profile.cityMunicipality, data.profile.province, data.profile.region].filter(Boolean).join(", ")}
                  </div>
                )}
                <div className="profile-address-grid">
                  {/* Region */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Region</span>
                    <select
                      id="addr-region"
                      value={addrRegion}
                      onChange={(e) => void phSelectRegion(e.target.value)}
                      disabled={phRegions.length === 0}
                      style={{ width: "100%" }}
                    >
                      <option value="">{phRegions.length === 0 ? "Loading regions…" : "— Select Region —"}</option>
                      {phRegions.map((r) => <option key={r.region_code} value={r.region_code}>{r.region_name}</option>)}
                    </select>
                  </div>
                  {/* Province */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Province</span>
                    <select
                      id="addr-province"
                      value={addrProvince}
                      onChange={(e) => void phSelectProvince(e.target.value)}
                      disabled={!addrRegion || phLoading === "provinces"}
                      style={{ width: "100%" }}
                    >
                      <option value="">{phLoading === "provinces" ? "Loading…" : !addrRegion ? "Select region first" : "— Select Province —"}</option>
                      {phProvinces.filter((p) => p.region_code === addrRegion).map((p) => <option key={p.province_code} value={p.province_code}>{p.province_name}</option>)}
                    </select>
                  </div>
                  {/* City / Municipality */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>City / Municipality</span>
                    <select
                      id="addr-city"
                      value={addrCity}
                      onChange={(e) => void phSelectCity(e.target.value)}
                      disabled={!addrProvince || phLoading === "cities"}
                      style={{ width: "100%" }}
                    >
                      <option value="">{phLoading === "cities" ? "Loading…" : !addrProvince ? "Select province first" : "— Select City —"}</option>
                      {phCities.filter((c) => c.province_code === addrProvince).map((c) => <option key={c.city_code} value={c.city_code}>{c.city_name}</option>)}
                    </select>
                  </div>
                  {/* Barangay */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Barangay</span>
                    <select
                      id="addr-barangay"
                      value={addrBarangay}
                      onChange={(e) => setAddrBarangay(e.target.value)}
                      disabled={!addrCity || phLoading === "barangays"}
                      style={{ width: "100%" }}
                    >
                      <option value="">{phLoading === "barangays" ? "Loading barangays…" : !addrCity ? "Select city first" : "— Select Barangay —"}</option>
                      {phBarangays.filter((b) => b.city_code === addrCity).map((b) => <option key={b.brgy_code} value={b.brgy_code}>{b.brgy_name}</option>)}
                    </select>
                  </div>
                  {/* Street / House No. — full width */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>House / Unit No. &amp; Street</span>
                    <input
                      id="addr-street"
                      type="text"
                      placeholder="e.g. 123 Rizal St."
                      value={addrStreet}
                      onChange={(e) => setAddrStreet(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
                {/* Hidden input carries the composed address string for FormData */}
                <input
                  type="hidden"
                  name="address"
                  value={[
                    addrStreet,
                    addrBarangay ? phBarangays.find((b) => b.brgy_code === addrBarangay)?.brgy_name : "",
                    addrCity ? phCities.find((c) => c.city_code === addrCity)?.city_name : "",
                    addrProvince ? phProvinces.find((p) => p.province_code === addrProvince)?.province_name : "",
                    addrRegion ? phRegions.find((r) => r.region_code === addrRegion)?.region_name : "",
                  ].filter(Boolean).join(", ")}
                />
                {(addrRegion || addrCity) && (
                  <p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                    📍 {
                      [
                        addrStreet,
                        addrBarangay ? phBarangays.find((b) => b.brgy_code === addrBarangay)?.brgy_name : "",
                        addrCity ? phCities.find((c) => c.city_code === addrCity)?.city_name : "",
                        addrProvince ? phProvinces.find((p) => p.province_code === addrProvince)?.province_name : "",
                        addrRegion ? phRegions.find((r) => r.region_code === addrRegion)?.region_name : "",
                      ].filter(Boolean).join(", ") || "—"
                    }
                  </p>
                )}
              </div>
            </div>

            <button className="button button-green" type="submit"><Check size={14} />Save profile</button>
          </form>
        </div>
      </section>}
    </div>}
    {!loading && !["overview", "medicines", "inventory", "categories", "suppliers", "orders", "users", "roles", "activity", "shop", "cart", "profile"].includes(section) && <section className="panel"><Empty title="Section not found" text="Use the workspace navigation to choose an available section." /></section>}
    {cropSrc && <CropModal src={cropSrc} onDone={handleCropDone} onCancel={() => setCropSrc(null)} />}


    {editor && <EditorDialog key={`${editor.kind}-${(editor.item as Record<string, unknown> | undefined)?.medicineId ?? (editor.item as Record<string, unknown> | undefined)?.categoryId ?? (editor.item as Record<string, unknown> | undefined)?.supplierId ?? (editor.item as Record<string, unknown> | undefined)?.userId ?? (editor.item as Record<string, unknown> | undefined)?.userRoleId ?? "new"}`} editor={editor} categories={data.categories} roles={data.roles.length ? data.roles : demoRoles} onClose={() => setEditor(null)} onSubmit={(values) => void saveRecord(values)} />}
    {confirmDialog && <ConfirmModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />}
    {checkoutOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div className="modal-head"><div><h2 id="checkout-title">Delivery details</h2><p>We pre-filled your saved profile address. You can edit it or move the pin before placing the order.</p></div><button className="modal-close" onClick={() => setCheckoutOpen(false)} aria-label="Close"><X size={20} /></button></div><form className="auth-form" onSubmit={(event) => void checkout(event)}><div className="form-field"><label htmlFor="delivery-address">Delivery address</label><textarea id="delivery-address" required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Street, city, postal code" /></div><div className="form-field"><AddressMapPicker latitude={deliveryLatitude} longitude={deliveryLongitude} onLocationSelect={(lat, lng) => { setDeliveryLatitude(lat); setDeliveryLongitude(lng); }} /></div><div className="form-field"><label htmlFor="payment-method">Payment method (label only)</label><select id="payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Cash on delivery</option><option>Card at pickup</option><option>Bank transfer</option><option>Other — confirm with pharmacy</option></select></div><div className="inline-alert"><AlertCircle size={15} /><span>No payment is processed by this API. Confirm payment directly with the pharmacy.</span></div><div className="modal-actions"><button className="button" type="button" onClick={() => setCheckoutOpen(false)}>Back</button><button className="button button-green" type="submit"><ShoppingBag size={14} />Place order · {money(currentCartTotal)}</button></div></form></section></div>}
    {poModal && (() => {
      const currentSupplier = data.suppliers.find((s) => s.supplierId === poModal.supplierId);
      const providedMedicines = getSupplierProvidedMedicines(currentSupplier, data.medicines, catalogVersion);
      const supplierCategories = getSupplierCategories(currentSupplier, data.medicines, data.categories, catalogVersion);
      const hasMatched = providedMedicines.length > 0;
      const baseMedicines = (filterBySupplierOnly && hasMatched) ? providedMedicines : data.medicines;
      const displayMedicines = poCategoryFilter !== "all"
        ? baseMedicines.filter((m) => m.categoryId === Number(poCategoryFilter))
        : baseMedicines;

      // Group displayMedicines by category for <optgroup> dropdown
      const groupedForDropdown = (() => {
        const map = new Map<number, Medicine[]>();
        for (const m of displayMedicines) {
          const list = map.get(m.categoryId) || [];
          list.push(m);
          map.set(m.categoryId, list);
        }
        const groups: { categoryId: number; categoryName: string; medicines: Medicine[] }[] = [];
        map.forEach((meds, catId) => {
          const cat = data.categories.find((c) => c.categoryId === catId);
          groups.push({ categoryId: catId, categoryName: cat?.categoryName || `Category #${catId}`, medicines: meds });
        });
        groups.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
        return groups;
      })();

      const addPoLine = () => {
        const existingIds = new Set(poForm.items.map((it) => it.medicineId));
        const nextMed = displayMedicines.find((m) => !existingIds.has(m.medicineId)) || displayMedicines[0] || data.medicines[0];
        if (nextMed) {
          setPoForm((f) => ({
            ...f,
            items: [...f.items, createDefaultPoLine(nextMed)],
          }));
        }
      };
      const removePoLine = (index: number) => setPoForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
      const updatePoLine = (index: number, patch: Partial<PoItem>) =>
        setPoForm((f) => ({ ...f, items: f.items.map((item, i) => i === index ? { ...item, ...patch } : item) }));
      const poTotal = poForm.items.reduce((sum, item) => {
        const med = data.medicines.find((m) => m.medicineId === item.medicineId);
        const supplierPrice = med?.price ?? item.unitCost;
        const multiplier = item.packageMultiplier || 1;
        return sum + item.qty * supplierPrice * multiplier;
      }, 0);
      return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPoModal(null); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="po-modal-title" style={{ maxWidth: 780, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-head" style={{ position: "sticky", top: 0, background: "#fff", zIndex: 2, borderBottom: "1px solid #eef0ee" }}>
              <div><h2 id="po-modal-title">New purchase order</h2><p>Order stock from <strong>{poModal.supplierName}</strong>.</p></div>
              <button className="modal-close" onClick={() => setPoModal(null)} aria-label="Close"><X size={20} /></button>
            </div>
            <div style={{ padding: "20px 24px 0" }}>
              {/* Supplier Selection Cards */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#2d3832", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Building2 size={14} color="#1d7a52" />
                  Select Supplier to Order From:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(190px, 1fr))`, gap: 8 }}>
                  {data.suppliers.map((s) => {
                    const isSelected = s.supplierId === poModal.supplierId;
                    const sMeds = getSupplierProvidedMedicines(s, data.medicines, catalogVersion);
                    const sCats = getSupplierCategories(s, data.medicines, data.categories, catalogVersion);
                    return (
                      <button
                        key={s.supplierId}
                        type="button"
                        onClick={() => {
                          const first = sMeds[0] || data.medicines[0];
                          setPoModal({ supplierId: s.supplierId, supplierName: s.supplierName });
                          setPoCategoryFilter("all");
                          if (first) {
                            setPoForm((f) => ({
                              ...f,
                              items: [createDefaultPoLine(first)],
                            }));
                          }
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: 4,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: isSelected ? "2px solid #1d7a52" : "1px solid #dbe2de",
                          background: isSelected ? "#f0f8f4" : "#ffffff",
                          cursor: "pointer",
                          textAlign: "left",
                          boxShadow: isSelected ? "0 2px 8px rgba(29, 122, 82, 0.12)" : "none",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? "#1d7a52" : "#222" }}>
                            {s.supplierName}
                          </span>
                          {isSelected && (
                            <span style={{ background: "#1d7a52", color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                              ✓
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: isSelected ? "#2d6349" : "#717a75" }}>
                          {sMeds.length} medicines · {sCats.length} categories
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Expected delivery and Order Notes fields */}
              <div className="form-grid" style={{ marginBottom: 16 }}>
                <div className="form-field">
                  <label htmlFor="po-expected">Expected delivery <span style={{ color: "#9fa7a3", fontWeight: 400 }}>(optional)</span></label>
                  <input id="po-expected" type="date" value={poForm.expectedAt} onChange={(e) => setPoForm((f) => ({ ...f, expectedAt: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label htmlFor="po-notes">Order Notes <span style={{ color: "#9fa7a3", fontWeight: 400 }}>(optional)</span></label>
                  <input id="po-notes" type="text" placeholder="Special delivery instructions or reference notes…" value={poForm.notes} onChange={(e) => setPoForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>

              {/* Supplier catalog indicator and toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, background: "#f0f8f4", border: "1px solid #cce8da", borderRadius: 10, padding: "8px 12px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                  <Truck size={15} color="#1d7a52" />
                  <span>
                    {hasMatched ? (
                      <><strong>{currentSupplier?.supplierName}</strong> provides <strong>{providedMedicines.length}</strong> medicines across <strong>{supplierCategories.length}</strong> categories</>
                    ) : (
                      <>No pre-assigned medicines for <strong>{currentSupplier?.supplierName}</strong></>
                    )}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {hasMatched && (
                    <button
                      type="button"
                      className="button button-small"
                      style={{ fontSize: 11, padding: "0 9px", minHeight: 26, background: filterBySupplierOnly ? "#1d7a52" : "#fff", color: filterBySupplierOnly ? "#fff" : "#2d3330", borderColor: filterBySupplierOnly ? "#1d7a52" : "#cce8da", fontWeight: 600 }}
                      onClick={() => setFilterBySupplierOnly(!filterBySupplierOnly)}
                    >
                      {filterBySupplierOnly ? `✓ Only ${currentSupplier?.supplierName || "supplier"} medicines (${providedMedicines.length})` : `Show all medicines (${data.medicines.length})`}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-small"
                    style={{ fontSize: 11, padding: "0 9px", minHeight: 26 }}
                    onClick={() => setManageCatalogSupplier(currentSupplier || null)}
                    title="Customize which medicines this supplier can provide"
                  >
                    <Pencil size={11} /> Edit supplier's catalog
                  </button>
                </div>
              </div>

              {/* Category filter pills for this supplier */}
              {hasMatched && supplierCategories.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14, padding: "8px 12px", background: "#f8fbf9", border: "1px solid #dce8e1", borderRadius: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#45534c", display: "flex", alignItems: "center", gap: 5 }}>
                    <Tags size={12} color="#1d7a52" /> Filter category:
                  </span>
                  <button
                    type="button"
                    className="button button-small"
                    style={{
                      fontSize: 11,
                      padding: "2px 9px",
                      minHeight: 24,
                      background: poCategoryFilter === "all" ? "#1d7a52" : "#fff",
                      color: poCategoryFilter === "all" ? "#fff" : "#2d3330",
                      borderColor: poCategoryFilter === "all" ? "#1d7a52" : "#cce0d5",
                      fontWeight: poCategoryFilter === "all" ? 650 : 500,
                    }}
                    onClick={() => setPoCategoryFilter("all")}
                  >
                    All ({baseMedicines.length})
                  </button>
                  {supplierCategories.map(({ category, medicines: catMeds }) => (
                    <button
                      key={category.categoryId}
                      type="button"
                      className="button button-small"
                      style={{
                        fontSize: 11,
                        padding: "2px 9px",
                        minHeight: 24,
                        background: poCategoryFilter === String(category.categoryId) ? "#1d7a52" : "#fff",
                        color: poCategoryFilter === String(category.categoryId) ? "#fff" : "#2d3330",
                        borderColor: poCategoryFilter === String(category.categoryId) ? "#1d7a52" : "#cce0d5",
                        fontWeight: poCategoryFilter === String(category.categoryId) ? 650 : 500,
                      }}
                      onClick={() => setPoCategoryFilter(String(category.categoryId))}
                    >
                      {category.categoryName} ({catMeds.length})
                    </button>
                  ))}
                </div>
              )}

              {/* Medicine line items */}
              <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 13, fontWeight: 650 }}>Order items</strong>
                  <span style={{ color: "#8a928e", fontSize: 11, marginLeft: 8 }}>{poForm.items.length} medicine{poForm.items.length !== 1 ? "s" : ""}</span>
                </div>
                <button type="button" className="button" style={{ padding: "0 12px", minHeight: 30, fontSize: 12 }} onClick={addPoLine}>
                  <Plus size={13} /> Add medicine
                </button>
              </div>

              {poForm.items.length === 0 ? (
                <div style={{ border: "2px dashed #e4e8e5", borderRadius: 12, padding: "22px 16px", textAlign: "center", color: "#a0a8a4", fontSize: 12, marginBottom: 20 }}>
                  <PackagePlus size={22} style={{ marginBottom: 6, opacity: 0.5 }} />
                  <div>No medicines added yet. Click <strong>Add medicine</strong> to start building your order.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                  {/* Header row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1.3fr 75px 140px", gap: 10, padding: "0 4px" }}>
                    <span style={{ fontSize: 11, color: "#8a928e", fontWeight: 700 }}>MEDICINE ({filterBySupplierOnly && hasMatched ? "FROM THIS SUPPLIER" : "CATALOG"})</span>
                    <span style={{ fontSize: 11, color: "#8a928e", fontWeight: 700 }}>PACKAGING UNIT</span>
                    <span style={{ fontSize: 11, color: "#8a928e", fontWeight: 700, textAlign: "center" }}>QTY</span>
                    <span style={{ fontSize: 11, color: "#8a928e", fontWeight: 700 }}>SUPPLIER COST</span>
                  </div>
                  {poForm.items.map((item, index) => {
                    const med = data.medicines.find((m) => m.medicineId === item.medicineId);
                    const opts = getPackagingOptions(med);
                    const currentOpt = opts.find((o) => o.key === item.packageType) || opts[0];
                    const supplierBasePrice = med?.price ?? item.unitCost ?? 0;
                    const multiplier = currentOpt.multiplier || 1;
                    const packagePrice = supplierBasePrice * multiplier;
                    const totalUnits = item.qty * multiplier;
                    const lineTotal = item.qty * packagePrice;

                    return (
                      <div
                        key={index}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.7fr 1.3fr 75px 140px",
                          gap: 10,
                          alignItems: "start",
                          background: "#f8fbf9",
                          border: "1px solid #e1e9e3",
                          borderRadius: 10,
                          padding: "12px 14px",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                        }}
                      >
                        {/* 1. Medicine picker */}
                        <div>
                          <select
                            value={item.medicineId}
                            style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
                            onChange={(e) => {
                              const nextId = Number(e.target.value);
                              const selectedMed = displayMedicines.find((m) => m.medicineId === nextId) || data.medicines.find((m) => m.medicineId === nextId);
                              const newOpts = getPackagingOptions(selectedMed);
                              updatePoLine(index, {
                                medicineId: nextId,
                                unitCost: selectedMed?.price ?? 0,
                                packageType: newOpts[0].key,
                                packageMultiplier: newOpts[0].multiplier,
                              });
                            }}
                          >
                            {groupedForDropdown.map((group) => (
                              <optgroup key={group.categoryId} label={`📂 ${group.categoryName} (${group.medicines.length})`}>
                                {group.medicines.map((m) => (
                                  <option key={m.medicineId} value={m.medicineId}>
                                    {m.brandName} — {m.genericName} · {money(m.price)}{m.manufacturer ? ` · ${m.manufacturer}` : ""}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          {med && (
                            <span style={{ fontSize: 10.5, color: "#7a8580", marginTop: 4, display: "block", lineHeight: 1.4 }}>
                              Category: <strong>{getCategory(data.categories, med.categoryId)}</strong> · Stock: <strong>{med.stockQty}</strong> units
                              {med.dosage ? ` · ${med.dosage}` : ""}
                              {med.manufacturer ? ` · Mfg: ${med.manufacturer}` : ""}
                            </span>
                          )}
                        </div>

                        {/* 2. Packaging Unit (Per Tablet/Capsule, 1 Strip/Pack, 1 Box, 1 Case) */}
                        <div>
                          <select
                            value={item.packageType || currentOpt.key}
                            style={{ width: "100%", fontSize: 12, padding: "6px 8px", background: "#fff" }}
                            onChange={(e) => {
                              const chosen = opts.find((o) => o.key === e.target.value) || opts[0];
                              updatePoLine(index, {
                                packageType: chosen.key,
                                packageMultiplier: chosen.multiplier,
                              });
                            }}
                          >
                            {opts.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <span style={{ fontSize: 10, color: "#617067", marginTop: 4, display: "block" }}>
                            Pack of <strong>{multiplier}</strong> {currentOpt.shortLabel}{multiplier !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* 3. Quantity of packages to order */}
                        <div>
                          <input
                            type="number"
                            min={1}
                            value={item.qty}
                            style={{ fontSize: 13, textAlign: "center", width: "100%", padding: "6px 4px" }}
                            onChange={(e) => updatePoLine(index, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          />
                          <span style={{ fontSize: 10, color: "#617067", marginTop: 4, display: "block", textAlign: "center" }}>
                            {multiplier > 1 ? `${totalUnits} pcs` : "unit"}
                          </span>
                        </div>

                        {/* 4. Unit Cost: FIXED Supplier Price (Non-editable) */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 2 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                            <strong style={{ fontSize: 13, color: "#19241f" }}>{money(packagePrice)}</strong>
                            <span style={{ fontSize: 10.5, color: "#7a8580" }}>/{currentOpt.shortLabel}</span>
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, color: "#1d7a52", background: "#eaf5ee", border: "1px solid #cce5d5", borderRadius: 4, padding: "1px 5px", width: "fit-content", fontWeight: 650 }}>
                            <Lock size={9} /> Fixed supplier price
                          </div>
                          {multiplier > 1 && (
                            <span style={{ fontSize: 10, color: "#8a948e" }}>
                              {money(supplierBasePrice)} / {currentOpt.shortLabel}
                            </span>
                          )}
                        </div>

                        {/* Line subtotal & remove bar */}
                        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, marginTop: 4, borderTop: "1px dashed #dbe5de", fontSize: 11 }}>
                          <span style={{ color: "#4d5b54", display: "flex", alignItems: "center", gap: 5 }}>
                            📦 Replenishment: <strong>{item.qty} × {currentOpt.label}</strong> → will add <strong>+{totalUnits} {currentOpt.shortLabel}s</strong> to inventory upon receipt
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ color: "#1d7a52", fontWeight: 700, fontSize: 13 }}>
                              Line total: {money(lineTotal)}
                            </span>
                            <button
                              type="button"
                              className="table-action danger"
                              style={{
                                height: 28,
                                padding: "0 10px",
                                fontSize: 11.5,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                borderRadius: 6,
                                border: "1px solid #f2c7c7",
                                background: "#fff5f5",
                                color: "#c53030",
                                cursor: "pointer",
                                fontWeight: 600,
                                transition: "all 0.15s ease",
                              }}
                              onClick={() => removePoLine(index)}
                              title="Remove this medicine from order"
                              aria-label="Remove item"
                            >
                              <Trash2 size={13} />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Order total row */}
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "8px 4px 0", borderTop: "1px solid #edf0ed" }}>
                    <span style={{ fontSize: 12, color: "#6b7874" }}>Estimated order total</span>
                    <strong style={{ fontSize: 16, letterSpacing: "-0.4px" }}>{money(poTotal)}</strong>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 9, paddingBottom: 24, paddingTop: 4 }}>
                <button type="button" className="button" onClick={() => setPoModal(null)} style={{ minHeight: 36, padding: "0 15px" }}>Cancel</button>
                <button type="button" className="button button-green" disabled={poSubmitting || poForm.items.length === 0} onClick={() => void savePurchaseOrder()} style={{ minHeight: 36, padding: "0 18px", fontWeight: 600 }}>
                  {poSubmitting ? "Saving…" : <><PackagePlus size={14} />Create order · {poForm.items.length} item{poForm.items.length !== 1 ? "s" : ""}</>}
                </button>
              </div>
            </div>
          </section>
        </div>
      );
    })()}
    {viewPo && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewPo(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="view-po-title" style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-head">
          <div>
            <h2 id="view-po-title">Purchase Order {viewPo.po.purchaseOrderNumber}</h2>
            <p>
              Supplier: <strong>{data.suppliers.find((s) => s.supplierId === viewPo.po.supplierId)?.supplierName || `Supplier #${viewPo.po.supplierId}`}</strong> · <Status value={viewPo.po.status} />
            </p>
          </div>
          <button className="modal-close" onClick={() => setViewPo(null)} aria-label="Close"><X size={20} /></button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, background: "#f8faf8", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
            <div><span style={{ color: "#77817b", display: "block", fontSize: 11 }}>ORDERED DATE</span><strong>{date(viewPo.po.orderedAt)}</strong></div>
            <div><span style={{ color: "#77817b", display: "block", fontSize: 11 }}>EXPECTED DELIVERY</span><strong>{viewPo.po.expectedAt ? dateShort(viewPo.po.expectedAt) : "Not set"}</strong></div>
            <div><span style={{ color: "#77817b", display: "block", fontSize: 11 }}>RECEIVED DATE</span><strong>{viewPo.po.receivedAt ? dateShort(viewPo.po.receivedAt) : "Pending"}</strong></div>
          </div>
          {viewPo.po.notes && (
            <div style={{ fontSize: 12, color: "#4d5652", background: "#fcfbf7", border: "1px solid #faeccb", padding: "8px 12px", borderRadius: 8, marginBottom: 16 }}>
              <strong>Notes:</strong> {viewPo.po.notes}
            </div>
          )}

          <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ fontSize: 13, margin: 0, fontWeight: 650 }}>Order items</h4>
            <span style={{ fontSize: 12, color: "#77817b" }}>{viewPo.items.length} item{viewPo.items.length !== 1 ? "s" : ""}</span>
          </div>

          {viewPo.loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#8a928e" }}><span className="spinner" style={{ marginRight: 8 }} />Loading order items…</div>
          ) : viewPo.items.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#8a928e", background: "#fafafa", borderRadius: 8, fontSize: 12 }}>
              No line items recorded for this purchase order.
            </div>
          ) : (
            <div className="table-wrap" style={{ border: "1px solid #edf0ed", borderRadius: 8, marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Ordered Qty</th>
                    <th>Received Qty</th>
                    <th>Unit Cost</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewPo.items.map((item) => {
                    const med = data.medicines.find((m) => m.medicineId === item.medicineId);
                    return (
                      <tr key={item.purchaseOrderItemId}>
                        <td>
                          <span className="cell-primary">{med?.brandName || `Medicine #${item.medicineId}`}</span>
                          <span className="cell-secondary">{med?.genericName || "—"}</span>
                        </td>
                        <td><strong>{item.quantityOrdered}</strong> units</td>
                        <td>{item.quantityReceived} units</td>
                        <td>{money(item.unitCost)}</td>
                        <td><strong>{money(item.quantityOrdered * item.unitCost)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="button button-green" onClick={() => setViewPo(null)}>Close</button>
          </div>
        </div>
      </section>
    </div>}
    {manageCatalogSupplier && (
      <SupplierCatalogModal
        supplier={manageCatalogSupplier}
        allMedicines={data.medicines}
        categories={data.categories}
        onClose={() => setManageCatalogSupplier(null)}
        onSave={(count) => {
          setCatalogVersion((v) => v + 1);
          setManageCatalogSupplier(null);
          notify(`Catalog updated for ${manageCatalogSupplier.supplierName} (${count} medicines).`);
        }}
      />
    )}
    {selectedMedicine && (
      <MedicineDetailsModal
        medicine={selectedMedicine}
        categories={data.categories}
        suppliers={data.suppliers}
        catalogVersion={catalogVersion}
        onClose={() => setSelectedMedicine(null)}
        onBuy={(med) => {
          setSelectedMedicine(null);
          addCart(med).then(() => setLocation("/customer/cart"));
        }}
        onAdd={(med) => {
          void addCart(med);
        }}
      />
    )}
    {toast && <div className={`toast-message ${toast.error ? "error" : ""}`} role={toast.error ? "alert" : "status"}>{toast.text}</div>}
  </AppShell>;
}

function Overview({ role, data, userName, lowStock, unavailable, pendingOrders, recordedValue, availableProducts, go }: { role: RoleName; data: SectionData; userName: string; lowStock: Medicine[]; unavailable: Medicine[]; pendingOrders: Order[]; recordedValue: number; availableProducts: Medicine[]; go: (path: string) => void }) {
  const lastWeek = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setDate(day.getDate() - (6 - index)); day.setHours(0, 0, 0, 0);
    const next = new Date(day); next.setDate(day.getDate() + 1);
    const total = data.orders.filter((order) => { const timestamp = new Date(order.orderDate).getTime(); return timestamp >= day.getTime() && timestamp < next.getTime() && !["cancelled", "rejected"].some((status) => order.orderStatus.toLowerCase().includes(status)); }).reduce((sum, order) => sum + order.totalAmount, 0);
    return { label: day.toLocaleDateString("en", { weekday: "short" }), total };
  });
  const maxBar = Math.max(1, ...lastWeek.map((day) => day.total));
  const inventoryUnits = data.medicines.reduce((sum, item) => sum + Math.max(0, item.stockQty), 0);
  const inventoryValue = data.medicines.reduce((sum, item) => sum + Math.max(0, item.stockQty) * Math.max(0, item.price), 0);
  const ordersByRecent = [...data.orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5);
  const topMedicines = (role === "customer" ? availableProducts : [...lowStock, ...unavailable]).slice(0, 5);
  const customerOrderCount = data.orders.length;
  const customerSpend = data.orders.filter((order) => order.orderStatus.toLowerCase() === "completed").reduce((sum, order) => sum + order.totalAmount, 0);
  const statusBreakdown = [...new Set(data.orders.map((order) => order.orderStatus || "Unknown"))].map((status) => `${status}: ${number(data.orders.filter((order) => (order.orderStatus || "Unknown") === status).length)}`).join(" · ") || "No order records returned";
  const latestActivity = [...data.activity].sort((a, b) => Date.parse(b.activityDate) - Date.parse(a.activityDate))[0];
  const activitySummary = latestActivity ? `Latest activity: ${latestActivity.activity} · ${date(latestActivity.activityDate)} · user ${latestActivity.userId}${latestActivity.ipAddress ? ` · IP ${latestActivity.ipAddress}` : ""}` : "No recent activity records returned";
  const areaCounts = data.orders.reduce((acc, order) => {
    let area = "Unknown";
    if (order.deliveryAddress) {
      const parts = order.deliveryAddress.split(",");
      area = parts[parts.length - 1].trim();
      area = area.replace(/\s+/g, " ").toLowerCase();
      area = area.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
    if (area !== "Unknown" && area !== "") acc[area] = (acc[area] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const sortedAreas = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]);
  const totalOrdersWithArea = sortedAreas.reduce((sum, [_, count]) => sum + count, 0);

  return <>
    {role === "customer" && <div className="customer-welcome"><div><h2>Hello, {userName}</h2><p>Browse available medicines, keep an eye on your orders, and review your cart.</p></div><button className="button" onClick={() => go("/customer/shop")}><ShoppingBag size={14} />Browse medicines</button></div>}
    <PageHeading title={role === "admin" ? "Pharmacy overview" : role === "staff" ? "Today at the pharmacy" : "Your activity"} description={role === "customer" ? "A complete view of your orders, cart, and available catalog." : ""} actions={<span className="status-pill status-neutral">Updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>} />
    <div className="metric-grid">{role === "admin" ? <>
      <Metric label="Medicine records" value={number(data.medicines.length)} note={`${number(inventoryUnits)} on-hand units · ${lowStock.length} low stock · ${unavailable.length} unavailable`} icon={<Boxes size={16} />} />
      <Metric label="Inventory value" value={money(inventoryValue)} note="Current stock × listed price; display currency is not converted" icon={<PackagePlus size={16} />} tone="good" />
      <Metric label="Orders in progress" value={number(pendingOrders.length)} note="Pending, processing, or ready" icon={<ClipboardList size={16} />} tone={pendingOrders.length ? "warn" : "normal"} />
      <Metric label="Recorded order value" value={money(recordedValue)} note="Non-cancelled order totals returned" icon={<ArrowUpRight size={16} />} tone="good" />
    </> : role === "staff" ? <>
      <Metric label="Orders to process" value={number(pendingOrders.length)} note="Current pending / processing / ready records" icon={<ClipboardList size={16} />} tone={pendingOrders.length ? "warn" : "good"} />
      <Metric label="Medicine records" value={number(data.medicines.length)} note="Complete catalog records loaded" icon={<Boxes size={16} />} />
      <Metric label="Low stock" value={number(lowStock.length)} note="Dashboard threshold: ≤ 20 units" icon={<AlertCircle size={16} />} tone={lowStock.length ? "warn" : "good"} />
      <Metric label="Unavailable" value={number(unavailable.length)} note="Out of stock or marked unavailable" icon={<ArrowDownRight size={16} />} tone={unavailable.length ? "warn" : "good"} />
    </> : <>
      <Metric label="My orders" value={number(customerOrderCount)} note="Orders returned for this account" icon={<ClipboardList size={16} />} />
      <Metric label="Cart items" value={number(data.cart.reduce((sum, item) => sum + item.quantity, 0))} note={`${data.cart.length} distinct medicine records`} icon={<ShoppingCart size={16} />} />
      <Metric label="Completed order total" value={money(customerSpend)} note="Completed orders returned by the API" icon={<Check size={16} />} tone="good" />
      <Metric label="Available medicines" value={number(availableProducts.length)} note="Current catalog records with stock" icon={<ShoppingBag size={16} />} />
    </>}</div>
    <div className="dashboard-grid"><div className="primary-stack">
      <section className="panel panel-pad"><div className="panel-title-row"><div><h3>{role === "customer" ? "Your order value" : "Order activity"}</h3><p>Daily order totals · last 7 calendar days · cancelled orders excluded</p></div></div><div className="chart-total"><strong>{money(lastWeek.reduce((sum, day) => sum + day.total, 0))}</strong><span>Recorded in this range</span></div><div className="overview-chart">{lastWeek.map((day, index) => <div className="chart-column" key={`${day.label}-${index}`} title={`${day.label}: ${money(day.total)}`}><div className={`chart-bar ${index === lastWeek.length - 1 ? "selected" : ""}`} style={{ height: `${Math.max(day.total ? 11 : 3, (day.total / maxBar) * 83)}%` }} /><span className="chart-label">{day.label}</span></div>)}</div></section>
      {role !== "customer" && <section className="panel panel-pad"><div className="panel-title-row"><div><h3>Recent orders</h3><p>Each row includes every returned line item and order field.</p></div><button className="sub-action" onClick={() => go(`/${role}/orders`)}>All orders →</button></div>{ordersByRecent.length ? <div className="list-stack">{ordersByRecent.map((order) => { const customerUser = data.users.find((u) => u.userId === order.userId); return <div className="list-row" key={order.orderId}><div className="mini-icon"><ClipboardList size={17} /></div><div className="list-copy"><strong>Order #{order.orderId} · {customerUser?.username || `ID ${order.userId}`}</strong><span>{date(order.orderDate)} · {order.items.length} line items{order.paymentMethod ? ` · ${order.paymentMethod}` : ""}</span><span>{order.items.map((item) => `${item.brandName || `Medicine #${item.medicineId}`} × ${item.quantity} (${money(item.subtotal)})`).join(" · ") || "No item details included"}</span><span>{order.deliveryAddress || "Delivery address not provided"}</span></div><div className="list-trailing">{money(order.totalAmount)}<div style={{ marginTop: 6 }}><Status value={order.orderStatus} /></div></div></div>; })}</div> : <Empty title="No orders returned" text="The orders endpoint has no records available for this role." icon={<ClipboardList size={20} />} />}</section>}
      {role === "admin" && <section className="panel panel-pad"><div className="panel-title-row"><div><h3>Popular delivery areas</h3><p>Top 5 locations by order volume · {data.orders.filter((o) => o.deliveryAddress).length} orders with address</p></div><div className="metric-icon"><MapPin size={16} /></div></div><DeliveryAreaMap orders={data.orders} users={data.users} /></section>}
      {role === "customer" && <section className="panel panel-pad"><div className="panel-title-row"><div><h3>Your recent orders</h3><p>Full item/status/address details are available in My orders.</p></div><button className="sub-action" onClick={() => go("/customer/orders")}>All orders →</button></div>{data.orders.length ? <div className="list-stack">{ordersByRecent.map((order) => <div className="list-row" key={order.orderId}><div className="mini-icon"><ClipboardList size={17} /></div><div className="list-copy"><strong>Order #{order.orderId} · {order.items.map((item) => item.brandName || `#${item.medicineId}`).join(", ") || "Items unavailable"}</strong><span>{date(order.orderDate)} · {order.items.length} items · {order.deliveryAddress || "Address not provided"}</span></div><div className="list-trailing">{money(order.totalAmount)}<div style={{ marginTop: 6 }}><Status value={order.orderStatus} /></div></div></div>)}</div> : <Empty title="No orders yet" text="Your orders will appear here after checkout." icon={<ClipboardList size={20} />} />}</section>}
    </div><aside className="support-stack">
      <section className="panel panel-pad"><div className="panel-title-row"><div><h3>{role === "customer" ? "Available medicines" : "Stock attention"}</h3><p>{role === "customer" ? "Available catalog records" : `${lowStock.length} low stock · ${unavailable.length} unavailable`}</p></div><button className="sub-action" onClick={() => go(role === "customer" ? "/customer/shop" : `/${role}/${role === "staff" ? "inventory" : "medicines"}`)}>{role === "customer" ? "Browse →" : "Inventory →"}</button></div>{topMedicines.length ? <div className="list-stack">{topMedicines.map((medicine) => <div className="list-row" key={medicine.medicineId}><div className="mini-icon"><img src={medicineImageSrc(medicine.image)} alt="" onError={(event) => { event.currentTarget.src = MEDICINE_PLACEHOLDER; }} /></div><div className="list-copy"><strong>{medicine.brandName}</strong><span>{medicine.genericName}{role !== "customer" ? ` · ID ${medicine.medicineId}` : ""}</span><span>{medicine.dosage || "Dosage not provided"}{role !== "customer" && medicine.manufacturer ? ` · ${medicine.manufacturer}` : ""}</span></div><div className="list-trailing">{role === "customer" ? money(medicine.price) : `${number(medicine.stockQty)} units`}<div style={{ marginTop: 6 }}>{role === "customer" ? <CustomerStockBadge status={getCustomerStockStatus(medicine).status} /> : <Status value={medicine.stockQty <= 0 ? "Out of stock" : medicine.stockQty <= 20 ? "Low stock" : medicine.status} />}</div></div></div>)}</div> : <Empty title="No stock records" text="The medicines endpoint has not returned any records." />}</section>
      <section className="panel panel-pad"><div className="panel-title-row"><div><h3>{role === "customer" ? "Cart summary" : "Workspace details"}</h3><p>{role === "customer" ? "Current items before checkout" : "Data scope returned for this role"}</p></div><div className="metric-icon">{role === "customer" ? <ShoppingCart size={16} /> : <FileText size={16} />}</div></div>{role === "customer" ? <div className="checkout-summary"><div className="summary-line"><span>Units</span><strong>{number(data.cart.reduce((sum, item) => sum + item.quantity, 0))}</strong></div><div className="summary-line"><span>Distinct records</span><strong>{number(data.cart.length)}</strong></div><div className="summary-total"><span>Current total</span><strong>{money(data.cart.reduce((sum, item) => sum + cartLineSubtotal(item, data.medicines), 0))}</strong></div><button className="button button-green" onClick={() => go("/customer/cart")}>Open cart <ArrowRight size={14} /></button></div> : <div className="list-stack"><div className="list-row"><div className="mini-icon"><Boxes size={16} /></div><div className="list-copy"><strong>{number(data.medicines.length)} medicine records</strong><span>{number(data.medicines.reduce((sum, item) => sum + item.stockQty, 0))} total units listed</span></div></div><div className="list-row"><div className="mini-icon"><Tags size={16} /></div><div className="list-copy"><strong>{number(data.categories.length)} categories</strong><span>{number(data.suppliers.length)} supplier profiles available</span></div></div><div className="list-row"><div className="mini-icon"><Activity size={16} /></div><div className="list-copy"><strong>{number(data.activity.length)} activity entries</strong><span>{role === "admin" ? "All records returned to admin" : "Current user's records returned by API"}</span></div></div></div>}</section>
    </aside></div>
  </>;
}
