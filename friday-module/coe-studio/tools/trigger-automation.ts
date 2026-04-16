export function triggerAutomation() {
  return {
    name: 'trigger_automation',
    description: 'Request Forge to fire an existing automation schedule immediately',
    parameters: [
      { name: 'automationId', type: 'string' as const, required: true, description: 'Automation schedule ID' },
    ],
    clearance: ['exec-shell'] as const,
    async execute(args: { automationId: string }, context: any) {
      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (context?.ws?.send) {
        context.ws.send(JSON.stringify({
          type: 'forge:command',
          commandId,
          command: 'trigger-automation',
          args: { automationId: args.automationId },
          confirmRequired: true,
        }));
      }

      return {
        success: true,
        output: `Requested automation trigger: ${args.automationId}. Awaiting confirmation.`,
      };
    },
  };
}
