# PRISM v4.0 — World-Class M&A Engine & Multi-Modal Output Enhancement Plan

**Date:** 2026-03-17
**Status:** Proposed
**Scope:** Full-stack enhancement — agents, framework, output modalities, M&A engine

---

## Part 1: Expert Assessment of Current Codebase

### 1.1 Architecture Assessment (Grade: A-)

**Strengths:**
- Sophisticated 7-phase pipeline (THINK → CONSTRUCT → DEPLOY → SYNTHESIZE → VERIFY → PRESENT → REFINE)
- 25+ agent archetypes with deep specialization
- Proper agentic loops with tool-use, MCP integration, and structured output
- Wave-based execution with MemoryBus for inter-agent context sharing
- Extended thinking (10K tokens) on critical phases (THINK, SYNTHESIZE)
- Quality assurance gate with provenance tracking and scoring
- Neutral framing protocol for ethical sensitivity

**Gaps:**
- **Single output modality** — HTML presentations only. No memos, models, data rooms, executive summaries, or structured exports
- **No persistent knowledge graph** — each run is isolated; M&A intelligence should accumulate across runs
- **No deal lifecycle management** — runs are one-shot analyses, not tracked deal workflows
- **No financial modeling engine** — qualitative analysis only; no DCF, comps, or accretion/dilution calculations
- **No real-time data feeds** — MCP tools are query-based, not streaming market signals
- **Synthesis is prompt-dependent** — emergence detection relies entirely on Claude's reasoning, not algorithmic pattern matching pre-processing

### 1.2 Agent System Assessment (Grade: B+)

**Strengths:**
- Rich archetype registry with lens/bias/description/compatible skills
- Automatic CRITIC-FACTUAL injection at depth ≥ 4
- Skill router with domain intelligence injection and token budgets
- Neutral framing protocol detecting ethically-charged mandates
- Wave execution for EXTENDED+ tiers with blackboard pattern

**Gaps:**
- **No agent memory across runs** — agents start from zero every time; for M&A, prior deal intelligence is critical
- **No agent collaboration during execution** — agents run independently within a wave, no mid-run coordination
- **No specialized M&A agent archetypes** — relies on generic ANALYST-FINANCIAL + skill injection rather than purpose-built M&A agents
- **No quantitative agent** — no agent can run DCF models, build comps tables, or calculate WACC
- **No market data agent** — no agent specializes in fetching and normalizing real-time market data
- **Tool routing is static** — archetypes have fixed tool mappings, not adaptive based on query analysis
- **No agent performance tracking** — no feedback loop on which agent configurations produce highest-quality findings

### 1.3 Presentation System Assessment (Grade: A)

**Strengths:**
- Comprehensive CSS component library (50+ classes) with dark theme, fluid typography, responsive grids
- Animated data visualizations (bar charts, donut charts, sparklines, heat maps, timelines)
- Intersection Observer-driven animations with stagger delays
- Self-contained HTML output with no external dependencies
- Provenance panel in DeckViewer with full agent-to-source trace
- Professional branding with confidence/tier/source-tier indicators

**Gaps:**
- **Only one output format** — HTML slides. No PDF export, no PPTX, no structured data export
- **No collaborative annotation** — can't comment on slides or mark up findings
- **No version comparison** — can't diff two runs on the same topic
- **No dynamic data binding** — presentation is static HTML, not reactive to updated findings
- **No templating system** — each presentation is generated from scratch; common slide patterns (title, exec summary, methodology) should be reusable templates
- **No print optimization** — CSS not optimized for print/PDF rendering

### 1.4 M&A Capability Assessment (Grade: C+)

**What exists:**
- `healthcare-ma-signal-hunter` skill with SEC/GDELT/lobbying signal taxonomy
- `deal-room-intelligence` skill with 10-slide framework
- `payer-financial-decoder` skill with MLR/margin analysis
- ANALYST-FINANCIAL archetype with compatible M&A skills
- Two generated M&A reports (Inovalon exit strategy, healthcare M&A landscape)

**What's missing for "world's best":**
- **No financial modeling engine** — can't run DCF, LBO, comps, precedent transactions
- **No deal pipeline/CRM** — no persistent deal tracking, stage management, or probability-weighted pipeline
- **No data room** — no secure document management or diligence checklist tracking
- **No integration planning module** — no synergy quantification, cultural assessment, or Day 1 readiness
- **No regulatory/antitrust analysis engine** — generic regulatory radar, not M&A-specific HSR/antitrust modeling
- **No valuation database** — no historical transaction multiples, comps sets, or market data feeds
- **No scenario modeling** — no Monte Carlo, sensitivity analysis, or what-if capabilities
- **No buyer/seller matching** — no algorithmic buyer identification or fit scoring
- **No market screening** — can't systematically screen targets by financial/strategic criteria

---

## Part 2: Enhancement Architecture

### 2.1 New Output Modalities

The platform must support multiple output types beyond HTML presentations. Each modality serves a different stakeholder and decision context.

#### Output Modality Registry

```
OUTPUT_MODALITIES = {
  "presentation":    HTML5 interactive slide deck (existing)
  "executive-memo":  Structured 2-5 page executive brief (PDF/HTML)
  "financial-model": Interactive spreadsheet-like financial model (JSON + renderer)
  "data-room":       Organized diligence package with document index
  "deal-scorecard":  Single-page deal scoring matrix with go/no-go recommendation
  "market-map":      Visual market landscape with deal flow overlay
  "timeline":        Interactive deal timeline with milestones and dependencies
  "comparison":      Side-by-side target comparison matrix
  "risk-matrix":     Quantified risk assessment with heat map
  "teaser":          One-page investment teaser / CIM summary
}
```

#### Phase 4 Refactor: Multi-Modal Output Engine

Replace the single `present()` function with a pluggable output engine:

```typescript
// src/lib/pipeline/output/engine.ts
interface OutputRequest {
  modality: OutputModality;
  synthesis: SynthesisResult;
  agentResults: AgentResult[];
  blueprint: Blueprint;
  financialModel?: FinancialModelData;
  options?: OutputOptions;
}

interface OutputResult {
  modality: OutputModality;
  content: string | Buffer;
  format: "html" | "pdf" | "json" | "xlsx" | "pptx";
  metadata: OutputMetadata;
}

class OutputEngine {
  private renderers: Map<OutputModality, OutputRenderer>;

  async render(request: OutputRequest): Promise<OutputResult>;
  async renderMultiple(requests: OutputRequest[]): Promise<OutputResult[]>;
}
```

#### Implementation Files

```
src/lib/pipeline/output/
├── engine.ts              # Output orchestrator
├── types.ts               # Output type definitions
├── renderers/
│   ├── presentation.ts    # Existing HTML deck (refactored from present.ts)
│   ├── executive-memo.ts  # PDF/HTML executive summary
│   ├── financial-model.ts # Interactive financial model
│   ├── deal-scorecard.ts  # Go/no-go scoring matrix
│   ├── market-map.ts      # Market landscape visualization
│   ├── comparison.ts      # Target comparison matrix
│   ├── risk-matrix.ts     # Risk heat map
│   ├── teaser.ts          # Investment teaser
│   └── timeline.ts        # Deal timeline
├── templates/
│   ├── memo-template.html
│   ├── scorecard-template.html
│   ├── teaser-template.html
│   └── shared-components.html
└── export/
    ├── pdf.ts             # HTML-to-PDF via Puppeteer/Playwright
    ├── pptx.ts            # HTML-to-PPTX via pptxgenjs
    └── xlsx.ts            # Financial model to Excel via ExcelJS
```

### 2.2 World-Class M&A Engine

#### 2.2.1 New M&A Agent Archetypes

Add purpose-built M&A agents to the archetype registry:

```typescript
// New archetypes for src/lib/pipeline/archetypes.ts

VALUATION-ENGINEER: {
  lens: "What is this asset worth under different methodologies and scenarios?",
  bias: "Quantitative precision — every assumption must be explicit and testable",
  description: "Builds DCF, LBO, comps, and precedent transaction analyses. Produces structured financial models with sensitivity tables.",
  compatibleSkills: ["valuation-toolkit", "payer-financial-decoder", "drug-pipeline-intel"]
}

DEAL-ARCHITECT: {
  lens: "How should this transaction be structured to maximize value and minimize risk?",
  bias: "Structural creativity — find non-obvious deal structures",
  description: "Evaluates deal structures (asset vs stock, earnouts, CVRs, reverse mergers), tax implications, regulatory pathways, and closing mechanics.",
  compatibleSkills: ["deal-structuring", "regulatory-radar", "healthcare-ma-signal-hunter"]
}

INTEGRATION-PLANNER: {
  lens: "How do you combine two organizations without destroying value?",
  bias: "Operational pragmatism — focus on Day 1, Day 100, Year 1 milestones",
  description: "Plans post-merger integration across technology, people, process, and culture. Quantifies synergies and dis-synergies.",
  compatibleSkills: ["integration-playbook", "competitor-battlecard"]
}

DILIGENCE-INVESTIGATOR: {
  lens: "What are they not telling you?",
  bias: "Investigative skepticism — verify every material claim",
  description: "Systematic due diligence across financial, legal, operational, technology, and HR dimensions. Produces diligence finding reports with red/yellow/green flags.",
  compatibleSkills: ["diligence-checklist", "healthcare-ma-signal-hunter", "regulatory-radar"]
}

MARKET-SCREENER: {
  lens: "Which targets fit the acquisition criteria across the universe of possibilities?",
  bias: "Systematic coverage — no viable target should be missed",
  description: "Screens potential targets or buyers against defined criteria. Ranks by strategic fit, financial attractiveness, and acquisition feasibility.",
  compatibleSkills: ["market-screening", "payer-financial-decoder", "healthcare-ma-signal-hunter"]
}

SYNERGY-MODELER: {
  lens: "Where does 1+1=3, and where does it equal 1.5?",
  bias: "Quantitative rigor with honest uncertainty — model both upside and integration friction",
  description: "Identifies and quantifies revenue synergies, cost synergies, and dis-synergies. Builds synergy realization timelines.",
  compatibleSkills: ["synergy-framework", "payer-financial-decoder"]
}

ANTITRUST-ANALYST: {
  lens: "Will regulators block, condition, or wave through this deal?",
  bias: "Regulatory realism — model what agencies actually do, not what theory suggests",
  description: "Analyzes HSR filing requirements, market concentration (HHI), likely DOJ/FTC concerns, potential remedies, and timeline to clearance.",
  compatibleSkills: ["antitrust-framework", "regulatory-radar", "healthcare-ma-signal-hunter"]
}
```

#### 2.2.2 New M&A Skills

```typescript
// New skills for src/lib/pipeline/skill-router.ts

VALUATION_TOOLKIT: {
  id: "valuation-toolkit",
  promptContext: `
    ## Valuation Methodologies
    ### DCF (Discounted Cash Flow)
    - Project 5-10 year unlevered FCF
    - Terminal value: Gordon Growth (2-3% perpetuity) or Exit Multiple
    - WACC: Cost of equity (CAPM) + after-tax cost of debt, weighted by target capital structure
    - Sensitivity: WACC (±1%) × Terminal Growth (±0.5%) matrix

    ### Comparable Company Analysis
    - Select 8-15 public comps by: sector, size, growth, margin profile
    - Multiples: EV/Revenue, EV/EBITDA, EV/EBIT, P/E, PEG
    - Apply median/mean, trim outliers, adjust for growth differential

    ### Precedent Transactions
    - Healthcare M&A transactions in trailing 3-5 years
    - Control premium analysis (typically 25-40% for healthcare)
    - Adjust for market conditions, deal type, strategic vs financial buyer

    ### LBO Analysis (for PE targets)
    - Entry multiple, leverage (4-6x EBITDA typical healthcare)
    - 5-year hold, debt paydown + EBITDA growth + multiple expansion
    - Target: 2.5x+ MOIC, 20%+ IRR

    ### Healthcare-Specific Adjustments
    - Risk adjustment revenue: normalize for V28 impact
    - Star Rating value: quantify QBP as perpetuity stream
    - Regulatory overhang: discount for pending rule changes
    - GLP-1 exposure: model pharmacy cost trajectory
  `
}

DEAL_STRUCTURING: {
  id: "deal-structuring",
  promptContext: `
    ## Deal Structure Options
    - Asset purchase vs stock purchase (tax implications, liability transfer)
    - Merger types: forward, reverse, triangular
    - Earnout structures (performance-based contingent consideration)
    - Contingent Value Rights (CVRs) for pipeline assets
    - Representations & Warranties Insurance (RWI)
    - Material Adverse Change (MAC) clauses
    - Regulatory condition precedents (HSR, state DOI approval for insurance)
    - Go-shop vs no-shop provisions
    - Break-up fees (typically 2-4% of deal value)
    - Financing conditions (committed financing letters)

    ## Healthcare-Specific Structures
    - Change of control provisions in CMS contracts
    - State insurance department approvals (timeline: 60-180 days)
    - Provider network assignment and consent requirements
    - HIPAA BAA transfers and data migration
    - Pharmacy benefit contracts and rebate assignments
  `
}

INTEGRATION_PLAYBOOK: {
  id: "integration-playbook",
  promptContext: `
    ## Integration Phases
    ### Day 1 Readiness (Closing → Day 1)
    - Legal entity changes, bank accounts, signing authority
    - Employee communications, retention packages for key talent
    - IT system access, email migration, VPN
    - Customer/member communications
    - Regulatory notifications (CMS, state DOI)

    ### First 100 Days
    - Organization design and leadership appointments
    - Quick wins identification and execution
    - Technology integration roadmap
    - Cultural assessment and integration
    - Synergy tracking framework activation

    ### Year 1
    - System consolidation (EMR, claims, analytics platforms)
    - Product rationalization
    - Network optimization
    - Full synergy realization plan

    ## Synergy Categories
    | Type | Examples | Realization Timeline |
    |------|----------|---------------------|
    | Cost - Headcount | Eliminate duplicate roles | 6-18 months |
    | Cost - Technology | Consolidate platforms | 12-36 months |
    | Cost - Procurement | Combined purchasing power | 6-12 months |
    | Revenue - Cross-sell | Sell acquirer products to target's customers | 12-24 months |
    | Revenue - Market access | Enter new geographies/segments | 6-18 months |
    | Strategic - Data | Combined data assets create new capabilities | 12-36 months |
  `
}

DILIGENCE_CHECKLIST: {
  id: "diligence-checklist",
  promptContext: `
    ## Due Diligence Workstreams
    ### Financial Diligence
    - Quality of earnings (QoE): Normalize EBITDA for one-time items
    - Revenue sustainability: customer concentration, contract renewals, churn
    - Working capital analysis: net working capital peg
    - Debt-like items: operating leases, litigation reserves, deferred revenue
    - Tax diligence: NOLs, tax positions, state tax exposure

    ### Commercial Diligence
    - Market sizing (TAM/SAM/SOM)
    - Customer interviews (10-15 minimum)
    - Win/loss analysis
    - Competitive positioning and switching costs
    - Pricing power and elasticity

    ### Operational Diligence
    - Technology stack assessment (build vs buy debt)
    - Key person dependencies
    - Vendor/supplier concentration
    - Scalability constraints
    - IP audit (patents, trade secrets, licenses)

    ### Healthcare-Specific
    - CMS contract review (risk corridors, MLR requirements)
    - Star Ratings trajectory and methodology risk
    - Provider network adequacy and contracting
    - Regulatory compliance history (CMS audits, OIG investigations)
    - HIPAA/security posture
    - State licensure and insurance department standing

    ### Red Flag Indicators
    - Customer concentration >25% single customer
    - Revenue growth driven by price increases not volume
    - Key technology approaching end-of-life
    - Pending or threatened litigation >5% of enterprise value
    - Material regulatory findings in last 3 years
    - Key executive departures in last 12 months
  `
}

ANTITRUST_FRAMEWORK: {
  id: "antitrust-framework",
  promptContext: `
    ## HSR (Hart-Scott-Rodino) Analysis
    ### Filing Thresholds (2026)
    - Size of transaction test: ~$119.5M+ (adjusted annually)
    - Size of person test: One party $239M+ assets/sales, other $23.9M+

    ### Market Definition
    - Product market: Substitute products from buyer's perspective
    - Geographic market: Where competition occurs (national, regional, local)
    - Healthcare specifics: By service line, by payer type, by geography

    ### Concentration Analysis (HHI)
    - <1,500: Unconcentrated → likely clearance
    - 1,500-2,500: Moderately concentrated → scrutiny if delta >100
    - >2,500: Highly concentrated → scrutiny if delta >200
    - >5,000: Very highly concentrated → presumptively anticompetitive

    ### DOJ/FTC Healthcare Enforcement Patterns
    - Hospital mergers: geographic market analysis (< 5 competitors = risk)
    - Insurance mergers: product market by state/MSA
    - PBM/pharmacy: vertical integration concerns
    - Health IT: data aggregation and interoperability concerns
    - Provider-payer vertical: foreclosure theories

    ### Remedies
    - Structural: Divestitures of overlapping operations
    - Behavioral: Firewall agreements, non-discrimination commitments
    - Fix-it-first: Divest before closing

    ### Timeline
    - HSR filing → 30-day initial waiting period
    - Second Request → 6-12 additional months
    - Consent decree negotiation → 2-6 months
    - Litigation (if challenged) → 12-18 months
  `
}

SYNERGY_FRAMEWORK: {
  id: "synergy-framework",
  promptContext: `
    ## Synergy Quantification Framework

    ### Cost Synergies (higher certainty, faster realization)
    | Category | Typical Range | Confidence |
    |----------|--------------|------------|
    | Corporate overhead | 30-50% of smaller entity | HIGH |
    | IT/Technology | 15-30% combined spend | MEDIUM |
    | Procurement | 5-15% of combined spend | MEDIUM |
    | Real estate | 20-40% of redundant space | HIGH |
    | Sales & Marketing | 10-25% of combined spend | MEDIUM |

    ### Revenue Synergies (lower certainty, slower realization)
    | Category | Typical Range | Confidence |
    |----------|--------------|------------|
    | Cross-sell | 3-8% revenue uplift | LOW |
    | New market entry | 5-15% revenue growth | LOW |
    | Combined capabilities | Variable | LOW-MEDIUM |
    | Pricing power | 1-3% yield improvement | MEDIUM |

    ### Dis-synergies (must be modeled honestly)
    - Customer attrition: 3-8% in year 1
    - Employee attrition: 10-20% voluntary departures
    - Integration costs: 5-10% of deal value
    - Productivity loss: 10-15% during transition
    - Technology migration: 1-3 year timeline, front-loaded costs

    ### Realization Curve
    Year 1: 25% of run-rate synergies
    Year 2: 60% of run-rate synergies
    Year 3: 85% of run-rate synergies
    Year 4+: 100% of run-rate synergies (if achieved)

    ### Valuation Impact
    Synergy NPV = Σ(Annual Synergy × Realization%) / (1 + WACC)^t
    Typically: buyer should pay 50-70% of NPV as acquisition premium
  `
}

MARKET_SCREENING: {
  id: "market-screening",
  promptContext: `
    ## Target Screening Methodology

    ### Tier 1 Filters (quantitative pass/fail)
    - Revenue range (min/max)
    - EBITDA margin threshold
    - Growth rate minimum
    - Geographic focus
    - Regulatory standing (no material enforcement actions)

    ### Tier 2 Scoring (weighted 0-100)
    | Criterion | Weight | Scoring |
    |-----------|--------|---------|
    | Strategic fit | 25% | Alignment to buyer thesis |
    | Financial attractiveness | 20% | Margin, growth, efficiency |
    | Competitive position | 15% | Market share, brand, moat |
    | Technology | 15% | Platform quality, data assets |
    | Integration ease | 10% | Cultural fit, system compatibility |
    | Regulatory risk | 10% | Antitrust, licensing, compliance |
    | Management quality | 5% | Team depth, retention likelihood |

    ### Healthcare-Specific Screening
    - Star Ratings (current and trajectory)
    - CMS contract types and geographic coverage
    - Provider network overlap/complement
    - Technology stack compatibility
    - Regulatory compliance history
    - Member/patient demographics and risk profiles
  `
}
```

#### 2.2.3 Financial Modeling Engine

A new subsystem that performs quantitative financial analysis alongside the qualitative agent pipeline.

```
src/lib/financial/
├── engine.ts           # Financial computation orchestrator
├── dcf.ts              # Discounted cash flow model
├── comps.ts            # Comparable company analysis
├── precedents.ts       # Precedent transaction analysis
├── lbo.ts              # Leveraged buyout model
├── synergy-model.ts    # Synergy quantification
├── sensitivity.ts      # Sensitivity and scenario analysis
├── accretion.ts        # Accretion/dilution analysis
├── types.ts            # Financial model types
└── data/
    ├── multiples.ts    # Industry multiple benchmarks
    └── assumptions.ts  # Standard assumption sets
```

Key types:
```typescript
interface FinancialModel {
  methodology: "dcf" | "comps" | "precedents" | "lbo" | "sum-of-parts";
  assumptions: Assumption[];
  projections: YearlyProjection[];
  valuation: ValuationRange;
  sensitivity: SensitivityTable;
  scenarios: ScenarioAnalysis;
}

interface ValuationRange {
  low: number;
  mid: number;
  high: number;
  methodology: string;
  keyAssumptions: string[];
}

interface SensitivityTable {
  rowVariable: string;
  colVariable: string;
  rows: number[];
  cols: number[];
  values: number[][];
}
```

#### 2.2.4 Deal Pipeline & Knowledge Graph

Persistent deal tracking and cross-run intelligence accumulation.

```
src/lib/deals/
├── pipeline.ts         # Deal lifecycle management
├── knowledge-graph.ts  # Cross-run intelligence accumulation
├── scoring.ts          # Deal scoring and ranking
├── alerts.ts           # Signal-based deal alerts
└── types.ts            # Deal types

prisma/schema additions:
  Deal {
    id, name, targetCompany, status (screening|diligence|negotiation|closing|closed|dead)
    dealType (acquisition|merger|divestiture|jv|investment)
    estimatedValue, actualValue
    buyer, seller
    sector, subsector
    stage, probability
    assignedTeam
    runs[] (linked PRISM runs)
    findings[] (aggregated cross-run findings)
    documents[] (data room files)
    scores (deal scorecard)
    timeline (milestone tracking)
    createdAt, updatedAt, closedAt
  }

  DealSignal {
    id, dealId, source, signalType, confidence
    description, rawData, detectedAt
  }

  KnowledgeNode {
    id, entityType (company|person|deal|market|regulation)
    name, properties (JSON)
    lastUpdated
  }

  KnowledgeEdge {
    id, fromId, toId, relationship
    properties (JSON), confidence
    source (which run/agent discovered this)
  }
```

### 2.3 Framework Enhancements

#### 2.3.1 Multi-Modal Executor

Modify the executor to support multiple output modalities per run:

```typescript
// Enhanced PipelineInput
interface PipelineInput {
  query: string;
  runId: string;
  autonomyMode?: AutonomyMode;
  outputModalities?: OutputModality[];  // NEW: request multiple outputs
  dealId?: string;                       // NEW: link to deal pipeline
  priorRunIds?: string[];               // NEW: reference prior analyses
  financialInputs?: FinancialInputs;    // NEW: financial model parameters
  signal?: AbortSignal;
  onEvent?: (event: PipelineEvent) => void;
}
```

#### 2.3.2 Agent Memory & Learning

Cross-run agent memory for M&A intelligence accumulation:

```
src/lib/pipeline/agent-memory.ts
  - Store high-confidence findings in knowledge graph after each run
  - On new runs, inject relevant prior findings as context
  - Track agent performance metrics (finding quality, citation accuracy)
  - Enable "follow-up" runs that build on prior analysis
```

#### 2.3.3 Query Intent Classification

Enhance the THINK phase to classify query intent and auto-select appropriate agents and output modalities:

```typescript
interface QueryClassification {
  primaryIntent: "valuation" | "diligence" | "screening" | "landscape" | "integration" | "general";
  dealStage?: "pre-loi" | "loi" | "diligence" | "negotiation" | "closing" | "post-close";
  outputRecommendations: OutputModality[];
  agentRecommendations: string[];  // archetype names
  financialModelNeeded: boolean;
}
```

---

## Part 3: Implementation Plan

### Phase 1: Foundation (Weeks 1-3)

**Goal:** Refactor output system, add executive memo and PDF export, lay groundwork for deal pipeline.

| # | Task | Files | Priority |
|---|------|-------|----------|
| 1.1 | Create `src/lib/pipeline/output/` directory structure | New directory | P0 |
| 1.2 | Refactor `present.ts` into `output/renderers/presentation.ts` | Move + refactor | P0 |
| 1.3 | Build `OutputEngine` orchestrator with renderer plugin system | `output/engine.ts` | P0 |
| 1.4 | Implement `executive-memo` renderer (HTML + PDF) | `renderers/executive-memo.ts` | P0 |
| 1.5 | Add PDF export via Playwright/Puppeteer | `output/export/pdf.ts` | P0 |
| 1.6 | Add `outputModalities` to pipeline input/executor | `executor.ts`, `types.ts` | P0 |
| 1.7 | Update API routes to support multi-modal output requests | `api/pipeline/stream/route.ts` | P1 |
| 1.8 | Add output modality selector to UI InputPhase | `components/phases/InputPhase.tsx` | P1 |
| 1.9 | Create deal-scorecard renderer | `renderers/deal-scorecard.ts` | P1 |
| 1.10 | Add PPTX export | `output/export/pptx.ts` | P2 |

### Phase 2: M&A Agent Suite (Weeks 3-5)

**Goal:** Add purpose-built M&A agents and skills.

| # | Task | Files | Priority |
|---|------|-------|----------|
| 2.1 | Add 7 new M&A archetypes to registry | `archetypes.ts` | P0 |
| 2.2 | Add 6 new M&A skills to skill router | `skill-router.ts` | P0 |
| 2.3 | Add query intent classification to THINK phase | `think.ts` | P0 |
| 2.4 | Add M&A-specific dimension heuristics (signal detection keywords) | `think.ts` | P1 |
| 2.5 | Add M&A interconnection pairs to known interconnections | `think.ts` | P1 |
| 2.6 | Create VALUATION-ENGINEER tool definitions | `construct.ts` | P1 |
| 2.7 | Create DILIGENCE-INVESTIGATOR output schema | `types.ts` | P1 |
| 2.8 | Add archetype-to-skill mappings for new M&A archetypes | `archetypes.ts` | P1 |
| 2.9 | Update neutral framing for M&A-specific mandates | `construct.ts` | P2 |

### Phase 3: Financial Modeling Engine (Weeks 5-8)

**Goal:** Build quantitative financial modeling capabilities.

| # | Task | Files | Priority |
|---|------|-------|----------|
| 3.1 | Create `src/lib/financial/` directory structure | New directory | P0 |
| 3.2 | Define financial model types and schemas | `financial/types.ts` | P0 |
| 3.3 | Build DCF model engine | `financial/dcf.ts` | P0 |
| 3.4 | Build comps analysis engine | `financial/comps.ts` | P0 |
| 3.5 | Build LBO model engine | `financial/lbo.ts` | P1 |
| 3.6 | Build sensitivity/scenario analysis | `financial/sensitivity.ts` | P1 |
| 3.7 | Build synergy quantification model | `financial/synergy-model.ts` | P1 |
| 3.8 | Build accretion/dilution analysis | `financial/accretion.ts` | P2 |
| 3.9 | Create financial model renderer (interactive HTML) | `renderers/financial-model.ts` | P1 |
| 3.10 | Add Excel export for financial models | `output/export/xlsx.ts` | P1 |
| 3.11 | Wire financial engine into VALUATION-ENGINEER agent | `deploy.ts` | P1 |
| 3.12 | Build industry multiples reference data | `financial/data/multiples.ts` | P2 |

### Phase 4: Deal Pipeline & Knowledge Graph (Weeks 8-11)

**Goal:** Persistent deal tracking and cross-run intelligence.

| # | Task | Files | Priority |
|---|------|-------|----------|
| 4.1 | Add Deal, DealSignal, KnowledgeNode, KnowledgeEdge to Prisma schema | `schema.prisma` | P0 |
| 4.2 | Build deal pipeline CRUD operations | `src/lib/deals/pipeline.ts` | P0 |
| 4.3 | Build knowledge graph write/query operations | `src/lib/deals/knowledge-graph.ts` | P0 |
| 4.4 | Build deal scoring engine | `src/lib/deals/scoring.ts` | P1 |
| 4.5 | Add cross-run knowledge injection to CONSTRUCT phase | `construct.ts` | P1 |
| 4.6 | Build agent memory persistence after each run | `agent-memory.ts` | P1 |
| 4.7 | Create deal pipeline UI (Kanban-style board) | `src/app/deals/page.tsx` | P1 |
| 4.8 | Create deal detail page with linked runs | `src/app/deals/[id]/page.tsx` | P1 |
| 4.9 | Add signal-based alerting for deal pipeline | `src/lib/deals/alerts.ts` | P2 |
| 4.10 | Build market screening UI and API | `src/app/api/deals/screen/` | P2 |

### Phase 5: Advanced Output & Visualization (Weeks 11-14)

**Goal:** Complete the output modality suite with advanced visualizations.

| # | Task | Files | Priority |
|---|------|-------|----------|
| 5.1 | Build market-map renderer (D3.js-based) | `renderers/market-map.ts` | P1 |
| 5.2 | Build comparison matrix renderer | `renderers/comparison.ts` | P1 |
| 5.3 | Build risk-matrix renderer with heat map | `renderers/risk-matrix.ts` | P1 |
| 5.4 | Build investment teaser renderer | `renderers/teaser.ts` | P1 |
| 5.5 | Build deal timeline renderer (interactive Gantt) | `renderers/timeline.ts` | P2 |
| 5.6 | Add version comparison (diff two runs) | `src/lib/pipeline/diff.ts` | P2 |
| 5.7 | Add print-optimized CSS for all renderers | `public/styles/print.css` | P2 |
| 5.8 | Add collaborative annotation system | `src/lib/annotations/` | P2 |

### Phase 6: Intelligence Amplification (Weeks 14-16)

**Goal:** Advanced synthesis and agent coordination for M&A.

| # | Task | Files | Priority |
|---|------|-------|----------|
| 6.1 | Add mid-run agent coordination (agent-to-agent messaging) | `deploy.ts`, `memory-bus.ts` | P1 |
| 6.2 | Add algorithmic pre-processing for emergence detection | `synthesize.ts` | P1 |
| 6.3 | Add agent performance tracking and feedback loop | `src/lib/pipeline/agent-metrics.ts` | P2 |
| 6.4 | Add adaptive tool routing based on query classification | `construct.ts` | P2 |
| 6.5 | Add M&A-specific synthesis templates | `synthesize.ts` | P1 |
| 6.6 | Build "follow-up" run capability (incremental analysis) | `executor.ts` | P2 |

---

## Part 4: Dependency & Package Additions

```json
{
  "dependencies": {
    "pptxgenjs": "^3.12.0",        // PPTX generation
    "exceljs": "^4.4.0",           // Excel export
    "d3": "^7.9.0",                // Data visualization
    "@playwright/test": "^1.45.0"  // PDF generation (or puppeteer)
  }
}
```

---

## Part 5: Database Migration Plan

```sql
-- Migration: Add M&A deal pipeline tables
CREATE TABLE "Deal" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "targetCompany" TEXT,
  "buyerCompany" TEXT,
  "dealType" TEXT NOT NULL DEFAULT 'acquisition',
  "status" TEXT NOT NULL DEFAULT 'screening',
  "sector" TEXT,
  "subsector" TEXT,
  "estimatedValue" REAL,
  "probability" REAL DEFAULT 0.5,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" DATETIME
);

CREATE TABLE "DealRun" (
  "dealId" TEXT NOT NULL REFERENCES "Deal"("id"),
  "runId" TEXT NOT NULL REFERENCES "Run"("id"),
  PRIMARY KEY ("dealId", "runId")
);

CREATE TABLE "DealSignal" (
  "id" TEXT PRIMARY KEY,
  "dealId" TEXT REFERENCES "Deal"("id"),
  "source" TEXT NOT NULL,
  "signalType" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "KnowledgeNode" (
  "id" TEXT PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "properties" TEXT DEFAULT '{}',
  "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "KnowledgeEdge" (
  "id" TEXT PRIMARY KEY,
  "fromId" TEXT NOT NULL REFERENCES "KnowledgeNode"("id"),
  "toId" TEXT NOT NULL REFERENCES "KnowledgeNode"("id"),
  "relationship" TEXT NOT NULL,
  "properties" TEXT DEFAULT '{}',
  "confidence" TEXT DEFAULT 'MEDIUM',
  "sourceRunId" TEXT REFERENCES "Run"("id")
);

-- Add output tracking to presentations
ALTER TABLE "Presentation" ADD COLUMN "modality" TEXT DEFAULT 'presentation';
ALTER TABLE "Presentation" ADD COLUMN "format" TEXT DEFAULT 'html';

-- Add deal linkage to runs
ALTER TABLE "Run" ADD COLUMN "dealId" TEXT REFERENCES "Deal"("id");
ALTER TABLE "Run" ADD COLUMN "outputModalities" TEXT DEFAULT '["presentation"]';
```

---

## Part 6: Success Metrics

### M&A Engine Quality
- Valuation accuracy: Within 15% of actual transaction values on historical deals
- Diligence coverage: 90%+ of standard diligence checklist items addressed
- Signal detection: Identify 80%+ of publicly announced deals 30+ days before close
- Synergy estimation: Within 25% of post-close reported synergies

### Output Quality
- Executive memo: Consistently rated "board-ready" by users
- Financial models: Match structure/quality of junior analyst output
- PDF export: Pixel-perfect rendering of all HTML components
- Multi-modal: Users select 2+ output types in 60%+ of runs

### Platform Performance
- Pipeline completion rate: 95%+ (up from current)
- Agent success rate: 98%+ per individual agent
- Knowledge graph utility: 40%+ of runs reference prior findings by month 3
- Deal pipeline adoption: 70%+ of M&A users create persistent deals

---

## Part 7: Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Financial models produce inaccurate outputs | Extensive validation against known deals; always show assumptions prominently |
| Token costs escalate with more agents | Budget caps per run tier; financial engine runs locally (not LLM-dependent) |
| Knowledge graph grows unwieldy | TTL on knowledge edges; confidence decay over time; manual curation UI |
| PDF generation is slow | Cache renders; generate async in background; show HTML preview immediately |
| M&A data sources are insufficient | Design for graceful degradation; surface data gaps prominently; suggest manual data entry |
| Agent coordination creates circular dependencies | Strict wave ordering; no cycles in agent messaging graph; timeout on coordination |

---

## Appendix: File Inventory (New Files)

```
src/lib/pipeline/output/
  engine.ts, types.ts
  renderers/: presentation.ts, executive-memo.ts, financial-model.ts,
              deal-scorecard.ts, market-map.ts, comparison.ts,
              risk-matrix.ts, teaser.ts, timeline.ts
  templates/: memo-template.html, scorecard-template.html, teaser-template.html
  export/: pdf.ts, pptx.ts, xlsx.ts

src/lib/financial/
  engine.ts, dcf.ts, comps.ts, precedents.ts, lbo.ts,
  synergy-model.ts, sensitivity.ts, accretion.ts, types.ts
  data/: multiples.ts, assumptions.ts

src/lib/deals/
  pipeline.ts, knowledge-graph.ts, scoring.ts, alerts.ts, types.ts

src/lib/pipeline/
  agent-memory.ts, agent-metrics.ts, diff.ts

src/app/deals/
  page.tsx, [id]/page.tsx

src/app/api/deals/
  route.ts, [id]/route.ts, screen/route.ts

public/styles/
  print.css

prisma/migrations/
  [timestamp]_add_ma_engine_tables/migration.sql
```

**Total new files:** ~45
**Total modified files:** ~15 (executor.ts, think.ts, construct.ts, deploy.ts, synthesize.ts, archetypes.ts, skill-router.ts, types.ts, schema.prisma, page.tsx, InputPhase.tsx, CompletePhase.tsx, DeckLibrary.tsx, settings-types.ts, constants.ts)
