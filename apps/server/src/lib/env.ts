import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

function findWorkspaceRoot(startDir: string): string | null {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

const root = findWorkspaceRoot(process.cwd()) ?? process.cwd();
dotenv.config({ path: path.join(root, ".env") });
