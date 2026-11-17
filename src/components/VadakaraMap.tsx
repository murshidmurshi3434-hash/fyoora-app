import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, MapPin, Navigation } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import type { GeoPoint } from '../shared/types.ts';
import { haversineDistanceKm } from '../shared/domain.ts';

export interface MapMarkerItem {
  id: string;
  label: string;
  position: GeoPoint;
  kind: 'center' | 'vendor' | 'pickup' | 'drop' | 'rider' | 'customer';
}

interface VadakaraMapProps {
  center?: GeoPoint;
  radiusKm?: number;
  markers: MapMarkerItem[];
  routeOrigin?: GeoPoint;
  routeDestination?: GeoPoint;
  heightClass?: string;
  onSelectPoint?: (point: GeoPoint) => void;
  title?: string;
}

const VADAKARA_CENTER: GeoPoint = { lat: 11.6085, lng: 75.5917 };

interface PolylineLike {
  setOptions: (opts: { strokeColor?: string; strokeWeight?: number; strokeOpacity?: number }) => void;
  setMap: (map: unknown | null) => void;
}

function isMapsQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|QuotaExceededError|OverQuotaMapError|429/i.test(msg);
}

function triggerQuotaFallbackNotice() {
  window.__fyooraQuotaExceeded = true;
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
}

function MapsStatusWatcher({ onFailure }: { onFailure: () => void }) {
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE) {
      triggerQuotaFallbackNotice();
      onFailure();
    } else if (status === APILoadingStatus.FAILED) {
      onFailure();
    }
  }, [onFailure, status]);

  return null;
}

function MapCenterSync({ center }: { center: GeoPoint }) {
  const map = useMap();
  const prevCenterRef = useRef<GeoPoint>(center);

  useEffect(() => {
    if (!map) return;
    if (
      Math.abs(prevCenterRef.current.lat - center.lat) > 0.0001 ||
      Math.abs(prevCenterRef.current.lng - center.lng) > 0.0001
    ) {
      prevCenterRef.current = center;
      map.panTo(center);
    }
  }, [center, map]);

  return null;
}

function RoutePolylineOverlay({
  origin,
  destination,
}: {
  origin?: GeoPoint;
  destination?: GeoPoint;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<PolylineLike[]>([]);

  useEffect(() => {
    if (!map || !routesLib || !origin || !destination) return;
    let cancelled = false;

    const clearPolylines = () => {
      polylinesRef.current.forEach((line) => line.setMap(null));
      polylinesRef.current = [];
    };
    clearPolylines();

    const getGmaps = () =>
      (
        window as unknown as {
          google?: {
            maps?: {
              Polyline: new (opts: {
                path: unknown;
                strokeColor: string;
                strokeWeight: number;
                strokeOpacity: number;
                map: unknown;
              }) => PolylineLike;
            };
          };
        }
      ).google?.maps;

    (async () => {
      try {
        const RouteClass = (
          routesLib as unknown as {
            Route?: {
              computeRoutes: (req: unknown) => Promise<{
                routes?: Array<{
                  createPolylines?: () => PolylineLike[];
                  path?: unknown[];
                }>;
              }>;
            };
          }
        ).Route;

        if (RouteClass?.computeRoutes) {
          const result = await RouteClass.computeRoutes({
            origin,
            destination,
            travelMode: 'DRIVING',
            fields: ['path'],
          });
          if (cancelled) return;
          const firstRoute = result.routes?.[0];
          if (firstRoute?.createPolylines) {
            const lines = firstRoute.createPolylines();
            lines.forEach((line) => {
              line.setOptions({ strokeColor: '#E60023', strokeWeight: 4, strokeOpacity: 0.85 });
              line.setMap(map);
            });
            polylinesRef.current = lines;
          } else if (firstRoute?.path) {
            const gmaps = getGmaps();
            if (gmaps?.Polyline) {
              const line = new gmaps.Polyline({
                path: firstRoute.path,
                strokeColor: '#E60023',
                strokeWeight: 4,
                strokeOpacity: 0.85,
                map,
              });
              polylinesRef.current = [line];
            }
          }
        } else {
          const gmaps = getGmaps();
          if (gmaps?.Polyline) {
            const line = new gmaps.Polyline({
              path: [origin, destination],
              strokeColor: '#E60023',
              strokeWeight: 3,
              strokeOpacity: 0.75,
              map,
            });
            polylinesRef.current = [line];
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (isMapsQuotaError(err)) {
            triggerQuotaFallbackNotice();
          }
          const gmaps = getGmaps();
          if (gmaps?.Polyline) {
            const line = new gmaps.Polyline({
              path: [origin, destination],
              strokeColor: '#E60023',
              strokeWeight: 3,
              strokeOpacity: 0.65,
              map,
            });
            polylinesRef.current = [line];
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [map, routesLib, origin, destination]);

  return null;
}

const PIN_STYLE: Record<MapMarkerItem['kind'], { bg: string; border: string; glyph: string }> = {
  center: { bg: '#252525', border: '#000000', glyph: '#FFFFFF' },
  vendor: { bg: '#E60023', border: '#B8001C', glyph: '#FFFFFF' },
  pickup: { bg: '#252525', border: '#000000', glyph: '#FFFFFF' },
  drop: { bg: '#E60023', border: '#B8001C', glyph: '#FFFFFF' },
  rider: { bg: '#16A34A', border: '#14532D', glyph: '#FFFFFF' },
  customer: { bg: '#252525', border: '#E60023', glyph: '#FFFFFF' },
};

export function VadakaraMap({
  center = VADAKARA_CENTER,
  radiusKm = 10,
  markers,
  routeOrigin,
  routeDestination,
  heightClass = 'h-60',
  onSelectPoint,
  title = 'Vadakara Service Map',
}: VadakaraMapProps) {
  const { health } = useApp();
  const buildTimeApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const runtimeApiKey = (health?.mapsApiKey || '').trim();
  const apiKey = buildTimeApiKey || runtimeApiKey;
  const explicitlyDisabled =
    (import.meta.env.VITE_ENABLE_GOOGLE_MAPS || '').trim().toLowerCase() === 'false' ||
    health?.mapsConfigured === false;

  const [quotaFailed, setQuotaFailed] = useState(
    Boolean(typeof window !== 'undefined' && window.__fyooraQuotaExceeded)
  );
  const [mapsLoadFailed, setMapsLoadFailed] = useState(false);

  useEffect(() => {
    const onQuota = () => setQuotaFailed(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const canUseLiveMaps = !explicitlyDisabled && Boolean(apiKey) && !quotaFailed && !mapsLoadFailed;

  const fallbackView = useMemo(() => {
    // Map lat/lng relative to center within ±0.085 deg onto an interactive SVG map grid
    const toPct = (pt: GeoPoint) => {
      const x = 50 + ((pt.lng - center.lng) / 0.14) * 80;
      const y = 50 - ((pt.lat - center.lat) / 0.14) * 80;
      return {
        x: Math.max(8, Math.min(92, x)),
        y: Math.max(10, Math.min(90, y)),
      };
    };

    const pOrigin = routeOrigin ? toPct(routeOrigin) : null;
    const pDest = routeDestination ? toPct(routeDestination) : null;

    return (
      <div
        className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-neutral-200 bg-[#F5F5F5] select-none`}
        onClick={(e) => {
          if (!onSelectPoint) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * 100;
          const py = ((e.clientY - rect.top) / rect.height) * 100;
          const lng = center.lng + ((px - 50) / 80) * 0.14;
          const lat = center.lat - ((py - 50) / 80) * 0.14;
          onSelectPoint({ lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) });
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {/* Subtle Vadakara road & coastal grid */}
          <defs>
            <pattern id="fyoora-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#E5E5E5" strokeWidth="0.4" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#fyoora-grid)" />
          {/* Active service zone radius ring */}
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="#E60023"
            fillOpacity="0.06"
            stroke="#E60023"
            strokeOpacity="0.35"
            strokeWidth="0.6"
            strokeDasharray="2 1.5"
          />
          {/* NH-66 & Link Road stylized spine */}
          <path d="M 38 0 Q 48 50 58 100" fill="none" stroke="#D4D4D4" strokeWidth="1.4" />
          <path d="M 10 58 Q 50 48 92 44" fill="none" stroke="#D4D4D4" strokeWidth="1.1" />
          {pOrigin && pDest && (
            <line
              x1={pOrigin.x}
              y1={pOrigin.y}
              x2={pDest.x}
              y2={pDest.y}
              stroke="#E60023"
              strokeWidth="1.3"
              strokeDasharray="2 1.2"
            />
          )}
        </svg>

        <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
          <div className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-xs border border-neutral-200 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#252525] shadow-xs">
            <Compass className="w-3.5 h-3.5 text-[#E60023]" />
            <span>{title} · {radiusKm} km active zone</span>
          </div>
          {routeOrigin && routeDestination && (
            <div className="bg-white/95 border border-neutral-200 px-2.5 py-1 rounded-lg text-[11px] font-mono tabular-nums font-semibold text-[#252525]">
              {haversineDistanceKm(routeOrigin, routeDestination).toFixed(1)} km
            </div>
          )}
        </div>

        {markers.map((m) => {
          const pos = toPct(m.position);
          const isRed = m.kind === 'vendor' || m.kind === 'drop';
          const isGreen = m.kind === 'rider';
          return (
            <div
              key={m.id}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none"
            >
              <span className="mb-0.5 px-1.5 py-0.5 rounded bg-white/95 border border-neutral-200 text-[10px] font-semibold text-[#252525] whitespace-nowrap shadow-xs">
                {m.label}
              </span>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white ${
                  isGreen ? 'bg-emerald-600 text-white' : isRed ? 'bg-[#E60023] text-white' : 'bg-[#252525] text-white'
                }`}
              >
                {m.kind === 'rider' ? <Navigation className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
              </span>
            </div>
          );
        })}

        {onSelectPoint && (
          <div className="absolute bottom-2 left-3 bg-white/90 border border-neutral-200 px-2 py-0.5 rounded text-[10px] text-neutral-600 pointer-events-none">
            Tap anywhere inside the zone to set pin coordinates
          </div>
        )}
      </div>
    );
  }, [center, heightClass, markers, onSelectPoint, radiusKm, routeDestination, routeOrigin, title]);

  if (!canUseLiveMaps) {
    return fallbackView;
  }

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-neutral-200`}>
      <APIProvider apiKey={apiKey} language="en" region="IN">
        <MapsStatusWatcher onFailure={() => setMapsLoadFailed(true)} />
        <GoogleMap
          style={{ width: '100%', height: '100%' }}
          defaultCenter={center}
          defaultZoom={13}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          gestureHandling="cooperative"
          disableDefaultUI={false}
          onClick={(ev) => {
            if (onSelectPoint && ev.detail.latLng) {
              onSelectPoint({
                lat: Number(ev.detail.latLng.lat.toFixed(5)),
                lng: Number(ev.detail.latLng.lng.toFixed(5)),
              });
            }
          }}
        >
          <MapCenterSync center={center} />
          {markers.map((m) => {
            const style = PIN_STYLE[m.kind];
            return (
              <AdvancedMarker key={m.id} position={m.position} title={m.label}>
                <Pin
                  background={style.bg}
                  borderColor={style.border}
                  glyphColor={style.glyph}
                />
              </AdvancedMarker>
            );
          })}
          {routeOrigin && routeDestination && (
            <RoutePolylineOverlay origin={routeOrigin} destination={routeDestination} />
          )}
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
