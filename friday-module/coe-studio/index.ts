import type { FridayModule } from '../../src/types/module';
import { studioProjects } from './tools/studio-projects';
import { readFeatures } from './tools/read-features';
import { readRecommendations } from './tools/read-recommendations';
import { readActivityLog } from './tools/read-activity-log';
import { readProgress } from './tools/read-progress';
import { readContext } from './tools/read-context';
import { studioOverview } from './tools/studio-overview';
import { spawnAgent } from './tools/spawn-agent';
import { queueTask } from './tools/queue-task';
import { postActivity } from './tools/post-activity';
import { triggerAutomation } from './tools/trigger-automation';
import { seedKnowledge } from './knowledge/seeds';

// Resolve hq-data using the Forge paths helper. Falls back to env override
// (set by Electron) or auto-detected fresh/legacy layout.
import { hqData as HQ_DATA } from '../../friday/src/config/paths.ts';

const coeStudio: FridayModule = {
  name: 'forge-studio',
  description: 'Forge studio awareness — read project data, features, recommendations, and activity across all games',
  version: '1.0.0',

  tools: [
    studioProjects(HQ_DATA),
    readFeatures(HQ_DATA),
    readRecommendations(HQ_DATA),
    readActivityLog(HQ_DATA),
    readProgress(HQ_DATA),
    readContext(HQ_DATA),
    studioOverview(HQ_DATA),
    // Phase 3 command tools
    spawnAgent(),
    queueTask(),
    postActivity(),
    triggerAutomation(),
  ],

  protocols: [],
  knowledge: [],
  clearance: ['read-fs'],

  async onLoad(context) {
    console.log(`[forge-studio] Module loaded. HQ_DATA=${HQ_DATA}`);

    // Check symlink health
    const fs = await import('fs');
    if (!fs.existsSync(HQ_DATA)) {
      console.warn(`[forge-studio] WARNING: HQ_DATA path not found: ${HQ_DATA}`);
      console.warn('[forge-studio] Set FORGE_HQ_DATA env var or run: npm run friday:setup');
    }

    // Seed SMARTS with studio knowledge on first load
    await seedKnowledge(context, HQ_DATA);
  },

  async onUnload() {
    console.log('[forge-studio] Module unloaded.');
  },
};

export default coeStudio;
