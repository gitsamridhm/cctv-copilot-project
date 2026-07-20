import os
import json
import glob
import cv2
from detect import detect_people
from tracker import CentroidTracker
from carried_object import detect_carried_object, COLOR_RANGES


def run_event_pipeline(camera_id, image_folder, output_json_path, stride=10):
    # Initialize tracker with our validated parameters
    tracker = CentroidTracker(max_distance=250, max_disappeared=3)

    # Get all frames in order
    all_frame_paths = sorted(glob.glob(os.path.join(image_folder, "*.png")))

    # Slice the dataset using the stride to sample a fraction of frames
    frame_paths = all_frame_paths[::stride]

    events = []

    print(f"Starting pipeline for {camera_id}.")
    print(f"Sampling with stride={stride} (Analyzing {len(frame_paths)} of {len(all_frame_paths)} frames)...")

    for i, frame_path in enumerate(frame_paths):
        frame_name = os.path.basename(frame_path)
        print(f"[{i+1}/{len(frame_paths)}] Processing {frame_name}...")

        img = cv2.imread(frame_path)
        if img is None:
            print(f"  WARNING: could not load {frame_path}, skipping")
            continue

        # 1. Detect people
        detections = detect_people(frame_path, conf=0.4)

        # 2. Update tracker (now carries confidence internally)
        tracked_objects = tracker.update(detections)

        # 3. Process each tracked person for carried objects
        for obj in tracked_objects:
            track_id = obj["track_id"]
            bbox = obj["bbox"]  # (x1, y1, x2, y2)
            confidence = round(obj["confidence"], 2)

            # 4. Extract lower portion of bounding box for HSV color heuristic
            x1, y1, x2, y2 = map(int, bbox)
            y_mid = y1 + int((y2 - y1) * 0.4)

            detected_object = detect_carried_object(img, (x1, y_mid, x2, y2), COLOR_RANGES)

            # SAFE UNPACKING FIX
            # Check if an object was actually returned and ensures it is a dictionary
            if detected_object and isinstance(detected_object, dict):
                obj_class = detected_object.get("object_class", "none")
                obj_color = detected_object.get("object_color", "none")
            else:
                obj_class = "none"
                obj_color = "none"

            # 5. Format and append event record
            event_record = {
                "camera_id": camera_id,
                "track_id": int(track_id),
                "frame_ref": f"{camera_id}/{frame_name}",
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "object_class": str(obj_class),   # Always forces a clean, flat string
                "object_color": str(obj_color),   # Always forces a clean, flat string
                "confidence": confidence
            }
            events.append(event_record)

    # Write events to JSON (overwrites any existing file)
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    with open(output_json_path, "w") as f:
        json.dump(events, f, indent=4)

    print(f"Successfully wrote {len(events)} event records to {output_json_path}\n")


if __name__ == "__main__":
    run_event_pipeline(
        camera_id="cam_0",
        image_folder="../data/Image_subsets/C1",
        output_json_path="../output/events_cam0.json",
        stride=2
    )
