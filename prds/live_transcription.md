# Live Transcription Integration PRD

## 1. Goal
Replace the existing *record-then-transcribe* Whisper flow with a **real-time transcription** experience powered by OpenAI's `gpt-4o-transcribe` model. Users should see their speech converted to text **as they talk**, directly inside the chat input, with the conversation submitting automatically after 2 s of silence (unchanged UX).

## 2. Why This Matters
1. **Latency ↘︎ 90 %** – users no longer wait for the upload & Whisper round-trip.
2. **Hands-free dictation** – live feedback encourages longer spoken prompts and iterative editing.
3. **Foundation for multimodal** – gpt-4o is the same family we'll use for future vision & emotion features.

## 3. Current vs. Proposed Flow
| Step | Whisper (today) | Live (gpt-4o) |
|------|-----------------|---------------|
| 1. User clicks mic | `isRecording = true`, blob begins | **same** |
| 2. During speech | Audio buffered in `MediaRecorder` | Audio frames streamed to backend WS → OpenAI |
| 3. UI feedback | Optional waveform only | **waveform + live text** inside `<ChatInput>` |
| 4. Silence ≥ 2 s | MediaRecorder `stop()` → blob upload | Frontend sends `finish` over WS → OpenAI closes stream |
| 5. Transcription | Server <-- Whisper result | Server <-- gpt-4o final transcript |
| 6. Message submit | Populates input, auto-submit | **same** |

## 4. Technical Overview
1. **Client audio pipeline**
   * Re-use existing `getUserMedia` + `AudioContext`.
   * Switch from `MediaRecorder` → **AudioWorklet** (or `ScriptProcessor` fallback) to extract 16 kHz mono PCM chunks (~20 ms, 640 samples) in near-real-time.
   * Send chunks via **WebSocket** to `/api/transcribe/live` (Next.js Edge runtime).
2. **Server (Edge / Node)**
   * Upgrade path: use `@fastify/websocket` or native `ws` until Next 14 WS RFC stabilises.
   * For each connection:
     ```mermaid
     client PCM  →  WS  →  server
                           ↓
                     OpenAI Transcriptions
                           ↓
                   partial + final text  →  WS  →  client
     ```
   * OpenAI call shape (pseudo):
     ```ts
     const stream = openai.audio.transcriptions.create({
       model: 'gpt-4o-transcribe',
       format: 'text',          // no SRT v1
       stream: true             // enables partials via SSE
     });
     ```
   * Pipe incoming PCM to `stream.write(chunk)`; forward `stream.on('transcript', …)` events back to the client.
3. **Frontend transcription state**
   * New hook `useLiveTranscription` (inside `useChatInteractions`).
   * Maintains: `partialText`, `isLive`, `silenceMs`.
   * Renders partial text inside the `<textarea>` (ghost style) **or** directly mutates `input` state for WYSIWYG editing.
4. **Silence Detection**
   * Continue Web-Audio RMS threshold logic (already prototyped in *audio_viz_implementation_v2*). When `silenceMs >= 2000`:
     1. Stop sending PCM.
     2. Await `final` transcript from server.
     3. Clean up audio + WS.
     4. Submit chat message (existing path).
5. **Cost & Rate Limits**
   * gpt-4o-transcribe is priced per *audio second*. Live flow streams the same audio length ⇒ cost parity with Whisper.
   * However, *partial* transcripts may incur incremental tokens if we forward them to the UX (no OpenAI cost but websocket bandwidth).

## 5. Affected Code Areas
* `lib/hooks/editor/useChatInteractions.ts`
* `components/editor/ChatInputUI.tsx`
* `components/editor/CustomAudioVisualizer.tsx` (reuse for waveform)
* New server route: `app/api/transcribe/live/route.ts` (WS)
* Possible utility: `lib/audio/pcmWorklet.ts`

### Chat Input Instances Covered
The changes propagate through `ChatInputUI`, so **all UI surfaces that already use this component will gain live-transcription automatically**. We still list them explicitly to avoid omissions:
1. Editor main chat pane (`components/editor/EditorPaneWrapper.tsx`) – desktop & tablet.
2. Pinned chat bar when the chat pane is collapsed (`components/editor/ChatInputArea.tsx`).
3. Pinned chat bar on mobile (same `ChatInputArea`, mobile breakpoint).
4. `/launch` page starter chat input (`app/launch/page.tsx`).
5. New document modal (`components/modals/NewDocumentModal.tsx`).

For any **future** locations that embed `ChatInputUI`, no extra work is required beyond wiring the `useChatInteractions` props.

## 6. Implementation Plan (Phased)
1. **Spike (½ day)** – Build minimal Node script that streams mic PCM to OpenAI and logs partial transcripts.
2. **Backend WS Endpoint (1 day)**
   * Create Edge-compatible handler with auth (Supabase session cookie) & 30 s max duration.
   * Error mapping (OpenAI ↔︎ client).
3. **Frontend Hook (1.5 days)**
   * Replace `MediaRecorder` with `AudioWorklet`.
   * Manage WS lifecycle & silence detection.
4. **UI Polish (0.5 day)**
   * Inline ghost text rendering; fallback message while connecting ("Live-transcribing…").
   * Accessibility: announce start/stop via aria-live.
5. **Analytics & Logging (0.5 day)**
   * Store `tool_calls` row with `gpt-4o-transcribe` cost & latency.
6. **QA + Cross-browser (1 day)**
   * Firefox requires `AudioWorklet` polyfill or fallback to ScriptProcessor.
   * Mobile Safari microphone permission quirks.

## 7. Open Questions
1. Does OpenAI return partials over **SSE**, or do we need their upcoming WS beta? Docs suggest SSE → we can *fan-out* SSE to our WS.
2. Required audio encoding – docs mention 16 kHz mono PCM (`audio/raw;encoding=pcm`). Browser output is 48 kHz float32. We'll down-sample on the client (Worklet) to avoid server CPU.
3. Authentication model – Edge functions cannot upgrade to WS natively yet; we may need a dedicated */api/live* Node route outside the Edge runtime.

## 8. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|-----------|
| **WS upgrade** unsupported on Vercel Edge | Blocker | Fallback to Node Function (serverless) or Pusher Channels |
| Down-sampling glitches | Choppy transcript | Use proven resampler code (e.g., `libsamplerate.js` transpiled) |
| 2 s silence mis-fires in noisy env | Early submit | Dynamic threshold, user-override ("Send now") |
| Token leak via client WS | Security | Keep OpenAI key server-side; client talks only to our WS |

## 9. Estimated Timeline
Total ≈ **5 dev-days** + 1 QA buffer.

| Phase | Duration | Target Date |
|-------|----------|-------------|
| Spike | 0.5 d | T+0.5 d |
| Backend WS | 1 d | T+1.5 d |
| Frontend Hook | 1.5 d | T+3 d |
| UI Polish | 0.5 d | T+3.5 d |
| Analytics & Logging | 0.5 d | T+4 d |
| QA / Harden | 1 d | T+5 d |

## 10. Acceptance Criteria
1. Speaking populates chat input in < 300 ms latency (Lighthouse measured).
2. After 2 s of silence the message auto-submits – identical to Whisper UX.
3. Feature works on Chrome (latest), Safari (≥iOS 17), Firefox (latest).
4. `tool_calls` table shows `gpt-4o-transcribe` rows with duration & cost.
5. No user PII or OpenAI key exposed in network inspector.

## 11. Detailed Engineering Task Breakdown

This section enumerates the concrete engineering tasks, in the order they should be executed. Check each box as you complete it.

### 11.1 Repo & Environment Prep
- [ ] Create **feature branch** `feat/live-transcription`.  
- [ ] Upgrade `openai` NPM package to `^4.24.0` (first version with `gpt-4o-transcribe`) and run `pnpm i`.
- [ ] Install `ws@^8` (server WebSocket) and `uuid` (for connection IDs).
- [ ] Verify `OPENAI_API_KEY` has the `tts.transcriptions` scope.

### 11.2 Backend – WebSocket Transcription Gateway
1. **Route skeleton**  
   - [ ] Create `app/api/transcribe/live/route.ts`.  
   - [ ] Use the **Pages-Router edge → Node** workaround: `export const config = { runtime: "nodejs" }`.
2. **Connection lifecycle**  
   - [ ] On upgrade, authenticate user via Supabase cookie (`getServerSession`).  
   - [ ] Generate `connectionId = uuid()` and log `user_id`, `document_id`, `connected_at` to `live_ws_connections` table (for analytics/debug).
3. **Streaming to OpenAI**  
   - [ ] Instantiate `openai.audio.transcriptions.create({ model:'gpt-4o-transcribe', stream:true, format:'text' })` and keep the returned `stream` handle.  
   - [ ] For each binary WS message (raw 16-kHz PCM) → `stream.write(chunk)`.
4. **Fan-out partials to client**  
   - [ ] `stream.on('transcript', ({ text, is_final }) => ws.send(JSON.stringify({ type:'partial', text, isFinal:is_final })) )`.
5. **Close handshake**  
   - [ ] On client `{"type":"finish"}` or socket close, call `stream.end()` and `ws.close()`.
6. **Budget & metrics**  
   - [ ] Capture `totalAudioMs`, `promptTokens`, `completionTokens` from `stream.on('end')` and INSERT into `tool_calls` with tool `gpt-4o-transcribe`.

### 11.3 Client – Audio Capture & Streaming
1. **AudioWorklet node**  
   - [ ] Add `lib/audio/pcmWorklet.ts` (worklet processor) that receives 48-kHz float32 frames and down-samples to 16-kHz 16-bit-PCM Little-Endian, pushes to `port.postMessage`.
2. **Register worklet**  
   - [ ] In `useChatInteractions`, when mic starts:  
     ```ts
     await audioContext.audioWorklet.addModule('/lib/audio/pcmWorklet.js');
     const pcmNode = new AudioWorkletNode(audioContext,'pcm-worklet');
     source.connect(pcmNode);
     pcmNode.port.onmessage = ({ data }) => ws?.send(data); // data is ArrayBuffer
     ```
3. **WebSocket wrapper**  
   - [ ] Create `useWebSocket(url)` util (auto-reconnect disabled, binaryType = 'arraybuffer').  
   - [ ] Expose `send`, `close`, `readyState`.
4. **Hook refactor**  
   - [ ] Split current audio logic: keep waveform & silence detection pieces; replace `MediaRecorder` sections with Worklet + WS.  
   - [ ] Maintain `partialText` state via `ws.onmessage` (type === 'partial').  
   - [ ] Reset silence timer whenever `partial.isFinal === false` text arrives.
5. **Silence detector**  
   - [ ] Reuse existing RMS analyser; when `silent ≥2000 ms` call `ws.send(JSON.stringify({type:'finish'}))` and stop capture.

### 11.4 UI Updates
- [ ] In `ChatInputUI`, while `isLive` is true, inject `partialText` inside the textarea (ghost placeholder style—light gray until confirmed).
- [ ] Change mic tooltip to **"Live record (GPT-4o)"** and add small `alpha` badge until GA.

### 11.5 Testing Matrix
| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome 124 | ✅ | ✅ Android 15 | 
| Safari 17 | – | ✅ iOS 17 | 
| Firefox 126 | ✅ | n/a |

Run the following scripted tests:
1. 3-second utterance, ensure partials appear ≤300 ms.  
2. Wait silent 2 s → auto-submit; verify exact text matches OpenAI final.
3. Noise background; ensure silence detector not triggered prematurely.
4. Network drop mid-stream → client shows toast & falls back to typing mode.

### 11.6 Roll-out
- [ ] FF flag `liveTranscription` default **off** in production.  
- [ ] Enable for internal team → beta testers → 10 % traffic → 100 %.

---
*After completing all tasks, remove sections 11.1–11.6 from this document and move the checked items to the release notes.* 