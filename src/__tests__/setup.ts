import { beforeEach, afterEach, vi } from "vitest";
import { resetPrismaMock } from "@/__mocks__/prisma";
import { resetAnthropicMock } from "@/__mocks__/anthropic";
import { resetMCPMock } from "@/__mocks__/mcp";

beforeEach(() => {
  resetPrismaMock();
  resetAnthropicMock();
  resetMCPMock();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
