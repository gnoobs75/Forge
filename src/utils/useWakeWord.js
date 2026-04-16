import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * useWakeWord — voice-activated mic detection.
 *
 * Monitors mic energy levels. When sustained speech is detected,
 * triggers the onWake callback to start the voice session.
 * Uses local audio processing only — no cloud dependency.
 *
 * The actual "wake word" filtering happens naturally through Grok's
 * conversation — if the user says "Baroness, what's the status?",
 * Grok processes the full utterance. The energy detection just
 * prevents the mic from being always-hot.
 */
export default function useWakeWord({ wakeWords = [], enabled = false, onWake, onStatusChange }) {
  const [listening, setListening] = useState(false);
  const enabledRef = useRef(enabled);
  const onWakeRef = useRef(onWake);
  const suppressedRef = useRef(false);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const frameIdRef = useRef(null);
  const cooldownRef = useRef(false);
  const startCaptureRef = useRef(null);

  enabledRef.current = enabled;
  onWakeRef.current = onWake;

  const suppress = useCallback((val) => {
    suppressedRef.current = val;
    // When unsuppressed and enabled, restart capture
    if (!val && enabledRef.current && !streamRef.current) {
      console.log('[WakeWord] Unsuppressed — restarting capture');
      // Small delay to let the voice session mic fully release
      setTimeout(() => {
        if (!suppressedRef.current && enabledRef.current && !streamRef.current) {
          startCaptureRef.current?.();
        }
      }, 500);
    }
  }, []);

  function stopCapture() {
    if (frameIdRef.current) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch {}
      ctxRef.current = null;
    }
    analyserRef.current = null;
  }

  const startCapture = useCallback(async () => {
    if (streamRef.current) return;

    console.log('[WakeWord] Starting voice activity detection');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Float32Array(analyser.fftSize);

      // Speech detection state
      let speechFrames = 0;
      const SPEECH_THRESHOLD = 0.02; // RMS level that counts as speech
      const FRAMES_TO_ACTIVATE = 6;  // ~6 frames (~200ms) of sustained speech to trigger

      function monitor() {
        if (!enabledRef.current) {
          frameIdRef.current = requestAnimationFrame(monitor);
          return;
        }

        analyser.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / dataArray.length);

        if (suppressedRef.current || cooldownRef.current) {
          speechFrames = 0;
          frameIdRef.current = requestAnimationFrame(monitor);
          return;
        }

        if (rms > SPEECH_THRESHOLD) {
          speechFrames++;
          if (speechFrames >= FRAMES_TO_ACTIVATE) {
            console.log(`[WakeWord] Voice activity detected (rms=${rms.toFixed(4)}, frames=${speechFrames}) — activating!`);
            speechFrames = 0;
            suppressedRef.current = true;
            cooldownRef.current = true;
            setTimeout(() => { cooldownRef.current = false; }, 3000);
            // Release our mic BEFORE triggering voice session to avoid conflict
            stopCapture();
            setListening(false);
            onWakeRef.current?.();
            return; // stop the animation loop
          }
        } else {
          speechFrames = Math.max(0, speechFrames - 1);
        }

        frameIdRef.current = requestAnimationFrame(monitor);
      }

      frameIdRef.current = requestAnimationFrame(monitor);
      setListening(true);
      onStatusChange?.('Listening for voice');
      console.log('[WakeWord] Voice activity monitor active');

    } catch (err) {
      console.error('[WakeWord] Failed to capture mic:', err);
      onStatusChange?.('Mic error');
    }
  }, [onStatusChange]);

  startCaptureRef.current = startCapture;

  useEffect(() => {
    console.log(`[WakeWord] Effect: enabled=${enabled}`);
    if (enabled && !suppressedRef.current) {
      startCapture();
    }
    if (!enabled) {
      stopCapture();
      setListening(false);
    }
    return () => {
      stopCapture();
      setListening(false);
    };
  }, [enabled, startCapture]);

  return { listening, suppress };
}
