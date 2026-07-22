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
        }
    return tracks

cam0_tracks = load_tracks("events_cam0.json", H0)
cam1_tracks = load_tracks("events_cam1.json", H1)

MIN_SHARED_FRAMES = 3
results = []
for t0, frames0 in cam0_tracks.items():
    for t1, frames1 in cam1_tracks.items():
        shared = set(frames0) & set(frames1)
        if len(shared) < MIN_SHARED_FRAMES:
            continue
        dists = []
        for f in shared:
            d0, d1 = frames0[f], frames1[f]
            dists.append(((d0['x']-d1['x'])**2 + (d0['y']-d1['y'])**2) ** 0.5)
        avg_dist = sum(dists) / len(dists)
        f0 = next(iter(shared))
        d0, d1 = frames0[f0], frames1[f0]
        same_attr = (d0['object_class'] == d1['object_class'] and d0['object_color'] == d1['object_color'])
        results.append((avg_dist, t0, t1, len(shared), same_attr, d0['object_class'], d1['object_class']))

print(f"Pairs with >= {MIN_SHARED_FRAMES} shared frames: {len(results)}")
if not results:
    print("No pairs even share enough frames -- track fragmentation is likely the real bottleneck.")
else:
    results.sort()
    dists_only = [r[0] for r in results]
    print(f"Min raw ground-distance (before any attribute penalty): {dists_only[0]:.1f}cm")
    print(f"5th percentile: {dists_only[int(len(dists_only)*0.05)]:.1f}cm")
    print(f"Median: {dists_only[len(dists_only)//2]:.1f}cm")
    print(f"\nTop 10 closest pairs, raw distance only (no penalty applied):")
    for avg_dist, t0, t1, n, same_attr, c0, c1 in results[:10]:
        print(f"  cam_0 track {t0:>3} <-> cam_1 track {t1:>3}   raw_dist={avg_dist:>7.1f}cm   shared_frames={n:>3}   attrs_match={same_attr}   ({c0} vs {c1})")
