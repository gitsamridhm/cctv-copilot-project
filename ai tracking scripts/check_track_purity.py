import os, json
from collections import defaultdict, Counter
from load_annotations import load_all_annotations

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ANN_DIR = os.path.join(SCRIPT_DIR, "..", "data", "annotations_positions")

def load_tracks(path):
    with open(path) as f:
        data = json.load(f)
    tracks = defaultdict(dict)
    for e in data:
        frame = e['frame_ref'].split('/')[-1].replace('.png', '')
        tracks[e['track_id']][frame] = {'bbox': e['bbox']}
    return tracks

def iou(a, b):
    xA, yA = max(a[0], b[0]), max(a[1], b[1])
    xB, yB = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, xB - xA) * max(0, yB - yA)
    areaA = max(0, a[2]-a[0]) * max(0, a[3]-a[1])
    areaB = max(0, b[2]-b[0]) * max(0, b[3]-b[1])
    denom = areaA + areaB - inter
    return inter / denom if denom > 0 else 0

print("Loading ground truth...")
all_gt = load_all_annotations(ANN_DIR)

def track_purity(tracks, view_num):
    purities = []
    for tid, frames in tracks.items():
        votes, total = Counter(), 0
        for frame_id, info in frames.items():
            gt_boxes = all_gt.get(frame_id, {}).get(view_num, [])
            best_iou, best_pid = 0, None
            for b in gt_boxes:
                score = iou(info['bbox'], b['bbox'])
                if score > best_iou:
                    best_iou, best_pid = score, b['person_id']
            if best_iou >= 0.3:
                votes[best_pid] += 1
                total += 1
        if total >= 3:
            purities.append((votes.most_common(1)[0][1] / total, tid, total, len(votes)))
    return purities

p0 = track_purity(load_tracks("events_cam0.json"), 0)
p1 = track_purity(load_tracks("events_cam1.json"), 1)
all_p = sorted(p0 + p1)

avg_purity = sum(p[0] for p in all_p) / len(all_p)
pure = sum(1 for p in all_p if p[0] >= 0.9)
mixed = sum(1 for p in all_p if p[0] < 0.7)

print(f"\nTracks analyzed: {len(all_p)}")
print(f"Average purity: {avg_purity*100:.1f}%")
print(f">=90% pure (clean single-person tracks): {pure} ({pure/len(all_p)*100:.1f}%)")
print(f"<70% pure (likely identity-switched): {mixed} ({mixed/len(all_p)*100:.1f}%)")
print(f"\n10 worst tracks:")
for purity, tid, total, n_people in all_p[:10]:
    print(f"  track {tid:>3}  purity={purity*100:>5.1f}%  frames_checked={total:>3}  distinct_real_people_seen={n_people}")
