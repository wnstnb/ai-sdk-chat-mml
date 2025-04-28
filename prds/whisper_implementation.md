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

**Status:** Core functionality (Phases 1 & 2) is **Complete**. Phase 3 (Display) is **Partially Complete** with a known limitation.

### Phase 1: Frontend Implementation (Client-Side) - COMPLETE

**Target Files:** `components/editor/ChatInputUI.tsx`, `lib/hooks/editor/useChatInteractions.ts` (or new hook), `app/launch/page.tsx`, parent pages.

**Summary:** State management, UI updates for recording buttons, microphone access (`getUserMedia`), audio capture (`MediaRecorder`), 30-second timeout, audio processing, transcription API call (`/api/chat/transcribe`), and submission logic (populating input and triggering `handleSubmit` with metadata) were implemented successfully. Adjustments were made to handle submission timing using `useEffect` and pending state variables.

1.  **State Management (in Hook):** COMPLETE
2.  **UI Component (`ChatInputUI.tsx`):** COMPLETE
3.  **Start Recording Logic (in Hook/Component - e.g., `handleStartRecording`):** COMPLETE
4.  **Stop Recording Logic (in Hook - e.g., `handleStopRecording`):** COMPLETE
5.  **Audio Processing & Submission Logic (in Hook/Component - e.g., `handleProcessRecordedAudio`):** COMPLETE (Revised to use pending state for submission)
6.  **Prop Drilling:** COMPLETE
7.  **`/launch` Page Implementation (`app/launch/page.tsx`):** COMPLETE (Replicated state/handlers, calls `/api/chat/transcribe` but only sets input locally)

### Phase 2: Backend Implementation (Server-Side) - COMPLETE

**Target Files:** `app/api/chat/transcribe/route.ts` (new), `app/api/chat/route.ts` (existing).

**Summary:** A dedicated `/api/chat/transcribe` endpoint was created to handle audio uploads and Whisper API calls. The main `/api/chat` route was updated to receive `inputMethod: 'audio'` metadata and log the Whisper usage details (cost estimate, etc.) to the `tool_calls` table, linked to the user's message ID.

1.  **Transcription API Route (`app/api/chat/transcribe/route.ts`):** COMPLETE
2.  **Main Chat API Route (`app/api/chat/route.ts`):** COMPLETE (Handles metadata and logs to `tool_calls` for user messages)

### Phase 3: Frontend Loading & Display - PARTIALLY COMPLETE (See Limitation)

**Target File:** `app/lib/hooks/editor/useInitialChatMessages.ts`

**Summary:** The hook was updated to process loaded messages and format them using the Vercel AI SDK's `parts` array structure for consistency with streaming messages. This ensures assistant tool calls are displayed correctly from history. **However, displaying the Whisper tool call log associated with historical *user* messages had to be disabled.**

1.  **Modify User Message Formatting:** COMPLETE (User message text/images formatted using `parts`). **Note:** Display of associated `whisper_transcription` tool call from history is **disabled** (see Known Limitations below).
2.  **Modify Assistant Message Formatting:** COMPLETE (Assistant messages with text and tool calls correctly formatted into `parts` array, including `tool_invocation` parts with results).

**Target File:** `components/editor/ChatMessageItem.tsx`

3.  **Verify/Update UI Component:** COMPLETE (Component updated to render text and tool invocations based *only* on the `message.parts` array for both user and assistant roles).

### Phase 4: Refinements - COMPLETE (as part of development)

1.  **Error Handling:** Implemented (e.g., mic permissions, API errors).
2.  **UI States:** Implemented (e.g., `isRecording`, `isTranscribing`).
3.  **`/launch` Page:** Confirmed integration.
4.  **Dependencies:** Verified.
5.  **Cost Calculation:** Implemented粗 estimate in `/api/chat/transcribe` and logged.

## Known Limitations

1.  **Historical Whisper Log Display (User Messages):** Displaying the `whisper_transcription` tool call information (like the small cost estimate badge) associated with historical *user* messages is currently disabled.
    *   **Reason:** Testing revealed an incompatibility with Gemini models when reloading chat history containing user messages with `tool-invocation` parts. GPT models handled this structure, but Gemini models failed.
    *   **Workaround:** The `useInitialChatMessages.ts` hook now intentionally avoids adding the `tool-invocation` part for the Whisper call when formatting historical user messages.
    *   **Impact:** Users will not see the Whisper log indicator on their past messages when reloading a chat. The core transcription functionality and logging work correctly, and the indicator appears properly for *live* transcriptions during the session. Assistant tool calls display correctly from history.

## Potential Issues & Mitigations (Original - Retained for context)

1.  **Browser Compatibility & `MediaRecorder`:** (Mitigated via testing, `isTypeSupported`)
2.  **Microphone Permissions & Hardware Issues:** (Mitigated via UI feedback, error handling)
3.  **Frontend Complexity & `useChat` Integration:** (Mitigated via careful implementation, `useEffect` for submission)
4.  **`/launch` Page Integration:** (Mitigated via specific implementation for launch page)
5.  **Whisper API Latency & Cost:** (Mitigated via `isTranscribing` indicators, estimated cost logging) 