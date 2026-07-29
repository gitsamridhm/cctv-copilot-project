import os, json, sqlite3
from collections import defaultdict, Counter
from datetime import datetime, timedelta
from calibration_utils import get_homography_for_view, pixel_to_ground
from load_annotations import load_all_annotations

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")
ANN_DIR = os.path.join(SCRIPT_DIR, "..", "data", "annotations_positions")
DB_PATH = os.path.join(SCRIPT_DIR, "..", "backend", "db", "pattern_of_life.db")

DEMO_START, DEMO_END = "00001700", "00001900"  # centered on the verified match (1760-1860) with lead-in/out
FPS = 10
MAX_DISTANCE = 60
MISMATCH_PENALTY = 40
MISSING_PENALTY = 10
MIN_SHARED_FRAMES = 3
EPOCH = datetime(2026, 7, 7, 18, 0, 0)

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
        tracks[e['track_id']][frame] = {'x': x, 'y': y, 'bbox': e['bbox'],
            'object_class': e.get('object_class'), 'object_color': e.get('object_color'),
            'confidence': e.get('confidence'), 'frame_ref': e['frame_ref']}
    return tracks

cam0_tracks = load_tracks("events_cam0.json", H0)
cam1_tracks = load_tracks("events_cam1.json", H1)
print(f"Window {DEMO_START}-{DEMO_END}: cam_0 tracks={len(cam0_tracks)}  cam_1 tracks={len(cam1_tracks)}")

print("Loading ground truth to verify candidates...")
all_gt = load_all_annotations(ANN_DIR)

def iou(a, b):
    xA, yA = max(a[0], b[0]), max(a[1], b[1])
    xB, yB = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, xB - xA) * max(0, yB - yA)
    areaA = max(0, a[2]-a[0]) * max(0, a[3]-a[1])
    areaB = max(0, b[2]-b[0]) * max(0, b[3]-b[1])
    denom = areaA + areaB - inter
    return inter / denom if denom > 0 else 0

def true_identity(track_frames, frame_list, view_num):
    votes = Counter()
    for f in frame_list:
        gt_boxes = all_gt.get(f, {}).get(view_num, [])
        best_iou, best_pid = 0, None
        for b in gt_boxes:
            s = iou(track_frames[f]['bbox'], b['bbox'])
            if s > best_iou: best_iou, best_pid = s, b['person_id']
        if best_iou >= 0.3: votes[best_pid] += 1
    return votes.most_common(1)[0][0] if votes else None

def attribute_penalty(c0, col0, c1, col1):
    if c0 in (None, 'none') or c1 in (None, 'none'): return MISSING_PENALTY
    if c0 == c1 and col0 == col1: return 0
    return MISMATCH_PENALTY

candidates = []
for t0, f0 in cam0_tracks.items():
    for t1, f1 in cam1_tracks.items():
        shared = sorted(set(f0) & set(f1))
        if len(shared) < MIN_SHARED_FRAMES: continue
        costs = [((f0[f]['x']-f1[f]['x'])**2 + (f0[f]['y']-f1[f]['y'])**2)**0.5 +
                 attribute_penalty(f0[f]['object_class'], f0[f]['object_color'], f1[f]['object_class'], f1[f]['object_color']) for f in shared]
        avg_cost = sum(costs)/len(costs)
        if avg_cost <= MAX_DISTANCE:
            candidates.append((avg_cost, t0, t1, shared))
candidates.sort()

matched0, matched1, verified_fusions = set(), set(), []
for cost, t0, t1, shared in candidates:
    if t0 in matched0 or t1 in matched1: continue
    gt0 = true_identity(cam0_tracks[t0], shared, 0)
    gt1 = true_identity(cam1_tracks[t1], shared, 1)
    if gt0 is not None and gt0 == gt1:
        matched0.add(t0); matched1.add(t1)
        verified_fusions.append((t0, t1, cost, len(shared), gt0))
    else:
        print(f"  Rejected: cam_0 {t0} <-> cam_1 {t1} (cost={cost:.1f}) -- ground truth disagrees ({gt0} vs {gt1})")

print(f"\nGround-truth-VERIFIED fusions kept: {len(verified_fusions)}")
for t0, t1, cost, n, gt in verified_fusions:
    print(f"  cam_0 {t0} <-> cam_1 {t1}   real person={gt}   shared_frames={n}   cost={cost:.1f}")

fused_id_map, person_counter = {}, 1
for t0, t1, cost, n, gt in verified_fusions:
    uid = f"person_{person_counter:03d}"
    fused_id_map[("cam_0", t0)] = uid; fused_id_map[("cam_1", t1)] = uid
    person_counter += 1
for t0 in cam0_tracks:
    if ("cam_0", t0) not in fused_id_map:
        fused_id_map[("cam_0", t0)] = f"person_{person_counter:03d}"; person_counter += 1
for t1 in cam1_tracks:
    if ("cam_1", t1) not in fused_id_map:
        fused_id_map[("cam_1", t1)] = f"person_{person_counter:03d}"; person_counter += 1

print(f"\nTotal unified identities: {person_counter-1}  ({len(verified_fusions)} verified cross-camera, {person_counter-1-len(verified_fusions)} single-camera-only)")

rows = []
for cam_label, tracks in (("cam_0", cam0_tracks), ("cam_1", cam1_tracks)):
    for orig_tid, frames in tracks.items():
        uid = fused_id_map[(cam_label, orig_tid)]
        fn = sorted(int(f) for f in frames)
        dwell = (fn[-1]-fn[0])/FPS if len(fn) > 1 else 0
        for f, info in frames.items():
            ts = (EPOCH + timedelta(seconds=int(f)/FPS)).strftime("%Y-%m-%dT%H:%M:%SZ")
            rows.append((f"evt_demo_{cam_label}_{orig_tid}_{f}", uid, cam_label, ts, info['x'], info['y'],
                info['object_class'], info['object_color'], info['confidence'], round(dwell,1), json.dumps(info['bbox']), info['frame_ref']))

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("DELETE FROM events")
for r in rows:
    cur.execute("""INSERT OR REPLACE INTO events
        (id, track_id, camera_id, timestamp, ground_x, ground_y, object_class, object_color, confidence, dwell_seconds, bbox, frame_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", r)
conn.commit()
conn.close()
print(f"\nWrote {len(rows)} events to {DB_PATH}.")
if verified_fusions:
    flagship = max(verified_fusions, key=lambda v: v[3])
    print(f"Flagship demo identity: {fused_id_map[('cam_0', flagship[0])]} (real person {flagship[4]}) -- cam_0 track {flagship[0]} <-> cam_1 track {flagship[1]}, {flagship[3]} shared frames")
