import { useState, useRef, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Activity, ArrowDownLeft, Boxes, Building2, ClipboardList, LayoutDashboard, LogOut, Menu, PanelLeft, PanelLeftClose, Pin, PinOff, Search, ShieldCheck, ShoppingBag, ShoppingCart, Tags, Users, X } from "lucide-react";
import type { RoleName, Session, Order, Supplier, PurchaseOrder, UserRecord, CartItem, Medicine } from "../lib/pharmacyApi";
import NotificationCenter from "./NotificationCenter";

interface AppShellProps {
  role: RoleName;
  session: Session;
  children: ReactNode;
  onLogout: () => void;
  search: string;
  onSearch: (value: string) => void;
  profileImage?: string | null;
  userProfile?: UserRecord | null;
  orders?: Order[];
  suppliers?: Supplier[];
  purchaseOrders?: PurchaseOrder[];
  users?: UserRecord[];
  cartItems?: CartItem[];
  medicines?: Medicine[];
}

const nav = {
  admin: [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "medicines", label: "Medicines", icon: Boxes },
    { key: "categories", label: "Categories", icon: Tags },
    { key: "suppliers", label: "Suppliers", icon: Building2 },
    { key: "orders", label: "Orders", icon: ClipboardList },
    { key: "users", label: "People", icon: Users },
    { key: "roles", label: "Roles", icon: ShieldCheck },
    { key: "activity", label: "Activity log", icon: Activity },
  ],
  staff: [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "orders", label: "Order queue", icon: ClipboardList },
    { key: "inventory", label: "Inventory", icon: Boxes },
    { key: "categories", label: "Categories", icon: Tags },
    { key: "suppliers", label: "Suppliers", icon: Building2 },
    { key: "activity", label: "My activity", icon: Activity },
  ],
  customer: [
    { key: "overview", label: "Home", icon: LayoutDashboard },
    { key: "shop", label: "Browse medicines", icon: ShoppingBag },
    { key: "cart", label: "My cart", icon: ShoppingCart },
    { key: "orders", label: "My orders", icon: ClipboardList },
    { key: "profile", label: "My profile", icon: Users },
  ],
} satisfies Record<RoleName, { key: string; label: string; icon: typeof LayoutDashboard }[]>;

const roleTitles: Record<RoleName, string> = { admin: "Administrator", staff: "Staff", customer: "Customer space" };

export default function AppShell({ role, session, children, onLogout, search, onSearch, profileImage, userProfile, orders = [], suppliers = [], purchaseOrders = [], users = [], cartItems = [], medicines = [] }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [autoHide, setAutoHide] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("medistock_sidebar_autohide");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefix = `/${role}`;
  const segments = location.split("/").filter(Boolean);
  const current = segments[0] === role ? segments[1] || "overview" : "overview";
  const currentNav = nav[role].find((item) => item.key === current || (item.key === "inventory" && current === "medicines"));
  const pageTitle = currentNav?.label || "Overview";

  // Use the same initials source as the profile page (first name + last name)
  const currentUser = userProfile || users.find((u) => u.userId === session.userId);
  const userInitials = (
    (currentUser?.firstName?.[0] || session.username?.[0] || roleTitles[role]?.[0] || "?") +
    (currentUser?.lastName?.[0] || "")
  ).toUpperCase();
  const initials = userInitials || (session.username || roleTitles[role]).slice(0, 2).toUpperCase();

  const toggleAutoHide = () => {
    setAutoHide((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("medistock_sidebar_autohide", String(next));
      } catch {}
      return next;
    });
    setIsHovered(false);
  };

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 280);
  };

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar auto-hide
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleAutoHide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const go = (path: string) => {
    setLocation(path);
    setMobileOpen(false);
    if (autoHide) {
      setIsHovered(false);
    }
  };

  return (
    <div className={`app-frame ${autoHide ? "frame-autohide" : ""}`}>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      
      {/* Click-away scrim when sidebar is temporarily hovered in auto-hide mode */}
      {autoHide && isHovered && (
        <div className="sidebar-hover-scrim" onClick={() => setIsHovered(false)} aria-hidden="true" />
      )}

      {/* Invisible left edge trigger zone to reveal sidebar on hover */}
      {autoHide && (
        <div
          className="sidebar-edge-zone"
          onMouseEnter={handleMouseEnter}
          onClick={handleMouseEnter}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${autoHide ? "sidebar-autohide" : ""} ${autoHide && isHovered ? "sidebar-revealed" : ""} ${mobileOpen ? "sidebar-open" : ""}`}
        onMouseEnter={autoHide ? handleMouseEnter : undefined}
        onMouseLeave={autoHide ? handleMouseLeave : undefined}
      >
        <div className="brand-lockup" role="button" tabIndex={0} onClick={() => go(prefix)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") go(prefix); }} aria-label="MediStock home">
          <img src="/brand-icon.svg" alt="" className="brand-icon" />
          <span><strong>MediStock</strong><small>pharmacy operations</small></span>
          
          <button
            type="button"
            className={`sidebar-pin-btn ${!autoHide ? "is-pinned" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleAutoHide();
            }}
            title={autoHide ? "Pin sidebar open (Disable auto-hide · Ctrl+B)" : "Auto-hide sidebar (Maximize full screen · Ctrl+B)"}
            aria-label={autoHide ? "Pin sidebar" : "Auto-hide sidebar"}
          >
            {autoHide ? <PinOff size={15} /> : <Pin size={15} />}
          </button>

          <button className="sidebar-close" aria-label="Close menu" onClick={(event) => { event.stopPropagation(); setMobileOpen(false); }}><X size={18} /></button>
        </div>
        <div className="sidebar-role">
          <span>{roleTitles[role]}</span>
          <span className="role-dot" />
          {autoHide && <span className="autohide-badge" title="Auto-hide active: hover left edge to reveal">Auto-hide</span>}
        </div>
        <nav className="nav-list" aria-label={`${roleTitles[role]} navigation`}>
          {nav[role].map(({ key, label, icon: Icon }) => {
            const active = current === key || (key === "inventory" && current === "medicines");
            return <button key={key} className={`nav-item ${active ? "nav-active" : ""}`} onClick={() => go(`${prefix}${key === "overview" ? "" : `/${key === "inventory" ? "medicines" : key}`}`)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {key === "orders" && <span className="nav-arrow"><ArrowDownLeft size={14} /></span>}
            </button>;
          })}
        </nav>
        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <div className="user-avatar">{profileImage ? <img src={profileImage} alt="" style={{ width: "36px", height: "36px", objectFit: "cover", display: "block" }} /> : initials}</div>
          <div className="user-meta"><strong>{session.username || roleTitles[role]}</strong><small>{session.mode === "demo" ? "Sample preview" : roleTitles[role]}</small></div>
          <button className="icon-button logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <button
            type="button"
            className={`desktop-sidebar-toggle icon-button ${autoHide ? "is-autohide" : ""}`}
            onClick={toggleAutoHide}
            title={autoHide ? "Sidebar is in auto-hide mode (Click to pin open · Ctrl+B)" : "Auto-hide sidebar to expand full screen (Ctrl+B)"}
            aria-label={autoHide ? "Pin sidebar open" : "Auto-hide sidebar"}
          >
            {autoHide ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div className="topbar-heading">
            {role === "admin" && current !== "profile" && <span className="eyebrow">{roleTitles[role]}</span>}
            {current !== "profile" && <h1>{pageTitle}</h1>}
          </div>
          <label className="global-search"><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search this workspace…" aria-label="Search this workspace" />{search && <button type="button" className="clear-search" onClick={() => onSearch("")} aria-label="Clear search"><X size={14} /></button>}</label>
          <div className="topbar-actions">
            <NotificationCenter
              role={role}
              orders={orders}
              suppliers={suppliers}
              purchaseOrders={purchaseOrders}
              users={users}
              currentUserId={session.userId}
              onNavigate={(path) => go(path)}
              cartItems={cartItems}
              medicines={medicines}
            />
            <button className="avatar-button" onClick={() => go(`/${role}/profile`)} title="My profile">{profileImage ? <img src={profileImage} alt="" style={{ width: "36px", height: "36px", objectFit: "cover", display: "block" }} /> : initials}</button>
          </div>
        </header>
        {session.mode === "demo" && <div className="demo-banner"><span className="demo-banner-dot" /><strong>Sample preview</strong><span>Fictional sample records only; demo edits reset when you refresh. Nothing here is live pharmacy data.</span><button onClick={() => go("/settings")}>Connect your API</button></div>}
        <section className="page-content">{children}</section>
      </main>
    </div>
  );
}
