/**
 * BLS Public Data API Client
 *
 * Handles all HTTP communication with the Bureau of Labor Statistics
 * Public Data API v2. Manages API key injection, request construction,
 * and response parsing.
 */

import axios, { AxiosError } from "axios";
import {
  BLS_BASE_URL,
  BLS_TIMESERIES_ENDPOINT,
  MAX_SERIES_PER_REQUEST,
  MAX_YEAR_SPAN,
} from "./constants.js";

// ─── Types ───────────────────────────────────────────────────

/** A single footnote attached to a data point */
export interface BLSFootnote {
  code: string;
  text: string;
}

/** A single data observation from a BLS time series */
export interface BLSDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: string;
  footnotes: BLSFootnote[];
  latest?: string;
  /** Present when calculations=true */
  calculations?: {
    net_changes?: Record<string, string>;
    pct_changes?: Record<string, string>;
  };
}

/** A single series returned by the API */
export interface BLSSeriesResult {
  seriesID: string;
  data: BLSDataPoint[];
}

/** Top-level BLS API response envelope */
export interface BLSAPIResponse {
  status: string;
  responseTime: number;
  message: string[];
  Results?: {
    series: BLSSeriesResult[];
  };
}

/** Parameters for the timeseries data request */
export interface BLSRequestParams {
  seriesIds: string[];
  startYear: number;
  endYear: number;
  calculations?: boolean;
  annualAverage?: boolean;
}

// ─── API Client ──────────────────────────────────────────────

export class BLSApiClient {
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.BLS_API_KEY;
    this.baseUrl = BLS_BASE_URL;
  }

  /**
   * Fetch time series data from the BLS API.
   *
   * @throws {Error} If the request fails or the API returns an error status
   */
  async getTimeSeries(params: BLSRequestParams): Promise<BLSSeriesResult[]> {
    // ── Validate inputs ──
    if (params.seriesIds.length === 0) {
      throw new Error("At least one series ID is required");
    }

    if (params.seriesIds.length > MAX_SERIES_PER_REQUEST) {
      throw new Error(
        `Too many series IDs: ${params.seriesIds.length} exceeds maximum of ${MAX_SERIES_PER_REQUEST}`,
      );
    }

    const yearSpan = params.endYear - params.startYear;
    if (yearSpan < 0) {
      throw new Error("end_year must be >= start_year");
    }

    if (yearSpan > MAX_YEAR_SPAN) {
      throw new Error(
        `Year span ${yearSpan} exceeds maximum of ${MAX_YEAR_SPAN} years. Narrow your date range.`,
      );
    }

    // ── Build request body ──
    const body: Record<string, unknown> = {
      seriesid: params.seriesIds,
      startyear: String(params.startYear),
      endyear: String(params.endYear),
    };

    if (this.apiKey) {
      body.registrationkey = this.apiKey;
    }

    if (params.calculations) {
      body.calculations = true;
    }

    if (params.annualAverage) {
      body.annualaverage = true;
    }

    // ── Make request ──
    try {
      const response = await axios.post<BLSAPIResponse>(
        `${this.baseUrl}${BLS_TIMESERIES_ENDPOINT}`,
        JSON.stringify(body),
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        },
      );

      const data = response.data;

      if (data.status !== "REQUEST_SUCCEEDED") {
        const messages = data.message?.join("; ") ?? "Unknown API error";
        throw new Error(`BLS API error (status: ${data.status}): ${messages}`);
      }

      if (!data.Results?.series) {
        throw new Error("BLS API returned no series data");
      }

      return data.Results.series;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response) {
          throw new Error(
            `BLS API HTTP error ${error.response.status}: ${error.response.statusText}`,
          );
        }
        if (error.code === "ECONNABORTED") {
          throw new Error("BLS API request timed out (30s)");
        }
        throw new Error(`BLS API network error: ${error.message}`);
      }
      throw error;
    }
  }

  /** Returns whether an API key is configured */
  hasApiKey(): boolean {
    return !!this.apiKey;
  }
}
