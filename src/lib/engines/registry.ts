import type { EngineManifest } from "./types";
import { commandCenterManifest } from "./command-center";

const ALL_ENGINES: EngineManifest[] = [
  commandCenterManifest,
  {
    id: "ma",
    name: "M&A Engine",
    shortName: "M&A",
    description: "Mergers & acquisitions intelligence — deal flow, valuation, due diligence",
    icon: "TrendingUp",
    accentColor: "#8b5cf6",
    accentColorName: "violet",
    status: "coming-soon",
    order: 1,
    route: "/engines/ma",
    isDefault: false,
  },
  {
    id: "finance",
    name: "Finance Engine",
    shortName: "Finance",
    description: "Financial analysis — modeling, forecasting, market intelligence",
    icon: "DollarSign",
    accentColor: "#10b981",
    accentColorName: "emerald",
    status: "coming-soon",
    order: 2,
    route: "/engines/finance",
    isDefault: false,
  },
  {
    id: "regulatory",
    name: "Regulatory Engine",
    shortName: "Reg",
    description: "Regulatory & legislative tracking — compliance, policy analysis",
    icon: "Shield",
    accentColor: "#f59e0b",
    accentColorName: "amber",
    status: "coming-soon",
    order: 3,
    route: "/engines/regulatory",
    isDefault: false,
  },
  {
    id: "sales",
    name: "Sales Performance",
    shortName: "Sales",
    description: "Sales intelligence — pipeline, territory, competitive positioning",
    icon: "BarChart3",
    accentColor: "#ec4899",
    accentColorName: "pink",
    status: "coming-soon",
    order: 4,
    route: "/engines/sales",
    isDefault: false,
  },
  {
    id: "product",
    name: "Product Engine",
    shortName: "Product",
    description: "Product intelligence — market fit, feature analysis, competitive landscape",
    icon: "Layers",
    accentColor: "#3b82f6",
    accentColorName: "blue",
    status: "coming-soon",
    order: 5,
    route: "/engines/product",
    isDefault: false,
  },
].sort((a, b) => a.order - b.order);

export function getEngineRegistry(): EngineManifest[] {
  return ALL_ENGINES;
}

export function getEngineById(id: string): EngineManifest | undefined {
  return ALL_ENGINES.find((e) => e.id === id);
}

export function getDefaultEngine(): EngineManifest {
  const def = ALL_ENGINES.find((e) => e.isDefault);
  if (!def) throw new Error("No default engine registered");
  return def;
}

export function getActiveEngines(): EngineManifest[] {
  return ALL_ENGINES.filter((e) => e.status !== "hidden");
}
