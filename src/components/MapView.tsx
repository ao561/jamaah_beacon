import type L from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet';
import { FALLBACK_CENTER } from '../lib/config';
import { beaconIcon, draftIcon, userIcon } from '../lib/markerIcons';
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
  onReady: (map: L.Map | null) => void;
  onSelect: (beacon: Beacon) => void;
  onMapClick: (coords: Coords) => void;
  onDraftMove: (coords: Coords) => void;
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

      {beacons.map((b) => (
        <Marker
          key={b.id}
          position={[b.latitude, b.longitude]}
          title={`${b.salah_name} at ${b.location_name}`}
          zIndexOffset={b.id === selectedId ? 500 : 0}
          icon={beaconIcon({
            salah: b.salah_name,
            status: getStatus(b.iqamah_time, now),
            count: b.attendee_count,
            selected: b.id === selectedId,
            pending: Boolean(b.pending),
            confirm: b.id === confirmId,
          })}
          eventHandlers={{ click: () => onSelect(b) }}
        />
      ))}

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
