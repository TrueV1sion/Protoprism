/**
 * AHRQ HCUP MCP Server Constants
 *
 * Embedded reference data from HCUP Statistical Briefs, Fast Stats,
 * and publicly available HCUP publications. Since HCUP does not provide
 * a public REST API, this server relies on curated statistical data
 * from the most recent HCUP releases.
 *
 * Data sources:
 * - HCUP Statistical Briefs (https://hcup-us.ahrq.gov/reports/statbriefs/statbriefs.jsp)
 * - HCUP Fast Stats (https://hcup-us.ahrq.gov/faststats/national/inpatientcommondiagnoses.jsp)
 * - National Inpatient Sample (NIS), 2020-2021 data years
 * - Nationwide Emergency Department Sample (NEDS), 2020-2021 data years
 */

// ─── Configuration ──────────────────────────────────────────

export const USER_AGENT = "Protoprism-AHRQ-MCP/1.0 (research@protoprism.ai)";
export const RATE_LIMIT_MS = 500;
export const CHARACTER_LIMIT = 50_000;

export const HCUPNET_BASE_URL = "https://hcupnet.ahrq.gov";
export const HCUP_BASE_URL = "https://hcup-us.ahrq.gov";

// ─── Type Definitions ───────────────────────────────────────

export interface DiagnosisStats {
  /** Common name of the condition */
  name: string;
  /** ICD-10-CM category or code range */
  icd10_category: string;
  /** Alternate names/abbreviations for fuzzy matching */
  aliases: string[];
  /** Data year */
  year: number;
  /** Setting: inpatient or emergency */
  setting: "inpatient" | "emergency";
  /** Estimated annual number of discharges/visits */
  annual_discharges: number;
  /** Mean cost per stay/visit in USD */
  mean_cost: number;
  /** Mean length of stay in days (inpatient only) */
  mean_los: number | null;
  /** In-hospital mortality rate as percentage */
  mortality_rate: number | null;
  /** Aggregate national cost in USD */
  aggregate_cost: number;
  /** Age distribution percentages */
  age_distribution: {
    under_18: number;
    age_18_44: number;
    age_45_64: number;
    age_65_84: number;
    age_85_plus: number;
  };
  /** Primary payer distribution percentages */
  payer_distribution: {
    medicare: number;
    medicaid: number;
    private_insurance: number;
    uninsured: number;
    other: number;
  };
  /** Brief clinical description for context */
  description: string;
}

export interface ProcedureStats {
  /** Common name of the procedure */
  name: string;
  /** ICD-10-PCS category or CPT range */
  icd10_pcs_category: string;
  /** Alternate names for fuzzy matching */
  aliases: string[];
  /** Data year */
  year: number;
  /** Estimated annual number of procedures */
  annual_procedures: number;
  /** Mean cost per procedure in USD */
  mean_cost: number;
  /** Mean length of stay in days */
  mean_los: number;
  /** Aggregate national cost in USD */
  aggregate_cost: number;
  /** Payer distribution percentages */
  payer_distribution: {
    medicare: number;
    medicaid: number;
    private_insurance: number;
    uninsured: number;
    other: number;
  };
  /** Brief description */
  description: string;
}

export interface CostTrendDataPoint {
  year: number;
  value: number;
  /** Year-over-year percent change */
  yoy_change: number | null;
}

export interface CostTrendSeries {
  category: string;
  metric: string;
  unit: string;
  data_points: CostTrendDataPoint[];
  source_note: string;
}

export type TrendCategory =
  | "all_hospitalizations"
  | "emergency_visits"
  | "surgical"
  | "maternal"
  | "mental_health"
  | "cardiovascular"
  | "orthopedic";

export type TrendMetric = "aggregate_cost" | "mean_cost" | "stays" | "los";

// ─── Inpatient Diagnosis Data ───────────────────────────────
//
// Based on HCUP Statistical Brief #304 and NIS data, 2020-2021.
// Numbers represent approximate national estimates.

export const INPATIENT_DIAGNOSES: DiagnosisStats[] = [
  {
    name: "Septicemia",
    icd10_category: "A40-A41",
    aliases: ["sepsis", "septicemia", "bloodstream infection", "bacteremia"],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 1_900_000,
    mean_cost: 23_000,
    mean_los: 6.5,
    mortality_rate: 8.5,
    aggregate_cost: 43_700_000_000,
    age_distribution: {
      under_18: 2,
      age_18_44: 8,
      age_45_64: 22,
      age_65_84: 42,
      age_85_plus: 26,
    },
    payer_distribution: {
      medicare: 65,
      medicaid: 13,
      private_insurance: 15,
      uninsured: 3,
      other: 4,
    },
    description:
      "Systemic infection involving bacteria in the bloodstream. Leading cause of inpatient mortality and among the most expensive conditions to treat.",
  },
  {
    name: "Osteoarthritis",
    icd10_category: "M15-M19",
    aliases: [
      "OA",
      "degenerative joint disease",
      "arthritis",
      "joint replacement",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 1_050_000,
    mean_cost: 17_500,
    mean_los: 2.1,
    mortality_rate: 0.1,
    aggregate_cost: 18_375_000_000,
    age_distribution: {
      under_18: 0,
      age_18_44: 4,
      age_45_64: 33,
      age_65_84: 54,
      age_85_plus: 9,
    },
    payer_distribution: {
      medicare: 56,
      medicaid: 8,
      private_insurance: 31,
      uninsured: 1,
      other: 4,
    },
    description:
      "Degenerative joint disease primarily treated with joint replacement surgery. High-volume, relatively low-risk admissions.",
  },
  {
    name: "Liveborn (Childbirth)",
    icd10_category: "Z38",
    aliases: [
      "birth",
      "newborn",
      "liveborn",
      "childbirth",
      "delivery",
      "neonatal",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 3_600_000,
    mean_cost: 3_400,
    mean_los: 2.6,
    mortality_rate: 0.1,
    aggregate_cost: 12_240_000_000,
    age_distribution: {
      under_18: 100,
      age_18_44: 0,
      age_45_64: 0,
      age_65_84: 0,
      age_85_plus: 0,
    },
    payer_distribution: {
      medicare: 0,
      medicaid: 42,
      private_insurance: 49,
      uninsured: 4,
      other: 5,
    },
    description:
      "Newborn infant hospitalizations. Highest volume of all inpatient stays but among the lowest cost per stay.",
  },
  {
    name: "Heart failure",
    icd10_category: "I50",
    aliases: [
      "CHF",
      "congestive heart failure",
      "HF",
      "cardiac failure",
      "left ventricular failure",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 1_060_000,
    mean_cost: 15_800,
    mean_los: 5.3,
    mortality_rate: 3.2,
    aggregate_cost: 16_748_000_000,
    age_distribution: {
      under_18: 0,
      age_18_44: 4,
      age_45_64: 18,
      age_65_84: 47,
      age_85_plus: 31,
    },
    payer_distribution: {
      medicare: 72,
      medicaid: 10,
      private_insurance: 12,
      uninsured: 2,
      other: 4,
    },
    description:
      "Condition where the heart cannot pump blood effectively. One of the most frequent reasons for hospital admission in the elderly population.",
  },
  {
    name: "Pneumonia",
    icd10_category: "J12-J18",
    aliases: [
      "community-acquired pneumonia",
      "CAP",
      "bacterial pneumonia",
      "viral pneumonia",
      "lung infection",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 740_000,
    mean_cost: 12_800,
    mean_los: 5.0,
    mortality_rate: 4.1,
    aggregate_cost: 9_472_000_000,
    age_distribution: {
      under_18: 5,
      age_18_44: 10,
      age_45_64: 20,
      age_65_84: 38,
      age_85_plus: 27,
    },
    payer_distribution: {
      medicare: 62,
      medicaid: 12,
      private_insurance: 17,
      uninsured: 4,
      other: 5,
    },
    description:
      "Infection of the lungs caused by bacteria, viruses, or fungi. A leading cause of hospitalization especially in elderly and immunocompromised patients.",
  },
  {
    name: "COPD and bronchiectasis",
    icd10_category: "J40-J47",
    aliases: [
      "COPD",
      "chronic obstructive pulmonary disease",
      "emphysema",
      "chronic bronchitis",
      "bronchiectasis",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 540_000,
    mean_cost: 10_900,
    mean_los: 4.5,
    mortality_rate: 2.4,
    aggregate_cost: 5_886_000_000,
    age_distribution: {
      under_18: 0,
      age_18_44: 4,
      age_45_64: 27,
      age_65_84: 50,
      age_85_plus: 19,
    },
    payer_distribution: {
      medicare: 63,
      medicaid: 15,
      private_insurance: 14,
      uninsured: 4,
      other: 4,
    },
    description:
      "Chronic lung diseases characterized by airflow obstruction. Exacerbations frequently require hospitalization.",
  },
  {
    name: "Acute myocardial infarction",
    icd10_category: "I21-I22",
    aliases: [
      "AMI",
      "heart attack",
      "MI",
      "myocardial infarction",
      "STEMI",
      "NSTEMI",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 550_000,
    mean_cost: 24_500,
    mean_los: 4.6,
    mortality_rate: 5.2,
    aggregate_cost: 13_475_000_000,
    age_distribution: {
      under_18: 0,
      age_18_44: 8,
      age_45_64: 30,
      age_65_84: 43,
      age_85_plus: 19,
    },
    payer_distribution: {
      medicare: 58,
      medicaid: 9,
      private_insurance: 25,
      uninsured: 4,
      other: 4,
    },
    description:
      "Death of heart muscle due to blocked blood supply. Requires emergent intervention including cardiac catheterization and stenting.",
  },
  {
    name: "Cardiac dysrhythmias",
    icd10_category: "I47-I49",
    aliases: [
      "arrhythmia",
      "atrial fibrillation",
      "afib",
      "AF",
      "tachycardia",
      "bradycardia",
      "cardiac rhythm disorders",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 620_000,
    mean_cost: 11_600,
    mean_los: 3.4,
    mortality_rate: 1.4,
    aggregate_cost: 7_192_000_000,
    age_distribution: {
      under_18: 1,
      age_18_44: 7,
      age_45_64: 19,
      age_65_84: 46,
      age_85_plus: 27,
    },
    payer_distribution: {
      medicare: 67,
      medicaid: 8,
      private_insurance: 18,
      uninsured: 3,
      other: 4,
    },
    description:
      "Abnormal heart rhythms including atrial fibrillation, the most common sustained arrhythmia.",
  },
  {
    name: "Diabetes mellitus with complications",
    icd10_category: "E10-E14",
    aliases: [
      "diabetes",
      "DM",
      "diabetic complications",
      "diabetic ketoacidosis",
      "DKA",
      "type 2 diabetes",
      "type 1 diabetes",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 520_000,
    mean_cost: 12_200,
    mean_los: 4.2,
    mortality_rate: 1.5,
    aggregate_cost: 6_344_000_000,
    age_distribution: {
      under_18: 5,
      age_18_44: 18,
      age_45_64: 32,
      age_65_84: 34,
      age_85_plus: 11,
    },
    payer_distribution: {
      medicare: 48,
      medicaid: 20,
      private_insurance: 22,
      uninsured: 5,
      other: 5,
    },
    description:
      "Hospitalization for complications of diabetes including diabetic ketoacidosis, hyperosmolar states, and end-organ damage.",
  },
  {
    name: "Hip fracture",
    icd10_category: "S72.0-S72.2",
    aliases: [
      "hip fracture",
      "fractured hip",
      "femoral neck fracture",
      "intertrochanteric fracture",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 340_000,
    mean_cost: 18_200,
    mean_los: 5.4,
    mortality_rate: 2.8,
    aggregate_cost: 6_188_000_000,
    age_distribution: {
      under_18: 0,
      age_18_44: 2,
      age_45_64: 8,
      age_65_84: 40,
      age_85_plus: 50,
    },
    payer_distribution: {
      medicare: 80,
      medicaid: 6,
      private_insurance: 9,
      uninsured: 1,
      other: 4,
    },
    description:
      "Fracture of the proximal femur, predominantly affecting elderly patients. Usually requires surgical fixation.",
  },
  {
    name: "Cellulitis",
    icd10_category: "L03",
    aliases: [
      "cellulitis",
      "skin infection",
      "soft tissue infection",
      "abscess",
      "SSTI",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 440_000,
    mean_cost: 9_800,
    mean_los: 4.0,
    mortality_rate: 0.4,
    aggregate_cost: 4_312_000_000,
    age_distribution: {
      under_18: 5,
      age_18_44: 25,
      age_45_64: 30,
      age_65_84: 28,
      age_85_plus: 12,
    },
    payer_distribution: {
      medicare: 40,
      medicaid: 22,
      private_insurance: 24,
      uninsured: 8,
      other: 6,
    },
    description:
      "Bacterial skin and soft tissue infections requiring IV antibiotics. Common in patients with diabetes or peripheral vascular disease.",
  },
  {
    name: "Acute and unspecified renal failure",
    icd10_category: "N17",
    aliases: [
      "renal failure",
      "AKI",
      "acute kidney injury",
      "kidney failure",
      "acute renal failure",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 680_000,
    mean_cost: 14_600,
    mean_los: 5.5,
    mortality_rate: 4.8,
    aggregate_cost: 9_928_000_000,
    age_distribution: {
      under_18: 1,
      age_18_44: 6,
      age_45_64: 22,
      age_65_84: 44,
      age_85_plus: 27,
    },
    payer_distribution: {
      medicare: 68,
      medicaid: 11,
      private_insurance: 14,
      uninsured: 3,
      other: 4,
    },
    description:
      "Sudden loss of kidney function. Often a complication of other conditions such as sepsis or heart failure.",
  },
  {
    name: "Urinary tract infection",
    icd10_category: "N39.0",
    aliases: ["UTI", "urinary tract infection", "cystitis", "pyelonephritis"],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 440_000,
    mean_cost: 9_200,
    mean_los: 4.1,
    mortality_rate: 0.9,
    aggregate_cost: 4_048_000_000,
    age_distribution: {
      under_18: 3,
      age_18_44: 10,
      age_45_64: 15,
      age_65_84: 38,
      age_85_plus: 34,
    },
    payer_distribution: {
      medicare: 68,
      medicaid: 11,
      private_insurance: 13,
      uninsured: 3,
      other: 5,
    },
    description:
      "Infections of the urinary tract, including bladder and kidney infections. Particularly common in elderly women.",
  },
  {
    name: "Gastrointestinal hemorrhage",
    icd10_category: "K92.0-K92.2",
    aliases: [
      "GI bleed",
      "gastrointestinal bleeding",
      "GI hemorrhage",
      "upper GI bleed",
      "lower GI bleed",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 420_000,
    mean_cost: 12_100,
    mean_los: 4.3,
    mortality_rate: 2.3,
    aggregate_cost: 5_082_000_000,
    age_distribution: {
      under_18: 1,
      age_18_44: 9,
      age_45_64: 22,
      age_65_84: 41,
      age_85_plus: 27,
    },
    payer_distribution: {
      medicare: 64,
      medicaid: 11,
      private_insurance: 17,
      uninsured: 4,
      other: 4,
    },
    description:
      "Bleeding from the gastrointestinal tract, often requiring endoscopy for diagnosis and treatment.",
  },
  {
    name: "Respiratory failure",
    icd10_category: "J96",
    aliases: [
      "respiratory failure",
      "acute respiratory failure",
      "ARDS",
      "ventilator",
      "mechanical ventilation",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 710_000,
    mean_cost: 30_200,
    mean_los: 7.2,
    mortality_rate: 14.6,
    aggregate_cost: 21_442_000_000,
    age_distribution: {
      under_18: 2,
      age_18_44: 10,
      age_45_64: 25,
      age_65_84: 40,
      age_85_plus: 23,
    },
    payer_distribution: {
      medicare: 60,
      medicaid: 14,
      private_insurance: 18,
      uninsured: 4,
      other: 4,
    },
    description:
      "Failure of the lungs to adequately oxygenate the blood. Among the highest-cost and highest-mortality inpatient conditions.",
  },
  {
    name: "Mood disorders",
    icd10_category: "F30-F39",
    aliases: [
      "depression",
      "bipolar disorder",
      "major depressive disorder",
      "mood disorder",
      "psychiatric",
      "mental health",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 470_000,
    mean_cost: 8_500,
    mean_los: 6.1,
    mortality_rate: 0.1,
    aggregate_cost: 3_995_000_000,
    age_distribution: {
      under_18: 15,
      age_18_44: 40,
      age_45_64: 30,
      age_65_84: 12,
      age_85_plus: 3,
    },
    payer_distribution: {
      medicare: 25,
      medicaid: 32,
      private_insurance: 30,
      uninsured: 7,
      other: 6,
    },
    description:
      "Hospitalizations for depressive episodes, bipolar disorder, and related mood conditions. Notable for younger age distribution.",
  },
  {
    name: "Stroke / Cerebrovascular accident",
    icd10_category: "I60-I69",
    aliases: [
      "stroke",
      "CVA",
      "cerebrovascular accident",
      "brain attack",
      "ischemic stroke",
      "hemorrhagic stroke",
      "TIA",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 610_000,
    mean_cost: 18_900,
    mean_los: 5.2,
    mortality_rate: 5.6,
    aggregate_cost: 11_529_000_000,
    age_distribution: {
      under_18: 1,
      age_18_44: 7,
      age_45_64: 22,
      age_65_84: 44,
      age_85_plus: 26,
    },
    payer_distribution: {
      medicare: 66,
      medicaid: 11,
      private_insurance: 16,
      uninsured: 3,
      other: 4,
    },
    description:
      "Interruption of blood flow to the brain. Requires emergent treatment and often results in long-term disability.",
  },
  {
    name: "Back problems",
    icd10_category: "M45-M54",
    aliases: [
      "back pain",
      "spinal stenosis",
      "disc herniation",
      "lumbar",
      "dorsopathy",
      "sciatica",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 380_000,
    mean_cost: 16_800,
    mean_los: 3.5,
    mortality_rate: 0.2,
    aggregate_cost: 6_384_000_000,
    age_distribution: {
      under_18: 1,
      age_18_44: 15,
      age_45_64: 35,
      age_65_84: 38,
      age_85_plus: 11,
    },
    payer_distribution: {
      medicare: 48,
      medicaid: 12,
      private_insurance: 32,
      uninsured: 3,
      other: 5,
    },
    description:
      "Spinal disorders including disc disease, stenosis, and degenerative conditions. Many require surgical intervention.",
  },
  {
    name: "Biliary tract disease",
    icd10_category: "K80-K83",
    aliases: [
      "gallstones",
      "cholecystitis",
      "cholelithiasis",
      "gallbladder",
      "biliary",
      "cholangitis",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 430_000,
    mean_cost: 13_400,
    mean_los: 3.8,
    mortality_rate: 0.8,
    aggregate_cost: 5_762_000_000,
    age_distribution: {
      under_18: 2,
      age_18_44: 25,
      age_45_64: 27,
      age_65_84: 32,
      age_85_plus: 14,
    },
    payer_distribution: {
      medicare: 42,
      medicaid: 16,
      private_insurance: 30,
      uninsured: 6,
      other: 6,
    },
    description:
      "Gallstone-related conditions including cholecystitis, treated primarily with cholecystectomy (gallbladder removal).",
  },
  {
    name: "Appendicitis",
    icd10_category: "K35-K38",
    aliases: [
      "appendicitis",
      "acute appendicitis",
      "ruptured appendix",
      "appendectomy",
    ],
    year: 2021,
    setting: "inpatient",
    annual_discharges: 290_000,
    mean_cost: 14_100,
    mean_los: 2.8,
    mortality_rate: 0.1,
    aggregate_cost: 4_089_000_000,
    age_distribution: {
      under_18: 25,
      age_18_44: 42,
      age_45_64: 20,
      age_65_84: 10,
      age_85_plus: 3,
    },
    payer_distribution: {
      medicare: 12,
      medicaid: 22,
      private_insurance: 50,
      uninsured: 10,
      other: 6,
    },
    description:
      "Inflammation of the appendix, requiring surgical removal. Most common in younger populations.",
  },
];

// ─── Emergency Department Diagnosis Data ────────────────────
//
// Based on HCUP NEDS data and Statistical Briefs on ED utilization.

export const ED_DIAGNOSES: DiagnosisStats[] = [
  {
    name: "Chest pain",
    icd10_category: "R07",
    aliases: [
      "chest pain",
      "angina",
      "chest discomfort",
      "acute chest pain",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 7_200_000,
    mean_cost: 4_200,
    mean_los: null,
    mortality_rate: 0.1,
    aggregate_cost: 30_240_000_000,
    age_distribution: {
      under_18: 2,
      age_18_44: 28,
      age_45_64: 35,
      age_65_84: 27,
      age_85_plus: 8,
    },
    payer_distribution: {
      medicare: 32,
      medicaid: 18,
      private_insurance: 30,
      uninsured: 12,
      other: 8,
    },
    description:
      "Most common reason for ED visits. Most cases are non-cardiac but require evaluation to rule out acute coronary syndrome.",
  },
  {
    name: "Abdominal pain",
    icd10_category: "R10",
    aliases: [
      "abdominal pain",
      "stomach pain",
      "belly pain",
      "abdominal cramps",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 8_500_000,
    mean_cost: 3_100,
    mean_los: null,
    mortality_rate: 0.05,
    aggregate_cost: 26_350_000_000,
    age_distribution: {
      under_18: 12,
      age_18_44: 38,
      age_45_64: 25,
      age_65_84: 18,
      age_85_plus: 7,
    },
    payer_distribution: {
      medicare: 22,
      medicaid: 25,
      private_insurance: 28,
      uninsured: 15,
      other: 10,
    },
    description:
      "One of the most frequent ED complaints. Requires workup to differentiate benign from serious surgical conditions.",
  },
  {
    name: "Sprains and strains",
    icd10_category: "S13-S93",
    aliases: [
      "sprain",
      "strain",
      "ankle sprain",
      "back strain",
      "musculoskeletal injury",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 4_800_000,
    mean_cost: 1_800,
    mean_los: null,
    mortality_rate: 0.0,
    aggregate_cost: 8_640_000_000,
    age_distribution: {
      under_18: 22,
      age_18_44: 38,
      age_45_64: 25,
      age_65_84: 12,
      age_85_plus: 3,
    },
    payer_distribution: {
      medicare: 12,
      medicaid: 20,
      private_insurance: 40,
      uninsured: 18,
      other: 10,
    },
    description:
      "Musculoskeletal injuries from sports, falls, and other trauma. Typically treated and released.",
  },
  {
    name: "Upper respiratory infection",
    icd10_category: "J00-J06",
    aliases: [
      "URI",
      "common cold",
      "upper respiratory infection",
      "pharyngitis",
      "sore throat",
      "sinusitis",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 5_200_000,
    mean_cost: 1_400,
    mean_los: null,
    mortality_rate: 0.0,
    aggregate_cost: 7_280_000_000,
    age_distribution: {
      under_18: 35,
      age_18_44: 35,
      age_45_64: 18,
      age_65_84: 9,
      age_85_plus: 3,
    },
    payer_distribution: {
      medicare: 10,
      medicaid: 32,
      private_insurance: 28,
      uninsured: 20,
      other: 10,
    },
    description:
      "Viral infections of the nose, throat, and sinuses. Often considered low-acuity ED visits better suited for primary care.",
  },
  {
    name: "Headache (including migraine)",
    icd10_category: "G43-G44, R51",
    aliases: [
      "headache",
      "migraine",
      "tension headache",
      "cephalgia",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 3_800_000,
    mean_cost: 2_600,
    mean_los: null,
    mortality_rate: 0.01,
    aggregate_cost: 9_880_000_000,
    age_distribution: {
      under_18: 8,
      age_18_44: 45,
      age_45_64: 30,
      age_65_84: 13,
      age_85_plus: 4,
    },
    payer_distribution: {
      medicare: 15,
      medicaid: 25,
      private_insurance: 32,
      uninsured: 18,
      other: 10,
    },
    description:
      "Common ED presentation requiring evaluation to rule out subarachnoid hemorrhage, meningitis, and other serious causes.",
  },
  {
    name: "Skin and subcutaneous tissue infections",
    icd10_category: "L00-L08",
    aliases: [
      "skin infection",
      "abscess",
      "cellulitis ED",
      "wound infection",
      "MRSA",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 3_500_000,
    mean_cost: 1_900,
    mean_los: null,
    mortality_rate: 0.01,
    aggregate_cost: 6_650_000_000,
    age_distribution: {
      under_18: 12,
      age_18_44: 38,
      age_45_64: 28,
      age_65_84: 16,
      age_85_plus: 6,
    },
    payer_distribution: {
      medicare: 18,
      medicaid: 28,
      private_insurance: 25,
      uninsured: 20,
      other: 9,
    },
    description:
      "Skin and soft tissue infections, including abscesses requiring incision and drainage in the ED.",
  },
  {
    name: "Open wounds",
    icd10_category: "S01-S91",
    aliases: [
      "laceration",
      "cut",
      "wound",
      "open wound",
      "puncture wound",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 4_200_000,
    mean_cost: 1_600,
    mean_los: null,
    mortality_rate: 0.01,
    aggregate_cost: 6_720_000_000,
    age_distribution: {
      under_18: 20,
      age_18_44: 40,
      age_45_64: 22,
      age_65_84: 13,
      age_85_plus: 5,
    },
    payer_distribution: {
      medicare: 14,
      medicaid: 18,
      private_insurance: 35,
      uninsured: 22,
      other: 11,
    },
    description:
      "Lacerations and cuts requiring wound care, suturing, or other ED treatment.",
  },
  {
    name: "Fractures (excluding hip)",
    icd10_category: "S02-S92 (excl S72)",
    aliases: [
      "fracture",
      "broken bone",
      "wrist fracture",
      "arm fracture",
      "leg fracture",
      "colles fracture",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 4_600_000,
    mean_cost: 3_400,
    mean_los: null,
    mortality_rate: 0.02,
    aggregate_cost: 15_640_000_000,
    age_distribution: {
      under_18: 25,
      age_18_44: 28,
      age_45_64: 22,
      age_65_84: 18,
      age_85_plus: 7,
    },
    payer_distribution: {
      medicare: 20,
      medicaid: 18,
      private_insurance: 35,
      uninsured: 17,
      other: 10,
    },
    description:
      "Broken bones from falls, sports injuries, and trauma. Excludes hip fractures which are tracked separately.",
  },
  {
    name: "Urinary tract infection (ED)",
    icd10_category: "N39.0",
    aliases: [
      "UTI ED",
      "urinary infection ED",
      "bladder infection",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 3_200_000,
    mean_cost: 2_100,
    mean_los: null,
    mortality_rate: 0.01,
    aggregate_cost: 6_720_000_000,
    age_distribution: {
      under_18: 5,
      age_18_44: 30,
      age_45_64: 22,
      age_65_84: 28,
      age_85_plus: 15,
    },
    payer_distribution: {
      medicare: 30,
      medicaid: 22,
      private_insurance: 25,
      uninsured: 14,
      other: 9,
    },
    description:
      "ED visits for urinary tract infections. Most patients are treated and released with antibiotics.",
  },
  {
    name: "Asthma",
    icd10_category: "J45",
    aliases: [
      "asthma",
      "asthma exacerbation",
      "acute asthma",
      "bronchospasm",
      "wheezing",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 1_700_000,
    mean_cost: 2_400,
    mean_los: null,
    mortality_rate: 0.02,
    aggregate_cost: 4_080_000_000,
    age_distribution: {
      under_18: 35,
      age_18_44: 28,
      age_45_64: 22,
      age_65_84: 12,
      age_85_plus: 3,
    },
    payer_distribution: {
      medicare: 12,
      medicaid: 38,
      private_insurance: 28,
      uninsured: 14,
      other: 8,
    },
    description:
      "Asthma exacerbations are a common reason for ED visits, especially in children and young adults.",
  },
  {
    name: "Back pain (ED)",
    icd10_category: "M54",
    aliases: [
      "back pain ED",
      "low back pain",
      "lumbago",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 3_600_000,
    mean_cost: 2_200,
    mean_los: null,
    mortality_rate: 0.0,
    aggregate_cost: 7_920_000_000,
    age_distribution: {
      under_18: 2,
      age_18_44: 38,
      age_45_64: 35,
      age_65_84: 20,
      age_85_plus: 5,
    },
    payer_distribution: {
      medicare: 18,
      medicaid: 22,
      private_insurance: 32,
      uninsured: 18,
      other: 10,
    },
    description:
      "Low back pain is a very common ED complaint. Most cases are musculoskeletal and managed conservatively.",
  },
  {
    name: "Mental health / substance-related ED visits",
    icd10_category: "F01-F99",
    aliases: [
      "mental health ED",
      "psychiatric emergency",
      "substance abuse",
      "overdose",
      "alcohol intoxication",
      "drug overdose",
      "suicide attempt",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 6_400_000,
    mean_cost: 3_200,
    mean_los: null,
    mortality_rate: 0.2,
    aggregate_cost: 20_480_000_000,
    age_distribution: {
      under_18: 8,
      age_18_44: 45,
      age_45_64: 30,
      age_65_84: 13,
      age_85_plus: 4,
    },
    payer_distribution: {
      medicare: 15,
      medicaid: 32,
      private_insurance: 22,
      uninsured: 20,
      other: 11,
    },
    description:
      "ED visits for psychiatric crises, substance use disorders, overdoses, and alcohol intoxication. A rapidly growing category.",
  },
  {
    name: "Nonspecific chest pain / symptoms",
    icd10_category: "R00-R09",
    aliases: [
      "shortness of breath",
      "palpitations",
      "dyspnea",
      "SOB",
      "breathing difficulty",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 5_600_000,
    mean_cost: 3_800,
    mean_los: null,
    mortality_rate: 0.1,
    aggregate_cost: 21_280_000_000,
    age_distribution: {
      under_18: 5,
      age_18_44: 22,
      age_45_64: 30,
      age_65_84: 30,
      age_85_plus: 13,
    },
    payer_distribution: {
      medicare: 35,
      medicaid: 18,
      private_insurance: 26,
      uninsured: 12,
      other: 9,
    },
    description:
      "Symptoms involving the circulatory and respiratory systems requiring ED evaluation. Includes dyspnea, palpitations, and other cardiac/respiratory symptoms.",
  },
  {
    name: "Superficial injuries / contusions",
    icd10_category: "S00-T14",
    aliases: [
      "bruise",
      "contusion",
      "superficial injury",
      "bump",
      "surface injury",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 3_900_000,
    mean_cost: 1_500,
    mean_los: null,
    mortality_rate: 0.0,
    aggregate_cost: 5_850_000_000,
    age_distribution: {
      under_18: 20,
      age_18_44: 32,
      age_45_64: 24,
      age_65_84: 17,
      age_85_plus: 7,
    },
    payer_distribution: {
      medicare: 18,
      medicaid: 20,
      private_insurance: 32,
      uninsured: 20,
      other: 10,
    },
    description:
      "Minor injuries including bruises, contusions, and surface-level trauma evaluated in the ED.",
  },
  {
    name: "Fever / unspecified illness",
    icd10_category: "R50-R69",
    aliases: [
      "fever",
      "malaise",
      "fatigue",
      "unspecified illness",
      "feeling unwell",
    ],
    year: 2021,
    setting: "emergency",
    annual_discharges: 4_100_000,
    mean_cost: 2_800,
    mean_los: null,
    mortality_rate: 0.05,
    aggregate_cost: 11_480_000_000,
    age_distribution: {
      under_18: 30,
      age_18_44: 25,
      age_45_64: 20,
      age_65_84: 18,
      age_85_plus: 7,
    },
    payer_distribution: {
      medicare: 20,
      medicaid: 30,
      private_insurance: 25,
      uninsured: 16,
      other: 9,
    },
    description:
      "Fevers and nonspecific symptoms requiring ED evaluation to identify or rule out serious underlying conditions.",
  },
];

// ─── Procedure Data ─────────────────────────────────────────
//
// Based on HCUP NIS data for most frequent OR procedures.

export const PROCEDURES: ProcedureStats[] = [
  {
    name: "Knee replacement (total)",
    icd10_pcs_category: "0SRD0xx",
    aliases: [
      "knee replacement",
      "total knee arthroplasty",
      "TKA",
      "TKR",
      "knee arthroplasty",
    ],
    year: 2021,
    annual_procedures: 720_000,
    mean_cost: 19_400,
    mean_los: 2.0,
    aggregate_cost: 13_968_000_000,
    payer_distribution: {
      medicare: 55,
      medicaid: 5,
      private_insurance: 35,
      uninsured: 1,
      other: 4,
    },
    description:
      "Surgical replacement of a damaged knee joint with prosthetic components. One of the most common elective surgeries.",
  },
  {
    name: "Hip replacement (total)",
    icd10_pcs_category: "0SR90xx",
    aliases: [
      "hip replacement",
      "total hip arthroplasty",
      "THA",
      "THR",
      "hip arthroplasty",
    ],
    year: 2021,
    annual_procedures: 500_000,
    mean_cost: 18_600,
    mean_los: 2.2,
    aggregate_cost: 9_300_000_000,
    payer_distribution: {
      medicare: 58,
      medicaid: 5,
      private_insurance: 32,
      uninsured: 1,
      other: 4,
    },
    description:
      "Surgical replacement of a damaged hip joint. Performed for osteoarthritis, fractures, and avascular necrosis.",
  },
  {
    name: "Coronary artery bypass graft (CABG)",
    icd10_pcs_category: "0210xxx",
    aliases: [
      "CABG",
      "coronary bypass",
      "bypass surgery",
      "heart bypass",
      "open heart surgery",
    ],
    year: 2021,
    annual_procedures: 160_000,
    mean_cost: 58_000,
    mean_los: 8.5,
    aggregate_cost: 9_280_000_000,
    payer_distribution: {
      medicare: 60,
      medicaid: 7,
      private_insurance: 27,
      uninsured: 2,
      other: 4,
    },
    description:
      "Major cardiac surgery to bypass blocked coronary arteries. Among the most expensive common procedures.",
  },
  {
    name: "Percutaneous coronary intervention (PCI)",
    icd10_pcs_category: "0270xxx",
    aliases: [
      "PCI",
      "angioplasty",
      "coronary stent",
      "balloon angioplasty",
      "cardiac catheterization with intervention",
    ],
    year: 2021,
    annual_procedures: 580_000,
    mean_cost: 28_500,
    mean_los: 3.2,
    aggregate_cost: 16_530_000_000,
    payer_distribution: {
      medicare: 55,
      medicaid: 8,
      private_insurance: 30,
      uninsured: 3,
      other: 4,
    },
    description:
      "Minimally invasive procedure to open blocked coronary arteries using balloons and stents.",
  },
  {
    name: "Cesarean section",
    icd10_pcs_category: "10D00Z0-10D00Z2",
    aliases: [
      "C-section",
      "cesarean",
      "caesarean",
      "cesarean delivery",
      "c section",
    ],
    year: 2021,
    annual_procedures: 1_150_000,
    mean_cost: 13_800,
    mean_los: 3.0,
    aggregate_cost: 15_870_000_000,
    payer_distribution: {
      medicare: 0,
      medicaid: 43,
      private_insurance: 48,
      uninsured: 4,
      other: 5,
    },
    description:
      "Surgical delivery of a baby via incision in the abdomen and uterus. Approximately 32% of all US births.",
  },
  {
    name: "Cholecystectomy (laparoscopic)",
    icd10_pcs_category: "0FT44ZZ",
    aliases: [
      "cholecystectomy",
      "gallbladder removal",
      "lap chole",
      "laparoscopic cholecystectomy",
    ],
    year: 2021,
    annual_procedures: 450_000,
    mean_cost: 11_200,
    mean_los: 1.8,
    aggregate_cost: 5_040_000_000,
    payer_distribution: {
      medicare: 30,
      medicaid: 18,
      private_insurance: 38,
      uninsured: 8,
      other: 6,
    },
    description:
      "Minimally invasive removal of the gallbladder. One of the most frequently performed abdominal surgeries.",
  },
  {
    name: "Spinal fusion",
    icd10_pcs_category: "0SG0xxx",
    aliases: [
      "spinal fusion",
      "lumbar fusion",
      "cervical fusion",
      "spine surgery",
      "vertebral fusion",
      "back surgery",
    ],
    year: 2021,
    annual_procedures: 500_000,
    mean_cost: 35_200,
    mean_los: 3.5,
    aggregate_cost: 17_600_000_000,
    payer_distribution: {
      medicare: 42,
      medicaid: 8,
      private_insurance: 42,
      uninsured: 3,
      other: 5,
    },
    description:
      "Surgical joining of two or more vertebrae. One of the highest-volume and highest-cost spinal procedures.",
  },
  {
    name: "Appendectomy",
    icd10_pcs_category: "0DTJ4ZZ",
    aliases: [
      "appendectomy",
      "appendix removal",
      "laparoscopic appendectomy",
    ],
    year: 2021,
    annual_procedures: 280_000,
    mean_cost: 13_800,
    mean_los: 2.5,
    aggregate_cost: 3_864_000_000,
    payer_distribution: {
      medicare: 10,
      medicaid: 22,
      private_insurance: 52,
      uninsured: 10,
      other: 6,
    },
    description:
      "Surgical removal of an inflamed appendix. Increasingly performed laparoscopically.",
  },
  {
    name: "Colectomy",
    icd10_pcs_category: "0DTE-0DTN",
    aliases: [
      "colectomy",
      "colon resection",
      "bowel resection",
      "hemicolectomy",
      "colon surgery",
    ],
    year: 2021,
    annual_procedures: 260_000,
    mean_cost: 28_400,
    mean_los: 6.8,
    aggregate_cost: 7_384_000_000,
    payer_distribution: {
      medicare: 50,
      medicaid: 10,
      private_insurance: 32,
      uninsured: 3,
      other: 5,
    },
    description:
      "Partial or complete removal of the colon for cancer, diverticulitis, or other conditions.",
  },
  {
    name: "Hysterectomy",
    icd10_pcs_category: "0UT9xxx",
    aliases: [
      "hysterectomy",
      "uterus removal",
      "total hysterectomy",
      "abdominal hysterectomy",
      "vaginal hysterectomy",
    ],
    year: 2021,
    annual_procedures: 380_000,
    mean_cost: 13_500,
    mean_los: 2.2,
    aggregate_cost: 5_130_000_000,
    payer_distribution: {
      medicare: 20,
      medicaid: 15,
      private_insurance: 55,
      uninsured: 4,
      other: 6,
    },
    description:
      "Surgical removal of the uterus for fibroids, cancer, endometriosis, and other conditions.",
  },
  {
    name: "Laminectomy",
    icd10_pcs_category: "0SB0-0SB4",
    aliases: [
      "laminectomy",
      "spinal decompression",
      "disc surgery",
      "discectomy",
      "spine decompression",
    ],
    year: 2021,
    annual_procedures: 350_000,
    mean_cost: 18_000,
    mean_los: 2.4,
    aggregate_cost: 6_300_000_000,
    payer_distribution: {
      medicare: 45,
      medicaid: 8,
      private_insurance: 40,
      uninsured: 3,
      other: 4,
    },
    description:
      "Removal of part of the vertebral bone (lamina) to relieve pressure on the spinal cord or nerves.",
  },
  {
    name: "Cardiac catheterization (diagnostic)",
    icd10_pcs_category: "4A023N7",
    aliases: [
      "cardiac catheterization",
      "heart catheterization",
      "cardiac cath",
      "coronary angiography",
      "coronary angiogram",
    ],
    year: 2021,
    annual_procedures: 750_000,
    mean_cost: 14_200,
    mean_los: 2.0,
    aggregate_cost: 10_650_000_000,
    payer_distribution: {
      medicare: 58,
      medicaid: 8,
      private_insurance: 27,
      uninsured: 3,
      other: 4,
    },
    description:
      "Diagnostic procedure to visualize the coronary arteries and cardiac chambers. Performed before PCI or CABG decisions.",
  },
  {
    name: "Pacemaker/defibrillator implant",
    icd10_pcs_category: "0JH6xxx",
    aliases: [
      "pacemaker",
      "ICD",
      "defibrillator",
      "pacemaker implant",
      "cardiac device",
      "CRT",
    ],
    year: 2021,
    annual_procedures: 280_000,
    mean_cost: 35_000,
    mean_los: 3.0,
    aggregate_cost: 9_800_000_000,
    payer_distribution: {
      medicare: 70,
      medicaid: 5,
      private_insurance: 20,
      uninsured: 1,
      other: 4,
    },
    description:
      "Implantation of cardiac rhythm management devices including pacemakers and implantable cardioverter-defibrillators.",
  },
  {
    name: "Hernia repair",
    icd10_pcs_category: "0WU-0YU",
    aliases: [
      "hernia repair",
      "inguinal hernia",
      "herniorrhaphy",
      "ventral hernia",
      "umbilical hernia",
    ],
    year: 2021,
    annual_procedures: 650_000,
    mean_cost: 10_800,
    mean_los: 1.6,
    aggregate_cost: 7_020_000_000,
    payer_distribution: {
      medicare: 32,
      medicaid: 12,
      private_insurance: 44,
      uninsured: 6,
      other: 6,
    },
    description:
      "Surgical repair of hernias (inguinal, ventral, umbilical). One of the most common general surgery procedures.",
  },
  {
    name: "Shoulder replacement",
    icd10_pcs_category: "0RRJ0xx",
    aliases: [
      "shoulder replacement",
      "total shoulder arthroplasty",
      "reverse shoulder replacement",
      "TSA",
    ],
    year: 2021,
    annual_procedures: 140_000,
    mean_cost: 19_800,
    mean_los: 1.8,
    aggregate_cost: 2_772_000_000,
    payer_distribution: {
      medicare: 60,
      medicaid: 3,
      private_insurance: 32,
      uninsured: 1,
      other: 4,
    },
    description:
      "Surgical replacement of a damaged shoulder joint. Rapidly growing in volume especially for reverse total shoulder.",
  },
];

// ─── Cost Trend Data ────────────────────────────────────────
//
// Approximate data from HCUP Fast Stats and Statistical Briefs.
// Aggregate costs in billions of USD.

function buildTrendSeries(
  category: string,
  metric: string,
  unit: string,
  values: [number, number][],
  source_note: string,
): CostTrendSeries {
  const data_points: CostTrendDataPoint[] = values.map(([year, value], i) => ({
    year,
    value,
    yoy_change:
      i > 0
        ? Math.round(((value - values[i - 1][1]) / values[i - 1][1]) * 1000) /
          10
        : null,
  }));
  return { category, metric, unit, data_points, source_note };
}

export const COST_TRENDS: Record<TrendCategory, Record<TrendMetric, CostTrendSeries>> = {
  all_hospitalizations: {
    aggregate_cost: buildTrendSeries(
      "All Hospitalizations",
      "Total National Cost",
      "billions USD",
      [
        [2016, 415.7],
        [2017, 427.3],
        [2018, 440.8],
        [2019, 454.0],
        [2020, 378.6],
        [2021, 443.5],
        [2022, 467.2],
      ],
      "HCUP Fast Stats, National Inpatient Sample. 2020 reflects COVID-19 impact on elective procedures.",
    ),
    mean_cost: buildTrendSeries(
      "All Hospitalizations",
      "Mean Cost per Stay",
      "USD",
      [
        [2016, 11_700],
        [2017, 12_100],
        [2018, 12_600],
        [2019, 13_000],
        [2020, 14_200],
        [2021, 14_800],
        [2022, 15_400],
      ],
      "HCUP Fast Stats. Mean cost rose in 2020 due to sicker patient mix as elective procedures were deferred.",
    ),
    stays: buildTrendSeries(
      "All Hospitalizations",
      "Total Discharges",
      "millions",
      [
        [2016, 35.5],
        [2017, 35.3],
        [2018, 35.0],
        [2019, 34.9],
        [2020, 26.7],
        [2021, 30.0],
        [2022, 30.3],
      ],
      "HCUP Fast Stats, NIS. Sharp decline in 2020 from COVID-19 pandemic effects.",
    ),
    los: buildTrendSeries(
      "All Hospitalizations",
      "Mean Length of Stay",
      "days",
      [
        [2016, 4.6],
        [2017, 4.6],
        [2018, 4.6],
        [2019, 4.6],
        [2020, 5.0],
        [2021, 5.0],
        [2022, 4.9],
      ],
      "HCUP Fast Stats. LOS increased in 2020-2021 due to acuity of admitted COVID-19 patients.",
    ),
  },
  emergency_visits: {
    aggregate_cost: buildTrendSeries(
      "Emergency Department Visits",
      "Total National Cost",
      "billions USD",
      [
        [2016, 76.3],
        [2017, 79.2],
        [2018, 82.8],
        [2019, 86.5],
        [2020, 68.9],
        [2021, 82.1],
        [2022, 88.4],
      ],
      "HCUP Fast Stats, NEDS. 2020 decline reflects reduced ED utilization during COVID-19 pandemic.",
    ),
    mean_cost: buildTrendSeries(
      "Emergency Department Visits",
      "Mean Cost per Visit",
      "USD",
      [
        [2016, 2_170],
        [2017, 2_280],
        [2018, 2_390],
        [2019, 2_510],
        [2020, 2_680],
        [2021, 2_790],
        [2022, 2_930],
      ],
      "HCUP Fast Stats, NEDS. Cost per visit has steadily increased even as total visits fluctuated.",
    ),
    stays: buildTrendSeries(
      "Emergency Department Visits",
      "Total Visits",
      "millions",
      [
        [2016, 145.6],
        [2017, 145.9],
        [2018, 146.2],
        [2019, 146.5],
        [2020, 121.3],
        [2021, 137.8],
        [2022, 141.4],
      ],
      "HCUP Fast Stats, NEDS. ED visits dropped ~17% in 2020 and have not fully recovered to pre-pandemic levels.",
    ),
    los: buildTrendSeries(
      "Emergency Department Visits",
      "Mean ED Duration",
      "hours",
      [
        [2016, 4.2],
        [2017, 4.3],
        [2018, 4.4],
        [2019, 4.5],
        [2020, 4.8],
        [2021, 5.0],
        [2022, 5.1],
      ],
      "HCUP/NEDS estimates. ED boarding times have increased due to inpatient capacity constraints.",
    ),
  },
  surgical: {
    aggregate_cost: buildTrendSeries(
      "Surgical Hospitalizations",
      "Total National Cost",
      "billions USD",
      [
        [2016, 178.2],
        [2017, 182.5],
        [2018, 189.4],
        [2019, 195.8],
        [2020, 148.2],
        [2021, 182.0],
        [2022, 196.5],
      ],
      "HCUP NIS operating room procedures. Elective surgeries severely impacted by 2020 pandemic restrictions.",
    ),
    mean_cost: buildTrendSeries(
      "Surgical Hospitalizations",
      "Mean Cost per Stay",
      "USD",
      [
        [2016, 17_800],
        [2017, 18_300],
        [2018, 19_000],
        [2019, 19_600],
        [2020, 21_500],
        [2021, 22_100],
        [2022, 22_800],
      ],
      "HCUP NIS. Mean surgical cost increased in 2020 as only higher-acuity surgeries were performed.",
    ),
    stays: buildTrendSeries(
      "Surgical Hospitalizations",
      "Total Surgical Stays",
      "millions",
      [
        [2016, 10.0],
        [2017, 10.0],
        [2018, 10.0],
        [2019, 10.0],
        [2020, 6.9],
        [2021, 8.2],
        [2022, 8.6],
      ],
      "HCUP NIS. Surgical volume dropped ~31% in 2020 due to cancellation of elective procedures.",
    ),
    los: buildTrendSeries(
      "Surgical Hospitalizations",
      "Mean Length of Stay",
      "days",
      [
        [2016, 4.8],
        [2017, 4.7],
        [2018, 4.7],
        [2019, 4.6],
        [2020, 5.3],
        [2021, 5.1],
        [2022, 4.9],
      ],
      "HCUP NIS. Longer LOS in 2020 reflects higher surgical acuity during pandemic.",
    ),
  },
  maternal: {
    aggregate_cost: buildTrendSeries(
      "Maternal / Childbirth Hospitalizations",
      "Total National Cost",
      "billions USD",
      [
        [2016, 52.4],
        [2017, 52.8],
        [2018, 53.5],
        [2019, 54.1],
        [2020, 51.2],
        [2021, 53.8],
        [2022, 55.2],
      ],
      "HCUP NIS maternal and neonatal stays. Relatively stable volume as births are non-elective.",
    ),
    mean_cost: buildTrendSeries(
      "Maternal / Childbirth Hospitalizations",
      "Mean Cost per Stay",
      "USD",
      [
        [2016, 5_600],
        [2017, 5_800],
        [2018, 6_100],
        [2019, 6_400],
        [2020, 6_700],
        [2021, 7_000],
        [2022, 7_400],
      ],
      "HCUP NIS. Average across vaginal and cesarean deliveries combined.",
    ),
    stays: buildTrendSeries(
      "Maternal / Childbirth Hospitalizations",
      "Total Maternal Stays",
      "millions",
      [
        [2016, 3.95],
        [2017, 3.86],
        [2018, 3.79],
        [2019, 3.75],
        [2020, 3.61],
        [2021, 3.66],
        [2022, 3.67],
      ],
      "HCUP NIS. Birth volume has declined slightly in line with lower US birth rates.",
    ),
    los: buildTrendSeries(
      "Maternal / Childbirth Hospitalizations",
      "Mean Length of Stay",
      "days",
      [
        [2016, 2.6],
        [2017, 2.6],
        [2018, 2.6],
        [2019, 2.6],
        [2020, 2.5],
        [2021, 2.6],
        [2022, 2.6],
      ],
      "HCUP NIS. Maternal LOS has been very stable. C-sections average ~3 days, vaginal ~2 days.",
    ),
  },
  mental_health: {
    aggregate_cost: buildTrendSeries(
      "Mental Health Hospitalizations",
      "Total National Cost",
      "billions USD",
      [
        [2016, 21.8],
        [2017, 22.5],
        [2018, 23.3],
        [2019, 24.0],
        [2020, 21.0],
        [2021, 24.5],
        [2022, 26.8],
      ],
      "HCUP NIS mental health and substance use principal diagnoses. Growing trend post-pandemic.",
    ),
    mean_cost: buildTrendSeries(
      "Mental Health Hospitalizations",
      "Mean Cost per Stay",
      "USD",
      [
        [2016, 7_500],
        [2017, 7_800],
        [2018, 8_100],
        [2019, 8_400],
        [2020, 8_800],
        [2021, 9_200],
        [2022, 9_600],
      ],
      "HCUP NIS. Mental health stays tend to be lower cost but longer duration than medical stays.",
    ),
    stays: buildTrendSeries(
      "Mental Health Hospitalizations",
      "Total Stays",
      "millions",
      [
        [2016, 2.9],
        [2017, 2.9],
        [2018, 2.88],
        [2019, 2.86],
        [2020, 2.4],
        [2021, 2.66],
        [2022, 2.79],
      ],
      "HCUP NIS. Mental health stays declined in 2020 but rebounded and are trending upward.",
    ),
    los: buildTrendSeries(
      "Mental Health Hospitalizations",
      "Mean Length of Stay",
      "days",
      [
        [2016, 6.4],
        [2017, 6.3],
        [2018, 6.3],
        [2019, 6.2],
        [2020, 6.5],
        [2021, 6.4],
        [2022, 6.3],
      ],
      "HCUP NIS. Mental health stays are longer than the all-cause average due to the nature of psychiatric stabilization.",
    ),
  },
  cardiovascular: {
    aggregate_cost: buildTrendSeries(
      "Cardiovascular Hospitalizations",
      "Total National Cost",
      "billions USD",
      [
        [2016, 89.2],
        [2017, 91.5],
        [2018, 94.1],
        [2019, 97.0],
        [2020, 82.5],
        [2021, 95.8],
        [2022, 100.4],
      ],
      "HCUP NIS cardiovascular principal diagnoses (AMI, HF, stroke, dysrhythmias, etc.).",
    ),
    mean_cost: buildTrendSeries(
      "Cardiovascular Hospitalizations",
      "Mean Cost per Stay",
      "USD",
      [
        [2016, 16_800],
        [2017, 17_300],
        [2018, 17_900],
        [2019, 18_500],
        [2020, 20_200],
        [2021, 20_800],
        [2022, 21_500],
      ],
      "HCUP NIS. Cardiovascular stays are costlier than average due to interventional procedures.",
    ),
    stays: buildTrendSeries(
      "Cardiovascular Hospitalizations",
      "Total Stays",
      "millions",
      [
        [2016, 5.31],
        [2017, 5.29],
        [2018, 5.26],
        [2019, 5.24],
        [2020, 4.08],
        [2021, 4.61],
        [2022, 4.67],
      ],
      "HCUP NIS. Cardiovascular volume declined in 2020 with patients deferring cardiac care.",
    ),
    los: buildTrendSeries(
      "Cardiovascular Hospitalizations",
      "Mean Length of Stay",
      "days",
      [
        [2016, 4.4],
        [2017, 4.4],
        [2018, 4.3],
        [2019, 4.3],
        [2020, 4.7],
        [2021, 4.7],
        [2022, 4.6],
      ],
      "HCUP NIS. Cardiovascular LOS increased in 2020-2021 with higher-acuity presentations.",
    ),
  },
  orthopedic: {
    aggregate_cost: buildTrendSeries(
      "Orthopedic Hospitalizations",
      "Total National Cost",
      "billions USD",
      [
        [2016, 52.3],
        [2017, 54.8],
        [2018, 57.2],
        [2019, 59.5],
        [2020, 38.4],
        [2021, 52.8],
        [2022, 58.1],
      ],
      "HCUP NIS orthopedic diagnoses and procedures (joint replacements, fractures, spine).",
    ),
    mean_cost: buildTrendSeries(
      "Orthopedic Hospitalizations",
      "Mean Cost per Stay",
      "USD",
      [
        [2016, 18_200],
        [2017, 18_700],
        [2018, 19_200],
        [2019, 19_800],
        [2020, 21_400],
        [2021, 20_900],
        [2022, 21_300],
      ],
      "HCUP NIS. Orthopedic costs per stay are above average due to implant and surgical costs.",
    ),
    stays: buildTrendSeries(
      "Orthopedic Hospitalizations",
      "Total Stays",
      "millions",
      [
        [2016, 2.87],
        [2017, 2.93],
        [2018, 2.98],
        [2019, 3.0],
        [2020, 1.79],
        [2021, 2.53],
        [2022, 2.73],
      ],
      "HCUP NIS. Orthopedic volumes were hardest hit in 2020 as elective joint replacements were postponed.",
    ),
    los: buildTrendSeries(
      "Orthopedic Hospitalizations",
      "Mean Length of Stay",
      "days",
      [
        [2016, 3.2],
        [2017, 3.0],
        [2018, 2.8],
        [2019, 2.6],
        [2020, 2.8],
        [2021, 2.5],
        [2022, 2.3],
      ],
      "HCUP NIS. Orthopedic LOS has trended down substantially due to same-day joint replacement protocols.",
    ),
  },
};

// ─── Data Source Metadata ───────────────────────────────────

export const DATA_SOURCE_INFO = {
  name: "AHRQ Healthcare Cost and Utilization Project (HCUP)",
  url: "https://hcup-us.ahrq.gov/",
  description:
    "HCUP is a family of healthcare databases and related software tools developed through a Federal-State-Industry partnership and sponsored by AHRQ. HCUP databases bring together the data collection efforts of State data organizations, hospital associations, private data organizations, and the Federal government to create a national information resource of encounter-level health care data.",
  databases: [
    {
      name: "National Inpatient Sample (NIS)",
      description:
        "Largest publicly available all-payer inpatient health care database in the United States, yielding national estimates of hospital inpatient stays.",
    },
    {
      name: "Nationwide Emergency Department Sample (NEDS)",
      description:
        "Largest all-payer emergency department database in the United States, yielding national estimates of ED visits.",
    },
    {
      name: "Kids' Inpatient Database (KID)",
      description:
        "Largest publicly available all-payer pediatric inpatient care database in the United States.",
    },
    {
      name: "State Inpatient Databases (SID)",
      description:
        "State-level hospital inpatient databases containing the universe of inpatient discharge records from participating states.",
    },
  ],
  data_years_available: "2016-2022 (curated data embedded in this server)",
  most_recent_year: 2021,
  citation:
    "HCUP National Inpatient Sample (NIS) and Nationwide Emergency Department Sample (NEDS). Healthcare Cost and Utilization Project (HCUP). Agency for Healthcare Research and Quality, Rockville, MD.",
  disclaimer:
    "Statistics presented are approximate national estimates based on published HCUP Statistical Briefs and Fast Stats. They are intended for research reference and should not be used for clinical decision-making. For the most current official data, visit https://hcupnet.ahrq.gov/.",
};
