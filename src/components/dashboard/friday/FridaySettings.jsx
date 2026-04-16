import { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';

export default function FridaySettings() {
  const fridayEnabled = useStore(s => s.fridayEnabled);
  const fridayServerUrl = useStore(s => s.fridayServerUrl);
  const fridayStatus = useStore(s => s.fridayStatus);
  const setFridayEnabled = useStore(s => s.setFridayEnabled);
  const setFridayServerUrl = useStore(s => s.setFridayServerUrl);
  const connectFriday = useStore(s => s.connectFriday);
  const disconnectFriday = useStore(s => s.disconnectFriday);

  const [urlInput, setUrlInput] = useState(fridayServerUrl);
  const [xaiKeyInput, setXaiKeyInput] = useState('');
  const [xaiKeyStatus, setXaiKeyStatus] = useState('unknown');

  useEffect(() => {
    window.electronAPI?.secrets?.getStatus?.().then(status => {
      setXaiKeyStatus(status?.friday?.connected ? 'connected' : 'not-set');
    });
  }, []);

  const handleUrlSave = () => {
    console.log(`[Friday Settings] URL saved: ${urlInput}`);
    setFridayServerUrl(urlInput);
    // URL change takes effect on next server restart — no manual reconnect needed
  };

  const handleXaiKeySave = async () => {
    if (!xaiKeyInput.trim()) return;
    await window.electronAPI?.secrets?.set('friday', { apiKey: xaiKeyInput.trim() });
    setXaiKeyInput('');
    setXaiKeyStatus('connected');
  };

  const statusColor = {
    connected: '#22C55E',
    connecting: '#EAB308',
    reconnecting: '#F97316',
    disconnected: '#6B7280',
  }[fridayStatus] || '#6B7280';

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-forge-text-primary">Enable Friday</div>
          <div className="text-[10px] text-forge-text-muted">Connect to Friday server for Studio Director features</div>
        </div>
        <button
          onClick={() => {
            const next = !fridayEnabled;
            setFridayEnabled(next);
            // disconnect is now handled inside setFridayEnabled
          }}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            fridayEnabled ? 'bg-fuchsia-500' : 'bg-forge-border'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
              fridayEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
        <span className="text-forge-text-secondary">{fridayStatus}</span>
      </div>

      {/* Server URL */}
      <div>
        <label className="text-[10px] text-forge-text-muted block mb-1">Server URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="flex-1 bg-forge-bg border border-forge-border rounded px-2 py-1
                       text-xs text-forge-text-primary"
          />
          <button
            onClick={handleUrlSave}
            className="px-2 py-1 text-[10px] border border-forge-border rounded
                       text-forge-text-muted hover:text-forge-accent transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* xAI API Key */}
      <div>
        <label className="text-[10px] text-forge-text-muted block mb-1">
          xAI API Key (Grok voice)
          <span className="ml-2" style={{ color: xaiKeyStatus === 'connected' ? '#22C55E' : '#6B7280' }}>
            {xaiKeyStatus === 'connected' ? '● Connected' : '○ Not set'}
          </span>
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={xaiKeyInput}
            onChange={(e) => setXaiKeyInput(e.target.value)}
            placeholder={xaiKeyStatus === 'connected' ? '••••••••' : 'xai-...'}
            className="flex-1 bg-forge-bg border border-forge-border rounded px-2 py-1
                       text-xs text-forge-text-primary"
          />
          <button
            onClick={handleXaiKeySave}
            disabled={!xaiKeyInput.trim()}
            className="px-2 py-1 text-[10px] border border-forge-border rounded
                       text-forge-text-muted hover:text-forge-accent transition-colors
                       disabled:opacity-30"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
