// src/lib/data-sources/clients/oecd-health.ts
/**
 * OECD Health Statistics Client (Layer 1)
 *
 * Internal HTTP client for the OECD SDMX REST API. Handles query construction,
 * rate limiting, SDMX-JSON response parsing, and error handling.
 * Not exposed to agents.
 *
 * Ported from mcp-servers/oecd-health-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://sdmx.oecd.org/public/rest";
const HEALTH_AGENCY = "OECD.ELS.HD";

// 3 req/s
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface OECDObservation {
  country: string;
  countryCode: string;
  indicator: string;
  year: string;
  value: number | null;
  unit: string;
}

export interface OECDHealthResult {
  indicator: string;
  unit: string;
  dataflow: string;
  totalObservations: number;
  observations: OECDObservation[];
}

interface SDMXDimensionValue {
  id: string;
  name: string;
}

interface SDMXDimension {
  id: string;
  name: string;
  keyPosition?: number;
  values: SDMXDimensionValue[];
}

interface SDMXSeries {
  observations: Record<string, [number | null, ...unknown[]]>;
}

interface SDMXDataResponse {
  dataSets?: Array<{
    series?: Record<string, SDMXSeries>;
  }>;
  structure?: {
    dimensions?: {
      series?: SDMXDimension[];
      observation?: SDMXDimension[];
    };
  };
}

// Country code → name map (subset of OECD members)
const OECD_COUNTRIES: Record<string, string> = {
  AUS: "Australia", AUT: "Austria", BEL: "Belgium", CAN: "Canada",
  CHL: "Chile", COL: "Colombia", CRI: "Costa Rica", CZE: "Czechia",
  DNK: "Denmark", EST: "Estonia", FIN: "Finland", FRA: "France",
  DEU: "Germany", GRC: "Greece", HUN: "Hungary", ISL: "Iceland",
  IRL: "Ireland", ISR: "Israel", ITA: "Italy", JPN: "Japan",
  KOR: "Korea", LVA: "Latvia", LTU: "Lithuania", LUX: "Luxembourg",
  MEX: "Mexico", NLD: "Netherlands", NZL: "New Zealand", NOR: "Norway",
  POL: "Poland", PRT: "Portugal", SVK: "Slovakia", SVN: "Slovenia",
  ESP: "Spain", SWE: "Sweden", CHE: "Switzerland", TUR: "Turkey",
  GBR: "United Kingdom", USA: "United States",
};

// ─── SDMX Parsing ────────────────────────────────────────────

function parseSDMXResponse(
  data: SDMXDataResponse,
  indicatorId: string,
  unit: string,
): OECDObservation[] {
  const observations: OECDObservation[] = [];

  const dataSet = data.dataSets?.[0];
  if (!dataSet?.series) return observations;

  const seriesDimensions = data.structure?.dimensions?.series ?? [];
  const obsDimensions = data.structure?.dimensions?.observation ?? [];

  const refAreaDimIndex = seriesDimensions.findIndex(
    (d) => d.id === "REF_AREA" || d.id === "COUNTRY" || d.id === "COU",
  );

  const timeDim = obsDimensions.find(
    (d) => d.id === "TIME_PERIOD" || d.id === "TIME",
  );
  const timeValues = timeDim?.values ?? [];

  for (const [seriesKey, seriesData] of Object.entries(dataSet.series)) {
    const dimensionIndices = seriesKey.split(":").map(Number);

    let countryCode = "UNKNOWN";
    if (refAreaDimIndex >= 0 && dimensionIndices[refAreaDimIndex] !== undefined) {
      const dimValues = seriesDimensions[refAreaDimIndex]?.values ?? [];
      const dimIdx = dimensionIndices[refAreaDimIndex];
      if (dimIdx !== undefined && dimValues[dimIdx]) {
        countryCode = dimValues[dimIdx].id;
      }
    }

    const countryName = OECD_COUNTRIES[countryCode] ?? countryCode;

    for (const [obsKey, obsValues] of Object.entries(seriesData.observations)) {
      const timeIdx = parseInt(obsKey, 10);
      const year = timeValues[timeIdx]?.id ?? obsKey;
      const value = obsValues[0] ?? null;

      observations.push({
        country: countryName,
        countryCode,
        indicator: indicatorId,
        year,
        value,
        unit,
      });
    }
  }

  observations.sort((a, b) => {
    const cmp = a.countryCode.localeCompare(b.countryCode);
    if (cmp !== 0) return cmp;
    return a.year.localeCompare(b.year);
  });

  return observations;
}

// ─── Core Request ────────────────────────────────────────────

async function makeSDMXRequest(
  dataflowId: string,
  key: string,
  startYear?: number,
  endYear?: number,
  acceptHeader = "application/vnd.sdmx.data+json;charset=utf-8;version=2.0.0",
): Promise<{ data: SDMXDataResponse; status: number }> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const dataflowRef = `${HEALTH_AGENCY},${dataflowId}`;
    const params: string[] = ["dimensionAtObservation=TIME_PERIOD"];
    if (startYear) params.push(`startPeriod=${startYear}`);
    if (endYear) params.push(`endPeriod=${endYear}`);

    const url = `${BASE_URL}/data/${dataflowRef}/${key}?${params.join("&")}`;

    const response = await fetch(url, {
      headers: {
        Accept: acceptHeader,
        "User-Agent": "Protoprism/1.0",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (response.status === 404) {
      return { data: {}, status: 404 };
    }

    if (response.status === 429) {
      throw new Error("OECD API rate limit exceeded. Please wait a moment and try again.");
    }

    if (!response.ok) {
      throw new Error(`OECD API request failed (HTTP ${response.status})`);
    }

    const data = (await response.json()) as SDMXDataResponse;
    return { data, status: response.status };
  } finally {
    globalRateLimiter.release();
  }
}

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "OECD Health Statistics (SDMX)",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const oecdHealthClient = {
  async getHealthData(params: {
    dataflowId: string;
    indicatorId: string;
    unit?: string;
    countries?: string[];
    dimensionFilter?: string;
    startYear?: number;
    endYear?: number;
  }): Promise<ApiResponse<OECDHealthResult>> {
    const countryFilter = (params.countries ?? []).join("+");
    const dimFilter = params.dimensionFilter ?? "all";
    const key = `${countryFilter}.${dimFilter}`;
    const unit = params.unit ?? "";

    let result: { data: SDMXDataResponse; status: number };

    try {
      result = await makeSDMXRequest(
        params.dataflowId,
        key,
        params.startYear,
        params.endYear,
      );
    } catch (err) {
      // Re-throw rate limit and fatal errors; only fall back on format/parse errors
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("rate limit") || msg.includes("403")) {
        throw err;
      }
      // Fallback with version 1 accept header
      result = await makeSDMXRequest(
        params.dataflowId,
        key,
        params.startYear,
        params.endYear,
        "application/vnd.sdmx.data+json;charset=utf-8",
      );
    }

    if (result.status === 404) {
      return {
        data: {
          indicator: params.indicatorId,
          unit,
          dataflow: params.dataflowId,
          totalObservations: 0,
          observations: [],
        },
        status: 404,
        vintage: makeVintage(),
      };
    }

    const observations = parseSDMXResponse(result.data, params.indicatorId, unit);

    return {
      data: {
        indicator: params.indicatorId,
        unit,
        dataflow: params.dataflowId,
        totalObservations: observations.length,
        observations,
      },
      status: result.status,
      vintage: makeVintage(),
    };
  },

  async getHealthExpenditures(params: {
    countries?: string[];
    startYear?: number;
    endYear?: number;
  } = {}): Promise<ApiResponse<OECDHealthResult>> {
    return this.getHealthData({
      dataflowId: "SHA",
      indicatorId: "HEALTH_EXP_GDP",
      unit: "% GDP",
      countries: params.countries,
      dimensionFilter: "all",
      startYear: params.startYear,
      endYear: params.endYear,
    });
  },

  async getLifeExpectancy(params: {
    countries?: string[];
    startYear?: number;
    endYear?: number;
  } = {}): Promise<ApiResponse<OECDHealthResult>> {
    return this.getHealthData({
      dataflowId: "HEALTH_STAT",
      indicatorId: "LIFE_EXP",
      unit: "Years",
      countries: params.countries,
      dimensionFilter: "LIFEEXP.T",
      startYear: params.startYear,
      endYear: params.endYear,
    });
  },

  async getDoctors(params: {
    countries?: string[];
    startYear?: number;
    endYear?: number;
  } = {}): Promise<ApiResponse<OECDHealthResult>> {
    return this.getHealthData({
      dataflowId: "HEALTH_REAC",
      indicatorId: "PHYSICIANS",
      unit: "Per 1,000 population",
      countries: params.countries,
      dimensionFilter: "PHYSDENS.TOTAL",
      startYear: params.startYear,
      endYear: params.endYear,
    });
  },
};
