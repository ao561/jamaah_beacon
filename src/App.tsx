import type L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BeaconDetailDrawer, type BeaconAction } from './components/BeaconDetailDrawer';
import { CreateBeaconModal, type BeaconFormValues, type PinSource } from './components/CreateBeaconModal';
import { FloatingActionBar } from './components/FloatingActionBar';
import { MapView } from './components/MapView';
import { NavigationBar, type SalahFilter } from './components/NavigationBar';
import { Banner, BannerButton, StatusPill, Toast, type ToastMessage } from './components/Overlays';
import { isPendingId, useBeacons } from './hooks/useBeacons';
import { isFriday } from './lib/prayerTimes';
import { useGeolocation } from './hooks/useGeolocation';
import { useNow } from './hooks/useNow';
import { isDemoMode } from './lib/beacons';
import { FALLBACK_CENTER, SALAH_LABELS } from './lib/config';
import { getMemberships } from './lib/memberships';
import type { ReportReason } from './lib/reports';
import { beaconIdFromUrl, shareBeacon, syncBeaconUrl } from './lib/share';
import { getStatus } from './lib/time';
import type { Beacon, Coords } from './lib/types';

/**
 * browse:       default map
 * create:       host form open
 * adjust-pin:   form tucked away while the host drags / taps the draft pin
 * set-location: geolocation unavailable; next map tap sets "my location"
 */
type Mode = 'browse' | 'create' | 'adjust-pin' | 'set-location';

interface Draft {
  coords: Coords;
  source: PinSource;
}

const FOCUS_ZOOM = 17;
const CONFIRM_PULSE_MS = 5000;

// Supabase errors are plain objects with a message, not Error instances.
const errorMessage = (err: unknown) =>
  typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string' && err.message
    ? err.message
    : 'Something went wrong. Please try again.';

export default function App() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const notify = useCallback((tone: ToastMessage['tone'], text: string) => setToast({ id: Date.now(), tone, text }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const geo = useGeolocation();
  const { beacons, loadState, memberships, refresh, createBeacon, joinBeacon, leaveBeacon, cancelBeacon, reportBeacon } =
    useBeacons({
      onRemoteRemoval: (beacon, reason) => {
        const membership = getMemberships()[beacon.id];
        const label = `${SALAH_LABELS[beacon.salah_name]} at ${beacon.location_name}`;
        // Only tell people who were looking at it or planning to go; hosts know they cancelled.
        if (reason === 'hidden') {
          if (membership || beacon.id === selectedId) notify('error', `${label} was removed after reports.`);
        } else if (membership?.role !== 'host' && (membership || beacon.id === selectedId)) {
          notify('error', `The host cancelled ${label}.`);
        }
      },
    });
  // Coarse tick for marker status / auto-hide; the drawer runs its own 1s countdown.
  const now = useNow(5000);

  const [map, setMap] = useState<L.Map | null>(null);
  const [mode, setMode] = useState<Mode>('browse');
  const [filter, setFilter] = useState<SalahFilter>('All');
  const [manualLocation, setManualLocation] = useState<Coords | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: BeaconAction } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [locationBannerDismissed, setLocationBannerDismissed] = useState(false);

  const userLocation = geo.coords ?? manualLocation;
  const locationOff = geo.status === 'denied' || geo.status === 'unavailable';

  const live = useMemo(() => beacons.filter((b) => getStatus(b, now) !== 'ended'), [beacons, now]);
  const visible = useMemo(() => (filter === 'All' ? live : live.filter((b) => b.salah_name === filter)), [live, filter]);
  // Looked up in `live` (not `visible`) so changing the filter doesn't close an open drawer.
  const selected = live.find((b) => b.id === selectedId) ?? null;

  // A shared link (?b=<id>) opens that beacon once the first fetch lands.
  const deepLinkId = useRef(beaconIdFromUrl());
  // Centre on the first GPS fix only; later fixes just move the blue dot. A deep link wins.
  const centredOnUser = useRef(deepLinkId.current !== null);

  useEffect(() => {
    if (map && geo.coords && !centredOnUser.current) {
      centredOnUser.current = true;
      map.setView(geo.coords, 16);
    }
  }, [map, geo.coords]);

  // Instruction banners share the toast's slot; don't let a stale toast cover them.
  useEffect(() => {
    if (mode !== 'browse') setToast(null);
  }, [mode]);

  useEffect(() => {
    if (!confirmId) return;
    const id = setTimeout(() => setConfirmId(null), CONFIRM_PULSE_MS);
    return () => clearTimeout(id);
  }, [confirmId]);

  const focusBeacon = useCallback(
    (beacon: Beacon) => {
      setSelectedId(beacon.id);
      if (!map) return;
      // Pan so the pin sits in the top part of the screen, clear of the drawer.
      const zoom = Math.max(map.getZoom(), 16);
      const point = map.project([beacon.latitude, beacon.longitude], zoom).add([0, map.getSize().y * 0.22]);
      map.flyTo(map.unproject(point, zoom), zoom, { duration: 0.5 });
    },
    [map],
  );

  useEffect(() => {
    const id = deepLinkId.current;
    if (!id || !map || loadState !== 'ready') return;
    deepLinkId.current = null;
    const target = live.find((b) => b.id === id);
    if (target) {
      focusBeacon(target);
    } else {
      notify('error', "That jama'ah has ended or was cancelled.");
      syncBeaconUrl(null);
      if (geo.coords) map.setView(geo.coords, 16);
      else centredOnUser.current = false;
    }
  }, [map, loadState, live, focusBeacon, notify, geo.coords]);

  // Keep the address bar shareable; skipped until any deep link has been handled.
  useEffect(() => {
    if (deepLinkId.current) return;
    syncBeaconUrl(selectedId && !isPendingId(selectedId) ? selectedId : null);
  }, [selectedId]);

  const handleMapClick = (coords: Coords) => {
    if (mode === 'set-location') {
      setManualLocation(coords);
      setMode('browse');
      notify('success', 'Location set. Nearby distances now use this spot.');
    } else if (mode === 'adjust-pin') {
      setDraft({ coords, source: 'adjusted' });
    } else if (mode === 'browse') {
      setSelectedId(null);
    }
  };

  const handleLocate = () => {
    if (userLocation) {
      map?.flyTo(userLocation, 16, { duration: 0.6 });
    } else {
      setSelectedId(null);
      setMode('set-location');
    }
  };

  const openCreate = () => {
    setSelectedId(null);
    setSubmitError(null);
    if (!draft) {
      const centre = map?.getCenter();
      const coords: Coords = userLocation ?? (centre ? [centre.lat, centre.lng] : FALLBACK_CENTER);
      setDraft({ coords, source: geo.coords ? 'gps' : manualLocation ? 'manual' : 'map' });
      map?.setView(coords, Math.max(map.getZoom(), 16));
    }
    setMode('create');
  };

  const cancelCreate = useCallback(() => {
    setMode('browse');
    setDraft(null);
    setSubmitError(null);
    setFormKey((k) => k + 1);
  }, []);

  const startAdjustPin = () => {
    if (draft) map?.flyTo(draft.coords, Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.5 });
    setMode('adjust-pin');
  };

  const handleSubmit = async (values: BeaconFormValues) => {
    if (!draft) return;
    const [latitude, longitude] = draft.coords;

    // Close the form straight away; the optimistic pin appears while the write is in flight.
    setMode('browse');
    setPublishing(true);
    setSubmitError(null);
    setFilter('All');
    map?.flyTo(draft.coords, FOCUS_ZOOM, { duration: 0.8 });

    try {
      const row = await createBeacon({ ...values, latitude, longitude });
      setDraft(null);
      setFormKey((k) => k + 1);
      setConfirmId(row.id);
      // Open it so the host can invite people straight away.
      focusBeacon(row);
      notify('success', `Your ${SALAH_LABELS[row.salah_name]} beacon is live.`);
    } catch (err) {
      console.error('Failed to create beacon', err);
      // Reopen the form with everything the host typed still in place.
      setSubmitError(`Couldn't broadcast: ${errorMessage(err)}`);
      setMode('create');
    } finally {
      setPublishing(false);
    }
  };

  const runAction = async (id: string, action: BeaconAction, run: () => Promise<void>, success?: string) => {
    setBusy({ id, action });
    try {
      await run();
      if (success) notify('success', success);
    } catch (err) {
      console.error(`Failed to ${action} beacon`, err);
      notify('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleJoin = (id: string) => runAction(id, 'join', () => joinBeacon(id));
  const handleLeave = (id: string) => runAction(id, 'leave', () => leaveBeacon(id), "You've been removed. Maybe next time.");
  const handleCancel = (id: string) => runAction(id, 'cancel', () => cancelBeacon(id), "Jama'ah cancelled.");
  const handleReport = (id: string, reason: ReportReason) =>
    runAction(id, 'report', () => reportBeacon(id, reason), "Thanks for reporting. We've hidden it for you.");

  const handleShare = async (beacon: Beacon) => {
    try {
      if ((await shareBeacon(beacon)) === 'copied') notify('success', 'Link copied. Paste it into your group chat.');
    } catch (err) {
      console.error('Failed to share beacon', err);
      notify('error', "Couldn't share. Copy the link from the address bar instead.");
    }
  };

  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const showLocationBanner = mode === 'browse' && locationOff && !manualLocation && !locationBannerDismissed;
  const statusPill =
    mode !== 'browse' || selected ? null : loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : visible.length === 0 ? 'empty' : null;

  return (
    <div className="fixed inset-0 bg-slate-100">
      <MapView
        beacons={visible}
        now={now}
        selectedId={selectedId}
        confirmId={confirmId}
        userLocation={userLocation}
        userAccuracy={geo.coords ? geo.accuracy : null}
        draftLocation={mode === 'create' || mode === 'adjust-pin' ? (draft?.coords ?? null) : null}
        onReady={setMap}
        onSelect={focusBeacon}
        onMapClick={handleMapClick}
        onDraftMove={(coords) => setDraft({ coords, source: 'adjusted' })}
      />

      <NavigationBar
        activeCount={live.length}
        filter={filter}
        onFilterChange={setFilter}
        demo={isDemoMode}
        showJumuah={isFriday(new Date(now)) || live.some((b) => b.salah_name === 'Jumuah')}
      />

      {showLocationBanner && (
        <Banner
          onDismiss={() => setLocationBannerDismissed(true)}
          action={<BannerButton onClick={() => setMode('set-location')}>Set location</BannerButton>}
        >
          Location is off, so we're showing central London.
        </Banner>
      )}
      {mode === 'set-location' && (
        <Banner action={<BannerButton onClick={() => setMode('browse')}>Cancel</BannerButton>}>
          Tap the map where you are.
        </Banner>
      )}
      {mode === 'adjust-pin' && (
        <Banner action={<BannerButton onClick={() => setMode('create')}>Done</BannerButton>}>
          Drag the pin, or tap the map, to mark the exact spot.
        </Banner>
      )}

      {statusPill && <StatusPill state={statusPill} onRetry={refresh} />}

      {mode === 'browse' && !selected && (
        <FloatingActionBar hasLocation={userLocation !== null} publishing={publishing} onLocate={handleLocate} onHost={openCreate} />
      )}

      <BeaconDetailDrawer
        beacon={mode === 'browse' ? selected : null}
        membership={selected ? memberships[selected.id] : undefined}
        busy={selected && busy?.id === selected.id ? busy.action : null}
        userLocation={userLocation}
        onJoin={handleJoin}
        onLeave={handleLeave}
        onCancel={handleCancel}
        onShare={handleShare}
        onReport={handleReport}
        onClose={closeDrawer}
      />

      <CreateBeaconModal
        key={formKey}
        open={mode === 'create'}
        coords={draft?.coords ?? userLocation ?? FALLBACK_CENTER}
        pinSource={draft?.source ?? 'map'}
        gpsAccuracy={geo.accuracy}
        error={submitError}
        onAdjustPin={startAdjustPin}
        onCancel={cancelCreate}
        onSubmit={handleSubmit}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
