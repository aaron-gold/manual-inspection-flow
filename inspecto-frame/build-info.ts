import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Values for Vite `define` so the client bundle always knows which package semver and git
 * revision it was built from. Computed when the dev server starts or when `vite build` runs.
 */
export function resolveAppEnvDefine(projectRoot: string): Record<string, string> {
  const pkgPath = path.join(projectRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

  const fromCi =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.GITHUB_SHA?.slice(0, 7) ||
    process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ||
    "";

  let shortSha = fromCi;
  if (!shortSha) {
    try {
      shortSha = execSync("git rev-parse --short HEAD", {
        encoding: "utf-8",
        cwd: projectRoot,
      }).trim();
    } catch {
      shortSha = "unknown";
    }
  }

  let dirty = false;
  if (!fromCi) {
    try {
      dirty =
        execSync("git status --porcelain", { encoding: "utf-8", cwd: projectRoot }).trim().length > 0;
    } catch {
      dirty = false;
    }
  }

  return {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    "import.meta.env.VITE_APP_GIT_SHA": JSON.stringify(shortSha),
    "import.meta.env.VITE_APP_GIT_DIRTY": JSON.stringify(dirty ? "1" : ""),
  };
}
