// src/lib/data-sources/clients/census-bureau.ts
/**
 * Census Bureau API Client (Layer 1)
 *
 * Internal HTTP client for the US Census Bureau public API.
 * Transforms the array-of-arrays response format into typed record objects.
 *
 * Ported from mcp-servers/census-bureau-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.census.gov/data";

// 5 req/s — Census is generous but we respect server capacity
const clientLimiter = new TokenBucketLimiter(5);

// ─── Types ───────────────────────────────────────────────────

export interface CensusRecord {
  [key: string]: string | number | null;
}

export interface CensusQueryResult {
  headers: string[];
  records: CensusRecord[];
  totalRecords: number;
  hasMore: boolean;
}

export interface CensusVariablesResult {
  variables: Array<{ code: string; label: string; concept: string }>;
  hasMore: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

function buildDatasetPath(year: number, dataset: string): string {
  if (dataset === "timeseries/healthins/sahie") {
    return `/${dataset}`;
  }
  return `/${year}/${dataset}`;
}

function parseGeography(geography: string): { forParam: string; inParam?: string } {
  if (geography.toLowerCase() === "us") {
    return { forParam: "us:1" };
  }
  const inIdx = geography.indexOf("&in=");
  if (inIdx !== -1) {
    return {
      forParam: geography.slice(0, inIdx),
      inParam: geography.slice(inIdx + 4),
    };
  }
  return { forParam: geography };
}

function transformCensusRows(rows: string[][]): CensusRecord[] {
  if (rows.length === 0) return [];
  const headers = rows[0];
  const records: CensusRecord[] = [];

  for (const row of rows.slice(1)) {
    const record: CensusRecord = {};
    for (let i = 0; i < headers.length; i++) {
      const value = row[i];
      if (value === null || value === undefined || value === "") {
        record[headers[i]] = null;
      } else if (value === "-666666666" || value === "-999999999") {
        // Census sentinel values for "not available"
        record[headers[i]] = null;
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        record[headers[i]] = Number(value);
      } else {
        record[headers[i]] = value;
      }
    }
    records.push(record);
  }
  return records;
}

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "US Census Bureau",
  };
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  datasetPath: string,
  params: Record<string, string | undefined>,
): Promise<ApiResponse<CensusQueryResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const apiKey = process.env.CENSUS_API_KEY;
    const urlParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) urlParams.set(key, value);
    }
    if (apiKey) urlParams.set("key", apiKey);

    const url = `${BASE_URL}${datasetPath}?${urlParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0 (research@protoprism.ai)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 204) {
      throw new Error(
        "Census API returned no data for this query. The requested variables or geography may not be available.",
      );
    }

    if (response.status === 400) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Census API bad request (400): ${text.slice(0, 500)}. Check variable names, geography format, and year.`,
      );
    }

    if (response.status === 404) {
      return {
        data: { headers: [], records: [], totalRecords: 0, hasMore: false },
        status: 404,
        vintage: makeVintage(),
      };
    }

    if (response.status === 429) {
      throw new Error("Census API rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Census API error: ${response.status} - ${text.slice(0, 500)}`,
      );
    }

    const rawData = (await response.json()) as string[][];

    if (!Array.isArray(rawData) || rawData.length === 0) {
      throw new Error("Census API returned empty or malformed response");
    }

    const headers = rawData[0];
    const records = transformCensusRows(rawData);
    const totalRecords = records.length;

    return {
      data: { headers, records, totalRecords, hasMore: false },
      status: response.status,
      vintage: makeVintage(),
    };
  } finally {
    globalRateLimiter.release();
  }
}

// ─── Public API ──────────────────────────────────────────────

export const censusBureauClient = {
  /**
   * Fetch ACS data for specified variables and geography.
   */
  async getAcsData(params: {
    year: number;
    variables: string[];
    geography: string;
    dataset?: string;
  }): Promise<ApiResponse<CensusQueryResult>> {
    const dataset = params.dataset ?? "acs/acs5";
    const datasetPath = buildDatasetPath(params.year, dataset);
    const { forParam, inParam } = parseGeography(params.geography);

    const queryParams: Record<string, string | undefined> = {
      get: params.variables.join(","),
      for: forParam,
      in: inParam,
    };

    return makeRequest(datasetPath, queryParams);
  },

  /**
   * Fetch SAHIE (Small Area Health Insurance Estimates) data.
   */
  async getSahieData(params: {
    year?: number;
    stateFips?: string;
    countyFips?: string;
    ageCat?: string;
    incomeCat?: string;
  }): Promise<ApiResponse<CensusQueryResult>> {
    const datasetPath = buildDatasetPath(0, "timeseries/healthins/sahie");

    const variables = [
      "NIC_PT", "NIC_MOE", "NUI_PT", "NUI_MOE",
      "PCTIC_PT", "PCTIC_MOE", "PCTUI_PT", "PCTUI_MOE",
      "NAME", "STABREV", "GEOCAT", "AGECAT", "RACECAT", "SEXCAT", "IPRCAT",
    ].join(",");

    const queryParams: Record<string, string | undefined> = {
      get: variables,
      RACECAT: "0",
      SEXCAT: "0",
    };

    if (params.year) queryParams.time = String(params.year);

    if (params.countyFips && params.stateFips) {
      queryParams.for = `county:${params.countyFips}`;
      queryParams.in = `state:${params.stateFips}`;
    } else if (params.stateFips) {
      queryParams.for = `state:${params.stateFips}`;
    } else {
      queryParams.for = "state:*";
    }

    if (params.ageCat) queryParams.AGECAT = params.ageCat;
    if (params.incomeCat) queryParams.IPRCAT = params.incomeCat;

    return makeRequest(datasetPath, queryParams);
  },

  /**
   * Fetch the variable list for a given dataset.
   */
  async listVariables(params: {
    year: number;
    dataset: string;
    tablePrefix?: string;
  }): Promise<ApiResponse<CensusVariablesResult>> {
    await globalRateLimiter.acquire();
    try {
      await clientLimiter.acquire();

      const datasetPath = buildDatasetPath(params.year, params.dataset);
      const apiKey = process.env.CENSUS_API_KEY;
      const urlParams = new URLSearchParams();
      if (apiKey) urlParams.set("key", apiKey);

      const url = `${BASE_URL}${datasetPath}/variables.json?${urlParams.toString()}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Protoprism/1.0 (research@protoprism.ai)",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch variable list: ${response.status} - ${response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        variables: Record<string, { label: string; concept?: string; group?: string }>;
      };

      const allVars = data.variables;
      const variables: Array<{ code: string; label: string; concept: string }> = [];

      for (const [code, meta] of Object.entries(allVars)) {
        if (code === "for" || code === "in" || code === "ucgid" || code === "NAME") {
          continue;
        }
        if (params.tablePrefix && !code.startsWith(params.tablePrefix)) {
          continue;
        }
        variables.push({
          code,
          label: meta.label ?? "",
          concept: meta.concept ?? meta.group ?? "",
        });
      }

      variables.sort((a, b) => a.code.localeCompare(b.code));

      return {
        data: { variables, hasMore: false },
        status: response.status,
        vintage: makeVintage(),
      };
    } finally {
      globalRateLimiter.release();
    }
  },

  /**
   * Raw query — supply the dataset path and params directly.
   */
  async rawQuery(params: {
    datasetPath: string;
    get: string;
    for?: string;
    in?: string;
    [key: string]: string | undefined;
  }): Promise<ApiResponse<CensusQueryResult>> {
    const { datasetPath, ...rest } = params;
    return makeRequest(datasetPath, rest as Record<string, string | undefined>);
  },
};
