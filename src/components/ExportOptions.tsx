import React from 'react';
import { Download, FileText, Box } from 'lucide-react';
import { ProcessingResult } from '../types/FloorPlan';

interface ExportOptionsProps {
  data: ProcessingResult;
}

export const ExportOptions: React.FC<ExportOptionsProps> = ({ data }) => {
  const exportToJSON = () => {
    const jsonData = {
      metadata: {
        scale: data.scale,
        imageWidth: data.imageWidth,
        imageHeight: data.imageHeight,
        exportDate: new Date().toISOString()
      },
      elements: {
        walls: data.walls,
        doors: data.doors,
        windows: data.windows,
        rooms: data.rooms
      }
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floorplan-3d-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToOBJ = () => {
    // Simple OBJ export
    let objContent = '# Floor Plan 3D Model\n';
    let vertexIndex = 1;

    // Add walls as simple boxes
    data.walls.forEach((wall, wallIndex) => {
      if (wall.points.length >= 3) {
        const bounds = wall.points.reduce(
          (acc, p) => ({
            minX: Math.min(acc.minX, p.x * 0.01),
            maxX: Math.max(acc.maxX, p.x * 0.01),
            minY: Math.min(acc.minY, -p.y * 0.01),
            maxY: Math.max(acc.maxY, -p.y * 0.01)
          }),
          { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        );

        // Add vertices for a box
        const vertices = [
          [bounds.minX, 0, bounds.minY],
          [bounds.maxX, 0, bounds.minY],
          [bounds.maxX, 0, bounds.maxY],
          [bounds.minX, 0, bounds.maxY],
          [bounds.minX, 3, bounds.minY],
          [bounds.maxX, 3, bounds.minY],
          [bounds.maxX, 3, bounds.maxY],
          [bounds.minX, 3, bounds.maxY]
        ];

        vertices.forEach(v => {
          objContent += `v ${v[0]} ${v[1]} ${v[2]}\n`;
        });

        // Add faces
        const baseIndex = vertexIndex;
        objContent += `f ${baseIndex} ${baseIndex + 1} ${baseIndex + 2} ${baseIndex + 3}\n`; // Bottom
        objContent += `f ${baseIndex + 4} ${baseIndex + 7} ${baseIndex + 6} ${baseIndex + 5}\n`; // Top
        objContent += `f ${baseIndex} ${baseIndex + 4} ${baseIndex + 5} ${baseIndex + 1}\n`; // Front
        objContent += `f ${baseIndex + 2} ${baseIndex + 6} ${baseIndex + 7} ${baseIndex + 3}\n`; // Back
        objContent += `f ${baseIndex + 3} ${baseIndex + 7} ${baseIndex + 4} ${baseIndex}\n`; // Left
        objContent += `f ${baseIndex + 1} ${baseIndex + 5} ${baseIndex + 6} ${baseIndex + 2}\n`; // Right

        vertexIndex += 8;
      }
    });

    const blob = new Blob([objContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floorplan-3d-model.obj';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Export Options</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={exportToJSON}
          className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
        >
          <div className="p-2 bg-blue-100 rounded-lg">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">Export JSON</p>
            <p className="text-sm text-gray-600">Raw data and coordinates</p>
          </div>
          <Download className="w-4 h-4 text-gray-400 ml-auto" />
        </button>

        <button
          onClick={exportToOBJ}
          className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
        >
          <div className="p-2 bg-purple-100 rounded-lg">
            <Box className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">Export OBJ</p>
            <p className="text-sm text-gray-600">3D model file</p>
          </div>
          <Download className="w-4 h-4 text-gray-400 ml-auto" />
        </button>
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          <strong>Scale:</strong> {data.scale.toFixed(3)}x | 
          <strong> Resolution:</strong> {data.imageWidth}×{data.imageHeight}px
        </p>
      </div>
    </div>
  );
};