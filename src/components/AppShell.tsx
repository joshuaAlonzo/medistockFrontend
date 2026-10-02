import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Activity, ArrowDownLeft, ArrowLeftRight, Bell, Boxes, Building2, ClipboardList, LayoutDashboard, LogOut, Menu, Search, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Tags, Users, X } from "lucide-react";
import type { RoleName, Session } from "../lib/pharmacyApi";

interface AppShellProps {
  role: RoleName;
  session: Session;
  children: ReactNode;
  onLogout: () => void;
  search: string;
  onSearch: (value: string) => void;
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

const roleTitles: Record<RoleName, string> = { admin: "Administrator", staff: "Staff workspace", customer: "Customer space" };

export default function AppShell({ role, session, children, onLogout, search, onSearch }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const prefix = `/${role}`;
  const segments = location.split("/").filter(Boolean);
  const current = segments[0] === role ? segments[1] || "overview" : "overview";
  const currentNav = nav[role].find((item) => item.key === current || (item.key === "inventory" && current === "medicines"));
  const pageTitle = currentNav?.label || "Overview";
  const initials = (session.username || roleTitles[role]).slice(0, 2).toUpperCase();

  const go = (path: string) => {
    setLocation(path);
    setMobileOpen(false);
  };

  return (
    <div className="app-frame">
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup" role="button" tabIndex={0} onClick={() => go(prefix)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") go(prefix); }} aria-label="MediStock home">
          <img src="/brand-icon.svg" alt="" className="brand-icon" />
          <span><strong>MediStock</strong><small>pharmacy operations</small></span>
          <button className="sidebar-close" aria-label="Close menu" onClick={(event) => { event.stopPropagation(); setMobileOpen(false); }}><X size={18} /></button>
        </div>
        <div className="sidebar-role">{roleTitles[role]}<span className="role-dot" /></div>
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
        <button className="nav-item quiet-nav" onClick={() => go("/settings")}><Settings size={18} /><span>API connection</span></button>
        <div className="sidebar-footer">
          <div className="user-avatar">{initials}</div>
          <div className="user-meta"><strong>{session.username || roleTitles[role]}</strong><small>{session.mode === "demo" ? "Sample preview" : roleTitles[role]}</small></div>
          <button className="icon-button logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="topbar-heading"><span className="eyebrow">{roleTitles[role]}</span><h1>{pageTitle}</h1></div>
          <label className="global-search"><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search this workspace…" aria-label="Search this workspace" />{search && <button type="button" className="clear-search" onClick={() => onSearch("")} aria-label="Clear search"><X size={14} /></button>}</label>
          <div className="topbar-actions">
            <button className={`icon-button notice-trigger ${noticeOpen ? "icon-button-active" : ""}`} onClick={() => setNoticeOpen(!noticeOpen)} aria-label="Connection status"><Bell size={18} /><span className="notify-dot" /></button>
            <button className="avatar-button" onClick={() => go(role === "customer" ? "/customer/profile" : "/settings")} title="Account / settings">{initials}</button>
          </div>
          {noticeOpen && <div className="notice-popover"><strong>Workspace status</strong><p>{session.mode === "demo" ? "Sample data is active. No live API records are displayed." : "API mode is active. Data availability depends on your API connection."}</p><button className="text-button" onClick={() => go("/settings")}>Open API settings <ArrowLeftRight size={13} /></button></div>}
        </header>
        {session.mode === "demo" && <div className="demo-banner"><span className="demo-banner-dot" /><strong>Sample preview</strong><span>Fictional sample records only; demo edits reset when you refresh. Nothing here is live pharmacy data.</span><button onClick={() => go("/settings")}>Connect your API</button></div>}
        <section className="page-content">{children}</section>
      </main>
    </div>
  );
}
