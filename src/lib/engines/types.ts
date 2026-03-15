import { z } from "zod/v4";

export const EngineStatusSchema = z.enum(["active", "coming-soon", "hidden"]);
export type EngineStatus = z.infer<typeof EngineStatusSchema>;

export const EngineManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string(),
  icon: z.string(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColorName: z.string(),
  status: EngineStatusSchema,
  order: z.number().int().min(0),
  route: z.string(),
  isDefault: z.boolean(),
});

export type EngineManifest = z.infer<typeof EngineManifestSchema>;

export type EngineId =
  | "command-center"
  | "ma"
  | "sales"
  | "regulatory"
  | "product"
  | "finance";
