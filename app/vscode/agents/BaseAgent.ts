import { Agent, AgentRole, AgentMessage, AgentContext } from "./types";
import { Configuration, OpenAIApi } from "openai";

export abstract class BaseAgent implements Agent {
  protected openai: OpenAIApi;
  abstract role: AgentRole;
  abstract systemPrompt: string;

  constructor(apiKey: string) {
    const configuration = new Configuration({ apiKey });
    this.openai = new OpenAIApi(configuration);
  }

  async initialize(): Promise<void> {
    // Override in subclasses if needed
  }

  async processMessage(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentMessage> {
    const messages = this.buildPromptMessages(message, context);

    const completion = await this.openai.createChatCompletion({
      model: "gpt-4",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const responseContent = completion.data.choices[0].message?.content || "";

    return {
      id: this.generateMessageId(),
      fromAgent: this.role,
      content: responseContent,
      timestamp: new Date(),
      metadata: {
        model: "gpt-4",
        tokensUsed: completion.data.usage?.total_tokens,
      },
    };
  }

  protected buildPromptMessages(
    message: AgentMessage,
    context: AgentContext
  ): any[] {
    const messages = [
      { role: "system", content: this.systemPrompt },
      {
        role: "user",
        content: `Original user request: ${context.userRequest}`,
      },
    ];

    // Add conversation history
    context.conversationHistory.forEach((msg) => {
      messages.push({
        role: "assistant",
        content: `[${msg.fromAgent}]: ${msg.content}`,
      });
    });

    // Add current message
    messages.push({
      role: "user",
      content: `[${message.fromAgent}]: ${message.content}`,
    });

    return messages;
  }

  protected generateMessageId(): string {
    return `${this.role}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }
}
