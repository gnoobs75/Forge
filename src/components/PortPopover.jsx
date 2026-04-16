import React, { useEffect, useRef, useMemo } from 'react';

const STATUS_COLORS = {
  up: '#22c55e',
  down: '#ef4444',
  occupied: '#eab308',
};

const STATUS_LABELS = {
  up: null,
  down: 'DOWN',
  occupied: 'UNKNOWN',
};

export default function PortPopover({ portHealth, appId, onClose }) {
  const ref = useRef(null);
  const health = portHealth?.health || [];
  const collisions = portHealth?.collisions || [];

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const infra = health.filter(h => h.app === appId && !h.project);
    const projects = health.filter(h => h.app === appId && h.project);
    const otherApps = health.filter(h => h.app && h.app !== appId);
    const occupied = health.filter(h => h.status === 'occupied');
    return { infra, projects, otherApps, occupied };
  }, [health, appId]);

  const handleRefresh = () => {
    if (window.electronAPI?.ports) {
      window.electronAPI.ports.refresh();
    }
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-7 right-4 z-50"
      style={{
        background: '#1a1a24',
        border: '1px solid #2a3a5c',
        borderRadius: 10,
        padding: 16,
        width: 280,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ color: '#9ca3af', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, fontWeight: 600 }}>
        Service Ports
      </div>

      {/* Infrastructure */}
      {groups.infra.length > 0 && (
        <PortGroup label="Infrastructure" items={groups.infra} />
      )}

      {/* Projects */}
      {groups.projects.length > 0 && (
        <PortGroup label="Projects" items={groups.projects} showProject />
      )}

      {/* Other Apps */}
      {groups.otherApps.length > 0 && (
        <PortGroup label="Other Apps" items={groups.otherApps} dimmed />
      )}

      {/* Occupied / Unknown */}
      {groups.occupied.length > 0 && (
        <PortGroup label="Unregistered" items={groups.occupied} />
      )}

      {/* Collision Warnings */}
      {collisions.length > 0 && (
        <div style={{
          background: '#eab30815',
          border: '1px solid #eab30833',
          borderRadius: 6,
          padding: 8,
          marginTop: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#eab308' }} />
            <span style={{ color: '#eab308', fontSize: 10, fontWeight: 600 }}>Collision Warning</span>
          </div>
          {collisions.map((c) => (
            <div key={c.port} style={{ color: '#9ca3af', fontSize: 9, lineHeight: 1.4, marginTop: 2 }}>
              Port <span style={{ color: '#eab308' }}>:{c.port}</span> claimed by{' '}
              {c.claimedBy.map((r, i) => (
                <span key={i}>
                  {i > 0 && ' and '}
                  <span style={{ color: '#e5e7eb' }}>{r.project || r.service}</span>
                  {r.app && <span style={{ color: '#4b5563' }}> ({r.app})</span>}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* No ports */}
      {health.length === 0 && (
        <div style={{ color: '#4b5563', fontSize: 10, textAlign: 'center', padding: '12px 0' }}>
          No ports registered yet
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #2a3a5c',
        marginTop: 12,
        paddingTop: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#4b5563', fontSize: 9 }}>Polling every 15s</span>
        <button
          onClick={handleRefresh}
          style={{
            color: '#4b5563', fontSize: 9, cursor: 'pointer',
            background: 'none', border: 'none', fontFamily: 'inherit',
          }}
          className="hover:text-forge-text-secondary"
        >
          ⟲ Refresh
        </button>
      </div>
    </div>
  );
}

function PortGroup({ label, items, dimmed, showProject }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        color: '#6b7280', fontSize: 8, textTransform: 'uppercase',
        letterSpacing: 1, marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item) => (
          <div key={`${item.app}-${item.port}`} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            opacity: dimmed ? 0.5 : 1,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: dimmed ? '#6b7280' : STATUS_COLORS[item.status],
                boxShadow: dimmed ? 'none' : `0 0 4px ${STATUS_COLORS[item.status]}55`,
              }} />
              <span style={{ color: dimmed ? '#9ca3af' : '#e5e7eb' }}>
                {showProject ? item.project : item.service}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {STATUS_LABELS[item.status] && !dimmed && (
                <span style={{ color: STATUS_COLORS[item.status], fontSize: 9 }}>
                  {STATUS_LABELS[item.status]}
                </span>
              )}
              <span style={{ color: '#4b5563' }}>:{item.port}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
