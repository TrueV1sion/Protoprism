/**
 * Settings Store — Persistent platform configuration via Supabase.
 *
 * SERVER-ONLY module. Uses a singleton Settings row (id="default")
 * to store a JSON blob of SettingsState.
 *
 * For types/defaults that are safe to import from client components,
 * use settings-types.ts instead.
 */

import { db } from "./db";
import { DEFAULT_SETTINGS, type SettingsState } from "./settings-types";

// Re-export for convenience in server code
export { DEFAULT_SETTINGS, type SettingsState } from "./settings-types";

const SETTINGS_ID = "default";

/**
 * Load current settings from the database.
 * Returns DEFAULT_SETTINGS if no settings row exists yet.
 */
export async function loadSettings(): Promise<SettingsState> {
    try {
        const row = await db.settings.findUnique(SETTINGS_ID);

        if (!row) return { ...DEFAULT_SETTINGS };

        const parsed = JSON.parse(row.data) as Partial<SettingsState>;
        // Merge with defaults so new keys always have values
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * Save settings to the database.
 * Uses upsert so the first save creates the row.
 */
export async function saveSettings(settings: SettingsState): Promise<SettingsState> {
    const data = JSON.stringify(settings);

    await db.settings.upsert(SETTINGS_ID, { data });

    return settings;
}
