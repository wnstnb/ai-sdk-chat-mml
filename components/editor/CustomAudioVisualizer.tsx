'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions'; // Adjust path as necessary

interface CustomAudioVisualizerProps {
  audioTimeDomainData: AudioTimeDomainData;
  barColor?: string;
  barWidth?: number;
  barGap?: number;
  sensitivity?: number;
  // NEW: Silence detection props
  onSilenceDetected?: () => void; // Callback when silence threshold is reached
  silenceThreshold?: number; // Duration in seconds (default: 1.5)
  volumeThreshold?: number; // Volume level threshold (0-1, default: 0.01)
  enableSilenceDetection?: boolean; // Enable/disable silence detection
}

const CustomAudioVisualizerComponent: React.FC<CustomAudioVisualizerProps> = ({
  audioTimeDomainData,
  barColor, // Keep for backward compatibility but use as override
  barWidth = 5, // Slightly wider bars for better visibility
  barGap = 2, // Default gap between bars
  sensitivity = 5, // Increased sensitivity
  // NEW: Silence detection props with defaults
  onSilenceDetected,
  silenceThreshold = 1.5, // 1.5 seconds
  volumeThreshold = 0.01, // Very low volume threshold
  enableSilenceDetection = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const lastVolumeRef = useRef<number>(0);
  const volumeHistoryRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  
  // NEW: Scrolling visualizer state
  const audioHistoryRef = useRef<number[]>([]); // Store audio levels over time
  const scrollOffsetRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(false);
  const lastHistoryUpdateRef = useRef<number>(0); // Control history update frequency

  // NEW: Enhanced silence detection with visual feedback
  const checkSilenceLevel = useCallback((volume: number) => {
    if (!enableSilenceDetection || !onSilenceDetected) return;

    // Add current volume to rolling average (keep last 10 samples)
    volumeHistoryRef.current.push(volume);
    if (volumeHistoryRef.current.length > 10) {
      volumeHistoryRef.current.shift();
    }

    // Calculate rolling average to smooth out noise
    const avgVolume = volumeHistoryRef.current.reduce((sum, v) => sum + v, 0) / volumeHistoryRef.current.length;

    if (avgVolume < volumeThreshold) {
      // Start or continue silence timer
      if (silenceTimerRef.current === null) {
        silenceTimerRef.current = Date.now();
      } else {
        const silenceDuration = (Date.now() - silenceTimerRef.current) / 1000;
        if (silenceDuration >= silenceThreshold) {
          console.log('[AudioVisualizer] Silence threshold reached, triggering callback');
          onSilenceDetected();
          silenceTimerRef.current = null; // Reset timer
        }
      }
    } else {
      // Reset silence timer when sound is detected
      silenceTimerRef.current = null;
    }
  }, [enableSilenceDetection, onSilenceDetected, silenceThreshold, volumeThreshold]);

  // NEW: Get current silence progress for visual feedback
  const getSilenceProgress = useCallback((): number => {
    if (!silenceTimerRef.current) return 0;
    const silenceDuration = (Date.now() - silenceTimerRef.current) / 1000;
    return Math.min(silenceDuration / silenceThreshold, 1);
  }, [silenceThreshold]);

  // NEW: Animation loop for scrolling effect
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActiveRef.current) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Get the parent container's width instead of the canvas's getBoundingClientRect
    // This ensures we get the full available width, not the constrained canvas width
    const parentElement = canvas.parentElement;
    const parentRect = parentElement ? parentElement.getBoundingClientRect() : canvas.getBoundingClientRect();
    
    // Use parent width but canvas height
    const { height: cssHeight } = canvas.getBoundingClientRect();
    const cssWidth = parentRect.width;
    
    const scale = window.devicePixelRatio || 1;
    canvas.width = cssWidth * scale;
    canvas.height = cssHeight * scale;
    context.scale(scale, scale);

    const width = cssWidth;
    const height = cssHeight;

    // Debug logging
    console.log('[AudioVisualizer] Canvas dimensions:', { 
      width, 
      height, 
      scale,
      parentWidth: parentRect.width,
      canvasWidth: canvas.getBoundingClientRect().width
    });

    // Clear canvas
    context.clearRect(0, 0, width, height);

    // Get theme-aware colors
    const computedStyle = getComputedStyle(document.documentElement);
    const activeBarColor = barColor || computedStyle.getPropertyValue('--primary-color').trim();
    const inactiveColor = computedStyle.getPropertyValue('--muted-text-color').trim();

    // Calculate number of bars that fit on screen
    const totalBarWidth = barWidth + barGap;
    const numberOfBars = Math.floor(width / totalBarWidth) + 8;
    
    // Calculate how many bars we need to fill the width plus extra for smooth scrolling
    const barsNeeded = Math.ceil(width / totalBarWidth); // Extra bars for smooth scrolling

    // Update scroll offset for smooth left movement
    const currentTime = Date.now();
    if (lastUpdateTimeRef.current > 0) {
      const deltaTime = currentTime - lastUpdateTimeRef.current;
      // Scroll speed: move about 12 pixels per second for smooth movement
      scrollOffsetRef.current += (deltaTime / 1000) * 0;
      
      // Reset scroll offset to prevent overflow issues
      const maxOffset = totalBarWidth * barsNeeded;
      if (scrollOffsetRef.current > maxOffset) {
        scrollOffsetRef.current = scrollOffsetRef.current % maxOffset;
      }
    }
    lastUpdateTimeRef.current = currentTime;

    // Use consistent color - no flickering based on audio levels
    const currentBarColor = barColor || activeBarColor || 'var(--primary-color, #f59e0b)';

    // Draw bars from right to left
    
    console.log('[AudioVisualizer] Drawing bars:', { 
      width, 
      totalBarWidth, 
      barsNeeded, 
      scrollOffset: scrollOffsetRef.current 
    });
    
    // Fill the entire width with bars, then shift them based on scroll offset
    for (let i = 0; i < barsNeeded; i++) {
      // Position bars to fill the entire width from right to left
      const baseX = width - (i * totalBarWidth);
      // Apply scroll offset to make bars move from right to left
      const x = baseX - (scrollOffsetRef.current % (barsNeeded * totalBarWidth));
      
      // If a bar goes off the left edge, wrap it to the right side
      let finalX = x;
      if (x < -barWidth) {
        finalX = x + (barsNeeded * totalBarWidth);
      }
      
      // Debug first few bars to verify positioning
      if (i < 3) {
        console.log(`[AudioVisualizer] Bar ${i}: baseX=${baseX}, x=${x}, finalX=${finalX}, width=${width}`);
      }
      
      // Skip bars that are completely off-screen
      if (finalX + barWidth < 0 || finalX > width) continue;

      // Get audio level for this bar position
      // Use a combination of current audio data and history for smooth visualization
      let barHeight: number;
      
      if (i < 5) {
        // For the rightmost bars, use current audio data with better sampling
        if (audioTimeDomainData && audioTimeDomainData.length > 0) {
          const dataIndex = Math.floor((i / 5) * audioTimeDomainData.length);
          const sample = (audioTimeDomainData[dataIndex] - 128) / 128;
          barHeight = Math.abs(sample) * height * sensitivity;
        } else {
          barHeight = 3; // Minimum height when no data
        }
      } else {
        // For older bars, use historical data with fade
        const historyIndex = i - 5;
        if (historyIndex < audioHistoryRef.current.length) {
          const historicalLevel = audioHistoryRef.current[audioHistoryRef.current.length - 1 - historyIndex];
          barHeight = historicalLevel * height * sensitivity;
        } else {
          barHeight = 2; // Low for old/empty data
        }
      }

      // Ensure minimum and maximum bar heights with better scaling
      barHeight = Math.max(3, Math.min(barHeight, height * 0.85));

      // Calculate y position (center the bar)
      const y = (height - barHeight) / 2;

      // Apply fade effect for older bars
      const fadeOpacity = Math.max(0.1, 1 - (i / numberOfBars) * 0.7);
      
      // Draw the bar with fade effect
      context.fillStyle = currentBarColor;
      context.globalAlpha = fadeOpacity;
      context.fillRect(finalX, y, barWidth, barHeight);
      context.globalAlpha = 1.0;
    }

    // Continue animation
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [audioTimeDomainData, barColor, barWidth, barGap, sensitivity, getSilenceProgress, enableSilenceDetection, volumeThreshold]);

  // Update audio history and start/stop animation based on audio data
  useEffect(() => {
    if (audioTimeDomainData && audioTimeDomainData.length > 0) {
      // Calculate RMS (Root Mean Square) for volume level
      let rms = 0;
      for (let i = 0; i < audioTimeDomainData.length; i++) {
        const sample = (audioTimeDomainData[i] - 128) / 128;
        rms += sample * sample;
      }
      rms = Math.sqrt(rms / audioTimeDomainData.length);

      // Store volume and check silence
      lastVolumeRef.current = rms;
      checkSilenceLevel(rms);

      // Add current audio level to history only every 200ms (much slower updates)
      const currentTime = Date.now();
      if (currentTime - lastHistoryUpdateRef.current >= 30) {
        audioHistoryRef.current.push(rms);
        if (audioHistoryRef.current.length > 100) {
          audioHistoryRef.current.shift();
        }
        lastHistoryUpdateRef.current = currentTime;
      }

      // Start animation if not already running
      if (!isActiveRef.current) {
        isActiveRef.current = true;
        lastUpdateTimeRef.current = Date.now();
        animate();
      }
    } else {
      // Stop animation when no audio data
      isActiveRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Draw inactive state
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          // Use the same parent width logic as in animate()
          const parentElement = canvas.parentElement;
          const parentRect = parentElement ? parentElement.getBoundingClientRect() : canvas.getBoundingClientRect();
          
          const { height: cssHeight } = canvas.getBoundingClientRect();
          const cssWidth = parentRect.width;
          
          const scale = window.devicePixelRatio || 1;
          canvas.width = cssWidth * scale;
          canvas.height = cssHeight * scale;
          context.scale(scale, scale);

          context.clearRect(0, 0, cssWidth, cssHeight);
          
          // Theme-aware inactive state - subtle center line
          const computedStyle = getComputedStyle(document.documentElement);
          const inactiveColor = computedStyle.getPropertyValue('--muted-text-color').trim();
          context.fillStyle = inactiveColor;
          context.globalAlpha = 0.3;
          context.fillRect(0, cssHeight / 2 - 0.5, cssWidth, 1);
          context.globalAlpha = 1.0;
        }
      }
    }
  }, [audioTimeDomainData, animate, checkSilenceLevel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (silenceTimerRef.current !== null) {
        silenceTimerRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div 
      className="w-full h-full"
      role="img"
      aria-label={enableSilenceDetection 
        ? `Audio visualizer with silence detection. Current volume: ${(lastVolumeRef.current * 100).toFixed(0)}%`
        : `Audio visualizer. Current volume: ${(lastVolumeRef.current * 100).toFixed(0)}%`
      }
      aria-live="polite"
      aria-atomic="false"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
          // Ensure canvas takes full width and height
          width: '100%',
          height: '100%',
          // Prevent any CSS transforms or animations on the canvas itself
          transform: 'none',
          animation: 'none',
        }}
        aria-hidden="true" // Canvas content is described by parent aria-label
      />
      
      {/* Screen reader only status updates */}
      <div className="sr-only" aria-live="polite">
        {enableSilenceDetection && silenceTimerRef.current && (
          <span>
            Silence detected, auto-stop in {Math.ceil(silenceThreshold - ((Date.now() - silenceTimerRef.current) / 1000))} seconds
          </span>
        )}
      </div>
    </div>
  );
};

const CustomAudioVisualizer = React.memo(CustomAudioVisualizerComponent);

export default CustomAudioVisualizer; 