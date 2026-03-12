/**
 * Census Bureau API client
 *
 * Handles HTTP requests to the Census Bureau API, response parsing,
 * and transformation of the array-of-arrays format to JSON objects.
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { CENSUS_BASE_URL, CHARACTER_LIMIT } from "./constants.js";

// ─── Types ──────────────────────────────────────────────────

export interface CensusApiOptions {
  apiKey: string;
}

export interface CensusQueryParams {
  get: string;
  for?: string;
  in?: string;
  key?: string;
  [key: string]: string | undefined;
}

export interface CensusRecord {
  [key: string]: string | number | null;
}

export interface CensusResponse {
  headers: string[];
  records: CensusRecord[];
  totalRecords: number;
  truncated: boolean;
}

// ─── Client ─────────────────────────────────────────────────

export class CensusApiClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(options: CensusApiOptions) {
    this.apiKey = options.apiKey;
    this.client = axios.create({
      baseURL: CENSUS_BASE_URL,
      timeout: 30_000,
      headers: {
        Accept: "application/json",
      },
    });
  }

  /**
   * Builds the full dataset path for a given year and dataset.
   *
   * @example buildDatasetPath(2022, "acs/acs5") => "/2022/acs/acs5"
   */
  buildDatasetPath(year: number, dataset: string): string {
    if (dataset === "timeseries/healthins/sahie") {
      return `/${dataset}`;
    }
    return `/${year}/${dataset}`;
  }

  /**
   * Makes a raw query to the Census API and returns the raw array response.
   */
  async rawQuery(
    datasetPath: string,
    params: CensusQueryParams
  ): Promise<string[][]> {
    const queryParams: Record<string, string> = {
      ...params,
      key: this.apiKey,
    };

    // Remove undefined values
    for (const key of Object.keys(queryParams)) {
      if (queryParams[key] === undefined) {
        delete queryParams[key];
      }
    }

    try {
      const response = await this.client.get<string[][]>(datasetPath, {
        params: queryParams,
      });

      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error("Census API returned empty or malformed response");
      }

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const body =
          typeof error.response?.data === "string"
            ? error.response.data
            : JSON.stringify(error.response?.data ?? "");

        if (status === 204) {
          throw new Error(
            "Census API returned no data for this query. The requested variables or geography may not be available for the specified year/dataset."
          );
        }
        if (status === 400) {
          throw new Error(
            `Census API bad request (400): ${body.slice(0, 500)}. Check variable names, geography format, and year.`
          );
        }
        if (status === 404) {
          throw new Error(
            `Census API endpoint not found (404). The dataset or year may not be available. Path: ${datasetPath}`
          );
        }
        if (status === 500 || status === 503) {
          throw new Error(
            `Census API server error (${status}). The service may be temporarily unavailable. Try again later.`
          );
        }
        throw new Error(
          `Census API error: ${status ?? "unknown"} - ${body.slice(0, 500)}`
        );
      }
      throw error;
    }
  }

  /**
   * Queries the Census API and transforms the array-of-arrays response
   * into a structured JSON format with headers and record objects.
   */
  async query(
    datasetPath: string,
    params: CensusQueryParams
  ): Promise<CensusResponse> {
    const rawData = await this.rawQuery(datasetPath, params);

    const headers = rawData[0];
    const dataRows = rawData.slice(1);
    const totalRecords = dataRows.length;

    // Transform rows into objects and enforce character limit
    const records: CensusRecord[] = [];
    let charCount = JSON.stringify(headers).length;
    let truncated = false;

    for (const row of dataRows) {
      const record: CensusRecord = {};
      for (let i = 0; i < headers.length; i++) {
        const value = row[i];
        // Try to parse numeric values
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

      const recordStr = JSON.stringify(record);
      charCount += recordStr.length;

      if (charCount > CHARACTER_LIMIT) {
        truncated = true;
        break;
      }

      records.push(record);
    }

    return {
      headers,
      records,
      totalRecords,
      truncated,
    };
  }

  /**
   * Fetches ACS data for the specified variables and geography.
   */
  async getAcsData(
    year: number,
    variables: string[],
    geography: string,
    dataset: string = "acs/acs5"
  ): Promise<CensusResponse> {
    const datasetPath = this.buildDatasetPath(year, dataset);

    // Parse geography string into for/in params
    const { forParam, inParam } = this.parseGeography(geography);

    const params: CensusQueryParams = {
      get: variables.join(","),
      for: forParam,
    };

    if (inParam) {
      params.in = inParam;
    }

    return this.query(datasetPath, params);
  }

  /**
   * Fetches SAHIE data with the given filters.
   */
  async getSahieData(params: {
    year?: number;
    stateFips?: string;
    countyFips?: string;
    ageCat?: string;
    incomeCat?: string;
  }): Promise<CensusResponse> {
    const datasetPath = this.buildDatasetPath(0, "timeseries/healthins/sahie");

    const queryParams: CensusQueryParams = {
      get: "NIC_PT,NIC_MOE,NUI_PT,NUI_MOE,PCTIC_PT,PCTIC_MOE,PCTUI_PT,PCTUI_MOE,NAME,STABREV,GEOCAT,AGECAT,RACECAT,SEXCAT,IPRCAT",
    };

    if (params.year) {
      queryParams.time = String(params.year);
    }

    // Geography
    if (params.countyFips && params.stateFips) {
      queryParams.for = `county:${params.countyFips}`;
      queryParams.in = `state:${params.stateFips}`;
    } else if (params.stateFips) {
      queryParams.for = `state:${params.stateFips}`;
    } else {
      queryParams.for = "state:*";
    }

    // Age filter
    if (params.ageCat) {
      queryParams.AGECAT = params.ageCat;
    }

    // Income filter
    if (params.incomeCat) {
      queryParams.IPRCAT = params.incomeCat;
    }

    // Default race/sex filters to "all" for cleaner data
    queryParams.RACECAT = "0";
    queryParams.SEXCAT = "0";

    return this.query(datasetPath, queryParams);
  }

  /**
   * Fetches the variable list for a given dataset endpoint.
   * The variables endpoint is at {datasetPath}/variables.json
   */
  async listVariables(
    year: number,
    dataset: string,
    tablePrefix?: string
  ): Promise<{
    variables: Array<{ code: string; label: string; concept: string }>;
    truncated: boolean;
  }> {
    const datasetPath = this.buildDatasetPath(year, dataset);

    try {
      const response = await this.client.get<{
        variables: Record<
          string,
          { label: string; concept?: string; group?: string }
        >;
      }>(`${datasetPath}/variables.json`, {
        params: { key: this.apiKey },
      });

      const allVars = response.data.variables;
      const variables: Array<{ code: string; label: string; concept: string }> =
        [];
      let charCount = 0;
      let truncated = false;

      for (const [code, meta] of Object.entries(allVars)) {
        // Skip internal variables (for, in, ucgid, etc.)
        if (
          code === "for" ||
          code === "in" ||
          code === "ucgid" ||
          code === "NAME"
        ) {
          continue;
        }

        // Filter by table prefix if specified
        if (tablePrefix && !code.startsWith(tablePrefix)) {
          continue;
        }

        const entry = {
          code,
          label: meta.label ?? "",
          concept: meta.concept ?? meta.group ?? "",
        };

        const entryStr = JSON.stringify(entry);
        charCount += entryStr.length;

        if (charCount > CHARACTER_LIMIT) {
          truncated = true;
          break;
        }

        variables.push(entry);
      }

      // Sort by variable code
      variables.sort((a, b) => a.code.localeCompare(b.code));

      return { variables, truncated };
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(
          `Failed to fetch variable list: ${error.response?.status ?? "unknown"} - ${String(error.response?.data ?? "").slice(0, 300)}`
        );
      }
      throw error;
    }
  }

  /**
   * Parses a geography string into Census API for/in parameters.
   *
   * Supported formats:
   *   "us"                          => for=us:1
   *   "state:*"                     => for=state:*
   *   "state:06"                    => for=state:06
   *   "county:*&in=state:06"        => for=county:* in=state:06
   *   "metropolitan statistical area/micropolitan statistical area:*"
   *                                 => for=metropolitan statistical area/micropolitan statistical area:*
   */
  parseGeography(geography: string): {
    forParam: string;
    inParam?: string;
  } {
    if (geography.toLowerCase() === "us") {
      return { forParam: "us:1" };
    }

    // Check for "&in=" pattern
    const inIdx = geography.indexOf("&in=");
    if (inIdx !== -1) {
      const forPart = geography.slice(0, inIdx);
      const inPart = geography.slice(inIdx + 4); // skip "&in="
      return { forParam: forPart, inParam: inPart };
    }

    return { forParam: geography };
  }
}
