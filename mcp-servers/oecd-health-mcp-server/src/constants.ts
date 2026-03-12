/**
 * OECD Health Statistics API constants
 *
 * Base URLs, dataflow IDs, OECD country codes, indicator mappings,
 * rate limits, and response constraints for the OECD SDMX REST API.
 */

// ── Base URL ────────────────────────────────────────────────

export const OECD_SDMX_BASE_URL = "https://sdmx.oecd.org/public/rest";

/** User-Agent header for all requests */
export const USER_AGENT = "Protoprism-OECD-MCP/1.0 (research@protoprism.ai)";

// ── Agency ──────────────────────────────────────────────────

/** OECD Health Division agency ID used in SDMX queries */
export const HEALTH_AGENCY = "OECD.ELS.HD";

// ── Rate limits ─────────────────────────────────────────────

/** Minimum interval between requests in ms (500ms = respectful rate) */
export const MIN_REQUEST_INTERVAL_MS = 500;

// ── Response constraints ────────────────────────────────────

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25000;

// ── Dataflow IDs ────────────────────────────────────────────

/**
 * OECD Health dataflow identifiers.
 * Used to construct SDMX data query paths.
 */
export const DATAFLOWS = {
  /** Health Expenditure - System of Health Accounts */
  SHA: "SHA",
  /** Health Status (life expectancy, mortality, morbidity) */
  HEALTH_STAT: "HEALTH_STAT",
  /** Health Resources (beds, workforce, equipment) */
  HEALTH_REAC: "HEALTH_REAC",
  /** Health Care Activities (consultations, hospital discharges) */
  HEALTH_PROC: "HEALTH_PROC",
  /** Pharmaceutical Market */
  HEALTH_PHMC: "HEALTH_PHMC",
  /** Health Workforce */
  HEALTH_WFRC: "HEALTH_WFRC",
} as const;

// ── OECD Member Country Codes (ISO 3166-1 alpha-3) ─────────

export const OECD_COUNTRIES: Record<string, string> = {
  AUS: "Australia",
  AUT: "Austria",
  BEL: "Belgium",
  CAN: "Canada",
  CHL: "Chile",
  COL: "Colombia",
  CRI: "Costa Rica",
  CZE: "Czech Republic",
  DNK: "Denmark",
  EST: "Estonia",
  FIN: "Finland",
  FRA: "France",
  DEU: "Germany",
  GRC: "Greece",
  HUN: "Hungary",
  ISL: "Iceland",
  IRL: "Ireland",
  ISR: "Israel",
  ITA: "Italy",
  JPN: "Japan",
  KOR: "Korea",
  LVA: "Latvia",
  LTU: "Lithuania",
  LUX: "Luxembourg",
  MEX: "Mexico",
  NLD: "Netherlands",
  NZL: "New Zealand",
  NOR: "Norway",
  POL: "Poland",
  PRT: "Portugal",
  SVK: "Slovak Republic",
  SVN: "Slovenia",
  ESP: "Spain",
  SWE: "Sweden",
  CHE: "Switzerland",
  TUR: "Turkiye",
  GBR: "United Kingdom",
  USA: "United States",
  OECD: "OECD Average",
};

/** Valid country codes for validation */
export const VALID_COUNTRY_CODES = Object.keys(OECD_COUNTRIES);

// ── Indicator Categories ────────────────────────────────────

export type IndicatorCategory =
  | "expenditure"
  | "status"
  | "resources"
  | "workforce"
  | "pharma";

// ── Health Expenditure Indicators (SHA dataflow) ────────────

export interface IndicatorDefinition {
  id: string;
  name: string;
  description: string;
  unit: string;
  category: IndicatorCategory;
  dataflow: string;
  /** SDMX dimension filter key fragments for building the query */
  dimensionFilter: string;
}

export const HEALTH_EXPENDITURE_INDICATORS: IndicatorDefinition[] = [
  {
    id: "health_exp_per_capita",
    name: "Health expenditure per capita",
    description:
      "Total current health expenditure per capita in USD PPP (purchasing power parity)",
    unit: "USD PPP per capita",
    category: "expenditure",
    dataflow: DATAFLOWS.SHA,
    dimensionFilter: "HCTOT.HPTOT.HFTOT.PPP_CAP",
  },
  {
    id: "health_exp_gdp_share",
    name: "Health expenditure as % of GDP",
    description:
      "Total current health expenditure as a percentage of gross domestic product",
    unit: "% of GDP",
    category: "expenditure",
    dataflow: DATAFLOWS.SHA,
    dimensionFilter: "HCTOT.HPTOT.HFTOT.GDP",
  },
  {
    id: "govt_health_exp_share",
    name: "Government health expenditure share",
    description:
      "Government/compulsory health expenditure as a share of total current health expenditure",
    unit: "% of current health expenditure",
    category: "expenditure",
    dataflow: DATAFLOWS.SHA,
    dimensionFilter: "HCTOT.HPTOT.HFPUBLIC.CURTOT",
  },
  {
    id: "oop_health_exp_share",
    name: "Out-of-pocket health expenditure share",
    description:
      "Household out-of-pocket payments as a share of total current health expenditure",
    unit: "% of current health expenditure",
    category: "expenditure",
    dataflow: DATAFLOWS.SHA,
    dimensionFilter: "HCTOT.HPTOT.HF31.CURTOT",
  },
  {
    id: "pharma_exp_per_capita",
    name: "Pharmaceutical expenditure per capita",
    description: "Expenditure on pharmaceuticals and other medical non-durables per capita in USD PPP",
    unit: "USD PPP per capita",
    category: "expenditure",
    dataflow: DATAFLOWS.SHA,
    dimensionFilter: "HC51.HPTOT.HFTOT.PPP_CAP",
  },
];

// ── Health Status Indicators (HEALTH_STAT dataflow) ─────────

export const HEALTH_STATUS_INDICATORS: IndicatorDefinition[] = [
  {
    id: "life_exp_birth",
    name: "Life expectancy at birth",
    description: "Life expectancy at birth, total population (years)",
    unit: "Years",
    category: "status",
    dataflow: DATAFLOWS.HEALTH_STAT,
    dimensionFilter: "LIFEXPTB",
  },
  {
    id: "life_exp_65",
    name: "Life expectancy at age 65",
    description: "Life expectancy at age 65, total population (years)",
    unit: "Years",
    category: "status",
    dataflow: DATAFLOWS.HEALTH_STAT,
    dimensionFilter: "LIFEXP65",
  },
  {
    id: "infant_mortality",
    name: "Infant mortality rate",
    description: "Deaths of infants under one year per 1,000 live births",
    unit: "Per 1,000 live births",
    category: "status",
    dataflow: DATAFLOWS.HEALTH_STAT,
    dimensionFilter: "INFANTMORT",
  },
  {
    id: "avoidable_mortality",
    name: "Avoidable mortality",
    description:
      "Avoidable mortality (preventable and treatable) per 100,000 population (age-standardized)",
    unit: "Per 100,000 population",
    category: "status",
    dataflow: DATAFLOWS.HEALTH_STAT,
    dimensionFilter: "AVOIDMRT",
  },
  {
    id: "obesity_rate",
    name: "Obesity rate (measured)",
    description:
      "Percentage of adult population with BMI >= 30 (measured data where available)",
    unit: "% of adult population",
    category: "status",
    dataflow: DATAFLOWS.HEALTH_STAT,
    dimensionFilter: "OBESMEAS",
  },
  {
    id: "diabetes_prevalence",
    name: "Diabetes prevalence",
    description: "Prevalence of diabetes among adults aged 20-79 (%)",
    unit: "% of adults aged 20-79",
    category: "status",
    dataflow: DATAFLOWS.HEALTH_STAT,
    dimensionFilter: "DIABPREV",
  },
  {
    id: "suicide_rate",
    name: "Suicide rate",
    description: "Suicide mortality rate per 100,000 population (age-standardized)",
    unit: "Per 100,000 population",
    category: "status",
    dataflow: DATAFLOWS.HEALTH_STAT,
    dimensionFilter: "SUICMRT",
  },
];

// ── Health Resources Indicators (HEALTH_REAC dataflow) ──────

export const HEALTH_RESOURCES_INDICATORS: IndicatorDefinition[] = [
  {
    id: "hospital_beds",
    name: "Hospital beds",
    description: "Total hospital beds per 1,000 population",
    unit: "Per 1,000 population",
    category: "resources",
    dataflow: DATAFLOWS.HEALTH_REAC,
    dimensionFilter: "HOPITBED",
  },
  {
    id: "physicians",
    name: "Practising physicians",
    description: "Practising physicians (doctors) per 1,000 population",
    unit: "Per 1,000 population",
    category: "resources",
    dataflow: DATAFLOWS.HEALTH_REAC,
    dimensionFilter: "PHYS",
  },
  {
    id: "nurses",
    name: "Practising nurses",
    description: "Practising nurses per 1,000 population",
    unit: "Per 1,000 population",
    category: "resources",
    dataflow: DATAFLOWS.HEALTH_REAC,
    dimensionFilter: "NURSE",
  },
  {
    id: "ct_scanners",
    name: "CT scanners",
    description: "Computed tomography (CT) scanners per million population",
    unit: "Per million population",
    category: "resources",
    dataflow: DATAFLOWS.HEALTH_REAC,
    dimensionFilter: "CTSCAN",
  },
  {
    id: "mri_scanners",
    name: "MRI scanners",
    description: "Magnetic resonance imaging (MRI) units per million population",
    unit: "Per million population",
    category: "resources",
    dataflow: DATAFLOWS.HEALTH_REAC,
    dimensionFilter: "MRIUNIT",
  },
  {
    id: "curative_beds",
    name: "Curative (acute) care beds",
    description: "Curative (acute) care beds per 1,000 population",
    unit: "Per 1,000 population",
    category: "resources",
    dataflow: DATAFLOWS.HEALTH_REAC,
    dimensionFilter: "CURBED",
  },
];

// ── Health Workforce Indicators (HEALTH_WFRC dataflow) ──────

export const HEALTH_WORKFORCE_INDICATORS: IndicatorDefinition[] = [
  {
    id: "physicians_graduates",
    name: "Medical graduates",
    description: "Medical graduates per 100,000 population",
    unit: "Per 100,000 population",
    category: "workforce",
    dataflow: DATAFLOWS.HEALTH_WFRC,
    dimensionFilter: "PHYSGRAD",
  },
  {
    id: "nursing_graduates",
    name: "Nursing graduates",
    description: "Nursing graduates per 100,000 population",
    unit: "Per 100,000 population",
    category: "workforce",
    dataflow: DATAFLOWS.HEALTH_WFRC,
    dimensionFilter: "NURSGRAD",
  },
  {
    id: "dentists",
    name: "Practising dentists",
    description: "Practising dentists per 1,000 population",
    unit: "Per 1,000 population",
    category: "workforce",
    dataflow: DATAFLOWS.HEALTH_WFRC,
    dimensionFilter: "DENTIST",
  },
  {
    id: "pharmacists",
    name: "Practising pharmacists",
    description: "Practising pharmacists per 1,000 population",
    unit: "Per 1,000 population",
    category: "workforce",
    dataflow: DATAFLOWS.HEALTH_WFRC,
    dimensionFilter: "PHARMA",
  },
];

// ── Pharmaceutical Market Indicators (HEALTH_PHMC dataflow) ─

export const PHARMA_INDICATORS: IndicatorDefinition[] = [
  {
    id: "pharma_sales_per_capita",
    name: "Pharmaceutical sales per capita",
    description: "Total pharmaceutical sales at ex-factory prices per capita in USD PPP",
    unit: "USD PPP per capita",
    category: "pharma",
    dataflow: DATAFLOWS.HEALTH_PHMC,
    dimensionFilter: "PHARMSALE",
  },
  {
    id: "generic_market_share",
    name: "Generic market share (volume)",
    description: "Share of generics in the total pharmaceutical market by volume",
    unit: "% of total volume",
    category: "pharma",
    dataflow: DATAFLOWS.HEALTH_PHMC,
    dimensionFilter: "GENERVOL",
  },
];

// ── Combined indicator catalog ──────────────────────────────

export const ALL_INDICATORS: IndicatorDefinition[] = [
  ...HEALTH_EXPENDITURE_INDICATORS,
  ...HEALTH_STATUS_INDICATORS,
  ...HEALTH_RESOURCES_INDICATORS,
  ...HEALTH_WORKFORCE_INDICATORS,
  ...PHARMA_INDICATORS,
];

/** Quick lookup map from indicator ID to definition */
export const INDICATOR_MAP: Record<string, IndicatorDefinition> = {};
for (const ind of ALL_INDICATORS) {
  INDICATOR_MAP[ind.id] = ind;
}

/** All valid indicator IDs for Zod enum validation */
export const VALID_INDICATOR_IDS = ALL_INDICATORS.map((i) => i.id);

/** Valid category names */
export const VALID_CATEGORIES: IndicatorCategory[] = [
  "expenditure",
  "status",
  "resources",
  "workforce",
  "pharma",
];
