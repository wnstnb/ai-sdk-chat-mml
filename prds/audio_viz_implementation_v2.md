# Audio Visualization Implementation Plan v2

## 1. Goal

Integrate real-time audio waveform visualization into the chat input area. When the user clicks the microphone button to start recording, the standard text input area should be visually replaced by an animated waveform representing the microphone input.

## 2. Background & Reason for Pivot

*   **Initial Approach (v1):** We attempted to use the `react-voice-visualizer` library. The plan involved coordinating this library's `useVoiceVisualizer` hook with our existing `useChatInteractions` hook.
*   **Problem Encountered:** During implementation (Phases 1-3), testing revealed that while the `react-voice-visualizer` hook indicated it was starting/stopping, it consistently failed to process audio data for visualization. Logs showed `audioData.length` was always 0, and errors like "The audio blob is empty" occurred upon stopping. This happened despite the core recording via `useChatInteractions` working correctly for transcription.
*   **Likely Cause:** Conflicts arising from two separate attempts to access/process the microphone (`getUserMedia`): one by `useChatInteractions` (which works) and one internally by `react-voice-visualizer` (which failed in this context). Coordinating two independent audio pipelines proved unreliable.
*   **Decision:** Pivot to a custom implementation that leverages the *single*, known-working audio stream already managed by `useChatInteractions`.

## 3. New Approach: Custom Visualization

This plan outlines implementing the visualization directly using the Web Audio API and HTML Canvas, integrated tightly with the existing `useChatInteractions` hook.

1.  **Modify `useChatInteractions.ts`:**
    *   When the `MediaStream` is obtained (after permission grant), create an `AudioContext`.
    *   Create a `MediaStreamAudioSourceNode` from the stream.
    *   Create an `AnalyserNode` and connect the source node to it. Adjust `fftSize` as needed (e.g., 2048).
    *   During recording, periodically (e.g., using `requestAnimationFrame` or a timer) get time-domain waveform data (e.g., `getByteTimeDomainData`) from the `AnalyserNode` into a `Uint8Array`.
    *   Store this `Uint8Array` in the hook's state and expose it as a new return value (e.g., `audioTimeDomainData` - let's rename for clarity).
    *   Ensure the `AudioContext` is properly closed/cleaned up when recording stops or the component unmounts.

2.  **Create `CustomAudioVisualizer` Component:**
    *   Create a new React component (e.g., `components/editor/CustomAudioVisualizer.tsx`).
    *   This component will accept the `audioTimeDomainData: Uint8Array | null` as a prop.
    *   It will contain an HTML `<canvas>` element.
    *   Use a `useEffect` hook that triggers when `audioTimeDomainData` changes.
    *   Inside the effect, get the canvas 2D rendering context.
    *   Implement logic to draw the waveform on the canvas based on the amplitude values in the `audioTimeDomainData` array (values typically 0-255, with 128 being silence). This involves mapping array indices to the x-axis and amplitude values to the y-axis, potentially drawing vertical lines from a center line. Use `requestAnimationFrame` for smooth animation tied to data updates.
    *   Add necessary styling props (colors, dimensions, etc.) if needed.

3.  **Integrate into `ChatInputUI.tsx`:**
    *   Remove the `useVoiceVisualizer` hook and related state/effects.
    *   Import the new `CustomAudioVisualizer` component.
    *   Get the new `audioTimeDomainData` state from the `useChatInteractions` hook (passed via props).
    *   In the conditional rendering logic, replace `<VoiceVisualizer />` with `<CustomAudioVisualizer audioTimeDomainData={audioTimeDomainData} />` when `isRecording` is true.
    *   Ensure the `CustomAudioVisualizer` is positioned correctly within the input area (similar overlay logic as before).

4.  **Cleanup:**
    *   Uninstall `react-voice-visualizer`: `npm uninstall react-voice-visualizer`.
    *   Remove any lingering imports or code related to the old library.

## 4. Benefits of New Approach

*   **Single Audio Source:** Eliminates potential conflicts by using only the `MediaStream` already managed by `useChatInteractions`.
*   **Reliability:** Leverages the audio pipeline known to be working for transcription.
*   **Control:** Provides full control over the visualization's appearance and behavior.
*   **Simplicity:** Removes the need to coordinate two separate hooks managing audio state.

## 5. Implementation Steps (Phased)

1.  **Phase 1: `useChatInteractions` Refactor**
    *   Modify `useChatInteractions.ts` to create `AudioContext`, `AnalyserNode`, and retrieve time-domain data (`Uint8Array`) using `getByteTimeDomainData`.
    *   Add `audioTimeDomainData` to the hook's state and return values.
    *   Add console logs to verify data retrieval during recording.
    *   **Test Point:** Ensure recording still works for transcription and time-domain data is logged to the console.

2.  **Phase 2: Basic Canvas Component**
    *   Create `CustomAudioVisualizer.tsx`.
    *   Set up the basic component structure with a `<canvas>` element.
    *   Accept `audioTimeDomainData` prop.
    *   Add a `useEffect` to clear and redraw the canvas when the prop changes (initially, maybe just draw a static line or log data).
    *   **Test Point:** Integrate into `ChatInputUI` (conditionally rendered), pass the prop, and verify the component renders and logs data/draws something basic when recording.

3.  **Phase 3: Canvas Drawing Logic**
    *   Implement the actual waveform drawing logic within `CustomAudioVisualizer` using the Canvas API and the time-domain data (amplitude values).
    *   Use `requestAnimationFrame` for smooth animation.
    *   Refine visual appearance (colors, line style/thickness, scaling, mapping 0-255 range to canvas height).
    *   **Test Point:** Verify the waveform visualization appears correctly and animates in sync with voice input during recording.

4.  **Phase 4: Cleanup & Final Testing**
    *   Uninstall `react-voice-visualizer`.
    *   Remove all code related to the previous attempt (`useVoiceVisualizer` hook, component, logs, etc.).
    *   Perform thorough testing of recording, visualization, transcription, and edge cases. 