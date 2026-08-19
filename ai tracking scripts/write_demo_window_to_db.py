# DEPRECATED — first-attempt demo-window writer, produced 0/4 correct cross-camera
# matches (distance-only scoring, no ground-truth verification). Kept for history
# only. Do not run this against backend/db/pattern_of_life.db — it will overwrite
# the real, ground-truth-verified data. Use write_verified_demo_window_to_db.py instead.

import os, json, sqlite3
from collections import defaultdict
from datetime import datetime, timedelta
from calibration_utils import get_homography_for_view, pixel_to_ground

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")
DB_PATH = os.path.join(SCRIPT_DIR, "..", "backend", "db", "pattern_of_life.db")

DEMO_START, DEMO_END = "00001600", "00001790"
FPS = 10
MAX_DISTANCE = 60
MISMATCH_PENALTY = 40
MISSING_PENALTY = 10
MIN_SHARED_FRAMES = 3
EPOCH = datetime(2026, 7, 7, 18, 0, 0)  # arbitrary reference; timestamps are derived from frame index, not real capture time

H0 = get_homography_for_view(0, CALIB_DIR)
H1 = get_homography_for_view(1, CALIB_DIR)

def foot_point(bbox):
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, y2

def in_window(frame_ref):
    frame = frame_ref.split('/')[-1].replace('.png', '')
    return DEMO_START <= frame <= DEMO_END

def load_tracks(path, H):
    with open(path) as f:
        data = json.load(f)
    tracks = defaultdict(dict)
    for e in data:
        if not in_window(e['frame_ref']):
            continue
        frame = e['frame_ref'].split('/')[-1].replace('.png', '')
        u, v = foot_point(e['bbox'])
        x, y = pixel_to_ground(u, v, H)
        tracks[e['track_id']][frame] = {
            'x': x, 'y': y, 'bbox': e['bbox'],
            'object_class': e.get('object_class'), 'object_color': e.get('object_color'),
            'confidence': e.get('confidence'), 'frame_ref': e['frame_ref'],
        }
    return tracks

cam0_tracks = load_tracks("events_cam0.json", H0)
cam1_tracks = load_tracks("events_cam1.json", H1)
print(f"Window {DEMO_START}-{DEMO_END}: cam_0 tracks={len(cam0_tracks)}  cam_1 tracks={len(cam1_tracks)}")

def attribute_penalty(c0, col0, c1, col1):
    if c0 in (None, 'none') or c1 in (None, 'none'):
        return MISSING_PENALTY
    if c0 == c1 and col0 == col1:
        return 0
    return MISMATCH_PENALTY

pairs = []
for t0, f0 in cam0_tracks.items():
    for t1, f1 in cam1_tracks.items():
        shared = set(f0) & set(f1)
        if len(shared) < MIN_SHARED_FRAMES:
            continue
        costs = []
        for f in shared:
            d0, d1 = f0[f], f1[f]
            dist = ((d0['x']-d1['x'])**2 + (d0['y']-d1['y'])**2) ** 0.5
            costs.append(dist + attribute_penalty(d0['object_class'], d0['object_color'], d1['object_class'], d1['object_color']))
        avg_cost = sum(costs) / len(costs)
        if avg_cost <= MAX_DISTANCE:
            pairs.append((avg_cost, t0, t1, len(shared)))

pairs.sort()
matched0, matched1, fused_pairs = set(), set(), []
for cost, t0, t1, n in pairs:
    if t0 in matched0 or t1 in matched1:
        continue
    matched0.add(t0); matched1.add(t1)
    fused_pairs.append((t0, t1, cost, n))

print(f"\nCross-camera matches found in this window: {len(fused_pairs)}")
for t0, t1, cost, n in fused_pairs:
    print(f"  cam_0 {t0} <-> cam_1 {t1}   avg_cost={cost:.1f}   shared_frames={n}")

fused_id_map, person_counter = {}, 1
for t0, t1, cost, n in fused_pairs:
    uid = f"person_{person_counter:03d}"
    fused_id_map[("cam_0", t0)] = uid
    fused_id_map[("cam_1", t1)] = uid
    person_counter += 1
for t0 in cam0_tracks:
    if ("cam_0", t0) not in fused_id_map:
        fused_id_map[("cam_0", t0)] = f"person_{person_counter:03d}"; person_counter += 1
for t1 in cam1_tracks:
    if ("cam_1", t1) not in fused_id_map:
        fused_id_map[("cam_1", t1)] = f"person_{person_counter:03d}"; person_counter += 1

print(f"\nTotal unified identities: {person_counter - 1}  ({len(fused_pairs)} cross-camera fusions, {person_counter - 1 - len(fused_pairs)} single-camera-only)")

rows = []
for cam_label, tracks in (("cam_0", cam0_tracks), ("cam_1", cam1_tracks)):
    for orig_tid, frames in tracks.items():
        uid = fused_id_map[(cam_label, orig_tid)]
        frame_nums = sorted(int(f) for f in frames)
        dwell = (frame_nums[-1] - frame_nums[0]) / FPS if len(frame_nums) > 1 else 0
        for f, info in frames.items():
            ts = (EPOCH + timedelta(seconds=int(f)/FPS)).strftime("%Y-%m-%dT%H:%M:%SZ")
            eid = f"evt_demo_{cam_label}_{orig_tid}_{f}"
            rows.append((eid, uid, cam_label, ts, info['x'], info['y'], info['object_class'],
                         info['object_color'], info['confidence'], round(dwell, 1), json.dumps(info['bbox']), info['frame_ref']))

print(f"\nTotal event rows to write: {len(rows)}")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("DELETE FROM events")
for r in rows:
    cur.execute("""INSERT OR REPLACE INTO events
        (id, track_id, camera_id, timestamp, ground_x, ground_y, object_class, object_color, confidence, dwell_seconds, bbox, frame_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", r)
conn.commit()
conn.close()
print(f"\nWrote {len(rows)} real events to {DB_PATH}, replacing stub data.")
