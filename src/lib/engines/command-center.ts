import type { EngineManifest } from "./types";

export const commandCenterManifest: EngineManifest = {
  id: "command-center",
  name: "Command Center",
  shortName: "Home",
  description: "Strategic intelligence command center — multi-agent analysis pipeline",
  icon: "Hexagon",
  accentColor: "#06b6d4",
  accentColorName: "cyan",
  status: "active",
  order: 0,
  route: "/",
  isDefault: true,
};
