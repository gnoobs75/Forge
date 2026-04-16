// Mic capture → PCM 16-bit 24kHz → IPC → Friday → Grok
// Audio response → IPC → Web Audio API playback

let mediaStream = null;
let audioContext = null;
let scriptProcessor = null;

export async function startMicCapture() {
  if (mediaStream) {
    console.log('[Friday Audio] Mic already capturing — skipping');
    return;
  }

  console.log('[Friday Audio] Requesting mic access...');
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
    console.log('[Friday Audio] Mic access granted — tracks:', mediaStream.getAudioTracks().map(t => t.label).join(', '));
  } catch (err) {
    console.error('[Friday Audio] Mic access denied:', err.message);
    throw err;
  }

  // Use system's native sample rate — forcing 24000 causes silence on some Windows systems
  audioContext = new AudioContext();
  console.log(`[Friday Audio] AudioContext created (sampleRate=${audioContext.sampleRate}, state=${audioContext.state})`);

  // Tell the main process what rate we're capturing at so it can inform Friday
  window.__fridayAudioSampleRate = audioContext.sampleRate;

  const source = audioContext.createMediaStreamSource(mediaStream);

  // ScriptProcessor for raw PCM access (deprecated but simple; replace with AudioWorklet if needed)
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  let chunkCount = 0;
  let micReady = false;

  scriptProcessor.onaudioprocess = (e) => {
    const float32 = e.inputBuffer.getChannelData(0);

    // Convert Float32 → Int16 PCM
    const int16 = new Int16Array(float32.length);
    let maxAmp = 0;
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      const abs = Math.abs(int16[i]);
      if (abs > maxAmp) maxAmp = abs;
    }

    // Send to main process
    window.electronAPI?.friday?.sendAudio?.(int16.buffer);
    chunkCount++;
    if (chunkCount <= 3 || chunkCount % 50 === 0) {
      console.log(`[Friday Audio] Mic chunk #${chunkCount}: maxAmp=${maxAmp}, bytes=${int16.buffer.byteLength}, rate=${audioContext.sampleRate}`);
    }

    // Calculate audio level for VoiceOrb animation
    let sum = 0;
    for (let i = 0; i < float32.length; i++) {
      sum += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sum / float32.length);
    const level = Math.min(1, rms * 5); // normalize to 0-1

    if (window.__fridayAudioLevelCallback) {
      window.__fridayAudioLevelCallback(level);
    }

    // Mic ready: fire once when autoGainControl has ramped up above noise floor
    if (!micReady && maxAmp > 100) {
      micReady = true;
      console.log(`[Friday Audio] Mic READY — gain stabilized (maxAmp=${maxAmp}, chunk #${chunkCount})`);
      if (window.__fridayMicReadyCallback) {
        window.__fridayMicReadyCallback();
      }
    }
  };

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
  console.log('[Friday Audio] Mic capture started — processing pipeline active');
}

export function stopMicCapture() {
  console.log('[Friday Audio] Stopping mic capture...');
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => {
      t.stop();
      console.log(`[Friday Audio] Track stopped: ${t.label}`);
    });
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  console.log('[Friday Audio] Mic capture stopped');
}

// Playback incoming audio from Friday
let playbackContext = null;
let playbackQueue = [];
let isPlaying = false;
let playbackChunkCount = 0;

export function initPlayback() {
  if (!playbackContext) {
    playbackContext = new AudioContext();
    console.log(`[Friday Audio] Playback context created (sampleRate=${playbackContext.sampleRate})`);
  }
}

export function queueAudioChunk(data) {
  initPlayback();

  // Electron IPC sends Buffers as Uint8Array — must reinterpret as Int16 via ArrayBuffer
  let rawBuffer;
  if (data instanceof ArrayBuffer) {
    rawBuffer = data;
  } else if (data.buffer) {
    // Uint8Array/Buffer — slice the underlying ArrayBuffer to get a proper view
    rawBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } else {
    console.warn('[Friday Audio] Unknown audio data type:', typeof data);
    return;
  }

  // Convert Int16 PCM → Float32
  const int16 = new Int16Array(rawBuffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
  }

  // Grok sends audio at the rate we configured (same as our mic capture rate)
  // The AudioContext will resample from source rate to its output rate if they differ
  const sourceRate = window.__fridayAudioSampleRate || 48000;
  const buffer = playbackContext.createBuffer(1, float32.length, sourceRate);
  buffer.getChannelData(0).set(float32);
  playbackQueue.push(buffer);
  playbackChunkCount++;

  if (playbackChunkCount % 50 === 1) {
    console.log(`[Friday Audio] Playback queue: chunk #${playbackChunkCount} (queue=${playbackQueue.length}, ${rawBuffer.byteLength} bytes, int16samples=${int16.length})`);
  }

  if (!isPlaying) playNext();
}

function playNext() {
  if (playbackQueue.length === 0) {
    if (isPlaying) {
      console.log(`[Friday Audio] Playback complete (${playbackChunkCount} chunks total)`);
    }
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const buffer = playbackQueue.shift();
  const source = playbackContext.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackContext.destination);
  source.onended = playNext;
  source.start();
}

export function setAudioLevelCallback(callback) {
  window.__fridayAudioLevelCallback = callback;
}

export function setMicReadyCallback(callback) {
  window.__fridayMicReadyCallback = callback;
}
