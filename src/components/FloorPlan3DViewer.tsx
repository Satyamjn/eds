import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { ProcessingResult } from '../types/FloorPlan';

interface FloorPlan3DViewerProps {
  data: ProcessingResult;
}

const SCALE_PX_TO_M = 0.01;
const WALL_HEIGHT = 3.0;
const DOOR_HEIGHT = 2.1;
const WINDOW_HEIGHT = 1.2;
const WINDOW_BASE = 1.0;

// Furniture component
const Furniture: React.FC<{ position: [number, number, number]; type: string; color: string }> = ({ 
  position, 
  type, 
  color 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });

  const size = useMemo(() => {
    switch (type) {
      case 'sofa': return [2.0, 0.9, 0.8];
      case 'table': return [1.2, 0.6, 0.75];
      case 'chair': return [0.5, 0.5, 0.9];
      case 'bed': return [2.0, 1.5, 0.5];
      case 'cabinet': return [1.0, 0.5, 2.0];
      default: return [1.0, 1.0, 1.0];
    }
  }, [type]);

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
};

// Wall component
const Wall: React.FC<{ points: Array<{x: number, y: number}> }> = ({ points }) => {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;

    // Create shape from points
    const shape = new THREE.Shape();
    const scaledPoints = points.map(p => ({
      x: p.x * SCALE_PX_TO_M,
      y: -p.y * SCALE_PX_TO_M // Flip Y axis
    }));

    shape.moveTo(scaledPoints[0].x, scaledPoints[0].y);
    for (let i = 1; i < scaledPoints.length; i++) {
      shape.lineTo(scaledPoints[i].x, scaledPoints[i].y);
    }
    shape.closePath();

    // Extrude the shape
    const extrudeSettings = {
      depth: WALL_HEIGHT,
      bevelEnabled: false
    };

    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [points]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color="#e0e0e0" />
    </mesh>
  );
};

// Floor component
const Floor: React.FC<{ points: Array<{x: number, y: number}> }> = ({ points }) => {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;

    const shape = new THREE.Shape();
    const scaledPoints = points.map(p => ({
      x: p.x * SCALE_PX_TO_M,
      y: -p.y * SCALE_PX_TO_M
    }));

    shape.moveTo(scaledPoints[0].x, scaledPoints[0].y);
    for (let i = 1; i < scaledPoints.length; i++) {
      shape.lineTo(scaledPoints[i].x, scaledPoints[i].y);
    }
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }, [points]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <meshStandardMaterial color="#d4a574" />
    </mesh>
  );
};

// Door component
const Door: React.FC<{ points: Array<{x: number, y: number}> }> = ({ points }) => {
  const bounds = useMemo(() => {
    const xs = points.map(p => p.x * SCALE_PX_TO_M);
    const ys = points.map(p => -p.y * SCALE_PX_TO_M);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  }, [points]);

  return (
    <mesh position={[bounds.x + bounds.width/2, DOOR_HEIGHT/2, bounds.y + bounds.height/2]}>
      <boxGeometry args={[bounds.width, DOOR_HEIGHT, bounds.height]} />
      <meshStandardMaterial color="#8b4513" />
    </mesh>
  );
};

// Window component
const Window: React.FC<{ points: Array<{x: number, y: number}> }> = ({ points }) => {
  const bounds = useMemo(() => {
    const xs = points.map(p => p.x * SCALE_PX_TO_M);
    const ys = points.map(p => -p.y * SCALE_PX_TO_M);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  }, [points]);

  return (
    <mesh position={[bounds.x + bounds.width/2, WINDOW_BASE + WINDOW_HEIGHT/2, bounds.y + bounds.height/2]}>
      <boxGeometry args={[bounds.width, WINDOW_HEIGHT, bounds.height]} />
      <meshStandardMaterial color="#64b5f6" transparent opacity={0.7} />
    </mesh>
  );
};

// Scene component
const Scene: React.FC<{ data: ProcessingResult }> = ({ data }) => {
  // Generate furniture for rooms
  const furniture = useMemo(() => {
    const items: Array<{ position: [number, number, number]; type: string; color: string }> = [];
    
    data.rooms.forEach((room, roomIndex) => {
      const bounds = room.points.reduce(
        (acc, p) => ({
          minX: Math.min(acc.minX, p.x * SCALE_PX_TO_M),
          maxX: Math.max(acc.maxX, p.x * SCALE_PX_TO_M),
          minY: Math.min(acc.minY, -p.y * SCALE_PX_TO_M),
          maxY: Math.max(acc.maxY, -p.y * SCALE_PX_TO_M)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );

      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const roomWidth = bounds.maxX - bounds.minX;
      const roomHeight = bounds.maxY - bounds.minY;

      // Add furniture based on room size and index
      if (roomWidth > 3 && roomHeight > 3) {
        const roomTypes = ['living', 'bedroom', 'office'];
        const roomType = roomTypes[roomIndex % roomTypes.length];

        switch (roomType) {
          case 'living':
            items.push({ position: [centerX - 1, 0.4, centerY], type: 'sofa', color: '#a0785a' });
            items.push({ position: [centerX, 0.375, centerY + 1], type: 'table', color: '#8b4513' });
            break;
          case 'bedroom':
            items.push({ position: [centerX, 0.25, centerY - 1], type: 'bed', color: '#deb887' });
            items.push({ position: [bounds.maxX - 0.5, 1.0, centerY], type: 'cabinet', color: '#a0522d' });
            break;
          case 'office':
            items.push({ position: [centerX - 1, 0.375, centerY], type: 'table', color: '#cd853f' });
            items.push({ position: [centerX - 0.5, 0.45, centerY], type: 'chair', color: '#d2b48c' });
            break;
        }
      }
    });

    return items;
  }, [data.rooms]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
      <pointLight position={[0, 10, 0]} intensity={0.3} />

      {/* Walls */}
      {data.walls.map((wall, index) => (
        <Wall key={`wall-${index}`} points={wall.points} />
      ))}

      {/* Floors */}
      {data.rooms.map((room, index) => (
        <Floor key={`floor-${index}`} points={room.points} />
      ))}

      {/* Doors */}
      {data.doors.map((door, index) => (
        <Door key={`door-${index}`} points={door.points} />
      ))}

      {/* Windows */}
      {data.windows.map((window, index) => (
        <Window key={`window-${index}`} points={window.points} />
      ))}

      {/* Furniture */}
      {furniture.map((item, index) => (
        <Furniture 
          key={`furniture-${index}`} 
          position={item.position} 
          type={item.type}
          color={item.color}
        />
      ))}

      <Environment preset="apartment" />
    </>
  );
};

export const FloorPlan3DViewer: React.FC<FloorPlan3DViewerProps> = ({ data }) => {
  return (
    <div className="w-full h-96 bg-gray-100 rounded-xl overflow-hidden shadow-lg">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[10, 15, 10]} />
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          maxPolarAngle={Math.PI / 2}
        />
        <Scene data={data} />
      </Canvas>
    </div>
  );
};