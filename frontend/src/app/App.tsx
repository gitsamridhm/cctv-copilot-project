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
  Eye,
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
  Clock,
  Zap,
  Search,
  SlidersHorizontal,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CameraData {
  id: string;
  name: string;
  status: "online" | "offline";
  zone: string;
  pos: { x: number; y: number };
}

interface EventData {
  id: string;
  cameraId: string;
  time: string;
  color: string;
  objClass: string;
  confidence: number;
  trackId: string;
  dwell: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  events?: EventData[];
  ts: string;
}

// ── Static Data ────────────────────────────────────────────────────────────────

const CAMERAS: CameraData[] = [
  { id: "CAM-01", name: "North Entrance", status: "online",  zone: "A", pos: { x: 50, y: 9  } },
  { id: "CAM-02", name: "East Corridor",  status: "online",  zone: "B", pos: { x: 82, y: 42 } },
  { id: "CAM-03", name: "Plaza Center",   status: "online",  zone: "A", pos: { x: 50, y: 50 } },
  { id: "CAM-04", name: "South Gate",     status: "offline", zone: "C", pos: { x: 50, y: 88 } },
  { id: "CAM-05", name: "Parking Deck A", status: "online",  zone: "B", pos: { x: 16, y: 70 } },
  { id: "CAM-06", name: "West Exit",      status: "online",  zone: "C", pos: { x: 12, y: 36 } },
];

const EVENTS: EventData[] = [
  { id: "EVT-001", cameraId: "CAM-01", time: "17:42:15", color: "red",    objClass: "backpack",  confidence: 92, trackId: "TRK-448", dwell: "0:23" },
  { id: "EVT-002", cameraId: "CAM-02", time: "17:45:38", color: "red",    objClass: "backpack",  confidence: 88, trackId: "TRK-448", dwell: "1:12" },
  { id: "EVT-003", cameraId: "CAM-03", time: "17:51:09", color: "red",    objClass: "backpack",  confidence: 79, trackId: "TRK-448", dwell: "2:47" },
  { id: "EVT-004", cameraId: "CAM-01", time: "18:02:33", color: "blue",   objClass: "tote bag",  confidence: 95, trackId: "TRK-291", dwell: "0:08" },
  { id: "EVT-005", cameraId: "CAM-05", time: "18:14:55", color: "red",    objClass: "backpack",  confidence: 61, trackId: "TRK-448", dwell: "0:41" },
  { id: "EVT-006", cameraId: "CAM-06", time: "18:22:17", color: "black",  objClass: "duffel bag",confidence: 84, trackId: "TRK-512", dwell: "1:03" },
  { id: "EVT-007", cameraId: "CAM-02", time: "18:31:44", color: "red",    objClass: "backpack",  confidence: 91, trackId: "TRK-448", dwell: "0:55" },
  { id: "EVT-008", cameraId: "CAM-03", time: "18:38:22", color: "yellow", objClass: "backpack",  confidence: 73, trackId: "TRK-667", dwell: "0:19" },
  { id: "EVT-009", cameraId: "CAM-06", time: "18:47:01", color: "red",    objClass: "backpack",  confidence: 85, trackId: "TRK-448", dwell: "0:34" },
];

const OBJECT_COLORS = ["red", "blue", "black", "yellow", "green", "orange", "white", "gray"];
const OBJECT_CLASSES = ["backpack", "tote bag", "duffel bag", "jacket", "hat", "luggage"];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "Show all red backpack detections after 6pm.",
    ts: "18:45:00",
  },
  {
    id: "m2",
    role: "assistant",
    content:
      "Found 3 detections matching red backpack after 18:00. Track TRK-448 appears across CAM-05, CAM-02, and CAM-06 between 18:14 and 18:47. Confidence ranges from 61% to 91% — one detection flagged for manual review.",
    events: EVENTS.filter((e) => e.color === "red" && timeToMinutes(e.time) >= 18 * 60),
    ts: "18:45:02",
  },
];

const SUGGESTED_QUERIES = [
  "Show all events after 6pm",
  "Find anyone with a yellow bag",
  "Trace full path of TRK-448",
  "CAM-02 between 17:30–18:00",
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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const TIME_START = 17 * 60;
const TIME_END = 19 * 60;
const TIME_SPAN = TIME_END - TIME_START;

function timeToPercent(t: string): number {
  const mins = timeToMinutes(t);
  return Math.max(0, Math.min(99, ((mins - TIME_START) / TIME_SPAN) * 100));
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
  const cam = CAMERAS.find((c) => c.id === event.cameraId);
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
              {event.cameraId} · {cam?.name} · {event.time}
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

function TimelineView({ events, onEventClick }: { events: EventData[]; onEventClick: (e: EventData) => void }) {
  const hours = [17, 18, 19];
  const ticks = [0, 30, 60, 90, 120];

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
      {/* Time axis */}
      <div className="flex ml-[140px] mb-1 pr-4">
        {ticks.map((t) => (
          <div key={t} className="flex-1 text-right font-mono text-[10px] text-muted-foreground">
            {String(17 + Math.floor(t / 60)).padStart(2, "0")}:{String(t % 60).padStart(2, "0")}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {CAMERAS.map((cam) => {
          const camEvents = events.filter((e) => e.cameraId === cam.id);
          return (
            <div key={cam.id} className="flex items-center gap-3 h-10">
              {/* Camera label */}
              <div className="w-[140px] shrink-0 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${cam.status === "online" ? "bg-emerald-400" : "bg-red-400/60"}`} />
                <span className="font-mono text-[10px] text-muted-foreground">{cam.id}</span>
                <span className="text-[10px] text-muted-foreground/60 truncate">{cam.name.split(" ")[0]}</span>
              </div>

              {/* Track lane */}
              <div className="flex-1 relative h-8 bg-[#12161D] rounded border border-white/5">
                {/* Hour grid lines */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-y-0 w-px bg-white/5"
                    style={{ left: `${((h * 60 - TIME_START) / TIME_SPAN) * 100}%` }}
                  />
                ))}

                {/* Events */}
                {camEvents.map((evt) => {
                  const c = confColor(evt.confidence);
                  return (
                    <button
                      key={evt.id}
                      onClick={() => onEventClick(evt)}
                      title={`${evt.color} ${evt.objClass} — ${evt.confidence}% confidence`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 group"
                      style={{ left: `${timeToPercent(evt.time)}%` }}
                    >
                      <span
                        className="block w-3 h-3 rounded-full border-2 border-[#0B0E13] transition-transform group-hover:scale-150"
                        style={{ backgroundColor: objDot(evt.color) }}
                      />
                      {/* confidence tick below */}
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

      {/* Legend */}
      <div className="mt-6 flex items-center gap-6 ml-[152px] flex-wrap">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Object color</span>
        {["red", "blue", "black", "yellow"].map((c) => (
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

// TRK-448 path order: CAM-01 → CAM-02 → CAM-03 → CAM-05 → CAM-02 → CAM-06
const TRK_448_PATH = ["CAM-01", "CAM-02", "CAM-03", "CAM-05", "CAM-02", "CAM-06"];

function MapView({ events, onEventClick }: { events: EventData[]; onEventClick: (e: EventData) => void }) {
  const pathCams = TRK_448_PATH.map((id) => CAMERAS.find((c) => c.id === id)!);

  return (
    <div className="flex-1 relative overflow-hidden bg-[#0D1118] p-4">
      <div className="absolute inset-4 rounded border border-white/6">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Floor plan outline */}
          <rect x="5" y="5" width="90" height="90" rx="1" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          {/* Internal zones */}
          <rect x="30" y="30" width="40" height="40" rx="0.5" fill="rgba(61,184,255,0.02)" stroke="rgba(61,184,255,0.06)" strokeWidth="0.4" strokeDasharray="2 1.5" />
          <text x="50" y="52" textAnchor="middle" fill="rgba(61,184,255,0.15)" fontSize="3" fontFamily="monospace">PLAZA ZONE A</text>
          {/* Corridors */}
          <rect x="5" y="44" width="25" height="12" fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.03)" strokeWidth="0.3" />
          <rect x="70" y="44" width="25" height="12" fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.03)" strokeWidth="0.3" />
          <rect x="44" y="5" width="12" height="25" fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.03)" strokeWidth="0.3" />
          <rect x="44" y="70" width="12" height="25" fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.03)" strokeWidth="0.3" />

          {/* TRK-448 dotted path */}
          {pathCams.slice(0, -1).map((cam, i) => {
            const next = pathCams[i + 1];
            return (
              <line
                key={i}
                x1={cam.pos.x} y1={cam.pos.y}
                x2={next.pos.x} y2={next.pos.y}
                stroke="#3DB8FF"
                strokeWidth="0.6"
                strokeDasharray="1.5 1"
                strokeOpacity="0.5"
              />
            );
          })}

          {/* Camera icons */}
          {CAMERAS.map((cam) => {
            const camEvents = events.filter((e) => e.cameraId === cam.id);
            const isActive = camEvents.length > 0;
            return (
              <g key={cam.id}>
                {isActive && (
                  <circle
                    cx={cam.pos.x} cy={cam.pos.y} r="3.5"
                    fill="rgba(61,184,255,0.08)"
                    stroke="rgba(61,184,255,0.3)"
                    strokeWidth="0.4"
                  />
                )}
                <circle
                  cx={cam.pos.x} cy={cam.pos.y} r="2"
                  fill={cam.status === "offline" ? "#1A1F29" : "#12161D"}
                  stroke={cam.status === "offline" ? "rgba(248,113,113,0.5)" : isActive ? "#3DB8FF" : "rgba(255,255,255,0.12)"}
                  strokeWidth="0.4"
                />
                <text x={cam.pos.x} y={cam.pos.y + 0.7} textAnchor="middle" fill={cam.status === "offline" ? "#F87171" : isActive ? "#3DB8FF" : "rgba(255,255,255,0.3)"} fontSize="1.8" fontFamily="monospace">
                  ◈
                </text>
                <text x={cam.pos.x} y={cam.pos.y + 5} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="1.8" fontFamily="monospace">
                  {cam.id}
                </text>

                {/* Event dots */}
                {camEvents.map((evt, ei) => {
                  const angle = (ei / Math.max(camEvents.length, 1)) * Math.PI * 2;
                  const r = 4;
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

        {/* Track legend */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <svg width="20" height="6" viewBox="0 0 20 6"><line x1="0" y1="3" x2="20" y2="3" stroke="#3DB8FF" strokeWidth="1.5" strokeDasharray="4 2" strokeOpacity="0.7" /></svg>
            <span className="font-mono text-[10px] text-[#3DB8FF]/70">TRK-448</span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
            <span className="font-mono text-[10px] text-muted-foreground">red backpack</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventDetailModal({ event, onClose }: { event: EventData; onClose: () => void }) {
  const cam = CAMERAS.find((c) => c.id === event.cameraId);
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

        {/* Detection thumbnail */}
        <div className="mx-4 mt-4 relative bg-[#0B0E13] rounded-sm overflow-hidden aspect-video flex items-center justify-center border border-white/6">
          {/* Simulated camera frame */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Camera className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <span className="font-mono text-[10px] text-muted-foreground/40">FRAME CAPTURE</span>
            </div>
          </div>
          {/* Bounding box overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-20 h-28 border-2 relative"
              style={{ borderColor: c.bar }}
            >
              <span
                className="absolute -top-5 left-0 font-mono text-[9px] px-1 py-0.5 rounded-sm"
                style={{ backgroundColor: c.bar, color: "#0B0E13" }}
              >
                {event.color} {event.objClass} · {event.confidence}%
              </span>
              <span
                className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-r-2 border-b-2"
                style={{ borderColor: c.bar }}
              />
              <span
                className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-l-2 border-b-2"
                style={{ borderColor: c.bar }}
              />
            </div>
          </div>
          {/* Camera ID watermark */}
          <div className="absolute top-2 left-2 font-mono text-[9px] text-white/25">{event.cameraId} · {cam?.name}</div>
          {/* No facial recognition badge */}
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-[#0B0E13]/80 border border-emerald-400/20 rounded px-1.5 py-0.5">
            <EyeOff className="w-2.5 h-2.5 text-emerald-400" />
            <span className="font-mono text-[8px] text-emerald-400">NO FACE ID</span>
          </div>
          {/* Timestamp */}
          <div className="absolute bottom-2 right-2 font-mono text-[9px] text-white/25">2024-01-15 {event.time}</div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-px bg-white/5 m-4 mt-3 rounded-sm overflow-hidden">
          {[
            { label: "Timestamp",    value: `2024-01-15 ${event.time}` },
            { label: "Camera",       value: `${event.cameraId} — ${cam?.name}` },
            { label: "Object",       value: `${event.color} ${event.objClass}`, colored: true },
            { label: "Track ID",     value: event.trackId },
            { label: "Dwell time",   value: `${event.dwell}s` },
            { label: "Zone",         value: cam?.zone ? `Zone ${cam.zone}` : "—" },
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
  const [logExpanded, setLogExpanded] = useState(true);

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
  const [messages, setMessages]           = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [query, setQuery]                 = useState("");
  const [activeColors, setActiveColors]   = useState<string[]>([]);
  const [activeClasses, setActiveClasses] = useState<string[]>([]);
  const [dateRange]                       = useState("2024-01-15 · 17:00 – 19:00");
  const [isTyping, setIsTyping]           = useState(false);
  const chatEndRef                        = useRef<HTMLDivElement>(null);
  const queryRef                          = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

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

  const filteredEvents = EVENTS.filter((e) => {
    const colorMatch  = activeColors.length  === 0 || activeColors.includes(e.color);
    const classMatch  = activeClasses.length === 0 || activeClasses.includes(e.objClass);
    return colorMatch && classMatch;
  });

  const toggleColor = (c: string) =>
    setActiveColors((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  const toggleClass = (c: string) =>
    setActiveClasses((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const sendQuery = (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: `m${Date.now()}`, role: "user", content: text.trim(), ts: new Date().toTimeString().slice(0, 8) };
    setMessages((prev) => [...prev, userMsg]);
    setQuery("");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const matchedEvents = filteredEvents.filter(
        (e) => text.toLowerCase().includes(e.color) || text.toLowerCase().includes("all") || text.toLowerCase().includes(e.objClass)
      );
      const assistantMsg: ChatMessage = {
        id: `m${Date.now() + 1}`,
        role: "assistant",
        content: matchedEvents.length > 0
          ? `Found ${matchedEvents.length} detection${matchedEvents.length > 1 ? "s" : ""} matching your query across ${[...new Set(matchedEvents.map((e) => e.cameraId))].join(", ")}. Review source events below.`
          : "No events matched your query in the current date range and filter set. Try broadening the time window or object filters.",
        events: matchedEvents.length > 0 ? matchedEvents : undefined,
        ts: new Date().toTimeString().slice(0, 8),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }, 1400);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery(query);
    }
  };

  const onlineCameras = CAMERAS.filter((c) => c.status === "online").length;

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
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] text-foreground/70">{onlineCameras}/{CAMERAS.length} cameras online</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* No facial recognition badge */}
          <div className="flex items-center gap-1.5 border border-emerald-400/20 bg-emerald-400/5 px-2 py-1 rounded-sm">
            <EyeOff className="w-3 h-3 text-emerald-400" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400">No facial recognition</span>
          </div>

          {/* Cost indicator */}
          <div className="flex items-center gap-1.5 border border-white/8 px-2 py-1 rounded-sm">
            <Zap className="w-3 h-3 text-amber-400/70" />
            <span className="font-mono text-[10px] text-muted-foreground">$0.024</span>
            <span className="font-mono text-[9px] text-muted-foreground/40">/ session</span>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-[10px] text-muted-foreground">CONNECTED</span>
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

          {/* Camera list */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Camera className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Cameras</span>
            </div>
            <div className="space-y-0.5">
              {CAMERAS.map((cam) => (
                <div key={cam.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded-sm hover:bg-white/4 cursor-pointer group">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cam.status === "online" ? "bg-emerald-400" : "bg-red-400/50"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-foreground/80 truncate">{cam.id}</div>
                    <div className="text-[9px] text-muted-foreground/50 truncate">{cam.name}</div>
                  </div>
                  {cam.status === "offline" && <WifiOff className="w-2.5 h-2.5 text-red-400/50 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Date / time range */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Date range</span>
            </div>
            <div className="bg-[#12161D] border border-white/6 rounded-sm px-2 py-1.5">
              <div className="font-mono text-[10px] text-foreground/80">{dateRange}</div>
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

            {/* Active filter / query sync indicator */}
            {(activeColors.length > 0 || activeClasses.length > 0) && (
              <div className="mt-3 px-2 py-1.5 bg-[#3DB8FF]/5 border border-[#3DB8FF]/15 rounded-sm">
                <div className="text-[9px] text-[#3DB8FF]/70">Filters applied — queries will use this scope</div>
              </div>
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
                {filteredEvents.length} events
                {(activeColors.length > 0 || activeClasses.length > 0) && " (filtered)"}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === "timeline" ? (
              <TimelineView events={filteredEvents} onEventClick={setSelectedEvent} />
            ) : (
              <MapView events={filteredEvents} onEventClick={setSelectedEvent} />
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
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3DB8FF]" />
                      <span className="font-mono text-[9px] text-[#3DB8FF]/60 uppercase tracking-wider">Copilot · {msg.ts}</span>
                    </div>
                    <div className="bg-[#12161D] border border-white/6 rounded-sm px-3 py-2 text-[12px] text-foreground/90 leading-relaxed">
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
                    {msg.events === undefined && msg.role === "assistant" && msg.content.startsWith("No events") && (
                      <div className="flex flex-col items-center py-6 bg-[#12161D] border border-white/6 rounded-sm">
                        <Search className="w-6 h-6 text-muted-foreground/20 mb-2" />
                        <span className="text-[11px] text-muted-foreground/50 text-center max-w-[180px]">
                          No matching events found in the current scope
                        </span>
                        <span className="text-[10px] text-muted-foreground/30 mt-1">Try broadening filters or date range</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
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
                  className="text-[10px] px-2 py-0.5 rounded-sm border border-white/8 text-muted-foreground/70 hover:border-[#3DB8FF]/30 hover:text-[#3DB8FF] transition-colors"
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
                  disabled={!query.trim()}
                  className="p-1.5 rounded bg-[#3DB8FF] text-[#0B0E13] hover:bg-[#5DC8FF] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
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
      {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {showPrivacy   && <PrivacyPanel onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
