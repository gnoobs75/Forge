import React, { useState } from 'react';
import { playSound } from '../../utils/sounds';

const HQ_ROOT = 'C:\\Claude\\Samurai\\hq-data';

/**
 * File path display + copy buttons for a recommendation card.
 * Shows: file path (click to copy) | folder icon (open Explorer) | @Agent copy | claude CLI copy
 */
export default function RecFileActions({ rec }) {
  const [copied, setCopied] = useState(null); // 'path' | 'agent' | 'cli' | null

  const filePath = rec._filePath;
  if (!filePath) return null;

  const fullPath = `${HQ_ROOT}\\${filePath.replace(/\//g, '\\')}`;
  const displayPath = filePath; // relative path for display

  const flash = (key) => {
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    playSound('copy');
    flash(key);
  };

  const handlePathClick = (e) => {
    e.stopPropagation();
    copyToClipboard(fullPath, 'path');
  };

  const handleOpenFolder = (e) => {
    e.stopPropagation();
    if (window.electronAPI?.hq?.showInFolder) {
      window.electronAPI.hq.showInFolder(filePath);
    } else {
      copyToClipboard(fullPath, 'path');
    }
  };

  // Build @Agent command
  const agentInvoke = `@${rec.agent.replace(/\s+/g, '')}`;
  const agentCmd = `${agentInvoke} implement ${rec.title.toLowerCase()} for ${rec.project}`;

  // Build claude CLI command
  const cliCmd = `claude "Read ${fullPath.replace(/\\/g, '/')} and implement the recommended approach. Explore the codebase first."`;

  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {/* File path — click to copy */}
      <button
        onClick={handlePathClick}
        className="text-[11px] font-mono text-forge-text-muted/70 hover:text-forge-accent-blue transition-colors truncate max-w-[300px]"
        title={`Click to copy: ${fullPath}`}
      >
        {copied === 'path' ? (
          <span className="text-green-400">Copied!</span>
        ) : (
          displayPath
        )}
      </button>

      {/* Open in Explorer icon */}
      <button
        onClick={handleOpenFolder}
        className="text-xs text-forge-text-muted/60 hover:text-forge-accent-blue transition-colors flex-shrink-0"
        title="Open in Explorer"
      >
        {'\uD83D\uDCC2'}
      </button>

      <span className="text-forge-border text-[10px]">|</span>

      {/* Copy @Agent command */}
      <button
        onClick={(e) => { e.stopPropagation(); copyToClipboard(agentCmd, 'agent'); }}
        className="text-[11px] font-mono px-2 py-0.5 rounded border transition-colors flex-shrink-0
                   border-forge-border/50 text-forge-text-muted/80 hover:text-forge-accent hover:border-forge-accent/30"
        title={`Copy: ${agentCmd}`}
      >
        {copied === 'agent' ? (
          <span className="text-green-400">Copied!</span>
        ) : (
          <>{agentInvoke}</>
        )}
      </button>

      {/* Copy claude CLI command */}
      <button
        onClick={(e) => { e.stopPropagation(); copyToClipboard(cliCmd, 'cli'); }}
        className="text-[11px] font-mono px-2 py-0.5 rounded border transition-colors flex-shrink-0
                   border-forge-border/50 text-forge-text-muted/80 hover:text-cyan-400 hover:border-cyan-400/30"
        title={`Copy: ${cliCmd}`}
      >
        {copied === 'cli' ? (
          <span className="text-green-400">Copied!</span>
        ) : (
          <>claude</>
        )}
      </button>
    </div>
  );
}
