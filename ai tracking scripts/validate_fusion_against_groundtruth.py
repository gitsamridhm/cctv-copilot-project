import os, json
from collections import defaultdict, Counter
from calibration_utils import get_homography_for_view, pixel_to_ground
from load_annotations import load_all_annotations

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.join(SCRIPT_DIR, "..", "data", "calibrations")
ANN_DIR = os.path.join(SCRIPT_DIR, "..", "data", "annotations_positions")

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
        frame = e['frame_ref'].split('/')[-1].replace('.png', '')
        u, v = foot_point(e['bbox'])
        x, y = pixel_to_ground(u, v, H)
        tracks[e['track_id']][frame] = {'x': x, 'y': y, 'bbox': e['bbox']}
    return tracks

def iou(a, b):
    xA, yA = max(a[0], b[0]), max(a[1], b[1])
    xB, yB = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, xB - xA) * max(0, yB - yA)
    areaA = max(0, a[2]-a[0]) * max(0, a[3]-a[1])
    areaB = max(0, b[2]-b[0]) * max(0, b[3]-b[1])
    denom = areaA + areaB - inter
    return inter / denom if denom > 0 else 0

print("Loading ground-truth annotations (400 frames)...")
all_gt = load_all_annotations(ANN_DIR)
print("Loaded.\n")

cam0_tracks = load_tracks("events_cam0.json", H0)
cam1_tracks = load_tracks("events_cam1.json", H1)

def identify(tracks, view_num):
    identity = {}
    for tid, frames in tracks.items():
        votes = Counter()
        for frame_id, info in frames.items():
            gt_boxes = all_gt.get(frame_id, {}).get(view_num, [])
            best_iou, best_pid = 0, None
            for b in gt_boxes:
                score = iou(info['bbox'], b['bbox'])
                if score > best_iou:
                    best_iou, best_pid = score, b['person_id']
            if best_iou >= 0.3:
                votes[best_pid] += 1
        identity[tid] = votes.most_common(1)[0][0] if votes else None
    return identity

print("Matching cam_0 tracks to real ground-truth identities...")
cam0_gt = identify(cam0_tracks, 0)
print("Matching cam_1 tracks to real ground-truth identities...")
cam1_gt = identify(cam1_tracks, 1)

# Redo the same one-to-one geometric assignment as before
pairs = []
for t0, frames0 in cam0_tracks.items():
    for t1, frames1 in cam1_tracks.items():
        shared = set(frames0) & set(frames1)
        if len(shared) < 3:
            continue
        dists = [((frames0[f]['x']-frames1[f]['x'])**2 + (frames0[f]['y']-frames1[f]['y'])**2)**0.5 for f in shared]
        pairs.append((sum(dists)/len(dists), t0, t1, len(shared)))
pairs.sort()

matched0, matched1, assigned = set(), set(), []
for p in pairs:
    _, t0, t1 = p[0], p[1], p[2]
    if t0 in matched0 or t1 in matched1:
        continue
    matched0.add(t0); matched1.add(t1)
    assigned.append(p)

correct, wrong, unknown = 0, 0, 0
print(f"\nChecking all {len(assigned)} assigned pairs against REAL ground truth:\n")
for avg_dist, t0, t1, n in assigned:
    gid0, gid1 = cam0_gt.get(t0), cam1_gt.get(t1)
    if gid0 is None or gid1 is None:
        status, unknown = "UNKNOWN", unknown + 1
    elif gid0 == gid1:
        status, correct = "CORRECT", correct + 1
    else:
        status, wrong = "WRONG", wrong + 1
    if avg_dist < 300:  # only print the interesting/close ones
        print(f"  cam_0 {t0:>3} <-> cam_1 {t1:>3}   dist={avg_dist:>7.1f}cm   frames={n:>3}   {status:>8}   (gt: {gid0} vs {gid1})")

print(f"\nTOTALS -- Correct: {correct}   Wrong: {wrong}   Unknown (no good gt match): {unknown}")
print(f"Precision (of known pairs): {correct/(correct+wrong)*100:.1f}%" if (correct+wrong) else "N/A")
