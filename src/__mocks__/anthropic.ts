import { vi } from "vitest";

export interface MockMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  model: string;
  stop_reason: "end_turn" | "tool_use";
  usage: { input_tokens: number; output_tokens: number };
}

export function createMockMessageResponse(
  content: MockMessageResponse["content"],
  overrides?: Partial<MockMessageResponse>,
): MockMessageResponse {
  return {
    id: "msg_test_001",
    type: "message",
    role: "assistant",
    content,
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 200 },
    ...overrides,
  };
}

export const mockAnthropicCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockAnthropicCreate };
  },
}));

export function resetAnthropicMock() {
  mockAnthropicCreate.mockReset();
}
