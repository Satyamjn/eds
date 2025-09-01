import React from 'react';
import { Home, DoorOpen, RectangleHorizontal, Square } from 'lucide-react';
import { ProcessingResult } from '../types/FloorPlan';

interface ProcessingStatsProps {
  data: ProcessingResult;
}

export const ProcessingStats: React.FC<ProcessingStatsProps> = ({ data }) => {
  const stats = [
    {
      icon: Square,
      label: 'Walls',
      count: data.walls.length,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100'
    },
    {
      icon: DoorOpen,
      label: 'Doors',
      count: data.doors.length,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100'
    },
    {
      icon: RectangleHorizontal,
      label: 'Windows',
      count: data.windows.length,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      icon: Home,
      label: 'Rooms',
      count: data.rooms.length,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div key={index} className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{stat.count}</p>
                <p className="text-sm text-gray-600">{stat.label}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};