import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  Camera,
  Shield,
  Settings,
  Send,
  Mic,
  X,
  CheckCircle,
  XCircle,
  ExternalLink,
  EyeOff,
  Activity,
  Lock,
  FileText,
  Wifi,
  WifiOff,
  ChevronRight,
  Map,
  AlignLeft,
  AlertTriangle,
  AlertCircle,
  Clock,
  Search,
  SlidersHorizontal,
  Loader2,
  Users,
} from "lucide-react";

// ── Backend API types (mirrors backend/server.py response shapes) ──────────────

interface QueryEventMeta {
  camera_id: string;
  track_id: string;
  object_class: string;
  object_color: string;
  confidence: number;
  timestamp: string;
  frame_ref: string;
}

interface QueryResponse {
  query: string;
  parsed_filters: Record<string, string>;
  matched_events_count: number;
  events: QueryEventMeta[];
  documents: string[];
  summary: string;
}

interface IdentitySummary {
  track_id: string;
  total_events: number;
  first_seen: string;
  last_seen: string;
  cameras: string[];
  carried_objects: string[];
}

interface PersonEvent {
  id: string;
  track_id: string;
  camera_id: string;
  timestamp: string;
  frame_ref: string;
  object_class: string;
  object_color: string;
  confidence: number;
  dwell_time: number;
}

// ── Local display types ─────────────────────────────────────────────────────

interface CameraInfo {
  id: string;
  name: string;
  pos: { x: number; y: number };
}

interface EventData {
  id: string;
  cameraId: string;
  time: string;
  timestampIso: string;
  color: string;
  objClass: string;
  confidence: number; // 0-100
  trackId: string;
  dwell: string;
  frameRef: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  events?: EventData[];
  matchedCount?: number;
  isError?: boolean;
  ts: string;
}

// ── Static config (real, not fictional) ─────────────────────────────────────

const REAL_CAMERAS: CameraInfo[] = [
  { id: "cam_0", name: "WILDTRACK C1", pos: { x: 30, y: 50 } },
  { id: "cam_1", name: "WILDTRACK C2", pos: { x: 70, y: 50 } },
];

const OBJECT_COLORS = ["black", "blue", "red"];
const OBJECT_CLASSES = ["suitcase", "jacket", "backpack"];

const SUGGESTED_QUERIES = [
  "Where was person_003 seen across all cameras?",
  "Show me anyone carrying a black suitcase",
  "Who appeared on cam_1 with a blue jacket?",
  "List all detections of person_001",
];

const AUDIT_LOG = [
  { user: "m.chen@soc.gov",       action: "query",         detail: "red backpack after 6pm",         ts: "2024-01-15 18:45:00" },
  { user: "m.chen@soc.gov",       action: "event_view",    detail: "EVT-007 detail opened",           ts: "2024-01-15 18:46:12" },
  { user: "m.chen@soc.gov",       action: "confirm_match", detail: "EVT-007 confirmed as match",      ts: "2024-01-15 18:46:45" },
  { user: "r.okafor@soc.gov",     action: "query",         detail: "all cameras 17:00–18:00",         ts: "2024-01-15 17:32:18" },
  { user: "m.chen@soc.gov",       action: "query",         detail: "blue tote bag north entrance",    ts: "2024-01-15 17:15:44" },
  { user: "j.morrison@soc.gov",   action: "export",        detail: "exported EVT-001 through EVT-003",ts: "2024-01-15 16:58:03" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function nowTs(): string {
  return new Date().toTimeString().slice(0, 8);
}

function isoTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(11, 19);
}

function frameFilename(frameRef: string): string {
  // frame_ref from the DB is stored as "cam_0/00001700.png" — the backend's
  // /api/frames/{camera_id}/{frame_ref} route can't accept an embedded slash
  // in the path param (confirmed live: passing it raw or %2F-encoded 404s at
  // the routing layer before the handler's own basename() logic ever runs),
  // so only the bare filename works.
  const parts = frameRef.split("/");
  return parts[parts.length - 1];
}

function frameUrl(cameraId: string, frameRef: string): string {
  return `/api/frames/${encodeURIComponent(cameraId)}/${encodeURIComponent(frameFilename(frameRef))}`;
}

function toEventDataFromQuery(e: QueryEventMeta, idx: number): EventData {
  return {
    id: `${e.track_id}-${e.camera_id}-${e.timestamp}-${idx}`,
    cameraId: e.camera_id,
    time: isoTimeLabel(e.timestamp),
    timestampIso: e.timestamp,
    color: e.object_color,
    objClass: e.object_class,
    confidence: Math.round((e.confidence ?? 0) * 100),
    trackId: e.track_id,
    dwell: "—",
    frameRef: e.frame_ref,
  };
}

function toEventDataFromPerson(e: PersonEvent): EventData {
  return {
    id: e.id,
    cameraId: e.camera_id,
    time: isoTimeLabel(e.timestamp),
    timestampIso: e.timestamp,
    color: e.object_color,
    objClass: e.object_class,
    confidence: Math.round((e.confidence ?? 0) * 100),
    trackId: e.track_id,
    dwell: `${e.dwell_time}s`,
    frameRef: e.frame_ref,
  };
}

function confColor(score: number) {
  if (score >= 85) return { text: "text-emerald-400", bg: "bg-emerald-400/10 border border-emerald-400/30 text-emerald-400", bar: "#4ADE80", label: "HIGH" };
  if (score >= 60) return { text: "text-amber-400",   bg: "bg-amber-400/10 border border-amber-400/30 text-amber-400",   bar: "#FBBF24", label: "MED" };
  return              { text: "text-red-400",    bg: "bg-red-400/10 border border-red-400/30 text-red-400",       bar: "#F87171", label: "LOW" };
}

const OBJ_COLOR_MAP: Record<string, string> = {
  red: "#EF4444", blue: "#3B82F6", black: "#9CA3AF", yellow: "#F59E0B",
  green: "#10B981", orange: "#F97316", white: "#E5E7EB", gray: "#6B7280",
};

function objDot(color: string) {
  return OBJ_COLOR_MAP[color] ?? "#9CA3AF";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConfBadge({ score }: { score: number }) {
  const c = confColor(score);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${c.bg}`}>
      {c.label} {score}%
    </span>
  );
}

function EventCard({ event, onClick }: { event: EventData; onClick: () => void }) {
  const cam = REAL_CAMERAS.find((c) => c.id === event.cameraId);
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded border border-white/8 bg-[#1A1F29] hover:bg-[#1F2634] hover:border-[#3DB8FF]/30 transition-colors p-2.5 group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: objDot(event.color) }}
          />
          <div className="min-w-0">
            <div className="text-[11px] text-foreground font-medium capitalize truncate">
              {event.color} {event.objClass}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {event.cameraId} · {cam?.name ?? event.cameraId} · {event.time}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ConfBadge score={event.confidence} />
          <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-[#3DB8FF] transition-colors" />
        </div>
      </div>
    </button>
  );
}

// Computes a dynamic time axis from whatever events are currently loaded,
// since the real dataset's time window isn't the fixed 17:00-19:00 the
// original mock assumed.
function timeRangeOf(events: EventData[]): { start: number; end: number } {
  if (events.length === 0) {
    const now = Date.now();
    return { start: now - 20 * 60 * 1000, end: now };
  }
  const times = events.map((e) => new Date(e.timestampIso).getTime()).filter((t) => !isNaN(t));
  if (times.length === 0) {
    const now = Date.now();
    return { start: now - 20 * 60 * 1000, end: now };
  }
  const start = Math.min(...times);
  const end = Math.max(...times);
  return start === end ? { start: start - 60 * 1000, end: end + 60 * 1000 } : { start, end };
}

function TimelineView({ events, onEventClick }: { events: EventData[]; onEventClick: (e: EventData) => void }) {
  const { start, end } = timeRangeOf(events);
  const span = end - start;
  const toPercent = (iso: string) => {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return 0;
    return Math.max(0, Math.min(99, ((t - start) / span) * 100));
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
      {/* Time axis */}
      <div className="flex ml-[140px] mb-1 pr-4">
        {ticks.map((t) => (
          <div key={t} className="flex-1 text-right font-mono text-[10px] text-muted-foreground">
            {new Date(start + span * t).toISOString().slice(11, 19)}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {REAL_CAMERAS.map((cam) => {
          const camEvents = events.filter((e) => e.cameraId === cam.id);
          return (
            <div key={cam.id} className="flex items-center gap-3 h-10">
              {/* Camera label */}
              <div className="w-[140px] shrink-0 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-mono text-[10px] text-muted-foreground">{cam.id}</span>
                <span className="text-[10px] text-muted-foreground/60 truncate">{cam.name}</span>
              </div>

              {/* Track lane */}
              <div className="flex-1 relative h-8 bg-[#12161D] rounded border border-white/5">
                {/* Events */}
                {camEvents.map((evt) => {
                  const c = confColor(evt.confidence);
                  return (
                    <button
                      key={evt.id}
                      onClick={() => onEventClick(evt)}
                      title={`${evt.color} ${evt.objClass} — ${evt.confidence}% confidence`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 group"
                      style={{ left: `${toPercent(evt.timestampIso)}%` }}
                    >
                      <span
                        className="block w-3 h-3 rounded-full border-2 border-[#0B0E13] transition-transform group-hover:scale-150"
                        style={{ backgroundColor: objDot(evt.color) }}
                      />
                      <span
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0.5 h-1.5 rounded"
                        style={{ backgroundColor: c.bar }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {events.length === 0 && (
        <div className="mt-8 flex flex-col items-center py-6 text-center">
          <Search className="w-6 h-6 text-muted-foreground/20 mb-2" />
          <span className="text-[11px] text-muted-foreground/50">Run a query or select an identity to see events here</span>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 flex items-center gap-6 ml-[152px] flex-wrap">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Object color</span>
        {OBJECT_COLORS.map((c) => (
          <div key={c} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-[#0B0E13]" style={{ backgroundColor: objDot(c) }} />
            <span className="text-[10px] text-muted-foreground capitalize">{c}</span>
          </div>
        ))}
        <div className="w-px h-3 bg-white/10" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</span>
        {[{ label: "High ≥85%", color: "#4ADE80" }, { label: "Med 60–84%", color: "#FBBF24" }, { label: "Low <60%", color: "#F87171" }].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapView({ events, activeSource, onEventClick }: { events: EventData[]; activeSource: string | null; onEventClick: (e: EventData) => void }) {
  const cam0 = REAL_CAMERAS[0];
  const cam1 = REAL_CAMERAS[1];
  const camerasWithEvents = new Set(events.map((e) => e.cameraId));
  const spansBoth = camerasWithEvents.has("cam_0") && camerasWithEvents.has("cam_1");
  const trackLabel = events[0]?.trackId;

  return (
    <div className="flex-1 relative overflow-hidden bg-[#0D1118] p-4">
      <div className="absolute inset-4 rounded border border-white/6">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="5" y="5" width="90" height="90" rx="1" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />

          {/* Cross-camera link, only drawn when the loaded events actually span both real cameras */}
          {spansBoth && (
            <line
              x1={cam0.pos.x} y1={cam0.pos.y}
              x2={cam1.pos.x} y2={cam1.pos.y}
              stroke="#3DB8FF"
              strokeWidth="0.6"
              strokeDasharray="1.5 1"
              strokeOpacity="0.5"
            />
          )}

          {REAL_CAMERAS.map((cam) => {
            const camEvents = events.filter((e) => e.cameraId === cam.id);
            const isActive = camEvents.length > 0;
            return (
              <g key={cam.id}>
                {isActive && (
                  <circle cx={cam.pos.x} cy={cam.pos.y} r="5" fill="rgba(61,184,255,0.08)" stroke="rgba(61,184,255,0.3)" strokeWidth="0.4" />
                )}
                <circle
                  cx={cam.pos.x} cy={cam.pos.y} r="2.4"
                  fill="#12161D"
                  stroke={isActive ? "#3DB8FF" : "rgba(255,255,255,0.12)"}
                  strokeWidth="0.4"
                />
                <text x={cam.pos.x} y={cam.pos.y + 0.7} textAnchor="middle" fill={isActive ? "#3DB8FF" : "rgba(255,255,255,0.3)"} fontSize="2" fontFamily="monospace">
                  ◈
                </text>
                <text x={cam.pos.x} y={cam.pos.y + 6} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="2" fontFamily="monospace">
                  {cam.id}
                </text>
                <text x={cam.pos.x} y={cam.pos.y + 9} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="1.6" fontFamily="monospace">
                  {cam.name}
                </text>

                {camEvents.map((evt, ei) => {
                  const angle = (ei / Math.max(camEvents.length, 1)) * Math.PI * 2;
                  const r = 5;
                  return (
                    <circle
                      key={evt.id}
                      cx={cam.pos.x + Math.cos(angle) * r}
                      cy={cam.pos.y + Math.sin(angle) * r}
                      r="1.2"
                      fill={objDot(evt.color)}
                      stroke="#0B0E13"
                      strokeWidth="0.3"
                      className="cursor-pointer"
                      onClick={() => onEventClick(evt)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>

        {events.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Search className="w-6 h-6 text-muted-foreground/20 mb-2" />
            <span className="text-[11px] text-muted-foreground/50">Run a query or select an identity to see events here</span>
          </div>
        )}

        {trackLabel && (
          <div className="absolute bottom-3 left-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-[#3DB8FF]/70">{activeSource ?? trackLabel}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FrameImage({ cameraId, frameRef, cam1FramesAvailable }: { cameraId: string; frameRef: string; cam1FramesAvailable: boolean | null }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const unavailable = cameraId === "cam_1" && cam1FramesAvailable === false;

  useEffect(() => {
    setState("loading");
  }, [cameraId, frameRef]);

  if (unavailable) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <AlertCircle className="w-6 h-6 text-amber-400/60 mx-auto mb-2" />
          <span className="font-mono text-[10px] text-amber-400/70 leading-relaxed">
            cam_1 source frames not available in this environment (WILDTRACK C2 was not provided).
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {state !== "loaded" && (
        <div className="absolute inset-0 flex items-center justify-center">
          {state === "loading" ? (
            <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
          ) : (
            <div className="text-center">
              <Camera className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <span className="font-mono text-[10px] text-muted-foreground/40">Frame image failed to load</span>
            </div>
          )}
        </div>
      )}
      <img
        src={frameUrl(cameraId, frameRef)}
        alt={`Frame ${frameRef} from ${cameraId}`}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </>
  );
}

function EventDetailModal({ event, cam1FramesAvailable, onClose }: { event: EventData; cam1FramesAvailable: boolean | null; onClose: () => void }) {
  const cam = REAL_CAMERAS.find((c) => c.id === event.cameraId);
  const c = confColor(event.confidence);
  const [reviewed, setReviewed] = useState<"confirmed" | "rejected" | null>(null);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#12161D] border border-white/10 rounded-sm w-[520px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[#3DB8FF]">{event.id}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="font-mono text-[11px] text-muted-foreground">{event.trackId}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Detection frame (real image, wired to the corrected /api/frames endpoint) */}
        <div className="mx-4 mt-4 relative bg-[#0B0E13] rounded-sm overflow-hidden aspect-video flex items-center justify-center border border-white/6">
          <FrameImage cameraId={event.cameraId} frameRef={event.frameRef} cam1FramesAvailable={cam1FramesAvailable} />
          <div className="absolute top-2 left-2 font-mono text-[9px] text-white/25">{event.cameraId} · {cam?.name ?? event.cameraId}</div>
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-[#0B0E13]/80 border border-emerald-400/20 rounded px-1.5 py-0.5">
            <EyeOff className="w-2.5 h-2.5 text-emerald-400" />
            <span className="font-mono text-[8px] text-emerald-400">NO FACE ID</span>
          </div>
          <div className="absolute bottom-2 right-2 font-mono text-[9px] text-white/25">{event.time}</div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-px bg-white/5 m-4 mt-3 rounded-sm overflow-hidden">
          {[
            { label: "Timestamp",    value: event.timestampIso },
            { label: "Camera",       value: `${event.cameraId} — ${cam?.name ?? event.cameraId}` },
            { label: "Object",       value: `${event.color} ${event.objClass}`, colored: true },
            { label: "Track ID",     value: event.trackId },
            { label: "Dwell time",   value: event.dwell },
            { label: "Frame ref",    value: event.frameRef },
          ].map(({ label, value, colored }) => (
            <div key={label} className="bg-[#12161D] px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">{label}</div>
              <div className={`font-mono text-[11px] ${colored ? "" : "text-foreground"}`}>
                {colored ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: objDot(event.color) }} />
                    <span className="text-foreground capitalize">{value}</span>
                  </span>
                ) : value}
              </div>
            </div>
          ))}
        </div>

        {/* Confidence bar */}
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Confidence score</span>
            <ConfBadge score={event.confidence} />
          </div>
          <div className="h-1.5 bg-[#1A1F29] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${event.confidence}%`, backgroundColor: c.bar }}
            />
          </div>
          {event.confidence < 60 && (
            <div className="flex items-center gap-1.5 mt-2">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-[10px] text-red-400">Low confidence — manual verification required</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 pb-4">
          {reviewed === null ? (
            <>
              <button
                onClick={() => setReviewed("confirmed")}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-sm bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 text-[12px] font-medium hover:bg-emerald-400/20 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Confirm match
              </button>
              <button
                onClick={() => setReviewed("rejected")}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-sm bg-red-400/10 border border-red-400/30 text-red-400 text-[12px] font-medium hover:bg-red-400/20 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject match
              </button>
              <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-sm bg-[#1A1F29] border border-white/8 text-muted-foreground text-[12px] hover:text-foreground hover:border-white/15 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
                Jump to feed
              </button>
            </>
          ) : (
            <div className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-sm text-[12px] font-medium ${reviewed === "confirmed" ? "bg-emerald-400/10 border border-emerald-400/30 text-emerald-400" : "bg-red-400/10 border border-red-400/30 text-red-400"}`}>
              {reviewed === "confirmed" ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {reviewed === "confirmed" ? "Match confirmed" : "Match rejected"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrivacyPanel({ onClose }: { onClose: () => void }) {
  const [faceBlur, setFaceBlur] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#12161D] border border-white/10 rounded-sm w-[580px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#3DB8FF]" />
            <span className="text-sm font-medium text-foreground">Privacy & Redaction</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Face blur toggle */}
          <div className="px-4 py-4 border-b border-white/6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <EyeOff className="w-3.5 h-3.5 text-[#3DB8FF]" />
                  <span className="text-sm font-medium">Bystander face blur</span>
                </div>
                <p className="text-[11px] text-muted-foreground max-w-xs">
                  Automatically applies blur to all faces visible in review footage. Faces are never used for identification.
                </p>
              </div>
              <button
                onClick={() => setFaceBlur(!faceBlur)}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${faceBlur ? "bg-[#3DB8FF]" : "bg-[#2A3344]"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${faceBlur ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-1.5 px-2 py-1.5 bg-emerald-400/5 border border-emerald-400/15 rounded-sm">
              <Shield className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="text-[10px] text-emerald-400">Facial recognition is disabled and unavailable in this system. Object-based tracking only.</span>
            </div>
          </div>

          {/* Data retention */}
          <div className="px-4 py-4 border-b border-white/6">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5 text-[#3DB8FF]" />
              <span className="text-sm font-medium">Data retention policy</span>
              <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">READ ONLY</span>
            </div>
            <div className="space-y-2">
              {[
                { key: "Raw footage",          value: "72 hours — auto-purge" },
                { key: "Detection events",     value: "30 days" },
                { key: "Confirmed matches",    value: "90 days (case-attached)" },
                { key: "Analyst query log",    value: "1 year (audit)" },
                { key: "Exported clips",       value: "As per case management SOP" },
              ].map(({ key, value }) => (
                <div key={key} className="flex items-center justify-between py-1 border-b border-white/4">
                  <span className="text-[11px] text-muted-foreground">{key}</span>
                  <span className="font-mono text-[11px] text-foreground/80">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Audit log */}
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-[#3DB8FF]" />
                <span className="text-sm font-medium">Access & audit log</span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">Today · {AUDIT_LOG.length} events</span>
            </div>
            <div className="space-y-1">
              {AUDIT_LOG.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-white/4 last:border-0">
                  <span className="font-mono text-[10px] text-muted-foreground/60 w-[130px] shrink-0">{entry.ts.split(" ")[1]}</span>
                  <span className="font-mono text-[10px] text-[#3DB8FF]/70 w-[100px] shrink-0 truncate">{entry.user.split("@")[0]}</span>
                  <span className="font-mono text-[9px] uppercase text-muted-foreground/50 w-[80px] shrink-0">{entry.action}</span>
                  <span className="text-[11px] text-foreground/70 truncate">{entry.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab]         = useState<"timeline" | "map">("timeline");
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [showPrivacy, setShowPrivacy]     = useState(false);
  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [query, setQuery]                 = useState("");
  const [activeColors, setActiveColors]   = useState<string[]>([]);
  const [activeClasses, setActiveClasses] = useState<string[]>([]);
  const [isQuerying, setIsQuerying]       = useState(false);
  const chatEndRef                        = useRef<HTMLDivElement>(null);
  const queryRef                          = useRef<HTMLTextAreaElement>(null);

  // Backend connectivity
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");

  // Real identities (from /api/identities)
  const [identities, setIdentities]           = useState<IdentitySummary[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState(true);
  const [identitiesError, setIdentitiesError] = useState<string | null>(null);

  // Selected identity detail (from /api/person/{track_id})
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const [personLoading, setPersonLoading]        = useState(false);
  const [personError, setPersonError]            = useState<string | null>(null);

  // Whichever events are currently driving Timeline/Map — from the last chat
  // query or the last identity click, whichever happened most recently.
  const [activeEvents, setActiveEvents] = useState<EventData[]>([]);
  const [activeSource, setActiveSource] = useState<string | null>(null);

  // Whether cam_1 (WILDTRACK C2) frame images are actually servable in this
  // environment — probed once against the corrected /api/frames endpoint
  // rather than assumed.
  const [cam1FramesAvailable, setCam1FramesAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isQuerying]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== queryRef.current) {
        e.preventDefault();
        queryRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load identities + check backend connectivity on mount
  useEffect(() => {
    fetch("/api/identities")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data: { identities: IdentitySummary[] }) => {
        setIdentities(data.identities);
        setBackendStatus("online");
      })
      .catch((err) => {
        setIdentitiesError(err instanceof Error ? err.message : String(err));
        setBackendStatus("offline");
      })
      .finally(() => setIdentitiesLoading(false));

    // Probe cam_1 frame availability: /api/frames/cam_1/{anything} returns
    // 503 specifically when the C2_IMAGES_DIR is absent, regardless of
    // filename, so this doesn't need a real frame_ref. Uses GET, not HEAD —
    // confirmed live that this FastAPI route 405s on HEAD (doesn't auto-add
    // it the way Starlette usually does for GET-only routes).
    fetch("/api/frames/cam_1/__probe__.png", { method: "GET" })
      .then((res) => setCam1FramesAvailable(res.status !== 503))
      .catch(() => setCam1FramesAvailable(false));
  }, []);

  const selectIdentity = async (trackId: string) => {
    setSelectedIdentity(trackId);
    setPersonLoading(true);
    setPersonError(null);
    try {
      const res = await fetch(`/api/person/${encodeURIComponent(trackId)}`);
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data: { track_id: string; total_events: number; events: PersonEvent[] } = await res.json();
      setActiveEvents(data.events.map(toEventDataFromPerson));
      setActiveSource(`Identity: ${trackId}`);
    } catch (err) {
      setPersonError(err instanceof Error ? err.message : String(err));
    } finally {
      setPersonLoading(false);
    }
  };

  const filteredEvents = activeEvents.filter((e) => {
    const colorMatch  = activeColors.length  === 0 || activeColors.includes(e.color);
    const classMatch  = activeClasses.length === 0 || activeClasses.includes(e.objClass);
    return colorMatch && classMatch;
  });

  const toggleColor = (c: string) =>
    setActiveColors((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  const toggleClass = (c: string) =>
    setActiveClasses((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const sendQuery = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isQuerying) return;

    const userMsg: ChatMessage = { id: `m${Date.now()}`, role: "user", content: trimmed, ts: nowTs() };
    setMessages((prev) => [...prev, userMsg]);
    setQuery("");
    setIsQuerying(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      if (!res.ok) {
        throw new Error(`Backend returned ${res.status}`);
      }
      const data: QueryResponse = await res.json();
      const events = data.events.map(toEventDataFromQuery);

      setBackendStatus("online");
      if (events.length > 0) {
        setActiveEvents(events);
        setActiveSource(`Query: "${trimmed}"`);
      }

      const assistantMsg: ChatMessage = {
        id: `m${Date.now() + 1}`,
        role: "assistant",
        content: data.summary,
        events: events.length > 0 ? events : undefined,
        matchedCount: data.matched_events_count,
        ts: nowTs(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setBackendStatus("offline");
      const message = err instanceof Error ? err.message : String(err);
      const errorMsg: ChatMessage = {
        id: `m${Date.now() + 1}`,
        role: "assistant",
        content: `Query failed: ${message}. Confirm the backend is running at http://localhost:8000 and try again.`,
        isError: true,
        ts: nowTs(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery(query);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden" style={{ fontFamily: "var(--font-sans)" }}>

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <header className="h-11 shrink-0 flex items-center justify-between px-4 border-b border-border bg-[#0D1118] z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#3DB8FF]/10 border border-[#3DB8FF]/20 px-2 py-1 rounded-sm">
              <Camera className="w-3.5 h-3.5 text-[#3DB8FF]" />
              <span className="text-[12px] font-semibold text-[#3DB8FF] tracking-wide">COPILOT</span>
            </div>
            <span className="text-[10px] text-muted-foreground/50 font-mono">CCTV ANALYST · SOC-ALPHA</span>
          </div>
          <div className="w-px h-4 bg-white/8" />
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${backendStatus === "online" ? "bg-emerald-400 animate-pulse" : backendStatus === "offline" ? "bg-red-400" : "bg-amber-400 animate-pulse"}`} />
            <span className="font-mono text-[11px] text-foreground/70">2/2 cameras registered (cam_1 frames unavailable)</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* No facial recognition badge */}
          <div className="flex items-center gap-1.5 border border-emerald-400/20 bg-emerald-400/5 px-2 py-1 rounded-sm">
            <EyeOff className="w-3 h-3 text-emerald-400" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400">No facial recognition</span>
          </div>

          {/* Connection status — reflects a real /api/identities probe */}
          <div className="flex items-center gap-1.5">
            {backendStatus === "online" ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-red-400" />
            )}
            <span className="font-mono text-[10px] text-muted-foreground">
              {backendStatus === "checking" ? "CONNECTING…" : backendStatus === "online" ? "CONNECTED" : "BACKEND UNREACHABLE"}
            </span>
          </div>

          <button
            onClick={() => setShowPrivacy(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        <aside className="w-[220px] shrink-0 border-r border-border bg-[#0D1118] flex flex-col overflow-y-auto">

          {/* Camera list — real cam_0 / cam_1, not a fictional 6-camera layout */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Camera className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Cameras</span>
            </div>
            <div className="space-y-0.5">
              {REAL_CAMERAS.map((cam) => {
                const framesOk = cam.id === "cam_0" ? true : cam1FramesAvailable;
                return (
                  <div key={cam.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded-sm hover:bg-white/4 group">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-foreground/80 truncate">{cam.id}</div>
                      <div className="text-[9px] text-muted-foreground/50 truncate">{cam.name}</div>
                    </div>
                    {framesOk === false && (
                      <span title="Frame images not available in this environment">
                        <WifiOff className="w-2.5 h-2.5 text-amber-400/60 shrink-0" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Identities — real data from /api/identities */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Verified identities</span>
            </div>
            {identitiesLoading ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground/50">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px]">Loading…</span>
              </div>
            ) : identitiesError ? (
              <div className="flex items-start gap-1.5 py-1 text-red-400/80">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                <span className="text-[10px]">{identitiesError}</span>
              </div>
            ) : (
              <div className="space-y-0.5">
                {identities.map((id) => (
                  <button
                    key={id.track_id}
                    onClick={() => selectIdentity(id.track_id)}
                    className={`w-full text-left flex items-center gap-2 px-1.5 py-1.5 rounded-sm transition-colors ${
                      selectedIdentity === id.track_id ? "bg-[#3DB8FF]/10 border border-[#3DB8FF]/30" : "hover:bg-white/4 border border-transparent"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-foreground/80 truncate">{id.track_id}</div>
                      <div className="text-[9px] text-muted-foreground/50 truncate">
                        {id.total_events} events · {id.cameras.join(", ")}
                      </div>
                    </div>
                    {personLoading && selectedIdentity === id.track_id && (
                      <Loader2 className="w-3 h-3 animate-spin text-[#3DB8FF]" />
                    )}
                  </button>
                ))}
              </div>
            )}
            {personError && (
              <div className="flex items-start gap-1.5 mt-1.5 py-1 text-red-400/80">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                <span className="text-[10px]">{personError}</span>
              </div>
            )}
          </div>

          {/* Verified demo window */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Verified window</span>
            </div>
            <div className="bg-[#12161D] border border-white/6 rounded-sm px-2 py-1.5">
              <div className="font-mono text-[10px] text-foreground/80">frames 00001700–00001900</div>
              <div className="text-[9px] text-muted-foreground/50 mt-0.5">only window with ground-truth-verified cross-camera links</div>
            </div>
          </div>

          {/* Object filters */}
          <div className="p-3 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <SlidersHorizontal className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Object filters</span>
            </div>

            <div className="mb-3">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1.5">Color</div>
              <div className="flex flex-wrap gap-1">
                {OBJECT_COLORS.map((color) => {
                  const active = activeColors.includes(color);
                  return (
                    <button
                      key={color}
                      onClick={() => toggleColor(color)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[9px] transition-colors ${
                        active ? "border-[#3DB8FF]/50 bg-[#3DB8FF]/10 text-[#3DB8FF]" : "border-white/8 text-muted-foreground/60 hover:border-white/15"
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: objDot(color) }}
                      />
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1.5">Class</div>
              <div className="flex flex-wrap gap-1">
                {OBJECT_CLASSES.map((cls) => {
                  const active = activeClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      onClick={() => toggleClass(cls)}
                      className={`px-1.5 py-0.5 rounded-sm border text-[9px] capitalize transition-colors ${
                        active ? "border-[#3DB8FF]/50 bg-[#3DB8FF]/10 text-[#3DB8FF]" : "border-white/8 text-muted-foreground/60 hover:border-white/15"
                      }`}
                    >
                      {cls}
                    </button>
                  );
                })}
              </div>
            </div>

            {(activeColors.length > 0 || activeClasses.length > 0) && (
              <button
                onClick={() => { setActiveColors([]); setActiveClasses([]); }}
                className="mt-3 text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </aside>

        {/* ── Center Panel ─────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden border-r border-border">

          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-border bg-[#0D1118] px-4 shrink-0">
            {[
              { id: "timeline" as const, label: "Timeline", icon: AlignLeft },
              { id: "map"      as const, label: "Map view", icon: Map },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? "border-[#3DB8FF] text-[#3DB8FF]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 pb-0.5">
              <span className="font-mono text-[10px] text-muted-foreground/50">
                {activeSource ? `${activeSource} · ` : ""}{filteredEvents.length} events
                {(activeColors.length > 0 || activeClasses.length > 0) && " (filtered)"}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === "timeline" ? (
              <TimelineView events={filteredEvents} onEventClick={setSelectedEvent} />
            ) : (
              <MapView events={filteredEvents} activeSource={activeSource} onEventClick={setSelectedEvent} />
            )}
          </div>
        </main>

        {/* ── Right Copilot Panel ───────────────────────────────────────── */}
        <aside className="w-[340px] shrink-0 flex flex-col bg-[#0D1118] overflow-hidden">

          {/* Panel header */}
          <div className="px-3 py-2.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#3DB8FF]" />
              <span className="text-[12px] font-semibold text-foreground">Analyst Copilot</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground/40 uppercase tracking-wider">Press / to focus</span>
            </div>
          </div>

          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4" style={{ scrollbarWidth: "none" }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <Activity className="w-6 h-6 text-muted-foreground/20 mb-2" />
                <span className="text-[11px] text-muted-foreground/50 max-w-[220px]">
                  Ask about tracked identities across cam_0 and cam_1 — try one of the suggestions below.
                </span>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%]">
                      <div className="bg-[#1A2133] border border-[#3DB8FF]/15 rounded-sm px-3 py-2 text-[12px] text-foreground">
                        {msg.content}
                      </div>
                      <div className="text-right font-mono text-[9px] text-muted-foreground/40 mt-1">{msg.ts}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${msg.isError ? "bg-red-400" : "bg-[#3DB8FF]"}`} />
                      <span className={`font-mono text-[9px] uppercase tracking-wider ${msg.isError ? "text-red-400/70" : "text-[#3DB8FF]/60"}`}>
                        Copilot · {msg.ts}
                      </span>
                    </div>
                    <div className={`rounded-sm px-3 py-2 text-[12px] leading-relaxed ${
                      msg.isError
                        ? "bg-red-400/5 border border-red-400/20 text-red-300"
                        : "bg-[#12161D] border border-white/6 text-foreground/90"
                    }`}>
                      {msg.isError && <AlertCircle className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />}
                      {msg.content}
                    </div>
                    {/* Source event cards */}
                    {msg.events && msg.events.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
                          Source events · {msg.events.length} detections
                        </div>
                        {msg.events.map((evt) => (
                          <EventCard key={evt.id} event={evt} onClick={() => setSelectedEvent(evt)} />
                        ))}
                      </div>
                    )}
                    {/* No results empty state */}
                    {!msg.isError && msg.matchedCount === 0 && (
                      <div className="flex flex-col items-center py-6 bg-[#12161D] border border-white/6 rounded-sm">
                        <Search className="w-6 h-6 text-muted-foreground/20 mb-2" />
                        <span className="text-[11px] text-muted-foreground/50 text-center max-w-[180px]">
                          No matching events found in the current scope
                        </span>
                        <span className="text-[10px] text-muted-foreground/30 mt-1">Try broadening the query — the demo dataset only covers person_001–004, cam_0/cam_1, frames 00001700–00001900</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator while /api/query is in flight */}
            {isQuerying && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3DB8FF]" />
                <div className="bg-[#12161D] border border-white/6 rounded-sm px-3 py-2 flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1 h-1 bg-[#3DB8FF]/40 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggested queries */}
          <div className="px-3 py-2 border-t border-border shrink-0">
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => sendQuery(q)}
                  disabled={isQuerying}
                  className="text-[10px] px-2 py-0.5 rounded-sm border border-white/8 text-muted-foreground/70 hover:border-[#3DB8FF]/30 hover:text-[#3DB8FF] transition-colors disabled:opacity-30"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Query input */}
          <div className="px-3 pb-3 pt-2 shrink-0">
            <div className="flex items-end gap-2 bg-[#12161D] border border-white/10 rounded-sm focus-within:border-[#3DB8FF]/40 transition-colors">
              <textarea
                ref={queryRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about the footage..."
                rows={2}
                className="flex-1 bg-transparent px-3 pt-2.5 pb-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 resize-none outline-none"
                style={{ fontFamily: "var(--font-sans)" }}
              />
              <div className="flex items-center gap-1 pb-2 pr-2">
                <button className="p-1.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  <Mic className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => sendQuery(query)}
                  disabled={!query.trim() || isQuerying}
                  className="p-1.5 rounded bg-[#3DB8FF] text-[#0B0E13] hover:bg-[#5DC8FF] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isQuerying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="font-mono text-[9px] text-muted-foreground/30">Enter to send · Shift+Enter for newline</span>
              {(activeColors.length > 0 || activeClasses.length > 0) && (
                <span className="font-mono text-[9px] text-[#3DB8FF]/50">Filters active</span>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {selectedEvent && <EventDetailModal event={selectedEvent} cam1FramesAvailable={cam1FramesAvailable} onClose={() => setSelectedEvent(null)} />}
      {showPrivacy   && <PrivacyPanel onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
