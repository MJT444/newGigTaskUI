// Leaflet map for Workflow 3.
//
//  - OpenStreetMap tiles (no API key; needs internet in the browser)
//  - dashed 5 km circle = the $geoNear maxDistance (5000 m)
//  - the job site as a large teal dot (origin)
//  - one dot per result, coloured by ping age; new pings pulse; busy workers
//    (a gig in progress in PostgreSQL) get an orange ring
//
// CircleMarker (SVG) instead of Leaflet's default Marker: default markers load
// PNG icons by relative URL, which Vite's bundling breaks (invisible markers).
import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { formatAge } from '../../lib/format.js';
import { chartColors } from '../../lib/theme.js';

const RADIUS_M = 5000;

export const AGE_BUCKETS = [
  { maxSeconds: 120, color: chartColors.success, label: '< 2 min' },
  { maxSeconds: 900, color: chartColors.info, label: '2–15 min' },
  { maxSeconds: Infinity, color: '#7c8786', label: '> 15 min' },
];
export const colorForAge = (s) => AGE_BUCKETS.find((b) => s < b.maxSeconds).color;

/** Frame the whole 5 km circle whenever the origin moves. */
function FitToOrigin({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    const dLat = 0.047; // ~5.2 km
    const dLng = 0.047 / Math.cos((lat * Math.PI) / 180);
    map.fitBounds(
      [
        [lat - dLat, lng - dLng],
        [lat + dLat, lng + dLng],
      ],
      { padding: [12, 12] },
    );
  }, [lat, lng, map]);
  return null;
}

/** Clicking the map picks a custom job site. */
function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/**
 * Props:
 *   origin       object with lat, lng, label
 *   results      array of pingId, name, lat, lng, distanceKm, age (seconds, live), busy
 *   newIds       Set of pingIds that appeared since the previous poll
 *   highlightId  pingId hovered in the list
 */
export function WorkerMap({ origin, results, newIds, highlightId, onHighlight, onPick }) {
  return (
    <MapContainer center={[origin.lat, origin.lng]} zoom={13} scrollWheelZoom className="worker-map" aria-label="Map of nearby workers">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToOrigin lat={origin.lat} lng={origin.lng} />
      <ClickToPick onPick={onPick} />

      <Circle
        center={[origin.lat, origin.lng]}
        radius={RADIUS_M}
        pathOptions={{ color: chartColors.accent, weight: 1.5, fillColor: chartColors.accent, fillOpacity: 0.05, dashArray: '6 6' }}
        interactive={false}
      />

      {results.map((r) => {
        const highlighted = r.pingId === highlightId;
        return (
          <CircleMarker
            key={r.pingId}
            center={[r.lat, r.lng]}
            radius={highlighted ? 11 : 7}
            pathOptions={{
              color: r.busy ? chartColors.warning : '#ffffff',
              weight: highlighted ? 3 : r.busy ? 2.5 : 1.5,
              fillColor: colorForAge(r.age),
              fillOpacity: 0.95,
              className: newIds.has(r.pingId) ? 'ping-new' : undefined,
            }}
            eventHandlers={{ mouseover: () => onHighlight(r.pingId), mouseout: () => onHighlight(null) }}
          >
            <Popup>
              <strong>{r.name}</strong>
              <br />
              {r.distanceKm.toFixed(2)} km away · pinged {formatAge(r.age)}
              {r.busy && (
                <>
                  <br />
                  Has a gig in progress
                </>
              )}
            </Popup>
          </CircleMarker>
        );
      })}

      <CircleMarker center={[origin.lat, origin.lng]} radius={10} pathOptions={{ color: '#ffffff', weight: 3, fillColor: chartColors.accent, fillOpacity: 1 }}>
        <Tooltip direction="top" offset={[0, -8]} permanent>
          {origin.label}
        </Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
