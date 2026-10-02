export type RoleName = "admin" | "staff" | "customer";
export type SessionMode = "api" | "demo";

export interface Session {
  token: string;
  userId: number;
  username: string;
  roleId: number;
  mode: SessionMode;
}

export interface Medicine {
  medicineId: number;
  brandName: string;
  genericName: string;
  categoryId: number;
  description?: string | null;
  dosage?: string | null;
  manufacturer?: string | null;
  price: number;
  stockQty: number;
  image?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  categoryId: number;
  categoryName: string;
}

export interface Supplier {
  supplierId: number;
  supplierName: string;
  contactPerson?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  address?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderItem {
  orderItemId?: number;
  orderId?: number;
  medicineId: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  brandName?: string;
  genericName?: string;
}

export interface Order {
  orderId: number;
  userId: number;
  orderDate: string;
  totalAmount: number;
  paymentMethod?: string | null;
  deliveryAddress?: string | null;
  orderStatus: string;
  items: OrderItem[];
}

export interface CartItem {
  cartId: number;
  userId: number;
  medicineId: number;
  quantity: number;
  subtotal: number;
  addedAt: string;
}

export interface UserRecord {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber?: string | null;
  username: string;
  roleId: number;
  createdAt?: string;
}

export interface UserRole {
  userRoleId: number;
  userRole: string;
}

export interface ActivityLog {
  logId: number;
  userId: number;
  activity: string;
  activityDate: string;
  ipAddress?: string | null;
}

export interface MedicineBatch {
  batchId: number;
  medicineId: number;
  supplierId?: number | null;
  lotNumber: string;
  expirationDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number;
  receivedAt: string;
  batchStatus: string;
  notes?: string | null;
}

export interface PurchaseOrder {
  purchaseOrderId: number;
  purchaseOrderNumber: string;
  supplierId: number;
  status: string;
  orderedAt?: string | null;
  expectedAt?: string | null;
  receivedAt?: string | null;
  createdByUserId?: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseOrderItem {
  purchaseOrderItemId: number;
  purchaseOrderId: number;
  medicineId: number;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  notes?: string | null;
}

export interface InventoryTransaction {
  transactionId: number;
  medicineId: number;
  batchId?: number | null;
  transactionType: string;
  quantityChange: number;
  unitCost?: number | null;
  relatedOrderId?: number | null;
  purchaseOrderItemId?: number | null;
  performedByUserId?: number | null;
  reason: string;
  notes?: string | null;
  createdAt?: string;
}

export interface OrderStatusHistory {
  statusHistoryId: number;
  orderId?: number | null;
  orderIdSnapshot: number;
  oldStatus?: string | null;
  newStatus: string;
  changedByUserId?: number | null;
  changedAt: string;
  notes?: string | null;
}

export interface PageResult<T> {
  items: T[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const SESSION_KEY = "medistock.session.v1";
const API_URL_KEY = "medistock.apiBaseUrl.v1";
const CURRENCY_KEY = "medistock.displayCurrency.v1";
export const DISPLAY_CURRENCIES = ["PHP", "USD", "EUR"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export function getDisplayCurrency(): DisplayCurrency {
  const saved = localStorage.getItem(CURRENCY_KEY);
  return DISPLAY_CURRENCIES.includes(saved as DisplayCurrency) ? saved as DisplayCurrency : "PHP";
}

export function saveDisplayCurrency(value: DisplayCurrency): void {
  localStorage.setItem(CURRENCY_KEY, value);
}

export function getApiBaseUrl(): string {
  return (localStorage.getItem(API_URL_KEY) || import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
}

export function saveApiBaseUrl(value: string): void {
  localStorage.setItem(API_URL_KEY, value.trim().replace(/\/+$/, ""));
}

export function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("medistock:session-ended"));
}

export function roleFromId(roleId: number): RoleName | null {
  if (roleId === 1) return "admin";
  if (roleId === 2) return "staff";
  if (roleId === 3) return "customer";
  return null;
}

export function labelForRole(roleId: number): string {
  const role = roleFromId(roleId);
  return role === "admin" ? "Administrator" : role === "staff" ? "Staff" : role === "customer" ? "Customer" : `Role ${roleId}`;
}

function readField<T>(source: unknown, camel: string, pascal: string, fallback: T): T {
  if (!source || typeof source !== "object") return fallback;
  const record = source as Record<string, unknown>;
  const value = record[camel] ?? record[pascal];
  return (value === undefined || value === null ? fallback : value) as T;
}

export function normalizeMedicine(value: unknown): Medicine {
  return {
    medicineId: Number(readField(value, "medicineId", "MedicineId", 0)),
    brandName: String(readField(value, "brandName", "BrandName", "")),
    genericName: String(readField(value, "genericName", "GenericName", "")),
    categoryId: Number(readField(value, "categoryId", "CategoryId", 0)),
    description: readField(value, "description", "Description", ""),
    dosage: readField(value, "dosage", "Dosage", ""),
    manufacturer: readField(value, "manufacturer", "Manufacturer", ""),
    price: Number(readField(value, "price", "Price", 0)),
    stockQty: Number(readField(value, "stockQty", "StockQty", 0)),
    image: readField(value, "image", "Image", ""),
    status: String(readField(value, "status", "Status", "Available")),
    createdAt: readField(value, "createdAt", "CreatedAt", ""),
    updatedAt: readField(value, "updatedAt", "UpdatedAt", ""),
  };
}

export function normalizeCategory(value: unknown): Category {
  return {
    categoryId: Number(readField(value, "categoryId", "CategoryId", 0)),
    categoryName: String(readField(value, "categoryName", "CategoryName", "")),
  };
}

export function normalizeSupplier(value: unknown): Supplier {
  return {
    supplierId: Number(readField(value, "supplierId", "SupplierId", 0)),
    supplierName: String(readField(value, "supplierName", "SupplierName", "")),
    contactPerson: readField(value, "contactPerson", "ContactPerson", ""),
    contactNumber: readField(value, "contactNumber", "ContactNumber", ""),
    email: readField(value, "email", "Email", ""),
    address: readField(value, "address", "Address", ""),
    status: String(readField(value, "status", "Status", "Active")),
    createdAt: readField(value, "createdAt", "CreatedAt", ""),
    updatedAt: readField(value, "updatedAt", "UpdatedAt", ""),
  };
}

export function normalizeOrderItem(value: unknown): OrderItem {
  return {
    orderItemId: Number(readField(value, "orderItemId", "OrderItemId", 0)),
    orderId: Number(readField(value, "orderId", "OrderId", 0)),
    medicineId: Number(readField(value, "medicineId", "MedicineId", 0)),
    quantity: Number(readField(value, "quantity", "Quantity", 0)),
    unitPrice: Number(readField(value, "unitPrice", "UnitPrice", 0)),
    subtotal: Number(readField(value, "subtotal", "Subtotal", 0)),
    brandName: readField(value, "brandName", "BrandName", ""),
    genericName: readField(value, "genericName", "GenericName", ""),
  };
}

export function normalizeOrder(value: unknown): Order {
  const items = readField<unknown[]>(value, "items", "Items", []);
  return {
    orderId: Number(readField(value, "orderId", "OrderId", 0)),
    userId: Number(readField(value, "userId", "UserId", 0)),
    orderDate: String(readField(value, "orderDate", "OrderDate", "")),
    totalAmount: Number(readField(value, "totalAmount", "TotalAmount", 0)),
    paymentMethod: readField(value, "paymentMethod", "PaymentMethod", ""),
    deliveryAddress: readField(value, "deliveryAddress", "DeliveryAddress", ""),
    orderStatus: String(readField(value, "orderStatus", "OrderStatus", "Pending")),
    items: Array.isArray(items) ? items.map(normalizeOrderItem) : [],
  };
}

export function normalizeCartItem(value: unknown): CartItem {
  return {
    cartId: Number(readField(value, "cartId", "CartId", 0)),
    userId: Number(readField(value, "userId", "UserId", 0)),
    medicineId: Number(readField(value, "medicineId", "MedicineId", 0)),
    quantity: Number(readField(value, "quantity", "Quantity", 0)),
    subtotal: Number(readField(value, "subtotal", "Subtotal", 0)),
    addedAt: String(readField(value, "addedAt", "AddedAt", "")),
  };
}

export function normalizeUser(value: unknown): UserRecord {
  return {
    userId: Number(readField(value, "userId", "UserId", 0)),
    firstName: String(readField(value, "firstName", "FirstName", "")),
    lastName: String(readField(value, "lastName", "LastName", "")),
    email: String(readField(value, "email", "Email", "")),
    contactNumber: readField(value, "contactNumber", "ContactNumber", ""),
    username: String(readField(value, "username", "Username", "")),
    roleId: Number(readField(value, "roleId", "RoleId", 3)),
    createdAt: readField(value, "createdAt", "CreatedAt", ""),
  };
}

export function normalizeUserRole(value: unknown): UserRole {
  return {
    userRoleId: Number(readField(value, "userRoleId", "UserRoleId", 0)),
    userRole: String(readField(value, "userRole", "UserRole", "")),
  };
}

export function normalizeActivity(value: unknown): ActivityLog {
  return {
    logId: Number(readField(value, "logId", "LogId", 0)),
    userId: Number(readField(value, "userId", "UserId", 0)),
    activity: String(readField(value, "activity", "Activity", "")),
    activityDate: String(readField(value, "activityDate", "ActivityDate", "")),
    ipAddress: readField(value, "ipAddress", "IpAddress", ""),
  };
}

export function normalizeMedicineBatch(value: unknown): MedicineBatch {
  return {
    batchId: Number(readField(value, "batchId", "BatchId", 0)),
    medicineId: Number(readField(value, "medicineId", "MedicineId", 0)),
    supplierId: readField(value, "supplierId", "SupplierId", null) as number | null,
    lotNumber: String(readField(value, "lotNumber", "LotNumber", "")),
    expirationDate: String(readField(value, "expirationDate", "ExpirationDate", "")),
    quantityReceived: Number(readField(value, "quantityReceived", "QuantityReceived", 0)),
    quantityRemaining: Number(readField(value, "quantityRemaining", "QuantityRemaining", 0)),
    unitCost: Number(readField(value, "unitCost", "UnitCost", 0)),
    receivedAt: String(readField(value, "receivedAt", "ReceivedAt", "")),
    batchStatus: String(readField(value, "batchStatus", "BatchStatus", "Active")),
    notes: readField(value, "notes", "Notes", null) as string | null,
  };
}

export function normalizePurchaseOrder(value: unknown): PurchaseOrder {
  return {
    purchaseOrderId: Number(readField(value, "purchaseOrderId", "PurchaseOrderId", 0)),
    purchaseOrderNumber: String(readField(value, "purchaseOrderNumber", "PurchaseOrderNumber", "")),
    supplierId: Number(readField(value, "supplierId", "SupplierId", 0)),
    status: String(readField(value, "status", "Status", "Draft")),
    orderedAt: readField(value, "orderedAt", "OrderedAt", null) as string | null,
    expectedAt: readField(value, "expectedAt", "ExpectedAt", null) as string | null,
    receivedAt: readField(value, "receivedAt", "ReceivedAt", null) as string | null,
    createdByUserId: readField(value, "createdByUserId", "CreatedByUserId", null) as number | null,
    notes: readField(value, "notes", "Notes", null) as string | null,
    createdAt: readField(value, "createdAt", "CreatedAt", ""),
    updatedAt: readField(value, "updatedAt", "UpdatedAt", ""),
  };
}

export function normalizePurchaseOrderItem(value: unknown): PurchaseOrderItem {
  return {
    purchaseOrderItemId: Number(readField(value, "purchaseOrderItemId", "PurchaseOrderItemId", 0)),
    purchaseOrderId: Number(readField(value, "purchaseOrderId", "PurchaseOrderId", 0)),
    medicineId: Number(readField(value, "medicineId", "MedicineId", 0)),
    quantityOrdered: Number(readField(value, "quantityOrdered", "QuantityOrdered", 0)),
    quantityReceived: Number(readField(value, "quantityReceived", "QuantityReceived", 0)),
    unitCost: Number(readField(value, "unitCost", "UnitCost", 0)),
    notes: readField(value, "notes", "Notes", null) as string | null,
  };
}

export function normalizeInventoryTransaction(value: unknown): InventoryTransaction {
  return {
    transactionId: Number(readField(value, "transactionId", "TransactionId", 0)),
    medicineId: Number(readField(value, "medicineId", "MedicineId", 0)),
    batchId: readField(value, "batchId", "BatchId", null) as number | null,
    transactionType: String(readField(value, "transactionType", "TransactionType", "")),
    quantityChange: Number(readField(value, "quantityChange", "QuantityChange", 0)),
    unitCost: readField(value, "unitCost", "UnitCost", null) as number | null,
    relatedOrderId: readField(value, "relatedOrderId", "RelatedOrderId", null) as number | null,
    purchaseOrderItemId: readField(value, "purchaseOrderItemId", "PurchaseOrderItemId", null) as number | null,
    performedByUserId: readField(value, "performedByUserId", "PerformedByUserId", null) as number | null,
    reason: String(readField(value, "reason", "Reason", "")),
    notes: readField(value, "notes", "Notes", null) as string | null,
    createdAt: readField(value, "createdAt", "CreatedAt", ""),
  };
}

export function normalizeOrderStatusHistory(value: unknown): OrderStatusHistory {
  return {
    statusHistoryId: Number(readField(value, "statusHistoryId", "StatusHistoryId", 0)),
    orderId: readField(value, "orderId", "OrderId", null) as number | null,
    orderIdSnapshot: Number(readField(value, "orderIdSnapshot", "OrderIdSnapshot", 0)),
    oldStatus: readField(value, "oldStatus", "OldStatus", null) as string | null,
    newStatus: String(readField(value, "newStatus", "NewStatus", "")),
    changedByUserId: readField(value, "changedByUserId", "ChangedByUserId", null) as number | null,
    changedAt: String(readField(value, "changedAt", "ChangedAt", "")),
    notes: readField(value, "notes", "Notes", null) as string | null,
  };
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new ApiError("Add your deployed API URL in API connection settings first.", 0);
  const session = getSession();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (authenticated && session?.token) headers.set("Authorization", `Bearer ${session.token}`);
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network request failed.";
    throw new ApiError(`Could not reach API. Check its URL, CORS allowlist, and availability. ${detail}`, 0);
  }
  const contentType = response.headers.get("content-type") || "";
  let payload: unknown = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      if (contentType.includes("json")) {
        try { payload = JSON.parse(text); } catch { payload = text; }
      } else payload = text;
    }
  }
  if (!response.ok) {
    if (response.status === 401 && authenticated) clearSession();
    const payloadMessage = payload && typeof payload === "object" ? (payload as Record<string, unknown>).message : payload;
    throw new ApiError(typeof payloadMessage === "string" ? payloadMessage : `API request failed (${response.status}).`, response.status, payload);
  }
  return payload as T;
}

function normalizeList<T>(payload: unknown, normalize: (value: unknown) => T): T[] {
  if (Array.isArray(payload)) return payload.map(normalize);
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const items = record.items ?? record.Items;
  return Array.isArray(items) ? items.map(normalize) : [];
}

function normalizePage<T>(payload: unknown, normalize: (value: unknown) => T): PageResult<T> {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const items = normalizeList(payload, normalize);
  return {
    items,
    totalCount: Number(record.totalCount ?? record.TotalCount ?? items.length),
    pageSize: Number(record.pageSize ?? record.PageSize ?? items.length),
    currentPage: Number(record.currentPage ?? record.CurrentPage ?? 1),
  };
}

export async function checkApiHealth(): Promise<unknown> {
  return request<unknown>("/health", {}, false);
}

export async function login(username: string, password: string): Promise<Session> {
  const data = await request<Record<string, unknown>>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ username, password }),
  }, false);
  const token = String(data.token ?? data.Token ?? "");
  const roleId = Number(data.roleId ?? data.RoleId ?? 0);
  if (!token || !roleFromId(roleId)) throw new ApiError("The API login response is missing a token or supported role ID.", 200, data);
  return {
    token,
    userId: Number(data.userId ?? data.UserId ?? 0),
    username: String(data.username ?? data.Username ?? username),
    roleId,
    mode: "api",
  };
}

export async function registerCustomer(input: {
  username: string; password: string; firstName: string; lastName: string; email: string; contactNumber: string;
}): Promise<Session> {
  const data = await request<Record<string, unknown>>("/api/auth/register", {
    method: "POST", body: JSON.stringify({ ...input, roleId: 3 }),
  }, false);
  const token = String(data.token ?? data.Token ?? "");
  const userId = Number(data.userId ?? data.UserId ?? 0);
  if (!token) throw new ApiError("Account was created, but this API response did not include a login token. Please sign in.", 200, data);
  return { token, userId, username: String(data.username ?? input.username), roleId: 3, mode: "api" };
}

export async function requestPasswordReset(username: string): Promise<{ message: string; resetToken?: string }> {
  const data = await request<Record<string, unknown>>("/api/auth/forgot-password", {
    method: "POST", body: JSON.stringify({ username }),
  }, false);
  return { message: String(data.message ?? "If the account exists, reset instructions will be provided."), resetToken: data.resetToken ? String(data.resetToken) : undefined };
}

export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const data = await request<Record<string, unknown>>("/api/auth/reset-password", {
    method: "POST", body: JSON.stringify({ token, newPassword }),
  }, false);
  return String(data.message ?? "Password updated.");
}

export async function getMedicines(): Promise<Medicine[]> {
  return normalizeList(await request<unknown>("/api/medicine"), normalizeMedicine);
}
export async function getCategories(): Promise<Category[]> {
  return normalizeList(await request<unknown>("/api/category"), normalizeCategory);
}
export async function getSuppliers(): Promise<Supplier[]> {
  return normalizeList(await request<unknown>("/api/supplier"), normalizeSupplier);
}
export async function getOrders(): Promise<Order[]> {
  return normalizeList(await request<unknown>("/api/order"), normalizeOrder);
}
export async function getCustomerOrders(userId: number): Promise<Order[]> {
  return normalizeList(await request<unknown>(`/api/order/user/${userId}`), normalizeOrder);
}
export async function getCart(userId: number): Promise<CartItem[]> {
  return normalizeList(await request<unknown>(`/api/cart/user/${userId}`), normalizeCartItem);
}
export async function getUsers(pageNumber = 1, pageSize = 100): Promise<PageResult<UserRecord>> {
  return normalizePage(await request<unknown>(`/api/user/paginated?pageNumber=${pageNumber}&pageSize=${pageSize}`), normalizeUser);
}
export async function getUser(userId: number): Promise<UserRecord> {
  return normalizeUser(await request<unknown>(`/api/user/${userId}`));
}
export async function getRoles(): Promise<UserRole[]> {
  return normalizeList(await request<unknown>("/api/userrole"), normalizeUserRole);
}
export async function getActivity(pageNumber = 1, pageSize = 10): Promise<PageResult<ActivityLog>> {
  return normalizePage(await request<unknown>(`/api/activitylog/paginated?pageNumber=${pageNumber}&pageSize=${pageSize}`), normalizeActivity);
}
export async function searchActivity(query: string): Promise<ActivityLog[]> {
  return normalizeList(await request<unknown>(`/api/activitylog/search?query=${encodeURIComponent(query)}`), normalizeActivity);
}
export async function getUserActivity(userId: number): Promise<ActivityLog[]> {
  return normalizeList(await request<unknown>(`/api/activitylog/user/${userId}`), normalizeActivity);
}
export async function getMedicineBatches(): Promise<MedicineBatch[]> {
  return normalizeList(await request<unknown>("/api/medicinebatch"), normalizeMedicineBatch);
}
export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  return normalizeList(await request<unknown>("/api/purchaseorder"), normalizePurchaseOrder);
}
export async function getPurchaseOrderItems(poId: number): Promise<PurchaseOrderItem[]> {
  return normalizeList(await request<unknown>(`/api/purchaseorderitem/purchaseorder/${poId}`), normalizePurchaseOrderItem);
}
export async function getInventoryTransactions(): Promise<InventoryTransaction[]> {
  return normalizeList(await request<unknown>("/api/inventorytransaction"), normalizeInventoryTransaction);
}
export async function getOrderStatusHistories(): Promise<OrderStatusHistory[]> {
  return normalizeList(await request<unknown>("/api/orderstatushistory"), normalizeOrderStatusHistory);
}

export const api = {
  request,
  async createMedicine(value: Omit<Medicine, "medicineId">) { return request<unknown>("/api/medicine", { method: "POST", body: JSON.stringify(value) }); },
  async updateMedicine(id: number, value: Omit<Medicine, "medicineId">) { return request<unknown>(`/api/medicine/${id}`, { method: "PUT", body: JSON.stringify(value) }); },
  async deleteMedicine(id: number) { return request<unknown>(`/api/medicine/${id}`, { method: "DELETE" }); },
  async createCategory(categoryName: string) { return request<unknown>("/api/category", { method: "POST", body: JSON.stringify({ categoryName }) }); },
  async updateCategory(id: number, categoryName: string) { return request<unknown>(`/api/category/${id}`, { method: "PUT", body: JSON.stringify({ categoryName }) }); },
  async deleteCategory(id: number) { return request<unknown>(`/api/category/${id}`, { method: "DELETE" }); },
  async createSupplier(value: Partial<Supplier> & { supplierName: string }) { return request<unknown>("/api/supplier", { method: "POST", body: JSON.stringify(value) }); },
  async updateSupplier(id: number, value: Partial<Supplier> & { supplierName: string }) { return request<unknown>(`/api/supplier/${id}`, { method: "PUT", body: JSON.stringify(value) }); },
  async deleteSupplier(id: number) { return request<unknown>(`/api/supplier/${id}`, { method: "DELETE" }); },
  async updateOrderStatus(id: number, status: string) { return request<unknown>(`/api/order/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }); },
  async cancelOrder(id: number) { return request<unknown>(`/api/order/${id}/cancel`, { method: "PUT" }); },
  async deleteOrder(id: number) { return request<unknown>(`/api/order/${id}`, { method: "DELETE" }); },
  async addToCart(userId: number, medicineId: number, quantity: number, subtotal: number) { return request<unknown>("/api/cart", { method: "POST", body: JSON.stringify({ userId, medicineId, quantity, subtotal }) }); },
  async updateCart(id: number, quantity: number, subtotal: number) { return request<unknown>(`/api/cart/${id}`, { method: "PUT", body: JSON.stringify({ quantity, subtotal }) }); },
  async removeCart(id: number) { return request<unknown>(`/api/cart/${id}`, { method: "DELETE" }); },
  async clearCart(userId: number) { return request<unknown>(`/api/cart/user/${userId}/clear`, { method: "DELETE" }); },
  async checkout(userId: number, paymentMethod: string, deliveryAddress: string) { return request<unknown>("/api/order/checkout", { method: "POST", body: JSON.stringify({ userId, paymentMethod, deliveryAddress }) }); },
  async updateUser(id: number, value: Partial<UserRecord> & { username: string; roleId: number; newPassword?: string }) { return request<unknown>(`/api/user/${id}`, { method: "PUT", body: JSON.stringify(value) }); },
  async createUser(value: { username: string; password: string; roleId: number; firstName: string; lastName: string; email: string; contactNumber: string }) { return request<unknown>("/api/user", { method: "POST", body: JSON.stringify(value) }); },
  async deleteUser(id: number) { return request<unknown>(`/api/user/${id}`, { method: "DELETE" }); },
  async createRole(userRole: string) { return request<unknown>("/api/userrole", { method: "POST", body: JSON.stringify({ userRole }) }); },
  async updateRole(id: number, userRole: string) { return request<unknown>(`/api/userrole/${id}`, { method: "PUT", body: JSON.stringify({ userRole }) }); },
  async deleteRole(id: number) { return request<unknown>(`/api/userrole/${id}`, { method: "DELETE" }); },
  
  async createMedicineBatch(value: Omit<MedicineBatch, "batchId" | "receivedAt">) { return request<unknown>("/api/medicinebatch", { method: "POST", body: JSON.stringify(value) }); },
  async updateMedicineBatch(id: number, value: Omit<MedicineBatch, "batchId" | "receivedAt">) { return request<unknown>(`/api/medicinebatch/${id}`, { method: "PUT", body: JSON.stringify(value) }); },
  async deleteMedicineBatch(id: number) { return request<unknown>(`/api/medicinebatch/${id}`, { method: "DELETE" }); },
  
  async createPurchaseOrder(value: Omit<PurchaseOrder, "purchaseOrderId" | "createdAt" | "updatedAt">) { return request<unknown>("/api/purchaseorder", { method: "POST", body: JSON.stringify(value) }); },
  async updatePurchaseOrder(id: number, value: Omit<PurchaseOrder, "purchaseOrderId" | "createdAt" | "updatedAt">) { return request<unknown>(`/api/purchaseorder/${id}`, { method: "PUT", body: JSON.stringify(value) }); },
  async deletePurchaseOrder(id: number) { return request<unknown>(`/api/purchaseorder/${id}`, { method: "DELETE" }); },

  async createPurchaseOrderItem(value: Omit<PurchaseOrderItem, "purchaseOrderItemId">) { return request<unknown>("/api/purchaseorderitem", { method: "POST", body: JSON.stringify(value) }); },
  async updatePurchaseOrderItem(id: number, value: Omit<PurchaseOrderItem, "purchaseOrderItemId">) { return request<unknown>(`/api/purchaseorderitem/${id}`, { method: "PUT", body: JSON.stringify(value) }); },
  async deletePurchaseOrderItem(id: number) { return request<unknown>(`/api/purchaseorderitem/${id}`, { method: "DELETE" }); },

  async createInventoryTransaction(value: Omit<InventoryTransaction, "transactionId" | "createdAt">) { return request<unknown>("/api/inventorytransaction", { method: "POST", body: JSON.stringify(value) }); },
  async updateInventoryTransaction(id: number, value: Omit<InventoryTransaction, "transactionId" | "createdAt">) { return request<unknown>(`/api/inventorytransaction/${id}`, { method: "PUT", body: JSON.stringify(value) }); },
  async deleteInventoryTransaction(id: number) { return request<unknown>(`/api/inventorytransaction/${id}`, { method: "DELETE" }); },

  async createOrderStatusHistory(value: Omit<OrderStatusHistory, "statusHistoryId" | "changedAt">) { return request<unknown>("/api/orderstatushistory", { method: "POST", body: JSON.stringify(value) }); },
  async updateOrderStatusHistory(id: number, value: Omit<OrderStatusHistory, "statusHistoryId" | "changedAt">) { return request<unknown>(`/api/orderstatushistory/${id}`, { method: "PUT", body: JSON.stringify(value) }); },
  async deleteOrderStatusHistory(id: number) { return request<unknown>(`/api/orderstatushistory/${id}`, { method: "DELETE" }); },
};


export async function getAllUsers(pageSize = 100): Promise<UserRecord[]> {
  const first = await getUsers(1, pageSize);
  const all = [...first.items];
  let page = 1;
  while (page * first.pageSize < first.totalCount && first.pageSize > 0) {
    page += 1;
    const next = await getUsers(page, pageSize);
    if (!next.items.length) break;
    all.push(...next.items);
    if (next.currentPage >= Math.ceil(next.totalCount / Math.max(1, next.pageSize))) break;
  }
  return all;
}
