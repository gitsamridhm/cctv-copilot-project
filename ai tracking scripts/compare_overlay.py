import cv2
import os
from load_annotations import load_annotations
from detect import detect_people

def draw_comparison(image_path, gt_boxes, pred_boxes, output_path):
    img = cv2.imread(image_path)

    for box in gt_boxes:
        x1, y1, x2, y2 = box["bbox"]
        cv2.rectangle(img, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)

    for box in pred_boxes:
        x1, y1, x2, y2 = box["bbox"]
        cv2.rectangle(img, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 2)

    cv2.imwrite(output_path, img)
    print(f"Saved comparison to {output_path}")

if __name__ == "__main__":
    ann_path = "../data/annotations_positions/00000000.json"
    image_path = "../data/Image_subsets/C1/00000000.png"
    output_path = "../output/compare_cam0.jpg"

    gt = load_annotations(ann_path).get(0, [])
    pred = detect_people(image_path)

    draw_comparison(image_path, gt, pred, output_path)