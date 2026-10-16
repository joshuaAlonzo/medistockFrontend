import { useState, useEffect, useRef } from "react";
import { Bell, ShoppingBag, ShoppingCart, CheckCircle2, Truck, Package, PackageCheck, X, BellOff, Boxes, Clock } from "lucide-react";
import type { Order, OrderItem, Supplier, PurchaseOrder, RoleName, UserRecord, CartItem, Medicine } from "../lib/pharmacyApi";

type NotifCategory = "order" | "supplier" | "cart";
type NotifKind =
  | "order_placed"
  | "order_ready"
  | "order_on_the_way"
  | "order_delivered"
  | "order_completed"
  | "supplier_shipment"
  | "cart_added";

interface Notification {
  id: string;
  category: NotifCategory;
  kind: NotifKind;
  title: string;
  body: string;
  timestamp: string;
  linkPath?: string;
}

const STORAGE_KEY = "medistock_read_notifications";

function getReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadSet(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* quota */ }
}

export function parseUtcDate(value?: string | null): Date | null {
  if (!value) return null;
  let iso = String(value).trim();
  if (!iso) return null;
  // If no timezone offset is present, treat as UTC (SQLite CURRENT_TIMESTAMP standard)
  if (!iso.includes("Z") && !/[+-]\d{2}(:\d{2})?$/.test(iso)) {
    iso = `${iso.replace(" ", "T")}Z`;
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date(value) : d;
}

export function formatNotifDate(isoString: string): { display: string; full: string } {
  const d = parseUtcDate(isoString);
  if (!d || isNaN(d.getTime())) return { display: "Not recorded", full: "" };

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  const timeStr = d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
  const full = d.toLocaleString("en-PH", { dateStyle: "full", timeStyle: "medium" });

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  let relative = "";
  if (diffMin >= 0 && diffMin < 1) {
    relative = "Just now";
  } else if (diffMin >= 1 && diffMin < 60) {
    relative = `${diffMin}m ago`;
  } else if (diffHours < 24 && isToday) {
    relative = `${diffHours}h ago`;
  } else if (isYesterday) {
    relative = `Yesterday`;
  } else if (diffDays >= 0 && diffDays < 7) {
    relative = `${diffDays}d ago`;
  }

  const dateFormatted = d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });

  const display = relative
    ? `${dateFormatted} · ${timeStr} (${relative})`
    : `${dateFormatted} · ${timeStr}`;

  return { display, full };
}

function formatOrderItems(items: OrderItem[], maxItems = 3): string {
  if (!items || items.length === 0) return "";
  const listed = items.slice(0, maxItems).map((it) => {
    const name = it.brandName || it.genericName || `Medicine #${it.medicineId}`;
    return `${name} ×${it.quantity}`;
  });
  const remaining = items.length - maxItems;
  if (remaining > 0) listed.push(`+${remaining} more`);
  return listed.join(", ");
}

function buildNotifications(
  role: RoleName,
  orders: Order[],
  suppliers: Supplier[],
  purchaseOrders: PurchaseOrder[],
  users: UserRecord[],
  currentUserId?: number,
  cartItems?: CartItem[],
  medicines?: Medicine[],
): Notification[] {
  const notifs: Notification[] = [];
  const supplierMap = new Map(suppliers.map((s) => [s.supplierId, s.supplierName]));
  const myOrders = role === "customer" ? orders.filter((o) => o.userId === currentUserId) : orders;

  for (const order of myOrders) {
    const status = order.orderStatus?.toLowerCase() ?? "";
    const date = order.orderDate;
    const itemsSummary = formatOrderItems(order.items ?? []);
    let customerLabel = "";
    if (role !== "customer") {
      const user = users.find((u) => u.userId === order.userId);
      if (user) customerLabel = ` from ${(user.firstName + " " + user.lastName).trim()}`;
    }

    if (status === "pending") {
      notifs.push({ id: `order-placed-${order.orderId}`, category: "order", kind: "order_placed",
        title: role === "customer" ? "Order placed" : `New order${customerLabel}`,
        body: itemsSummary
          ? (role === "customer" ? `Items: ${itemsSummary}` : `${customerLabel ? customerLabel.trim() + " ordered: " : ""}${itemsSummary}`)
          : (role === "customer" ? "Your order has been received and is being reviewed." : `A new customer order has been placed${customerLabel}.`),
        timestamp: date, linkPath: `/${role}/orders` });
    } else if (status === "ready") {
      notifs.push({ id: `order-ready-${order.orderId}`, category: "order", kind: "order_ready",
        title: role === "customer" ? "Order is ready" : `Order ready${customerLabel}`,
        body: itemsSummary
          ? `Ready for pickup: ${itemsSummary}`
          : (role === "customer" ? "Your order is prepared and ready for pickup or delivery." : "Order has been prepared and is ready for dispatch."),
        timestamp: date, linkPath: `/${role}/orders` });
    } else if (status === "on the way" || status === "on_the_way") {
      notifs.push({ id: `order-onway-${order.orderId}`, category: "order", kind: "order_on_the_way",
        title: role === "customer" ? "Order is on the way" : `Order dispatched${customerLabel}`,
        body: itemsSummary
          ? `On the way: ${itemsSummary}`
          : (role === "customer" ? "Your order is on its way to your delivery address!" : "Order has been dispatched for delivery."),
        timestamp: date, linkPath: `/${role}/orders` });
    } else if (status === "delivered") {
      notifs.push({ id: `order-delivered-${order.orderId}`, category: "order", kind: "order_delivered",
        title: role === "customer" ? "Order delivered" : `Order delivered${customerLabel}`,
        body: itemsSummary
          ? `Delivered: ${itemsSummary}`
          : (role === "customer" ? "Your order has been delivered. We hope you're satisfied!" : "Order has been delivered successfully."),
        timestamp: date, linkPath: `/${role}/orders` });
    } else if (status === "completed") {
      notifs.push({ id: `order-completed-${order.orderId}`, category: "order", kind: "order_completed",
        title: role === "customer" ? "Order completed" : `Order completed${customerLabel}`,
        body: itemsSummary
          ? `Completed: ${itemsSummary}`
          : (role === "customer" ? "Your order is marked as complete. Thank you!" : "Order has been completed."),
        timestamp: date, linkPath: `/${role}/orders` });
    }
  }

  if (role !== "customer") {
    for (const po of purchaseOrders) {
      const poStatus = po.status?.toLowerCase() ?? "";
      if (poStatus === "ordered" || poStatus === "partiallyreceived") {
        const supplierName = supplierMap.get(po.supplierId) ?? `Supplier #${po.supplierId}`;
        notifs.push({ id: `po-onway-${po.purchaseOrderId}`, category: "supplier", kind: "supplier_shipment",
          title: `Shipment from ${supplierName} on the way`,
          body: `PO ${po.purchaseOrderNumber} is in transit${po.expectedAt ? `. Expected by ${new Date(po.expectedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` : ""}.`,
          timestamp: po.orderedAt ?? po.createdAt ?? "", linkPath: `/${role}/suppliers` });
      }
    }
  }

  // Cart notifications for customers
  if (role === "customer" && cartItems && cartItems.length > 0 && medicines) {
    const medicineMap = new Map(medicines.map((m) => [m.medicineId, m]));
    for (const item of cartItems) {
      const med = medicineMap.get(item.medicineId);
      const name = med?.brandName || med?.genericName || `Medicine #${item.medicineId}`;
      notifs.push({
        id: `cart-added-${item.cartId}`,
        category: "cart",
        kind: "cart_added",
        title: `Added to cart`,
        body: `${name} ×${item.quantity}`,
        timestamp: item.addedAt || "",
        linkPath: `/${role}/cart`,
      });
    }
  }

  return notifs.sort((a, b) => {
    const da = parseUtcDate(a.timestamp);
    const db = parseUtcDate(b.timestamp);
    const ta = da && !isNaN(da.getTime()) ? da.getTime() : 0;
    const tb = db && !isNaN(db.getTime()) ? db.getTime() : 0;
    return tb - ta;
  });
}

function NotifIcon({ kind }: { kind: NotifKind }) {
  if (kind === "order_placed") return <span className="notif-icon notif-icon-placed"><ShoppingBag size={15} /></span>;
  if (kind === "order_ready") return <span className="notif-icon notif-icon-ready"><Package size={15} /></span>;
  if (kind === "order_on_the_way") return <span className="notif-icon notif-icon-onway"><Truck size={15} /></span>;
  if (kind === "order_delivered" || kind === "order_completed") return <span className="notif-icon notif-icon-done"><PackageCheck size={15} /></span>;
  if (kind === "supplier_shipment") return <span className="notif-icon notif-icon-supplier"><Boxes size={15} /></span>;
  if (kind === "cart_added") return <span className="notif-icon notif-icon-cart"><ShoppingCart size={15} /></span>;
  return <span className="notif-icon notif-icon-default"><CheckCircle2 size={15} /></span>;
}

interface NotificationCenterProps {
  role: RoleName;
  orders: Order[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  users: UserRecord[];
  currentUserId?: number;
  onNavigate: (path: string) => void;
  cartItems?: CartItem[];
  medicines?: Medicine[];
}

export default function NotificationCenter({
  role, orders, suppliers, purchaseOrders, users, currentUserId, onNavigate, cartItems, medicines,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [readSet, setReadSet] = useState<Set<string>>(getReadSet);
  const [tab, setTab] = useState<"all" | "order" | "supplier" | "cart">("all");
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const notifications = buildNotifications(role, orders, suppliers, purchaseOrders, users, currentUserId, cartItems, medicines);
  const unreadCount = notifications.filter((n) => !readSet.has(n.id)).length;
  const filtered = tab === "all" ? notifications : notifications.filter((n) => n.category === tab);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) { setOpen(false); }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function markAllRead() {
    const next = new Set([...readSet, ...notifications.map((n) => n.id)]);
    setReadSet(next); saveReadSet(next);
  }

  function markRead(id: string) {
    const next = new Set([...readSet, id]);
    setReadSet(next); saveReadSet(next);
  }

  function handleNotifClick(notif: Notification) {
    markRead(notif.id); setOpen(false);
    if (notif.linkPath) onNavigate(notif.linkPath);
  }

  return (
    <div className="notif-wrapper">
      <button
        ref={triggerRef}
        id="notification-bell"
        className={`icon-button notice-trigger${open ? " icon-button-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notify-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" ref={panelRef} role="dialog" aria-label="Notifications">
          <div className="notif-header">
            <div className="notif-header-left">
              <strong className="notif-title">Notifications</strong>
              {unreadCount > 0 && <span className="notif-unread-chip">{unreadCount} new</span>}
            </div>
            <div className="notif-header-right">
              {unreadCount > 0 && (
                <button className="notif-mark-all" onClick={markAllRead}>
                  <CheckCircle2 size={13} /> All read
                </button>
              )}
              <button className="notif-close-btn" onClick={() => setOpen(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="notif-tabs">
            <button className={`notif-tab${tab === "all" ? " notif-tab-active" : ""}`} onClick={() => setTab("all")}>All</button>
            <button className={`notif-tab${tab === "order" ? " notif-tab-active" : ""}`} onClick={() => setTab("order")}>
              <ShoppingBag size={11} /> Orders
            </button>
            {role === "customer" && (
              <button className={`notif-tab${tab === "cart" ? " notif-tab-active" : ""}`} onClick={() => setTab("cart")}>
                <ShoppingCart size={11} /> Cart
              </button>
            )}
            {role !== "customer" && (
              <button className={`notif-tab${tab === "supplier" ? " notif-tab-active" : ""}`} onClick={() => setTab("supplier")}>
                <Truck size={11} /> Supplier
              </button>
            )}
          </div>

          <div className="notif-list">
            {filtered.length === 0 ? (
              <div className="notif-empty">
                <BellOff size={28} />
                <span>No notifications here</span>
              </div>
            ) : (
              filtered.map((notif) => {
                const isUnread = !readSet.has(notif.id);
                const dateInfo = formatNotifDate(notif.timestamp);
                return (
                  <button
                    key={notif.id}
                    className={`notif-item${isUnread ? " notif-item-unread" : ""}`}
                    onClick={() => handleNotifClick(notif)}
                  >
                    <NotifIcon kind={notif.kind} />
                    <div className="notif-content">
                      <p className="notif-item-title">{notif.title}</p>
                      <p className="notif-item-body">{notif.body}</p>
                      <span className="notif-time" title={dateInfo.full}>
                        <Clock size={11} className="notif-time-icon" />
                        {dateInfo.display}
                      </span>
                    </div>
                    {isUnread && <span className="notif-unread-dot" aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notif-footer">
              <button className="notif-view-all" onClick={() => { setOpen(false); onNavigate(`/${role}/orders`); }}>
                View all orders →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
