import cv2
import os
from load_annotations import load_annotations


def draw_boxes(image_path, boxes, output_path):
    """
    Draw bounding boxes on an image and save the result.

    Args:
        image_path (str): path to the frame image
        boxes (list): list of {"person_id": int, "bbox": (x1, y1, x2, y2)}
        output_path (str): where to save the annotated image
    """
    img = cv2.imread(image_path)

    if img is None:
        print(f"Could not load image: {image_path}")
        return

    for box in boxes:
        x1, y1, x2, y2 = box["bbox"]
        pid = box["person_id"]

        cv2.rectangle(img, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
        cv2.putText(img, str(pid), (int(x1), int(y1) - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

    cv2.imwrite(output_path, img)
    print(f"Saved overlay image to {output_path}")


if __name__ == "__main__":
    ann_path = "../data/annotations_positions/00000000.json"
    camera_to_check = 0  # which camera's annotations to visualize

    image_path = f"../data/Image_subsets/C{camera_to_check + 1}/00000000.png"
    output_path = f"../output/overlay_cam{camera_to_check}.jpg"

    if not os.path.exists(ann_path):
        print(f"Annotation file not found: {ann_path}")
    elif not os.path.exists(image_path):
        print(f"Image file not found: {image_path}")
        print("Check your Image_subsets folder structure and file naming.")
    else:
        result = load_annotations(ann_path)
        boxes = result.get(camera_to_check, [])
        print(f"Drawing {len(boxes)} boxes for camimpera {camera_to_check}")
        draw_boxes(image_path, boxes, output_path)