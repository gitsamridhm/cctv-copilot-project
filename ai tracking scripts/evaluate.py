from load_annotations import load_annotations
from detect import detect_people
import glob
import os


def compute_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter_area = max(0, xB - xA) * max(0, yB - yA)
    boxA_area = (boxA[2]-boxA[0]) * (boxA[3]-boxA[1])
    boxB_area = (boxB[2]-boxB[0]) * (boxB[3]-boxB[1])
    union = boxA_area + boxB_area - inter_area
    return inter_area / union if union > 0 else 0


def evaluate_camera(ann_path, image_path, camera_idx, iou_threshold=0.5):
    gt_boxes = load_annotations(ann_path).get(camera_idx, [])
    pred_boxes = detect_people(image_path)

    matched_gt = set()
    tp = 0

    for pred in pred_boxes:
        best_iou = 0
        best_gt_idx = -1
        for i, gt in enumerate(gt_boxes):
            if i in matched_gt:
                continue
            iou = compute_iou(pred["bbox"], gt["bbox"])
            if iou > best_iou:
                best_iou = iou
                best_gt_idx = i
        if best_iou >= iou_threshold:
            tp += 1
            matched_gt.add(best_gt_idx)

    fp = len(pred_boxes) - tp
    fn = len(gt_boxes) - tp
    return {"tp": tp, "fp": fp, "fn": fn}


if __name__ == "__main__":
    ann_dir = "../data/annotations_positions"
    ann_files = sorted(glob.glob(f"{ann_dir}/*.json"))

    # LIMIT: only evaluate a sample instead of the full 400 for speed
    LIMIT = 40
    ann_files = ann_files[:LIMIT]

    total_tp, total_fp, total_fn = 0, 0, 0

    for i, ann_path in enumerate(ann_files):
        frame_id = os.path.basename(ann_path).replace(".json", "")
        image_path = f"../data/Image_subsets/C1/{frame_id}.png"
        if not os.path.exists(image_path):
            continue
        print(f"[{i+1}/{len(ann_files)}] Evaluating {frame_id}...")
        result = evaluate_camera(ann_path, image_path, camera_idx=0)
        total_tp += result["tp"]
        total_fp += result["fp"]
        total_fn += result["fn"]

    precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0

    print(f"\nEvaluated on {len(ann_files)} frames (sample)")
    print(f"Overall Precision: {precision:.3f}")
    print(f"Overall Recall: {recall:.3f}")
    print(f"TP: {total_tp}, FP: {total_fp}, FN: {total_fn}")