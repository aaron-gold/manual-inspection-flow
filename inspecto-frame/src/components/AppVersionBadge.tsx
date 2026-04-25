import { getAppBuildLabel, getAppBuildTooltip } from "@/buildInfo";

export function AppVersionBadge() {
  return (
    <div
      className="pointer-events-none fixed top-2 left-2 z-[100] select-none text-[10px] leading-tight text-muted-foreground/80 tabular-nums"
      title={getAppBuildTooltip()}
      aria-label={getAppBuildTooltip()}
    >
      {getAppBuildLabel()}
    </div>
  );
}
