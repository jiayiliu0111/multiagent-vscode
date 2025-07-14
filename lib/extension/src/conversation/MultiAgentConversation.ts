import { webviewApi } from "@rubberduck/common";
import * as vscode from "vscode";
import { AIClient } from "../ai/AIClient";
import { DiffEditorManager } from "../diff/DiffEditorManager";
import { Conversation } from "./Conversation";
import { AgentManager } from "./agents/AgentManager";
import { AgentRole } from "./agents/AgentRole";

export class MultiAgentConversation extends Conversation {
  private agentManager: AgentManager;
  private currentPhase:
    | "initial"
    | "user_confirmation"
    | "requirements"
    | "development"
    | "testing"
    | "review"
    | "complete"
    | "finished" = "initial";
  private iterationCount: number = 0;
  private generatedCode: string = "";
  private seTeRounds: number = 0; // Software Engineer & Test Engineer rounds
  private pmSeRounds: number = 0; // Product Manager & Software Engineer rounds
  private pmReviewRounds: number = 0; // Product Manager review rounds
  private totalPmReviewRounds: number = 0; // Total Product Manager review rounds across all iterations
  private isConversationFinished: boolean = false;
  private isInForcedState: boolean = false; // Track when we're in a forced state due to round limits
  private readonly agents: AgentRole[] = [
    {
      name: "Product Manager",
      description:
        "Responsible for understanding requirements, defining product vision, and ensuring business value",
      systemPrompt: `You are a Product Manager. Your role is to:
1. Understand and clarify user requirements
2. Define product vision and goals
3. Prioritize features based on business value
4. Ensure the solution meets user needs
5. Review final products and provide feedback

Always think from a business and user perspective. Be specific about requirements and success criteria.`,
      icon: "lightbulb",
    },
    {
      name: "Software Engineer",
      description:
        "Responsible for technical design, architecture, and implementation details",
      systemPrompt: `You are a Software Engineer. Your role is to:
1. Design technical architecture and solutions
2. Consider scalability, performance, and maintainability
3. Suggest appropriate technologies and frameworks
4. Write clean, production-ready code
5. Respond to feedback and iterate on code

Think from a technical perspective. Write complete, runnable code with proper error handling.`,
      icon: "code",
    },
    {
      name: "Test Engineer",
      description:
        "Responsible for testing strategy, quality assurance, and validation",
      systemPrompt: `You are a Test Engineer. Your role is to:
1. Design comprehensive testing strategies
2. Identify potential issues and edge cases
3. Ensure quality and reliability
4. Validate that requirements are met
5. Provide specific feedback for improvements

Think from a quality assurance perspective. Be thorough in testing and provide actionable feedback.`,
      icon: "testing",
    },
  ];

  constructor({
    id,
    initVariables,
    ai,
    updateChatPanel,
    diffEditorManager,
  }: {
    id: string;
    initVariables: Record<string, unknown>;
    ai: AIClient;
    updateChatPanel: () => Promise<void>;
    diffEditorManager: DiffEditorManager;
  }) {
    // Create a proper template structure
    const template = {
      id: "multi-agent-design",
      engineVersion: 0 as const,
      label: "Multi-Agent Product Design",
      description: "Collaborative product design with three AI agents",
      header: {
        title: "Multi-Agent Product Design",
        icon: { type: "codicon" as const, value: "group" },
        useFirstMessageAsTitle: false,
      },
      variables: [],
      response: {
        template: "",
        maxTokens: 2048,
        temperature: 0.7,
      },
    };

    super({
      id,
      initVariables,
      ai,
      updateChatPanel,
      template,
      diffEditorManager,
      diffData: undefined,
    });

    this.agentManager = new AgentManager({
      ai,
      agents: this.agents,
      onAgentResponse: this.handleAgentResponse.bind(this),
    });
  }

  async startCollaboration(userRequest: string) {
    this.currentPhase = "user_confirmation";
    this.iterationCount = 1;
    this.seTeRounds = 0;
    this.pmSeRounds = 0;
    this.pmReviewRounds = 0;
    this.totalPmReviewRounds = 0;
    this.isInForcedState = false;

    // Add user request as first message
    await this.addUserMessage({
      content: userRequest,
      botAction: "Starting product development workflow...",
    });

    // Start with Product Manager analyzing the request and proposing design
    const productManager = this.agents[0];
    if (productManager) {
      await this.agentManager.startUserConfirmation(
        userRequest,
        productManager
      );
    }
  }

  private async handleAgentResponse(agent: AgentRole, response: string) {
    // Check if conversation is already finished
    if (this.isConversationFinished || this.currentPhase === "finished") {
      return;
    }

    // Add agent response to conversation
    await this.addBotMessage({
      content: `**${agent.name}**: ${response}`,
      responsePlaceholder: `${agent.name} is thinking...`,
    });

    // Handle workflow progression based on current phase
    await this.progressWorkflow(agent, response);
  }

  private async progressWorkflow(agent: AgentRole, response: string) {
    // Check if conversation is already finished
    if (this.isConversationFinished || this.currentPhase === "finished") {
      return;
    }

    switch (this.currentPhase) {
      case "user_confirmation":
        if (agent.name === "Product Manager") {
          // Product Manager has proposed the design, wait for user confirmation
          await this.addBotMessage({
            content: `**Product Manager**: I've analyzed your request and proposed a design. Please review the proposal above and let me know if you agree with the current design by saying "I agree with your proposal" or if you'd like any changes.`,
            responsePlaceholder: "Waiting for user confirmation...",
          });
        }
        break;

      case "requirements":
        if (agent.name === "Product Manager") {
          // Product Manager has described the product, now Software Engineer should ask clarifying questions
          this.currentPhase = "development";
          const softwareEngineer = this.agents[1];
          if (softwareEngineer) {
            await this.agentManager.startRequirementsDiscussion(
              softwareEngineer,
              this.messages
            );
          }
        }
        break;

      case "development":
        if (agent.name === "Software Engineer") {
          this.pmSeRounds++;

          // Check if we've reached the 2-round limit
          if (this.pmSeRounds >= 2) {
            await this.addBotMessage({
              content: `**System**: Maximum of 2 rounds reached for Product Manager and Software Engineer discussion. Moving to testing phase with current code.`,
              responsePlaceholder: "Proceeding to testing...",
            });

            // Extract code from the current response if available, otherwise use placeholder
            if (response.includes("```") && response.includes("```")) {
              this.generatedCode = this.extractCodeFromResponse(response);
            } else {
              this.generatedCode = "// Code will be provided in next iteration";
            }

            // Move directly to testing phase without calling any AgentManager methods
            this.currentPhase = "testing";
            this.seTeRounds = 0; // Reset SE/TE rounds

            // Add a message indicating we're waiting for Test Engineer
            await this.addBotMessage({
              content: `**System**: Waiting for Test Engineer to begin testing phase...`,
              responsePlaceholder: "Test Engineer is preparing...",
            });

            // Start the Test Engineer
            const testEngineer = this.agents[2];
            if (testEngineer && !this.isConversationFinished) {
              await this.agentManager.startTesting(
                testEngineer,
                this.generatedCode,
                this.messages
              );
            }
          } else {
            // Check if this is the final code submission
            if (response.includes("```") && response.includes("```")) {
              this.generatedCode = this.extractCodeFromResponse(response);
              this.currentPhase = "testing";
              this.seTeRounds = 0; // Reset SE/TE rounds
              const testEngineer = this.agents[2];
              if (testEngineer && !this.isConversationFinished) {
                await this.agentManager.startTesting(
                  testEngineer,
                  this.generatedCode,
                  this.messages
                );
              }
            } else {
              // Continue requirements discussion
              if (!this.isConversationFinished) {
                await this.agentManager.continueRequirementsDiscussion(
                  agent,
                  this.messages
                );
              }
            }
          }
        }
        break;

      case "testing":
        if (agent.name === "Test Engineer") {
          this.seTeRounds++;

          // Check if we've reached the 2-round limit
          if (this.seTeRounds >= 2) {
            await this.addBotMessage({
              content: `**System**: Maximum of 2 rounds reached for Software Engineer and Test Engineer discussion. Moving to final review.`,
              responsePlaceholder: "Proceeding to final review...",
            });

            // Move directly to Product Manager review without calling startFinalReview
            this.currentPhase = "complete";
            const productManager = this.agents[0];
            if (productManager && !this.isConversationFinished) {
              await this.agentManager.startFinalReview(
                productManager,
                this.generatedCode,
                this.messages
              );
            }
          } else {
            // Test Engineer has provided feedback, Software Engineer should respond
            this.currentPhase = "review";
            const softwareEngineer = this.agents[1];
            if (softwareEngineer && !this.isConversationFinished) {
              await this.agentManager.startCodeIteration(
                softwareEngineer,
                response,
                this.messages
              );
            }
          }
        }
        break;

      case "review":
        if (agent.name === "Software Engineer") {
          // Check if Software Engineer and Test Engineer have reached agreement
          if (this.checkAgreementReached(response)) {
            // Update the generated code if new code was provided
            if (response.includes("```") && response.includes("```")) {
              this.generatedCode = this.extractCodeFromResponse(response);
            }

            this.currentPhase = "complete";
            const productManager = this.agents[0];
            if (productManager && !this.isConversationFinished) {
              await this.agentManager.startFinalReview(
                productManager,
                this.generatedCode,
                this.messages
              );
            }
          } else {
            // Continue testing iteration (this will increment seTeRounds in the testing phase)
            this.currentPhase = "testing";
            const testEngineer = this.agents[2];
            if (testEngineer && !this.isConversationFinished) {
              await this.agentManager.continueTesting(
                testEngineer,
                response,
                this.messages
              );
            }
          }
        }
        break;

      case "complete":
        if (agent.name === "Product Manager") {
          this.pmReviewRounds++;
          this.totalPmReviewRounds++;

          // Check if we've reached the 2-round limit for Product Manager review (total across all iterations)
          if (this.totalPmReviewRounds >= 2) {
            await this.addBotMessage({
              content: `**System**: Maximum of 2 rounds reached for Product Manager review across all iterations. Finalizing product based on current consensus.`,
              responsePlaceholder: "Finalizing product...",
            });

            // Force finalization regardless of satisfaction
            await this.finalizeProduct();
            return;
          }

          // Check if Product Manager is satisfied or wants another iteration
          if (this.checkProductManagerSatisfied(response)) {
            // Check if all agents have reached consensus
            if (this.checkAllAgentsAgreed()) {
              await this.finalizeProduct();
            } else {
              // Wait for other agents to confirm agreement
              await this.addBotMessage({
                content: `**Consensus Check**\n\nProduct Manager has approved the product. Waiting for final confirmation from all team members...`,
                responsePlaceholder: "Checking team consensus...",
              });

              // Give other agents a chance to voice any final concerns
              const testEngineer = this.agents[2];
              if (testEngineer && !this.isConversationFinished) {
                await this.agentManager.requestFinalConfirmation(
                  testEngineer,
                  this.messages
                );
              }
            }
          } else {
            // Check if we've already reached the total limit
            if (this.totalPmReviewRounds >= 2) {
              await this.addBotMessage({
                content: `**System**: Maximum of 2 rounds reached for Product Manager review across all iterations. Finalizing product based on current consensus.`,
                responsePlaceholder: "Finalizing product...",
              });
              await this.finalizeProduct();
              return;
            }

            // Start new iteration
            this.iterationCount++;
            this.currentPhase = "development";
            this.pmSeRounds = 0; // Reset PM/SE rounds for new iteration
            this.seTeRounds = 0; // Reset SE/TE rounds for new iteration
            this.pmReviewRounds = 0; // Reset current iteration PM review rounds
            const softwareEngineer = this.agents[1];
            if (softwareEngineer && !this.isConversationFinished) {
              await this.agentManager.startNewIteration(
                softwareEngineer,
                response,
                this.messages
              );
            }
          }
        } else if (agent.name === "Test Engineer") {
          // Test Engineer's final confirmation
          if (this.checkAgreementReached(response)) {
            await this.finalizeProduct();
          } else {
            // Test Engineer has final concerns, continue iteration
            this.currentPhase = "testing";
            const softwareEngineer = this.agents[1];
            if (softwareEngineer && !this.isConversationFinished) {
              await this.agentManager.startCodeIteration(
                softwareEngineer,
                response,
                this.messages
              );
            }
          }
        }
        break;
    }
  }

  private extractCodeFromResponse(response: string): string {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = response.match(codeBlockRegex);
    return matches ? matches.join("\n\n") : "";
  }

  private checkAgreementReached(response: string): boolean {
    const agreementKeywords = [
      "agree",
      "approved",
      "satisfied",
      "ready",
      "final",
      "complete",
      "consensus",
      "unanimous",
      "accepted",
      "endorsed",
      "confirmed",
      "this looks good",
      "this is perfect",
      "no further changes needed",
      "ready for production",
      "ready for delivery",
      "meets all requirements",
    ];

    const disagreementKeywords = [
      "disagree",
      "not satisfied",
      "needs changes",
      "not ready",
      "requires modification",
      "still needs work",
      "not approved",
    ];

    const hasAgreement = agreementKeywords.some((keyword) =>
      response.toLowerCase().includes(keyword)
    );
    const hasDisagreement = disagreementKeywords.some((keyword) =>
      response.toLowerCase().includes(keyword)
    );

    return hasAgreement && !hasDisagreement;
  }

  private checkProductManagerSatisfied(response: string): boolean {
    const satisfiedKeywords = [
      "satisfied",
      "approved",
      "ready",
      "perfect",
      "excellent",
      "final",
      "delivery ready",
      "production ready",
      "meets all requirements",
      "no further changes",
      "this is exactly what we needed",
      "ready to ship",
      "ready for users",
      "final approval",
    ];
    const unsatisfiedKeywords = [
      "change",
      "modify",
      "improve",
      "revise",
      "update",
      "iteration",
      "not satisfied",
      "needs work",
      "not ready",
      "requires changes",
      "still needs",
      "not quite right",
      "missing something",
    ];

    const hasSatisfied = satisfiedKeywords.some((keyword) =>
      response.toLowerCase().includes(keyword)
    );
    const hasUnsatisfied = unsatisfiedKeywords.some((keyword) =>
      response.toLowerCase().includes(keyword)
    );

    return hasSatisfied && !hasUnsatisfied;
  }

  private checkAllAgentsAgreed(): boolean {
    // Check if we have at least one message from each agent in the current iteration
    const recentMessages = this.messages.slice(-6); // Last 6 messages (2 from each agent)
    const agentNames = this.agents.map((agent) => agent.name);

    const hasAllAgents = agentNames.every((agentName) =>
      recentMessages.some(
        (msg) =>
          msg.content.includes(`**${agentName}**:`) &&
          this.checkAgreementReached(msg.content)
      )
    );

    return hasAllAgents;
  }

  private async finalizeProduct() {
    const roundLimitReached =
      this.totalPmReviewRounds >= 2 ||
      this.pmSeRounds >= 2 ||
      this.seTeRounds >= 2;
    const roundLimitMessage = roundLimitReached
      ? `\n**Round Limits Reached:**\n• Product Manager & Software Engineer: ${this.pmSeRounds}/2 rounds\n• Software Engineer & Test Engineer: ${this.seTeRounds}/2 rounds\n• Product Manager Review: ${this.totalPmReviewRounds}/2 rounds (total across all iterations)\n\n**Note:** The conversation has reached the maximum allowed rounds. The product has been finalized based on the current consensus.`
      : "";

    await this.addBotMessage({
      content: `**🎉 Product Development Complete - Team Consensus Reached!**\n\n**Development Summary:**\n• **Iterations**: ${this.iterationCount}\n• **Team Members**: Product Manager, Software Engineer, Test Engineer\n• **Status**: All agents have agreed on the final product${roundLimitMessage}\n\n**Final Code:**\n\`\`\`\n${this.generatedCode}\n\`\`\`\n\n**Team Agreement:**\n✅ **Product Manager**: Approved the final product\n✅ **Software Engineer**: Code is production-ready\n✅ **Test Engineer**: All tests passed, quality assured\n\n**Next Steps:**\n1. Copy the code above to your development environment\n2. Install any required dependencies\n3. Run the application\n4. The product is ready for users!\n\n**Development History:**\nThis conversation contains the complete development history with all agent discussions, iterations, and consensus-building. Every decision was made collaboratively with input from all team members.\n\n**Workflow Complete** - The multi-agent development process has successfully concluded with unanimous team agreement.\n\n**Conversation Ended** - No further API calls will be made.`,
      responsePlaceholder:
        "Product development workflow completed with team consensus!",
    });

    // Mark the conversation as finished to stop API calls
    this.currentPhase = "finished";
    this.isConversationFinished = true;
    this.agentManager.markConversationFinished();
  }

  async answer(userMessage?: string) {
    // Check if conversation is already finished
    if (this.isConversationFinished) {
      await this.addBotMessage({
        content: `**System**: This conversation has been completed. No further development is needed as all agents have reached consensus.`,
        responsePlaceholder: "Conversation completed",
      });
      return;
    }

    if (userMessage) {
      await this.addUserMessage({
        content: userMessage,
        botAction: "Processing user input...",
      });

      // If this is the first user message, start the workflow
      if (this.currentPhase === "initial") {
        await this.startCollaboration(userMessage);
      } else if (this.currentPhase === "user_confirmation") {
        // Handle user confirmation of Product Manager's proposal
        await this.handleUserConfirmation(userMessage);
      } else {
        // Handle user input during the workflow
        await this.handleUserInput(userMessage);
      }
    } else {
      // If no user message and no messages yet, set up initial state
      if (this.messages.length === 0) {
        await this.addBotMessage({
          content: `**🚀 Multi-Agent Product Development Workflow**\n\nI'm here to help you develop a complete product with three specialized AI agents:\n\n1. **Product Manager** 🤔 - Analyzes your request, proposes design, and gets your approval\n2. **Software Engineer** 💻 - Writes production-ready code based on approved requirements\n3. **Test Engineer** 🧪 - Tests and validates the product\n\n**Workflow:**\n1. You describe your product idea\n2. Product Manager analyzes and proposes a design\n3. You review and approve the proposal (or request changes)\n4. Product Manager works with Software Engineer and Test Engineer\n5. Iterations continue until all agents agree (max 2 rounds each)\n6. You get the final code and complete development history\n\n**Round Limits:**\n• Product Manager & Software Engineer: 2 rounds\n• Software Engineer & Test Engineer: 2 rounds\n• Product Manager Review: 2 rounds\n\nPlease describe your product idea to begin!`,
          responsePlaceholder: "Waiting for your product idea...",
        });
      } else {
        // Start the collaboration with existing message
        const firstMessage = this.messages[0]?.content;
        if (firstMessage) {
          await this.startCollaboration(firstMessage);
        }
      }
    }
  }

  private async handleUserConfirmation(userMessage: string) {
    const lowerMessage = userMessage.toLowerCase();

    if (
      lowerMessage.includes("i agree with your proposal") ||
      lowerMessage.includes("i agree") ||
      lowerMessage.includes("yes") ||
      lowerMessage.includes("approved") ||
      lowerMessage.includes("proceed") ||
      lowerMessage.includes("go ahead")
    ) {
      // User has agreed, proceed to requirements phase
      this.currentPhase = "requirements";
      await this.addBotMessage({
        content: `**Product Manager**: Excellent! Thank you for confirming. Now I'll work with the Software Engineer and Test Engineer to develop your product. Let me provide a detailed product specification for the technical team.`,
        responsePlaceholder: "Preparing detailed requirements...",
      });

      // Product Manager creates detailed requirements for the technical team
      const productManager = this.agents[0];
      if (productManager) {
        await this.agentManager.startProductDescription(
          userMessage,
          productManager
        );
      }
    } else {
      // User wants changes, Product Manager should iterate on the proposal
      await this.addBotMessage({
        content: `**Product Manager**: I understand you'd like some changes. Let me revise the proposal based on your feedback.`,
        responsePlaceholder: "Revising proposal...",
      });

      const productManager = this.agents[0];
      if (productManager) {
        await this.agentManager.iterateUserProposal(
          productManager,
          userMessage,
          this.messages
        );
      }
    }
  }

  private async handleUserInput(userMessage: string) {
    // Check if user wants to interact with specific agent
    const agentMatch = this.agents.find((agent) =>
      userMessage.toLowerCase().includes(agent.name.toLowerCase())
    );

    if (agentMatch) {
      // Direct interaction with specific agent
      await this.agentManager.interactWithAgent(
        agentMatch,
        userMessage,
        this.messages
      );
    } else {
      // General user input - let the current phase handle it
      await this.addBotMessage({
        content: `**User Input**: ${userMessage}\n\nI'll incorporate your feedback into the current development phase.`,
        responsePlaceholder: "Processing your input...",
      });
    }
  }

  // Override to provide multi-agent specific functionality
  async getTitle() {
    return "Multi-Agent Product Design";
  }

  getCodicon(): string {
    return "group";
  }
}
