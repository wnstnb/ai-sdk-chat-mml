'use client';

import React, { useEffect, useRef } from 'react';
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions'; // Adjust path as necessary

interface CustomAudioVisualizerProps {
  audioTimeDomainData: AudioTimeDomainData;
  barColor?: string;
  barWidth?: number;
  barGap?: number;
  sensitivity?: number;
}

const CustomAudioVisualizerComponent: React.FC<CustomAudioVisualizerProps> = ({
  audioTimeDomainData,
  barColor = '#FFFFFF', // Default white bars
  barWidth = 2, // Default bar width
  barGap = 1, // Default gap between bars
  sensitivity = 2.5, // Increased sensitivity
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // console.log('[CustomAudioVisualizer] Effect running. Data:', audioTimeDomainData); // Kept for debugging

    const context = canvas.getContext('2d');
    if (!context) return;

    // Ensure canvas internal size matches its display size for HiDPI/retina screens
    // And prevent blurring. Do this BEFORE getting width/height.
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = cssWidth * scale;
    canvas.height = cssHeight * scale;
    // Scale the context to ensure drawing operations match the CSS size
    context.scale(scale, scale); 

    // Now get logical dimensions (match CSS size)
    const width = cssWidth; 
    const height = cssHeight;

    // Clear the canvas on each render
    context.clearRect(0, 0, width, height);

    if (audioTimeDomainData && audioTimeDomainData.length > 0) { // Added audioTimeDomainData.length > 0 check
      // console.log('[CustomAudioVisualizer] Rendering data:', audioTimeDomainData); // Keep for debugging if needed

      context.fillStyle = barColor; // Use fillStyle for bars
      const bufferLength = audioTimeDomainData.length;
      const totalBarWidth = barWidth + barGap;
      const numberOfBars = Math.floor(width / totalBarWidth);
      
      // Prevent division by zero if numberOfBars is 0 (e.g., canvas too small)
      if (numberOfBars <= 0) return; 
      const step = Math.floor(bufferLength / numberOfBars);

      let x = 0;

      for (let i = 0; i < numberOfBars; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
            const dataIndex = i * step + j;
            if (dataIndex < bufferLength) { // Ensure we don't read past the buffer
                sum += audioTimeDomainData[dataIndex];
            }
        }
        
        const averageAmplitude = step > 0 ? sum / step : 0;

        // Normalize amplitude: map 0-255 to -1 to 1 (approx, 128 is center/zero)
        const normalizedAmplitude = (averageAmplitude / 255.0) * 2 - 1;
        
        // Calculate actual bar height based on sensitivity and canvas height
        // This height is the total visual height of the bar (deviation from center)
        const barActualHeight = Math.abs(normalizedAmplitude) * height * sensitivity;
        
        // Calculate y position for the top of the bar, making it centered around height/2
        const y = height / 2 - barActualHeight / 2;

        // Draw the bar
        context.fillRect(x, y, barWidth, Math.max(1, barActualHeight)); // Ensure minimum 1px height

        // Move to the next bar position
        x += totalBarWidth;
      }
    } else {
      // Optional: Draw a flat line when inactive/silent
      context.fillStyle = 'rgba(100, 100, 100, 0.5)'; // Dim gray line when inactive
      context.fillRect(0, height / 2 - 0.5, width, 1); 
    }

  }, [audioTimeDomainData, barColor, barWidth, barGap, sensitivity]); // Re-run effect when data or style props change

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }} 
      // Width/height attributes are now set dynamically in useEffect for HiDPI scaling
    />
  );
};

const CustomAudioVisualizer = React.memo(CustomAudioVisualizerComponent);

export default CustomAudioVisualizer; 