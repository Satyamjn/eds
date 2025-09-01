import { ProcessingResult, Contour, Point } from '../types/FloorPlan';

export class ImageProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  async processImage(file: File): Promise<ProcessingResult> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const result = this.analyzeFloorPlan(img);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  private analyzeFloorPlan(img: HTMLImageElement): ProcessingResult {
    // Set canvas size
    const maxDim = 800;
    const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
    this.canvas.width = img.width * scale;
    this.canvas.height = img.height * scale;

    // Draw and process image
    this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    
    // Convert to grayscale and detect edges
    const edges = this.detectEdges(imageData);
    
    // Find contours
    const contours = this.findContours(edges);
    
    // Classify contours
    const classified = this.classifyContours(contours, this.canvas.width, this.canvas.height);

    return {
      ...classified,
      scale,
      imageWidth: this.canvas.width,
      imageHeight: this.canvas.height
    };
  }

  private detectEdges(imageData: ImageData): ImageData {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const edges = new ImageData(width, height);

    // Convert to grayscale and apply edge detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Convert to grayscale
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Simple Sobel edge detection
        const gx = (
          -1 * this.getGray(data, x - 1, y - 1, width) +
          1 * this.getGray(data, x + 1, y - 1, width) +
          -2 * this.getGray(data, x - 1, y, width) +
          2 * this.getGray(data, x + 1, y, width) +
          -1 * this.getGray(data, x - 1, y + 1, width) +
          1 * this.getGray(data, x + 1, y + 1, width)
        );
        
        const gy = (
          -1 * this.getGray(data, x - 1, y - 1, width) +
          -2 * this.getGray(data, x, y - 1, width) +
          -1 * this.getGray(data, x + 1, y - 1, width) +
          1 * this.getGray(data, x - 1, y + 1, width) +
          2 * this.getGray(data, x, y + 1, width) +
          1 * this.getGray(data, x + 1, y + 1, width)
        );
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const edgeValue = magnitude > 50 ? 255 : 0;
        
        edges.data[idx] = edgeValue;
        edges.data[idx + 1] = edgeValue;
        edges.data[idx + 2] = edgeValue;
        edges.data[idx + 3] = 255;
      }
    }

    return edges;
  }

  private getGray(data: Uint8ClampedArray, x: number, y: number, width: number): number {
    const idx = (y * width + x) * 4;
    return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
  }

  private findContours(edges: ImageData): Point[][] {
    // Simple contour detection - in a real implementation, you'd use more sophisticated algorithms
    const contours: Point[][] = [];
    const visited = new Set<string>();
    const width = edges.width;
    const height = edges.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        const idx = (y * width + x) * 4;
        if (edges.data[idx] > 128) { // Edge pixel
          const contour = this.traceContour(edges, x, y, visited);
          if (contour.length > 10) { // Minimum contour size
            contours.push(contour);
          }
        }
      }
    }

    return contours;
  }

  private traceContour(edges: ImageData, startX: number, startY: number, visited: Set<string>): Point[] {
    const contour: Point[] = [];
    const stack: Point[] = [{ x: startX, y: startY }];
    const width = edges.width;
    const height = edges.height;

    while (stack.length > 0 && contour.length < 1000) {
      const point = stack.pop()!;
      const key = `${point.x},${point.y}`;
      
      if (visited.has(key)) continue;
      visited.add(key);

      const idx = (point.y * width + point.x) * 4;
      if (edges.data[idx] > 128) {
        contour.push(point);

        // Check 8-connected neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = point.x + dx;
            const ny = point.y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nkey = `${nx},${ny}`;
              if (!visited.has(nkey)) {
                stack.push({ x: nx, y: ny });
              }
            }
          }
        }
      }
    }

    return contour;
  }

  private classifyContours(contours: Point[][], width: number, height: number): {
    walls: Contour[];
    doors: Contour[];
    windows: Contour[];
    rooms: Contour[];
  } {
    const walls: Contour[] = [];
    const doors: Contour[] = [];
    const windows: Contour[] = [];
    const rooms: Contour[] = [];

    for (const points of contours) {
      const area = this.calculateArea(points);
      const bounds = this.getBounds(points);
      const aspect = bounds.width / (bounds.height + 1e-9);
      
      // Classify based on area, aspect ratio, and position
      if (area > 5000) {
        // Large areas are likely walls or rooms
        const touchesBoundary = (
          bounds.minX <= 5 || bounds.minY <= 5 ||
          bounds.maxX >= width - 5 || bounds.maxY >= height - 5
        );
        
        if (touchesBoundary || aspect > 3 || aspect < 0.33) {
          walls.push({ points, area, type: 'wall' });
        } else {
          rooms.push({ points, area, type: 'room' });
        }
      } else if (area > 1000 && area <= 5000) {
        // Medium areas could be doors
        if (aspect > 0.4 && aspect < 2.5) {
          doors.push({ points, area, type: 'door' });
        } else {
          walls.push({ points, area, type: 'wall' });
        }
      } else if (area > 200 && area <= 1000) {
        // Small areas could be windows
        if (aspect > 2 || aspect < 0.5) {
          windows.push({ points, area, type: 'window' });
        }
      }
    }

    return { walls, doors, windows, rooms };
  }

  private calculateArea(points: Point[]): number {
    if (points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  private getBounds(points: Point[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  } {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}