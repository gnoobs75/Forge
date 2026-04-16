import React, { useState, useMemo } from 'react';
import DraggableTabBar from './DraggableTabBar';
import ArchitectureTab from './friday/persona/ArchitectureTab';
import BrainTab from './friday/persona/BrainTab';
import KnowledgeTab from './friday/persona/KnowledgeTab';
import MemoryTab from './friday/persona/MemoryTab';
import SensorsTab from './friday/persona/SensorsTab';
import VoiceTab from './friday/persona/VoiceTab';
import { useStore } from '../../store/useStore';

const PERSONA_TABS = [
  { id: 'architecture', label: 'Architecture', icon: '\u{1F3D7}' },
  { id: 'brain', label: 'Brain', icon: '\u{1F9E0}' },
  { id: 'knowledge', label: 'Knowledge', icon: '\u{1F4A1}' },
  { id: 'memory', label: 'Memory', icon: '\u{1F4BE}' },
  { id: 'sensors', label: 'Sensors', icon: '\u{1F4E1}' },
  { id: 'voice', label: 'Voice', icon: '\u{1F3A4}' },
];

const TAB_COMPONENTS = {
  architecture: ArchitectureTab,
  brain: BrainTab,
  knowledge: KnowledgeTab,
  memory: MemoryTab,
  sensors: SensorsTab,
  voice: VoiceTab,
};

export default function FridayPersona() {
  const activePersona = useStore(s => s.activePersona);
  const theme = useMemo(() => activePersona.theme || {
    primary: '#D946EF', secondary: '#7E22CE', accent: '#F0ABFC',
  }, [activePersona.theme]);
  const [activeTab, setActiveTab] = useState('architecture');
  const TabContent = TAB_COMPONENTS[activeTab];

  return (
    <div className="h-full flex flex-col" style={{
      '--persona-primary': theme.primary,
      '--persona-secondary': theme.secondary,
      '--persona-accent': theme.accent,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-forge-border bg-forge-surface/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${theme.accent}, ${theme.primary}, ${theme.secondary})`,
              boxShadow: `0 0 12px ${theme.primary}60`,
            }}
          >
            {activePersona.symbol || 'F'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              {activePersona.name !== 'F.R.I.D.A.Y.' ? (
                <h2 className="text-sm font-bold text-forge-text-primary flex items-center gap-2">
                  <span className="font-mono line-through opacity-40 text-forge-text-muted">F.R.I.D.A.Y.</span>
                  <span style={{
                    fontFamily: '"Permanent Marker", "Marker Felt", "Reenie Beanie", cursive',
                    color: theme.primary,
                    fontSize: '1rem',
                    transform: 'rotate(-2deg)',
                    display: 'inline-block',
                    textShadow: `1px 1px 0 ${theme.primary}40`,
                    letterSpacing: '0.05em',
                  }}>{activePersona.name}</span>
                </h2>
              ) : (
                <h2 className="text-sm font-mono font-bold text-forge-text-primary">
                  F.R.I.D.A.Y. Persona
                </h2>
              )}
            </div>
            <p className="text-[13px] text-forge-text-muted">
              Configuration &middot; Subsystems &middot; Knowledge &middot; Voice
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-forge-text-muted font-mono">
            6 subsystems &middot; 40+ settings
          </span>
        </div>
      </div>

      {/* Tab navigation */}
      <DraggableTabBar
        tabs={PERSONA_TABS}
        activeTab={activeTab}
        onTabClick={setActiveTab}
        storageKey="friday-persona"
      />

      {/* Tab content */}
      <div className="flex-1 min-h-0 animate-fade-in" key={activeTab}>
        {TabContent && <TabContent />}
      </div>
    </div>
  );
}
