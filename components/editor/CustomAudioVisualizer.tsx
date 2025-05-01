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

const CustomAudioVisualizer: React.FC<CustomAudioVisualizerProps> = ({
  audioTimeDomainData,
  barColor = '#FFFFFF', // Default white bars
  barWidth = 2, // Default bar width
  barGap = 1, // Default gap between bars
  sensitivity = 1.5,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    console.log('[CustomAudioVisualizer] Effect running. Data:', audioTimeDomainData);

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

    if (audioTimeDomainData) {
      // console.log('[CustomAudioVisualizer] Rendering data:', audioTimeDomainData); // Keep for debugging if needed

      context.fillStyle = barColor;
      const bufferLength = audioTimeDomainData.length;
      const totalBarWidth = barWidth + barGap;
      const numberOfBars = Math.floor(width / totalBarWidth);
      const step = Math.floor(bufferLength / numberOfBars);

      let x = 0;

      for (let i = 0; i < numberOfBars; i++) {
        // Get average amplitude for the segment to reduce noise/flicker
        let sum = 0;
        for (let j = 0; j < step; j++) {
            sum += audioTimeDomainData[i * step + j];
        }
        const averageAmplitude = sum / step;

        // Calculate bar height (0-255 range, 128 is silent center)
        // Normalize amplitude: map 0-255 to -1 to 1 (approx)
        const normalizedAmplitude = (averageAmplitude / 255.0) * 2 - 1;
        
        // Scale bar height to canvas height (adjust multiplier for sensitivity)
        // Make height proportional to the absolute deviation from the center (128)
        const barHeight = Math.abs(normalizedAmplitude) * height * sensitivity;
        
        // Calculate y position (center line)
        const y = height / 2 - barHeight / 2; // Draw centered bar

        // Draw the bar
        context.fillRect(x, y, barWidth, Math.max(1, barHeight)); // Ensure minimum 1px height

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

export default CustomAudioVisualizer; 