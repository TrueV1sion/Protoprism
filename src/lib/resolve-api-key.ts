import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

const ENV_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  ncbi: "NCBI_API_KEY",
};

export async function resolveApiKey(
  provider: string
): Promise<string | null> {
  const envVar = ENV_MAP[provider];
  if (envVar) {
    const envValue = process.env[envVar];
    if (envValue) return envValue;
  }

  try {
    const keys = await db.apiKey.findMany();
    const record = keys.find((k) => k.provider === provider);
    if (record) return decrypt(record.encryptedKey);
  } catch {
    // DB may not be available
  }

  return null;
}
