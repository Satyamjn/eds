import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { FloorPlan3DViewer } from './components/FloorPlan3DViewer';
import { ProcessingStats } from './components/ProcessingStats';
import { ExportOptions } from './components/ExportOptions';
import { ImageProcessor } from './utils/imageProcessor';
import { ProcessingResult } from './types/FloorPlan';
import { Building, Zap, Eye, Download } from 'lucide-react';

function App() {
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const handleFileSelect = async (file: File) => {
    setIsProcessing(true);
    setUploadedImage(URL.createObjectURL(file));
    
    try {
      const processor = new ImageProcessor();
      const result = await processor.processImage(file);
      setProcessingResult(result);
    } catch (error) {
      console.error('Processing failed:', error);
      alert('Failed to process the image. Please try a different floor plan.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Building className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">FloorPlan 3D</h1>
              <p className="text-gray-600">Convert 2D floor plans to interactive 3D models</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Features Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Zap className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-800">AI-Powered Detection</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Automatically detects walls, doors, windows, and rooms using advanced computer vision
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Eye className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-800">Interactive 3D View</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Explore your floor plan in 3D with realistic lighting and automatic furniture placement
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Download className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="font-semibold text-gray-800">Multiple Exports</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Export your 3D model as JSON data or OBJ files for use in other applications
            </p>
          </div>
        </div>

        {/* Upload Section */}
        {!processingResult && (
          <div className="mb-8">
            <FileUpload onFileSelect={handleFileSelect} isProcessing={isProcessing} />
          </div>
        )}

        {/* Original Image Preview */}
        {uploadedImage && (
          <div className="mb-8">
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Original Floor Plan</h3>
              <div className="flex justify-center">
                <img 
                  src={uploadedImage} 
                  alt="Original floor plan" 
                  className="max-w-full max-h-64 object-contain rounded-lg border"
                />
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {processingResult && (
          <div className="space-y-8">
            {/* Statistics */}
            <ProcessingStats data={processingResult} />

            {/* 3D Viewer */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">3D Model Preview</h3>
                <div className="text-sm text-gray-600">
                  Use mouse to rotate, zoom, and pan
                </div>
              </div>
              <FloorPlan3DViewer data={processingResult} />
            </div>

            {/* Export Options */}
            <ExportOptions data={processingResult} />

            {/* Reset Button */}
            <div className="text-center">
              <button
                onClick={() => {
                  setProcessingResult(null);
                  setUploadedImage(null);
                }}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200"
              >
                Process Another Floor Plan
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!processingResult && !isProcessing && (
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">How It Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Best Results Tips:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Use high-contrast black and white floor plans</li>
                  <li>• Ensure walls are clearly defined lines</li>
                  <li>• Remove text and annotations if possible</li>
                  <li>• Higher resolution images work better</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 mb-2">What Gets Detected:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <span className="font-medium">Walls:</span> Structural boundaries</li>
                  <li>• <span className="font-medium">Doors:</span> Openings and entrances</li>
                  <li>• <span className="font-medium">Windows:</span> Wall openings</li>
                  <li>• <span className="font-medium">Rooms:</span> Enclosed spaces with furniture</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-gray-600">
            <p>FloorPlan 3D - Transform your 2D floor plans into interactive 3D models</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;