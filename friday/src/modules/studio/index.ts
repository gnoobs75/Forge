import type { FridayModule } from "../types.ts";
import { queryStudio } from "./query-studio.ts";
import { updateStudio } from "./update-studio.ts";
import { dispatchAgent } from "./dispatch-agent.ts";
import {
  nightshiftDryRunTool,
  nightshiftRunTool,
  nightshiftAbortTool,
  nightshiftAbortStatusTool,
} from "./nightshift-foreman.ts";
import { nightshiftMorningSummaryTool } from "./nightshift-morning-summary.ts";

const studioModule: FridayModule = {
  name: "studio",
  description: "Forge studio integration — query HQ data, create recommendations, dispatch agents, run Night Shift",
  version: "1.3.0",
  tools: [
    queryStudio,
    updateStudio,
    dispatchAgent,
    nightshiftDryRunTool,
    nightshiftRunTool,
    nightshiftAbortTool,
    nightshiftAbortStatusTool,
    nightshiftMorningSummaryTool,
  ],
  protocols: [],
  knowledge: [],
  triggers: [],
  clearance: ["read-fs", "write-fs", "exec-shell"],
  async onLoad() {
    console.log("[Studio] Module loaded — 8 tools registered (including Night Shift foreman + abort controls + morning summary)");
  },
};

export default studioModule;
