/**
 * Census Bureau API constants
 *
 * Base URL, dataset paths, FIPS codes, healthcare-relevant variable mappings,
 * and response constraints for the US Census Bureau public API.
 */

// ─── API Configuration ──────────────────────────────────────

export const CENSUS_BASE_URL = "https://api.census.gov/data";

export const CHARACTER_LIMIT = 25000;

// ─── Dataset Paths ──────────────────────────────────────────

export const DATASETS = {
  ACS5: "acs/acs5",
  ACS1: "acs/acs1",
  SAHIE: "timeseries/healthins/sahie",
} as const;

export type DatasetKey = keyof typeof DATASETS;

// ─── Server Metadata ────────────────────────────────────────

export const SERVER_NAME = "census-bureau-mcp-server";
export const SERVER_VERSION = "1.0.0";

// ─── FIPS State Codes ───────────────────────────────────────

export const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06",
  CO: "08", CT: "09", DE: "10", DC: "11", FL: "12",
  GA: "13", HI: "15", ID: "16", IL: "17", IN: "18",
  IA: "19", KS: "20", KY: "21", LA: "22", ME: "23",
  MD: "24", MA: "25", MI: "26", MN: "27", MS: "28",
  MO: "29", MT: "30", NE: "31", NV: "32", NH: "33",
  NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38",
  OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49",
  VT: "50", VA: "51", WA: "53", WV: "54", WI: "55",
  WY: "56", PR: "72",
};

export const FIPS_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FIPS).map(([abbr, fips]) => [fips, abbr])
);

// ─── Health Insurance Coverage (B27001) ─────────────────────
/**
 * Table B27001: Health Insurance Coverage Status by Age
 *
 * Universe: Civilian noninstitutionalized population
 * Key structure:
 *   _001E = Total
 *   _002E = Under 6 years
 *   _003E = Under 6, with coverage
 *   _004E = Under 6, no coverage
 *   ...etc by age bracket
 */
export const HEALTH_INSURANCE_VARIABLES: Record<string, string> = {
  // Total
  "B27001_001E": "Total civilian noninstitutionalized population",

  // Under 6 years
  "B27001_002E": "Under 6 years",
  "B27001_003E": "Under 6 years - With health insurance",
  "B27001_004E": "Under 6 years - No health insurance",

  // 6 to 17 years
  "B27001_005E": "6 to 17 years",
  "B27001_006E": "6 to 17 years - With health insurance",
  "B27001_007E": "6 to 17 years - No health insurance",

  // 18 to 24 years
  "B27001_008E": "18 to 24 years",
  "B27001_009E": "18 to 24 years - With health insurance",
  "B27001_010E": "18 to 24 years - No health insurance",

  // 25 to 34 years
  "B27001_011E": "25 to 34 years",
  "B27001_012E": "25 to 34 years - With health insurance",
  "B27001_013E": "25 to 34 years - No health insurance",

  // 35 to 44 years
  "B27001_014E": "35 to 44 years",
  "B27001_015E": "35 to 44 years - With health insurance",
  "B27001_016E": "35 to 44 years - No health insurance",

  // 45 to 54 years
  "B27001_017E": "45 to 54 years",
  "B27001_018E": "45 to 54 years - With health insurance",
  "B27001_019E": "45 to 54 years - No health insurance",

  // 55 to 64 years
  "B27001_020E": "55 to 64 years",
  "B27001_021E": "55 to 64 years - With health insurance",
  "B27001_022E": "55 to 64 years - No health insurance",

  // 65 to 74 years
  "B27001_023E": "65 to 74 years",
  "B27001_024E": "65 to 74 years - With health insurance",
  "B27001_025E": "65 to 74 years - No health insurance",

  // 75 years and over
  "B27001_026E": "75 years and over",
  "B27001_027E": "75 years and over - With health insurance",
  "B27001_028E": "75 years and over - No health insurance",
};

// ─── Age Group Variable Mappings ────────────────────────────
/**
 * Maps age group labels to the B27001 variable codes for
 * total, insured, and uninsured in each bracket.
 */
export const AGE_GROUP_VARIABLES: Record<
  string,
  { total: string[]; insured: string[]; uninsured: string[] }
> = {
  all: {
    total: ["B27001_001E"],
    insured: [
      "B27001_003E", "B27001_006E", "B27001_009E", "B27001_012E",
      "B27001_015E", "B27001_018E", "B27001_021E", "B27001_024E",
      "B27001_027E",
    ],
    uninsured: [
      "B27001_004E", "B27001_007E", "B27001_010E", "B27001_013E",
      "B27001_016E", "B27001_019E", "B27001_022E", "B27001_025E",
      "B27001_028E",
    ],
  },
  under_19: {
    total: ["B27001_002E", "B27001_005E"],
    insured: ["B27001_003E", "B27001_006E"],
    uninsured: ["B27001_004E", "B27001_007E"],
  },
  "19_to_64": {
    total: [
      "B27001_008E", "B27001_011E", "B27001_014E",
      "B27001_017E", "B27001_020E",
    ],
    insured: [
      "B27001_009E", "B27001_012E", "B27001_015E",
      "B27001_018E", "B27001_021E",
    ],
    uninsured: [
      "B27001_010E", "B27001_013E", "B27001_016E",
      "B27001_019E", "B27001_022E",
    ],
  },
  "65_plus": {
    total: ["B27001_023E", "B27001_026E"],
    insured: ["B27001_024E", "B27001_027E"],
    uninsured: ["B27001_025E", "B27001_028E"],
  },
};

// ─── Types of Health Insurance (B27010) ─────────────────────

export const INSURANCE_TYPE_VARIABLES: Record<string, string> = {
  "B27010_001E": "Total population for insurance type",
  "B27010_002E": "With one type of health insurance coverage",
  "B27010_003E": "With employer-based health insurance only",
  "B27010_004E": "With direct-purchase health insurance only",
  "B27010_005E": "With Medicare coverage only",
  "B27010_006E": "With Medicaid/means-tested coverage only",
  "B27010_007E": "With TRICARE/military coverage only",
  "B27010_008E": "With VA Health Care only",
};

// ─── SAHIE Variables ────────────────────────────────────────
/**
 * Small Area Health Insurance Estimates (SAHIE)
 * Timeseries data with uninsured rates at county level.
 */
export const SAHIE_VARIABLES: Record<string, string> = {
  NIC_PT: "Number insured (estimate)",
  NIC_MOE: "Number insured (margin of error)",
  NUI_PT: "Number uninsured (estimate)",
  NUI_MOE: "Number uninsured (margin of error)",
  PCTIC_PT: "Percent insured (estimate)",
  PCTIC_MOE: "Percent insured (margin of error)",
  PCTUI_PT: "Percent uninsured (estimate)",
  PCTUI_MOE: "Percent uninsured (margin of error)",
  NAME: "Geographic area name",
  STABREV: "State abbreviation",
  GEOCAT: "Geography type (40=state, 50=county)",
  AGECAT: "Age category code",
  RACECAT: "Race category code",
  SEXCAT: "Sex category code",
  IPRCAT: "Income-to-poverty ratio category",
};

/**
 * SAHIE age category codes.
 */
export const SAHIE_AGE_CATEGORIES: Record<string, string> = {
  "0": "Under 65 years",
  "1": "18 to 64 years",
  "2": "40 to 64 years",
  "3": "50 to 64 years",
  "4": "Under 19 years",
  "5": "21 to 64 years",
};

/**
 * SAHIE age group parameter to AGECAT code mapping.
 */
export const SAHIE_AGE_MAP: Record<string, string> = {
  "0-64": "0",
  "18-64": "1",
  "40-64": "2",
  "50-64": "3",
  "under_19": "4",
};

/**
 * SAHIE income-to-poverty ratio category codes.
 */
export const SAHIE_INCOME_CATEGORIES: Record<string, string> = {
  all: "0",
  below_200pct_fpl: "1",
  below_138pct_fpl: "5",
  below_400pct_fpl: "2",
};

// ─── Demographic Variable Mappings ──────────────────────────
/**
 * Common demographic variable mappings for the census_get_demographics tool.
 * Maps friendly names to ACS variable codes.
 */
export const DEMOGRAPHIC_VARIABLES: Record<string, { variables: string[]; labels: Record<string, string> }> = {
  population: {
    variables: ["B01001_001E"],
    labels: {
      "B01001_001E": "Total Population",
    },
  },
  age_distribution: {
    variables: [
      "B01001_001E",
      "B01001_003E", "B01001_004E", "B01001_005E", "B01001_006E", // Male under 5 through 14
      "B01001_007E", "B01001_008E", "B01001_009E", "B01001_010E", // Male 15-24
      "B01001_011E", "B01001_012E", "B01001_013E", "B01001_014E", // Male 25-44
      "B01001_015E", "B01001_016E", "B01001_017E", "B01001_018E", // Male 45-64
      "B01001_019E", "B01001_020E", "B01001_021E", "B01001_022E", // Male 65-74
      "B01001_023E", "B01001_024E", "B01001_025E",                // Male 75+
    ],
    labels: {
      "B01001_001E": "Total Population",
      "B01001_003E": "Male: Under 5 years",
      "B01001_004E": "Male: 5 to 9 years",
      "B01001_005E": "Male: 10 to 14 years",
      "B01001_006E": "Male: 15 to 17 years",
      "B01001_007E": "Male: 18 and 19 years",
      "B01001_008E": "Male: 20 years",
      "B01001_009E": "Male: 21 years",
      "B01001_010E": "Male: 22 to 24 years",
      "B01001_011E": "Male: 25 to 29 years",
      "B01001_012E": "Male: 30 to 34 years",
      "B01001_013E": "Male: 35 to 39 years",
      "B01001_014E": "Male: 40 to 44 years",
      "B01001_015E": "Male: 45 to 49 years",
      "B01001_016E": "Male: 50 to 54 years",
      "B01001_017E": "Male: 55 to 59 years",
      "B01001_018E": "Male: 60 and 61 years",
      "B01001_019E": "Male: 62 to 64 years",
      "B01001_020E": "Male: 65 and 66 years",
      "B01001_021E": "Male: 67 to 69 years",
      "B01001_022E": "Male: 70 to 74 years",
      "B01001_023E": "Male: 75 to 79 years",
      "B01001_024E": "Male: 80 to 84 years",
      "B01001_025E": "Male: 85 years and over",
    },
  },
  median_income: {
    variables: ["B19013_001E"],
    labels: {
      "B19013_001E": "Median Household Income (in inflation-adjusted dollars)",
    },
  },
  poverty_rate: {
    variables: [
      "B17001_001E",
      "B17001_002E",
    ],
    labels: {
      "B17001_001E": "Total population for poverty status determination",
      "B17001_002E": "Income in the past 12 months below poverty level",
    },
  },
  education: {
    variables: [
      "B15003_001E",
      "B15003_017E", // Regular high school diploma
      "B15003_021E", // Associate's degree
      "B15003_022E", // Bachelor's degree
      "B15003_023E", // Master's degree
      "B15003_024E", // Professional school degree
      "B15003_025E", // Doctorate degree
    ],
    labels: {
      "B15003_001E": "Total population 25 years and over",
      "B15003_017E": "Regular high school diploma",
      "B15003_021E": "Associate's degree",
      "B15003_022E": "Bachelor's degree",
      "B15003_023E": "Master's degree",
      "B15003_024E": "Professional school degree",
      "B15003_025E": "Doctorate degree",
    },
  },
};

// ─── Healthcare-Relevant Table Index ────────────────────────
/**
 * Quick reference for healthcare-relevant Census tables.
 * Used by archetypes like MACRO-CONTEXT, ANALYST-STRATEGIC, RESEARCHER-DATA.
 */
export const HEALTHCARE_TABLES: Record<string, string> = {
  B27001: "Health Insurance Coverage Status by Age",
  B27010: "Types of Health Insurance Coverage by Age",
  B27020: "Health Insurance Coverage Status by Citizenship Status",
  S2701: "Selected Characteristics of Health Insurance Coverage",
  DP03: "Selected Economic Characteristics (income, insurance, employment)",
  B01001: "Sex by Age (population distribution)",
  B19013: "Median Household Income in the Past 12 Months",
  B17001: "Poverty Status in the Past 12 Months",
  B15003: "Educational Attainment for the Population 25 Years and Over",
  B25001: "Housing Units",
  C27006: "Medicare Coverage by Sex by Age",
  C27007: "Medicaid/Means-Tested Public Coverage by Sex by Age",
};
