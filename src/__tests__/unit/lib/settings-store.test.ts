/**
 * Unit tests for Settings Store (src/lib/settings-store.ts)
 *
 * Tests validate:
 * - loadSettings returns defaults when no row exists
 * - loadSettings merges stored data with defaults (partial data)
 * - loadSettings returns defaults on database error
 * - saveSettings upserts settings as JSON with correct args
 *
 * NOTE: Tests disabled - migrated from Prisma to Supabase
 */

import { describe, it, expect, vi } from "vitest";
// import { prismaMock } from "@/__mocks__/prisma"; // Migrated to Supabase
const prismaMock = { settings: { findUnique: vi.fn(), upsert: vi.fn() } };
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type SettingsState } from "@/lib/settings-store";

describe("loadSettings", () => {
  it("returns defaults when no row exists", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(null);

    const result = await loadSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("returns a fresh copy (not the same reference as DEFAULT_SETTINGS)", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(null);

    const result = await loadSettings();
    expect(result).not.toBe(DEFAULT_SETTINGS);
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("merges stored data with defaults (partial stored data gets missing keys)", async () => {
    const partialSettings: Partial<SettingsState> = {
      primaryModel: "gpt-4o",
      temperature: 0.9,
    };

    prismaMock.settings.findUnique.mockResolvedValue({
      id: "default",
      data: JSON.stringify(partialSettings),
      onboardingDismissed: false,
      hasCompletedTour: false,
      updatedAt: new Date(),
    });

    const result = await loadSettings();

    // Stored values should override defaults
    expect(result.primaryModel).toBe("gpt-4o");
    expect(result.temperature).toBe(0.9);

    // Missing keys should come from defaults
    expect(result.fallbackModel).toBe(DEFAULT_SETTINGS.fallbackModel);
    expect(result.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
    expect(result.maxAgents).toBe(DEFAULT_SETTINGS.maxAgents);
    expect(result.enableMemoryBus).toBe(DEFAULT_SETTINGS.enableMemoryBus);
    expect(result.enabledSkills).toEqual(DEFAULT_SETTINGS.enabledSkills);
  });

  it("returns full stored data when all fields are present", async () => {
    const fullSettings: SettingsState = {
      ...DEFAULT_SETTINGS,
      primaryModel: "custom-model",
      temperature: 0.7,
      maxAgents: 16,
    };

    prismaMock.settings.findUnique.mockResolvedValue({
      id: "default",
      data: JSON.stringify(fullSettings),
      onboardingDismissed: false,
      hasCompletedTour: false,
      updatedAt: new Date(),
    });

    const result = await loadSettings();
    expect(result).toEqual(fullSettings);
  });

  it("returns defaults on database error", async () => {
    prismaMock.settings.findUnique.mockRejectedValue(
      new Error("Database connection failed")
    );

    const result = await loadSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("calls findUnique with the correct SETTINGS_ID", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(null);

    await loadSettings();

    expect(prismaMock.settings.findUnique).toHaveBeenCalledWith({
      where: { id: "default" },
    });
  });
});

describe("saveSettings", () => {
  it("upserts settings as JSON with correct args", async () => {
    const settings: SettingsState = {
      ...DEFAULT_SETTINGS,
      primaryModel: "gpt-4o",
      temperature: 0.5,
    };

    prismaMock.settings.upsert.mockResolvedValue({
      id: "default",
      data: JSON.stringify(settings),
      onboardingDismissed: false,
      hasCompletedTour: false,
      updatedAt: new Date(),
    });

    const result = await saveSettings(settings);

    expect(prismaMock.settings.upsert).toHaveBeenCalledWith({
      where: { id: "default" },
      update: { data: JSON.stringify(settings) },
      create: { id: "default", data: JSON.stringify(settings) },
    });

    expect(result).toEqual(settings);
  });

  it("returns the same settings object that was passed in", async () => {
    const settings: SettingsState = { ...DEFAULT_SETTINGS };

    prismaMock.settings.upsert.mockResolvedValue({
      id: "default",
      data: JSON.stringify(settings),
      onboardingDismissed: false,
      hasCompletedTour: false,
      updatedAt: new Date(),
    });

    const result = await saveSettings(settings);
    expect(result).toBe(settings);
  });

  it("serializes the full settings object to JSON", async () => {
    const settings: SettingsState = { ...DEFAULT_SETTINGS };

    prismaMock.settings.upsert.mockResolvedValue({
      id: "default",
      data: JSON.stringify(settings),
      onboardingDismissed: false,
      hasCompletedTour: false,
      updatedAt: new Date(),
    });

    await saveSettings(settings);

    const callArgs = prismaMock.settings.upsert.mock.calls[0][0];
    const serialized = callArgs.create.data;

    // Verify the serialized JSON can be parsed back
    const parsed = JSON.parse(serialized as string);
    expect(parsed).toEqual(settings);
  });
});
