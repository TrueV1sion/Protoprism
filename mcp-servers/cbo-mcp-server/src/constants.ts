/**
 * CBO MCP Server Constants
 *
 * URLs, topic slugs, rate limits, and response constraints
 * for accessing Congressional Budget Office public data.
 */

// ─── Base URLs ──────────────────────────────────────────────

export const CBO_BASE_URL = "https://www.cbo.gov";

// ─── Feed & Page URLs ───────────────────────────────────────

export const URLS = {
  /** RSS feed for all publications */
  ALL_PUBLICATIONS_RSS: `${CBO_BASE_URL}/publications/all?format=rss`,
  /** Topic-specific RSS feed (append topic slug) */
  TOPIC_RSS: (slug: string) => `${CBO_BASE_URL}/topics/${slug}?format=rss`,
  /** Topic page (append topic slug) */
  TOPIC_PAGE: (slug: string) => `${CBO_BASE_URL}/topics/${slug}`,
  /** Cost estimates page */
  COST_ESTIMATES: `${CBO_BASE_URL}/cost-estimates`,
  /** Cost estimates RSS */
  COST_ESTIMATES_RSS: `${CBO_BASE_URL}/cost-estimates?format=rss`,
  /** Individual publication page */
  PUBLICATION: (id: string) => `${CBO_BASE_URL}/publication/${id}`,
  /** Search endpoint */
  SEARCH: (query: string) =>
    `${CBO_BASE_URL}/search/site/${encodeURIComponent(query)}`,
  /** Search with RSS format */
  SEARCH_RSS: (query: string) =>
    `${CBO_BASE_URL}/search/site/${encodeURIComponent(query)}?format=rss`,
} as const;

// ─── Topics ─────────────────────────────────────────────────

export interface TopicInfo {
  slug: string;
  name: string;
  description: string;
  isHealthcareRelated: boolean;
}

export const CBO_TOPICS: TopicInfo[] = [
  {
    slug: "health",
    name: "Health",
    description:
      "Broad health policy analysis including insurance markets, public health programs, and healthcare spending projections.",
    isHealthcareRelated: true,
  },
  {
    slug: "medicare",
    name: "Medicare",
    description:
      "Medicare program analysis including spending projections, Part A/B/D costs, and policy proposals affecting Medicare beneficiaries.",
    isHealthcareRelated: true,
  },
  {
    slug: "medicaid-and-chip",
    name: "Medicaid and CHIP",
    description:
      "Medicaid and Children's Health Insurance Program analysis including enrollment projections, federal/state spending, and eligibility changes.",
    isHealthcareRelated: true,
  },
  {
    slug: "health-insurance",
    name: "Health Insurance",
    description:
      "Health insurance coverage analysis including marketplace exchanges, employer-sponsored insurance, and uninsured population estimates.",
    isHealthcareRelated: true,
  },
  {
    slug: "budget",
    name: "Budget",
    description:
      "Federal budget analysis including revenue, spending, deficits, and long-term fiscal projections.",
    isHealthcareRelated: false,
  },
  {
    slug: "economy",
    name: "Economy",
    description:
      "Economic outlook and forecasts including GDP, employment, inflation, and interest rate projections.",
    isHealthcareRelated: false,
  },
  {
    slug: "taxes",
    name: "Taxes",
    description:
      "Federal tax policy analysis including revenue estimates, tax expenditures, and distributional effects.",
    isHealthcareRelated: false,
  },
  {
    slug: "social-security",
    name: "Social Security",
    description:
      "Social Security program analysis including trust fund projections, benefit calculations, and reform proposals.",
    isHealthcareRelated: false,
  },
  {
    slug: "defense-and-national-security",
    name: "Defense and National Security",
    description:
      "Defense spending analysis including military personnel, operations, procurement, and long-term costs.",
    isHealthcareRelated: false,
  },
  {
    slug: "education",
    name: "Education",
    description:
      "Federal education spending analysis including student loans, grants, and K-12 programs.",
    isHealthcareRelated: false,
  },
  {
    slug: "environment-and-natural-resources",
    name: "Environment and Natural Resources",
    description:
      "Environmental policy analysis including energy, climate, water, and land management programs.",
    isHealthcareRelated: false,
  },
  {
    slug: "income-security",
    name: "Income Security",
    description:
      "Income security program analysis including SNAP, housing assistance, unemployment, and disability benefits.",
    isHealthcareRelated: false,
  },
  {
    slug: "infrastructure-and-transportation",
    name: "Infrastructure and Transportation",
    description:
      "Transportation and infrastructure spending analysis including highways, transit, aviation, and water systems.",
    isHealthcareRelated: false,
  },
  {
    slug: "science-and-technology",
    name: "Science and Technology",
    description:
      "Federal science, technology, and research spending analysis.",
    isHealthcareRelated: false,
  },
  {
    slug: "veterans",
    name: "Veterans",
    description:
      "Veterans affairs spending analysis including healthcare, disability compensation, and education benefits.",
    isHealthcareRelated: false,
  },
];

/** Healthcare-specific topic slugs for convenience filtering */
export const HEALTHCARE_TOPIC_SLUGS = CBO_TOPICS.filter(
  (t) => t.isHealthcareRelated,
).map((t) => t.slug);

/** All valid topic slugs */
export const ALL_TOPIC_SLUGS = CBO_TOPICS.map((t) => t.slug);

// ─── Rate Limits ────────────────────────────────────────────

/** Minimum interval between requests in ms (500ms = respectful crawling) */
export const MIN_REQUEST_INTERVAL_MS = 500;

// ─── Response Constraints ───────────────────────────────────

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25000;

/** Default number of results */
export const DEFAULT_LIMIT = 10;

/** Maximum results per request */
export const MAX_RESULTS = 50;

// ─── HTTP Client ────────────────────────────────────────────

/** User-Agent header for all requests */
export const USER_AGENT = "Protoprism-CBO-MCP/1.0 (research@protoprism.ai)";
