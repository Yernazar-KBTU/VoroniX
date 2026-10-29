import type { Conversation } from "../domain/types.js";
import type { ToolCallLog } from "./tools.js";

export interface AgentContext {
  progress: (status: string) => void;
  signal: AbortSignal;
}

export interface AgentReply {
  /** Message to send to the client. Empty when the agent only took actions. */
  text: string;
  toolCalls: ToolCallLog[];
  usage?: { input_tokens: number; output_tokens: number };
}

/** An AI administrator: reads the chat, may call CRM tools, returns the next message. */
export interface AgentEngine {
  readonly name: string;
  reply(conv: Conversation, ctx: AgentContext): Promise<AgentReply>;
}
