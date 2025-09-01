import cv2
import numpy as np
import os
import pickle

def classify_contour(cnt, img_shape):
    """
    Improved contour classification with better wall detection
    """
    area = cv2.contourArea(cnt)
    x, y, w, h = cv2.boundingRect(cnt)
    aspect = w / float(h + 1e-9)
    perimeter = cv2.arcLength(cnt, True)
    
    # Compactness (circularity) measure
    if perimeter > 0:
        circularity = 4 * np.pi * area / (perimeter * perimeter)
    else:
        circularity = 0

    # Calculate solidity (area / convex hull area)
    hull = cv2.convexHull(cnt)
    hull_area = cv2.contourArea(hull)
    if hull_area > 0:
        solidity = area / hull_area
    else:
        solidity = 0

    # Walls: large areas, typically rectangular, near image boundaries
    # Check if contour touches image boundaries (common for walls)
    touches_boundary = (x == 0 or y == 0 or 
                        x + w >= img_shape[1] - 1 or 
                        y + h >= img_shape[0] - 1)
    
    # Wall detection criteria
    is_wall = (area > 3000 and 0.2 < aspect < 5.0 and 
               circularity < 0.4 and solidity > 0.7)
    
    # Doors: medium size, rectangular
    is_door = (500 < area <= 3000 and 0.4 < aspect < 2.5 and 
               circularity < 0.5)
    
    # Windows: thin, elongated rectangles
    is_window = (200 < area <= 2000 and (aspect >= 2.5 or aspect <= 0.4) and
                 circularity < 0.6)

    # Prioritize walls that touch boundaries
    if is_wall and touches_boundary:
        return "walls"
    elif is_wall and not touches_boundary:
        # Could be interior walls or large furniture
        # Check if it's likely a wall by its shape
        if solidity > 0.8 and circularity < 0.3:
            return "walls"
    
    if is_door:
        return "doors"
    
    if is_window:
        return "windows"

    return None

def detect_rooms(edges):
    """
    Detect rooms by finding enclosed spaces in the floor plan
    """
    # Create a kernel for morphological operations
    kernel = np.ones((5, 5), np.uint8)
    
    # Close small gaps in walls
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    # Find all contours
    contours, _ = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    
    # Filter for large enclosed areas (potential rooms)
    room_contours = []
    for i, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if area > 8000:  # Minimum area for a room
            # Check if it's a closed contour (room)
            perimeter = cv2.arcLength(cnt, True)
            if perimeter > 0:
                circularity = 4 * np.pi * area / (perimeter * perimeter)
                if circularity > 0.15:  # Reasonably shaped room
                    room_contours.append(cnt)
                    print(f"Room detected: area={area:.1f}, circularity={circularity:.3f}")
    
    return room_contours

def get_contours(edges_path="../output/edges.png", out_pickle="../output/contours.pkl", out_vis="../output/contours.png"):
    if not os.path.exists(edges_path):
        print("❌ edges.png not found. Run preprocess.py first.")
        return {}

    edges = cv2.imread(edges_path, cv2.IMREAD_GRAYSCALE)
    if edges is None:
        print("❌ Failed to read edges image.")
        return {}

    # Create a cleaned version of edges for better contour detection
    kernel = np.ones((3, 3), np.uint8)
    cleaned_edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=1)
    
    # Find contours with hierarchy
    contours, hierarchy = cv2.findContours(cleaned_edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    print(f"Total raw contours found: {len(contours)}")

    # Filter and classify contours
    contours_dict = {"walls": [], "doors": [], "windows": [], "rooms": []}
    
    # First classify walls, doors, and windows
    for i, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if area < 200:  # Skip very small contours
            continue

        # Simplify contour
        epsilon = 0.01 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        
        # Skip contours with too few points
        if len(approx) < 3:
            continue

        label = classify_contour(approx, edges.shape)
        if label:
            contours_dict[label].append(approx.tolist())
            print(f"Contour {i}: area={area:.1f}, classified as {label}")

    # Detect rooms separately
    room_contours = detect_rooms(edges)
    for room_cnt in room_contours:
        epsilon = 0.02 * cv2.arcLength(room_cnt, True)
        approx = cv2.approxPolyDP(room_cnt, epsilon, True)
        contours_dict["rooms"].append(approx.tolist())

    # Visualization
    vis = np.ones((edges.shape[0], edges.shape[1], 3), dtype=np.uint8) * 255
    colors = {
        "walls": (0, 0, 0),        # Black for walls
        "doors": (0, 0, 255),      # Red for doors
        "windows": (255, 0, 0),    # Blue for windows
        "rooms": (0, 255, 0)       # Green for rooms
    }
    
    for label, clist in contours_dict.items():
        for c in clist:
            pts = np.array(c, dtype=np.int32).reshape(-1, 1, 2)
            if label == "rooms":
                # Fill rooms with semi-transparent green
                overlay = vis.copy()
                cv2.fillPoly(overlay, [pts], colors[label])
                cv2.addWeighted(overlay, 0.3, vis, 0.7, 0, vis)
                cv2.drawContours(vis, [pts], -1, colors[label], 2)
            else:
                cv2.drawContours(vis, [pts], -1, colors[label], 2)
                cv2.fillPoly(vis, [pts], colors[label])

    os.makedirs(os.path.dirname(out_pickle), exist_ok=True)
    cv2.imwrite(out_vis, vis)
    
    with open(out_pickle, "wb") as f:
        pickle.dump(contours_dict, f)

    print(f"✅ Saved contours: {len(contours_dict['walls'])} walls, "
          f"{len(contours_dict['doors'])} doors, "
          f"{len(contours_dict['windows'])} windows, "
          f"{len(contours_dict['rooms'])} rooms")
    print(f"Visualization saved: {out_vis}")
    
    return contours_dict

if __name__ == "__main__":
    get_contours()