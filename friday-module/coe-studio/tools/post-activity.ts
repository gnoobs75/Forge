export function postActivity() {
  return {
    name: 'post_activity',
    description: 'Log a Friday action to the studio activity log. Sends via WebSocket to Forge (single writer pattern).',
    parameters: [
      { name: 'action', type: 'string' as const, required: true, description: 'Description of the action' },
      { name: 'project', type: 'string' as const, required: false, description: 'Project name (if relevant)' },
    ],
    clearance: ['write-fs'] as const,
    async execute(args: { action: string; project?: string }, context: any) {
      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (context?.ws?.send) {
        context.ws.send(JSON.stringify({
          type: 'forge:command',
          commandId,
          command: 'post-activity',
          args: {
            agent: 'Friday',
            agentColor: '#D946EF',
            action: args.action,
            project: args.project || '',
          },
          confirmRequired: false,
        }));
      }

      return { success: true, output: `Logged activity: ${args.action}` };
    },
  };
}
