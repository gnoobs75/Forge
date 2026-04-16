import React, { useState, useCallback } from 'react';
import SettingControl, { SettingsCard, Toast } from './SettingControl';

const SENSOR_DEFAULTS = {
  fastPollInterval: 30,
  slowPollInterval: 300,
  cpuHighThreshold: 85,
  memoryHighThreshold: 80,
  memoryCriticalThreshold: 95,
};

const RHYTHM_DEFAULTS = {
  tickInterval: 60,
  maxConsecutiveFailures: 5,
  toolTimeout: 30,
  protocolTimeout: 30,
  promptTimeout: 300,
};

export default function SensorsTab() {
  const [sensorConfig, setSensorConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('forge-friday-sensorium');
      return saved ? { ...SENSOR_DEFAULTS, ...JSON.parse(saved) } : { ...SENSOR_DEFAULTS };
    } catch { return { ...SENSOR_DEFAULTS }; }
  });
  const [rhythmConfig, setRhythmConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('forge-friday-rhythm');
      return saved ? { ...RHYTHM_DEFAULTS, ...JSON.parse(saved) } : { ...RHYTHM_DEFAULTS };
    } catch { return { ...RHYTHM_DEFAULTS }; }
  });
  const [sensorDirty, setSensorDirty] = useState(false);
  const [rhythmDirty, setRhythmDirty] = useState(false);
  const [toast, setToast] = useState(null);

  const updateSensor = useCallback((key, value) => {
    setSensorConfig(prev => ({ ...prev, [key]: value }));
    setSensorDirty(true);
  }, []);
  const updateRhythm = useCallback((key, value) => {
    setRhythmConfig(prev => ({ ...prev, [key]: value }));
    setRhythmDirty(true);
  }, []);

  const saveSensorium = useCallback(() => {
    localStorage.setItem('forge-friday-sensorium', JSON.stringify(sensorConfig));
    window.electronAPI?.friday?.send({
      type: 'config:update', id: crypto.randomUUID(),
      section: 'sensorium', config: sensorConfig,
    });
    setSensorDirty(false);
    setToast('Sensorium settings saved');
  }, [sensorConfig]);

  const saveRhythm = useCallback(() => {
    localStorage.setItem('forge-friday-rhythm', JSON.stringify(rhythmConfig));
    window.electronAPI?.friday?.send({
      type: 'config:update', id: crypto.randomUUID(),
      section: 'arc-rhythm', config: rhythmConfig,
    });
    setRhythmDirty(false);
    setToast('Arc Rhythm settings saved');
  }, [rhythmConfig]);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* How It Works */}
      <div className="rounded-xl border border-green-500/15 bg-green-500/5 p-4">
        <h4 className="text-[13px] font-mono font-semibold text-green-400 uppercase tracking-wider mb-2">
          How Friday's Senses Work
        </h4>
        <p className="text-[13px] text-forge-text-secondary leading-relaxed">
          The <strong className="text-green-300">Sensorium</strong> is Friday's awareness of the physical machine
          she's running on. Like JARVIS monitoring the suit's systems, she continuously checks CPU usage, RAM,
          disk space, Docker containers, open network ports, and git status. She injects a snapshot of this data
          into every conversation, so she always knows the current state of the system.
        </p>
        <p className="text-[13px] text-forge-text-secondary leading-relaxed mt-2">
          The <strong className="text-green-300">Arc Rhythm</strong> is Friday's heartbeat — a 60-second scheduler
          that fires cron-based tasks. Think of it as her calendar. She checks every minute: "Is anything due?"
          If so, she runs it (a tool, a protocol command, or sends a prompt to herself). If a task fails 5 times
          in a row, she auto-pauses it to prevent spam.
        </p>
      </div>

      {/* Sensorium */}
      <SettingsCard
        title="Sensorium — System Sensors"
        icon="&#x1F4E1;"
        description="How often Friday checks the machine's vital signs and when she alerts you."
        onSave={saveSensorium}
        onReset={() => { setSensorConfig({ ...SENSOR_DEFAULTS }); setSensorDirty(true); }}
        dirty={sensorDirty}
      >
        <SettingControl
          label="Fast Poll Interval"
          value={sensorConfig.fastPollInterval}
          onChange={(v) => updateSensor('fastPollInterval', v)}
          type="number"
          min={5} max={120} step={5}
          suffix="sec"
          help="How frequently CPU, memory, and git status are checked. Default 30s."
          barneyHelp="How often Friday glances at the dashboard gauges. Every 30 seconds she checks: How's the CPU? How much RAM is left? Any new git changes? Lower = more responsive alerts but slightly more CPU overhead from the checking itself."
        />
        <SettingControl
          label="Slow Poll Interval"
          value={sensorConfig.slowPollInterval}
          onChange={(v) => updateSensor('slowPollInterval', v)}
          type="number"
          min={30} max={1800} step={30}
          suffix="sec"
          help="How frequently Docker containers, open ports, and disk space are checked. Default 300s (5 min)."
          barneyHelp="How often Friday does a deep system scan. This checks slower-changing things like Docker containers, open network ports, and disk space. Every 5 minutes is fine — these things don't change every second. Set longer if you want less overhead."
        />
        <SettingControl
          label="CPU Alert Threshold"
          value={sensorConfig.cpuHighThreshold}
          onChange={(v) => updateSensor('cpuHighThreshold', v)}
          type="range"
          min={50} max={100} step={5}
          suffix="%"
          help="CPU usage above this triggers a high alert. Uses hysteresis (must stay high for 2 consecutive polls)."
          barneyHelp="When CPU usage stays above this level for two consecutive checks, Friday will alert you. She uses 'hysteresis' — meaning the CPU has to stay high, not just spike briefly. This prevents false alarms from momentary spikes during builds or tests."
        />
        <SettingControl
          label="Memory Warning"
          value={sensorConfig.memoryHighThreshold}
          onChange={(v) => updateSensor('memoryHighThreshold', v)}
          type="range"
          min={50} max={100} step={5}
          suffix="%"
          help="RAM usage above this triggers a warning-level notification."
          barneyHelp="When RAM usage crosses this percentage, Friday gives you a heads-up. It's a yellow warning, not red — just letting you know things are getting crowded. Good to know before your build starts swapping to disk."
        />
        <SettingControl
          label="Memory Critical"
          value={sensorConfig.memoryCriticalThreshold}
          onChange={(v) => updateSensor('memoryCriticalThreshold', v)}
          type="range"
          min={80} max={100} step={1}
          suffix="%"
          help="RAM usage above this triggers a critical alert."
          barneyHelp="Red alert territory. When RAM hits this level, Friday will definitely tell you — loudly if voice is on. At 95%, the OS is probably already struggling. This is your 'close Chrome tabs now' warning."
        />
      </SettingsCard>

      {/* Arc Rhythm */}
      <SettingsCard
        title="Arc Rhythm — Heartbeat Scheduler"
        icon="&#x1F4AB;"
        description="The 60-second cron ticker that fires scheduled tasks."
        onSave={saveRhythm}
        onReset={() => { setRhythmConfig({ ...RHYTHM_DEFAULTS }); setRhythmDirty(true); }}
        dirty={rhythmDirty}
      >
        <SettingControl
          label="Tick Interval"
          value={rhythmConfig.tickInterval}
          onChange={(v) => updateRhythm('tickInterval', v)}
          type="number"
          min={10} max={300} step={5}
          suffix="sec"
          help="DEFAULT_TICK_INTERVAL — how often the scheduler checks for due tasks."
          barneyHelp="How often Friday's heartbeat ticks. Every 60 seconds she checks: 'Is any scheduled task overdue?' If yes, she runs it. Lower = tasks fire closer to their exact scheduled time. Higher = less CPU overhead but tasks might run up to N seconds late."
        />
        <SettingControl
          label="Max Consecutive Failures"
          value={rhythmConfig.maxConsecutiveFailures}
          onChange={(v) => updateRhythm('maxConsecutiveFailures', v)}
          type="number"
          min={1} max={20} step={1}
          help="MAX_CONSECUTIVE_FAILURES — auto-pause a task after this many failures in a row."
          barneyHelp="If a scheduled task fails this many times in a row, Friday auto-pauses it and emits a signal. This prevents a broken task from spamming errors every 60 seconds forever. You can manually re-enable it once you fix the underlying issue."
        />
        <SettingControl
          label="Tool Action Timeout"
          value={rhythmConfig.toolTimeout}
          onChange={(v) => updateRhythm('toolTimeout', v)}
          type="number"
          min={5} max={300} step={5}
          suffix="sec"
          help="ACTION_TIMEOUTS.tool — max time for tool-type scheduled actions."
          barneyHelp="When the scheduler fires a tool action (like checking a file or running a command), how long before it times out. 30 seconds is generous for most tool calls."
        />
        <SettingControl
          label="Protocol Action Timeout"
          value={rhythmConfig.protocolTimeout}
          onChange={(v) => updateRhythm('protocolTimeout', v)}
          type="number"
          min={5} max={300} step={5}
          suffix="sec"
          help="ACTION_TIMEOUTS.protocol — max time for protocol-type (/command) scheduled actions."
          barneyHelp="When the scheduler fires a protocol command (like /env status or /smart list), how long before it times out. Same as tools — 30 seconds is usually plenty."
        />
        <SettingControl
          label="Prompt Action Timeout"
          value={rhythmConfig.promptTimeout}
          onChange={(v) => updateRhythm('promptTimeout', v)}
          type="number"
          min={30} max={600} step={30}
          suffix="sec"
          help="ACTION_TIMEOUTS.prompt — max time for prompt-type scheduled actions (AI inference)."
          barneyHelp="When the scheduler fires a prompt action (sends a question to Friday's brain), how long to wait for a response. This goes through the full LLM pipeline — reasoning, tool calls, the works. 5 minutes is generous but some complex prompts with multiple tool calls need it."
        />
      </SettingsCard>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
