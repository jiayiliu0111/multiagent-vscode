export enum AgentRole {
  PRODUCT_MANAGER = "Product Manager",
  SOFTWARE_DESIGN_ENGINEER = "Software Design Engineer",
  TEST_ENGINEER = "Test Engineer",
}

export interface AgentMessage {
  id: string;
  fromAgent: AgentRole;
  toAgent?: AgentRole; // undefined means broadcast
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AgentContext {
  userRequest: string;
  conversationHistory: AgentMessage[];
  projectContext?: any;
}

export interface Agent {
  role: AgentRole;
  processMessage(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentMessage>;
  initialize(): Promise<void>;
}
