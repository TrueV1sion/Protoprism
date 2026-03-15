export interface CapturedToolCall {
  runId: string;
  agentId: string;
  mcpServer: string;
  toolName: string;
  toolParams: unknown;
  rawResponse: string;
  responseBytes: number;
  latencyMs: number;
  capturedAt: Date;
}

type CaptureCallback = (call: CapturedToolCall) => void;
type ToolExecutor = (params: unknown) => Promise<string>;

export function createToolCallCapture(
  runId: string,
  agentId: string,
  onCapture: CaptureCallback,
) {
  return {
    wrap(mcpServer: string, toolName: string, execute: ToolExecutor): ToolExecutor {
      return async (params: unknown): Promise<string> => {
        const start = Date.now();
        let rawResponse: string;
        let threw = false;

        try {
          rawResponse = await execute(params);
        } catch (err) {
          rawResponse = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
          threw = true;
          // Fire-and-forget capture even on error
          const captured: CapturedToolCall = {
            runId,
            agentId,
            mcpServer,
            toolName,
            toolParams: params,
            rawResponse,
            responseBytes: Buffer.byteLength(rawResponse, "utf-8"),
            latencyMs: Date.now() - start,
            capturedAt: new Date(),
          };
          // Async — do not await
          Promise.resolve().then(() => onCapture(captured));
          throw err;
        }

        const captured: CapturedToolCall = {
          runId,
          agentId,
          mcpServer,
          toolName,
          toolParams: params,
          rawResponse,
          responseBytes: Buffer.byteLength(rawResponse, "utf-8"),
          latencyMs: Date.now() - start,
          capturedAt: new Date(),
        };
        // Fire-and-forget — do not await, do not block tool execution
        Promise.resolve().then(() => onCapture(captured));

        return rawResponse;
      };
    },
  };
}
