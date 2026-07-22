import os, json
from collections import defaultdict, Counter
from calibration_utils import get_homography_for_view, pixel_to_ground

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")
H0 = get_homography_for_view(0, CALIB_DIR)
H1 = get_homography_for_view(1, CALIB_DIR)

def foot_point(bbox):
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, y2

def load_tracks(path, H):
    with open(path) as f:
        data = json.load(f)
    tracks = defaultdict(dict)
    for e in data:
        frame = e['frame_ref'].split('/')[-1]
        u, v = foot_point(e['bbox'])
        x, y = pixel_to_ground(u, v, H)
        tracks[e['track_id']][frame] = {'x': x, 'y': y, 'object_class': e.get('object_class'), 'object_color': e.get('object_color')}
    return tracks

def majority_attr(frames):
    classes = Counter(d['object_class'] for d in frames.values() if d['object_class'] not in (None, 'none'))
    colors = Counter(d['object_color'] for d in frames.values() if d['object_color'] not in (None, 'none'))
    top_class = classes.most_common(1)[0][0] if classes else 'none'
    top_color = colors.most_common(1)[0][0] if colors else 'none'
    return top_class, top_color

cam0_tracks = load_tracks("events_cam0.json", H0)
cam1_tracks = load_tracks("events_cam1.json", H1)

pairs = []
for t0, frames0 in cam0_tracks.items():
    for t1, frames1 in cam1_tracks.items():
        shared = set(frames0) & set(frames1)
        if len(shared) < 3:
            continue
        dists = [((frames0[f]['x']-frames1[f]['x'])**2 + (frames0[f]['y']-frames1[f]['y'])**2)**0.5 for f in shared]
        avg_dist = sum(dists) / len(dists)
        c0, col0 = majority_attr(frames0)
        c1, col1 = majority_attr(frames1)
        pairs.append((avg_dist, t0, t1, len(shared), c0 == c1 and col0 == col1, c0, c1, col0, col1))

pairs.sort()

matched0, matched1, assigned = set(), set(), []
for p in pairs:
    avg_dist, t0, t1 = p[0], p[1], p[2]
    if t0 in matched0 or t1 in matched1:
        continue
    matched0.add(t0); matched1.add(t1)
    assigned.append(p)

print(f"One-to-one assignment, pure distance (no attribute filter yet): {len(assigned)} matched pairs\n")
for avg_dist, t0, t1, n, same_attr, c0, c1, col0, col1 in assigned[:40]:
    flag = "match" if same_attr else "MISMATCH"
    print(f"  cam_0 {t0:>3} <-> cam_1 {t1:>3}   dist={avg_dist:>7.1f}cm   frames={n:>3}   {flag:>8}   ({col0} {c0} vs {col1} {c1})")
