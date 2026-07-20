import cv2
import numpy as np

# Split ranges and labels to make them highly modular for wildcard queries
COLOR_RANGES = {
    "blue": ([100, 120, 70], [130, 255, 255]),
    "black": ([0, 0, 0], [180, 255, 50]),
    "red": ([0, 120, 70], [10, 255, 255]),
}

OBJECT_CLASSES = {
    "blue": "jacket",
    "black": "suitcase",
    "red": "backpack",
}

def detect_carried_object(img, person_box, color_ranges=COLOR_RANGES, high_thresh=0.15, med_thresh=0.06):
    """
    Analyzes a person's bounding box region using HSV color masking.
    Returns structured details (color, object class, and match tier) 
    designed to easily map to wildcard database queries.

    Args:
        img: full image (as loaded by cv2.imread)
        person_box: (x1, y1, x2, y2) bounding box of the detected person
        color_ranges: dict of {color_label: (lower_hsv, upper_hsv)}
        high_thresh: coverage fraction to declare a high-confidence match
        med_thresh: minimum coverage fraction for a medium-confidence match

    Returns:
        dict: containing 'color', 'class', and 'tier'
    """
    x1, y1, x2, y2 = map(int, person_box)
    crop = img[y1:y2, x1:x2]

    # Default structure if nothing is detected
    result = {
        "object_color": "none",
        "object_class": "none",
        "match_tier": "none"
    }

    if crop.size == 0:
        return result

    # Fix: Aligned indentation cleanly to 4 spaces
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)

    for color, (lower, upper) in color_ranges.items():
        # Handle the wrap-around red hue spectrum natively
        if color == "red":
            mask1 = cv2.inRange(hsv, np.array([0, 120, 70]), np.array([10, 255, 255]))
            mask2 = cv2.inRange(hsv, np.array([170, 120, 70]), np.array([180, 255, 255]))
            mask = cv2.bitwise_or(mask1, mask2)
        else:
            mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
            
        coverage = mask.sum() / mask.size

        if coverage >= med_thresh:
            result["object_color"] = color
            result["object_class"] = OBJECT_CLASSES.get(color, "unknown")
            
            # Classify match strength for easier fuzzy/wildcard logic
            if coverage >= high_thresh:
                result["match_tier"] = "high_match"
            else:
                result["match_tier"] = "medium_match"
                
            return result # Return the strongest detected match immediately
            
    return result


if __name__ == "__main__":
    # Quick sanity check
    image_path = "../data/Image_subsets/C1/00000000.png"
    img = cv2.imread(image_path)

    if img is None:
        print(f"Could not load image: {image_path}")
    else:
        # Example test box coordinates
        test_bbox = (1000, 400, 1250, 700)
        
        # Focus on lower 60% of the person's bounding box (torso/arms/legs region)
        x1, y1, x2, y2 = test_bbox
        y_mid = y1 + int((y2 - y1) * 0.4)
        
        analysis = detect_carried_object(img, (x1, y_mid, x2, y2))
        print("Heuristic Analysis Results:")
        for k, v in analysis.items():
            print(f"  {k}: {v}")
