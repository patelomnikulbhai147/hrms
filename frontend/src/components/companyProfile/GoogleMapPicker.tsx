import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Loader2, AlertTriangle, CheckCircle2, Building2, LocateFixed, Link2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { loadGoogleMaps, toPickedLocation, fromPlace, isGoogleMapsUrl, type PickedLocation } from '@/utils/googleMaps';

interface GoogleMapPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (loc: PickedLocation) => void;
  /** Reopen centered on the saved location (from a previously stored map URL). */
  initial?: { lat: number; lng: number; placeId?: string } | null;
  /** Company name — used only as the map dialog search hint. */
  companyName?: string;
}

const DEFAULT_CENTER = { lat: 22.5937, lng: 78.9629 }; // India
const DEFAULT_ZOOM = 5;

// Address components that MUST be resolved before a location can be used. Per the
// strict workflow: Country, State, City, PIN Code, Latitude, Longitude and the
// formatted address must all be present — no incomplete address may be saved.
const REQUIRED: { key: keyof PickedLocation; label: string }[] = [
  { key: 'country', label: 'Country' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
  { key: 'pincode', label: 'PIN Code' },
];
const INCOMPLETE_MSG = 'Unable to identify the selected location. Please choose another location on Google Maps.';
function missingRequired(loc: PickedLocation | null): string[] {
  if (!loc || !loc.formattedAddress || !loc.lat || !loc.lng) return ['a valid location'];
  return REQUIRED.filter(r => !String(loc[r.key] || '').trim()).map(r => r.label);
}

// 'fallback' = the map couldn't load (not configured OR a transient failure); the
// user can still resolve an address by pasting a Google Maps URL.
type Status = 'loading' | 'ready' | 'fallback';

export const GoogleMapPicker: React.FC<GoogleMapPickerProps> = ({ open, onClose, onSelect, initial, companyName }) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [details, setDetails] = useState<PickedLocation | null>(null);
  const [locating, setLocating] = useState(false);

  // Manual-URL fallback state.
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fallbackError, setFallbackError] = useState('');

  // ── Reverse geocode a dropped pin / map click / current location ────────────
  const reverseGeocode = (lat: number, lng: number) => {
    const geocoder = geocoderRef.current;
    if (!geocoder) return;
    setLocating(true);
    setErrorMsg('');
    geocoder.geocode({ location: { lat, lng } }, (results: any[], gStatus: string) => {
      setLocating(false);
      if (gStatus === 'OK' && results && results[0]) {
        const r = results[0];
        setDetails(toPickedLocation(r.address_components || [], r.formatted_address || '', lat, lng, r.place_id || '', ''));
      } else {
        setDetails(null);
        setErrorMsg(INCOMPLETE_MSG);
      }
    });
  };

  // A Places result can miss required parts (a business search often has no PIN).
  // Reverse-geocode its coordinates and fill ONLY the gaps, keeping the business
  // name + place id — so one selection always yields a complete address.
  const enrichAndSet = (loc: PickedLocation) => {
    const gaps = missingRequired(loc);
    const geocoder = geocoderRef.current;
    if (gaps.length === 0 || gaps[0] === 'a valid location' || !geocoder) { setDetails(loc); return; }
    setLocating(true);
    geocoder.geocode({ location: { lat: loc.lat, lng: loc.lng } }, (results: any[], gStatus: string) => {
      setLocating(false);
      if (gStatus === 'OK' && results && results[0]) {
        const r = toPickedLocation(
          results[0].address_components || [],
          loc.formattedAddress || results[0].formatted_address || '',
          loc.lat, loc.lng, loc.placeId || results[0].place_id || '', loc.businessName,
        );
        setDetails({
          ...r,
          businessName: loc.businessName || r.businessName,
          street: loc.street || r.street,
          area: loc.area || r.area,
          additional: loc.additional || r.additional,
          city: loc.city || r.city,
          district: loc.district || r.district,
          state: loc.state || r.state,
          country: loc.country || r.country,
          pincode: loc.pincode || r.pincode,
          formattedAddress: loc.formattedAddress || r.formattedAddress,
          mapUrl: loc.mapUrl, // keep the place-based URL (carries the Place ID)
        });
      } else {
        setDetails(loc);
      }
    });
  };

  // ── Center + drop marker at a coordinate, then detect the address ───────────
  const goTo = (lat: number, lng: number, zoom = 17) => {
    const map = mapRef.current; const marker = markerRef.current;
    if (!map || !marker) return;
    map.panTo({ lat, lng });
    map.setZoom(zoom);
    marker.setVisible(true);
    marker.setPosition({ lat, lng });
    reverseGeocode(lat, lng);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { ui.toast.warning('Your browser does not support location access.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); goTo(pos.coords.latitude, pos.coords.longitude, 17); },
      () => { setLocating(false); ui.toast.warning('Could not get your current location. Allow location access or pick manually.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ── Manual fallback: resolve an address from a pasted Google Maps URL ────────
  const fetchFromUrl = async () => {
    const url = fallbackUrl.trim();
    setFallbackError('');
    if (!isGoogleMapsUrl(url)) {
      setDetails(null);
      setFallbackError('Please enter a valid Google Maps link.');
      return;
    }
    try {
      setFetching(true);
      const r = await api.systemSettings.googleMaps.geocode({ url });
      const loc = toPickedLocation(r.components || [], r.formattedAddress || '', r.lat, r.lng, r.placeId || '', '');
      setDetails(loc);
      if (missingRequired(loc).length) setFallbackError(INCOMPLETE_MSG);
    } catch (e: any) {
      setDetails(null);
      setFallbackError(getApiErrorMessage(e) || 'Please enter a valid Google Maps link.');
    } finally {
      setFetching(false);
    }
  };

  // ── Initialise the map whenever the dialog opens ────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('loading');
    setErrorMsg('');
    setDetails(null);
    setFallbackUrl('');
    setFallbackError('');

    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapDivRef.current) return;
        const center = initial ? { lat: initial.lat, lng: initial.lng } : DEFAULT_CENTER;
        const zoom = initial ? 16 : DEFAULT_ZOOM;

        const map = new google.maps.Map(mapDivRef.current, {
          center, zoom,
          mapTypeControl: true,          // Map / Satellite toggle
          mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid', 'satellite', 'terrain'] },
          zoomControl: true,             // + / – zoom buttons
          fullscreenControl: true,
          streetViewControl: false,
          clickableIcons: true,
          gestureHandling: 'greedy',
        });
        const marker = new google.maps.Marker({
          map, position: center, draggable: true, visible: !!initial,
          animation: google.maps.Animation.DROP,
        });
        const geocoder = new google.maps.Geocoder();
        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = geocoder;

        map.addListener('click', (e: any) => {
          marker.setVisible(true); marker.setPosition(e.latLng);
          reverseGeocode(e.latLng.lat(), e.latLng.lng());
        });
        marker.addListener('dragend', () => {
          const p = marker.getPosition();
          reverseGeocode(p.lat(), p.lng());
        });

        if (searchRef.current) {
          const ac = new google.maps.places.Autocomplete(searchRef.current, {
            fields: ['address_components', 'formatted_address', 'geometry', 'name', 'place_id', 'types'],
          });
          ac.bindTo('bounds', map);
          ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            const loc = fromPlace(place);
            if (!loc) {
              ui.toast.warning('No details available for that entry — pick a suggestion from the list.');
              return;
            }
            map.panTo({ lat: loc.lat, lng: loc.lng });
            map.setZoom(17);
            marker.setVisible(true);
            marker.setPosition({ lat: loc.lat, lng: loc.lng });
            setErrorMsg('');
            enrichAndSet(loc);
          });
        }

        setStatus('ready');
        if (initial) reverseGeocode(initial.lat, initial.lng);
      })
      .catch(() => {
        // Any failure (no key OR transient) → manual URL fallback, never a dead end.
        if (!cancelled) setStatus('fallback');
      });

    return () => {
      cancelled = true;
      mapRef.current = null;
      markerRef.current = null;
      geocoderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const missing = missingRequired(details);
  const canUse = !!details && missing.length === 0;

  const confirm = () => {
    if (!canUse) {
      ui.toast.warning('Select a valid, complete location before continuing.');
      return;
    }
    onSelect(details as PickedLocation);
    onClose();
  };

  // Footer: while loading offer Close; otherwise Cancel + Use This Address.
  const footer = status === 'loading' ? (
    <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
  ) : (
    <>
      <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="primary" size="sm" onClick={confirm} disabled={!canUse} icon={<CheckCircle2 size={14} />}>
        Use This Address
      </Button>
    </>
  );

  // ── Shared detected-address confirmation panel ──────────────────────────────
  const detailsPanel = details && (
    <div className={`rounded-xl border p-4 ${canUse ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {canUse ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertTriangle size={15} className="text-amber-600" />}
        <p className={`text-xs font-extrabold uppercase tracking-wide ${canUse ? 'text-emerald-700' : 'text-amber-700'}`}>
          {canUse ? 'Location Selected' : 'Almost there'}
        </p>
      </div>
      {details.businessName && (
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800 mb-1">
          <Building2 size={14} className="text-slate-500" /> {details.businessName}
        </p>
      )}
      <p className="text-xs text-slate-600 leading-relaxed mb-2">{details.formattedAddress}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
        <Field label="Street" value={details.street} />
        <Field label="Area / Locality" value={details.area} />
        {details.additional && <Field label="Additional" value={details.additional} />}
        <Field label="City" value={details.city} />
        {details.district && <Field label="District" value={details.district} />}
        <Field label="State" value={details.state} />
        <Field label="Country" value={details.country} />
        <Field label="PIN Code" value={details.pincode} />
      </div>
      {!canUse && (
        <p className="mt-2.5 text-[11px] font-semibold text-amber-700">
          {INCOMPLETE_MSG}
          {missing[0] !== 'a valid location' && <span className="block text-slate-500 font-normal mt-0.5">Missing: {missing.join(', ')} — choose a more specific location.</span>}
        </p>
      )}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Select Location on Google Map" size="xl" footer={footer}>
      {status === 'fallback' ? (
        // ── Fallback: manual Google Maps URL entry (map couldn't load) ──────────
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
              <AlertTriangle size={15} className="text-amber-500" /> Google Maps is temporarily unavailable
            </p>
            <p className="mt-1 text-xs text-slate-600">You can still continue by pasting a Google Maps location link below.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Google Maps URL</label>
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={fallbackUrl}
                  onChange={e => { setFallbackUrl(e.target.value); setFallbackError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchFromUrl(); } }}
                  placeholder="https://maps.google.com/..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#C77E52] focus:ring-2 focus:ring-[#C77E52]/10"
                />
              </div>
              <Button size="sm" onClick={fetchFromUrl} loading={fetching} disabled={fetching || !fallbackUrl.trim()} icon={<Search size={14} />}>
                Fetch Address
              </Button>
            </div>
            <p className="text-[10px] text-slate-400">Open the place in Google Maps and copy the link from the address bar or the Share button.</p>
            {fallbackError && <p className="text-[11px] font-bold text-rose-500">{fallbackError}</p>}
          </div>

          {detailsPanel}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Search + current location */}
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={searchRef}
                placeholder="Search a company, address, landmark, building or PIN code…"
                defaultValue=""
                disabled={status !== 'ready'}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#C77E52] focus:ring-2 focus:ring-[#C77E52]/10 disabled:bg-slate-50"
              />
            </div>
            <button type="button" onClick={useCurrentLocation} disabled={status !== 'ready'}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-[#C77E52] hover:border-[#C77E52]/40 disabled:opacity-40 disabled:cursor-not-allowed transition">
              <LocateFixed size={15} /> Current
            </button>
          </div>
          {companyName && status === 'ready' && (
            <p className="-mt-1 text-[11px] text-slate-400">
              Tip: try “{companyName}” or a nearby landmark, then click the exact spot on the map.
            </p>
          )}

          {/* Map */}
          <div className="relative rounded-xl overflow-hidden border border-slate-200">
            <div ref={mapDivRef} className="h-[340px] w-full bg-slate-100" />
            {status === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-slate-500 text-sm font-semibold">
                <Loader2 className="animate-spin" size={18} /> Loading map…
              </div>
            )}
            {locating && status === 'ready' && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-white/95 border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                <Loader2 className="animate-spin" size={12} /> Detecting address…
              </div>
            )}
          </div>

          {/* Detected details / hint */}
          {status === 'ready' && (
            details ? detailsPanel : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                <MapPin size={18} className="mx-auto text-slate-400 mb-1" />
                <p className="text-xs text-slate-500">
                  {errorMsg || 'Search above, use Current, or click the exact spot / drag the pin on the map to detect the full address.'}
                </p>
              </div>
            )
          )}
        </div>
      )}
    </Modal>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-slate-700 font-semibold truncate">{value || <span className="text-slate-300">—</span>}</p>
  </div>
);

export default GoogleMapPicker;
