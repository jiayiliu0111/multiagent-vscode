import * as vscode from "vscode";
import { AIClient } from "./ai/AIClient";
import { ApiKeyManager } from "./ai/ApiKeyManager";
import { ChatController } from "./chat/ChatController";
import { ChatModel } from "./chat/ChatModel";
import { ChatPanel } from "./chat/ChatPanel";
import { ConversationTypesProvider } from "./conversation/ConversationTypesProvider";
import { DiffEditorManager } from "./diff/DiffEditorManager";
import { indexRepository } from "./index/indexRepository";
import { getVSCodeLogLevel, LoggerUsingVSCodeOutput } from "./logger";
import { MultiAgentConversation } from "./conversation/MultiAgentConversation";

export const activate = async (context: vscode.ExtensionContext) => {
  const apiKeyManager = new ApiKeyManager({
    secretStorage: context.secrets,
  });

  const mainOutputChannel = vscode.window.createOutputChannel("Magentim");
  const indexOutputChannel =
    vscode.window.createOutputChannel("Magentim Index");

  const vscodeLogger = new LoggerUsingVSCodeOutput({
    outputChannel: mainOutputChannel,
    level: getVSCodeLogLevel(),
  });
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("magentim.logger.level")) {
      vscodeLogger.setLevel(getVSCodeLogLevel());
    }
  });

  const hasOpenAIApiKey = await apiKeyManager.hasOpenAIApiKey();
  const chatPanel = new ChatPanel({
    extensionUri: context.extensionUri,
    apiKeyManager,
    hasOpenAIApiKey,
  });

  const chatModel = new ChatModel();

  const conversationTypesProvider = new ConversationTypesProvider({
    extensionUri: context.extensionUri,
  });

  await conversationTypesProvider.loadConversationTypes();

  const ai = new AIClient({
    apiKeyManager,
    logger: vscodeLogger,
  });

  const chatController = new ChatController({
    chatPanel,
    chatModel,
    ai,
    diffEditorManager: new DiffEditorManager({
      extensionUri: context.extensionUri,
    }),
    getConversationType(id: string) {
      return conversationTypesProvider.getConversationType(id);
    },
    basicChatTemplateId: "chat-en",
    extensionUri: context.extensionUri,
  });

  chatPanel.onDidReceiveMessage(
    chatController.receivePanelMessage.bind(chatController)
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("magentim.chat", chatPanel),
    vscode.commands.registerCommand(
      "magentim.enterOpenAIApiKey",
      apiKeyManager.enterOpenAIApiKey.bind(apiKeyManager)
    ),
    vscode.commands.registerCommand("magentim.clearOpenAIApiKey", async () => {
      await apiKeyManager.clearOpenAIApiKey();
      vscode.window.showInformationMessage("OpenAI API key cleared.");
    }),

    vscode.commands.registerCommand(
      "magentim.startConversation",
      (templateId) => chatController.createConversation(templateId)
    ),

    vscode.commands.registerCommand("magentim.showChatPanel", async () => {
      await chatController.showChatPanel();
    }),
    vscode.commands.registerCommand("magentim.getStarted", async () => {
      await vscode.commands.executeCommand("workbench.action.openWalkthrough", {
        category: `magentim.magentim-vscode#magentim`,
      });
    }),
    vscode.commands.registerCommand("magentim.reloadTemplates", async () => {
      await conversationTypesProvider.loadConversationTypes();
      vscode.window.showInformationMessage("Magentim templates reloaded.");
    }),

    vscode.commands.registerCommand("magentim.showLogs", () => {
      mainOutputChannel.show(true);
    }),

    vscode.commands.registerCommand("magentim.indexRepository", () => {
      indexRepository({
        ai: ai,
        outputChannel: indexOutputChannel,
      });
    }),

    vscode.commands.registerCommand(
      "magentim.startMultiAgentDesign",
      async () => {
        const conversationId = `conversation-${Date.now()}`;
        const multiAgentConversation = new MultiAgentConversation({
          id: conversationId,
          initVariables: {},
          ai,
          updateChatPanel: async () => {
            await chatPanel.update(chatModel);
          },
          diffEditorManager: new DiffEditorManager({
            extensionUri: context.extensionUri,
          }),
        });

        // Add to chat model and show
        chatModel.addAndSelectConversation(multiAgentConversation);
        await chatController.showChatPanel();
        await chatPanel.update(chatModel);

        // Start the collaboration
        await multiAgentConversation.answer();
      }
    )
  );

  return Object.freeze({
    async registerTemplate({ template }: { template: string }) {
      conversationTypesProvider.registerExtensionTemplate({ template });
      await conversationTypesProvider.loadConversationTypes();
    },
  });
};

export const deactivate = async () => {
  // noop
};
