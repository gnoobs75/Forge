import React, { useState, useEffect } from 'react';

const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to The Forge',
    description: 'Your game studio operating system. 13 AI-powered agents are ready to help you ship your games. Click through to learn the interface, or dismiss to explore on your own.',
  },
  {
    id: 'terminal',
    title: 'Agent Terminal',
    description: 'The left pane is where you talk to your team. In Electron mode, it connects to Claude Code. Type @SolutionsArchitect, @BackendEngineer, or any agent name to start a conversation.',
  },
  {
    id: 'projects',
    title: 'Your Games',
    description: 'Each card shows a game\'s progress, current phase, and platform. Click any card to enter its War Room for deep analysis.',
  },
  {
    id: 'pipeline',
    title: 'Phase Pipeline',
    description: 'Your games move through 7 phases: Concept through Live Ops. Click a phase to move a game forward. Agents auto-adjust their focus based on where each game is.',
  },
  {
    id: 'recommendations',
    title: 'Agent Recommendations',
    description: 'When agents analyze your games, their recommendations appear as expandable cards. Each shows multiple approaches with trade-offs — click to expand and see the full analysis.',
  },
  {
    id: 'council',
    title: 'Your Team',
    description: '13 specialists: Market Analyst, Store Optimizer, Studio Producer, Creative Thinker, Art Director, Tech Architect, and more. Click any agent to see their personality, expertise, and example commands.',
  },
  {
    id: 'quick-start',
    title: 'Ready to Go!',
    description: 'Try these commands in the terminal:',
    commands: [
      { agent: '@MarketAnalyst', prompt: 'analyze competitors for Expedition' },
      { agent: '@StoreOptimizer', prompt: "draft TTR's App Store listing" },
      { agent: '@CreativeThinker', prompt: 'what wild features could make TTR viral?' },
      { agent: '@StudioProducer', prompt: 'what should I focus on this week?' },
    ],
  },
];

const STORAGE_KEY = 'forge-tutorial-complete';

export default function GuidedTutorial() {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Skip tutorial in Electron mode — user is already set up
    if (window.electronAPI) {
      setDismissed(true);
      return;
    }
    const isComplete = localStorage.getItem(STORAGE_KEY);
    if (!isComplete) {
      setTimeout(() => setVisible(true), 800);
    } else {
      setDismissed(true);
    }
  }, []);

  const step = TUTORIAL_STEPS[currentStep];
  const isLast = currentStep === TUTORIAL_STEPS.length - 1;
  const isFirst = currentStep === 0;

  const handleNext = () => {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
    setDismissed(true);
  };

  const handleRestart = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentStep(0);
    setVisible(true);
    setDismissed(false);
  };

  if (!visible && dismissed) {
    return null;
  }

  if (!visible) return null;

  // Non-blocking floating card in the bottom-right corner
  return (
    <div className="fixed bottom-8 right-4 z-50 w-[380px] animate-slide-up">
      <div className="bg-forge-surface border border-forge-border rounded-xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-forge-bg">
          <div
            className="h-full bg-forge-accent transition-all duration-300"
            style={{ width: `${((currentStep + 1) / TUTORIAL_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Step counter + dismiss */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider">
              Step {currentStep + 1} of {TUTORIAL_STEPS.length}
            </span>
            <button
              onClick={handleComplete}
              className="text-[10px] text-forge-text-muted hover:text-forge-text-secondary transition-colors"
            >
              Dismiss
            </button>
          </div>

          {/* Title */}
          <h2 className="text-sm font-mono font-bold text-forge-text-primary mb-2">
            {step.title}
          </h2>

          {/* Description */}
          <div className="text-xs text-forge-text-secondary leading-relaxed">
            {step.description}
          </div>

          {/* Commands (quick-start step) */}
          {step.commands && (
            <div className="mt-3 p-2.5 rounded-lg bg-forge-bg font-mono text-[11px] space-y-1">
              {step.commands.map((cmd, i) => (
                <div key={i}>
                  <span className="text-forge-accent">{cmd.agent}</span>{' '}
                  <span className="text-forge-text-secondary">{cmd.prompt}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-forge-border bg-forge-bg/30">
          <button
            onClick={handlePrev}
            disabled={isFirst}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              isFirst
                ? 'text-forge-text-muted cursor-not-allowed'
                : 'text-forge-text-secondary hover:text-forge-text-primary hover:bg-forge-surface'
            }`}
          >
            Back
          </button>

          <div className="flex items-center gap-1">
            {TUTORIAL_STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === currentStep ? 'bg-forge-accent' :
                  i < currentStep ? 'bg-forge-accent/40' :
                  'bg-forge-border'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="btn-primary text-[11px] px-3 py-1.5"
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
