import cv2
import numpy as np
import os
from skimage import morphology

def preprocess_image(image_path, out_edges_path="../output/edges.png"):
    if not os.path.exists(image_path):
        print(f"❌ Error: File not found at {image_path}")
        return None

    image = cv2.imread(image_path)
    if image is None:
        print("❌ Error: Failed to load image.")
        return None

    # Resize if very large
    max_dim = 1200
    h, w = image.shape[:2]
    scale = 1.0
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        image = cv2.resize(image, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_AREA)
        print(f"Resized image by scale={scale:.3f}")

    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Remove noise while preserving edges
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
    
    # Adaptive thresholding for better line detection
    thresh = cv2.adaptiveThreshold(denoised, 255,
                                  cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 11, 2)

    # Morphological operations to connect lines
    kernel = np.ones((3, 3), np.uint8)
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    # Skeletonize to get single pixel lines
    skeleton = morphology.skeletonize(closed > 0)
    skeleton = skeleton.astype(np.uint8) * 255
    
    # Find edges using Canny
    edges = cv2.Canny(skeleton, 50, 150)
    
    # Dilate to connect broken edges
    edges = cv2.dilate(edges, kernel, iterations=1)

    os.makedirs(os.path.dirname(out_edges_path), exist_ok=True)
    cv2.imwrite(out_edges_path, edges)
    print(f"✅ Processed edges saved to: {out_edges_path}")

    return edges, scale

if __name__ == "__main__":
    image_path = r"../images/floorplan2.jpg"

    preprocess_image(image_path)