# Audio Visualization Implementation Plan

## 1. Goal

Integrate real-time audio waveform visualization into the chat input area. When the user clicks the microphone button to start recording, the standard text input area should be visually replaced by an animated waveform representing the microphone input, similar to the behavior seen in ChatGPT's voice input.

## 2. Relevant Components & Hooks

Based on codebase analysis, the key files are:

*   `components/editor/ChatInputUI.tsx`: The component rendering the text area, buttons, and handling the display logic based on recording state. This is where the visualizer component will be added.
*   `lib/hooks/editor/useChatInteractions.ts`: The hook managing the recording state (`isRecording`, `isTranscribing`) and providing the `startRecording` and `stopRecording` functions. It also likely handles the raw audio stream access needed for visualization.
*   `components/editor/ChatInputArea.tsx`: The parent wrapper passing props down to `ChatInputUI`.

## 3. Proposed Library

We will use the `react-voice-visualizer` library as discussed.

```bash
npm install react-voice-visualizer
# or
yarn add react-voice-visualizer
```

## 4. Implementation Steps

1.  **Import Library Components:**
    *   In `ChatInputUI.tsx`, import the necessary hook and component:
        ```typescript
        import { useVoiceVisualizer, VoiceVisualizer } from 'react-voice-visualizer';
        ```

2.  **Integrate `react-voice-visualizer` Hook within `ChatInputUI`:**
    *   The existing `useChatInteractions` hook handles the overall recording *state* (`isRecording`, `isTranscribing`) and the *submission* logic (`handleStartRecording`, `handleStopRecording` trigger state changes and API calls).
    *   However, `useChatInteractions` currently uses `MediaRecorder` directly and does not expose an `AudioContext` or `AnalyserNode` needed for most visualizers.
    *   The `react-voice-visualizer` library is designed to work with its own `useVoiceVisualizer` hook, which manages the audio context and visualization loop internally.
    *   **Therefore, we will initialize `useVoiceVisualizer` inside `ChatInputUI.tsx`**. We will use the `isRecording` prop from `useChatInteractions` to *conditionally render* the `<VoiceVisualizer />` component, but the visualizer itself will be driven by its own hook's state.
    *   **Coordination:** We need to ensure that when the user clicks the mic button (handled by `ChatInputUI`), we *first* attempt to start the visualizer's recording. If successful, we then proceed to call `startRecording` from `useChatInteractions` props. If the visualizer fails to start (e.g., permission denied), the main recording should *not* proceed, and ideally, feedback should be provided. When `stopRecording` (from props) is called, we trigger the stop function from `useVoiceVisualizer`.

3.  **Conditional Rendering & Button Logic in `ChatInputUI.tsx`:**
    *   Locate the `div` that wraps the `<textarea>` within `ChatInputUI.tsx`.
    *   Use the `isRecording` prop (from `useChatInteractions`) to conditionally render either the `<textarea>` or the `<VoiceVisualizer />`.
    *   **Revised Mic Button Logic:** Modify the microphone button's `onClick` handler to implement the start-first logic.
    *   **Example Structure:**

        ```typescript
        // Inside ChatInputUI component:
        import { useVoiceVisualizer, VoiceVisualizer } from 'react-voice-visualizer';
        import { useEffect, useState } from 'react'; // Add useState for potential error feedback

        // ... interface ChatInputUIProps ... 
        // Props received: isRecording, startRecording, stopRecording (from useChatInteractions)

        export const ChatInputUI: React.FC<ChatInputUIProps> = ({
            // ... other props
            isRecording,       // State from useChatInteractions
            startRecording: startChatRecording, // Rename prop for clarity
            stopRecording: stopChatRecording,   // Rename prop for clarity
            inputRef,
            // ... other props
        }) => {
            const [vizError, setVizError] = useState<string | null>(null); // State for visualizer errors
            // Initialize visualizer controls using the library's hook
            const recorderControls = useVoiceVisualizer();
            const { 
                start: startVizRecording, 
                stop: stopVizRecording, 
                error: vizHookError // Capture potential errors from the hook itself
             } = recorderControls; 

            // Effect to synchronize stopping
            useEffect(() => {
                // Only stop viz if we are transitioning *out* of the recording state
                if (!isRecording) {
                    console.log('[ChatInputUI] isRecording is false, attempting to stop viz recording.');
                    stopVizRecording(); 
                }
                // Cleanup on unmount if necessary
                // return () => { stopVizRecording(); }; 
            }, [isRecording, stopVizRecording]);

             // Handle errors reported by the hook
             useEffect(() => {
                 if (vizHookError) {
                     console.error("Visualizer Hook Error:", vizHookError);
                     setVizError(`Visualizer Error: ${vizHookError.message}`);
                     // Optional: Automatically stop main recording if viz fails mid-way? Depends on desired UX.
                     // if (isRecording) stopChatRecording(); 
                 }
             }, [vizHookError]);

            // Revised Mic button handler
            const handleMicButtonClick = async () => {
                setVizError(null); // Clear previous errors

                if (isRecording) {
                    // Stop main recording (triggers useEffect to stop viz)
                    stopChatRecording(); 
                } else {
                    try {
                        console.log('[ChatInputUI] Attempting to start viz recording...');
                        // 1. Attempt to start the visualizer recording first
                        await startVizRecording(); // Assuming startVizRecording might be async or handle permissions
                        console.log('[ChatInputUI] Viz recording started successfully. Starting main recording...');
                        
                        // 2. If visualizer starts successfully, start the main chat recording
                        startChatRecording(); 
                        // isRecording will become true, triggering conditional render

                    } catch (err) {
                        console.error('[ChatInputUI] Failed to start visualizer recording:', err);
                        // Provide feedback to the user
                        setVizError("Could not start microphone visualization. Please check permissions."); 
                        // DO NOT call startChatRecording() if viz fails
                    }
                }
            };

            return (
                // ... existing outer divs ...
                <div className="flex flex-col w-full bg-[--input-bg] rounded-lg p-2 border border-[--border-color] shadow-sm relative h-[60px]"> {/* Add relative and fixed height for overlay */} 

                    {/* Display Error (Optional but recommended) */}
                    {vizError && <div className="absolute top-0 left-2 text-red-500 text-xs z-20">{vizError}</div>}

                    {/* Conditional Rendering: Visualizer or Textarea */} 
                    {isRecording ? (
                        <div className="absolute inset-0 flex items-center justify-center p-2 z-10"> {/* Overlay div, ensure z-index */} 
                            <VoiceVisualizer
                                controls={recorderControls} // Use the controls from the library's hook
                                
                                // --- Configuration ---
                                height="100%" // Fill the container
                                width="100%"
                                mainBarColor="#FFFFFF" // White bars
                                secondaryBarColor="#A0A0A0" // Adjusted secondary color
                                backgroundColor="transparent" // Transparent background
                                barWidth={2}
                                gap={1}
                                speed={3} // Adjust as needed
                                isControlPanelShown={false} // Hide default controls
                            />
                        </div>
                    ) : (
                        <textarea
                            ref={inputRef}
                            rows={1}
                            className={`chat-input-text bg-transparent w-full h-full outline-none text-[--text-color] placeholder-[--muted-text-color] resize-none overflow-y-auto max-h-40 align-bottom`} // Ensure it fills height, hide via parent conditional
                            placeholder={/* existing placeholder logic */}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            disabled={isLoading || isUploading || isRecording || isTranscribing}
                        />
                    )}

                    {/* ... existing bottom controls (ModelSelector, buttons) ... */}
                    {/* Ensure buttons are still accessible, maybe overlay textarea OR place viz above controls */}
                </div>
                // ...
            );
        }
        ```

4.  **Connecting Audio Source (Confirmed):**
    *   **Library Handles Internally:** Based on review of the `react-voice-visualizer` documentation, the library **handles its own audio acquisition** (`getUserMedia`, `MediaRecorder`) via the `useVoiceVisualizer` hook. It **does not** provide a mechanism to accept an existing `MediaStream` or `AudioContext` for live visualization. `setPreloadedAudioBlob` is only for static files.
    *   **Coordination is Key:** Therefore, the primary task remains synchronizing the start/stop actions. The revised `handleMicButtonClick` logic attempts to start the visualizer first. If successful, it proceeds with the main recording managed by `useChatInteractions`. If the visualizer fails (e.g., permission denied), the main recording is prevented. Stopping is handled via the `useEffect` hook reacting to `isRecording` becoming false.
    *   **Potential Issue:** The `getUserMedia` conflict remains a possibility (double prompts or browser resource issues if both try simultaneously, though the sequential start logic aims to mitigate this). Testing is crucial.

5.  **Styling:**
    *   Adjust the props (`mainBarColor`, `secondaryBarColor`, `barWidth`, `gap`, `height`, `width`) of `<VoiceVisualizer />` to match the desired look and feel based on the screenshot.
    *   Ensure the overlay positioning is correct and doesn't interfere with other UI elements (buttons, etc.). Adjust CSS (`absolute`, `inset-0`, `z-index`) as needed.
    *   The existing logic in `ChatInputUI.tsx` already handles disabling the textarea and changing the button icons/states when `isRecording` is true, which aligns with the desired UI.

## 5. Assessment

*   **Feasibility:** The proposed overlay approach is definitely feasible given the current component structure (`ChatInputUI`) and state management (`useChatInteractions`).
*   **Key Challenge:** Coordinating the state and actions, particularly the start sequence and handling potential `getUserMedia` conflicts or visualizer-specific errors. Ensuring the visualizer starts successfully *before* allowing the main recording state is the core change.
*   **Alternative:** If coordination proves persistently problematic, the fallback remains: modify `useChatInteractions` to manage the `AudioContext/AnalyserNode` and implement a custom Canvas visualization within `ChatInputUI`.

## 6. Phased Implementation & Next Steps

1.  **Phase 1: Setup & Basic Integration**
    *   Install `react-voice-visualizer`.
    *   Import `useVoiceVisualizer` and `VoiceVisualizer` into `ChatInputUI.tsx`.
    *   Initialize the hook: `const recorderControls = useVoiceVisualizer();`
    *   **Test Point:** Ensure the component renders without errors after import and hook initialization.

2.  **Phase 2: Conditional Rendering**
    *   Implement the basic conditional rendering logic: show `<VoiceVisualizer />` when `isRecording` is true, and the `<textarea>` otherwise.
    *   Use placeholder/default props for `<VoiceVisualizer />` for now.
    *   Pass the `recorderControls` to the `<VoiceVisualizer controls={...} />` prop.
    *   **Test Point:** Manually toggle a mock `isRecording` state (if possible/easy) or observe the UI change when the actual recording state changes (even if viz doesn't work yet). Verify the correct component shows/hides.

3.  **Phase 3: Start/Stop Coordination**
    *   Implement the revised `handleMicButtonClick` logic:
        *   On click when *not* recording: Call `startVizRecording()`. If successful, call `startChatRecording()` (prop). If `startVizRecording` fails, catch the error, set an error state, and *do not* call `startChatRecording()`.
        *   On click when *recording*: Call `stopChatRecording()` (prop).
    *   Implement the `useEffect` hook that calls `stopVizRecording()` when `isRecording` becomes `false`.
    *   Implement basic error state (`useState`) and display for visualizer start failures.
    *   **Test Point:** Click the microphone button.
        *   Verify the permission prompt appears (likely from the visualizer hook first).
        *   If permission granted, verify the visualizer appears *and* the `isRecording` state becomes true.
        *   If permission denied, verify an error message is shown (if implemented) and `isRecording` remains false.
        *   Click the button again (if recording started) and verify the visualizer disappears and `isRecording` becomes false. Test rapid start/stop clicks.

4.  **Phase 4: Styling & Refinement**
    *   Apply the desired styling props (`mainBarColor`, `secondaryBarColor`, `barWidth`, etc.) to `<VoiceVisualizer />`.
    *   Ensure the overlay positioning is correct and doesn't interfere with other UI elements (buttons, etc.). Adjust CSS (`absolute`, `inset-0`, `z-index`) as needed.
    *   Refine error handling/display.
    *   Test `vizHookError` handling (`useEffect`) if applicable.
    *   **Test Point:** Verify the visualizer looks correct, is positioned properly, and the overall UI remains functional during recording.

5.  **Phase 5: Final Testing & Edge Cases**
    *   Thoroughly test across different browsers (if applicable).
    *   Test scenarios like revoking permissions after initially granting them.
    *   Test interaction with transcription state (`isTranscribing`).
    *   Test component unmounting during recording (if possible).

## 7. Assessment

*   **Feasibility:** The phased implementation approach is definitely feasible given the current component structure (`ChatInputUI`) and state management (`useChatInteractions`).
*   **Key Challenge:** Coordinating the state and actions, particularly the start sequence and handling potential `getUserMedia` conflicts or visualizer-specific errors. Ensuring the visualizer starts successfully *before* allowing the main recording state is the core change.
*   **Alternative:** If coordination proves persistently problematic, the fallback remains: modify `useChatInteractions` to manage the `AudioContext/AnalyserNode` and implement a custom Canvas visualization within `ChatInputUI`.

## 8. Next Steps

1.  Install `react-voice-visualizer`.
2.  Implement the `useVoiceVisualizer` hook within `ChatInputUI.tsx`.
3.  Implement the conditional rendering of `<VoiceVisualizer />` vs `<textarea>` based on the `isRecording` prop.
4.  Implement the `useEffect` hook and modify button handlers in `ChatInputUI.tsx` to synchronize the start/stop actions between `useChatInteractions` props and `useVoiceVisualizer` controls.
5.  Thoroughly test the permission prompt behavior and recording start/stop synchronization.
6.  Test and refine styling, ensuring the visualizer overlays correctly and controls remain accessible. 