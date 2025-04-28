# Whisper Integration PRD

## Feature: Audio Input via Whisper Transcription

**Goal:** Allow users to dictate chat input using their microphone, transcribing the audio to text using OpenAI's Whisper model.

**Motivation:** Provide an alternative input method to typing, enhancing accessibility and user convenience.

## How it Should Work

1.  **UI Change:**
    *   When the chat input field is empty, the standard "Send" button is replaced with a "Record Audio" button (e.g., a microphone icon).
    *   When text is present in the input field, the "Send" button is displayed as usual.
2.  **Recording:**
    *   Clicking the "Record Audio" button starts recording audio from the user's microphone. The UI should indicate that recording is active (e.g., the button icon changes, a timer appears).
    *   The max recording time will be 30 seconds.
    *   Browser permission for microphone access will be required. Handle permission requests gracefully.
3.  **Stopping & Transcribing:**
    *   Clicking the "Record Audio" button *again* stops the recording.
    *   The recorded audio data is sent to a backend endpoint (or directly from the client if secure) which forwards it to the OpenAI Whisper API (`whisper-1` model) for transcription.
4.  **Submitting:**
    *   The transcribed text returned by Whisper is populated into the chat input field.
    *   The input is then submitted automatically, simulating the user typing the text and clicking "Send".
5.  **Availability:** This functionality must be present in all instances of the chat input:
    *   `/launch` page
    *   `/editor` page (main chat pane)
    *   `/editor` page (pinned chat input when the main chat pane is collapsed)

## Bonus / Nice-to-Have

*   **Automatic Silence Detection:** Investigate the feasibility of automatically detecting when the user stops speaking for a short duration (e.g., 1-2 seconds) and stopping the recording/sending the transcription automatically, without requiring a second click.

## Implementation Notes (To Be Filled)

*   **Feasibility Analysis:**
    *   **UI Component:** The primary chat input component appears to be `components/editor/ChatInputUI.tsx`. This component is reused across the editor chat pane and the collapsed editor input. Usage in `/launch` needs final confirmation but is likely using the same or a similar pattern. Modifying this central component is feasible.
    *   **OpenAI Integration:** The project already uses `@ai-sdk/openai` and has a backend API route (`app/api/chat/route.ts`) handling OpenAI calls. Integrating Whisper via this existing infrastructure is feasible.
    *   **Audio Recording:** No existing browser audio recording (`MediaRecorder`, `getUserMedia`) code was found. This functionality needs to be added client-side. Standard browser APIs make this feasible.
    *   **Conclusion:** The feature is **feasible**.

*   **Proposed General Implementation Plan:**
    1.  **Frontend (`ChatInputUI.tsx` & Hooks):**
        *   Add component state for recording status (`isRecording`).
        *   Conditionally render Record/Stop buttons based on `input` emptiness and `isRecording` state.
        *   Implement `getUserMedia` for microphone access on Record click.
        *   Use `MediaRecorder` API to capture audio stream into a Blob.
        *   Implement a 30-second timer (`setTimeout`) when recording starts. If the timer completes before the user stops manually, automatically stop the recorder and proceed with audio submission.
        *   On Stop click (manual or timed out), stop the recorder and pass the audio Blob to a new handler function (e.g., `handleAudioSubmit`) provided by the parent.
    2.  **Frontend (Parent Component/Hooks - e.g., `useChatInteractions`):**
        *   Define `handleAudioSubmit` function.
        *   This function will send the audio Blob (likely via `FormData`) to the backend API (e.g., `/api/chat` or a dedicated endpoint).
        *   Handle the response: receive transcribed text from the backend.
        *   Update chat input state (`setInput(transcribedText)`).
        *   Trigger the standard message submission (`handleSubmit()`).
    3.  **Backend (`app/api/chat/route.ts`):**
        *   Modify the endpoint to detect incoming audio data (e.g., check `Content-Type` or form data).
        *   If audio is present:
            *   Use the existing OpenAI client infrastructure (or base `openai` library) to call the Whisper API (`audio.transcriptions.create`) with the received audio data.
            *   Return the transcription text in the API response.
        *   If no audio, maintain existing chat logic.

*   **Silence Detection Feasibility:**
    *   **Feasible:** Yes, using the Web Audio API (`AudioContext`, `AnalyserNode`) is the standard approach.
    *   **Method:** Periodically analyze the audio stream's volume (e.g., RMS). If volume remains below a threshold for a set duration (e.g., 1-2s), automatically stop the recording.
    *   **Libraries:** Libraries like `hark` or `silence-aware-recorder` exist, but a custom implementation using Web Audio API seems manageable.
    *   **Recommendation:** Implement the core feature *first* without silence detection. Add silence detection as a subsequent enhancement if desired, likely via a custom Web Audio API implementation to minimize dependencies initially. 

## Implementation Steps

**Goal:** Implement audio input via Whisper, logging usage in the `tool_calls` table linked to the user's message, and displaying usage via the existing UI mechanism for tool calls.

### Phase 1: Frontend Implementation (Client-Side)

**Target Files:** `components/editor/ChatInputUI.tsx`, `lib/hooks/editor/useChatInteractions.ts` (or new hook), `app/launch/page.tsx`, parent pages.

1.  **State Management (in Hook):**
    *   Add state variables:
        *   `isRecording: boolean` (default `false`)
        *   `mediaRecorder: MediaRecorder | null` (default `null`)
        *   `audioChunks: Blob[]` (default `[]`)
        *   `recordingTimerId: NodeJS.Timeout | null` (default `null`)
        *   `isTranscribing: boolean` (default `false`)
        *   `micPermissionError: boolean` (default `false`)

2.  **UI Component (`ChatInputUI.tsx`):**
    *   **Icons:** Add `MicIcon` and `StopCircleIcon` (from `lucide-react` or custom).
    *   **Props:** Add `isRecording`, `isTranscribing`, `micPermissionError`, `startRecording`, `stopRecording`.
    *   **Button Logic:** Modify the Send/Stop button area:
        *   Show `StopIcon` (existing) if `isLoading` (AI response generation).
        *   Show `MicIcon` (calls `startRecording`) if `input` is empty & `!isRecording`. Disable if `micPermissionError` or `isTranscribing`. Tooltip: "Record audio input".
        *   Show `StopCircleIcon` (calls `stopRecording`) if `isRecording`. Add visual active indicator (e.g., pulsing). Tooltip: "Stop recording".
        *   Show `SendIcon` (existing) if `input` has text. Disable if `isTranscribing`.

3.  **Start Recording Logic (in Hook/Component - e.g., `handleStartRecording`):**
    *   `async function handleStartRecording():`
        *   Reset `micPermissionError`.
        *   Check for `navigator.mediaDevices.getUserMedia` support.
        *   Use `try/catch` for permission request: `await navigator.mediaDevices.getUserMedia({ audio: true });`
        *   On success:
            *   **Select MIME type:** Check `MediaRecorder.isTypeSupported('audio/webm')`, use it if supported, otherwise fallback to a default or omit (browser default). Example: `const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;`
            *   Create `MediaRecorder`: `new MediaRecorder(stream, { mimeType });`.
            *   Clear `audioChunks`.
            *   Setup `ondataavailable` to push `event.data` to `audioChunks`.
            *   Setup `onstop = handleProcessRecordedAudio;`.
            *   Store recorder instance in state.
            *   Call `recorder.start();`.
            *   Set `isRecording` to `true`.
            *   Start 30-sec timer: `setTimeout(() => { handleStopRecording(true); }, 30000);` (Adjusted per user).
            *   Store timer ID in state.
        *   On error: Log error, set `micPermissionError` to `true`, show error toast.

4.  **Stop Recording Logic (in Hook - e.g., `handleStopRecording`):**
    *   `function handleStopRecording(timedOut = false):`
        *   Clear the `recordingTimerId` timeout.
        *   If `mediaRecorder` exists and `state === 'recording'`:
            *   Call `mediaRecorder.stop();` (triggers `onstop` -> `handleProcessRecordedAudio`).
            *   Set `isRecording` to `false`.
            *   If `timedOut`, show notification (optional).
        *   Else: Set `isRecording` to `false`.

5.  **Audio Processing & Submission Logic (in Hook/Component - e.g., `handleProcessRecordedAudio`):**
    *   `async function handleProcessRecordedAudio():`
        *   **Check for empty/short audio:** If `audioChunks` is empty or total size is very small (e.g., < 1KB), show a notification ("No audio detected" or similar) and return early.
        *   Set `isTranscribing` to `true`.
        *   Create Blob: `new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });`.
        *   Reset `audioChunks`.
        *   Stop media tracks & clear recorder: `mediaRecorder?.stream.getTracks().forEach(track => track.stop()); setMediaRecorder(null);`
        *   Create `FormData` and append audio Blob as `audioFile`.
        *   Use `try/catch/finally`:
            *   Call Transcription API: `fetch('/api/chat/transcribe', { method: 'POST', body: formData });`.
            *   Check `response.ok`.
            *   Parse JSON response `result` (expecting `{ transcription: "...", whisperDetails: { ... } }`).
            *   If `result.transcription` exists:
                *   **For Editor Context:** Set input field: `setInput(result.transcription);`. Trigger Chat Submission: `handleSubmit(undefined, { data: { inputMethod: 'audio', whisperDetails: result.whisperDetails } });`.
                *   **For Launch Context:** Set input field: `setInput(result.transcription);` (Do NOT call `handleSubmit`).
            *   Else, throw error.
            *   `catch`: Log error, show error toast.
            *   `finally`: Set `isTranscribing` to `false`.

6.  **Prop Drilling:** Pass new state and handlers down to `ChatInputUI` in both Editor and Launch contexts.

7.  **`/launch` Page Implementation (`app/launch/page.tsx`):**
    *   Replicate the state variables (`isRecording`, `mediaRecorder`, etc.) from Step 1 within the `LaunchPage` component.
    *   Implement the handler functions (`handleStartRecording`, `handleStopRecording`, `handleProcessRecordedAudio`) from Steps 3, 4, 5 within `LaunchPage`, ensuring `handleProcessRecordedAudio` only calls `setInput` as noted in Step 5.
    *   Pass the required props (state and handlers) to the `<ChatInputUI>` instance used on the launch page.

### Phase 2: Backend Implementation (Server-Side)

**Target Files:** `app/api/chat/transcribe/route.ts` (new), `app/api/chat/route.ts` (existing).

1.  **Transcription API Route (`app/api/chat/transcribe/route.ts`):**
    *   Import `openai`, `NextRequest`, `NextResponse`.
    *   Define `export async function POST(req: NextRequest)`.
    *   Get OpenAI client instance.
    *   Use `try/catch`:
        *   Parse FormData, get `audioFile`. Validate presence.
        *   Call Whisper API: `const transcription = await openai.audio.transcriptions.create({ file: audioFile, model: 'whisper-1' });`
        *   Prepare Logging Details: Extract/define details. **Note:** Cost calculation based on file size/duration is an *estimate*.
            ```typescript
            const durationEstimateMs = null; // Duration not easily available from API/File
            const costEstimate = 0.006 * (audioFile.size / 150000); // Rough estimate based on $0.006/min, ~150kB/min
            const whisperDetails = { duration_ms: durationEstimateMs, cost_estimate: costEstimate };
            ```
        *   If `transcription?.text` exists, return `NextResponse.json({ transcription: transcription.text, whisperDetails });`.
        *   Else, throw error.
    *   `catch`: Log error, return error `NextResponse` (status 500).

2.  **Main Chat API Route (`app/api/chat/route.ts`):**
    *   Modify the `POST` handler.
    *   Inside the main logic (before calling `streamText`):
        *   Check `requestData` for `inputMethod === 'audio'`.
        *   **Save User Message:** Save the message (`role='user'`, `content=transcription`) to the `messages` table as usual. Add `input_method: 'audio'` to the `metadata` field. Get the `savedUserMessageId`.
        *   **Save Whisper Log to `tool_calls`:** If `inputMethod === 'audio'`:
            *   Retrieve `whisperDetails` from `requestData`.
            *   Generate a unique ID: `const whisperToolCallId = \`whisper-\${crypto.randomUUID()}\`;`
            *   Insert into `tool_calls`:
                ```sql
                INSERT INTO tool_calls (message_id, user_id, tool_name, tool_call_id, tool_input, tool_output)
                VALUES ($savedUserMessageId, $userId, 'whisper_transcription', $whisperToolCallId, $toolInputJson, $toolOutputJson);
                ```
                Where `$toolInputJson` is e.g., `{ "duration_ms": whisperDetails.duration_ms }` and `$toolOutputJson` is e.g., `{ "status": "success", "cost": whisperDetails.cost }`.
    *   Continue with existing logic to call the completion model (`streamText`).

### Phase 3: Frontend Loading & Display

**Target File:** `app/lib/hooks/editor/useInitialChatMessages.ts`

1.  **Modify User Message Formatting:**
    *   In `fetchInitialMessages` (or equivalent), after fetching messages and all associated `toolCalls`.
    *   When processing a message where `msg.role === 'user'`:
        *   Find any associated `tool_calls` for that `msg.id` where `tool_name === 'whisper_transcription'`. Let this be `whisperCall`.
        *   Initialize `const messageParts = [];`
        *   Add Text Part: `messageParts.push({ type: 'text', text: msg.content || '' });`
        *   Add Tool Invocation Part (if `whisperCall` exists):
            ```typescript
            messageParts.push({
                type: 'tool-invocation',
                toolInvocation: {
                    state: 'result',
                    toolCallId: whisperCall.tool_call_id,
                    toolName: whisperCall.tool_name,
                    args: whisperCall.tool_input,
                    result: whisperCall.tool_output
                }
            });
            ```
        *   Create Final Message Object for `formattedMessages` array:
            ```typescript
            formattedMessages.push({
                id: msg.id,
                role: 'user',
                content: '', // Content now in parts
                createdAt: new Date(msg.created_at),
                parts: messageParts // Always assign parts (will contain at least text)
            } as Message);
            ```

**Target File:** `components/editor/ChatMessageItem.tsx`

2.  **Verify UI Component:**
    *   Review the component to confirm it renders based *only* on the `message.parts` array for both user and assistant roles.
    *   No changes should be needed if it correctly iterates `message.parts` and renders text for `type: 'text'` and the tool display for `type: 'tool-invocation'`.

### Phase 4: Refinements

1.  **Error Handling:** Add robust toasts/feedback for mic permissions, API errors, etc.
2.  **UI States:** Ensure clear visual cues for `isRecording`, `isTranscribing`, errors.
3.  **`/launch` Page:** Confirm chat input component usage and ensure integration.
4.  **Dependencies:** Verify no new external libraries are strictly needed.
5.  **Cost Calculation:** Refine the cost estimation logic in `/api/chat/transcribe`.

## Potential Issues & Mitigations

1.  **Browser Compatibility & `MediaRecorder`:**
    *   **Issue:** Different browsers might require specific `mimeType` values (e.g., `audio/webm`, `audio/ogg`) or have subtle differences in API behavior.
    *   **Mitigation:** Test across target browsers (Chrome, Firefox, Safari). Use `MediaRecorder.isTypeSupported()` to select a supported `mimeType` or provide fallbacks. Implement robust error handling for API calls.

2.  **Microphone Permissions & Hardware Issues:**
    *   **Issue:** Denied permissions or non-functional hardware (muted, unplugged) can lead to feature failure or silent recordings.
    *   **Mitigation:** Provide clear UI feedback when permission is denied (explaining why the feature is disabled). Handle potential errors during `getUserMedia` gracefully. Consider adding a check for very short/silent audio before sending to Whisper (low priority).

3.  **Frontend Complexity & `useChat` Integration:**
    *   **Issue:** Adding recording state/logic to hooks/components increases complexity. The specific flow of `setInput` -> `handleSubmit(..., { data: {...} })` needs verification.
    *   **Mitigation:** Code analysis confirmed the `data` payload mechanism exists. Ensure the `handleProcessRecordedAudio` function correctly calls the *wrapped* `handleSubmit` from `useChatInteractions` with the required `data` object. Maintain clean state management within the relevant hook.

4.  **`/launch` Page Integration:**
    *   **Issue:** `app/launch/page.tsx` uses `ChatInputUI` but has its own state management and submission logic (`handleLaunchSubmit` to `/api/launch`), separate from `useChatInteractions`.
    *   **Mitigation:** Replicate the necessary recording state (`isRecording`, `mediaRecorder`, etc.) and handlers (`handleStartRecording`, `handleStopRecording`, `handleProcessRecordedAudio`) within `app/launch/page.tsx`. The launch page's `handleProcessRecordedAudio` will call `/api/chat/transcribe` but then only update the local `input` state (`setInput(transcription)`), letting the user click the standard submit button to trigger the existing `/api/launch` flow.

5.  **Whisper API Latency & Cost:**
    *   **Issue:** Transcription takes time, potentially impacting perceived performance. Accurate real-time cost calculation is difficult.
    *   **Mitigation:** Use clear `isTranscribing` indicators. Accept potential latency. Refine cost estimation in logging as feasible; perfect accuracy might not be achievable without more complex tracking. 