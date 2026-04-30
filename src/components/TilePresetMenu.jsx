import React, { useState } from 'react';
import { useStore } from '../store/useStore';

export default function TilePresetMenu() {
  const tilePresets = useStore(s => s.tilePresets);
  const pinnedSlots = useStore(s => s.pinnedSlots);
  const savePreset = useStore(s => s.savePreset);
  const deletePreset = useStore(s => s.deletePreset);
  const applyPreset = useStore(s => s.applyPreset);

  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  const closeAll = () => {
    setMenuOpen(false);
    setSaveOpen(false);
    setManageOpen(false);
    setDraftName('');
  };

  const handleApply = (id) => {
    applyPreset(id);
    closeAll();
  };

  const handleSave = () => {
    const name = draftName.trim();
    if (!name) return;
    savePreset(name, pinnedSlots);
    closeAll();
  };

  const handleDelete = (id) => {
    deletePreset(id);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label="Open layouts menu"
        onClick={() => setMenuOpen(o => !o)}
        className="px-2 py-1 text-xs font-mono text-forge-text-muted hover:text-forge-text-secondary border border-forge-border/50 rounded hover:border-forge-border"
        title="Tile layout presets"
      >
        Layouts ▼
      </button>

      {menuOpen && !saveOpen && !manageOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-forge-bg border border-forge-border rounded shadow-lg text-xs font-mono">
          {tilePresets.length === 0 ? (
            <div className="px-3 py-2 text-forge-text-muted">No saved presets</div>
          ) : (
            tilePresets.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApply(p.id)}
                className="block w-full text-left px-3 py-1.5 hover:bg-forge-bg/60 text-forge-text-secondary"
              >
                <span className="mr-1">★</span>
                <span>{p.name}</span>
              </button>
            ))
          )}
          <div className="border-t border-forge-border/50" />
          <button
            type="button"
            onClick={() => { setSaveOpen(true); }}
            className="block w-full text-left px-3 py-1.5 hover:bg-forge-bg/60 text-forge-text-secondary"
          >
            + Save current as preset…
          </button>
          <button
            type="button"
            onClick={() => { setManageOpen(true); }}
            className="block w-full text-left px-3 py-1.5 hover:bg-forge-bg/60 text-forge-text-secondary"
          >
            ⚙ Manage presets…
          </button>
        </div>
      )}

      {saveOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[260px] bg-forge-bg border border-forge-border rounded shadow-lg p-3">
          <div className="text-xs text-forge-text-muted mb-2">Save current tile layout</div>
          <input
            type="text"
            placeholder="Preset name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-full px-2 py-1 text-xs font-mono bg-forge-bg-deep border border-forge-border/50 rounded text-forge-text-secondary"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={closeAll} className="px-2 py-1 text-xs text-forge-text-muted hover:text-forge-text-secondary">Cancel</button>
            <button type="button" onClick={handleSave} className="px-2 py-1 text-xs bg-[#e94560] text-white rounded">Save</button>
          </div>
        </div>
      )}

      {manageOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[260px] bg-forge-bg border border-forge-border rounded shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-forge-text-muted">Manage presets</span>
            <button type="button" onClick={closeAll} className="text-xs text-forge-text-muted hover:text-forge-text-secondary">Close</button>
          </div>
          {tilePresets.length === 0 ? (
            <div className="text-xs text-forge-text-muted">No presets to manage.</div>
          ) : (
            <ul className="space-y-1">
              {tilePresets.map(p => (
                <li key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-forge-text-secondary">{p.name}</span>
                  <button
                    type="button"
                    aria-label={`Delete preset ${p.name}`}
                    onClick={() => handleDelete(p.id)}
                    className="text-forge-text-muted hover:text-red-400"
                  >×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
