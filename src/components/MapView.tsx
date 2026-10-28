import L from 'leaflet';
import { useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { FALLBACK_CENTER, SALAH_LABELS } from '../lib/config';
import { beaconIcon, draftIcon, userIcon } from '../lib/markerIcons';
import { destinationPoint, qiblaBearing } from '../lib/qibla';
import { getStatus } from '../lib/time';
import type { Beacon, Coords } from '../lib/types';

interface Props {
  beacons: Beacon[];
  now: number;
  selectedId: string | null;
  confirmId: string | null;
  userLocation: Coords | null;
  userAccuracy: number | null;
  draftLocation: Coords | null;
  /** Draw the qibla direction from this point. */
  qiblaFrom: Coords | null;
  onReady: (map: L.Map | null) => void;
  onSelect: (beacon: Beacon) => void;
  onMapClick: (coords: Coords) => void;
  onDraftMove: (coords: Coords) => void;
}

const QIBLA_LINE_PX = 150;

/** A short line towards Makkah. Only the start of the great circle is straight on the map, so keep it short. */
function QiblaLine({ from }: { from: Coords }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const bearing = qiblaBearing(from);
  // Web Mercator: metres per pixel at this latitude and zoom.
  const metresPerPx = (156543.03392 * Math.cos((from[0] * Math.PI) / 180)) / 2 ** zoom;
  const to = destinationPoint(from, bearing, QIBLA_LINE_PX * metresPerPx);
  const arrow = L.divIcon({
    className: 'beacon-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="qibla-arrow" style="transform: rotate(${bearing}deg)"></div>`,
  });

  return (
    <>
      <Polyline positions={[from, to]} interactive={false} pathOptions={{ color: '#047857', weight: 4, dashArray: '8 8', opacity: 0.9 }} />
      <Marker position={to} icon={arrow} interactive={false} keyboard={false} />
    </>
  );
}

function ClickHandler({ onClick }: { onClick: (coords: Coords) => void }) {
  useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

export function MapView({
  beacons,
  now,
  selectedId,
  confirmId,
  userLocation,
  userAccuracy,
  draftLocation,
  qiblaFrom,
  onReady,
  onSelect,
  onMapClick,
  onDraftMove,
}: Props) {
  return (
    <MapContainer
      ref={onReady}
      center={FALLBACK_CENTER}
      zoom={15}
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        // OSM's public tiles are fine for an MVP; switch to a keyed provider (MapTiler, Stadia) before real traffic.
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <ZoomControl position="bottomleft" />
      <ClickHandler onClick={onMapClick} />

      {userLocation && (
        <>
          {userAccuracy !== null && userAccuracy < 500 && (
            <Circle
              center={userLocation}
              radius={userAccuracy}
              interactive={false}
              pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }}
            />
          )}
          <Marker position={userLocation} icon={userIcon} interactive={false} keyboard={false} zIndexOffset={-500} />
        </>
      )}

      {beacons.map((b) => {
        const title = `${SALAH_LABELS[b.salah_name]} at ${b.location_name}`;
        return (
          <Marker
            // react-leaflet can't update a marker's title in place, so an edited title remounts it.
            key={`${b.id}|${title}`}
            position={[b.latitude, b.longitude]}
            title={title}
            zIndexOffset={b.id === selectedId ? 500 : 0}
            icon={beaconIcon({
              salah: b.salah_name,
              status: getStatus(b, now),
              count: b.attendee_count,
              selected: b.id === selectedId,
              pending: Boolean(b.pending),
              confirm: b.id === confirmId,
            })}
            eventHandlers={{ click: () => onSelect(b) }}
          />
        );
      })}

      {qiblaFrom && <QiblaLine from={qiblaFrom} />}

      {draftLocation && (
        <Marker
          position={draftLocation}
          icon={draftIcon}
          draggable
          autoPan
          zIndexOffset={1000}
          title="Drag to the exact spot"
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = (e.target as L.Marker).getLatLng();
              onDraftMove([lat, lng]);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
