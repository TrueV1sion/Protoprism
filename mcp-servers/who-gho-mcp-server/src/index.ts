/**
 * WHO Global Health Observatory (GHO) MCP Server
 *
 * Provides AI agents with access to the WHO GHO public API for querying
 * global health indicators, country health profiles, and cross-country
 * comparisons. Designed for the Protoprism healthcare AI research platform.
 *
 * Agent archetypes: RESEARCHER-DATA, MACRO-CONTEXT, ANALYST-QUALITY
 *
 * Supports stdio (default) and streamable HTTP transports.
 * - stdio:  node dist/index.js
 * - HTTP:   node dist/index.js --http --port 3017
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  makeGHORequest,
  buildIndicatorNameFilter,
  buildDataFilter,
  buildMultiCountryFilter,
  truncateResponse,
} from "./api-client.js";
import {
  CURATED_INDICATORS,
  CURATED_INDICATOR_LOOKUP,
  ALL_CURATED_CODES,
  INDICATOR_CATEGORIES,
  COUNTRY_PROFILE_INDICATORS,
  DEFAULT_LIMIT,
  MAX_RESULTS_PER_REQUEST,
} from "./constants.js";

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "who-gho",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Tool 1: Search Indicators ──────────────────────────────

server.registerTool(
  "who_search_indicators",
  {
    title: "Search WHO GHO Indicators",
    description:
      "Search WHO Global Health Observatory indicators by keyword. Returns " +
      "indicator codes, names, and categories. Use this to discover available " +
      "indicators before fetching data. Includes curated healthcare categories " +
      "(Health Expenditure, Life Expectancy, Mortality, Disease Burden, Health " +
      "Workforce, UHC & Coverage, SDG Health Targets) for easy discovery. " +
      "If no keyword is provided, returns the curated indicator catalog.",
    inputSchema: z
      .object({
        keyword: z
          .string()
          .optional()
          .describe(
            "Search keyword to match against indicator names/descriptions. " +
              "Case-insensitive. Examples: 'life expectancy', 'mortality', 'expenditure', 'physician'.",
          ),
        category: z
          .string()
          .optional()
          .describe(
            "Filter by curated category name. Available categories: " +
              INDICATOR_CATEGORIES.join(", ") +
              ". Returns only curated indicators in that category.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS_PER_REQUEST)
          .default(DEFAULT_LIMIT)
          .describe("Maximum number of results to return (1-200, default 50)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      // If category filter is provided, return curated indicators for that category
      if (args.category) {
        const categoryIndicators =
          CURATED_INDICATORS[args.category as keyof typeof CURATED_INDICATORS];

        if (!categoryIndicators) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: `Unknown category '${args.category}'. Available categories: ${INDICATOR_CATEGORIES.join(", ")}`,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const results = Object.entries(categoryIndicators).map(
          ([code, name]) => ({
            code,
            name,
            category: args.category,
            curated: true,
          }),
        );

        const { text } = truncateResponse({
          count: results.length,
          category: args.category,
          results,
        });

        return { content: [{ type: "text" as const, text }] };
      }

      // If no keyword, return the full curated catalog
      if (!args.keyword) {
        const catalog = Object.entries(CURATED_INDICATORS).map(
          ([category, indicators]) => ({
            category,
            indicators: Object.entries(indicators).map(([code, name]) => ({
              code,
              name,
            })),
          }),
        );

        const { text } = truncateResponse({
          description:
            "Curated WHO GHO indicator catalog. Use a keyword to search across all 2000+ indicators in the GHO database.",
          categories: INDICATOR_CATEGORIES,
          catalog,
        });

        return { content: [{ type: "text" as const, text }] };
      }

      // Search curated indicators first for matches
      const keywordLower = args.keyword.toLowerCase();
      const curatedMatches = ALL_CURATED_CODES
        .filter((code) => {
          const info = CURATED_INDICATOR_LOOKUP[code];
          return (
            info.name.toLowerCase().includes(keywordLower) ||
            info.code.toLowerCase().includes(keywordLower) ||
            info.category.toLowerCase().includes(keywordLower)
          );
        })
        .map((code) => ({
          ...CURATED_INDICATOR_LOOKUP[code],
          curated: true,
        }));

      // Also search the full GHO indicator database via the API
      const apiResult = await makeGHORequest({
        path: "Indicator",
        query: {
          $filter: buildIndicatorNameFilter(args.keyword),
          $top: args.limit,
          $select: "IndicatorCode,IndicatorName",
        },
      });

      const apiIndicators = (apiResult.results as Array<{
        IndicatorCode?: string;
        IndicatorName?: string;
      }>).map((item) => ({
        code: item.IndicatorCode ?? "",
        name: item.IndicatorName ?? "",
        category: CURATED_INDICATOR_LOOKUP[item.IndicatorCode ?? ""]?.category ?? null,
        curated: (item.IndicatorCode ?? "") in CURATED_INDICATOR_LOOKUP,
      }));

      // Merge: curated matches first, then API results (deduplicated)
      const seenCodes = new Set(curatedMatches.map((m) => m.code));
      const merged = [
        ...curatedMatches,
        ...apiIndicators.filter((i) => !seenCodes.has(i.code)),
      ].slice(0, args.limit);

      const { text } = truncateResponse({
        keyword: args.keyword,
        count: merged.length,
        has_more: apiResult.has_more,
        results: merged,
      });

      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error searching indicators",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 2: Get Indicator Data ─────────────────────────────

server.registerTool(
  "who_get_indicator_data",
  {
    title: "Get WHO GHO Indicator Data",
    description:
      "Get time series data for a specific WHO GHO indicator. Returns data " +
      "points with country (ISO3 code), year, value, and dimension info. " +
      "Filter by country, year range, and sex. Supports pagination. " +
      "Use who_search_indicators first to find the indicator code.",
    inputSchema: z
      .object({
        indicator_code: z
          .string()
          .describe(
            "The GHO indicator code (e.g., 'WHOSIS_000001' for life expectancy, " +
              "'GHED_CHE_pc_PPP_SHA2011' for health expenditure per capita). " +
              "Use who_search_indicators to find valid codes.",
          ),
        country: z
          .string()
          .optional()
          .describe(
            "ISO3 country code to filter by (e.g., 'USA', 'GBR', 'JPN', 'BRA'). " +
              "Case-insensitive.",
          ),
        year_from: z
          .number()
          .int()
          .min(1900)
          .max(2030)
          .optional()
          .describe("Start year for filtering (inclusive). E.g., 2000."),
        year_to: z
          .number()
          .int()
          .min(1900)
          .max(2030)
          .optional()
          .describe("End year for filtering (inclusive). E.g., 2023."),
        sex: z
          .string()
          .optional()
          .describe(
            "Filter by sex dimension. Values: 'male', 'female', 'both'. " +
              "Not all indicators have sex-disaggregated data.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS_PER_REQUEST)
          .default(DEFAULT_LIMIT)
          .describe("Maximum number of data points to return (1-200, default 50)."),
        skip: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of results to skip for pagination (default 0)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const indicatorInfo = CURATED_INDICATOR_LOOKUP[args.indicator_code];

      const filter = buildDataFilter({
        country: args.country,
        yearFrom: args.year_from,
        yearTo: args.year_to,
        sex: args.sex,
      });

      const result = await makeGHORequest({
        path: args.indicator_code,
        query: {
          $filter: filter,
          $orderby: "TimeDim desc",
          $top: args.limit,
          $skip: args.skip,
          $select: "SpatialDim,TimeDim,Dim1,NumericValue,Value,Low,High",
        },
      });

      const responseObj = {
        indicator_code: args.indicator_code,
        indicator_name: indicatorInfo?.name ?? null,
        indicator_category: indicatorInfo?.category ?? null,
        filters_applied: {
          country: args.country ?? null,
          year_range: args.year_from || args.year_to
            ? `${args.year_from ?? "..."}-${args.year_to ?? "..."}`
            : null,
          sex: args.sex ?? null,
        },
        count: result.count,
        has_more: result.has_more,
        skip: result.skip,
        limit: result.limit,
        results: result.results,
        truncated: result.truncated,
      };

      const { text } = truncateResponse(responseObj);
      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error fetching indicator data",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 3: Compare Countries ──────────────────────────────

server.registerTool(
  "who_compare_countries",
  {
    title: "Compare Countries on WHO Indicator",
    description:
      "Compare a WHO GHO indicator across multiple countries. Returns " +
      "side-by-side data with the latest available values and recent trends. " +
      "Useful for benchmarking, policy analysis, and identifying regional " +
      "patterns. Provide an indicator code and a list of ISO3 country codes.",
    inputSchema: z
      .object({
        indicator_code: z
          .string()
          .describe(
            "The GHO indicator code to compare (e.g., 'WHOSIS_000001' for life expectancy). " +
              "Use who_search_indicators to find valid codes.",
          ),
        countries: z
          .array(z.string())
          .min(2)
          .max(20)
          .describe(
            "List of ISO3 country codes to compare (2-20 countries). " +
              "E.g., ['USA', 'GBR', 'JPN', 'BRA', 'NGA']. Case-insensitive.",
          ),
        year_from: z
          .number()
          .int()
          .min(1900)
          .max(2030)
          .optional()
          .describe("Start year for data range (inclusive). Default: last 10 years."),
        year_to: z
          .number()
          .int()
          .min(1900)
          .max(2030)
          .optional()
          .describe("End year for data range (inclusive). Default: latest available."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const indicatorInfo = CURATED_INDICATOR_LOOKUP[args.indicator_code];
      const normalizedCountries = args.countries.map((c) => c.toUpperCase());

      // Build filter combining country list and optional year range
      const countryFilter = buildMultiCountryFilter(normalizedCountries);
      const yearClauses: string[] = [];
      if (args.year_from !== undefined) {
        yearClauses.push(`TimeDim ge ${args.year_from}`);
      }
      if (args.year_to !== undefined) {
        yearClauses.push(`TimeDim le ${args.year_to}`);
      }

      const filterParts = [`(${countryFilter})`];
      if (yearClauses.length > 0) {
        filterParts.push(...yearClauses);
      }
      const fullFilter = filterParts.join(" and ");

      const result = await makeGHORequest({
        path: args.indicator_code,
        query: {
          $filter: fullFilter,
          $orderby: "TimeDim desc",
          $top: MAX_RESULTS_PER_REQUEST,
          $select: "SpatialDim,TimeDim,Dim1,NumericValue,Value",
        },
      });

      // Organize results by country
      const byCountry: Record<string, Array<{
        year: number;
        value: number | string | null;
        numericValue: number | null;
        sex: string | null;
      }>> = {};

      for (const code of normalizedCountries) {
        byCountry[code] = [];
      }

      for (const item of result.results as Array<{
        SpatialDim?: string;
        TimeDim?: number;
        Dim1?: string;
        NumericValue?: number;
        Value?: string;
      }>) {
        const country = item.SpatialDim ?? "";
        if (country in byCountry) {
          byCountry[country].push({
            year: item.TimeDim ?? 0,
            value: item.Value ?? null,
            numericValue: item.NumericValue ?? null,
            sex: item.Dim1 ?? null,
          });
        }
      }

      // Build comparison summary with latest value per country
      const comparison = normalizedCountries.map((code) => {
        const data = byCountry[code];
        // Filter for "both sexes" or no sex dimension to get the headline number
        const bothSexes = data.filter(
          (d) => !d.sex || d.sex === "BTSX" || d.sex === "SEX_BTSX",
        );
        const primaryData = bothSexes.length > 0 ? bothSexes : data;

        // Sort by year descending to get the latest
        const sorted = [...primaryData].sort((a, b) => b.year - a.year);
        const latest = sorted[0] ?? null;

        return {
          country: code,
          latest_value: latest?.numericValue ?? latest?.value ?? null,
          latest_year: latest?.year ?? null,
          data_points: sorted.slice(0, 10), // last 10 years of data
          total_observations: data.length,
        };
      });

      const responseObj = {
        indicator_code: args.indicator_code,
        indicator_name: indicatorInfo?.name ?? null,
        indicator_category: indicatorInfo?.category ?? null,
        countries_compared: normalizedCountries.length,
        comparison,
      };

      const { text } = truncateResponse(responseObj);
      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error comparing countries",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 4: Country Health Profile ─────────────────────────

server.registerTool(
  "who_get_country_profile",
  {
    title: "Get Country Health Profile",
    description:
      "Get a comprehensive health profile for a country using curated WHO GHO " +
      "indicators. Returns key health metrics including life expectancy, health " +
      "expenditure, workforce density, UHC coverage, and mortality rates. " +
      "Fetches the latest available data for each indicator. Useful for " +
      "country-level health system assessments and policy analysis.",
    inputSchema: z
      .object({
        country: z
          .string()
          .describe(
            "ISO3 country code (e.g., 'USA', 'GBR', 'JPN', 'IND', 'NGA'). " +
              "Use who_list_countries to find valid codes. Case-insensitive.",
          ),
        year_from: z
          .number()
          .int()
          .min(1900)
          .max(2030)
          .optional()
          .describe(
            "Only include data from this year onwards. Default: 2010. " +
              "Use a recent year for a current snapshot.",
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const countryCode = args.country.toUpperCase();
      const yearFrom = args.year_from ?? 2010;

      // Fetch data for each curated indicator in parallel (with rate limiting
      // handled inside makeGHORequest, we batch sequentially for safety)
      const profileData: Array<{
        indicator_code: string;
        indicator_name: string;
        category: string;
        latest_value: number | string | null;
        latest_year: number | null;
        data_points: Array<{ year: number; value: number | string | null }>;
      }> = [];

      for (const indicatorCode of COUNTRY_PROFILE_INDICATORS) {
        const info = CURATED_INDICATOR_LOOKUP[indicatorCode];
        if (!info) continue;

        try {
          const filter = buildDataFilter({
            country: countryCode,
            yearFrom,
          });

          const result = await makeGHORequest({
            path: indicatorCode,
            query: {
              $filter: filter,
              $orderby: "TimeDim desc",
              $top: 20,
              $select: "SpatialDim,TimeDim,Dim1,NumericValue,Value",
            },
          });

          const items = result.results as Array<{
            SpatialDim?: string;
            TimeDim?: number;
            Dim1?: string;
            NumericValue?: number;
            Value?: string;
          }>;

          // Prefer "both sexes" data for the headline
          const bothSexes = items.filter(
            (d) => !d.Dim1 || d.Dim1 === "BTSX" || d.Dim1 === "SEX_BTSX",
          );
          const primaryItems = bothSexes.length > 0 ? bothSexes : items;
          const sorted = [...primaryItems].sort(
            (a, b) => (b.TimeDim ?? 0) - (a.TimeDim ?? 0),
          );

          const latest = sorted[0];
          profileData.push({
            indicator_code: indicatorCode,
            indicator_name: info.name,
            category: info.category,
            latest_value: latest?.NumericValue ?? latest?.Value ?? null,
            latest_year: latest?.TimeDim ?? null,
            data_points: sorted.slice(0, 5).map((d) => ({
              year: d.TimeDim ?? 0,
              value: d.NumericValue ?? d.Value ?? null,
            })),
          });
        } catch {
          // If an individual indicator fails, include it with null data
          profileData.push({
            indicator_code: indicatorCode,
            indicator_name: info.name,
            category: info.category,
            latest_value: null,
            latest_year: null,
            data_points: [],
          });
        }
      }

      // Group by category for clean presentation
      const byCategory: Record<string, typeof profileData> = {};
      for (const item of profileData) {
        if (!byCategory[item.category]) {
          byCategory[item.category] = [];
        }
        byCategory[item.category].push(item);
      }

      const responseObj = {
        country: countryCode,
        profile_type: "WHO GHO Health Profile",
        data_from_year: yearFrom,
        indicators_queried: COUNTRY_PROFILE_INDICATORS.length,
        indicators_with_data: profileData.filter((d) => d.latest_value !== null).length,
        profile: byCategory,
      };

      const { text } = truncateResponse(responseObj);
      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error building country profile",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 5: List Countries ─────────────────────────────────

server.registerTool(
  "who_list_countries",
  {
    title: "List WHO GHO Countries",
    description:
      "List countries available in the WHO GHO database with their ISO3 codes. " +
      "Optionally filter by name. Returns country names and ISO3 codes for use " +
      "with other WHO tools. The GHO uses the 'COUNTRY' dimension.",
    inputSchema: z
      .object({
        filter: z
          .string()
          .optional()
          .describe(
            "Text filter to search country names. Case-insensitive. " +
              "E.g., 'united', 'brazil', 'afr'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS_PER_REQUEST)
          .default(MAX_RESULTS_PER_REQUEST)
          .describe("Maximum number of countries to return (1-200, default 200)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const queryParams: {
        $filter?: string;
        $top: number;
        $select: string;
        $orderby: string;
      } = {
        $top: args.limit,
        $select: "Code,Title",
        $orderby: "Title asc",
      };

      if (args.filter) {
        queryParams.$filter = `contains(Title,'${args.filter.replace(/'/g, "''")}')`;
      }

      const result = await makeGHORequest({
        path: "DIMENSION/COUNTRY/DimensionValues",
        query: queryParams,
      });

      const countries = (result.results as Array<{
        Code?: string;
        Title?: string;
      }>).map((item) => ({
        iso3_code: item.Code ?? "",
        name: item.Title ?? "",
      }));

      const { text } = truncateResponse({
        count: countries.length,
        has_more: result.has_more,
        filter: args.filter ?? null,
        countries,
      });

      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error listing countries",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Transport & Startup ─────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useHttp =
    args.includes("--http") ||
    process.env.TRANSPORT?.toLowerCase() === "http" ||
    process.env.TRANSPORT?.toLowerCase() === "streamable-http";

  if (useHttp) {
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    // Parse --port flag or use env var
    const portArgIndex = args.indexOf("--port");
    const port = portArgIndex !== -1 && args[portArgIndex + 1]
      ? parseInt(args[portArgIndex + 1], 10)
      : parseInt(process.env.PORT ?? "3017", 10);

    const httpServer = http.createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ status: "ok", server: "who-gho-mcp", port }),
        );
        return;
      }

      // MCP endpoint
      if (req.url === "/mcp" || req.url === "/") {
        const sessionTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(sessionTransport);
        await sessionTransport.handleRequest(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(port, () => {
      console.error(`[who-gho-mcp] HTTP server listening on port ${port}`);
      console.error(
        `[who-gho-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
      console.error(
        `[who-gho-mcp] Health check: http://localhost:${port}/health`,
      );
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[who-gho-mcp] Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("[who-gho-mcp] Fatal error:", error);
  process.exit(1);
});
