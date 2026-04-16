// Standalone Grok Realtime API voice test — bypasses all Forge plumbing
// Modes: 'text' (verify API), 'manual' (audio + commit + response.create), 'vad' (server VAD)
import WebSocket from 'ws';
import * as fs from 'fs';

const envFile = fs.readFileSync('./friday/.env', 'utf-8');
const apiKey = envFile.match(/XAI_API_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) { console.error('No XAI_API_KEY in friday/.env'); process.exit(1); }
console.log(`API key: ${apiKey.slice(0, 8)}...`);

const TEST_MODE = process.argv[2] || 'manual'; // 'text', 'manual', 'vad'
console.log(`\n=== TEST MODE: ${TEST_MODE} ===\n`);

const SAMPLE_RATE = 24000;
const ws = new WebSocket('wss://api.x.ai/v1/realtime', {
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
});

ws.on('open', () => {
  console.log('1. WebSocket connected');

  const turnDetection = TEST_MODE === 'vad'
    ? { type: 'server_vad' }  // basic config, no extra params
    : null; // manual mode or text mode

  const config = {
    type: 'session.update',
    session: {
      voice: 'Eve',
      instructions: 'Say hello briefly. Keep your response to one sentence.',
      turn_detection: turnDetection,
      input_audio_transcription: { model: 'whisper-1' },
      audio: {
        input: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } },
        output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } }
      }
    }
  };
  console.log('2. Sending session.update, turn_detection:', JSON.stringify(turnDetection));
  ws.send(JSON.stringify(config));
});

let eventCount = 0;
let audioOutChunks = 0;

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  eventCount++;

  if (msg.type === 'response.output_audio.delta') {
    audioOutChunks++;
    if (audioOutChunks % 10 === 1) {
      console.log(`   [audio out] chunk #${audioOutChunks} (${msg.delta?.length || 0} b64 chars)`);
    }
    return;
  }

  const preview = JSON.stringify(msg).slice(0, 300);
  console.log(`EVENT #${eventCount}: ${msg.type} — ${preview}`);

  if (msg.type === 'session.updated') {
    console.log('4. Session configured');
    if (TEST_MODE === 'text') {
      sendTextMessage();
    } else {
      sendSpeechLikeAudio();
    }
  }

  if (msg.type === 'input_audio_buffer.speech_started') {
    console.log('\n*** VAD TRIGGERED — SPEECH DETECTED ***\n');
  }
  if (msg.type === 'input_audio_buffer.speech_stopped') {
    console.log('\n*** VAD — SPEECH STOPPED ***\n');
  }
  if (msg.type === 'input_audio_buffer.committed') {
    console.log('\n*** AUDIO BUFFER COMMITTED ***\n');
  }
  if (msg.type === 'response.output_audio_transcript.done') {
    console.log(`\n*** FRIDAY SAID: "${msg.transcript}" ***\n`);
  }
  if (msg.type === 'conversation.item.input_audio_transcription.completed') {
    console.log(`\n*** TRANSCRIPTION: "${msg.transcript}" ***\n`);
  }
  if (msg.type === 'response.done') {
    console.log('\n*** RESPONSE COMPLETE ***');
    console.log(`Total audio out chunks: ${audioOutChunks}`);
    setTimeout(() => { ws.close(); process.exit(0); }, 2000);
  }
  if (msg.type === 'error') {
    console.error('ERROR:', JSON.stringify(msg, null, 2));
  }
});

ws.on('error', (err) => { console.error('WS Error:', err.message); });
ws.on('close', (code, reason) => { console.log(`WS Closed: code=${code} reason=${reason}`); });

function sendTextMessage() {
  console.log('5. Sending text message...');
  ws.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message', role: 'user',
      content: [{ type: 'input_text', text: 'Hello Friday! Say hello back briefly.' }]
    }
  }));
  ws.send(JSON.stringify({ type: 'response.create' }));
}

function sendSpeechLikeAudio() {
  // Generate formant-like audio that mimics vowel sounds
  const duration = 2.0;
  const totalSamples = Math.floor(SAMPLE_RATE * duration);
  const chunkSize = 2400; // 100ms chunks

  console.log(`5. Generating ${duration}s of speech-like audio at ${SAMPLE_RATE}Hz...`);

  let sent = 0;
  const sendChunk = () => {
    if (sent >= totalSamples) {
      console.log(`6. Sent all ${sent} samples (${(sent / SAMPLE_RATE).toFixed(1)}s)`);

      if (TEST_MODE === 'manual') {
        // Manual mode: commit buffer + request response
        console.log('7. Committing audio buffer...');
        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        // Small delay to let commit process
        setTimeout(() => {
          console.log('8. Requesting response with modalities...');
          ws.send(JSON.stringify({
            type: 'response.create',
            response: { modalities: ['text', 'audio'] }
          }));
        }, 500);
      } else {
        // VAD mode: send silence to trigger end
        sendSilence();
      }
      return;
    }

    const remaining = totalSamples - sent;
    const size = Math.min(chunkSize, remaining);
    const int16 = new Int16Array(size);

    for (let i = 0; i < size; i++) {
      const t = (sent + i) / SAMPLE_RATE;
      const f1 = Math.sin(2 * Math.PI * 500 * t) * 0.5;
      const f2 = Math.sin(2 * Math.PI * 1500 * t) * 0.3;
      const f3 = Math.sin(2 * Math.PI * 2500 * t) * 0.15;
      const noise = (Math.random() * 2 - 1) * 0.05;
      const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t);
      const sample = (f1 + f2 + f3 + noise) * envelope;
      int16[i] = Math.floor(Math.max(-1, Math.min(1, sample)) * 24000);
    }

    const b64 = Buffer.from(int16.buffer).toString('base64');
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
    sent += size;

    if (sent % (chunkSize * 10) === 0) {
      console.log(`   [audio in] sent ${sent}/${totalSamples} samples`);
    }
    setTimeout(sendChunk, (chunkSize / SAMPLE_RATE) * 1000);
  };
  sendChunk();
}

function sendSilence() {
  console.log('7. Sending 1.5s silence...');
  const silenceSamples = Math.floor(SAMPLE_RATE * 1.5);
  const chunkSize = 2400;
  let sent = 0;
  const sendChunk = () => {
    if (sent >= silenceSamples) {
      console.log('8. Done sending silence');
      return;
    }
    const size = Math.min(chunkSize, silenceSamples - sent);
    const int16 = new Int16Array(size);
    const b64 = Buffer.from(int16.buffer).toString('base64');
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
    sent += size;
    setTimeout(sendChunk, (chunkSize / SAMPLE_RATE) * 1000);
  };
  sendChunk();
}

setTimeout(() => {
  console.log(`\nTIMEOUT — ${eventCount} events, ${audioOutChunks} audio out chunks`);
  ws.close();
  process.exit(0);
}, 30000);
