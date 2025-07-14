import { webviewApi } from "@rubberduck/common";
import { AIClient } from "../../ai/AIClient";
import { AgentRole } from "./AgentRole";

export class AgentManager {
  private readonly ai: AIClient;
  private readonly agents: AgentRole[];
  private readonly onAgentResponse: (
    agent: AgentRole,
    response: string
  ) => Promise<void>;
  private isConversationFinished: boolean = false;

  constructor({
    ai,
    agents,
    onAgentResponse,
  }: {
    ai: AIClient;
    agents: AgentRole[];
    onAgentResponse: (agent: AgentRole, response: string) => Promise<void>;
  }) {
    this.ai = ai;
    this.agents = agents;
    this.onAgentResponse = onAgentResponse;
  }

  // Method to mark conversation as finished
  public markConversationFinished(): void {
    this.isConversationFinished = true;
  }

  // Product Manager starts by analyzing user request and proposing design
  async startUserConfirmation(userRequest: string, productManager: AgentRole) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${productManager.systemPrompt}\n\n## User Request\n${userRequest}\n\n## Your Task\nAs the Product Manager, analyze the user's request and propose a comprehensive product design. Include:\n\n1. **Product Analysis**: What problem are we solving?\n2. **Proposed Solution**: How will our product solve this problem?\n3. **Key Features**: What are the main functionalities we should include?\n4. **Target Users**: Who will use this product?\n5. **Success Metrics**: How will we measure success?\n6. **Technical Approach**: What technologies should we consider?\n7. **Design Recommendations**: Any specific design suggestions?\n\nBe thorough and provide a clear, actionable proposal that the user can review and approve.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(productManager, response);
  }

  // Product Manager iterates on proposal based on user feedback
  async iterateUserProposal(
    productManager: AgentRole,
    userFeedback: string,
    messages: webviewApi.Message[]
  ) {
    const prompt = `${
      productManager.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## User Feedback\n${userFeedback}\n\n## Your Task\nAs the Product Manager, revise the product proposal based on the user's feedback. Address their concerns and provide an updated design that incorporates their suggestions. Be specific about what changes you're making and why.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(productManager, response);
  }

  // Product Manager creates detailed requirements for technical team
  async startProductDescription(
    userRequest: string,
    productManager: AgentRole
  ) {
    const prompt = `${productManager.systemPrompt}\n\n## User Request\n${userRequest}\n\n## Your Task\nAs the Product Manager, provide a comprehensive description of the product based on the user's request. Include:\n\n1. **Product Vision**: What problem does this solve?\n2. **Key Features**: What are the main functionalities?\n3. **Target Users**: Who will use this product?\n4. **Success Criteria**: How will we measure success?\n5. **Technical Requirements**: Any specific technical constraints?\n\nBe detailed and specific so the Software Engineer can understand exactly what to build.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(productManager, response);
  }

  // Software Engineer asks clarifying questions
  async startRequirementsDiscussion(
    softwareEngineer: AgentRole,
    messages: webviewApi.Message[]
  ) {
    const prompt = `${
      softwareEngineer.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Your Task\nAs the Software Engineer, review the Product Manager's description and ask clarifying questions to ensure you understand the requirements completely. Focus on:\n\n1. **Technical feasibility**: Are there any technical challenges?\n2. **Architecture decisions**: What technologies should we use?\n3. **Implementation details**: What specific features need clarification?\n4. **Scalability concerns**: How should we handle growth?\n5. **Performance requirements**: Any specific performance needs?\n\nAsk specific, actionable questions that will help you write the best possible code.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(softwareEngineer, response);
  }

  // Continue requirements discussion
  async continueRequirementsDiscussion(
    softwareEngineer: AgentRole,
    messages: webviewApi.Message[]
  ) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${
      softwareEngineer.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Your Task\nBased on the ongoing discussion, either:\n\n1. **Ask more clarifying questions** if requirements are still unclear\n2. **Start writing code** if you have enough information\n\n**IMPORTANT**: You must finish this phase within 2 rounds. If you cannot reach agreement, you must provide code based on the current understanding.\n\nIf you're ready to write code, provide a complete, runnable implementation with proper error handling and documentation. Use code blocks (\`\`\`) to format your code.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(softwareEngineer, response);
  }

  // Force code development when round limit is reached
  async forceCodeDevelopment(
    softwareEngineer: AgentRole,
    messages: webviewApi.Message[]
  ) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${
      softwareEngineer.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Your Task\nYou have reached the maximum of 2 rounds for requirements discussion. You must now provide the final code based on the current understanding of the requirements.\n\nProvide a complete, runnable implementation with proper error handling and documentation. Use code blocks (\`\`\`) to format your code.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(softwareEngineer, response);
  }

  // Test Engineer starts testing
  async startTesting(
    testEngineer: AgentRole,
    code: string,
    messages: webviewApi.Message[]
  ) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${
      testEngineer.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Code to Test\n\`\`\`\n${code}\n\`\`\`\n\n## Your Task\nAs the Test Engineer, thoroughly test this code and provide feedback. Consider:\n\n1. **Functionality**: Does it work as intended?\n2. **Edge cases**: What happens with invalid inputs?\n3. **Error handling**: Are errors handled properly?\n4. **Performance**: Any performance concerns?\n5. **Security**: Any security vulnerabilities?\n6. **Code quality**: Is the code maintainable?\n\nProvide specific, actionable feedback. If you find issues, explain what needs to be fixed and why.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(testEngineer, response);
  }

  // Software Engineer responds to testing feedback
  async startCodeIteration(
    softwareEngineer: AgentRole,
    testFeedback: string,
    messages: webviewApi.Message[]
  ) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${
      softwareEngineer.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Test Engineer Feedback\n${testFeedback}\n\n## Your Task\nAs the Software Engineer, respond to the Test Engineer's feedback. Either:\n\n1. **Address the issues** by providing updated code with fixes\n2. **Explain why certain suggestions aren't applicable** if you disagree\n3. **Ask for clarification** if the feedback is unclear\n\n**IMPORTANT**: You must finish this phase within 2 rounds. If you cannot reach agreement, you must provide the final code version.\n\nIf you're making changes, provide the complete updated code in code blocks (\`\`\`). Be collaborative and professional in your response.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(softwareEngineer, response);
  }

  // Continue testing iteration
  async continueTesting(
    testEngineer: AgentRole,
    softwareResponse: string,
    messages: webviewApi.Message[]
  ) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${
      testEngineer.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Software Engineer Response\n${softwareResponse}\n\n## Your Task\nAs the Test Engineer, review the Software Engineer's response and either:\n\n1. **Approve the changes** if the issues are resolved - clearly state "I approve this version" or "This looks good to me"\n2. **Provide additional feedback** if there are still concerns\n3. **Suggest further improvements** if needed\n\n**IMPORTANT**: You must finish this phase within 2 rounds. If you cannot reach agreement, you must approve the current version or provide a final summary of remaining concerns.\n\nBe specific about what you approve or what still needs work. If you're satisfied, use clear approval language to help the team reach consensus.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(testEngineer, response);
  }

  // Product Manager reviews final product
  async startFinalReview(
    productManager: AgentRole,
    code: string,
    messages: webviewApi.Message[]
  ) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${
      productManager.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Final Code\n\`\`\`\n${code}\n\`\`\`\n\n## Your Task\nAs the Product Manager, review the final product that the Software Engineer and Test Engineer have agreed upon. Consider:\n\n1. **Does it meet the original requirements?**\n2. **Is it ready for users?**\n3. **Are there any business concerns?**\n4. **Should we make any final adjustments?**\n\nProvide your final approval or specify what changes are needed. If you're satisfied, clearly state "I approve this product for delivery" or "This product is ready for users" to help the team reach final consensus.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(productManager, response);
  }

  // Start new iteration if needed
  async startNewIteration(
    softwareEngineer: AgentRole,
    productManagerFeedback: string,
    messages: webviewApi.Message[]
  ) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${
      softwareEngineer.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Product Manager Feedback\n${productManagerFeedback}\n\n## Your Task\nAs the Software Engineer, the Product Manager has requested changes. Please:\n\n1. **Understand the requested changes**\n2. **Implement the necessary modifications**\n3. **Provide updated code** that addresses the feedback\n\nProvide the complete updated code in code blocks (\`\`\`). This will start a new testing cycle.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(softwareEngineer, response);
  }

  // Direct interaction with specific agent
  async interactWithAgent(
    agent: AgentRole,
    userMessage: string,
    messages: webviewApi.Message[]
  ) {
    const prompt = this.buildDirectInteractionPrompt(
      userMessage,
      agent,
      messages
    );
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(agent, response);
  }

  // Request final confirmation from Test Engineer
  async requestFinalConfirmation(
    testEngineer: AgentRole,
    messages: webviewApi.Message[]
  ) {
    if (this.isConversationFinished) {
      return;
    }
    const prompt = `${
      testEngineer.systemPrompt
    }\n\n## Previous Discussion\n${this.formatMessages(
      messages
    )}\n\n## Your Task\nAs the Test Engineer, the Product Manager has approved the product. Please provide your final confirmation:\n\n1. **Confirm approval** if you're satisfied with the current version\n2. **Voice any final concerns** if there are still issues that need to be addressed\n\nBe clear about whether you approve the product for delivery or if there are any remaining concerns that should prevent the release.`;
    const response = await this.getAgentResponse(prompt);
    await this.onAgentResponse(testEngineer, response);
  }

  private formatMessages(messages: webviewApi.Message[]): string {
    return messages
      .map((message) => {
        const role = message.author === "user" ? "User" : "Agent";
        return `**${role}**: ${message.content}`;
      })
      .join("\n\n");
  }

  private buildDirectInteractionPrompt(
    userMessage: string,
    agent: AgentRole,
    messages: webviewApi.Message[]
  ): string {
    let prompt = `${agent.systemPrompt}\n\n`;

    if (messages.length > 0) {
      prompt += `## Previous Discussion\n`;
      messages.forEach((message) => {
        const role = message.author === "user" ? "User" : "Agent";
        prompt += `**${role}**: ${message.content}\n\n`;
      });
    }

    prompt += `## Direct Question\n**User**: ${userMessage}\n\n## Your Response\nAs the ${agent.name}, respond directly to this question based on your expertise.`;

    return prompt;
  }

  private async getAgentResponse(prompt: string): Promise<string> {
    if (this.isConversationFinished) {
      return "Conversation has been completed. No further responses needed.";
    }

    try {
      const stream = await this.ai.streamText({
        prompt,
        maxTokens: 2048,
        temperature: 0.7,
      });

      let response = "";
      for await (const chunk of stream) {
        response += chunk;
      }

      return response;
    } catch (error) {
      console.error("Error getting agent response:", error);
      return "I apologize, but I encountered an error while processing your request. Please try again.";
    }
  }

  // Method to check if conversation should continue
  public isConversationActive(): boolean {
    // This will be called by the conversation to check if it should continue
    return true; // Default to true, will be overridden by conversation logic
  }
}
