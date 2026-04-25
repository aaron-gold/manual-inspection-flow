/** Human-readable build identity (semver from package.json + short git SHA). */
export function getAppBuildLabel(): string {
  const version = import.meta.env.VITE_APP_VERSION;
  const sha = import.meta.env.VITE_APP_GIT_SHA;
  const dirty = import.meta.env.VITE_APP_GIT_DIRTY === "1";
  const star = dirty ? "*" : "";
  return `v${version} · ${sha}${star}`;
}

export function getAppBuildTooltip(): string {
  const version = import.meta.env.VITE_APP_VERSION;
  const sha = import.meta.env.VITE_APP_GIT_SHA;
  const dirty = import.meta.env.VITE_APP_GIT_DIRTY === "1";
  const dirtyNote = dirty ? " Uncommitted local changes (dev)." : "";
  return `Inspecto build: package ${version}, git ${sha}.${dirtyNote}`;
}
