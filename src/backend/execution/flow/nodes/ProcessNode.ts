// Local implementation of PocketFlow for debugging
import { BaseNode } from '../temp_pocket';
import { createLogger } from '@/utils/logger';
import { promptRenderer } from '@/backend/utils/PromptRenderer';
import { ToolHandler } from '../handlers/ToolHandler';
import { ModelHandler } from '../handlers/ModelHandler';
import { 
  SharedState, 
  ProcessNodeParams, 
  ProcessNodePrepResult, 
  ProcessNodeExecResult,
  ToolDefinition
} from '../types';
import OpenAI from 'openai';

// Create a logger instance for this file
const log = createLogger('backend/flow/execution/nodes/ProcessNode');

export class ProcessNode extends BaseNode {
  async prep(sharedState: SharedState, node_params?: ProcessNodeParams): Promise<ProcessNodePrepResult> {
    log.info('prep() started');

    // Extract properties from node_params
    const nodeId = node_params?.id;
    const flowId = sharedState.flowId;
    const boundModel = node_params?.properties?.boundModel;
    const excludeModelPrompt = node_params?.properties?.excludeModelPrompt || false;
    const excludeStartNodePrompt = node_params?.properties?.excludeStartNodePrompt || false;
    
    log.debug('Extracted properties', { 
      nodeId,
      flowId,
      boundModel, 
      excludeModelPrompt,
      excludeStartNodePrompt
    });
    
    if (!nodeId || !flowId) {
      log.error('Missing required node or flow ID', { nodeId, flowId });
      throw new Error("Process node requires node ID and flow ID");
    }
    
    if (!boundModel) {
      log.error('Missing bound model');
      throw new Error("Process node requires a bound model");
    }
    
    // Use the promptRenderer to build the complete prompt
    log.info('Using promptRenderer to build the complete prompt');
    const completePrompt = await promptRenderer.renderPrompt(flowId, nodeId, {
      renderMode: 'rendered',
      includeConversationHistory: false,
      excludeModelPrompt,
      excludeStartNodePrompt
    });
    
    log.debug('Prompt rendered successfully', {
      completePromptLength: completePrompt.length,
      completePromptPreview: completePrompt.length > 100 ? 
        completePrompt.substring(0, 100) + '...' : completePrompt
    });
    
  // Check if tools are already available in shared state
  let availableTools: ToolDefinition[] = [];
  
  if (sharedState.mcpContext && sharedState.mcpContext.availableTools && sharedState.mcpContext.availableTools.length > 0) {
    // Use tools already processed by MCPNode
    log.info('Using MCP tools from shared state', {
      toolsCount: sharedState.mcpContext.availableTools.length
    });
    availableTools = sharedState.mcpContext.availableTools;
  } else {
    // Only process MCP nodes if tools are not available in shared state
    const mcpNodes = node_params?.properties?.mcpNodes || [];
    
    if (mcpNodes.length > 0) {
      log.info('No MCP tools found in shared state, processing MCP nodes', {
        mcpNodesCount: mcpNodes.length
      });
      
      // Process MCP nodes using the ToolHandler
      const mcpResult = await ToolHandler.processMCPNodes({ mcpNodes });
      
      if (!mcpResult.success) {
        log.error('Failed to process MCP nodes', { error: mcpResult.error });
        throw new Error(`Failed to process MCP nodes: ${mcpResult.error.message}`);
      }
      
      availableTools = mcpResult.value.availableTools;
    }
  }
  
  // Create a properly typed PrepResult
  const prepResult: ProcessNodePrepResult = {
    nodeId,
    nodeType: 'process',
    currentPrompt: completePrompt,
    boundModel,
    availableTools: availableTools,
    messages: [] // Will be populated after reordering
  };
    
    // Reorder messages to ensure system messages are at the top
    // Extract non-system messages
    const nonSystemMessages: OpenAI.ChatCompletionMessageParam[] = [];
    
    // Copy and categorize messages
    sharedState.messages.forEach(msg => {
      if (msg.role !== 'system') {
        nonSystemMessages.push(msg);
      }
    });
    
    // Create our own system message with the current prompt
    const systemMessage = {
      role: 'system',
      content: completePrompt
    } as OpenAI.ChatCompletionMessageParam;
    
    log.info('Added system message from prompt template', {
      contentLength: completePrompt.length,
      contentPreview: completePrompt.length > 100 ?
        completePrompt.substring(0, 100) + '...' : completePrompt
    });
    
    // Combine messages with our system message first, then non-system messages
    prepResult.messages = [systemMessage, ...nonSystemMessages];
    
    log.info('Reordered messages with system messages at the top', {
      systemMessageCount: 1, // We now have exactly one system message
      nonSystemMessageCount: nonSystemMessages.length,
      totalMessageCount: prepResult.messages.length
    });
    
    log.info('prep() completed', { 
      completePromptLength: completePrompt.length,
      boundModel,
      hasTools: !!prepResult.availableTools?.length,
      toolsCount: prepResult.availableTools?.length || 0,
      messagesCount: prepResult.messages.length
    });
    
    return prepResult;
  }

  async execCore(prepResult: ProcessNodePrepResult, node_params?: ProcessNodeParams): Promise<ProcessNodeExecResult> {
    log.info('execCore() started', {
      boundModel: prepResult.boundModel,
      promptLength: prepResult.currentPrompt?.length,
      messagesCount: prepResult.messages?.length || 0
    });
    
    // Add verbose logging of the entire prepResult
    log.debug('execCore() prepResult', JSON.stringify(prepResult));
    
    try {
      // Prepare tools if available
      let tools = undefined;
      
      if (prepResult.availableTools && prepResult.availableTools.length > 0) {
        const toolsResult = ToolHandler.prepareTools({
          availableTools: prepResult.availableTools
        });
        
        if (!toolsResult.success) {
          log.error('Failed to prepare tools', { error: toolsResult.error });
          throw new Error(`Failed to prepare tools: ${toolsResult.error.message}`);
        }
        
        tools = toolsResult.value.tools;
      }
      
      // Get the node name for display
      const nodeName = node_params?.label || node_params?.properties?.name || 'Process Node';
      
      // Call the model with tool support
      const modelResult = await ModelHandler.callModel({
        modelId: prepResult.boundModel,
        prompt: prepResult.currentPrompt,
        messages: prepResult.messages,
        tools,
        iteration: 1,
        maxIterations: 30,
        nodeName // Pass the node name to be included in the response header
      });
      
    if (!modelResult.success) {
      log.error('Model execution error', { error: modelResult.error });
      
      // CHANGE: Instead of returning an error result, throw a custom error
      const modelError = new Error(`Model execution failed: ${modelResult.error.message}`);
      
      // Add properties to the error object
      (modelError as any).isModelError = true;
      (modelError as any).details = {
        message: modelResult.error.message,
        type: modelResult.error.type,
        code: modelResult.error.code,
        // Only include modelId if it exists
        ...(modelResult.error.type === 'model' ? { modelId: modelResult.error.modelId } : {}),
        param: typeof modelResult.error.details?.param === 'string' ? modelResult.error.details.param : undefined,
        status: typeof modelResult.error.details?.status === 'number' ? modelResult.error.details.status : undefined,
        // Include all other details from the original error
        ...modelResult.error.details
      };
      
      // Log that we're throwing a critical error
      log.error('Throwing critical model error to abort flow execution', {
        error: modelResult.error.message,
        type: modelResult.error.type,
        code: modelResult.error.code
      });
      
      // Throw the error to abort execution
      throw modelError;
      }
      
      const result = modelResult.value;
      
      // Create a properly typed ExecResult
      const execResult: ProcessNodeExecResult = {
        success: true,
        content: result.content || '',
        messages: result.messages, // Messages updated during tool calls
        fullResponse: result.fullResponse,
        toolCalls: result.toolCalls
      };
      
      // Log tool calls if present
      if (result.toolCalls && result.toolCalls.length > 0) {
        log.info('Tool calls found in model response', {
          toolCallsCount: result.toolCalls.length,
          toolNames: result.toolCalls.map(tc => tc.name).join(', ')
        });
      }
      
      log.info('execCore() completed', {
        responseLength: execResult.content?.length || 0,
        messagesCount: execResult.messages?.length || 0,
        hasToolCalls: !!execResult.toolCalls?.length
      });
      
      // Add verbose logging of the entire execResult
      log.verbose('execCore() execResult', JSON.stringify(execResult));
      
      return execResult;
    } catch (error) {
    // For critical tool errors or model errors, we want to rethrow them
    // to abort the flow execution
    if (error && typeof error === 'object' && 
        ('isCriticalToolError' in error || 'isModelError' in error)) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      log.error('Critical error detected - propagating to abort flow:', {
        error: errorMessage,
        isModelError: 'isModelError' in error,
        isCriticalToolError: 'isCriticalToolError' in error
      });
      
      // Rethrow the error to stop execution and propagate to the frontend
      throw error;
      }
      
      // For other errors, create an error result
      const errorResult: ProcessNodeExecResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorDetails: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : { message: String(error) }
      };
      
      log.error('execCore() failed', {
        error: errorResult.error,
        errorDetails: errorResult.errorDetails
      });
      
      // Add verbose logging of the error result
      log.verbose('execCore() errorResult', JSON.stringify(errorResult));
      
      return errorResult;
    }
  }

  async post(
    prepResult: ProcessNodePrepResult, 
    execResult: ProcessNodeExecResult, 
    sharedState: SharedState, 
    node_params?: ProcessNodeParams
  ): Promise<string> {
    log.info('post() started', { 
      execResultSuccess: execResult.success,
      execResultContentLength: execResult.content?.length || 0,
      messagesCount: execResult.messages?.length || 0
    });
    
    // Store the model response or error in shared state
    if (!execResult.success) {
      // Store error information in shared state
      sharedState.lastResponse = {
        success: false,
        error: execResult.error,
        errorDetails: execResult.errorDetails
      };
    } else if (execResult.content) {
      sharedState.lastResponse = execResult.content;
    }
    
    // Update shared state with messages from execResult
    if (execResult.messages && execResult.messages.length > 0) {
      // Replace messages in shared state with the updated messages
      sharedState.messages = execResult.messages;
      
      log.info('Updated messages in sharedState', {
        messagesCount: sharedState.messages.length
      });
    }
    
    // Add tracking information for the ProcessNode itself
    if (Array.isArray(sharedState.trackingInfo.nodeExecutionTracker)) {
      sharedState.trackingInfo.nodeExecutionTracker.push({
        nodeType: 'ProcessNode',
        nodeId: node_params?.id || 'unknown',
        nodeName: node_params?.properties?.name || 'Process Node',
        modelDisplayName: prepResult.modelDisplayName || 'Unknown Model',
        modelTechnicalName: prepResult.boundModel || 'unknown',
        allowedTools: node_params?.properties?.allowedTools?.join(', '),
        timestamp: new Date().toISOString()
      });
      
      log.info('Added ProcessNode tracking information', {
        modelDisplayName: prepResult.modelDisplayName,
        modelTechnicalName: prepResult.boundModel
      });
    }
    
    log.info('post() completed', { 
      messagesCount: sharedState.messages?.length || 0
    });
    
    // Get the successors for this node
    
    // Log the successors object for debugging
    log.info('Successors object:', {
      hasSuccessors: !!this.successors,
      isMap: this.successors instanceof Map,
      type: typeof this.successors
    });
    
    // Handle successors as a Map (which is what PocketFlowFramework uses)
    const allActions = this.successors instanceof Map 
      ? Array.from(this.successors.keys()) 
      : Object.keys(this.successors || {});
    
    // Filter out MCP edges - only keep standard edges for flow navigation
    const actions = allActions.filter(action => !action.includes('-mcpEdge') && !action.endsWith('mcpEdge') && !action.includes('-mcp'));
    
    // Log the actions for debugging
    log.info('Actions:', {
      allActionsCount: allActions.length,
      allActions: allActions,
      filteredActionsCount: actions.length,
      filteredActions: actions
    });
    
    if (actions.length > 0) {
      // Return the first available standard action
      const action = actions[0];
      log.info(`Returning standard action: ${action}`);
      return action;
    } else if (allActions.length > 0) {
      // If no standard actions but we have other actions, log a warning
      log.warn(`No standard actions found, only MCP edges. This may indicate a flow configuration issue.`);
    }
    
    return "default"; // Default fallback
  }

  /**
   * Add message to state
   */
  private addMessageToState(
    prepResult: ProcessNodePrepResult, 
    role: string, 
    content: string
  ): void {
    // Check if we already have a message with this role
    const existingMessage = prepResult.messages?.find(
      (msg: OpenAI.ChatCompletionMessageParam) => msg.role === role
    );
    
    if (!existingMessage) {
      // Add the message to prepResult.messages
      if (!prepResult.messages) {
        prepResult.messages = [];
      }
      
      // Create a properly typed message based on role
      let message: OpenAI.ChatCompletionMessageParam;
      
      switch (role) {
        case 'system':
          message = {
            role: 'system',
            content: content
          };
          break;
        case 'user':
          message = {
            role: 'user',
            content: content
          };
          break;
        case 'assistant':
          message = {
            role: 'assistant',
            content: content
          };
          break;
        case 'tool':
          // Tool messages require a tool_call_id
          throw new Error("Tool messages require a tool_call_id");
        default:
          throw new Error(`Unsupported role: ${role}`);
      }
      
      prepResult.messages.push(message);
      
      log.info(`Added ${role} message`, {
        contentLength: content.length,
        contentPreview: content.length > 100 ?
          content.substring(0, 100) + '...' : content
      });
    } else {
      log.info(`${role} message already exists, not adding again`);
    }
  }

  _clone(): BaseNode {
    return new ProcessNode();
  }
}
