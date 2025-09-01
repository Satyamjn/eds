export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  points: Point[];
  area: number;
  type: 'wall' | 'door' | 'window' | 'room';
}

export interface ProcessingResult {
  walls: Contour[];
  doors: Contour[];
  windows: Contour[];
  rooms: Contour[];
  scale: number;
  imageWidth: number;
  imageHeight: number;
}

export interface Mesh3D {
  vertices: number[];
  faces: number[];
  type: string;
  color: [number, number, number];
}

export interface FloorPlan3D {
  meshes: Mesh3D[];
  furniture: FurnitureItem[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface FurnitureItem {
  type: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
}