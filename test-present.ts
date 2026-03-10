import { present } from "./src/lib/pipeline/present";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

/**
 * Rich mock data for testing the full presentation component library.
 *
 * This mock simulates a 5-agent EXTENDED tier analysis with:
 * - 5 agents across 5 dimensions with 3-5 findings each (numerical data for charts)
 * - 5 synthesis layers with rich insights
 * - 3 emergent insights (for emergence cards)
 * - 2 tension points (for debate slides)
 * - Mixed confidence and source tiers (for provenance visualization)
 * - Critic revisions
 *
 * The goal is to exercise: SVG bar/donut/sparkline charts, animated counters,
 * threat meters, state grids, emergence cards, timeline bars, comparison layouts.
 */

async function run() {
    console.log("Starting RICH presentation generation test...");
    try {
        const result = await present({
            synthesis: {
                layers: [
                    {
                        name: "foundation",
                        description: "Uncontested Ground — facts accepted across all agents",
                        insights: [
                            "GLP-1 agonist class has achieved 23% formulary penetration across commercial plans as of Q1 2026",
                            "Total addressable market for GLP-1 weight management exceeds $48B annually by 2028",
                            "Clinical trial dropout rates for GLP-1 therapies average 12-18% across Phase III programs",
                            "CMS has issued draft guidance on GLP-1 coverage for obesity indication under Part D",
                        ],
                    },
                    {
                        name: "convergence",
                        description: "Cross-Agent Agreement — independent agents reached same conclusions",
                        insights: [
                            "Cost offsets from reduced cardiovascular events materialize at 18-24 months post-initiation, confirmed by both Clinical and Economic agents",
                            "Payer prior authorization burden is the #1 barrier to adoption, identified independently by Market, Regulatory, and Access agents",
                            "Real-world effectiveness data shows 15-22% weight reduction sustained at 12 months across diverse populations",
                        ],
                    },
                    {
                        name: "tension",
                        description: "Productive Disagreements — agents found conflicting evidence",
                        insights: [
                            "Clinical agent finds strong cost-offset evidence; Economic agent finds budget impact remains net-negative for 3+ years",
                            "Market agent projects rapid adoption; Regulatory agent warns of incoming utilization management restrictions",
                        ],
                    },
                    {
                        name: "emergence",
                        description: "Novel Insights — patterns visible only through multi-agent analysis",
                        insights: [
                            "The intersection of prior auth burden + supply constraints creates a 'shadow rationing' effect that artificially suppresses demand curves",
                            "Combining cardiovascular outcome data with employer absenteeism models reveals a hidden $3,200/member/year productivity offset not captured in traditional pharmacoeconomic analyses",
                        ],
                    },
                    {
                        name: "gap",
                        description: "Known Unknowns — areas requiring further investigation",
                        insights: [
                            "No robust data exists on GLP-1 adherence beyond 24 months in real-world populations",
                            "Medicaid managed care adoption patterns remain opaque — only 3 of 15 major MCOs have published coverage policies",
                            "Biosimilar competition timeline is uncertain, with first entrants expected 2028-2030",
                        ],
                    },
                ],
                emergentInsights: [
                    {
                        insight: "Shadow rationing through prior authorization complexity creates artificial demand suppression that masks true market size by an estimated 30-40%",
                        algorithm: "cross_agent_theme_mining",
                        supportingAgents: ["Market Strategist", "Regulatory Navigator", "Access & Equity Analyst"],
                        evidenceSources: ["PBM formulary restriction analysis", "CMS prior auth burden study 2025", "Patient access survey data N=12,400"],
                        qualityScores: { novelty: 5, grounding: 4, actionability: 5, depth: 4, surprise: 4 },
                        whyMultiAgent: "No single agent sees both the regulatory burden data AND the market demand modeling — the insight only emerges when prior auth rejection rates (Regulatory) are overlaid on market penetration curves (Market) and patient access barriers (Access)",
                    },
                    {
                        insight: "Hidden productivity offset of $3,200/member/year from reduced absenteeism and presenteeism creates a compelling employer ROI case that current pharmacoeconomic models systematically ignore",
                        algorithm: "gap_triangulation",
                        supportingAgents: ["Clinical Analyst", "Economic Modeler", "Market Strategist"],
                        evidenceSources: ["SELECT cardiovascular outcomes trial", "Employer health benefits survey 2025", "Workplace productivity meta-analysis (k=14 studies)"],
                        qualityScores: { novelty: 4, grounding: 3, actionability: 5, depth: 4, surprise: 5 },
                        whyMultiAgent: "Clinical agent provides the outcomes data, Economic agent supplies the modeling framework, and Market agent identifies the employer channel opportunity — the full ROI picture requires all three perspectives simultaneously",
                    },
                    {
                        insight: "Biosimilar entry timeline (2028-2030) creates a strategic window where first-mover payers who establish comprehensive GLP-1 coverage now will lock in rebate structures and clinical pathways that become defensible moats against late adopters",
                        algorithm: "structural_pattern_recognition",
                        supportingAgents: ["Market Strategist", "Regulatory Navigator", "Economic Modeler"],
                        evidenceSources: ["Patent cliff analysis for semaglutide/tirzepatide", "Historical biosimilar adoption curves (adalimumab case study)", "PBM contract structure analysis"],
                        qualityScores: { novelty: 3, grounding: 4, actionability: 5, depth: 3, surprise: 3 },
                        whyMultiAgent: "Market agent sees the competitive dynamics, Regulatory agent maps the patent landscape, and Economic agent models the rebate lock-in effects — the strategic window only becomes visible when all three timelines are overlaid",
                    },
                ],
                tensionPoints: [
                    {
                        tension: "Short-term budget impact vs. long-term cost offsets",
                        sideA: {
                            position: "GLP-1 therapies generate measurable cardiovascular and hospitalization cost offsets that justify premium pricing within 18-24 months",
                            agents: ["Clinical Analyst", "Market Strategist"],
                            evidence: ["SELECT trial: 20% MACE reduction", "Real-world claims data showing 34% reduction in ER visits", "Employer ROI models project positive returns by month 22"],
                        },
                        sideB: {
                            position: "Net budget impact remains negative for 36+ months when accounting for full population eligible, discontinuation rates, and dose escalation patterns",
                            agents: ["Economic Modeler", "Access & Equity Analyst"],
                            evidence: ["Budget impact model: -$4.2M per 10,000 lives in Year 1", "Dose escalation increases per-patient costs 40% by month 12", "Only 62% of initiators remain on therapy at 12 months"],
                        },
                        conflictType: "predictive",
                        resolution: "Both positions are valid under different time horizons. Recommend payers adopt a phased approach: targeted coverage for high-CV-risk populations first (positive ROI by month 18), expanding to broader obesity indication as cost offsets materialize",
                    },
                    {
                        tension: "Rapid market adoption vs. utilization management necessity",
                        sideA: {
                            position: "Broad formulary access accelerates population health benefits and positions plans competitively for employer groups demanding GLP-1 coverage",
                            agents: ["Market Strategist"],
                            evidence: ["78% of large employers now expect GLP-1 coverage", "Plans without coverage losing 12% of RFP competitions", "Early adopter plans show 3.2% membership growth premium"],
                        },
                        sideB: {
                            position: "Without robust prior authorization and step therapy protocols, unrestricted GLP-1 access will create unsustainable pharmacy spend growth of 15-20% annually",
                            agents: ["Regulatory Navigator", "Economic Modeler"],
                            evidence: ["States with minimal PA requirements saw 340% utilization spike in 2025", "Average GLP-1 spend per treated member: $12,400/year", "Unmanaged utilization projects to consume 8% of total pharmacy budget by 2027"],
                        },
                        conflictType: "values_based",
                        resolution: "Smart prior authorization — streamlined digital PA with clinical criteria (BMI ≥30 or ≥27 with comorbidities) reduces approval time to <24 hours while maintaining appropriate utilization controls",
                    },
                ],
                overallConfidence: "HIGH",
                criticRevisions: [
                    "Strengthened evidence citation for cardiovascular offset claims (added SELECT trial reference)",
                    "Added confidence intervals to budget impact projections (was point estimates only)",
                    "Flagged employer productivity offset as requiring further validation (downgraded from HIGH to MEDIUM confidence)",
                ],
            },
            agentResults: [
                {
                    agentName: "Clinical Analyst",
                    archetype: "Analyst",
                    dimension: "Clinical",
                    findings: [
                        {
                            statement: "GLP-1 agonists reduce major adverse cardiovascular events (MACE) by 20% in patients with established CVD, with NNT of 50 over 3.4 years",
                            evidence: "SELECT trial (N=17,604): semaglutide 2.4mg vs placebo showed HR 0.80 (95% CI 0.72-0.90) for first MACE event. Confirmed by SUSTAIN-6 and LEADER trials.",
                            implication: "Cost offsets from avoided cardiovascular events are quantifiable and significant — estimated $8,400 per avoided event",
                            sourceTier: "PRIMARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "SELECT Trial — Lincoff et al., NEJM 2023",
                            tags: ["cardiovascular", "MACE", "GLP-1", "outcomes"],
                        },
                        {
                            statement: "Real-world weight reduction averages 15-22% of body weight at 12 months, with 68% of patients achieving ≥10% weight loss",
                            evidence: "Pooled analysis of 14 real-world studies (N=45,000+) across US commercial and Medicare populations. Effectiveness tracks within 85% of clinical trial efficacy.",
                            implication: "Real-world effectiveness is sufficiently close to trial efficacy to support pharmacoeconomic models based on RCT data",
                            sourceTier: "PRIMARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "JAMA Network Open 2025 real-world evidence review",
                            tags: ["weight-loss", "RWE", "effectiveness"],
                        },
                        {
                            statement: "Treatment discontinuation rates of 12-18% at 6 months and 38% at 12 months significantly erode population-level outcomes",
                            evidence: "Claims-based analysis of 120,000 GLP-1 initiators across 5 major PBMs. Primary reasons: GI side effects (42%), cost/coverage (31%), supply issues (18%).",
                            implication: "Persistence programs and GI titration protocols could improve adherence by 25-30%, materially improving ROI",
                            sourceTier: "PRIMARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "IQVIA Real-World Persistence Report 2025",
                            tags: ["adherence", "discontinuation", "persistence"],
                        },
                        {
                            statement: "Dose escalation from maintenance to maximum dose occurs in 45% of patients by month 12, increasing per-patient costs by approximately 40%",
                            evidence: "Dose titration analysis from integrated delivery networks (N=8,200). Median time to maximum dose: 8.3 months.",
                            implication: "Budget impact models using initial dose pricing underestimate true costs — must model dose escalation trajectory",
                            sourceTier: "SECONDARY",
                            confidence: "MEDIUM",
                            evidenceType: "inferred",
                            source: "Kaiser Permanente dose utilization study (internal)",
                            tags: ["dosing", "cost", "escalation"],
                        },
                    ],
                    gaps: ["No long-term (>24 month) adherence data in real-world populations", "Limited pediatric GLP-1 outcome data for obesity indication"],
                    signals: ["Rising formulary coverage across all segments", "FDA label expansion expected for heart failure indication Q3 2026"],
                    minorityViews: ["Some evidence suggests weight regain of 60-70% within 12 months of discontinuation, raising questions about long-term cost-effectiveness"],
                    toolsUsed: ["web_search", "pubmed_search"],
                    tokensUsed: 4500,
                },
                {
                    agentName: "Economic Modeler",
                    archetype: "Analyst",
                    dimension: "Economic",
                    findings: [
                        {
                            statement: "Budget impact for a 10,000-member commercial plan adopting broad GLP-1 coverage: -$4.2M in Year 1, -$1.8M in Year 2, +$0.6M in Year 3 (net positive by month 30)",
                            evidence: "Actuarial model incorporating utilization rates (2.8% eligible, 1.4% treated), dose escalation curves, discontinuation, and cardiovascular offset timing from SELECT data.",
                            implication: "Plans must prepare for 2+ years of net-negative budget impact before offsets materialize — bridge financing or risk corridor arrangements advisable",
                            sourceTier: "SECONDARY",
                            confidence: "MEDIUM",
                            evidenceType: "modeled",
                            source: "PRISM actuarial model v3.2 (validated against 3 health plan partners)",
                            tags: ["budget-impact", "cost", "ROI"],
                        },
                        {
                            statement: "Per-member-per-month (PMPM) cost impact of GLP-1 coverage ranges from $3.80-$6.20 depending on utilization management stringency",
                            evidence: "Scenario analysis across 4 utilization management tiers: open access ($6.20), standard PA ($4.90), enhanced PA + step therapy ($3.80), clinical pathway restriction ($3.10).",
                            implication: "Utilization management design is the primary lever for controlling GLP-1 spend — difference between open access and managed is $2.40 PMPM or $288/member/year",
                            sourceTier: "SECONDARY",
                            confidence: "HIGH",
                            evidenceType: "modeled",
                            source: "Milliman GLP-1 cost modeling framework",
                            tags: ["PMPM", "utilization-management", "cost-control"],
                        },
                        {
                            statement: "Cardiovascular cost offsets of $8,400 per avoided MACE event begin materializing at month 18, reaching steady state at month 36 with cumulative offset of $1,200 PMPM for treated population",
                            evidence: "Claims-linked outcomes analysis mapping SELECT trial endpoints to actual payer costs. Includes ER visits (-34%), hospitalizations (-28%), and specialist visits (-15%).",
                            implication: "The offset timeline is longer than many payers assume — contract structures should reflect this lag",
                            sourceTier: "PRIMARY",
                            confidence: "MEDIUM",
                            evidenceType: "direct",
                            source: "Optum Health Economics GLP-1 offset study 2025",
                            tags: ["cost-offset", "cardiovascular", "timeline"],
                        },
                        {
                            statement: "Employer-sponsored plans show hidden productivity offset of $3,200/member/year from reduced absenteeism (2.4 fewer sick days) and presenteeism improvements",
                            evidence: "Integrated analysis of employer health + disability + productivity data from 3 large self-insured employers (N=4,200 treated members). Methodology: matched cohort comparison.",
                            implication: "Total value of GLP-1 therapy exceeds pharmacy cost when productivity is included — employer channel ROI is positive within 12 months",
                            sourceTier: "TERTIARY",
                            confidence: "MEDIUM",
                            evidenceType: "inferred",
                            source: "Mercer employer health benefits analysis 2025 (preliminary)",
                            tags: ["productivity", "employer", "absenteeism"],
                        },
                        {
                            statement: "Biosimilar entry (projected 2028-2030) will reduce GLP-1 class costs by an estimated 40-60%, fundamentally altering the pharmacoeconomic equation",
                            evidence: "Historical analysis of biosimilar pricing dynamics across 8 biologic classes. Average price reduction: 52% within 3 years of first biosimilar entry.",
                            implication: "Current cost-effectiveness analyses may significantly undervalue long-term GLP-1 coverage — payers establishing pathways now will benefit disproportionately from future price compression",
                            sourceTier: "SECONDARY",
                            confidence: "LOW",
                            evidenceType: "analogical",
                            source: "IQVIA Biosimilar Market Dynamics Report + patent expiry analysis",
                            tags: ["biosimilar", "pricing", "future"],
                        },
                    ],
                    gaps: ["Medicaid-specific budget impact modeling incomplete", "No data on GLP-1 impact on concurrent medication costs (e.g., antihypertensives, statins)"],
                    signals: ["Three major PBMs restructuring GLP-1 rebate contracts for 2027", "CBO scoring of GLP-1 Medicare coverage legislation"],
                    minorityViews: [],
                    toolsUsed: ["web_search", "calculation"],
                    tokensUsed: 5200,
                },
                {
                    agentName: "Market Strategist",
                    archetype: "Strategist",
                    dimension: "Market",
                    findings: [
                        {
                            statement: "GLP-1 formulary penetration has reached 23% across commercial plans, up from 8% in 2024, following a classic S-curve adoption pattern with inflection point in Q3 2025",
                            evidence: "Monthly formulary tracking across 200+ commercial plans. Adoption rate: 0.5%/month in 2024, accelerating to 2.1%/month in H2 2025. Regional variation: 31% in Northeast, 18% in Southeast.",
                            implication: "We are past the inflection point — expect rapid acceleration to 45-55% penetration by end of 2027",
                            sourceTier: "PRIMARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "Formulary Watch proprietary tracking database",
                            tags: ["adoption", "formulary", "penetration"],
                        },
                        {
                            statement: "78% of large employers (5,000+ lives) now expect GLP-1 coverage in health plan RFPs, up from 34% in 2024",
                            evidence: "Survey of 420 employer benefits decision-makers conducted Q4 2025. 65% rated GLP-1 coverage as 'important' or 'very important' in plan selection.",
                            implication: "GLP-1 coverage is becoming table stakes for competitive plan positioning — plans without coverage are losing RFPs",
                            sourceTier: "PRIMARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "National Business Group on Health employer survey 2025",
                            tags: ["employer", "demand", "RFP"],
                        },
                        {
                            statement: "Plans with early GLP-1 coverage adoption show 3.2% membership growth premium over non-adopters, controlling for other plan features",
                            evidence: "Regression analysis of membership growth across 85 commercial plans (2024-2025). GLP-1 coverage status was significant (p<0.01) after controlling for premium, network breadth, and Star Rating.",
                            implication: "GLP-1 coverage drives competitive advantage in member acquisition — the growth premium justifies the near-term cost investment",
                            sourceTier: "SECONDARY",
                            confidence: "MEDIUM",
                            evidenceType: "inferred",
                            source: "McKinsey payer growth analysis (commissioned)",
                            tags: ["growth", "competitive", "membership"],
                        },
                    ],
                    gaps: ["Limited data on Medicaid managed care GLP-1 adoption patterns", "Direct-to-consumer GLP-1 channel market share not quantified"],
                    signals: ["Amazon Pharmacy entering GLP-1 direct-to-consumer channel", "Two major PBMs announcing GLP-1 preferred formulary positions for 2027"],
                    minorityViews: ["Some analysts believe the adoption curve will plateau at 35-40% due to affordability constraints in mid-market employer segment"],
                    toolsUsed: ["web_search"],
                    tokensUsed: 3800,
                },
                {
                    agentName: "Regulatory Navigator",
                    archetype: "Analyst",
                    dimension: "Regulatory",
                    findings: [
                        {
                            statement: "CMS draft guidance on GLP-1 Part D coverage for obesity (released Jan 2026) signals likely mandatory coverage by 2027, with estimated 3.4M new Medicare beneficiaries eligible",
                            evidence: "Analysis of CMS-2026-0042 proposed rule, congressional testimony by CMS Administrator, and CBO scoring of parallel legislation (Treat and Reduce Obesity Act reintroduction).",
                            implication: "Medicare GLP-1 coverage will create massive demand spike — plans must prepare capacity, contracting, and clinical pathway infrastructure 12-18 months ahead",
                            sourceTier: "PRIMARY",
                            confidence: "MEDIUM",
                            evidenceType: "direct",
                            source: "Federal Register CMS-2026-0042 + CBO Score S.2407",
                            tags: ["Medicare", "Part D", "coverage", "regulation"],
                        },
                        {
                            statement: "12 states have enacted or proposed GLP-1 parity laws requiring commercial plans to cover obesity medications on par with diabetes indications, with 8 more states considering similar legislation",
                            evidence: "State legislative tracking across all 50 states. Enacted: CA, NY, IL, MA, CO, WA, MN, NJ, CT, MD, VA, OR. Pending: TX, FL, PA, OH, GA, MI, NC, AZ.",
                            implication: "State mandates are reducing payer discretion on GLP-1 coverage decisions — the regulatory environment is shifting decisively toward mandated access",
                            sourceTier: "PRIMARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "NCSL state health legislation tracker + individual state bill analysis",
                            tags: ["state-mandate", "parity", "legislation"],
                        },
                        {
                            statement: "Prior authorization burden for GLP-1 therapies averages 4.2 hours of staff time per request, with 23% initial denial rate and 67% overturn rate on appeal",
                            evidence: "Multi-payer PA workflow analysis across 15 health plans. Total administrative cost of PA process: $312 per request including staff time, clinical review, and appeal processing.",
                            implication: "The PA process is consuming significant administrative resources while ultimately approving most requests — electronic PA and clinical pathway automation would reduce cost by 60-70%",
                            sourceTier: "SECONDARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "AMA Prior Authorization Physician Survey 2025 + AHIP administrative cost study",
                            tags: ["prior-auth", "administrative-burden", "efficiency"],
                        },
                    ],
                    gaps: ["FDA guidance on compounded GLP-1 products remains unclear", "Impact of potential CMS negotiation under IRA on GLP-1 pricing"],
                    signals: ["FDA accelerated review pathway for next-gen oral GLP-1 formulations", "HHS anti-obesity strategy expected Q2 2026"],
                    minorityViews: [],
                    toolsUsed: ["web_search", "gov_database"],
                    tokensUsed: 3200,
                },
                {
                    agentName: "Access & Equity Analyst",
                    archetype: "Analyst",
                    dimension: "Access",
                    findings: [
                        {
                            statement: "GLP-1 access disparities are severe: commercially insured patients are 4.7x more likely to receive GLP-1 therapy than Medicaid enrollees, and White patients 2.3x more likely than Black patients, controlling for BMI and comorbidities",
                            evidence: "Nationwide claims analysis (N=2.1M eligible patients) comparing GLP-1 initiation rates by insurance type, race/ethnicity, geography, and income level.",
                            implication: "Current coverage and access patterns are exacerbating health disparities — equity-focused coverage design must be a priority for responsible payer strategy",
                            sourceTier: "PRIMARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "Health Affairs equity analysis 2025",
                            tags: ["equity", "disparities", "access"],
                        },
                        {
                            statement: "Rural access to GLP-1 therapies is constrained by supply chain logistics: 34% of rural pharmacies report regular stockouts vs. 8% of urban pharmacies",
                            evidence: "NACDS pharmacy survey (N=1,200 pharmacies) tracking GLP-1 supply availability weekly over 6 months. Rural-urban divide persists across all GLP-1 products.",
                            implication: "Supply chain strategy must address rural distribution challenges — mail-order pharmacy and specialty pharmacy networks can partially bridge the gap",
                            sourceTier: "SECONDARY",
                            confidence: "MEDIUM",
                            evidenceType: "direct",
                            source: "NACDS Supply Chain Report + APhA rural pharmacy survey",
                            tags: ["rural", "supply-chain", "stockout"],
                        },
                        {
                            statement: "Patient out-of-pocket costs remain the primary barrier to initiation: 47% of eligible patients cite cost as reason for not starting therapy, with average monthly OOP of $250-$450 depending on plan design",
                            evidence: "Patient survey (N=8,400) across 12 health plans. OOP cost was the #1 cited barrier, followed by prior auth complexity (23%) and provider awareness (15%).",
                            implication: "Copay assistance programs, value-based contracts, and tiered benefit designs can address affordability — plans offering $50/month copay caps see 3.2x higher initiation rates",
                            sourceTier: "PRIMARY",
                            confidence: "HIGH",
                            evidenceType: "direct",
                            source: "Patient Access Foundation GLP-1 barriers survey 2025",
                            tags: ["cost-barrier", "OOP", "affordability"],
                        },
                    ],
                    gaps: ["LGBTQ+ population-specific GLP-1 outcome data is absent", "Limited data on cultural factors affecting GLP-1 adherence in Hispanic/Latino populations"],
                    signals: ["Three major plans launching GLP-1 equity pilot programs in Q2 2026", "CMS health equity initiative includes obesity treatment access metrics"],
                    minorityViews: ["Some argue that parity mandates without addressing underlying social determinants will not meaningfully reduce GLP-1 access disparities"],
                    toolsUsed: ["web_search", "census_data"],
                    tokensUsed: 3600,
                },
            ],
            blueprint: {
                query: "GLP-1 Impact on Payer Economics 2026: Budget Impact, Market Dynamics, and Strategic Positioning",
                tier: "EXTENDED",
                dimensions: [
                    { name: "Clinical", description: "Clinical efficacy, safety, and real-world outcomes", justification: "Foundation for all economic and strategic analysis", dataSources: ["PubMed", "ClinicalTrials.gov", "FDA labels", "IQVIA RWE"], lens: "Evidence-based", signalMatch: "High" },
                    { name: "Economic", description: "Budget impact modeling, cost-effectiveness, and ROI analysis", justification: "Core payer decision-making framework", dataSources: ["Claims data", "Actuarial models", "CBO scores"], lens: "Financial", signalMatch: "High" },
                    { name: "Market", description: "Competitive dynamics, adoption curves, and commercial strategy", justification: "Strategic positioning and competitive intelligence", dataSources: ["Formulary tracking", "Employer surveys", "PBM data"], lens: "Strategic", signalMatch: "Medium" },
                    { name: "Regulatory", description: "Federal and state regulatory landscape, legislative trends", justification: "Policy environment shapes coverage decisions", dataSources: ["Federal Register", "State legislatures", "CMS guidance"], lens: "Compliance", signalMatch: "High" },
                    { name: "Access", description: "Health equity, disparities, and patient access barriers", justification: "Responsible coverage design requires equity lens", dataSources: ["Claims disparities data", "Patient surveys", "Census"], lens: "Equity", signalMatch: "Medium" },
                ],
                agents: [
                    { name: "Clinical Analyst", archetype: "Analyst", dimension: "Clinical", mandate: "Analyze clinical trial evidence and real-world outcomes for GLP-1 therapies", tools: ["web_search", "pubmed_search"], lens: "Outcomes", bias: "Evidence-focused" },
                    { name: "Economic Modeler", archetype: "Analyst", dimension: "Economic", mandate: "Model budget impact, cost-effectiveness, and ROI scenarios for payer decision-making", tools: ["web_search", "calculation"], lens: "Financial", bias: "Conservative estimates" },
                    { name: "Market Strategist", archetype: "Strategist", dimension: "Market", mandate: "Assess competitive dynamics, adoption curves, and strategic positioning opportunities", tools: ["web_search"], lens: "Growth", bias: "Opportunity-seeking" },
                    { name: "Regulatory Navigator", archetype: "Analyst", dimension: "Regulatory", mandate: "Track federal and state regulatory developments affecting GLP-1 coverage", tools: ["web_search", "gov_database"], lens: "Compliance", bias: "Risk-aware" },
                    { name: "Access & Equity Analyst", archetype: "Analyst", dimension: "Access", mandate: "Evaluate health equity implications and patient access barriers", tools: ["web_search", "census_data"], lens: "Equity", bias: "Patient-centered" },
                ],
                interconnections: [
                    { dimensionA: "Clinical", dimensionB: "Economic", coupling: 5, mechanism: "Clinical outcomes data directly feeds cost-offset models and budget impact projections" },
                    { dimensionA: "Economic", dimensionB: "Market", coupling: 4, mechanism: "Budget impact analysis drives formulary decisions which shape market adoption curves" },
                    { dimensionA: "Market", dimensionB: "Regulatory", coupling: 4, mechanism: "Market demand pressure drives state parity legislation and CMS coverage decisions" },
                    { dimensionA: "Regulatory", dimensionB: "Access", coupling: 3, mechanism: "Coverage mandates directly impact patient access and equity outcomes" },
                    { dimensionA: "Clinical", dimensionB: "Access", coupling: 3, mechanism: "Real-world evidence on disparities informs clinical pathway design for equitable outcomes" },
                ],
                complexityScore: { breadth: 5, depth: 4, interconnection: 4, total: 13, urgency: 1.2, adjusted: 15.6, reasoning: "High complexity: 5 dimensions with strong interconnections, time-sensitive regulatory developments, and significant budget implications" },
                estimatedTime: "8 minutes",
                ethicalConcerns: ["Health equity implications of coverage decisions", "Potential for coverage policies to exacerbate existing racial/socioeconomic health disparities"],
            },
            emitEvent: (e) => console.log("Event:", e.type),
        });

        console.log("\n=== GENERATION COMPLETE ===");
        console.log("Title:", result.title);
        console.log("Slide Count:", result.slideCount);
        console.log("HTML Size:", result.html.length, "bytes");

        // Write to a test file
        const fs = require("fs");
        const outputPath = "./public/decks/test-rich-components.html";
        fs.writeFileSync(outputPath, result.html);
        console.log("Saved to", outputPath);

        // Component audit
        const components = [
            "bar-chart", "donut-chart", "sparkline", "line-chart",
            "stat-number", "data-target", "stat-block",
            "threat-meter", "state-grid",
            "emergence-card", "emergence",
            "finding-card", "stat-card", "stat-grid",
            "policy-box", "validation-box", "quote-block",
            "timeline-bar", "tl-segment", "timeline",
            "compact-table", "prov-table",
            "source-list", "source-item",
            "confidence-badge", "tag-red", "tag-blue", "tag-green",
            "dagger", "anim", "anim-scale", "anim-blur",
            "grid-2", "grid-3", "grid-4",
        ];
        console.log("\n=== COMPONENT AUDIT ===");
        for (const c of components) {
            const count = (result.html.match(new RegExp(c, "g")) || []).length;
            if (count > 0) console.log(`  ${c}: ${count}`);
        }
    } catch (error) {
        console.error("Error generating presentation:", error);
    }
}

run();
