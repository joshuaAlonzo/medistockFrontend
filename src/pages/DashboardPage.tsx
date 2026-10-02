import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, Building2, Check, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, Clock3, FileText, Map, MapPin, PackagePlus, Pencil, Plus, Search, ShieldCheck, ShoppingBag, ShoppingCart, Tags, Trash2, Truck, Users, X } from "lucide-react";
import AppShell from "../components/AppShell";
import { useAuth } from "../contexts/AuthContext";
import { api, getActivity, getAllUsers, getCart, getCategories, getCustomerOrders, getDisplayCurrency, getMedicines, getOrders, getRoles, getSuppliers, getUser, getUserActivity, labelForRole, searchActivity, type ActivityLog, type CartItem, type Category, type Medicine, type Order, type PageResult, type RoleName, type Session, type Supplier, type UserRecord, type UserRole } from "../lib/pharmacyApi";
import { demoActivity, demoCart, demoCategories, demoMedicines, demoOrders, demoRoles, demoSuppliers, demoUsers } from "../lib/demoData";

type SectionData = {
  medicines: Medicine[]; categories: Category[]; suppliers: Supplier[]; orders: Order[];
  cart: CartItem[]; users: UserRecord[]; roles: UserRole[]; activity: ActivityLog[]; profile: UserRecord | null;
};
const EMPTY: SectionData = { medicines: [], categories: [], suppliers: [], orders: [], cart: [], users: [], roles: [], activity: [], profile: null };
const ROLE_SECTIONS: Record<RoleName, readonly string[]> = {
  admin: ["overview", "medicines", "categories", "suppliers", "orders", "users", "roles", "activity"],
  staff: ["overview", "medicines", "categories", "suppliers", "orders", "activity"],
  customer: ["overview", "shop", "cart", "orders", "profile"],
};
type EditorKind = "medicine" | "category" | "supplier" | "user" | "role";
type EditorState = { kind: EditorKind; item?: Medicine | Category | Supplier | UserRecord | UserRole };

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: getDisplayCurrency(), maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const number = (value: number) => new Intl.NumberFormat("en-PH").format(Number.isFinite(value) ? value : 0);
const date = (value?: string | null) => value ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
const dateShort = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";
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
    { key: "image", label: "Image URL", full: true }, { key: "description", label: "Description", type: "textarea", full: true },
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
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><div className="modal-head"><div><h2 id="editor-title">{title}</h2><p>Enter all available record details. Values are sent to your configured API.</p></div><button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div><form onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}><div className="form-grid">{fields.map((field) => <div className={`form-field ${field.full ? "full" : ""}`} key={field.key}><label htmlFor={`edit-${field.key}`}>{field.label}</label>{field.type === "textarea" ? <textarea id={`edit-${field.key}`} required={field.required} value={values[field.key] || ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} /> : field.type === "select" || field.type === "category" || field.type === "role" ? <select id={`edit-${field.key}`} required={field.required} value={values[field.key] || ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>{field.type !== "select" && <option value="">Choose…</option>}{(field.type === "category" ? categories.map((row) => ({ value: String(row.categoryId), label: row.categoryName })) : field.type === "role" ? roles.map((row) => ({ value: String(row.userRoleId), label: `${row.userRole} · ${row.userRoleId}` })) : field.options!.map((option) => ({ value: option, label: option }))).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input id={`edit-${field.key}`} type={field.type || "text"} min={field.type === "number" ? "0" : undefined} step={field.key === "price" ? "0.01" : undefined} required={field.required} value={values[field.key] || ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />}</div>)}</div><div className="modal-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button button-green"><Check size={14} />Save record</button></div></form></section></div>;
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
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityMatches, setActivityMatches] = useState<ActivityLog[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityRefresh, setActivityRefresh] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash on delivery");
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
      const next: SectionData = { medicines: [...demoMedicines], categories: [...demoCategories], suppliers: [...demoSuppliers], orders: sampleOrders, cart: role === "customer" ? [...demoCart] : [], users: [...demoUsers], roles: [...demoRoles], activity: role === "staff" ? demoActivity.filter((row) => row.userId === session.userId) : [...demoActivity], profile: role === "customer" ? { userId: session.userId, firstName: "Sample", lastName: "Customer", email: "customer@example.test", contactNumber: "+63 917 000 0000", username: session.username, roleId: 3, createdAt: "2026-09-01T08:00:00Z" } : null };
      setData(next); setActivityTotal(next.activity.length); setActivityMatches(null); setErrors([]); setLoading(false); return;
    }
    if (!session) { setData(EMPTY); setActivityTotal(0); setActivityMatches(null); setErrors(["No active session. Sign in to connect the API."]); setLoading(false); return; }

    const [medicines, categories, suppliers, orders, users, roles, activity, cart, customerOrders, profile] = await Promise.all([
      safely("Medicines", getMedicines, [] as Medicine[]),
      safely("Categories", getCategories, [] as Category[]),
      role !== "customer" ? safely("Suppliers", getSuppliers, [] as Supplier[]) : Promise.resolve([] as Supplier[]),
      role !== "customer" ? safely("Orders", getOrders, [] as Order[]) : Promise.resolve([] as Order[]),
      role === "admin" ? safely("Users", getAllUsers, [] as UserRecord[]) : Promise.resolve([] as UserRecord[]),
      role === "admin" ? safely("Roles", getRoles, [] as UserRole[]) : Promise.resolve([] as UserRole[]),
      role === "admin" ? safely("Activity log", () => getActivity(1, 10), { items: [] as ActivityLog[], totalCount: 0, pageSize: 10, currentPage: 1 } as PageResult<ActivityLog>) : role === "staff" ? safely("My activity", () => getUserActivity(session.userId), [] as ActivityLog[]) : Promise.resolve([] as ActivityLog[]),
      role === "customer" && session.userId ? safely("Cart", () => getCart(session.userId), [] as CartItem[]) : Promise.resolve([] as CartItem[]),
      role === "customer" && session.userId ? safely("Orders", () => getCustomerOrders(session.userId), [] as Order[]) : Promise.resolve([] as Order[]),
      role === "customer" && session.userId ? safely("Profile", () => getUser(session.userId), null as UserRecord | null) : Promise.resolve(null as UserRecord | null),
    ]);
    const activityRows = Array.isArray(activity) ? activity : activity.items;
    const loadedActivityTotal = Array.isArray(activity) ? activityRows.length : activity.totalCount;
    setData({ medicines, categories, suppliers, orders: role === "customer" ? customerOrders : orders, cart, users, roles, activity: activityRows, profile });
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

  const notify = (text: string, error = false) => setToast({ text, error });
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

  async function deleteRecord(kind: "medicine" | "category" | "supplier" | "user" | "role" | "order", id: number) {
    if (!window.confirm(`Delete ${kind} #${id}? This action cannot be undone.`)) return;
    if (kind === "medicine") await commit("Medicine deleted", () => api.deleteMedicine(id), () => setData((old) => ({ ...old, medicines: old.medicines.filter((row) => row.medicineId !== id) })));
    if (kind === "category") await commit("Category deleted", () => api.deleteCategory(id), () => setData((old) => ({ ...old, categories: old.categories.filter((row) => row.categoryId !== id) })));
    if (kind === "supplier") await commit("Supplier deleted", () => api.deleteSupplier(id), () => setData((old) => ({ ...old, suppliers: old.suppliers.filter((row) => row.supplierId !== id) })));
    if (kind === "user") await commit("User deleted", () => api.deleteUser(id), () => setData((old) => ({ ...old, users: old.users.filter((row) => row.userId !== id) })));
    if (kind === "role") await commit("Role deleted", () => api.deleteRole(id), () => setData((old) => ({ ...old, roles: old.roles.filter((row) => row.userRoleId !== id) })));
    if (kind === "order") await commit("Order deleted", () => api.deleteOrder(id), () => setData((old) => ({ ...old, orders: old.orders.filter((row) => row.orderId !== id) })));
  }

  async function setOrderStatus(orderId: number, next: string) {
    const demoAction = () => setData((old) => ({ ...old, orders: old.orders.map((row) => row.orderId === orderId ? { ...row, orderStatus: next } : row) }));
    await commit(`Order #${orderId} status updated`, () => api.updateOrderStatus(orderId, next), demoAction);
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

  async function clearCart() {
    if (!window.confirm("Remove every item from your cart? This cannot be undone.")) return;
    await commit("Cart cleared", () => api.clearCart(session!.userId), () => setData((old) => ({ ...old, cart: [] })));
  }

  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (!deliveryAddress.trim()) { notify("Enter a delivery address before checkout.", true); return; }
    const placed = await commit("Order placed", () => api.checkout(session!.userId, paymentMethod, deliveryAddress.trim()), () => {
      const items = data.cart.map((item) => { const medicine = data.medicines.find((row) => row.medicineId === item.medicineId); return { orderId: Date.now(), medicineId: item.medicineId, quantity: item.quantity, unitPrice: medicine?.price || 0, subtotal: cartLineSubtotal(item, data.medicines), brandName: medicine?.brandName, genericName: medicine?.genericName }; });
      const totalAmount = data.cart.reduce((total, item) => total + cartLineSubtotal(item, data.medicines), 0);
      setData((old) => ({ ...old, cart: [], orders: [{ orderId: Date.now(), userId: session!.userId, orderDate: new Date().toISOString(), totalAmount, paymentMethod, deliveryAddress: deliveryAddress.trim(), orderStatus: "Pending", items }, ...old.orders] }));
    });
    if (placed) setCheckoutOpen(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const payload = { firstName: String(form.get("firstName") || ""), lastName: String(form.get("lastName") || ""), email: String(form.get("email") || ""), contactNumber: String(form.get("contactNumber") || ""), username: String(form.get("username") || "").trim(), roleId: session?.roleId ?? 3 };
    await commit("Profile updated", () => api.updateUser(session!.userId, payload), () => setData((old) => ({ ...old, profile: { ...(old.profile || { userId: session!.userId, createdAt: new Date().toISOString() }), ...payload } })));
  }

  const navTitle: Record<string, string> = { overview: "Overview", medicines: role === "staff" ? "Inventory" : "Medicines", categories: "Categories", suppliers: "Suppliers", orders: role === "customer" ? "My orders" : "Orders", users: "People", roles: "Roles", activity: role === "staff" ? "My activity" : "Activity log", shop: "Browse medicines", cart: "My cart", profile: "My profile" };
  const pageDescription: Record<string, string> = { overview: "Your pharmacy, at a glance.", medicines: "Complete medicine details, availability, and stock controls.", categories: "Organize the medicine catalog by category.", suppliers: "Supplier contact records available in the pharmacy API.", orders: "Review every order, line item, address, payment label, and status.", users: "Manage available account profiles and role assignments.", roles: "Review and maintain API role definitions.", activity: "Audit details returned by the pharmacy API.", shop: "Search the catalog and inspect the medicine information returned by the API.", cart: "Review each item, change quantities, and continue to checkout.", profile: "Review and update your supported account details." };

  const filteredMedicines = data.medicines.filter((row) => matchingText([row.brandName, row.genericName, row.description, row.dosage, row.manufacturer, row.status, row.medicineId]) && (categoryFilter === "all" || String(row.categoryId) === categoryFilter) && (statusFilter === "all" || (statusFilter === "low" ? row.stockQty > 0 && row.stockQty <= 20 : statusFilter === "out" ? row.stockQty <= 0 || row.status.toLowerCase().includes("out") : statusFilter === "available" ? row.stockQty > 0 && !row.status.toLowerCase().includes("inactive") : row.status.toLowerCase() === statusFilter)));
  const filteredOrders = data.orders.filter((row) => matchingText([row.orderId, row.userId, row.orderStatus, row.paymentMethod, row.deliveryAddress, row.items.map((item) => `${item.brandName} ${item.genericName} ${item.quantity}`).join(" ")]) && (statusFilter === "all" || row.orderStatus.toLowerCase() === statusFilter));
  const apiAdminActivity = role === "admin" && section === "activity" && session?.mode === "api";
  const activitySearchQuery = `${search} ${tableSearch}`.trim();
  const activityRows = apiAdminActivity ? activitySearchQuery ? activityMatches || [] : data.activity : data.activity.filter((row) => matchingText([row.logId, row.userId, row.activity, row.activityDate, row.ipAddress]));
  const activityVisibleRows = apiAdminActivity && !activitySearchQuery ? activityRows : activityRows.slice((page - 1) * 10, page * 10);
  const activityResultCount = apiAdminActivity && !activitySearchQuery ? activityTotal : activityRows.length;

  if (!ROLE_SECTIONS[role].includes(section)) return <AppShell role={role} session={session!} onLogout={logout} search={search} onSearch={setSearch}><Notice errors={errors} onSettings={goSettings} /><section className="panel panel-pad permission-panel"><ShieldCheck size={24} /><h2>This section isn't available for your workspace role</h2><p>Use the navigation for the sections assigned to your account. Restricted records and controls are not loaded here.</p><button className="button button-green" onClick={() => setLocation(`/${role}`)}>Return to overview</button></section></AppShell>;

  return <AppShell role={role} session={session!} onLogout={logout} search={search} onSearch={setSearch}>
    <Notice errors={errors} onSettings={goSettings} />
    {loading && <div className="panel loading-state"><span className="spinner" />Loading pharmacy workspace…</div>}
    {!loading && section === "overview" && <Overview role={role} data={data} userName={session?.username || "there"} lowStock={lowStock} unavailable={unavailable} pendingOrders={pendingOrders} recordedValue={recordedValue} availableProducts={availableProducts} go={setLocation} />}
    {!loading && (section === "medicines" || section === "inventory") && <>
      <PageHeading title={navTitle.medicines} description={pageDescription.medicines} actions={(role === "admin" || role === "staff") ? <button className="button button-green" onClick={() => setEditor({ kind: "medicine" })}><Plus size={15} />Add medicine</button> : undefined} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search brand, generic, manufacturer…" /><select className="filter-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{data.categories.map((row) => <option key={row.categoryId} value={row.categoryId}>{row.categoryName}</option>)}</select><select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All stock states</option><option value="available">Available</option><option value="low">Low stock ≤ 20</option><option value="out">Out of stock</option></select><span className="table-count">{filteredMedicines.length} matching · {data.medicines.length} loaded</span></div>
        {filteredMedicines.length === 0 ? <Empty title="No medicines found" text="Change the filters or add a medicine record." /> : <><div className="table-wrap"><table><thead><tr><th>Medicine record</th><th>Category</th><th>Dosage / manufacturer</th><th>Price</th><th>Stock</th><th>Status</th><th>Dates</th><th>Actions</th></tr></thead><tbody>{filteredMedicines.slice((page - 1) * 8, page * 8).map((row) => <tr key={row.medicineId}><td><div className="medicine-cell"><img src={row.image || "/medicine-placeholder.svg"} alt="" onError={(event) => { event.currentTarget.src = "/medicine-placeholder.svg"; }} /><span><span className="cell-primary">{row.brandName || "Unnamed medicine"}</span><span className="cell-secondary">{row.genericName || "Generic name not provided"} · ID {row.medicineId}</span><span className="record-detail">{row.description || "No description supplied."}{row.image ? <><br />Image: {row.image}</> : ""}</span></span></div></td><td>{getCategory(data.categories, row.categoryId)}<span className="cell-secondary">Category ID {row.categoryId || "—"}</span></td><td>{row.dosage || "Not provided"}<span className="cell-secondary">{row.manufacturer || "Manufacturer not provided"}</span></td><td className="cell-primary">{money(row.price)}</td><td><strong>{number(row.stockQty)}</strong><span className="cell-secondary">units</span></td><td><Status value={row.status || (row.stockQty > 0 ? "Available" : "Out of stock")} /></td><td>{dateShort(row.updatedAt)}<span className="cell-secondary">Created {dateShort(row.createdAt)}<br />Updated {date(row.updatedAt)}</span></td><td><div className="cell-actions">{(role === "admin" || role === "staff") && <button className="table-action" onClick={() => setEditor({ kind: "medicine", item: row })} title="Edit medicine"><Pencil size={13} />Edit</button>}{role === "admin" && <button className="table-action danger" onClick={() => void deleteRecord("medicine", row.medicineId)} title="Delete medicine"><Trash2 size={13} /></button>}</div></td></tr>)}</tbody></table></div><Pager count={filteredMedicines.length} page={page} setPage={setPage} /></>}

      </section></>}
    {!loading && section === "categories" && <>
      <PageHeading title="Medicine categories" description="Every category available to group and filter the catalog." actions={(role === "admin" || role === "staff") ? <button className="button button-green" onClick={() => setEditor({ kind: "category" })}><Plus size={15} />Add category</button> : undefined} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Find a category…" /><span className="table-count">{data.categories.length} categories loaded</span></div>
        {data.categories.filter((row) => matchingText([row.categoryId, row.categoryName])).length === 0 ? <Empty title="No categories available" text="Categories returned by the API will appear here." icon={<Tags size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Category ID</th><th>Category name</th><th>Medicines in category</th><th>Actions</th></tr></thead><tbody>{data.categories.filter((row) => matchingText([row.categoryId, row.categoryName])).slice((page - 1) * 10, page * 10).map((row) => <tr key={row.categoryId}><td className="cell-primary">{row.categoryId}</td><td><span className="cell-primary">{row.categoryName}</span></td><td>{data.medicines.filter((medicine) => medicine.categoryId === row.categoryId).length} records</td><td><div className="cell-actions">{(role === "admin" || role === "staff") && <><button className="table-action" onClick={() => setEditor({ kind: "category", item: row })}><Pencil size={13} />Edit</button><button className="table-action danger" onClick={() => void deleteRecord("category", row.categoryId)}><Trash2 size={13} /></button></>}</div></td></tr>)}</tbody></table></div>}
        <Pager count={data.categories.filter((row) => matchingText([row.categoryId, row.categoryName])).length} page={page} setPage={setPage} pageSize={10} />
      </section></>}
    {!loading && section === "suppliers" && <>
      <PageHeading title="Supplier directory" description="Full supplier contacts and statuses. The API does not link supplier records directly to medicine stock." actions={(role === "admin" || role === "staff") ? <button className="button button-green" onClick={() => setEditor({ kind: "supplier" })}><Plus size={15} />Add supplier</button> : undefined} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search suppliers and contacts…" /><span className="table-count">{data.suppliers.length} records loaded</span></div>
        {data.suppliers.filter((row) => matchingText([row.supplierId, row.supplierName, row.contactPerson, row.contactNumber, row.email, row.address, row.status])).length === 0 ? <Empty title="No supplier records" text="Supplier records will appear when returned by your API." icon={<Building2 size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Supplier</th><th>Contact person</th><th>Contact number</th><th>Email</th><th>Address</th><th>Status</th><th>Created / updated</th><th>Actions</th></tr></thead><tbody>{data.suppliers.filter((row) => matchingText([row.supplierId, row.supplierName, row.contactPerson, row.contactNumber, row.email, row.address, row.status])).slice((page - 1) * 8, page * 8).map((row) => <tr key={row.supplierId}><td><span className="cell-primary">{row.supplierName}</span><span className="cell-secondary">Supplier ID {row.supplierId}</span></td><td>{row.contactPerson || "Not provided"}</td><td>{row.contactNumber || "Not provided"}</td><td>{row.email || "Not provided"}</td><td><span className="record-detail">{row.address || "Not provided"}</span></td><td><Status value={row.status} /></td><td>{date(row.createdAt)}<span className="cell-secondary">Updated {date(row.updatedAt)}</span></td><td><div className="cell-actions">{(role === "admin" || role === "staff") && <><button className="table-action" onClick={() => setEditor({ kind: "supplier", item: row })}><Pencil size={13} /></button><button className="table-action danger" onClick={() => void deleteRecord("supplier", row.supplierId)}><Trash2 size={13} /></button></>}</div></td></tr>)}</tbody></table></div>}
        <Pager count={data.suppliers.filter((row) => matchingText([row.supplierId, row.supplierName, row.contactPerson, row.contactNumber, row.email, row.address, row.status])).length} page={page} setPage={setPage} />
      </section></>}
    {!loading && section === "orders" && <>
      <PageHeading title={navTitle.orders} description={pageDescription.orders} actions={<button className="button" onClick={refresh}><Activity size={14} />Refresh</button>} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search order, customer, item, address…" /><select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{[...new Set(data.orders.map((row) => row.orderStatus))].filter(Boolean).map((status) => <option key={status} value={status.toLowerCase()}>{status}</option>)}</select><span className="table-count">{filteredOrders.length} of {data.orders.length} loaded</span></div>
        {filteredOrders.length === 0 ? <Empty title="No orders to show" text="Orders returned by the API will appear here. Change the status filter to see other records." icon={<ClipboardList size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Order / customer</th><th>Date / status</th><th>All order items</th><th>Total / payment label</th><th>Delivery address</th><th>Actions</th></tr></thead><tbody>{filteredOrders.slice((page - 1) * 8, page * 8).map((row) => <tr key={row.orderId}><td><span className="cell-primary">Order #{row.orderId}</span><span className="cell-secondary">Customer ID {row.userId}{data.users.length ? ` · ${data.users.find((user) => user.userId === row.userId)?.firstName || ""} ${data.users.find((user) => user.userId === row.userId)?.lastName || ""}` : ""}</span></td><td>{date(row.orderDate)}<span className="cell-secondary"><Status value={row.orderStatus} /></span></td><td>{row.items.length ? row.items.map((item, index) => { const medicine = data.medicines.find((record) => record.medicineId === item.medicineId); return <span className="order-item-line" key={`${row.orderId}-${item.orderItemId || item.medicineId}-${index}`}><strong>{item.brandName || medicine?.brandName || `Medicine #${item.medicineId}`}</strong> · {item.genericName || medicine?.genericName || "Generic name unavailable"}<span className="cell-secondary">Line item #{item.orderItemId || "not returned"} · Order #{item.orderId || row.orderId} · Medicine ID {item.medicineId} · {item.quantity} × {money(item.unitPrice)} = {money(item.subtotal)}</span></span>; }) : <span className="record-detail">No order-item rows included in this response.</span>}</td><td><span className="cell-primary">{money(row.totalAmount)}</span><span className="cell-secondary">{row.paymentMethod || "Payment label not provided"}</span></td><td><span className="record-detail">{row.deliveryAddress || "Address not provided"}</span></td><td><div className="cell-actions">{(role === "admin" || role === "staff") && <select className="filter-select status-select" aria-label={`Update order ${row.orderId} status`} value={row.orderStatus} onChange={(event) => void setOrderStatus(row.orderId, event.target.value)}>{["Pending", "Processing", "Ready", "Completed", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select>}{role === "admin" && <button className="table-action danger" title="Delete order" onClick={() => void deleteRecord("order", row.orderId)}><Trash2 size={13} /></button>}</div></td></tr>)}</tbody></table></div>}
        <Pager count={filteredOrders.length} page={page} setPage={setPage} />
      </section></>}
    {!loading && section === "users" && <>
      <PageHeading title="People & accounts" description="" actions={<button className="button button-green" onClick={() => setEditor({ kind: "user" })}><Plus size={15} />Add user</button>} />

      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search name, username, email, or ID…" /><span className="table-count">{data.users.length} users loaded</span></div>
        {data.users.filter((row) => matchingText([row.userId, row.firstName, row.lastName, row.username, row.email, row.contactNumber, labelForRole(row.roleId)])).length === 0 ? <Empty title="No user records available" text="The API may require an administrator token for this section." icon={<Users size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>User ID / name</th><th>Username</th><th>Email</th><th>Contact number</th><th>Role</th><th>Account created</th><th>Actions</th></tr></thead><tbody>{data.users.filter((row) => matchingText([row.userId, row.firstName, row.lastName, row.username, row.email, row.contactNumber, labelForRole(row.roleId)])).slice((page - 1) * 8, page * 8).map((row) => <tr key={row.userId}><td><span className="cell-primary">{row.firstName} {row.lastName}</span><span className="cell-secondary">User ID {row.userId}</span></td><td>{row.username}</td><td>{row.email || "Not provided"}</td><td>{row.contactNumber || "Not provided"}</td><td><Status value={labelForRole(row.roleId)} /></td><td>{date(row.createdAt)}</td><td><div className="cell-actions"><button className="table-action" onClick={() => setEditor({ kind: "user", item: row })}><Pencil size={13} />Edit</button><button className="table-action danger" onClick={() => void deleteRecord("user", row.userId)}><Trash2 size={13} /></button></div></td></tr>)}</tbody></table></div>}
        <Pager count={data.users.filter((row) => matchingText([row.userId, row.firstName, row.lastName, row.username, row.email, row.contactNumber, labelForRole(row.roleId)])).length} page={page} setPage={setPage} />
      </section></>}
    {!loading && section === "roles" && <>
      <PageHeading title="Role definitions" description="Roles configured in the API. Public sign-up remains fixed to customer role ID 3." actions={<button className="button button-green" onClick={() => setEditor({ kind: "role" })}><Plus size={15} />Add role</button>} />
      <div className="inline-alert" style={{ marginBottom: 13 }}><ShieldCheck size={16} /><span>API role IDs used by this app: 1 admin, 2 mod/staff, 3 user/customer. Changing role definitions does not change the API's claim-based policies.</span></div>
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search role names…" /><span className="table-count">{data.roles.length} role definitions</span></div><div className="table-wrap"><table><thead><tr><th>Role ID</th><th>Role name</th><th>Current app mapping</th><th>Actions</th></tr></thead><tbody>{data.roles.filter((row) => matchingText([row.userRoleId, row.userRole])).slice((page - 1) * 10, page * 10).map((row) => <tr key={row.userRoleId}><td>{row.userRoleId}</td><td className="cell-primary">{row.userRole}</td><td>{row.userRoleId === 1 ? "Administrator" : row.userRoleId === 2 ? "Staff / mod" : row.userRoleId === 3 ? "Customer / user" : "Unmapped role"}</td><td><div className="cell-actions"><button className="table-action" onClick={() => setEditor({ kind: "role", item: row })}><Pencil size={13} /></button><button className="table-action danger" onClick={() => void deleteRecord("role", row.userRoleId)}><Trash2 size={13} /></button></div></td></tr>)}</tbody></table></div><Pager count={data.roles.filter((row) => matchingText([row.userRoleId, row.userRole])).length} page={page} setPage={setPage} pageSize={10} /></section></>}
    {!loading && section === "activity" && <>
      <PageHeading title={navTitle.activity} description={role === "admin" ? "API full-text search covers activity and IP address. Unfiltered results use the API's date-descending paginated endpoint; matching search results are paged here because the API search returns a list." : "Staff activity is limited to the records returned by the current-user API route."} actions={<button className="button" onClick={refresh}><Activity size={14} />Refresh activity</button>} />
      {role === "staff" && <div className="inline-alert" style={{ marginBottom: 13 }}><ShieldCheck size={16} /><span>Staff activity is limited to records available from `GET /api/activitylog/user/{session?.userId}`.</span></div>}
      <section className="panel table-panel"><div className="table-toolbar"><SearchBox value={tableSearch} onChange={(value) => { setTableSearch(value); setPage(1); }} placeholder={role === "admin" ? "Search activity description or IP…" : "Search my activity entries…"} /><span className="table-count">{number(activityResultCount)} {activitySearchQuery ? "matching" : "log"} entries{apiAdminActivity && !activitySearchQuery ? " · API paginated" : ""}</span></div>{activityLoading ? <Empty title="Loading activity" text="Requesting audit records from the API…" icon={<Activity size={22} />} /> : activityVisibleRows.length === 0 ? <Empty title="No activity entries" text="The API did not return activity records for this role or search." icon={<Activity size={22} />} /> : <div className="table-wrap"><table><thead><tr><th>Log ID</th><th>Date and time</th><th>User ID</th><th>Full activity</th><th>IP address</th></tr></thead><tbody>{activityVisibleRows.map((row) => <tr key={row.logId}><td className="cell-primary">#{row.logId}</td><td>{date(row.activityDate)}</td><td>{row.userId}</td><td><span className="record-detail">{row.activity}</span></td><td>{row.ipAddress || "Not recorded"}</td></tr>)}</tbody></table></div>}<Pager count={activityResultCount} page={page} setPage={setPage} pageSize={10} /></section></>}
    {!loading && section === "shop" && <>
      <PageHeading title="Browse medicines" description="Search the full API catalog. Product details are limited to the fields your API provides." actions={<button className="button" onClick={() => setLocation("/customer/cart")}><ShoppingCart size={15} />Cart · {data.cart.length}</button>} />
      <div className="table-toolbar panel" style={{ marginBottom: 13 }}><SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search brand, generic, or description…" /><select className="filter-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{data.categories.map((row) => <option key={row.categoryId} value={row.categoryId}>{row.categoryName}</option>)}</select><select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Any availability</option><option value="available">Available</option><option value="out">Out of stock</option></select><span className="table-count">{filteredMedicines.length} available records</span></div>
      {filteredMedicines.length === 0 ? <section className="panel"><Empty title="No medicines match your search" text="Try a different name or category, or check the API connection." icon={<ShoppingBag size={22} />} /></section> : <div className="shop-grid">{filteredMedicines.slice((page - 1) * 9, page * 9).map((row) => { const available = row.stockQty > 0 && !row.status.toLowerCase().includes("inactive") && !row.status.toLowerCase().includes("out"); return <article className="panel product-card" key={row.medicineId}><div className="product-art"><img className="product-fallback" src={row.image || "/medicine-placeholder.svg"} alt={row.image ? `${row.brandName} package` : "Generic package illustration"} onError={(event) => { event.currentTarget.src = "/medicine-placeholder.svg"; }} />{available && row.stockQty <= 20 && <span className="product-stock-warning">Low stock</span>}</div><div className="product-content"><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}><div><h3>{row.brandName}</h3><div className="generic-name">{row.genericName}</div></div><Status value={available ? (row.stockQty <= 20 ? "Low stock" : "Available") : "Out of stock"} /></div><div className="product-description">{row.description || "No description supplied by the API."}</div><div className="product-info"><span>{getCategory(data.categories, row.categoryId)} · {row.dosage || "Dosage not specified"}</span><span>{row.manufacturer || "Manufacturer not specified"} · {number(row.stockQty)} units shown</span><span>Medicine ID {row.medicineId} · API status: {row.status || "Not returned"}</span><span>Created {date(row.createdAt)} · Updated {date(row.updatedAt)}</span><span style={{ overflowWrap: "anywhere" }}>Image URL: {row.image || "Not provided by API"}</span></div><div className="product-bottom"><span className="product-price">{money(row.price)}</span><button className="button button-green button-small" disabled={!available} onClick={() => void addCart(row)}><ShoppingCart size={13} />Add</button></div></div></article>; })}</div>}
      <div style={{ marginTop: 12 }}><Pager count={filteredMedicines.length} page={page} setPage={setPage} pageSize={9} /></div>
    </>}
    {!loading && section === "cart" && <>
      <PageHeading title="Your medicine cart" description="Review full item details and quantities before creating an order." actions={<button className="button" onClick={() => setLocation("/customer/shop")}><ShoppingBag size={14} />Continue browsing</button>} />
      {data.cart.length === 0 ? <section className="panel"><Empty title="Your cart is empty" text="Browse available medicines and add an item to get started." icon={<ShoppingCart size={22} />} /><div style={{ textAlign: "center", padding: "0 0 22px" }}><button className="button button-green" onClick={() => setLocation("/customer/shop")}>Browse medicines <ArrowRight size={14} /></button></div></section> : <div className="cart-layout"><section className="panel panel-pad"><div className="panel-title-row"><div><h3>Items in this cart</h3><p>{data.cart.length} distinct medicine records</p></div><button className="table-action danger" onClick={() => void clearCart()}>Clear cart</button></div>{data.cart.slice((page - 1) * 8, page * 8).map((item) => { const medicine = data.medicines.find((row) => row.medicineId === item.medicineId); const unitPrice = medicine?.price ?? item.subtotal / Math.max(1, item.quantity); return <div className="cart-item" key={item.cartId}><div className="mini-icon"><img src={medicine?.image || "/medicine-placeholder.svg"} alt="" onError={(event) => { event.currentTarget.src = "/medicine-placeholder.svg"; }} /></div><div className="list-copy"><strong>{medicine?.brandName || `Medicine #${item.medicineId}`}</strong><span>{medicine?.genericName || "Generic name not returned"} · {medicine ? getCategory(data.categories, medicine.categoryId) : "Category unavailable"}</span><span>{medicine?.dosage || "Dosage not supplied"} · Added {date(item.addedAt)}</span><span>Cart ID {item.cartId} · Account ID {item.userId}</span><div className="quantity-control" style={{ marginTop: 9 }}><button aria-label="Decrease quantity" onClick={() => void updateCartQuantity(item, item.quantity - 1)}>−</button><span>{item.quantity}</span><button aria-label="Increase quantity" onClick={() => void updateCartQuantity(item, item.quantity + 1)}>+</button><span style={{ marginLeft: 8, color: "#77817b" }}>{money(unitPrice)} each</span></div></div><div style={{ textAlign: "right" }}><strong>{money(unitPrice * item.quantity)}</strong><span className="cell-secondary">Subtotal</span><button className="table-action danger" style={{ marginTop: 8 }} onClick={() => void removeCart(item)}><Trash2 size={13} />Remove</button></div></div>; })}<Pager count={data.cart.length} page={page} setPage={setPage} /></section><aside className="panel panel-pad"><div className="panel-title-row"><div><h3>Order summary</h3><p>Price totals use the current medicine record.</p></div></div><div className="checkout-summary"><div className="summary-line"><span>Items ({data.cart.reduce((total, row) => total + row.quantity, 0)} units)</span><strong>{money(currentCartTotal)}</strong></div><div className="summary-line"><span>Delivery</span><span>Set at checkout</span></div><div className="summary-total"><span>Estimated total</span><strong>{money(currentCartTotal)}</strong></div><div className="inline-alert"><CircleAlert size={14} /><span>This API records a payment-method label only. Checkout here does not collect or charge payment.</span></div><button className="button button-green" onClick={() => setCheckoutOpen(true)}><Check size={14} />Continue to checkout</button></div></aside></div>}
    </>}
    {!loading && section === "profile" && <>
      <PageHeading title="My profile" description="Review and update the account fields supported by your pharmacy API." />
      {!data.profile ? <section className="panel"><Empty title="Profile unavailable" text="The API did not return this profile. Check your account ID, token, and API permissions." icon={<Users size={22} />} /></section> : <section className="panel panel-pad" style={{ maxWidth: 720 }}><form className="auth-form" onSubmit={saveProfile}><div className="detail-card"><div className="detail-item"><small>User ID</small><strong>{data.profile.userId}</strong></div><div className="detail-item"><small>Role</small><strong>{labelForRole(data.profile.roleId)}</strong></div><div className="detail-item"><small>Created</small><strong>{date(data.profile.createdAt)}</strong></div><div className="detail-item"><small>API account</small><strong>{data.profile.username}</strong></div></div><div className="form-grid"><div className="form-field"><label>First name</label><input name="firstName" required defaultValue={data.profile.firstName} /></div><div className="form-field"><label>Last name</label><input name="lastName" required defaultValue={data.profile.lastName} /></div><div className="form-field"><label>Email</label><input name="email" type="email" defaultValue={data.profile.email} /></div><div className="form-field"><label>Contact number</label><input name="contactNumber" defaultValue={data.profile.contactNumber || ""} /></div><div className="form-field full"><label>Username</label><input name="username" required defaultValue={data.profile.username} /></div></div><div className="inline-alert"><ShieldCheck size={15} /><span>This form preserves your current role ID. The API should enforce self-only updates server-side.</span></div><button className="button button-green" type="submit"><Check size={14} />Save profile</button></form></section>}
    </>}
    {!loading && !["overview", "medicines", "inventory", "categories", "suppliers", "orders", "users", "roles", "activity", "shop", "cart", "profile"].includes(section) && <section className="panel"><Empty title="Section not found" text="Use the workspace navigation to choose an available section." /></section>}

    {editor && <EditorDialog key={`${editor.kind}-${(editor.item as Record<string, unknown> | undefined)?.medicineId ?? (editor.item as Record<string, unknown> | undefined)?.categoryId ?? (editor.item as Record<string, unknown> | undefined)?.supplierId ?? (editor.item as Record<string, unknown> | undefined)?.userId ?? (editor.item as Record<string, unknown> | undefined)?.userRoleId ?? "new"}`} editor={editor} categories={data.categories} roles={data.roles.length ? data.roles : demoRoles} onClose={() => setEditor(null)} onSubmit={(values) => void saveRecord(values)} />}
    {checkoutOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div className="modal-head"><div><h2 id="checkout-title">Delivery details</h2><p>Confirm the address and payment-method label for the API order.</p></div><button className="modal-close" onClick={() => setCheckoutOpen(false)} aria-label="Close"><X size={20} /></button></div><form className="auth-form" onSubmit={(event) => void checkout(event)}><div className="form-field"><label htmlFor="delivery-address">Delivery address</label><textarea id="delivery-address" required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Street, city, postal code" /></div><div className="form-field"><label htmlFor="payment-method">Payment method (label only)</label><select id="payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Cash on delivery</option><option>Card at pickup</option><option>Bank transfer</option><option>Other — confirm with pharmacy</option></select></div><div className="inline-alert"><AlertCircle size={15} /><span>No payment is processed by this API. Confirm payment directly with the pharmacy.</span></div><div className="modal-actions"><button className="button" type="button" onClick={() => setCheckoutOpen(false)}>Back</button><button className="button button-green" type="submit"><ShoppingBag size={14} />Place order · {money(currentCartTotal)}</button></div></form></section></div>}
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
  const topAreas = sortedAreas.slice(0, 5);
  const topAreaMax = topAreas.length > 0 ? topAreas[0][1] : 1;

  return <>
    {role === "customer" && <div className="customer-welcome"><div><h2>Hello, {userName}</h2><p>Browse available medicines, keep an eye on your orders, and review your cart.</p></div><button className="button" onClick={() => go("/customer/shop")}><ShoppingBag size={14} />Browse medicines</button></div>}
    <PageHeading title={role === "admin" ? "Pharmacy overview" : role === "staff" ? "Today at the pharmacy" : "Your activity"} description={role === "customer" ? "A complete view of your orders, cart, and available catalog." : ""} actions={<span className="status-pill status-neutral">Updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>} />
    <div className="metric-grid">{role === "admin" ? <>
      <Metric label="Medicine records" value={number(data.medicines.length)} note={`${number(inventoryUnits)} on-hand units · ${lowStock.length} low stock · ${unavailable.length} unavailable`} icon={<Boxes size={16} />} />
      <Metric label="Inventory value" value={money(inventoryValue)} note="Current stock × listed price; display currency is not converted" icon={<PackagePlus size={16} />} tone="good" />
      <Metric label="Orders in progress" value={number(pendingOrders.length)} note="Pending, processing, or ready" icon={<ClipboardList size={16} />} tone={pendingOrders.length ? "warn" : "normal"} />
      <Metric label="Recorded order value" value={money(recordedValue)} note="Non-cancelled order totals returned" icon={<ArrowUpRight size={16} />} tone="good" />
      <Metric label="Unique delivery areas" value={number(sortedAreas.length)} note="Distinct regions identified" icon={<MapPin size={16} />} />
      <Metric label="Top delivery area" value={topAreas.length > 0 ? topAreas[0][0] : "None"} note={topAreas.length > 0 ? `${topAreas[0][1]} orders` : "No location data"} icon={<Map size={16} />} tone="good" />
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
      <section className="panel panel-pad"><div className="panel-title-row"><div><h3>{role === "customer" ? "Your order value" : "Order activity"}</h3><p>Daily order totals · last 7 calendar days · cancelled orders excluded</p></div><span className="status-pill status-neutral">API records</span></div><div className="chart-total"><strong>{money(lastWeek.reduce((sum, day) => sum + day.total, 0))}</strong><span>Recorded in this range</span></div><div className="overview-chart">{lastWeek.map((day, index) => <div className="chart-column" key={`${day.label}-${index}`} title={`${day.label}: ${money(day.total)}`}><div className={`chart-bar ${index === lastWeek.length - 1 ? "selected" : ""}`} style={{ height: `${Math.max(day.total ? 11 : 3, (day.total / maxBar) * 83)}%` }} /><span className="chart-label">{day.label}</span></div>)}</div></section>
      {role !== "customer" && <section className="panel panel-pad"><div className="panel-title-row"><div><h3>Recent orders</h3><p>Each row includes every returned line item and order field.</p></div><button className="sub-action" onClick={() => go(`/${role}/orders`)}>All orders →</button></div>{ordersByRecent.length ? <div className="list-stack">{ordersByRecent.map((order) => <div className="list-row" key={order.orderId}><div className="mini-icon"><ClipboardList size={17} /></div><div className="list-copy"><strong>Order #{order.orderId} · customer {order.userId}</strong><span>{date(order.orderDate)} · {order.items.length} line items{order.paymentMethod ? ` · ${order.paymentMethod}` : ""}</span><span>{order.items.map((item) => `${item.brandName || `Medicine #${item.medicineId}`} × ${item.quantity} (${money(item.subtotal)})`).join(" · ") || "No item details included"}</span><span>{order.deliveryAddress || "Delivery address not provided"}</span></div><div className="list-trailing">{money(order.totalAmount)}<div style={{ marginTop: 6 }}><Status value={order.orderStatus} /></div></div></div>)}</div> : <Empty title="No orders returned" text="The orders endpoint has no records available for this role." icon={<ClipboardList size={20} />} />}</section>}
      {role === "admin" && <section className="panel panel-pad"><div className="panel-title-row"><div><h3>Popular delivery areas</h3><p>Top 5 locations by order volume · {sortedAreas.length} total areas</p></div><div className="metric-icon"><MapPin size={16} /></div></div>{topAreas.length > 0 ? <div className="list-stack">{topAreas.map(([areaName, count]) => { const pct = Math.round((count / totalOrdersWithArea) * 100); return <div className="list-row" key={areaName}><div className="mini-icon"><MapPin size={17} /></div><div className="list-copy" style={{ flex: 1, minWidth: 0 }}><strong>{areaName}</strong><span>{count} orders ({pct}%)</span><div style={{ marginTop: 8, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", width: "100%", maxWidth: 350 }}><div style={{ height: "100%", background: "var(--accent)", width: `${Math.max(2, (count / topAreaMax) * 100)}%` }} /></div></div><div className="list-trailing">{pct}%</div></div>; })}</div> : <Empty title="No delivery data yet" text="Areas will appear once orders with addresses are processed." icon={<MapPin size={20} />} />}</section>}
      {role === "customer" && <section className="panel panel-pad"><div className="panel-title-row"><div><h3>Your recent orders</h3><p>Full item/status/address details are available in My orders.</p></div><button className="sub-action" onClick={() => go("/customer/orders")}>All orders →</button></div>{data.orders.length ? <div className="list-stack">{ordersByRecent.map((order) => <div className="list-row" key={order.orderId}><div className="mini-icon"><ClipboardList size={17} /></div><div className="list-copy"><strong>Order #{order.orderId} · {order.items.map((item) => item.brandName || `#${item.medicineId}`).join(", ") || "Items unavailable"}</strong><span>{date(order.orderDate)} · {order.items.length} items · {order.deliveryAddress || "Address not provided"}</span></div><div className="list-trailing">{money(order.totalAmount)}<div style={{ marginTop: 6 }}><Status value={order.orderStatus} /></div></div></div>)}</div> : <Empty title="No orders yet" text="Your orders will appear here after checkout." icon={<ClipboardList size={20} />} />}</section>}
    </div><aside className="support-stack">
      <section className="panel panel-pad"><div className="panel-title-row"><div><h3>{role === "customer" ? "Available medicines" : "Stock attention"}</h3><p>{role === "customer" ? "Available catalog records" : `${lowStock.length} low stock · ${unavailable.length} unavailable`}</p></div><button className="sub-action" onClick={() => go(role === "customer" ? "/customer/shop" : `/${role}/${role === "staff" ? "inventory" : "medicines"}`)}>{role === "customer" ? "Browse →" : "Inventory →"}</button></div>{topMedicines.length ? <div className="list-stack">{topMedicines.map((medicine) => <div className="list-row" key={medicine.medicineId}><div className="mini-icon"><img src={medicine.image || "/medicine-placeholder.svg"} alt="" onError={(event) => { event.currentTarget.src = "/medicine-placeholder.svg"; }} /></div><div className="list-copy"><strong>{medicine.brandName}</strong><span>{medicine.genericName} · ID {medicine.medicineId}</span><span>{medicine.dosage || "Dosage not provided"} · {medicine.manufacturer || "Manufacturer not provided"}</span></div><div className="list-trailing">{role === "customer" ? money(medicine.price) : `${number(medicine.stockQty)} units`}<div style={{ marginTop: 6 }}><Status value={medicine.stockQty <= 0 ? "Out of stock" : medicine.stockQty <= 20 ? "Low stock" : medicine.status} /></div></div></div>)}</div> : <Empty title="No stock records" text="The medicines endpoint has not returned any records." />}</section>
      <section className="panel panel-pad"><div className="panel-title-row"><div><h3>{role === "customer" ? "Cart summary" : "Workspace details"}</h3><p>{role === "customer" ? "Current items before checkout" : "Data scope returned for this role"}</p></div><div className="metric-icon">{role === "customer" ? <ShoppingCart size={16} /> : <FileText size={16} />}</div></div>{role === "customer" ? <div className="checkout-summary"><div className="summary-line"><span>Units</span><strong>{number(data.cart.reduce((sum, item) => sum + item.quantity, 0))}</strong></div><div className="summary-line"><span>Distinct records</span><strong>{number(data.cart.length)}</strong></div><div className="summary-total"><span>Current total</span><strong>{money(data.cart.reduce((sum, item) => sum + cartLineSubtotal(item, data.medicines), 0))}</strong></div><button className="button button-green" onClick={() => go("/customer/cart")}>Open cart <ArrowRight size={14} /></button></div> : <div className="list-stack"><div className="list-row"><div className="mini-icon"><Boxes size={16} /></div><div className="list-copy"><strong>{number(data.medicines.length)} medicine records</strong><span>{number(data.medicines.reduce((sum, item) => sum + item.stockQty, 0))} total units listed</span></div></div><div className="list-row"><div className="mini-icon"><Tags size={16} /></div><div className="list-copy"><strong>{number(data.categories.length)} categories</strong><span>{number(data.suppliers.length)} supplier profiles available</span></div></div><div className="list-row"><div className="mini-icon"><Activity size={16} /></div><div className="list-copy"><strong>{number(data.activity.length)} activity entries</strong><span>{role === "admin" ? "All records returned to admin" : "Current user's records returned by API"}</span></div></div></div>}</section>
    </aside></div>
  </>;
}
