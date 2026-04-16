import { playSound } from '../../../utils/sounds';

const AGENT_NAMES = {
  'market-analyst': 'Market Analyst',
  'store-optimizer': 'Store Optimizer',
  'growth-strategist': 'Growth Strategist',
  'brand-director': 'Brand Director',
  'content-producer': 'Content Producer',
  'community-manager': 'Community Manager',
  'qa-advisor': 'QA Advisor',
  'studio-producer': 'Studio Producer',
  'monetization': 'Monetization Strategist',
  'player-psych': 'Player Psychologist',
  'art-director': 'Art Director',
  'creative-thinker': 'Creative Thinker',
  'tech-architect': 'Tech Architect',
  'hr-director': 'HR Director',
};

export default function ConfirmDialog({ command, onRespond }) {
  const handleApprove = () => {
    playSound('click');
    onRespond(command.commandId, true);
  };

  const handleDeny = () => {
    playSound('dismiss');
    onRespond(command.commandId, false);
  };

  const renderDescription = () => {
    switch (command.command) {
      case 'spawn-agent':
        return (
          <span>
            Spawn <strong style={{ color: '#D946EF' }}>{AGENT_NAMES[command.args.agent] || command.args.agent}</strong> to
            work on <strong>{command.args.project}</strong>: &ldquo;{command.args.instruction}&rdquo;
          </span>
        );
      case 'queue-task':
        return (
          <span>
            Run {command.args.agents?.length || '?'} agents on <strong>{command.args.project}</strong> ({command.args.strategy || 'parallel'})
          </span>
        );
      case 'trigger-automation':
        return <span>Fire automation: <strong>{command.args.automationId}</strong></span>;
      default:
        return <span>{command.command}: {JSON.stringify(command.args)}</span>;
    }
  };

  return (
    <div className="mx-3 my-2 p-3 rounded-lg border border-orange-500/20 bg-orange-500/5 animate-fade-in">
      <div className="text-[10px] text-orange-400 font-semibold mb-1.5">
        FRIDAY — Confirm Action
      </div>
      <div className="text-[11px] text-forge-text-primary leading-relaxed mb-3">
        {renderDescription()}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          className="px-3 py-1.5 text-[10px] rounded border border-green-500/30 text-green-400
                     hover:bg-green-500/10 transition-colors"
        >
          Do it
        </button>
        <button
          onClick={handleDeny}
          className="px-3 py-1.5 text-[10px] rounded border border-forge-border text-forge-text-muted
                     hover:text-red-400 hover:border-red-500/30 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
