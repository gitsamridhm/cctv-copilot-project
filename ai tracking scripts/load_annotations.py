import json
import os


def load_annotations(ann_path):
    """
    Load one WILDTRACK annotation JSON file and return bounding boxes
    grouped by camera index.

    Each WILDTRACK annotation file contains a list of people, and each
    person has a list of "views" (one per camera). A view with
    xmin == -1 means that person isn't visible in that camera, so we
    skip it.

    Returns:
        dict: {camera_index: [ {"person_id": int, "bbox": (x1, y1, x2, y2)}, ... ]}
    """
    with open(ann_path) as f:
        data = json.load(f)

    boxes_by_camera = {}
    for person in data:
        pid = person["personID"]
        for view in person["views"]:
            if view["xmin"] == -1:
                continue  # person not visible in this camera
            cam = view["viewNum"]
            boxes_by_camera.setdefault(cam, []).append({
                "person_id": pid,
                "bbox": (view["xmin"], view["ymin"], view["xmax"], view["ymax"])
            })

    return boxes_by_camera


def load_all_annotations(ann_dir, limit=None):
    """
    Load multiple annotation files from a directory.

    Args:
        ann_dir (str): path to the annotations_positions folder
        limit (int, optional): only load the first N files (useful for testing)

    Returns:
        dict: {frame_id: {camera_index: [boxes...]}}
    """
    files = sorted(os.listdir(ann_dir))
    if limit:
        files = files[:limit]

    all_frames = {}
    for fname in files:
        if not fname.endswith(".json"):
            continue
        frame_id = fname.replace(".json", "")
        path = os.path.join(ann_dir, fname)
        all_frames[frame_id] = load_annotations(path)

    return all_frames


if __name__ == "__main__":
    # Quick sanity check — run this file directly to test it
    ann_path = "../data/annotations_positions/00000000.json"

    if not os.path.exists(ann_path):
        print(f"File not found: {ann_path}")
        print("Make sure the WILDTRACK dataset is downloaded and unzipped into data/")
    else:
        result = load_annotations(ann_path)
        print(f"Loaded annotations from {ann_path}\n")
        for cam, boxes in sorted(result.items()):
            print(f"Camera {cam}: {len(boxes)} people")

        # Print a couple of example boxes so you can eyeball the format
        first_cam = sorted(result.keys())[0]
        print(f"\nSample boxes from camera {first_cam}:")
        for b in result[first_cam][:3]:
            print(b)