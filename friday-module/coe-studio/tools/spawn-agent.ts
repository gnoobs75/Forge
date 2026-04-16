export function spawnAgent() {
  return {
    name: 'spawn_agent',
    description: 'Request Forge to spawn an agent terminal session with a specific task instruction. Sends a forge:command via WebSocket — Forge will ask the boss for confirmation before executing.',
    parameters: [
      { name: 'agent', type: 'string' as const, required: true, description: 'Agent slug (e.g., qa-advisor, market-analyst, store-optimizer)' },
      { name: 'project', type: 'string' as const, required: true, description: 'Project slug (expedition, ttr-ios, ttr-roblox)' },
      { name: 'instruction', type: 'string' as const, required: true, description: 'Task instruction for the agent' },
    ],
    clearance: ['exec-shell', 'write-fs'] as const,
    async execute(args: { agent: string; project: string; instruction: string }, context: any) {
      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (context?.ws?.send) {
        context.ws.send(JSON.stringify({
          type: 'forge:command',
          commandId,
          command: 'spawn-agent',
          args: {
            agent: args.agent,
            project: args.project,
            instruction: args.instruction,
          },
          confirmRequired: true,
        }));
      }

      return {
        success: true,
        output: `Requested agent spawn: ${args.agent} on ${args.project}. Awaiting boss confirmation (commandId: ${commandId}).`,
      };
    },
  };
}
