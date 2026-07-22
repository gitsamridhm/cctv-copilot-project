import os, json
from collections import defaultdict
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
        tracks[e['track_id']][frame] = {
            'x': x, 'y': y,
            'object_class': e.get('object_class'),
            'object_color': e.get('object_color'),
            'confidence': e.get('confidence'),
            'bbox': e['bbox'], 'camera_id': e['camera_id'], 'frame_ref': e['frame_ref'],
        }
    return tracks

cam0_tracks = load_tracks("events_cam0.json", H0)
cam1_tracks = load_tracks("events_cam1.json", H1)

MAX_DISTANCE = 60      # cm hard cutoff -- above your measured worst-case (51.3cm)
MISMATCH_PENALTY = 40  # object_class/color both present but disagree
MISSING_PENALTY = 10   # one side has no object detected ("none")
MIN_SHARED_FRAMES = 3  # require real overlap, not a coincidental 1-frame blip

def attribute_penalty(c0, col0, c1, col1):
    if c0 in (None, 'none') or c1 in (None, 'none'):
        return MISSING_PENALTY
    if c0 == c1 and col0 == col1:
        return 0
    return MISMATCH_PENALTY

pair_scores = []
for t0, frames0 in cam0_tracks.items():
    for t1, frames1 in cam1_tracks.items():
        shared = set(frames0) & set(frames1)
        if len(shared) < MIN_SHARED_FRAMES:
            continue
        costs = []
        for f in shared:
            d0, d1 = frames0[f], frames1[f]
            dist = ((d0['x']-d1['x'])**2 + (d0['y']-d1['y'])**2) ** 0.5
            costs.append(dist + attribute_penalty(d0['object_class'], d0['object_color'], d1['object_class'], d1['object_color']))
        avg_cost = sum(costs) / len(costs)
        if avg_cost <= MAX_DISTANCE:
            pair_scores.append((avg_cost, t0, t1, len(shared)))

pair_scores.sort()
matched0, matched1, fused_matches = set(), set(), []
for cost, t0, t1, n in pair_scores:
    if t0 in matched0 or t1 in matched1:
        continue
    matched0.add(t0); matched1.add(t1)
    fused_matches.append({'cam0_track': t0, 'cam1_track': t1, 'avg_cost': round(cost,1), 'shared_frames': n})

print(f"cam_0 tracks: {len(cam0_tracks)}  |  cam_1 tracks: {len(cam1_tracks)}")
print(f"Fused cross-camera matches found: {len(fused_matches)}\n")
for m in fused_matches[:15]:
    print(f"  cam_0 track {m['cam0_track']:>3} <-> cam_1 track {m['cam1_track']:>3}   avg_cost={m['avg_cost']:>5}   shared_frames={m['shared_frames']}")

with open("fused_matches_preview.json", "w") as f:
    json.dump(fused_matches, f, indent=2)
print(f"\nFull list saved to fused_matches_preview.json ({len(fused_matches)} matches)")
