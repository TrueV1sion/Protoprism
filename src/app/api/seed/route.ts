import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/seed — Seed the database with demo runs
// This is a development-only endpoint
export async function POST() {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Not available in production" }, { status: 403 });
    }

    // Check if already seeded
    const existing = await db.run.count();
    if (existing > 0) {
        return NextResponse.json({ message: `Database already has ${existing} runs. Skipping seed.` });
    }

    const queries = [
        {
            query: "Analyze the strategic impact of GLP-1 weight loss medications on Medicare Advantage payer margins, quality ratings, and competitive positioning for 2027",
            tier: "STANDARD",
            complexity: 13,
            agents: [
                { name: "Clinical Researcher", archetype: "RESEARCHER-DATA", dimension: "Clinical Landscape", color: "#59DDFD" },
                { name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", dimension: "Financial Impact", color: "#00E49F" },
                { name: "Regulatory Specialist", archetype: "REGULATORY-RADAR", dimension: "Regulatory Environment", color: "#4E84C4" },
                { name: "Quality Analytics Lead", archetype: "ANALYST-QUALITY", dimension: "Quality & Star Ratings", color: "#F59E0B" },
                { name: "Competitive Intelligence", archetype: "ANALYST-STRATEGIC", dimension: "Competitive Dynamics", color: "#EC4899" },
            ],
        },
        {
            query: "Evaluate Inovalon exit strategy options including IPO, strategic acquisition, and secondary PE sale with 3-year horizon",
            tier: "EXTENDED",
            complexity: 14,
            agents: [
                { name: "M&A Specialist", archetype: "RESEARCHER-DOMAIN", dimension: "M&A Pipeline", color: "#6C6CFF" },
                { name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", dimension: "Financial Modeling", color: "#00E49F" },
                { name: "Strategic Advisor", archetype: "ANALYST-STRATEGIC", dimension: "Strategic Options", color: "#59DDFD" },
                { name: "Regulatory Radar", archetype: "REGULATORY-RADAR", dimension: "Regulatory", color: "#4E84C4" },
                { name: "Competitive Scanner", archetype: "ANALYST-STRATEGIC", dimension: "Competitive Landscape", color: "#EC4899" },
                { name: "Technology Assessor", archetype: "ANALYST-TECHNICAL", dimension: "Technology", color: "#F59E0B" },
            ],
        },
        {
            query: "Assess 2027 CMS Star Ratings cut-point shifts and projected impact on Medicare Advantage plan quality bonuses",
            tier: "STANDARD",
            complexity: 11,
            agents: [
                { name: "Quality Lead", archetype: "ANALYST-QUALITY", dimension: "Quality Metrics", color: "#F5E6BB" },
                { name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", dimension: "Financial Impact", color: "#00E49F" },
                { name: "Competitive Scanner", archetype: "ANALYST-STRATEGIC", dimension: "Competitive Position", color: "#EC4899" },
                { name: "Regulatory Radar", archetype: "REGULATORY-RADAR", dimension: "Policy Environment", color: "#4E84C4" },
            ],
        },
    ];

    const results = [];

    for (const q of queries) {
        const run = await db.run.create({
            query: q.query,
            status: "DELIVER",
        });

        await db.run.update(run.id, {
            tier: q.tier,
            complexityScore: q.complexity,
            breadth: 4,
            depth: 4,
            interconnection: q.complexity - 8,
            estimatedTime: "3-5 minutes",
            completedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        });

        await db.dimension.createMany(
            q.agents.map((a) => ({
                name: a.dimension,
                description: `Analysis of ${a.dimension.toLowerCase()} aspects`,
                runId: run.id,
            }))
        );

        await db.agent.createMany(
            q.agents.map((a) => ({
                name: a.name,
                archetype: a.archetype,
                mandate: `Analyze ${a.dimension.toLowerCase()} implications`,
                tools: JSON.stringify(["Web Search", "CMS Data", "SEC EDGAR"]),
                dimension: a.dimension,
                color: a.color,
                status: "complete",
                progress: 100,
                runId: run.id,
            }))
        );

        // Fetch agents to get their generated IDs
        const agents = await db.agent.findMany({ runId: run.id });

        // Add findings for each agent
        for (const agent of agents) {
            await db.finding.create({
                statement: `Key finding from ${agent.name} regarding ${agent.dimension}`,
                evidence: "Analysis from multiple primary sources",
                confidence: Math.random() > 0.4 ? "HIGH" : "MEDIUM",
                evidenceType: Math.random() > 0.5 ? "direct" : "modeled",
                source: "Primary data sources",
                implication: `Strategic implication for ${agent.dimension?.toLowerCase()} positioning`,
                action: "keep",
                tags: JSON.stringify([]),
                agentId: agent.id,
                runId: run.id,
            });
        }

        // Add synthesis layers
        const layers = ["foundation", "convergence", "tension", "emergence", "gap"];
        await db.synthesis.createMany(
            layers.map((layer, i) => ({
                layerName: layer,
                description: `${layer.charAt(0).toUpperCase() + layer.slice(1)} layer analysis`,
                insights: JSON.stringify([`Multi-agent ${layer} insight for this analysis`]),
                sortOrder: i,
                runId: run.id,
            }))
        );

        // Add presentation
        await db.presentation.create({
            title: q.query.slice(0, 60) + "...",
            subtitle: q.query,
            htmlPath: "prism-glp1-strategic-opportunity.html",
            slideCount: 15,
            runId: run.id,
        });

        results.push({ id: run.id, query: q.query.slice(0, 60) });
    }

    return NextResponse.json({ message: "Seeded 3 runs", runs: results });
}
