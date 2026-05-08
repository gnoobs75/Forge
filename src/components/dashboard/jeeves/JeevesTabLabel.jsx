// JeevesTabLabel — wraps the breadcrumb's Jeeves <NavButton> children with
// a gradient-glow span (when Jeeves is mid-task) and a halo pulse span
// (each time a new action lands). Both visual states are driven by the
// useJeevesActivity hook reading from stewardStatus.
import React from 'react';
import { useJeevesActivity } from './useJeevesActivity';
import './jeeves.css';

const LABEL_TEXT = '\u{1FAB6} Jeeves';

export default function JeevesTabLabel() {
  const { glowing, pulseToken } = useJeevesActivity();
  return (
    <span className="jeeves-tab-wrap">
      {pulseToken > 0 && (
        <span key={pulseToken} className="jeeves-pulse" aria-hidden="true" />
      )}
      <span className={glowing ? 'jeeves-glow' : undefined}>{LABEL_TEXT}</span>
    </span>
  );
}
