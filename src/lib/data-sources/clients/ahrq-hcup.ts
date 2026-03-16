// src/lib/data-sources/clients/ahrq-hcup.ts
/**
 * AHRQ HCUP Client (Layer 1)
 *
 * Internal client for AHRQ HCUP (Healthcare Cost and Utilization Project) data.
 * HCUP does not provide a public REST API; this client uses embedded reference
 * data and optional HTTP fetching from HCUPnet for future extensibility.
 *
 * Ported from mcp-servers/ahrq-hcup-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 * - Embedded data search functions remain synchronous
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const HCUPNET_BASE_URL = "https://hcupnet.ahrq.gov";

// 3 req/s
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface HCUPDiagnosisStats {
  name: string;
  aliases: string[];
  icd10_category: string;
  description: string;
  annual_discharges: number;
  aggregate_cost: number;
  mean_cost: number;
  mortality_rate?: number;
  mean_los?: number;
}

export interface HCUPProcedureStats {
  name: string;
  aliases: string[];
  icd10_pcs_category: string;
  description: string;
  annual_discharges: number;
  aggregate_cost: number;
  mean_cost: number;
}

export interface HCUPSearchResult {
  results: Array<{
    score: number;
    result_type: "inpatient_diagnosis" | "ed_diagnosis" | "procedure";
    data: HCUPDiagnosisStats | HCUPProcedureStats;
  }>;
  total: number;
  query: string;
}

export interface HCUPTopConditionsResult {
  conditions: HCUPDiagnosisStats[];
  rankedBy: string;
  setting: string;
  total: number;
}

// ─── Embedded Data (representative subset) ───────────────────
// Full datasets live in the MCP server constants. Here we embed
// a curated subset for the Layer 1 client to serve without HTTP calls.

const INPATIENT_DIAGNOSES: HCUPDiagnosisStats[] = [
  {
    name: "Septicemia",
    aliases: ["Sepsis", "Blood poisoning"],
    icd10_category: "A40-A41",
    description: "Systemic bacterial infection (septicemia/sepsis)",
    annual_discharges: 3_900_000,
    aggregate_cost: 62_000_000_000,
    mean_cost: 15_900,
    mortality_rate: 0.158,
    mean_los: 7.5,
  },
  {
    name: "Heart failure",
    aliases: ["Congestive heart failure", "CHF"],
    icd10_category: "I50",
    description: "Heart failure including systolic and diastolic",
    annual_discharges: 3_100_000,
    aggregate_cost: 28_000_000_000,
    mean_cost: 9_000,
    mortality_rate: 0.036,
    mean_los: 5.1,
  },
  {
    name: "Pneumonia",
    aliases: ["Community-acquired pneumonia", "CAP"],
    icd10_category: "J12-J18",
    description: "Pneumonia from various causes",
    annual_discharges: 1_400_000,
    aggregate_cost: 14_000_000_000,
    mean_cost: 10_000,
    mortality_rate: 0.03,
    mean_los: 4.8,
  },
  {
    name: "Osteoarthritis",
    aliases: ["OA", "Degenerative joint disease"],
    icd10_category: "M15-M19",
    description: "Osteoarthritis of various joints",
    annual_discharges: 1_200_000,
    aggregate_cost: 14_000_000_000,
    mean_cost: 11_500,
    mortality_rate: 0.001,
    mean_los: 3.2,
  },
];

const ED_DIAGNOSES: HCUPDiagnosisStats[] = [
  {
    name: "Superficial injuries",
    aliases: ["Minor trauma", "Lacerations"],
    icd10_category: "S00-S09",
    description: "Superficial injuries and contusions",
    annual_discharges: 16_000_000,
    aggregate_cost: 9_000_000_000,
    mean_cost: 560,
    mortality_rate: 0.0001,
    mean_los: 0.1,
  },
  {
    name: "Chest pain",
    aliases: ["Precordial pain", "Angina NOS"],
    icd10_category: "R07",
    description: "Chest pain, unspecified",
    annual_discharges: 9_500_000,
    aggregate_cost: 8_500_000_000,
    mean_cost: 890,
    mortality_rate: 0.0005,
    mean_los: 0.2,
  },
];

const PROCEDURES: HCUPProcedureStats[] = [
  {
    name: "Hip replacement",
    aliases: ["Total hip arthroplasty", "THA"],
    icd10_pcs_category: "0SR",
    description: "Total hip replacement procedures",
    annual_discharges: 750_000,
    aggregate_cost: 15_000_000_000,
    mean_cost: 20_000,
  },
  {
    name: "Knee replacement",
    aliases: ["Total knee arthroplasty", "TKA"],
    icd10_pcs_category: "0ST",
    description: "Total knee replacement procedures",
    annual_discharges: 1_100_000,
    aggregate_cost: 18_000_000_000,
    mean_cost: 16_400,
  },
  {
    name: "Spinal fusion",
    aliases: ["Spine fusion", "Lumbar fusion"],
    icd10_pcs_category: "0SG",
    description: "Spinal fusion and stabilization procedures",
    annual_discharges: 600_000,
    aggregate_cost: 16_000_000_000,
    mean_cost: 26_700,
  },
];

// ─── Fuzzy Search ────────────────────────────────────────────

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (q === t) return 1.0;
  if (t.includes(q)) return 0.9;
  if (q.includes(t)) return 0.8;

  const queryTokens = q.split(/\s+/);
  const targetTokens = t.split(/[\s/,()-]+/);

  let matchedTokens = 0;
  for (const qt of queryTokens) {
    if (qt.length < 2) continue;
    if (targetTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
      matchedTokens++;
    }
  }

  if (queryTokens.length > 0) {
    const tokenScore = matchedTokens / queryTokens.length;
    if (tokenScore > 0) return 0.3 + tokenScore * 0.5;
  }

  return 0;
}

function scoreRecord(
  query: string,
  record: { name: string; aliases: string[]; description: string } & (
    | { icd10_category: string }
    | { icd10_pcs_category: string }
  ),
): number {
  const scores: number[] = [
    fuzzyScore(query, record.name),
    ...record.aliases.map((a) => fuzzyScore(query, a) * 0.95),
    fuzzyScore(query, record.description) * 0.5,
  ];

  const icdCode =
    "icd10_category" in record ? record.icd10_category : record.icd10_pcs_category;
  scores.push(fuzzyScore(query, icdCode) * 0.85);

  return Math.max(...scores);
}

// ─── HTTP Request (for future HCUPnet queries) ────────────────

async function fetchUrl(url: string): Promise<string> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Protoprism/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429) {
      throw new Error("AHRQ HCUP rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      throw new Error(`AHRQ HCUP HTTP error (${response.status}): ${url}`);
    }

    return response.text();
  } finally {
    globalRateLimiter.release();
  }
}

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    dataThrough: "2021",
    source: "AHRQ HCUP (NIS/NEDS Statistical Briefs)",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const ahrqHcupClient = {
  async searchAll(params: {
    query: string;
    dataType?: "inpatient" | "emergency" | "all";
    limit?: number;
  }): Promise<ApiResponse<HCUPSearchResult>> {
    const limit = params.limit ?? 10;
    const dataType = params.dataType ?? "all";
    const query = params.query;

    const results: HCUPSearchResult["results"] = [];

    if (dataType === "inpatient" || dataType === "all") {
      for (const d of INPATIENT_DIAGNOSES) {
        const score = scoreRecord(query, d);
        if (score > 0.1) {
          results.push({ score, result_type: "inpatient_diagnosis", data: d });
        }
      }
      for (const p of PROCEDURES) {
        const score = scoreRecord(query, p);
        if (score > 0.1) {
          results.push({ score, result_type: "procedure", data: p });
        }
      }
    }

    if (dataType === "emergency" || dataType === "all") {
      for (const d of ED_DIAGNOSES) {
        const score = scoreRecord(query, d);
        if (score > 0.1) {
          results.push({ score, result_type: "ed_diagnosis", data: d });
        }
      }
    }

    const sorted = results.sort((a, b) => b.score - a.score).slice(0, limit);

    return {
      data: {
        results: sorted,
        total: sorted.length,
        query,
      },
      status: 200,
      vintage: makeVintage(),
    };
  },

  async getTopConditions(params: {
    rankedBy?: "hospitalizations" | "aggregate_cost" | "mean_cost" | "mortality" | "los";
    setting?: "inpatient" | "emergency";
    limit?: number;
  } = {}): Promise<ApiResponse<HCUPTopConditionsResult>> {
    const rankedBy = params.rankedBy ?? "hospitalizations";
    const setting = params.setting ?? "inpatient";
    const limit = params.limit ?? 20;

    const data = setting === "inpatient" ? INPATIENT_DIAGNOSES : ED_DIAGNOSES;

    const sorted = [...data].sort((a, b) => {
      switch (rankedBy) {
        case "hospitalizations": return b.annual_discharges - a.annual_discharges;
        case "aggregate_cost": return b.aggregate_cost - a.aggregate_cost;
        case "mean_cost": return b.mean_cost - a.mean_cost;
        case "mortality": return (b.mortality_rate ?? 0) - (a.mortality_rate ?? 0);
        case "los": return (b.mean_los ?? 0) - (a.mean_los ?? 0);
        default: return b.annual_discharges - a.annual_discharges;
      }
    });

    return {
      data: {
        conditions: sorted.slice(0, limit),
        rankedBy,
        setting,
        total: sorted.length,
      },
      status: 200,
      vintage: makeVintage(),
    };
  },

  async fetchHCUPnetData(params: {
    url?: string;
  } = {}): Promise<ApiResponse<{ content: string }>> {
    const url = params.url ?? `${HCUPNET_BASE_URL}/#query/topic=NIS`;
    const content = await fetchUrl(url);
    return {
      data: { content },
      status: 200,
      vintage: makeVintage(),
    };
  },
};
