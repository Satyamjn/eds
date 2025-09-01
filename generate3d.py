import cv2
import numpy as np
import os
import pickle
from shapely.geometry import Polygon, MultiPolygon, LineString
from shapely.ops import unary_union, polygonize
import trimesh
import json
import random
from sklearn.cluster import DBSCAN

# Parameters
SCALE_PX_TO_M = 0.05
WALL_HEIGHT = 3.0
DOOR_HEIGHT = 2.1
WINDOW_HEIGHT = 1.2
WINDOW_BASE = 1.0
FLOOR_THICKNESS = 0.1
CEILING_THICKNESS = 0.1
WALL_THICKNESS = 0.15  # Added wall thickness parameter

INPUT_PK = "../output/contours.pkl"
OUT_DIR = "../output"
FURNITURE_DIR = "../furniture"  # Directory for furniture models

# Furniture definitions with approximate dimensions in meters
FURNITURE_TYPES = {
    "sofa": {"size": (2.0, 0.9, 0.8), "color": [160, 120, 80, 255]},
    "table": {"size": (1.2, 0.6, 0.75), "color": [139, 69, 19, 255]},
    "chair": {"size": (0.5, 0.5, 0.9), "color": [210, 180, 140, 255]},
    "bed": {"size": (2.0, 1.5, 0.5), "color": [255, 228, 196, 255]},
    "cabinet": {"size": (1.0, 0.5, 2.0), "color": [160, 82, 45, 255]},
    "desk": {"size": (1.5, 0.7, 0.75), "color": [205, 133, 63, 255]},
    "bookshelf": {"size": (0.8, 0.3, 2.0), "color": [160, 120, 80, 255]},
    "tv_stand": {"size": (1.8, 0.4, 0.5), "color": [139, 69, 19, 255]},
}

def detect_walls_from_lines(edges):
    """
    Improved wall detection using line detection and clustering
    """
    # Detect lines using Hough Transform
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=50, minLineLength=50, maxLineGap=20)
    
    if lines is None:
        return []
    
    # Convert lines to Shapely LineStrings
    line_strings = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        line_strings.append(LineString([(x1, y1), (x2, y2)]))
    
    # Cluster lines by angle and proximity
    angles = []
    centers = []
    for line in line_strings:
        # Calculate angle
        dx = line.coords[1][0] - line.coords[0][0]
        dy = line.coords[1][1] - line.coords[0][1]
        angle = np.arctan2(dy, dx) % np.pi  # Normalize to 0-pi
        angles.append(angle)
        
        # Calculate center
        center_x = (line.coords[0][0] + line.coords[1][0]) / 2
        center_y = (line.coords[0][1] + line.coords[1][1]) / 2
        centers.append([center_x, center_y])
    
    # Cluster lines
    X = np.column_stack([angles, centers])
    clustering = DBSCAN(eps=0.2, min_samples=2).fit(X)
    
    # Group lines by cluster
    clusters = {}
    for i, label in enumerate(clustering.labels_):
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(line_strings[i])
    
    # Merge lines in each cluster and create wall polygons
    wall_polygons = []
    for label, lines in clusters.items():
        if label == -1:  # Skip noise
            continue
            
        # Merge lines
        merged_line = unary_union(lines)
        
        # Buffer to create thickness
        if merged_line.geom_type == 'LineString':
            wall_poly = merged_line.buffer(WALL_THICKNESS / SCALE_PX_TO_M, cap_style=2)
            wall_polygons.append(wall_poly)
        elif merged_line.geom_type == 'MultiLineString':
            for line in merged_line.geoms:
                wall_poly = line.buffer(WALL_THICKNESS / SCALE_PX_TO_M, cap_style=2)
                wall_polygons.append(wall_poly)
    
    return wall_polygons

def classify_contour(cnt, img_shape):
    """
    Improved contour classification with better heuristics
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

def detect_rooms(wall_polygons, edges):
    """
    Detect rooms by finding enclosed spaces between walls
    """
    # Create a polygon of the entire space
    bounds = unary_union(wall_polygons).bounds
    min_x, min_y, max_x, max_y = bounds
    entire_space = Polygon([(min_x, min_y), (max_x, min_y), (max_x, max_y), (min_x, max_y)])
    
    # Subtract walls from the entire space
    free_space = entire_space.difference(unary_union(wall_polygons))
    
    # Find connected components (rooms)
    if free_space.geom_type == 'Polygon':
        rooms = [free_space]
    else:
        rooms = list(free_space.geoms)
    
    # Filter by size and shape
    valid_rooms = []
    for room in rooms:
        area = room.area * (SCALE_PX_TO_M ** 2)  # Convert to square meters
        if area > 4:  # Minimum room area of 4 square meters
            valid_rooms.append(room)
    
    return valid_rooms

def create_wall_mesh_from_polygon(polygon, height):
    """Create a wall mesh from a polygon using trimesh"""
    try:
        # Extract exterior coordinates
        if hasattr(polygon, 'exterior'):
            points = list(polygon.exterior.coords)
        else:
            points = polygon
            
        # Create 2D polygon
        polygon_2d = Polygon(points)
        if not polygon_2d.is_valid:
            polygon_2d = polygon_2d.buffer(0)  # Try to fix invalid polygon
            
        # Extrude using trimesh
        mesh = trimesh.creation.extrude_polygon(polygon_2d, height=height)
        return mesh
        
    except Exception as e:
        print(f"Error creating wall mesh: {e}")
        return None

def create_wall_mesh_from_line(line, height, thickness):
    """Create a wall mesh from a line with thickness"""
    try:
        # Create a buffer around the line to get thickness
        buffered = line.buffer(thickness / 2, cap_style=2)
        
        # Extract polygon coordinates
        if hasattr(buffered, 'exterior'):
            points = list(buffered.exterior.coords)
        else:
            points = buffered
            
        # Create 2D polygon
        polygon_2d = Polygon(points)
        if not polygon_2d.is_valid:
            polygon_2d = polygon_2d.buffer(0)
            
        # Extrude using trimesh
        mesh = trimesh.creation.extrude_polygon(polygon_2d, height=height)
        return mesh
        
    except Exception as e:
        print(f"Error creating wall mesh from line: {e}")
        return None

def create_floor_mesh(polygon, thickness=0.1, height=0):
    """Create a floor mesh"""
    try:
        if hasattr(polygon, 'exterior'):
            points = list(polygon.exterior.coords)
        else:
            points = polygon
            
        # Create 2D polygon
        polygon_2d = Polygon(points)
        if not polygon_2d.is_valid:
            polygon_2d = polygon_2d.buffer(0)
            
        # Extrude to create a thin floor
        mesh = trimesh.creation.extrude_polygon(polygon_2d, height=thickness)
        mesh.apply_translation([0, 0, height])
        return mesh
        
    except Exception as e:
        print(f"Error creating floor mesh: {e}")
        return None

def create_door_mesh(points, height):
    """Create a door mesh from bounding box"""
    try:
        if len(points) < 3:
            return None
            
        # Get bounding box
        points_array = np.array(points)
        min_x, min_y = np.min(points_array, axis=0)
        max_x, max_y = np.max(points_array, axis=0)
        
        width = max_x - min_x
        depth = max_y - min_y
        
        # Create box mesh
        mesh = trimesh.creation.box([width, depth, height])
        
        # Position the mesh
        mesh.apply_translation([min_x + width/2, min_y + depth/2, height/2])
        
        return mesh
        
    except Exception as e:
        print(f"Error creating door mesh: {e}")
        return None

def create_window_mesh(points, height, base_height):
    """Create a window mesh from bounding box"""
    try:
        if len(points) < 3:
            return None
            
        # Get bounding box
        points_array = np.array(points)
        min_x, min_y = np.min(points_array, axis=0)
        max_x, max_y = np.max(points_array, axis=0)
        
        width = max_x - min_x
        depth = max_y - min_y
        
        # Create box mesh
        mesh = trimesh.creation.box([width, depth, height])
        
        # Position the mesh
        mesh.apply_translation([min_x + width/2, min_y + depth/2, base_height + height/2])
        
        return mesh
        
    except Exception as e:
        print(f"Error creating window mesh: {e}")
        return None

def create_furniture_mesh(furniture_type, position, rotation=0):
    """Create simple furniture mesh"""
    try:
        if furniture_type not in FURNITURE_TYPES:
            return None
            
        size = FURNITURE_TYPES[furniture_type]["size"]
        color = FURNITURE_TYPES[furniture_type]["color"]
        
        # Create box mesh
        mesh = trimesh.creation.box(size)
        
        # Apply color
        mesh.visual.face_colors = color
        
        # Position and rotate
        mesh.apply_translation([position[0], position[1], size[2]/2])
        mesh.apply_transform(trimesh.transformations.rotation_matrix(rotation, [0, 0, 1]))
        
        return mesh
        
    except Exception as e:
        print(f"Error creating {furniture_type} mesh: {e}")
        return None

def auto_furnish_room(room_polygon, room_type="living"):
    """Automatically add furniture to a room based on its type"""
    furniture_meshes = []
    
    if not hasattr(room_polygon, 'bounds'):
        return furniture_meshes
        
    min_x, min_y, max_x, max_y = room_polygon.bounds
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    width = max_x - min_x
    height = max_y - min_y
    
    if room_type == "living":
        # Add sofa against a wall
        sofa_x = min_x + 0.5
        sofa_y = min_y + 0.5
        sofa = create_furniture_mesh("sofa", [sofa_x, sofa_y], np.pi/2)
        if sofa:
            furniture_meshes.append(sofa)
        
        # Add table in center
        table = create_furniture_mesh("table", [center_x, center_y])
        if table:
            furniture_meshes.append(table)
        
        # Add TV stand against opposite wall
        tv_x = max_x - 0.5
        tv_y = center_y
        tv_stand = create_furniture_mesh("tv_stand", [tv_x, tv_y], np.pi)
        if tv_stand:
            furniture_meshes.append(tv_stand)
            
    elif room_type == "bedroom":
        # Add bed against a wall
        bed_x = min_x + 1.0
        bed_y = center_y
        bed = create_furniture_mesh("bed", [bed_x, bed_y], np.pi/2)
        if bed:
            furniture_meshes.append(bed)
        
        # Add cabinet
        cabinet_x = max_x - 0.5
        cabinet_y = min_y + 0.5
        cabinet = create_furniture_mesh("cabinet", [cabinet_x, cabinet_y])
        if cabinet:
            furniture_meshes.append(cabinet)
            
    elif room_type == "office":
        # Add desk against a wall
        desk_x = min_x + 0.5
        desk_y = center_y
        desk = create_furniture_mesh("desk", [desk_x, desk_y], np.pi/2)
        if desk:
            furniture_meshes.append(desk)
        
        # Add chair
        chair_x = min_x + 1.2
        chair_y = center_y
        chair = create_furniture_mesh("chair", [chair_x, chair_y])
        if chair:
            furniture_meshes.append(chair)
        
        # Add bookshelf
        bookshelf_x = max_x - 0.3
        bookshelf_y = center_y
        bookshelf = create_furniture_mesh("bookshelf", [bookshelf_x, bookshelf_y], np.pi)
        if bookshelf:
            furniture_meshes.append(bookshelf)
    
    return furniture_meshes

def main():
    if not os.path.exists(INPUT_PK):
        print("❌ contours.pkl not found. Run contours.py first.")
        return

    with open(INPUT_PK, "rb") as f:
        contours = pickle.load(f)

    print(f"Loaded contours: {len(contours.get('walls', []))} walls, "
          f"{len(contours.get('doors', []))} doors, "
          f"{len(contours.get('windows', []))} windows, "
          f"{len(contours.get('rooms', []))} rooms")

    # Load edges image for line-based wall detection
    edges_path = "../output/edges.png"
    if os.path.exists(edges_path):
        edges = cv2.imread(edges_path, cv2.IMREAD_GRAYSCALE)
        wall_polygons = detect_walls_from_lines(edges)
        print(f"Detected {len(wall_polygons)} walls from lines")
    else:
        wall_polygons = []
        print("Edges image not found, using contour-based walls only")

    # Process walls from contours
    wall_meshes = []
    for i, wall in enumerate(contours.get("walls", [])):
        try:
            # Convert points to meters
            points = [(p[0][0] * SCALE_PX_TO_M, p[0][1] * SCALE_PX_TO_M) for p in wall]
            
            if len(points) >= 3:
                mesh = create_wall_mesh_from_polygon(points, WALL_HEIGHT)
                if mesh:
                    # Set wall color (light gray)
                    mesh.visual.face_colors = [200, 200, 200, 255]
                    wall_meshes.append(mesh)
                    print(f"Created wall mesh {i+1}")
                else:
                    print(f"Failed to create wall mesh {i+1}")
        except Exception as e:
            print(f"Error processing wall {i+1}: {e}")

    # Process walls from line detection
    for i, wall_poly in enumerate(wall_polygons):
        try:
            # Convert polygon points to meters
            points = [(p[0] * SCALE_PX_TO_M, p[1] * SCALE_PX_TO_M) for p in wall_poly.exterior.coords]
            
            if len(points) >= 3:
                mesh = create_wall_mesh_from_polygon(points, WALL_HEIGHT)
                if mesh:
                    # Set wall color (light gray)
                    mesh.visual.face_colors = [200, 200, 200, 255]
                    wall_meshes.append(mesh)
                    print(f"Created wall mesh from line {i+1}")
        except Exception as e:
            print(f"Error processing wall from line {i+1}: {e}")

    # Process doors
    door_meshes = []
    for i, door in enumerate(contours.get("doors", [])):
        try:
            # Convert points to meters
            points = [(p[0][0] * SCALE_PX_TO_M, p[0][1] * SCALE_PX_TO_M) for p in door]
            
            if len(points) >= 3:
                mesh = create_door_mesh(points, DOOR_HEIGHT)
                if mesh:
                    # Set door color (brown)
                    mesh.visual.face_colors = [139, 69, 19, 255]
                    door_meshes.append(mesh)
                    print(f"Created door mesh {i+1}")
                else:
                    print(f"Failed to create door mesh {i+1}")
        except Exception as e:
            print(f"Error processing door {i+1}: {e}")

    # Process windows
    window_meshes = []
    for i, window in enumerate(contours.get("windows", [])):
        try:
            # Convert points to meters
            points = [(p[0][0] * SCALE_PX_TO_M, p[0][1] * SCALE_PX_TO_M) for p in window]
            
            if len(points) >= 3:
                mesh = create_window_mesh(points, WINDOW_HEIGHT, WINDOW_BASE)
                if mesh:
                    # Set window color (semi-transparent blue)
                    mesh.visual.face_colors = [100, 180, 255, 100]
                    window_meshes.append(mesh)
                    print(f"Created window mesh {i+1}")
                else:
                    print(f"Failed to create window mesh {i+1}")
        except Exception as e:
            print(f"Error processing window {i+1}: {e}")

    # Detect rooms based on walls
    detected_rooms = detect_rooms(wall_polygons, edges) if wall_polygons else []
    
    # Process rooms (floors)
    floor_meshes = []
    furniture_meshes = []
    room_types = ["living", "bedroom", "office", "bedroom", "living", "office"]  # Room types
    
    # Process rooms from contour detection
    for i, room in enumerate(contours.get("rooms", [])):
        try:
            # Convert points to meters
            points = [(p[0][0] * SCALE_PX_TO_M, p[0][1] * SCALE_PX_TO_M) for p in room]
            
            if len(points) >= 3:
                # Create floor
                floor_mesh = create_floor_mesh(points, FLOOR_THICKNESS, 0)
                if floor_mesh:
                    # Set floor color (wood-like)
                    floor_mesh.visual.face_colors = [210, 180, 140, 255]
                    floor_meshes.append(floor_mesh)
                    
                    # Create ceiling
                    ceiling_mesh = create_floor_mesh(points, CEILING_THICKNESS, WALL_HEIGHT)
                    if ceiling_mesh:
                        ceiling_mesh.visual.face_colors = [240, 240, 240, 255]
                        floor_meshes.append(ceiling_mesh)
                    
                    # Add furniture to room
                    room_poly = Polygon(points)
                    room_type = room_types[i % len(room_types)]
                    room_furniture = auto_furnish_room(room_poly, room_type)
                    furniture_meshes.extend(room_furniture)
                    
                    print(f"Created floor and furniture for room {i+1} ({room_type})")
                else:
                    print(f"Failed to create floor mesh for room {i+1}")
        except Exception as e:
            print(f"Error processing room {i+1}: {e}")
    
    # Process rooms from wall detection
    for i, room in enumerate(detected_rooms):
        try:
            # Convert points to meters (already in meters but need to scale)
            points = [(p[0] * SCALE_PX_TO_M, p[1] * SCALE_PX_TO_M) for p in room.exterior.coords]
            
            if len(points) >= 3:
                # Create floor
                floor_mesh = create_floor_mesh(points, FLOOR_THICKNESS, 0)
                if floor_mesh:
                    # Set floor color (wood-like)
                    floor_mesh.visual.face_colors = [210, 180, 140, 255]
                    floor_meshes.append(floor_mesh)
                    
                    # Create ceiling
                    ceiling_mesh = create_floor_mesh(points, CEILING_THICKNESS, WALL_HEIGHT)
                    if ceiling_mesh:
                        ceiling_mesh.visual.face_colors = [240, 240, 240, 255]
                        floor_meshes.append(ceiling_mesh)
                    
                    # Add furniture to room
                    room_type = room_types[i % len(room_types)]
                    room_furniture = auto_furnish_room(room, room_type)
                    furniture_meshes.extend(room_furniture)
                    
                    print(f"Created floor and furniture for detected room {i+1} ({room_type})")
        except Exception as e:
            print(f"Error processing detected room {i+1}: {e}")

    # Combine all meshes
    all_meshes = wall_meshes + door_meshes + window_meshes + floor_meshes + furniture_meshes
    if not all_meshes:
        print("❌ No meshes were created successfully.")
        return

    try:
        scene = trimesh.util.concatenate(all_meshes)

        # Export
        os.makedirs(OUT_DIR, exist_ok=True)
        
        obj_path = os.path.join(OUT_DIR, "furnished_home.obj")
        glb_path = os.path.join(OUT_DIR, "furnished_home.glb")
        gltf_path = os.path.join(OUT_DIR, "furnished_home.gltf")
        
        # Export to multiple formats
        scene.export(obj_path)
        scene.export(glb_path)
        scene.export(gltf_path)

        print("✅ Fully furnished 3D model successfully created!")
        print(f"   - Walls: {len(wall_meshes)}")
        print(f"   - Doors: {len(door_meshes)}")
        print(f"   - Windows: {len(window_meshes)}")
        print(f"   - Rooms: {len(contours.get('rooms', [])) + len(detected_rooms)}")
        print(f"   - Furniture items: {len(furniture_meshes)}")
        print(f"   - OBJ file: {obj_path}")
        print(f"   - GLB file: {glb_path}")
        print(f"   - GLTF file: {gltf_path}")
        
        # Generate a simple manifest file for the web viewer
        manifest = {
            "model": "furnished_home.glb",
            "format": "glb",
            "version": "1.0",
            "created": "2023-01-01",
            "rooms": len(contours.get('rooms', [])) + len(detected_rooms),
            "furniture": len(furniture_meshes)
        }
        
        with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
            json.dump(manifest, f, indent=2)
        
    except Exception as e:
        print(f"Error combining or exporting meshes: {e}")
        # Try to export individual meshes as fallback
        try:
            for i, mesh in enumerate(all_meshes):
                mesh.export(os.path.join(OUT_DIR, f"mesh_{i}.obj"))
            print("Exported individual meshes as fallback")
        except:
            print("Failed to export even individual meshes")

if __name__ == "__main__":
    main()