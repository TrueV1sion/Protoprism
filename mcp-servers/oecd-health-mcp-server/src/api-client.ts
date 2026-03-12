/**
 * OECD SDMX API Client
 *
 * Shared HTTP client with rate limiting for all OECD SDMX REST API requests.
 * Handles SDMX-JSON response parsing, data extraction, and error formatting.
 *
 * The OECD SDMX API returns data in a nested JSON structure where:
 * - `dataSets[0].series` contains observation data keyed by dimension indices
 * - `structure.dimensions.series` describes the dimension metadata
 * - `structure.dimensions.observation` describes the time dimension
 * - Observation values are in series[key].observations[timeIdx][0]
 */

import axios, { AxiosError } from "axios";
import {
  OECD_SDMX_BASE_URL,
  MIN_REQUEST_INTERVAL_MS,
  CHARACTER_LIMIT,
  USER_AGENT,
  HEALTH_AGENCY,
  OECD_COUNTRIES,
  type IndicatorDefinition,
} from "./constants.js";

// ── Types ───────────────────────────────────────────────────

/** A single data observation extracted from SDMX response */
export interface OECDObservation {
  country: string;
  countryCode: string;
  indicator: string;
  year: string;
  value: number | null;
  unit: string;
}

/** Formatted tool response */
export interface OECDToolResponse {
  indicator: string;
  indicatorName: string;
  unit: string;
  dataflow: string;
  totalObservations: number;
  observations: OECDObservation[];
  truncated: boolean;
  note?: string;
}

/** SDMX-JSON dimension value entry */
interface SDMXDimensionValue {
  id: string;
  name: string;
}

/** SDMX-JSON dimension definition */
interface SDMXDimension {
  id: string;
  name: string;
  keyPosition?: number;
  values: SDMXDimensionValue[];
}

/** SDMX-JSON series observation structure */
interface SDMXSeries {
  observations: Record<string, [number | null, ...unknown[]]>;
}

/** SDMX-JSON top-level data response */
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

// ── Rate Limiter ────────────────────────────────────────────

let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastRequestTime = Date.now();
}

// ── SDMX Query Builder ─────────────────────────────────────

/**
 * Build an SDMX data query URL.
 *
 * OECD SDMX REST API pattern:
 *   /data/dataflowId/key?startPeriod=YYYY&endPeriod=YYYY&dimensionAtObservation=TIME_PERIOD
 *
 * The "key" is a dot-separated string of dimension filter values.
 * Use "all" or empty segments for unrestricted dimensions.
 *
 * For the newer OECD SDMX API, the dataflow agency must be included:
 *   /data/{agency},{dataflowId},{version}/{key}
 */
export function buildDataUrl(
  dataflowId: string,
  key: string,
  startPeriod?: number,
  endPeriod?: number,
): string {
  // Use version-agnostic format with agency prefix
  const dataflowRef = `${HEALTH_AGENCY},${dataflowId}`;
  let url = `${OECD_SDMX_BASE_URL}/data/${dataflowRef}/${key}`;

  const params: string[] = [
    "dimensionAtObservation=TIME_PERIOD",
  ];

  if (startPeriod) {
    params.push(`startPeriod=${startPeriod}`);
  }
  if (endPeriod) {
    params.push(`endPeriod=${endPeriod}`);
  }

  url += `?${params.join("&")}`;
  return url;
}

// ── SDMX Response Parser ───────────────────────────────────

/**
 * Parse an SDMX-JSON response into flat observation records.
 *
 * SDMX-JSON structure:
 * - dataSets[0].series: { "0:1:2:3": { observations: { "0": [value], "1": [value] } } }
 * - structure.dimensions.series: metadata for each dimension position
 * - structure.dimensions.observation: metadata for time/observation dimension
 *
 * The series key (e.g., "0:1:2:3") is a colon-separated list of indices
 * into the corresponding dimension's values array.
 */
export function parseSDMXResponse(
  data: SDMXDataResponse,
  indicator: IndicatorDefinition,
): OECDObservation[] {
  const observations: OECDObservation[] = [];

  const dataSet = data.dataSets?.[0];
  if (!dataSet?.series) {
    return observations;
  }

  const seriesDimensions = data.structure?.dimensions?.series ?? [];
  const obsDimensions = data.structure?.dimensions?.observation ?? [];

  // Find the reference area (country) dimension
  const refAreaDimIndex = seriesDimensions.findIndex(
    (d) => d.id === "REF_AREA" || d.id === "COUNTRY" || d.id === "COU",
  );

  // Find the time period dimension in observation dimensions
  const timeDim = obsDimensions.find(
    (d) => d.id === "TIME_PERIOD" || d.id === "TIME",
  );
  const timeValues = timeDim?.values ?? [];

  for (const [seriesKey, seriesData] of Object.entries(dataSet.series)) {
    const dimensionIndices = seriesKey.split(":").map(Number);

    // Extract country code from the series key
    let countryCode = "UNKNOWN";
    if (refAreaDimIndex >= 0 && dimensionIndices[refAreaDimIndex] !== undefined) {
      const dimValues = seriesDimensions[refAreaDimIndex]?.values ?? [];
      const dimIdx = dimensionIndices[refAreaDimIndex];
      if (dimIdx !== undefined && dimValues[dimIdx]) {
        countryCode = dimValues[dimIdx].id;
      }
    }

    const countryName =
      OECD_COUNTRIES[countryCode] ?? countryCode;

    // Extract observations (time series data points)
    for (const [obsKey, obsValues] of Object.entries(
      seriesData.observations,
    )) {
      const timeIdx = parseInt(obsKey, 10);
      const year = timeValues[timeIdx]?.id ?? obsKey;
      const value = obsValues[0] ?? null;

      observations.push({
        country: countryName,
        countryCode,
        indicator: indicator.id,
        year,
        value,
        unit: indicator.unit,
      });
    }
  }

  // Sort by country then year
  observations.sort((a, b) => {
    const cmp = a.countryCode.localeCompare(b.countryCode);
    if (cmp !== 0) return cmp;
    return a.year.localeCompare(b.year);
  });

  return observations;
}

// ── Main Request Function ───────────────────────────────────

/**
 * Fetch OECD health data for a given indicator and optional filters.
 *
 * @param indicator - The indicator definition from constants
 * @param countries - Array of ISO3 country codes (empty = all OECD)
 * @param startYear - Start year filter (optional)
 * @param endYear - End year filter (optional)
 * @returns Formatted response with parsed observations
 */
export async function fetchOECDData(
  indicator: IndicatorDefinition,
  countries: string[],
  startYear?: number,
  endYear?: number,
): Promise<OECDToolResponse> {
  await enforceRateLimit();

  // Build the SDMX key filter
  // For SHA dataflow the key structure is:
  //   REF_AREA.FUNCTION.PROVIDER.FINANCING.MEASURE
  // For HEALTH_STAT/HEALTH_REAC/etc the key is simpler:
  //   REF_AREA.VARIABLE
  // We build country filter using "+" for multi-value
  const countryFilter =
    countries.length > 0 ? countries.join("+") : "";

  // Construct the key: country.indicatorDimensions
  const key = `${countryFilter}.${indicator.dimensionFilter}`;

  const url = buildDataUrl(
    indicator.dataflow,
    key,
    startYear,
    endYear,
  );

  try {
    const response = await axios.get<SDMXDataResponse>(url, {
      timeout: 30000,
      headers: {
        Accept:
          "application/vnd.sdmx.data+json;charset=utf-8;version=2.0.0",
        "User-Agent": USER_AGENT,
      },
    });

    const observations = parseSDMXResponse(response.data, indicator);

    return formatToolResponse(observations, indicator);
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;

      if (status === 404) {
        // Try with accept header version 1
        return await fetchOECDDataFallback(
          indicator,
          countries,
          startYear,
          endYear,
        );
      }

      if (status === 413 || status === 400) {
        throw new Error(
          `OECD API error (HTTP ${status}): The query is too broad or contains invalid parameters. ` +
            "Try narrowing the country list or date range. " +
            `Requested URL: ${url}`,
        );
      }

      if (status === 429) {
        throw new Error(
          "OECD API rate limit exceeded. Please wait a moment and try again.",
        );
      }

      if (status === 503 || status === 500) {
        throw new Error(
          `OECD API is temporarily unavailable (HTTP ${status}). Try again later.`,
        );
      }

      throw new Error(
        `OECD API request failed (HTTP ${status ?? "unknown"}): ${error.message}`,
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Unexpected error during OECD API request: ${String(error)}`,
    );
  }
}

/**
 * Fallback request using SDMX-JSON version 1 accept header and
 * a slightly different URL format.
 */
async function fetchOECDDataFallback(
  indicator: IndicatorDefinition,
  countries: string[],
  startYear?: number,
  endYear?: number,
): Promise<OECDToolResponse> {
  await enforceRateLimit();

  const countryFilter =
    countries.length > 0 ? countries.join("+") : "";
  const key = `${countryFilter}.${indicator.dimensionFilter}`;

  // Try without version in the dataflow reference
  let url = `${OECD_SDMX_BASE_URL}/data/${HEALTH_AGENCY},${indicator.dataflow}/${key}`;
  const params: string[] = [
    "dimensionAtObservation=TIME_PERIOD",
  ];
  if (startYear) params.push(`startPeriod=${startYear}`);
  if (endYear) params.push(`endPeriod=${endYear}`);
  url += `?${params.join("&")}`;

  try {
    const response = await axios.get<SDMXDataResponse>(url, {
      timeout: 30000,
      headers: {
        Accept: "application/vnd.sdmx.data+json;charset=utf-8",
        "User-Agent": USER_AGENT,
      },
    });

    const observations = parseSDMXResponse(response.data, indicator);
    return formatToolResponse(observations, indicator);
  } catch (fallbackError) {
    if (fallbackError instanceof AxiosError) {
      const status = fallbackError.response?.status;
      if (status === 404) {
        // No data available for this indicator/country/period combination
        return formatToolResponse([], indicator, "No data found for the requested indicator, countries, or time period. " +
          "Try broadening your search or using different countries/years.");
      }
      throw new Error(
        `OECD API request failed (HTTP ${status ?? "unknown"}): ${fallbackError.message}. ` +
          `URL: ${url}`,
      );
    }
    throw fallbackError;
  }
}

// ── Response Formatting ─────────────────────────────────────

function formatToolResponse(
  observations: OECDObservation[],
  indicator: IndicatorDefinition,
  note?: string,
): OECDToolResponse {
  let truncated = false;
  let finalObservations = observations;

  // Check if serialized response exceeds character limit
  const serialized = JSON.stringify(observations);
  if (serialized.length > CHARACTER_LIMIT) {
    truncated = true;
    let truncatedObs = [...observations];
    while (
      truncatedObs.length > 1 &&
      JSON.stringify(truncatedObs).length > CHARACTER_LIMIT
    ) {
      truncatedObs = truncatedObs.slice(
        0,
        Math.max(1, Math.floor(truncatedObs.length * 0.75)),
      );
    }
    finalObservations = truncatedObs;
  }

  return {
    indicator: indicator.id,
    indicatorName: indicator.name,
    unit: indicator.unit,
    dataflow: indicator.dataflow,
    totalObservations: observations.length,
    observations: finalObservations,
    truncated,
    ...(note ? { note } : {}),
  };
}

/**
 * Truncate a JSON-stringified result to fit within CHARACTER_LIMIT.
 */
export function truncateResponse(text: string): { text: string; truncated: boolean } {
  if (text.length <= CHARACTER_LIMIT) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, CHARACTER_LIMIT) + "\n\n[Truncated - response exceeded 25,000 character limit]",
    truncated: true,
  };
}
