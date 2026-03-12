/**
 * USPTO PatentsView API Constants
 *
 * Defines API endpoints, field lists, and healthcare-relevant
 * CPC classification codes for the patent research MCP server.
 */

// ─── API Configuration ──────────────────────────────────────

export const PATENTSVIEW_BASE_URL = "https://api.patentsview.org";

export const ENDPOINTS = {
  PATENTS: "/patents/query",
  INVENTORS: "/inventors/query",
  ASSIGNEES: "/assignees/query",
  CPC_SUBSECTIONS: "/cpc_subsections/query",
} as const;

/** Maximum characters returned in any single tool response */
export const CHARACTER_LIMIT = 25000;

/** PatentsView rate limit: 45 requests/minute */
export const RATE_LIMIT_PER_MINUTE = 45;

/** Default number of results per page */
export const DEFAULT_LIMIT = 25;

/** Maximum results per page */
export const MAX_LIMIT = 100;

// ─── Patent Search Fields ───────────────────────────────────

/** Fields requested for patent search results */
export const PATENT_SEARCH_FIELDS = [
  "patent_number",
  "patent_title",
  "patent_abstract",
  "patent_date",
  "patent_num_cited_by_us_patents",
  "assignee_organization",
  "inventor_first_name",
  "inventor_last_name",
  "cpc_group_id",
] as const;

/** Fields requested for detailed patent view */
export const PATENT_DETAIL_FIELDS = [
  "patent_number",
  "patent_title",
  "patent_abstract",
  "patent_date",
  "patent_type",
  "patent_kind",
  "patent_num_claims",
  "patent_num_cited_by_us_patents",
  "patent_num_combined_citations",
  "patent_firstnamed_assignee_city",
  "patent_firstnamed_assignee_country",
  "patent_firstnamed_inventor_city",
  "patent_firstnamed_inventor_country",
  "assignee_organization",
  "assignee_type",
  "inventor_first_name",
  "inventor_last_name",
  "inventor_city",
  "inventor_state",
  "inventor_country",
  "cpc_group_id",
  "cpc_group_title",
  "cpc_subgroup_id",
  "cpc_subgroup_title",
  "cpc_section_id",
  "cpc_subsection_id",
  "cpc_subsection_title",
  "citedby_patent_number",
  "citedby_patent_title",
  "citedby_patent_date",
  "cited_patent_number",
  "cited_patent_title",
  "cited_patent_date",
] as const;

/** Fields requested for assignee search */
export const ASSIGNEE_SEARCH_FIELDS = [
  "assignee_organization",
  "assignee_type",
  "assignee_total_num_patents",
  "assignee_first_seen_date",
  "assignee_last_seen_date",
  "patent_number",
  "patent_title",
  "patent_date",
] as const;

/** Fields requested for CPC subsection search */
export const CPC_SEARCH_FIELDS = [
  "cpc_subsection_id",
  "cpc_subsection_title",
  "cpc_total_num_patents",
  "cpc_total_num_assignees",
  "cpc_total_num_inventors",
] as const;

/** Fields for citation analysis */
export const CITATION_FIELDS = [
  "patent_number",
  "patent_title",
  "patent_date",
  "patent_abstract",
  "patent_num_cited_by_us_patents",
  "patent_num_combined_citations",
  "assignee_organization",
  "cited_patent_number",
  "cited_patent_title",
  "cited_patent_date",
  "cited_patent_category",
  "citedby_patent_number",
  "citedby_patent_title",
  "citedby_patent_date",
] as const;

// ─── Healthcare CPC Classifications ─────────────────────────

/**
 * Healthcare-relevant CPC (Cooperative Patent Classification) sections.
 * These are particularly useful for Protoprism's healthcare AI research focus.
 */
export const HEALTHCARE_CPC_SECTIONS: Record<string, string> = {
  A61: "Medical or Veterinary Science; Hygiene",
  C07: "Organic Chemistry (including pharmaceuticals)",
  C12: "Biochemistry; Beer; Spirits; Wine; Vinegar; Microbiology; Enzymology; Mutation or Genetic Engineering",
  G16H: "Healthcare Informatics (ICT for healthcare data processing)",
  A01N: "Preservation of Bodies (biocides, pest repellants, pharmaceuticals)",
  B01D: "Separation Processes (filtration for medical devices)",
  G01N: "Investigating or Analysing Materials (clinical diagnostics)",
  G06N: "Computing Arrangements (AI/ML systems used in healthcare)",
  H04L: "Transmission of Digital Information (telemedicine infrastructure)",
};

/**
 * Major CPC section identifiers for broad category filtering
 */
export const CPC_SECTIONS: Record<string, string> = {
  A: "Human Necessities",
  B: "Performing Operations; Transporting",
  C: "Chemistry; Metallurgy",
  D: "Textiles; Paper",
  E: "Fixed Constructions",
  F: "Mechanical Engineering; Lighting; Heating; Weapons; Blasting",
  G: "Physics",
  H: "Electricity",
  Y: "General Tagging of New Technological Developments",
};
