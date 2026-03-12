import { supabase } from "./supabase";
import { randomUUID } from "crypto";

function cuid(): string {
  return randomUUID();
}

// ─── Snake/Camel mapping ────────────────────────────────────

const SNAKE_MAP: Record<string, string> = {
  runId: "run_id",
  agentId: "agent_id",
  autonomyMode: "autonomy_mode",
  complexityScore: "complexity_score",
  estimatedTime: "estimated_time",
  createdAt: "created_at",
  updatedAt: "updated_at",
  completedAt: "completed_at",
  evidenceType: "evidence_type",
  sourceTier: "source_tier",
  layerName: "layer_name",
  sortOrder: "sort_order",
  htmlPath: "html_path",
  slideCount: "slide_count",
  onboardingDismissed: "onboarding_dismissed",
  hasCompletedTour: "has_completed_tour",
  encryptedKey: "encrypted_key",
  entryCount: "entry_count",
  signalCount: "signal_count",
  conflictCount: "conflict_count",
  openConflictCount: "open_conflict_count",
  findingCount: "finding_count",
  emergenceCount: "emergence_count",
  tensionCount: "tension_count",
  gapCount: "gap_count",
  qualityGrade: "quality_grade",
  overallScore: "overall_score",
};

const CAMEL_MAP: Record<string, string> = {};
for (const [camel, snake] of Object.entries(SNAKE_MAP)) {
  CAMEL_MAP[snake] = camel;
}

function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[SNAKE_MAP[key] ?? key] = value;
  }
  return result;
}

function toCamel<T = Record<string, unknown>>(obj: Record<string, unknown>): T {
  if (!obj) return obj as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = CAMEL_MAP[key] ?? key;
    if (Array.isArray(value)) {
      result[camelKey] = value.map((item) =>
        typeof item === "object" && item !== null
          ? toCamel(item as Record<string, unknown>)
          : item,
      );
    } else if (typeof value === "object" && value !== null && !(value instanceof Date)) {
      result[camelKey] = toCamel(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }
  return result as T;
}

function toCamelArray<T = Record<string, unknown>>(arr: Record<string, unknown>[]): T[] {
  return arr.map((row) => toCamel<T>(row));
}

// ─── DB Types (matching existing Prisma model shapes) ───────

export interface DbRun {
  id: string;
  query: string;
  status: string;
  tier: string;
  autonomyMode: string;
  complexityScore: number;
  breadth: number;
  depth: number;
  interconnection: number;
  estimatedTime: string | null;
  manifest: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  agents?: DbAgent[];
  dimensions?: DbDimension[];
  findings?: DbFinding[];
  synthesis?: DbSynthesis[];
  presentation?: DbPresentation | null;
  _count?: { findings: number; synthesis: number };
}

export interface DbDimension {
  id: string;
  name: string;
  description: string;
  runId: string;
}

export interface DbAgent {
  id: string;
  name: string;
  archetype: string;
  mandate: string;
  tools: string;
  dimension: string;
  color: string;
  status: string;
  progress: number;
  runId: string;
  findings?: DbFinding[];
}

export interface DbFinding {
  id: string;
  statement: string;
  evidence: string;
  confidence: string;
  evidenceType: string;
  source: string;
  sourceTier: string;
  implication: string;
  action: string;
  tags: string;
  agentId: string;
  runId: string;
}

export interface DbSynthesis {
  id: string;
  layerName: string;
  description: string;
  insights: string;
  sortOrder: number;
  runId: string;
}

export interface DbPresentation {
  id: string;
  title: string;
  subtitle: string;
  htmlPath: string;
  slideCount: number;
  createdAt: string;
  runId: string;
}

export interface DbSettings {
  id: string;
  data: string;
  onboardingDismissed: boolean;
  hasCompletedTour: boolean;
  updatedAt: string;
}

export interface DbApiKey {
  id: string;
  provider: string;
  encryptedKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbMemoryBusSnapshot {
  id: string;
  phase: string;
  snapshot: string;
  entryCount: number;
  signalCount: number;
  conflictCount: number;
  openConflictCount: number;
  createdAt: string;
  runId: string;
}

export interface DbIrGraph {
  id: string;
  tier: string;
  graph: string;
  findingCount: number;
  emergenceCount: number;
  tensionCount: number;
  gapCount: number;
  qualityGrade: string | null;
  overallScore: number | null;
  createdAt: string;
  updatedAt: string;
  runId: string;
}

// ─── Database access object ─────────────────────────────────

export const db = {
  // ── Runs ────────────────────────────────────────────────
  run: {
    async create(data: { id?: string; query: string; status?: string }) {
      const id = data.id ?? cuid();
      const { data: row, error } = await supabase
        .from("runs")
        .insert({ id, query: data.query, status: data.status ?? "INITIALIZE" })
        .select()
        .single();
      if (error) throw new Error(`db.run.create: ${error.message}`);
      return toCamel<DbRun>(row);
    },

    async findUnique(id: string) {
      const { data: row, error } = await supabase
        .from("runs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`db.run.findUnique: ${error.message}`);
      return row ? toCamel<DbRun>(row) : null;
    },

    async findUniqueWithRelations(id: string) {
      const { data: row, error } = await supabase
        .from("runs")
        .select("*, dimensions(*), agents(*, findings(*)), synthesis(*), presentations(*)")
        .eq("id", id)
        .maybeSingle() as { data: Record<string, unknown> | null; error: { message: string } | null };
      if (error) throw new Error(`db.run.findUniqueWithRelations: ${error.message}`);
      if (!row) return null;
      const camel = toCamel<DbRun>(row);
      const raw = row as Record<string, unknown>;
      camel.presentation = Array.isArray(raw.presentations) && (raw.presentations as unknown[]).length > 0
        ? toCamel<DbPresentation>((raw.presentations as Record<string, unknown>[])[0])
        : null;
      if (camel.synthesis) {
        (camel.synthesis as DbSynthesis[]).sort((a, b) => a.sortOrder - b.sortOrder);
      }
      return camel;
    },

    async findMany(opts?: {
      where?: Record<string, string>;
      orderBy?: string;
      orderDir?: "asc" | "desc";
      limit?: number;
      offset?: number;
      includeRelations?: boolean;
    }) {
      const selectStr = opts?.includeRelations
        ? "*, dimensions(id, name), agents(id, name, archetype, status, color), presentations(id, title, html_path, slide_count)"
        : "*";
      let query = supabase.from("runs").select(selectStr, { count: "exact" });

      if (opts?.where) {
        for (const [key, value] of Object.entries(opts.where)) {
          query = query.eq(SNAKE_MAP[key] ?? key, value);
        }
      }
      query = query.order(opts?.orderBy ?? "created_at", { ascending: (opts?.orderDir ?? "desc") === "asc" });
      if (opts?.limit) query = query.limit(opts.limit);
      if (opts?.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);

      const { data: rows, error, count } = await query as { data: Record<string, unknown>[] | null; error: { message: string } | null; count: number | null };
      if (error) throw new Error(`db.run.findMany: ${error.message}`);
      return { runs: toCamelArray<DbRun>(rows ?? []), total: count ?? 0 };
    },

    async update(id: string, data: Record<string, unknown>) {
      const snakeData = toSnake(data);
      const { data: row, error } = await supabase
        .from("runs")
        .update(snakeData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`db.run.update: ${error.message}`);
      return toCamel<DbRun>(row);
    },

    async upsert(id: string, data: Record<string, unknown>) {
      const snakeData = toSnake({ id, ...data });
      const { data: row, error } = await supabase
        .from("runs")
        .upsert(snakeData)
        .select()
        .single();
      if (error) throw new Error(`db.run.upsert: ${error.message}`);
      return toCamel<DbRun>(row);
    },

    async count() {
      const { count, error } = await supabase
        .from("runs")
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(`db.run.count: ${error.message}`);
      return count ?? 0;
    },
  },

  // ── Dimensions ──────────────────────────────────────────
  dimension: {
    async createMany(rows: Array<{ name: string; description: string; runId: string }>) {
      const snakeRows = rows.map((r) => ({
        id: cuid(),
        name: r.name,
        description: r.description,
        run_id: r.runId,
      }));
      const { error } = await supabase.from("dimensions").insert(snakeRows);
      if (error) throw new Error(`db.dimension.createMany: ${error.message}`);
    },
  },

  // ── Agents ──────────────────────────────────────────────
  agent: {
    async createMany(
      rows: Array<{
        name: string;
        archetype: string;
        mandate: string;
        tools: string;
        dimension: string;
        runId: string;
        color?: string;
        status?: string;
        progress?: number;
      }>,
    ) {
      const snakeRows = rows.map((r) => ({
        id: cuid(),
        name: r.name,
        archetype: r.archetype,
        mandate: r.mandate,
        tools: r.tools,
        dimension: r.dimension,
        run_id: r.runId,
        color: r.color ?? "#59DDFD",
        status: r.status ?? "idle",
        progress: r.progress ?? 0,
      }));
      const { error } = await supabase.from("agents").insert(snakeRows);
      if (error) throw new Error(`db.agent.createMany: ${error.message}`);
    },

    async findMany(opts: { runId: string; select?: string }) {
      const selectStr = opts.select ?? "*";
      const { data: rows, error } = await supabase
        .from("agents")
        .select(selectStr)
        .eq("run_id", opts.runId) as { data: Record<string, unknown>[] | null; error: { message: string } | null };
      if (error) throw new Error(`db.agent.findMany: ${error.message}`);
      return toCamelArray<DbAgent>(rows ?? []);
    },

    async findManyWithFindings(runId: string) {
      const { data: rows, error } = await supabase
        .from("agents")
        .select("*, findings(*)")
        .eq("run_id", runId) as { data: Record<string, unknown>[] | null; error: { message: string } | null };
      if (error) throw new Error(`db.agent.findManyWithFindings: ${error.message}`);
      return toCamelArray<DbAgent>(rows ?? []);
    },

    async updateMany(runId: string, data: Record<string, unknown>) {
      const snakeData = toSnake(data);
      const { error } = await supabase
        .from("agents")
        .update(snakeData)
        .eq("run_id", runId);
      if (error) throw new Error(`db.agent.updateMany: ${error.message}`);
    },

    async updateByName(runId: string, name: string, data: Record<string, unknown>) {
      const snakeData = toSnake(data);
      const { error } = await supabase
        .from("agents")
        .update(snakeData)
        .eq("run_id", runId)
        .eq("name", name);
      if (error) throw new Error(`db.agent.updateByName: ${error.message}`);
    },
  },

  // ── Findings ────────────────────────────────────────────
  finding: {
    async create(data: {
      statement: string;
      evidence: string;
      confidence: string;
      evidenceType: string;
      source: string;
      sourceTier?: string;
      implication: string;
      action?: string;
      tags: string;
      agentId: string;
      runId: string;
    }) {
      const { error } = await supabase.from("findings").insert({
        id: cuid(),
        statement: data.statement,
        evidence: data.evidence,
        confidence: data.confidence,
        evidence_type: data.evidenceType,
        source: data.source,
        source_tier: data.sourceTier ?? "SECONDARY",
        implication: data.implication,
        action: data.action ?? "keep",
        tags: data.tags,
        agent_id: data.agentId,
        run_id: data.runId,
      });
      if (error) throw new Error(`db.finding.create: ${error.message}`);
    },

    async createMany(
      rows: Array<{
        statement: string;
        evidence: string;
        confidence: string;
        evidenceType: string;
        source: string;
        sourceTier?: string;
        implication: string;
        action?: string;
        tags: string;
        agentId: string;
        runId: string;
      }>,
    ) {
      if (rows.length === 0) return;
      const snakeRows = rows.map((r) => ({
        id: cuid(),
        statement: r.statement,
        evidence: r.evidence,
        confidence: r.confidence,
        evidence_type: r.evidenceType,
        source: r.source,
        source_tier: r.sourceTier ?? "SECONDARY",
        implication: r.implication,
        action: r.action ?? "keep",
        tags: r.tags,
        agent_id: r.agentId,
        run_id: r.runId,
      }));
      const { error } = await supabase.from("findings").insert(snakeRows);
      if (error) throw new Error(`db.finding.createMany: ${error.message}`);
    },
  },

  // ── Synthesis ───────────────────────────────────────────
  synthesis: {
    async create(data: {
      layerName: string;
      description: string;
      insights: string;
      sortOrder: number;
      runId: string;
    }) {
      const { error } = await supabase.from("synthesis").insert({
        id: cuid(),
        layer_name: data.layerName,
        description: data.description,
        insights: data.insights,
        sort_order: data.sortOrder,
        run_id: data.runId,
      });
      if (error) throw new Error(`db.synthesis.create: ${error.message}`);
    },

    async createMany(
      rows: Array<{
        layerName: string;
        description: string;
        insights: string;
        sortOrder: number;
        runId: string;
      }>,
    ) {
      if (rows.length === 0) return;
      const snakeRows = rows.map((r) => ({
        id: cuid(),
        layer_name: r.layerName,
        description: r.description,
        insights: r.insights,
        sort_order: r.sortOrder,
        run_id: r.runId,
      }));
      const { error } = await supabase.from("synthesis").insert(snakeRows);
      if (error) throw new Error(`db.synthesis.createMany: ${error.message}`);
    },
  },

  // ── Presentations ───────────────────────────────────────
  presentation: {
    async create(data: {
      title: string;
      subtitle: string;
      htmlPath: string;
      slideCount: number;
      runId: string;
    }) {
      const { data: row, error } = await supabase
        .from("presentations")
        .insert({
          id: cuid(),
          title: data.title,
          subtitle: data.subtitle,
          html_path: data.htmlPath,
          slide_count: data.slideCount,
          run_id: data.runId,
        })
        .select()
        .single();
      if (error) throw new Error(`db.presentation.create: ${error.message}`);
      return toCamel<DbPresentation>(row);
    },

    async findByRunId(runId: string) {
      const { data: row, error } = await supabase
        .from("presentations")
        .select("*")
        .eq("run_id", runId)
        .maybeSingle();
      if (error) throw new Error(`db.presentation.findByRunId: ${error.message}`);
      return row ? toCamel<DbPresentation>(row) : null;
    },

    async update(id: string, data: Record<string, unknown>) {
      const snakeData = toSnake(data);
      const { error } = await supabase
        .from("presentations")
        .update(snakeData)
        .eq("id", id);
      if (error) throw new Error(`db.presentation.update: ${error.message}`);
    },

    async upsertByRunId(
      runId: string,
      data: { title: string; subtitle: string; htmlPath: string; slideCount: number },
    ) {
      const existing = await db.presentation.findByRunId(runId);
      if (existing) {
        await db.presentation.update(existing.id, data);
        return { ...existing, ...data };
      }
      return db.presentation.create({ ...data, runId });
    },
  },

  // ── MemoryBusSnapshots ──────────────────────────────────
  memoryBusSnapshot: {
    async create(data: Omit<DbMemoryBusSnapshot, "id" | "createdAt">) {
      const { data: row, error } = await supabase
        .from("memory_bus_snapshots")
        .insert({
          id: cuid(),
          ...toSnake(data as unknown as Record<string, unknown>),
        })
        .select()
        .single();
      if (error) throw new Error(`db.memoryBusSnapshot.create: ${error.message}`);
      return toCamel<DbMemoryBusSnapshot>(row);
    },

    async findByRunId(runId: string) {
      const { data: rows, error } = await supabase
        .from("memory_bus_snapshots")
        .select("*")
        .eq("run_id", runId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`db.memoryBusSnapshot.findByRunId: ${error.message}`);
      return toCamelArray<DbMemoryBusSnapshot>(rows ?? []);
    },

    async findLatest(runId: string) {
      const { data: row, error } = await supabase
        .from("memory_bus_snapshots")
        .select("*")
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`db.memoryBusSnapshot.findLatest: ${error.message}`);
      return row ? toCamel<DbMemoryBusSnapshot>(row) : null;
    },
  },

  // ── IR Graphs ───────────────────────────────────────────
  irGraph: {
    async upsert(data: {
      runId: string;
      tier: string;
      graph: string;
      findingCount: number;
      emergenceCount: number;
      tensionCount: number;
      gapCount: number;
      qualityGrade?: string;
      overallScore?: number;
    }) {
      const snakeData = toSnake(data as unknown as Record<string, unknown>);
      const { data: row, error } = await supabase
        .from("ir_graphs")
        .upsert(
          { id: cuid(), ...snakeData },
          { onConflict: "run_id" },
        )
        .select()
        .single();
      if (error) throw new Error(`db.irGraph.upsert: ${error.message}`);
      return toCamel<DbIrGraph>(row);
    },

    async findByRunId(runId: string) {
      const { data: row, error } = await supabase
        .from("ir_graphs")
        .select("*")
        .eq("run_id", runId)
        .maybeSingle();
      if (error) throw new Error(`db.irGraph.findByRunId: ${error.message}`);
      return row ? toCamel<DbIrGraph>(row) : null;
    },

    async findLatest(limit: number = 10) {
      const { data: rows, error } = await supabase
        .from("ir_graphs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`db.irGraph.findLatest: ${error.message}`);
      return toCamelArray<DbIrGraph>(rows ?? []);
    },

    async findByTier(tier: string) {
      const { data: rows, error } = await supabase
        .from("ir_graphs")
        .select("*")
        .eq("tier", tier)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`db.irGraph.findByTier: ${error.message}`);
      return toCamelArray<DbIrGraph>(rows ?? []);
    },
  },

  // ── Settings ────────────────────────────────────────────
  settings: {
    async findUnique(id: string = "default") {
      const { data: row, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`db.settings.findUnique: ${error.message}`);
      return row ? toCamel<DbSettings>(row) : null;
    },

    async upsert(id: string, data: Record<string, unknown>) {
      const snakeData = toSnake({ id, ...data });
      const { data: row, error } = await supabase
        .from("settings")
        .upsert(snakeData)
        .select()
        .single();
      if (error) throw new Error(`db.settings.upsert: ${error.message}`);
      return toCamel<DbSettings>(row);
    },
  },

  // ── API Keys ────────────────────────────────────────────
  apiKey: {
    async findMany() {
      const { data: rows, error } = await supabase
        .from("api_keys")
        .select("*");
      if (error) throw new Error(`db.apiKey.findMany: ${error.message}`);
      return toCamelArray<DbApiKey>(rows ?? []);
    },

    async upsert(provider: string, encryptedKey: string) {
      const { data: row, error } = await supabase
        .from("api_keys")
        .upsert(
          { provider, encrypted_key: encryptedKey },
          { onConflict: "provider" },
        )
        .select()
        .single();
      if (error) throw new Error(`db.apiKey.upsert: ${error.message}`);
      return toCamel<DbApiKey>(row);
    },
  },
};
