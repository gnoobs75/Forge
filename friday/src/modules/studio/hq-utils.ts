import * as fs from "node:fs";
import * as path from "node:path";
import { hqData } from "../../config/paths.ts";

export function findHqDir(): string | null {
  try {
    if (fs.existsSync(path.join(hqData, "projects"))) return hqData;
  } catch {}
  return null;
}

export function readJsonSafe(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return null; }
}

export function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

export function getProjectSlugs(hqDir: string): string[] {
  const projectsDir = path.join(hqDir, "projects");
  try {
    return fs.readdirSync(projectsDir)
      .filter((d) => {
        try { return fs.statSync(path.join(projectsDir, d)).isDirectory(); }
        catch { return false; }
      })
      .filter((d) => d !== "forge");
  } catch { return []; }
}
