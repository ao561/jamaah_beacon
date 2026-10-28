import type L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BeaconDetailDrawer, type BeaconAction } from './components/BeaconDetailDrawer';
import { CreateBeaconModal, type BeaconFormValues, type PinSource } from './components/CreateBeaconModal';
import { FloatingActionBar, type View } from './components/FloatingActionBar';
import { ListView } from './components/ListView';
import { MapView } from './components/MapView';
import { NavigationBar, type SalahFilter } from './components/NavigationBar';
import { InstallNudge } from './components/InstallNudge';
import { Banner, BannerButton, StatusPill, Toast, type ToastMessage } from './components/Overlays';
import { WelcomeSheet } from './components/WelcomeSheet';
import { isPendingId, useBeacons } from './hooks/useBeacons';
import { isFriday } from './lib/prayerTimes';
import { useGeolocation } from './hooks/useGeolocation';
import { useNow } from './hooks/useNow';
import { useTheme } from './hooks/useTheme';
import { beaconApi, isDemoMode } from './lib/beacons';
import { FALLBACK_CENTER, SALAH_LABELS } from './lib/config';
import { dismissInstallNudge, hasBeenWelcomed, installNudgeDismissed, installWorthOffering, markWelcomed } from './lib/install';
import { getRegularHosts, membershipFor } from './lib/memberships';
import type { ReportReason } from './lib/reports';
import { beaconIdFromUrl, shareBeacon, syncBeaconUrl } from './lib/share';
import { formatClock, getStatus } from './lib/time';
import type { Beacon, Coords, PrayerChanges } from './lib/types';

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

  // First visit: a short welcome, with the location prompt held until it's done.
  // Visitors arriving on a shared link skip it and see it next time.
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasBeenWelcomed() && beaconIdFromUrl() === null);
  const [locationAllowed, setLocationAllowed] = useState(!welcomeOpen);
  const [installNudgeOpen, setInstallNudgeOpen] = useState(false);

  const finishWelcome = useCallback(() => {
    markWelcomed();
    setWelcomeOpen(false);
    setLocationAllowed(true);
  }, []);

  /** After a first join or host: the moment people are most likely to want the app. */
  const maybeNudgeInstall = () => {
    if (!installNudgeDismissed() && installWorthOffering()) setInstallNudgeOpen(true);
  };
  const closeInstallNudge = () => {
    dismissInstallNudge();
    setInstallNudgeOpen(false);
  };

  const geo = useGeolocation(locationAllowed);
  const theme = useTheme();
  const {
    beacons,
    loadState,
    roleFor,
    refresh,
    createBeacon,
    updateBeacon,
    setBeaconPhoto,
    stopRegular,
    joinBeacon,
    leaveBeacon,
    cancelBeacon,
    reportBeacon,
  } = useBeacons({
    // Only tell people who were looking at it or planning to go; hosts know what they did.
    onRemoteRemoval: (beacon, reason) => {
      const membership = membershipFor(beacon);
      const label = `${SALAH_LABELS[beacon.salah_name]} at ${beacon.location_name}`;
      if (reason === 'hidden') {
        if (membership || beacon.id === selectedId) notify('error', `${label} was removed after reports.`);
      } else if (membership?.role !== 'host' && (membership || beacon.id === selectedId)) {
        notify('error', `The host cancelled ${label}.`);
      }
    },
    onRemoteChange: (before, after) => {
      const membership = membershipFor(after);
      if (membership?.role === 'host' || !(membership || after.id === selectedId)) return;
      const label = `${SALAH_LABELS[after.salah_name]} at ${after.location_name}`;
      notify(
        'success',
        before.iqamah_time !== after.iqamah_time
          ? `${label} now starts at ${formatClock(after.iqamah_time)}.`
          : `${label} has moved. Check the map.`,
      );
    },
  });
  // Coarse tick for marker status / auto-hide; the drawer runs its own 1s countdown.
  const now = useNow(5000);

  const [map, setMap] = useState<L.Map | null>(null);
  const [mode, setMode] = useState<Mode>('browse');
  const [view, setView] = useState<View>('map');
  const [filter, setFilter] = useState<SalahFilter>('All');
  const [manualLocation, setManualLocation] = useState<Coords | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Set while the form is editing an existing beacon rather than creating one. */
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const editing = editingId ? beacons.find((b) => b.id === editingId) : undefined;

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

  useEffect(() => beaconApi.track('app_open'), []);

  useEffect(() => {
    if (selectedId && !isPendingId(selectedId)) beaconApi.track('beacon_view');
  }, [selectedId]);

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

  const toggleView = () => {
    setSelectedId(null);
    setView((v) => {
      if (v === 'map') beaconApi.track('list_open');
      return v === 'map' ? 'list' : 'map';
    });
  };

  const selectFromList = (beacon: Beacon) => {
    setView('map');
    focusBeacon(beacon);
  };

  /** Photos upload after the beacon itself is saved; a failure here doesn't undo the beacon. */
  const applyPhoto = async (id: string, change: BeaconFormValues['photo']) => {
    if (change.kind === 'keep') return;
    try {
      await setBeaconPhoto(id, change.kind === 'set' ? change.base64 : null);
    } catch (err) {
      console.error('Failed to save photo', err);
      notify('error', `Saved, but the photo didn't upload: ${errorMessage(err)}`);
    }
  };

  const openCreate = () => {
    setView('map');
    setSelectedId(null);
    setSubmitError(null);
    if (editingId) {
      // Leaving an edit: start the create form from scratch.
      setEditingId(null);
      setFormKey((k) => k + 1);
    }
    if (!draft || editingId) {
      const centre = map?.getCenter();
      const coords: Coords = userLocation ?? (centre ? [centre.lat, centre.lng] : FALLBACK_CENTER);
      setDraft({ coords, source: geo.coords ? 'gps' : manualLocation ? 'manual' : 'map' });
      map?.setView(coords, Math.max(map.getZoom(), 16));
    }
    setMode('create');
  };

  const openEdit = (beacon: Beacon) => {
    setSelectedId(null);
    setSubmitError(null);
    setEditingId(beacon.id);
    setDraft({ coords: [beacon.latitude, beacon.longitude], source: 'existing' });
    setFormKey((k) => k + 1);
    setMode('create');
  };

  const cancelCreate = useCallback(() => {
    setMode('browse');
    setEditingId(null);
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
    const { repeatDays, photo, ...fields } = values;

    if (editingId) return saveEdit(editingId, { ...fields, latitude, longitude }, photo);

    // Close the form straight away; the optimistic pin appears while the write is in flight.
    setMode('browse');
    setPublishing(true);
    setSubmitError(null);
    setFilter('All');
    map?.flyTo(draft.coords, FOCUS_ZOOM, { duration: 0.8 });

    try {
      const repeat = repeatDays ? { days: repeatDays, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined;
      const row = await createBeacon({ ...fields, latitude, longitude }, repeat);
      void applyPhoto(row.id, photo);
      setDraft(null);
      setFormKey((k) => k + 1);
      setConfirmId(row.id);
      // Open it so the host can invite people straight away.
      focusBeacon(row);
      notify('success', `Your ${SALAH_LABELS[row.salah_name]} beacon is live${repeat ? ' and will repeat' : ''}.`);
      maybeNudgeInstall();
    } catch (err) {
      console.error('Failed to create beacon', err);
      // Reopen the form with everything the host typed still in place.
      setSubmitError(`Couldn't broadcast: ${errorMessage(err)}`);
      setMode('create');
    } finally {
      setPublishing(false);
    }
  };

  const saveEdit = async (id: string, changes: PrayerChanges, photo: BeaconFormValues['photo']) => {
    const original = beacons.find((b) => b.id === id);
    // An unchanged time is left out: the server would reject a start time that's already passed.
    if (original && changes.iqamah_time && new Date(changes.iqamah_time).getTime() === new Date(original.iqamah_time).getTime()) {
      delete changes.iqamah_time;
    }
    setMode('browse');
    setPublishing(true);
    setSubmitError(null);
    try {
      const row = await updateBeacon(id, changes);
      void applyPhoto(id, photo);
      setEditingId(null);
      setDraft(null);
      setFormKey((k) => k + 1);
      focusBeacon(row);
      notify('success', 'Saved. Everyone sees the changes now.');
    } catch (err) {
      console.error('Failed to update beacon', err);
      setSubmitError(`Couldn't save: ${errorMessage(err)}`);
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

  const handleJoin = (id: string) =>
    runAction(id, 'join', async () => {
      await joinBeacon(id);
      maybeNudgeInstall();
    });
  const handleLeave = (id: string) => runAction(id, 'leave', () => leaveBeacon(id), "You've been removed. Maybe next time.");
  const handleCancel = (id: string) => runAction(id, 'cancel', () => cancelBeacon(id), "Jama'ah cancelled.");
  const handleDelay = (beacon: Beacon, minutes: number) => {
    // Late relative to the plan, or to now if the planned time has already passed.
    const base = Math.max(new Date(beacon.iqamah_time).getTime(), Date.now());
    const next = new Date(base + minutes * 60_000);
    return runAction(
      beacon.id,
      'delay',
      async () => void (await updateBeacon(beacon.id, { iqamah_time: next.toISOString() })),
      `Moved to ${formatClock(next)}. Everyone sees the new time.`,
    );
  };
  const handleStopRegular = (beaconId: string, regularId: string) =>
    runAction(beaconId, 'stop', () => stopRegular(regularId), "Stopped repeating. Today's jama'ah is still on.");
  const handleReport = (id: string, reason: ReportReason) =>
    runAction(id, 'report', () => reportBeacon(id, reason), "Thanks for reporting. We've hidden it for you.");

  const handleShare = async (beacon: Beacon) => {
    try {
      const result = await shareBeacon(beacon);
      if (result !== 'dismissed') beaconApi.track('share');
      if (result === 'copied') notify('success', 'Link copied. Paste it into your group chat.');
    } catch (err) {
      console.error('Failed to share beacon', err);
      notify('error', "Couldn't share. Copy the link from the address bar instead.");
    }
  };

  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const showLocationBanner = mode === 'browse' && view === 'map' && locationOff && !manualLocation && !locationBannerDismissed;
  const statusPill =
    mode !== 'browse' || selected || view === 'list' ? null : loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : visible.length === 0 ? 'empty' : null;

  return (
    <div className="fixed inset-0 bg-slate-100 dark:bg-slate-950">
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
        theme={theme.pref}
        onCycleTheme={theme.cycle}
        onHelp={() => setWelcomeOpen(true)}
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

      {view === 'list' && mode === 'browse' && (
        <ListView beacons={visible} now={now} userLocation={userLocation} roleFor={roleFor} onSelect={selectFromList} />
      )}

      {statusPill && <StatusPill state={statusPill} onRetry={refresh} />}

      {mode === 'browse' && !selected && (
        <FloatingActionBar
          view={view}
          onToggleView={toggleView}
          hasLocation={userLocation !== null}
          publishing={publishing}
          onLocate={handleLocate}
          onHost={openCreate}
        />
      )}

      <BeaconDetailDrawer
        beacon={mode === 'browse' ? selected : null}
        membership={selected ? roleFor(selected) : undefined}
        hostsRegular={Boolean(selected?.regular_id && getRegularHosts()[selected.regular_id])}
        busy={selected && busy?.id === selected.id ? busy.action : null}
        userLocation={userLocation}
        onJoin={handleJoin}
        onLeave={handleLeave}
        onCancel={handleCancel}
        onDelay={handleDelay}
        onEdit={openEdit}
        onStopRegular={(regularId) => selected && handleStopRegular(selected.id, regularId)}
        onShare={handleShare}
        onReport={handleReport}
        onClose={closeDrawer}
      />

      <CreateBeaconModal
        key={formKey}
        open={mode === 'create'}
        initial={editing}
        coords={draft?.coords ?? userLocation ?? FALLBACK_CENTER}
        pinSource={draft?.source ?? 'map'}
        gpsAccuracy={geo.accuracy}
        error={submitError}
        onAdjustPin={startAdjustPin}
        onCancel={cancelCreate}
        onSubmit={handleSubmit}
      />

      {installNudgeOpen && mode === 'browse' && !selected && <InstallNudge onDismiss={closeInstallNudge} />}

      <WelcomeSheet open={welcomeOpen} onDone={finishWelcome} />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
