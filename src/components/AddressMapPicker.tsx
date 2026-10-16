import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
// Bundle Leaflet's default marker images locally (served from our own origin)
// instead of an external CDN, so the pin is always visible even when unpkg is
// blocked, offline, or slow on the customer's network.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix for default marker icons in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface AddressMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onLocationSelect: (lat: number, lng: number) => void;
  readOnly?: boolean;
}

const defaultCenter: L.LatLngTuple = [14.5995, 120.9842]; // Manila, Philippines

function LocationMarker({ position, setPosition, readOnly }: { position: L.LatLng | null, setPosition: (pos: L.LatLng) => void, readOnly: boolean }) {
  const map = useMap();

  useMapEvents({
    click(e) {
      if (!readOnly) {
        setPosition(e.latlng);
        map.flyTo(e.latlng, map.getZoom());
      }
    },
  });

  useEffect(() => {
    if (position) {
      map.flyTo(position, map.getZoom());
    }
  }, [position, map]);

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

export function AddressMapPicker({ latitude, longitude, onLocationSelect, readOnly = false }: AddressMapPickerProps) {
  const [position, setPosition] = useState<L.LatLng | null>(
    latitude != null && longitude != null ? new L.LatLng(latitude, longitude) : null
  );
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (latitude != null && longitude != null) {
      setPosition(new L.LatLng(latitude, longitude));
    }
  }, [latitude, longitude]);

  const handlePositionChange = (pos: L.LatLng) => {
    setPosition(pos);
    onLocationSelect(pos.lat, pos.lng);
  };

  const handleGeolocation = () => {
    if ('geolocation' in navigator) {
      setGeoError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latlng = new L.LatLng(pos.coords.latitude, pos.coords.longitude);
          handlePositionChange(latlng);
        },
        (err) => {
          setGeoError("Failed to get location. Please allow location access or select manually.");
        }
      );
    } else {
      setGeoError("Geolocation is not supported by your browser.");
    }
  };

  const center = position ? [position.lat, position.lng] as L.LatLngTuple : defaultCenter;

  return (
    <div className="address-map-picker" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
      <label style={{ fontWeight: 500, fontSize: '0.875rem' }}>Pin Location {readOnly ? '' : '(Optional)'}</label>
      <div style={{ height: '300px', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #d1d5db', position: 'relative', zIndex: 0 }}>
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} setPosition={handlePositionChange} readOnly={readOnly} />
        </MapContainer>
      </div>
      
      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            type="button" 
            onClick={handleGeolocation}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <MapPin size={16} /> Use my current location
          </button>
          
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : "Click on the map to place a pin"}
          </div>
        </div>
      )}
      {geoError && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{geoError}</div>}
    </div>
  );
}
