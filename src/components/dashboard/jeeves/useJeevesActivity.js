// useJeevesActivity — drives the Jeeves nav tab indicator.
//   glowing    — mirrors stewardStatus.pool.running. Steady gradient sweep
//                while Jeeves is mid-task (rare to catch in heartbeat
//                snapshots; the pulse is the dominant signal).
//   pulseToken — increments once per heartbeat snapshot whenever the
//                newest action's task_id differs from the previously
//                observed one. Identity-based (not length-based) so the
//                pulse still fires under FIFO churn at the heartbeat cap.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store/useStore';

export function useJeevesActivity() {
  const running = useStore((s) => Boolean(s.stewardStatus?.pool?.running));
  const newestId = useStore((s) => s.stewardStatus?.recentActions?.[0]?.task_id ?? null);

  const seenIdRef = useRef(undefined);
  const [pulseToken, setPulseToken] = useState(0);

  useEffect(() => {
    if (newestId == null) {
      seenIdRef.current = newestId;
      return;
    }
    if (seenIdRef.current === undefined) {
      seenIdRef.current = newestId;
      return;
    }
    if (seenIdRef.current !== newestId) {
      seenIdRef.current = newestId;
      setPulseToken((n) => n + 1);
    }
  }, [newestId]);

  return { glowing: running, pulseToken };
}
