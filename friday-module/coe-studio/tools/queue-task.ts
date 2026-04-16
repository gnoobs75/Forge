export function queueTask() {
  return {
    name: 'queue_task',
    description: 'Queue a multi-agent task for orchestrated execution. All writes go through Forge (single writer). Supports parallel, sequential, and conditional strategies.',
    parameters: [
      { name: 'project', type: 'string' as const, required: true, description: 'Project slug' },
      { name: 'agents', type: 'string' as const, required: true, description: 'JSON array of {agent, instruction} objects' },
      { name: 'strategy', type: 'string' as const, required: false, description: 'Execution strategy: parallel (default), sequential, conditional' },
    ],
    clearance: ['write-fs'] as const,
    async execute(args: { project: string; agents: string; strategy?: string }, context: any) {
      let agentList;
      try {
        agentList = JSON.parse(args.agents);
      } catch {
        return { success: false, output: 'Invalid agents JSON. Expected: [{"agent":"slug","instruction":"..."}]' };
      }

      const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const taskId = `task-${Date.now()}`;

      if (context?.ws?.send) {
        context.ws.send(JSON.stringify({
          type: 'forge:command',
          commandId,
          command: 'queue-task',
          args: {
            taskId,
            project: args.project,
            agents: agentList,
            strategy: args.strategy || 'parallel',
          },
          confirmRequired: true,
        }));
      }

      return {
        success: true,
        output: `Queued multi-agent task (${taskId}): ${agentList.length} agents on ${args.project} (${args.strategy || 'parallel'}). Awaiting confirmation.`,
      };
    },
  };
}
