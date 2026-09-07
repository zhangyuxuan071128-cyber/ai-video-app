import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = join(projectRoot, "release");
const output = join(releaseDir, "ai-video-app-cloudstudio.zip");

mkdirSync(releaseDir, { recursive: true });
rmSync(output, { force: true });

const excludes = [
  "node_modules/*",
  "dist/*",
  "release/*",
  ".git/*",
  ".npm-cache/*",
  ".pnpm-store/*",
  "coverage/*",
  "server/control-plane/data/*",
  ".runtime/*",
  ".env",
  ".env.*",
  ".impeccable/review/*",
  "src/assets/arcane-valley.png",
  "*.log",
  ".DS_Store",
];

const result = spawnSync("zip", ["-q", "-r", output, ".", "-x", ...excludes], {
  cwd: projectRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  throw new Error(`Cloud Studio package failed with exit code ${result.status ?? "unknown"}`);
}

if (existsSync(join(projectRoot, ".env.example"))) {
  const exampleResult = spawnSync("zip", ["-q", output, ".env.example"], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (exampleResult.status !== 0) {
    throw new Error(`Adding .env.example failed with exit code ${exampleResult.status ?? "unknown"}`);
  }
}

console.log(output);
