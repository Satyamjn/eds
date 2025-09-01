import React, { useCallback } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isProcessing }) => {
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    if (imageFile) {
      onFileSelect(imageFile);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={`
          border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300
          ${isProcessing 
            ? 'border-blue-300 bg-blue-50' 
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }
        `}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center space-y-4">
          <div className={`
            p-4 rounded-full transition-colors duration-300
            ${isProcessing ? 'bg-blue-100' : 'bg-gray-100'}
          `}>
            {isProcessing ? (
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            ) : (
              <Upload className="w-8 h-8 text-gray-600" />
            )}
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              {isProcessing ? 'Processing Floor Plan...' : 'Upload Floor Plan Image'}
            </h3>
            <p className="text-gray-600 mb-4">
              {isProcessing 
                ? 'Converting your 2D floor plan to 3D model'
                : 'Drag and drop your floor plan image here, or click to browse'
              }
            </p>
          </div>

          {!isProcessing && (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />
              <div className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200">
                <ImageIcon className="w-5 h-5" />
                <span>Choose File</span>
              </div>
            </label>
          )}
        </div>

        {!isProcessing && (
          <div className="mt-6 text-sm text-gray-500">
            <p>Supported formats: JPG, PNG, GIF, BMP</p>
            <p>Best results with high-contrast black and white floor plans</p>
          </div>
        )}
      </div>
    </div>
  );
};