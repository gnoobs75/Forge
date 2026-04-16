import type { FridayModule } from "../types.ts";
import { queryStudio } from "./query-studio.ts";
import { updateStudio } from "./update-studio.ts";
import { dispatchAgent } from "./dispatch-agent.ts";

const studioModule: FridayModule = {
  name: "studio",
  description: "Forge studio integration — query HQ data, create recommendations, dispatch agents",
  version: "1.0.0",
  tools: [queryStudio, updateStudio, dispatchAgent],
  protocols: [],
  knowledge: [],
  triggers: [],
  clearance: ["read-fs", "write-fs", "exec-shell"],
  async onLoad() {
    console.log("[Studio] Module loaded — 3 tools registered");
  },
};

export default studioModule;
