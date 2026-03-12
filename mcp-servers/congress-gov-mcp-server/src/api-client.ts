/**
 * Congress.gov API Client
 *
 * Handles authenticated requests to the Congress.gov v3 API.
 * All endpoints require an API key passed as a query parameter.
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { BASE_URL } from "./constants.js";

// ─── Types ──────────────────────────────────────────────────

export interface CongressApiError {
  status: number;
  message: string;
  url: string;
}

export interface PaginatedResponse<T> {
  data: T;
  pagination?: {
    count: number;
    next?: string;
  };
}

// ─── Client ─────────────────────────────────────────────────

export class CongressApiClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30_000,
      headers: {
        Accept: "application/json",
      },
    });
  }

  /**
   * Make a GET request to the Congress.gov API.
   * Automatically appends the api_key query parameter.
   */
  async get<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined> = {}
  ): Promise<T> {
    // Strip undefined values and add api_key
    const cleanParams: Record<string, string | number> = {
      api_key: this.apiKey,
      format: "json",
    };
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        cleanParams[key] = value;
      }
    }

    try {
      const response = await this.client.get<T>(path, {
        params: cleanParams,
      });
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status ?? 0;
        const message =
          error.response?.data?.error?.message ??
          error.response?.data?.message ??
          error.message;
        throw new CongressApiClientError(
          `Congress.gov API error (${status}): ${message}`,
          status,
          path
        );
      }
      throw error;
    }
  }

  // ─── Bills ──────────────────────────────────────────────

  async searchBills(params: {
    query?: string;
    congress?: number;
    billType?: string;
    fromDateTime?: string;
    toDateTime?: string;
    sort?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const { query, congress, billType, fromDateTime, toDateTime, sort, limit, offset } = params;

    // Build the path based on filters
    let path = "/bill";
    if (congress && billType) {
      path = `/bill/${congress}/${billType}`;
    } else if (congress) {
      path = `/bill/${congress}`;
    }

    return this.get(path, {
      query,
      fromDateTime,
      toDateTime,
      sort: sort ? `${sort}+desc` : undefined,
      limit,
      offset,
    });
  }

  async getBill(congress: number, billType: string, billNumber: number): Promise<unknown> {
    return this.get(`/bill/${congress}/${billType}/${billNumber}`);
  }

  async getBillActions(
    congress: number,
    billType: string,
    billNumber: number,
    limit?: number
  ): Promise<unknown> {
    return this.get(`/bill/${congress}/${billType}/${billNumber}/actions`, { limit });
  }

  async getBillCommittees(
    congress: number,
    billType: string,
    billNumber: number
  ): Promise<unknown> {
    return this.get(`/bill/${congress}/${billType}/${billNumber}/committees`);
  }

  async getBillSubjects(
    congress: number,
    billType: string,
    billNumber: number
  ): Promise<unknown> {
    return this.get(`/bill/${congress}/${billType}/${billNumber}/subjects`);
  }

  async getBillCosponsors(
    congress: number,
    billType: string,
    billNumber: number
  ): Promise<unknown> {
    return this.get(`/bill/${congress}/${billType}/${billNumber}/cosponsors`);
  }

  async getBillRelatedBills(
    congress: number,
    billType: string,
    billNumber: number
  ): Promise<unknown> {
    return this.get(`/bill/${congress}/${billType}/${billNumber}/relatedbills`);
  }

  // ─── Members ────────────────────────────────────────────

  async searchMembers(params: {
    query?: string;
    state?: string;
    party?: string;
    chamber?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const { query, state, limit, offset } = params;

    // The member endpoint filters by currentMember by default
    let path = "/member";
    if (state) {
      path = `/member/${state.toUpperCase()}`;
    }

    return this.get(path, {
      query,
      limit,
      offset,
    });
  }

  // ─── Committees ─────────────────────────────────────────

  async searchCommittees(params: {
    query?: string;
    chamber?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const { query, chamber, limit, offset } = params;

    let path = "/committee";
    if (chamber) {
      path = `/committee/${chamber}`;
    }

    return this.get(path, {
      query,
      limit,
      offset,
    });
  }

  // ─── Hearings ───────────────────────────────────────────

  async searchHearings(params: {
    query?: string;
    congress?: number;
    chamber?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const { congress, chamber, limit, offset } = params;

    let path = "/hearing";
    if (congress) {
      path = `/hearing/${congress}`;
      if (chamber) {
        path = `/hearing/${congress}/${chamber}`;
      }
    }

    return this.get(path, {
      limit,
      offset,
    });
  }
}

// ─── Error Class ────────────────────────────────────────────

export class CongressApiClientError extends Error {
  status: number;
  url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "CongressApiClientError";
    this.status = status;
    this.url = url;
  }
}
