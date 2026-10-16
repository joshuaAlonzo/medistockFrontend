import { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Order, UserRecord } from "../lib/pharmacyApi";
// Bundle Leaflet's default marker images locally
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet default marker icons for bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Delivered customer marker icon — vibrant emerald/teal
const deliveredMarkerIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  className: "leaflet-marker-delivered",
});

// Highlighted (active/selected) marker icon
const activeMarkerIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [28, 46],
  iconAnchor: [14, 46],
  popupAnchor: [0, -42],
  className: "leaflet-marker-active",
});

export interface AreaCoord {
  lat: number;
  lng: number;
  address: string;
  orderId: number;
  userId?: number;
  customerName?: string;
  status?: string;
  totalAmount?: number;
  isDelivered?: boolean;
}

export interface AreaEntry {
  area: string;
  count: number;
  pct: number;
  /** Representative coordinates for mapped orders in this area */
  coords: AreaCoord[];
}

/** Check if an order status means the order has already been delivered */
export function isDelivered(status?: string | null): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === "delivered" || s === "completed" || s.includes("delivered") || s.includes("completed");
}

/** Derive the area label from a delivery address the same way the admin overview does */
export function extractArea(deliveryAddress: string): string {
  const parts = deliveryAddress.split(",");
  let area = parts[parts.length - 1].trim();
  area = area.replace(/\s+/g, " ").toLowerCase();
  area = area.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return area || "Unknown";
}

/** Known Philippine landmarks and city center fallback dictionary */
const KNOWN_PH_LOCATIONS: Array<{ keywords: string[]; lat: number; lng: number }> = [
  { keywords: ["banicain", "olongapo"], lat: 14.8394, lng: 120.2840 },
  { keywords: ["olongapo"], lat: 14.8386, lng: 120.2842 },
  { keywords: ["subic"], lat: 14.8776, lng: 120.2343 },
  { keywords: ["zambales"], lat: 15.3235, lng: 119.9839 },
  { keywords: ["region iii", "central luzon"], lat: 15.4828, lng: 120.7120 },
  { keywords: ["manila"], lat: 14.5995, lng: 120.9842 },
  { keywords: ["quezon city"], lat: 14.6760, lng: 121.0437 },
  { keywords: ["makati"], lat: 14.5547, lng: 121.0244 },
  { keywords: ["pasig"], lat: 14.5764, lng: 121.0851 },
  { keywords: ["taguig"], lat: 14.5176, lng: 121.0509 },
  { keywords: ["cebu"], lat: 10.3157, lng: 123.8854 },
  { keywords: ["davao"], lat: 7.1907, lng: 125.4553 },
  { keywords: ["pampanga", "san fernando"], lat: 15.0286, lng: 120.6896 },
  { keywords: ["angeles"], lat: 15.1450, lng: 120.5887 },
  { keywords: ["bataan", "balanga"], lat: 14.6806, lng: 120.5414 },
];

export function findKnownPhilippineLocation(addr: string): { lat: number; lng: number } | null {
  const lower = addr.toLowerCase();
  for (const loc of KNOWN_PH_LOCATIONS) {
    if (loc.keywords.some((kw) => lower.includes(kw))) {
      return { lat: loc.lat, lng: loc.lng };
    }
  }
  return null;
}

/** Single shared aggregation used by both the text list and the map */
export function aggregateDeliveryAreas(
  orders: Order[],
  users?: UserRecord[],
  geoCache: Record<string, { lat: number; lng: number }> = {}
): {
  topAreas: AreaEntry[];
  sortedAreas: AreaEntry[];
  totalOrdersWithArea: number;
  mappedOrderCount: number;
} {
  const areaMap = new Map<string, { count: number; coords: AreaCoord[] }>();

  for (const order of orders) {
    if (!order.deliveryAddress) continue;
    const area = extractArea(order.deliveryAddress);
    if (!area || area === "Unknown") continue;

    if (!areaMap.has(area)) areaMap.set(area, { count: 0, coords: [] });
    const entry = areaMap.get(area)!;
    entry.count += 1;

    // Check order coordinates
    let lat: number | null =
      order.deliveryLatitude != null && Math.abs(order.deliveryLatitude) <= 90
        ? order.deliveryLatitude
        : null;
    let lng: number | null =
      order.deliveryLongitude != null && Math.abs(order.deliveryLongitude) <= 180
        ? order.deliveryLongitude
        : null;

    // If coordinates are missing, automatically look up customer's profile coordinates
    if (lat == null || lng == null) {
      const customer = users?.find((u) => u.userId === order.userId);
      if (
        customer?.latitude != null &&
        customer?.longitude != null &&
        Math.abs(customer.latitude) <= 90 &&
        Math.abs(customer.longitude) <= 180
      ) {
        lat = customer.latitude;
        lng = customer.longitude;
      }
    }

    // If still missing, check geocode cache or known Philippine locations
    if (lat == null || lng == null) {
      const normAddr = order.deliveryAddress.trim().toLowerCase();
      if (geoCache[normAddr]) {
        lat = geoCache[normAddr].lat;
        lng = geoCache[normAddr].lng;
      } else {
        const known = findKnownPhilippineLocation(order.deliveryAddress);
        if (known) {
          lat = known.lat;
          lng = known.lng;
        }
      }
    }

    if (lat != null && lng != null) {
      const customer = users?.find((u) => u.userId === order.userId);
      const customerName = customer
        ? `${customer.firstName} ${customer.lastName}`.trim() || customer.username
        : `Customer #${order.userId}`;

      entry.coords.push({
        lat,
        lng,
        address: order.deliveryAddress,
        orderId: order.orderId,
        userId: order.userId,
        customerName,
        status: order.orderStatus,
        totalAmount: order.totalAmount,
        isDelivered: isDelivered(order.orderStatus),
      });
    }
  }

  const totalOrdersWithArea = [...areaMap.values()].reduce((s, v) => s + v.count, 0);
  const sortedEntries = [...areaMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([area, { count, coords }]) => ({
      area,
      count,
      pct: totalOrdersWithArea > 0 ? Math.round((count / totalOrdersWithArea) * 100) : 0,
      coords,
    }));

  const mappedOrderCount = sortedEntries.reduce(
    (s, e) => s + e.coords.length,
    0
  );

  return {
    topAreas: sortedEntries.slice(0, 5),
    sortedAreas: sortedEntries,
    totalOrdersWithArea,
    mappedOrderCount,
  };
}

// --- Map flyTo helper (reads selectedArea from parent) ---
function MapFlyTo({ center, zoom }: { center: L.LatLngTuple; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { animate: true, duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

// --- Automatically fit map bounds to cover all customer pins ---
function MapBoundsFitter({ markers }: { markers: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (markers.length === 0) return;
    const currentKey = markers.map((m) => `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`).join("|");
    if (lastKeyRef.current === currentKey) return;
    lastKeyRef.current = currentKey;

    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 13);
    } else {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
    }
  }, [markers, map]);

  return null;
}

const DEFAULT_CENTER: L.LatLngTuple = [14.8394, 120.2840]; // Default around active delivery hub / Philippines

interface DeliveryAreaMapProps {
  orders: Order[];
  users?: UserRecord[];
}

export default function DeliveryAreaMap({ orders, users }: DeliveryAreaMapProps) {
  // Load and persist geocode cache from localStorage for fast offline instant pin
  const [geoCache, setGeoCache] = useState<Record<string, { lat: number; lng: number }>>(() => {
    try {
      const saved = localStorage.getItem("medistock_geo_cache");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Background geocode any orders that have an address but no coordinates yet
  useEffect(() => {
    let isCancelled = false;
    const missingOrders = orders.filter((o) => {
      if (!o.deliveryAddress) return false;
      const norm = o.deliveryAddress.trim().toLowerCase();
      if (geoCache[norm] || findKnownPhilippineLocation(o.deliveryAddress)) return false;
      if (o.deliveryLatitude != null && o.deliveryLongitude != null) return false;
      const user = users?.find((u) => u.userId === o.userId);
      if (user?.latitude != null && user?.longitude != null) return false;
      return true;
    });

    if (missingOrders.length === 0) return;

    // Pick first missing order and resolve gently
    const target = missingOrders[0];
    if (!target.deliveryAddress) return;
    const targetAddr = target.deliveryAddress.trim();
    const norm = targetAddr.toLowerCase();

    const timer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(targetAddr)}&limit=1`;
        const resp = await fetch(url, { headers: { "Accept-Language": "en" } });
        if (!resp.ok) return;
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0 && !isCancelled) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lng)) {
            setGeoCache((prev) => {
              const updated = { ...prev, [norm]: { lat, lng } };
              try {
                localStorage.setItem("medistock_geo_cache", JSON.stringify(updated));
              } catch { /* ignore */ }
              return updated;
            });
          }
        }
      } catch {
        // Silently skip if network error or rate limited
      }
    }, 1200);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [orders, users, geoCache]);

  const { topAreas, sortedAreas, totalOrdersWithArea, mappedOrderCount } = useMemo(
    () => aggregateDeliveryAreas(orders, users, geoCache),
    [orders, users, geoCache]
  );
  const topAreaMax = topAreas.length > 0 ? topAreas[0].count : 1;

  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ center: L.LatLngTuple; zoom: number } | null>(null);
  const markerRefs = useRef<Record<string, L.Marker>>({});

  // Collect all mapped markers from all areas so all delivered customer pins appear
  const allMarkers = useMemo(() => {
    return sortedAreas.flatMap((entry) =>
      entry.coords.map((c) => ({
        ...c,
        area: entry.area,
        count: entry.count,
        pct: entry.pct,
      }))
    );
  }, [sortedAreas]);

  function handleAreaClick(area: AreaEntry) {
    setSelectedArea(area.area);
    if (area.coords.length > 0) {
      const first = area.coords[0];
      setFlyTarget({ center: [first.lat, first.lng], zoom: 14 });
      const key = `${area.area}-${first.orderId}`;
      setTimeout(() => {
        markerRefs.current[key]?.openPopup();
      }, 150);
    }
  }

  // Initial center: if markers exist, use the first marker, else Philippines center
  const initialCenter = allMarkers.length > 0 ? [allMarkers[0].lat, allMarkers[0].lng] as L.LatLngTuple : DEFAULT_CENTER;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Card body: list + map side by side on desktop */}
      <div
        className="delivery-area-card-body"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1fr) minmax(300px, 1.6fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Left: text list */}
        <div className="delivery-area-list">
          {topAreas.length > 0 ? (
            <ul className="delivery-area-items">
              {topAreas.map((entry, index) => {
                const isActive = selectedArea === entry.area;
                const hasPin = entry.coords.length > 0;
                return (
                  <li key={entry.area}>
                    <button
                      type="button"
                      className={`delivery-area-item${isActive ? " is-active" : ""}`}
                      onClick={() => handleAreaClick(entry)}
                      aria-pressed={isActive}
                      title={hasPin ? `Focus ${entry.area} on the map` : `${entry.area} — awaiting map coordinates`}
                    >
                      <span className="delivery-area-rank">{index + 1}</span>
                      <span className="delivery-area-body">
                        <span className="delivery-area-head">
                          <span className="delivery-area-name">{entry.area}</span>
                          {hasPin ? (
                            <span className="delivery-area-badge is-pinned" title="Customer location pinned on the map">
                              📍 Pinned
                            </span>
                          ) : (
                            <span className="delivery-area-badge" title="Location will pin automatically upon delivery">
                              No pin
                            </span>
                          )}
                        </span>
                        <span className="delivery-area-meta">{entry.count} order{entry.count !== 1 ? "s" : ""}</span>
                        <span className="delivery-area-track">
                          <span
                            className="delivery-area-fill"
                            style={{ width: `${Math.max(3, (entry.count / topAreaMax) * 100)}%` }}
                          />
                        </span>
                      </span>
                      <span className="delivery-area-pct">{entry.pct}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="delivery-area-empty">
              No delivery data yet. Areas will appear once orders with addresses are processed.
            </p>
          )}

          <p className="delivery-area-footer">
            <strong>{sortedAreas.length}</strong> total area{sortedAreas.length !== 1 ? "s" : ""}
            <span className="delivery-area-dot">·</span>
            <strong>{totalOrdersWithArea}</strong> orders with address
          </p>
        </div>

        {/* Right: Real Interactive OpenStreetMap pane (Always displayed) */}
        <div
          style={{
            height: 310,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid var(--border)",
            background: "var(--surface, #f8fafc)",
            position: "relative",
            zIndex: 0,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          {/* Top floating status badge */}
          <div className="delivery-map-status-pill">
            <span className={`delivery-map-pulse-dot${mappedOrderCount === 0 ? " is-waiting" : ""}`} />
            {mappedOrderCount > 0 ? (
              <span><strong>{mappedOrderCount}</strong> customer location{mappedOrderCount !== 1 ? "s" : ""} pinned</span>
            ) : (
              <span>Live map ready · Pins appear automatically after orders are delivered</span>
            )}
          </div>

          <MapContainer
            center={initialCenter}
            zoom={allMarkers.length > 0 ? 12 : 7}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBoundsFitter markers={allMarkers} />
            {flyTarget && <MapFlyTo center={flyTarget.center} zoom={flyTarget.zoom} />}
            {allMarkers.map((m) => {
              const key = `${m.area}-${m.orderId}`;
              const isActive = selectedArea === m.area;
              return (
                <Marker
                  key={key}
                  position={[m.lat, m.lng]}
                  icon={isActive ? activeMarkerIcon : deliveredMarkerIcon}
                  ref={(ref) => {
                    if (ref) markerRefs.current[key] = ref;
                  }}
                  eventHandlers={{
                    click: () => setSelectedArea(m.area),
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: 190, fontSize: "12px", lineHeight: 1.5 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                        <strong style={{ fontSize: "13px", color: "#111827" }}>{m.area}</strong>
                        <span style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: m.isDelivered ? "#d1fae5" : "#e0f2fe",
                          color: m.isDelivered ? "#065f46" : "#0369a1",
                        }}>
                          {m.isDelivered ? "✓ Delivered" : (m.status || "In Transit")}
                        </span>
                      </div>
                      {m.customerName && (
                        <span style={{ display: "block", color: "#374151", fontWeight: 600, fontSize: "11.5px", marginBottom: 2 }}>
                          👤 {m.customerName}
                        </span>
                      )}
                      <span style={{ display: "block", color: "#6b7280", fontSize: "11px", marginBottom: 5 }}>
                        Order #{m.orderId}{m.totalAmount != null ? ` · ₱${m.totalAmount.toFixed(2)}` : ""}
                      </span>
                      <hr style={{ margin: "5px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />
                      <span style={{ display: "block", color: "#9ca3af", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                        Delivery Destination:
                      </span>
                      <span style={{ display: "block", color: "#1f2937", fontSize: "11.5px", marginTop: 2 }}>
                        📍 {m.address}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Component-scoped styles + responsive behavior */}
      <style>{`
        .delivery-area-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .delivery-area-items {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .delivery-area-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 10px 12px;
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .delivery-area-item:hover {
          background: var(--surface-hover, #f4f7f6);
        }
        .delivery-area-item:focus-visible {
          outline: 2px solid var(--accent, #0d9488);
          outline-offset: 2px;
        }
        .delivery-area-item.is-active {
          background: var(--surface-hover, #eefaf6);
          border-color: color-mix(in srgb, var(--accent, #0d9488) 35%, transparent);
          box-shadow: inset 3px 0 0 0 var(--accent, #0d9488);
        }
        .delivery-area-rank {
          flex: 0 0 auto;
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
          background: var(--surface-hover, #eef1f0);
          border-radius: 8px;
        }
        .delivery-area-item.is-active .delivery-area-rank {
          color: #fff;
          background: var(--accent, #0d9488);
        }
        .delivery-area-body {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .delivery-area-head {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .delivery-area-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .delivery-area-badge {
          flex: 0 0 auto;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--text-secondary);
          background: var(--surface-hover, #eef1f0);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 1px 7px;
          white-space: nowrap;
        }
        .delivery-area-badge.is-pinned {
          color: #047857;
          background: #ecfdf5;
          border-color: #a7f3d0;
        }
        .delivery-area-meta {
          font-size: 11.5px;
          color: var(--text-secondary);
        }
        .delivery-area-track {
          display: block;
          margin-top: 3px;
          height: 6px;
          width: 100%;
          background: var(--border);
          border-radius: 999px;
          overflow: hidden;
        }
        .delivery-area-fill {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: var(--accent, #0d9488);
          transition: width 0.3s ease;
        }
        .delivery-area-pct {
          flex: 0 0 auto;
          align-self: flex-start;
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .delivery-area-footer {
          margin: 12px 2px 0;
          font-size: 11.5px;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .delivery-area-footer strong {
          color: var(--text-primary);
          font-weight: 700;
        }
        .delivery-area-dot {
          opacity: 0.6;
        }
        .delivery-area-empty {
          color: var(--text-secondary);
          font-size: 0.875rem;
          line-height: 1.5;
          margin: 8px 2px;
        }
        .delivery-map-status-pill {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 1000;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 4px 11px;
          font-size: 11px;
          font-weight: 600;
          color: #1e293b;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 999px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
          pointer-events: none;
        }
        .delivery-map-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
        }
        .delivery-map-pulse-dot.is-waiting {
          background: #94a3b8;
          box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.25);
        }
        @media (max-width: 640px) {
          .delivery-area-card-body {
            grid-template-columns: 1fr !important;
          }
        }
        .leaflet-marker-delivered {
          filter: hue-rotate(85deg) saturate(1.8) drop-shadow(0 2px 4px rgba(16, 185, 129, 0.35));
        }
        .leaflet-marker-active {
          filter: hue-rotate(140deg) saturate(2.5) drop-shadow(0 4px 8px rgba(13, 148, 136, 0.5));
          z-index: 1000 !important;
        }
      `}</style>
    </div>
  );
}
