// Leaflet map for the Workers screen (Workflow 3).
//
//  - Three looks, switchable on the map: Night (default: dark basemap, glowing
//    dots and rings, a slow radar sweep), Streets (full-colour OpenStreetMap)
//    and Satellite. All are free tile services that need no API key.
//  - Distance rings at 1, 3 and 5 km, labelled on the map; 5 km is the search
//    limit ($geoNear maxDistance: 5000)
//  - One ripple from the job site each time the job site changes
//  - One dot per result, coloured by how fresh the location is; workers busy on
//    a gig get an amber ring; new dots pop; clicking a list row flies here
//
// CircleMarker (SVG) and divIcon (HTML) instead of Leaflet's default Marker:
// default markers load PNG icons by relative URL, which Vite's bundling breaks.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Pane, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { formatAge } from '../../lib/format.js';
import { chartColors } from '../../lib/theme.js';

export const RADIUS_M = 5000;
const RINGS_M = [1000, 3000, RADIUS_M];
const METERS_PER_DEGREE_LAT = 111_320;
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_CREDIT = 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

/** color = list avatars (readable with white text); dot = map dots (bright, glow on dark maps). */
export const AGE_BUCKETS = [
  { maxSeconds: 120, color: chartColors.success, dot: '#34d399', className: 'dot-fresh', label: 'Seen in the last 2 min' },
  { maxSeconds: 900, color: chartColors.info, dot: '#60a5fa', className: 'dot-recent', label: '2–15 min ago' },
  { maxSeconds: Infinity, color: '#7c8786', dot: '#a3aab5', className: 'dot-old', label: 'Over 15 min ago' },
];
const bucketFor = (s) => AGE_BUCKETS.find((b) => s < b.maxSeconds);
export const colorForAge = (s) => bucketFor(s).color;
const BUSY = '#fbbf24';

export const MAP_STYLES = [
  { id: 'night', label: 'Night' },
  { id: 'streets', label: 'Streets' },
  { id: 'satellite', label: 'Satellite' },
];

function Basemap({ look }) {
  if (look === 'streets') {
    return (
      <TileLayer
        key="streets"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
    );
  }
  if (look === 'satellite') {
    return (
      <>
        <TileLayer key="sat" attribution={ESRI_CREDIT} url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`} maxZoom={19} />
        <TileLayer key="sat-labels" url={`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`} maxZoom={19} />
      </>
    );
  }
  return (
    <>
      <TileLayer key="night" attribution={ESRI_CREDIT} url={`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`} maxZoom={16} />
      <TileLayer key="night-labels" url={`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`} maxZoom={16} />
    </>
  );
}

/** Frame the whole 5 km circle whenever the job site moves (or fitKey changes). */
function FitToOrigin({ lat, lng, fitKey }) {
  const map = useMap();
  useEffect(() => {
    const dLat = 0.0462; // a little over 5 km
    const dLng = 0.0462 / Math.cos((lat * Math.PI) / 180);
    const fit = () => {
      // The grid around the map can still be settling on first render; measure again first.
      map.invalidateSize();
      map.fitBounds(
        [
          [lat - dLat, lng - dLng],
          [lat + dLat, lng + dLng],
        ],
        { padding: [8, 8] },
      );
    };
    fit();
    const t = setTimeout(fit, 300);
    return () => clearTimeout(t);
  }, [lat, lng, fitKey, map]);
  return null;
}

/** Fly to a worker picked in the list. `focus` changes identity on every pick. */
function FlyToFocus({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [focus, map]);
  return null;
}

/** Keep the tile providers' required credit, drop Leaflet's own "Leaflet" link (optional). */
function QuietCredit() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl.setPrefix(false);
  }, [map]);
  return null;
}

/** Clicking the map picks a custom job site. */
function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/**
 * A radar sweep filling the 5 km circle. It is an HTML marker sized to the
 * circle in pixels (recomputed on zoom) in its own pane under the dots.
 */
function RadarSweep({ lat, lng }) {
  const map = useMap();
  const radiusPx = () => {
    const c = map.latLngToLayerPoint([lat, lng]);
    const edge = map.latLngToLayerPoint([lat + RADIUS_M / METERS_PER_DEGREE_LAT, lng]);
    return Math.max(10, Math.round(c.y - edge.y));
  };
  const [r, setR] = useState(radiusPx);
  useMapEvents({ zoomend: () => setR(radiusPx()), resize: () => setR(radiusPx()) });
  useEffect(() => setR(radiusPx()), [lat, lng]);
  // Build the icon only when the size changes. A new icon object makes Leaflet
  // replace the element, which would restart the sweep on every page re-render
  // (the page re-renders every second to keep the "seen N s ago" ages live).
  const icon = useMemo(
    () => L.divIcon({ className: 'radar-host', html: '<div class="radar"></div>', iconSize: [2 * r, 2 * r], iconAnchor: [r, r] }),
    [r],
  );
  return <Marker position={[lat, lng]} icon={icon} pane="radar" interactive={false} keyboard={false} />;
}

// Created once per distance and reused, for the same reason as the radar icon.
const RING_LABEL_ICONS = new Map();
const ringLabelIcon = (km) => {
  if (!RING_LABEL_ICONS.has(km)) {
    RING_LABEL_ICONS.set(km, L.divIcon({ className: 'ring-label', html: `<span>${km} km</span>`, iconSize: [44, 18], iconAnchor: [22, 9] }));
  }
  return RING_LABEL_ICONS.get(km);
};

const jobSiteIcon = L.divIcon({
  className: 'job-site-pin',
  html: '<span class="job-site-pin-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/**
 * Props:
 *   origin       { lat, lng, label }
 *   results      [{ pingId, freelancerId, name, lat, lng, distanceKm, age, busy }]
 *   newIds       Set of pingIds that appeared since the previous update
 *   highlightId  pingId hovered in the list
 *   focus        { lat, lng } to fly to (a new object each time)
 *   fitKey       changing it frames the whole 5 km area again
 *   look         'night' | 'streets' | 'satellite'
 */
export function WorkerMap({ origin, results, newIds, highlightId, onHighlight, onPick, focus, fitKey, look = 'night' }) {
  const center = [origin.lat, origin.lng];
  const originKey = `${origin.lat},${origin.lng}`;
  const dark = look !== 'streets';
  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomSnap={0.25}
      scrollWheelZoom
      className={`worker-map worker-map-${look}`}
      aria-label="Map of nearby workers"
    >
      <Basemap look={look} />
      <QuietCredit />
      <FitToOrigin lat={origin.lat} lng={origin.lng} fitKey={fitKey} />
      <FlyToFocus focus={focus} />
      <ClickToPick onPick={onPick} />

      <Pane name="radar" style={{ zIndex: 350 }}>
        <RadarSweep lat={origin.lat} lng={origin.lng} />
      </Pane>

      {RINGS_M.map((r) => (
        <Circle
          key={`${look}-${r}`}
          center={center}
          radius={r}
          interactive={false}
          pathOptions={
            r === RADIUS_M
              ? { color: dark ? '#2dd4bf' : chartColors.accent, weight: 2, dashArray: '8 6', fillColor: '#2dd4bf', fillOpacity: dark ? 0.06 : 0.05, className: 'ring-outer' }
              : { color: dark ? '#ffffff' : '#17233b', weight: 1.2, opacity: dark ? 0.32 : 0.4, dashArray: '2 6', fill: false }
          }
        />
      ))}
      {RINGS_M.map((r) => (
        <Marker
          key={`label-${r}`}
          position={[origin.lat + r / METERS_PER_DEGREE_LAT, origin.lng]}
          icon={ringLabelIcon(r / 1000)}
          interactive={false}
          keyboard={false}
        />
      ))}

      {/* Ripple: remounts (and so replays) whenever the job site changes */}
      <Circle
        key={`ripple-${originKey}`}
        center={center}
        radius={RADIUS_M}
        interactive={false}
        pathOptions={{ color: '#2dd4bf', weight: 2, fillColor: '#2dd4bf', fillOpacity: 0.16, className: 'ring-ripple' }}
      />

      {results.map((r) => {
        const highlighted = r.pingId === highlightId;
        const bucket = bucketFor(r.age);
        return (
          <CircleMarker
            key={r.pingId}
            center={[r.lat, r.lng]}
            radius={highlighted ? 11 : 7}
            pathOptions={{
              color: r.busy ? BUSY : dark ? 'rgba(255,255,255,0.85)' : '#ffffff',
              weight: highlighted ? 3 : r.busy ? 2.5 : 1.5,
              fillColor: bucket.dot,
              fillOpacity: 1,
              className: `worker-dot ${bucket.className}${newIds.has(r.pingId) ? ' ping-new' : ''}`,
            }}
            eventHandlers={{ mouseover: () => onHighlight(r.pingId), mouseout: () => onHighlight(null) }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{r.name}</strong>
                <span>
                  {r.distanceKm.toFixed(2)} km away, seen {formatAge(r.age)}
                </span>
                {r.busy && <span className="map-popup-busy">Working on a gig right now</span>}
                <Link to={`/freelancers/${r.freelancerId}`}>View profile</Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      <Marker position={center} icon={jobSiteIcon} keyboard={false} title={origin.label} zIndexOffset={1000} />
    </MapContainer>
  );
}

export { BUSY as BUSY_COLOR };
