import cloneDeep from "lodash/cloneDeep";
import { createLogger } from '@/utils/logger';
import { STAY_ON_NODE_ACTION } from './types';

const log = createLogger('backend/execution/flow/temp_pocket');

export const DEFAULT_ACTION = "default"; // Default action for 

export abstract class BaseNode {
    public flow_params: any;
    public node_params: any; // Add node_params
    public successors: Map<string, BaseNode>;

    constructor() {
        log.debug(`BaseNode constructor called`);
        this.flow_params = {};
        this.node_params = {}; // Initialize node_params
        this.successors = new Map();
    }

  public setParams(params: any, node_params?: any): void {
    log.debug(`setParams called with params`, { params });
    
    // Add verbose logging of the input parameters
    log.verbose('setParams input', JSON.stringify({
      params,
      node_params
    }));
    
    this.flow_params = params;
    if (node_params) {
        this.node_params = node_params;
    }
    
    log.debug(`setParams finished. flow_params count`, { flow_params: this.flow_params?.length, node_params: this.node_params?.length });
    
    // Add verbose logging of the updated state
    log.verbose('setParams result', JSON.stringify({
      flow_params: this.flow_params,
      node_params: this.node_params
    }));
  }

    public clone(): BaseNode {
        log.debug(`clone called`);
        const newNode = this._clone();
        log.verbose(`_clone result`, { newNode });
        newNode.flow_params = cloneDeep(this.flow_params);
        log.verbose(`Cloned flow_params`, { flow_params: newNode.flow_params });
        newNode.node_params = cloneDeep(this.node_params); // Clone node_params
        log.verbose(`Cloned node_params`, { node_params: newNode.node_params });
        newNode.successors = new Map(this.successors);
        log.verbose(`Cloned successors`, { successors: newNode.successors });
        log.verbose(`clone finished`);
        return newNode;
    }

    abstract _clone(): BaseNode;

    public addSuccessor(newSuccessor: BaseNode, action: string = DEFAULT_ACTION): void {
        log.verbose(`addSuccessor called with action: ${action}`);
        if (this.successors.has(action)) {
            log.error(`Action ${action} already exists`);
            throw new Error(`Action ${action} already exists`);
        }

        
        this.successors.set(action, newSuccessor);
        log.debug(`addSuccessor finished. Successors`, { successors: this.successors });
    }

    public getSuccessor(name: string): BaseNode | undefined {
        log.debug(`getSuccessor called with name: ${name}`);
        if (!this.successors.has(name)) {
            log.error(`Successor ${name} not found`);
            return undefined;
        }

        // This is important for parallel execution to not have race conditions
        const successor = this.successors.get(name)!.clone();
        log.debug(`getSuccessor finished. Returning successor`, { successor });
        return successor;
    }
    
  abstract prep(sharedState: any, node_params?: any): Promise<any>;

  /**
   * We allow you to implement custom wrappers over any core execution logic
   * 
   * Exec handler logic - this could be higher level retry and 
   * robustness logic that could be used across many node types
   * @param prepResult 
   * @returns 
   */
  public async execWrapper(prepResult: any, node_params?: any): Promise<any> {
      log.debug(`execWrapper called with prepResult`, { prepResult });
      
      // Add verbose logging of the input parameters
      log.verbose('execWrapper input', JSON.stringify({
        prepResult,
        node_params
      }));
      
      const result = await this.execCore(prepResult, node_params);
      
      log.debug(`execWrapper finished. Result`, { result });
      
      // Add verbose logging of the result
      log.verbose('execWrapper result', JSON.stringify(result));
      
      return result;
  }

  /**
   * This is the primary execution step of a node and is typically 
   * the core component of a node implementation
   * @param prepResult 
   */
  abstract execCore(prepResult: any, node_params?: any): Promise<any>;

  abstract post(prepResult: any, execResult: any, sharedState: any, node_params?: any): Promise<string>;

    /**
     * Core run logic should not change from node to node implementation.
     * Returns an object containing the action to take next, and the results
     * from the prep and execution phases for potential snapshotting.
     * @param sharedState Contextual state that is shared across nodes
     */
  public async run(sharedState: any): Promise<{ action: string, prepResult: any, execResult: any }> {
    log.debug(`run called with sharedState`, { sharedState });
    log.debug(`Current flow_params at start of run`, { flow_params: this.flow_params });
    
    // Add verbose logging of the input parameters
    log.verbose('run input', JSON.stringify({
      sharedState,
      flow_params: this.flow_params,
      node_params: this.node_params
    }));
    
    const prepResult = await this.prep(sharedState, this.node_params); // Pass node_params to prep
    
    // Add verbose logging of the prep result
    log.verbose('run prepResult', JSON.stringify(prepResult));
    
    const execResult = await this.execWrapper(prepResult, this.node_params); // Pass node_params to execWrapper
    
    // Add verbose logging of the exec result
    log.verbose('run execResult', JSON.stringify(execResult));
    
    const action = await this.post(prepResult, execResult, sharedState, this.node_params); // Pass node_params to post
    
    log.debug(`action`, { action });
    log.debug(`run finished. Returning action: ${action}`);
    
    // Add verbose logging of the final action
    log.verbose('run action result', JSON.stringify({ action, prepResult, execResult }));

    return { action, prepResult, execResult };
  }
}

export abstract class RetryNode extends BaseNode {
    protected maxRetries: number;
    protected intervalMs: number;

    constructor(maxRetries: number, intervalMs: number) {
        log.debug(`RetryNode constructor called with maxRetries: ${maxRetries}, intervalMs: ${intervalMs}`);
        super();
        this.maxRetries = maxRetries;
        this.intervalMs = intervalMs;
    }

  public async execWrapper(prepResult: any, node_params?: any): Promise<any> {
    log.debug(`execWrapper called with prepResult`, { prepResult });
    
    // Add verbose logging of the input parameters
    log.verbose('RetryNode execWrapper input', JSON.stringify({
      prepResult,
      node_params,
      maxRetries: this.maxRetries,
      intervalMs: this.intervalMs
    }));
    
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        const result = await this.execCore(prepResult, node_params);
        log.debug(`execWrapper finished successfully. Result`, { result });
        
        // Add verbose logging of the successful result
        log.verbose('RetryNode execWrapper success result', JSON.stringify(result));
        
        return result;
      } catch (error) {
        log.warn(`Retry attempt ${i+1} failed`, { error });
        
        // Add verbose logging of the retry attempt
        log.verbose('RetryNode execWrapper retry attempt', JSON.stringify({
          attempt: i + 1,
          maxRetries: this.maxRetries,
          error: error instanceof Error ? error.message : String(error)
        }));
        
        await new Promise(resolve => setTimeout(resolve, this.intervalMs));
      }
    }

    log.error(`Max retries reached after ${this.maxRetries} attempts`);
    
    // Add verbose logging of the max retries error
    log.verbose('RetryNode execWrapper max retries reached', JSON.stringify({
      maxRetries: this.maxRetries
    }));
    
    throw new Error("Max retries reached after " + this.maxRetries + " attempts");
  }
}

export class Flow extends BaseNode {
    private start: BaseNode;

    constructor(start: BaseNode) {
        log.debug(`Flow constructor called with start`, { start });
        super();
        this.start = start;
    }

    public _clone(): BaseNode {
        log.debug(`Flow _clone called`);
        // NOTE: I don't think we need to clone the start node here
        // We copy on ready any way during execution
        const newFlow = new Flow(this.start);
        log.debug(`Flow _clone finished. Returning`, { newFlow });
        return newFlow;
    }

    async getStartNode(): Promise<BaseNode> {
        log.debug(`getStartNode called`);
        // This is important for parallel execution to not have race conditions
        const clonedStart = this.start.clone();
        log.debug(`getStartNode finished. Returning`, { clonedStart });
        return clonedStart;
    }

  async execCore(prepResult: any): Promise<any> {
    log.error(`Flow node does not support direct execution`);
    
    // Add verbose logging of the error
    log.verbose('Flow execCore error', JSON.stringify({
      error: "Flow node does not support direct execution"
    }));
    
    throw new Error("Flow node does not support direct execution");
  }

  async prep(sharedState: any, node_params?: any): Promise<any> {
    log.debug(`Flow prep called with sharedState`, { sharedState });
    
    // Add verbose logging of the input parameters
    log.verbose('Flow prep input', JSON.stringify({
      sharedState,
      node_params
    }));
    
    log.debug(`Flow prep finished. Returning empty object`);
    
    // Add verbose logging of the result
    log.verbose('Flow prep result', JSON.stringify({}));
    
    return {}; // Pass through the shared state to exec_core
  }

  async orchestrate(sharedState: any, flowParams?: any, nodeParams?: any): Promise<any> {
    log.debug(`orchestrate called with sharedState and flowParams`, { sharedState, flowParams });
    
    // Add verbose logging of the input parameters
    log.verbose('orchestrate input', JSON.stringify({
      sharedState,
      flowParams,
      nodeParams
    }));
    
    // Check if we're resuming from a specific node
    let currentNode: BaseNode | undefined;
    
    if (sharedState.currentNodeId) {
      log.info(`Resuming from node ${sharedState.currentNodeId}`);
      
      // Start from the beginning and find the current node
      const startNode = await this.getStartNode();
      
      // Simple BFS to find the node by ID
      const queue: BaseNode[] = [startNode];
      const visited = new Set<string>();
      
      while (queue.length > 0 && !currentNode) {
        const node = queue.shift()!;
        const nodeId = node.node_params?.id;
        
        if (nodeId === sharedState.currentNodeId) {
          currentNode = node;
          log.info(`Found current node ${nodeId}`);
          break;
        }
        
        // Add successors to the queue
        if (node.successors instanceof Map) {
          for (const successor of node.successors.values()) {
            const successorId = successor.node_params?.id;
            if (successorId && !visited.has(successorId)) {
              visited.add(successorId);
              queue.push(successor);
            }
          }
        }
      }
      
      if (!currentNode) {
        log.warn(`Could not find node with ID ${sharedState.currentNodeId}, starting from beginning`);
        currentNode = await this.getStartNode();
      }
    } else {
      // Start from the beginning
      currentNode = await this.getStartNode();
    }
    
    while (currentNode) {
      log.debug("Orchestrate -- currentNode", { currentNode });

      // Use nodeParams if available, otherwise fallback to flowParams or this.flow_params
      const paramsToSet = nodeParams && nodeParams[currentNode.flow_params.id]
        ? nodeParams[currentNode.flow_params.id]
        : (flowParams ? flowParams : this.flow_params);

      log.debug(`Setting params for currentNode`, {
        currentNode,
        params: paramsToSet
      });
      
      // Add verbose logging of the node parameters
      log.verbose('orchestrate node params', JSON.stringify({
        nodeId: currentNode.node_params?.id,
        nodeType: currentNode.node_params?.type,
        params: paramsToSet
      }));

      // Pass both flowParams (as general params) and node-specific params
      currentNode.setParams(paramsToSet, nodeParams ? nodeParams[currentNode.flow_params.id] : undefined);
      log.debug(`Params set for currentNode. Current flow_params`, { flow_params: currentNode.flow_params });

      // Get the result object from run()
      const runResult = await currentNode.run(sharedState);
      const action = runResult.action; // Extract the action string
      // prepResult and execResult are available in runResult if needed here, but currently not used by orchestrate directly
      log.debug(`currentNode.run finished. Action: ${action}`);

      // Check if we should stay on the current node using the extracted action
      if (action === STAY_ON_NODE_ACTION) {
        log.info(`Staying on node ${currentNode.node_params?.id}`);
        
        // Store the current node ID in shared state
        sharedState.currentNodeId = currentNode.node_params?.id;
        
        // Return early without moving to the next node
        log.debug(`orchestrate paused at node ${currentNode.node_params?.id}`);
        return;
      }
      
      // Move to the next node
      currentNode = currentNode.getSuccessor(action); // If undefined, the flow is complete
      log.debug(`Next currentNode`, { currentNode });
    }
    
    // Flow completed
    log.debug(`orchestrate finished - flow completed`);
    
    // Clear the current node ID since the flow is complete
    sharedState.currentNodeId = undefined;
  }

  // Update return type to match BaseNode
  async run(sharedState: any): Promise<{ action: string, prepResult: any, execResult: any }> {
    log.debug(`Flow run called with sharedState`, { sharedState });

    // Add verbose logging of the input parameters
    log.verbose('Flow run input', JSON.stringify({
      sharedState
    }));
    
    const prepResult = await this.prep(sharedState);
    log.debug(`Flow prepResult`, { prepResult });
    
    // Add verbose logging of the prep result
    log.verbose('Flow run prepResult', JSON.stringify(prepResult));

    await this.orchestrate(sharedState, this.flow_params, this.flow_params.nodeParams);

    // No execution result to return for a flow
    const postResult = await this.post(prepResult, undefined, sharedState);
    log.debug(`Flow postResult`, { postResult });
    
    // Add verbose logging of the post result
    log.verbose('Flow run postResult', JSON.stringify({ postResult, prepResult }));

    log.debug(`Flow run finished`);
    // Return the action from post, the prepResult, and undefined for execResult
    return { action: postResult, prepResult, execResult: undefined };
  }

  async post(prepResult: any, execResult: any, sharedState: any, node_params?: any): Promise<string> {
    log.debug(`Flow post called with prepResult, execResult, and sharedState`, { prepResult, execResult, sharedState });
    
    // Add verbose logging of the input parameters
    log.verbose('Flow post input', JSON.stringify({
      prepResult,
      execResult,
      node_params
    }));
    
    log.debug(`Flow post finished. Returning DEFAULT_ACTION`);
    
    // Add verbose logging of the result
    log.verbose('Flow post result', JSON.stringify({ action: DEFAULT_ACTION }));
    
    return DEFAULT_ACTION;
  }
}

export class BatchFlow extends Flow {
    async prep(sharedState: any, node_params?: any): Promise<any[]> {
        log.debug("BatchFlow -- prep", { sharedState });
        
        // Add verbose logging of the input parameters
        log.verbose('BatchFlow prep input', JSON.stringify({
          sharedState,
          node_params
        }));
        
        // Add verbose logging of the result
        log.verbose('BatchFlow prep result', JSON.stringify([]));
        
        return [];
    }

    // Update return type to match BaseNode
    async run(sharedState: any): Promise<{ action: string, prepResult: any, execResult: any }> {
        log.debug("BatchFlow -- run");

        // Add verbose logging of the input parameters
        log.verbose('BatchFlow run input', JSON.stringify({
          sharedState
        }));
        
        const prepResultList = await this.prep(sharedState);
        
        // Add verbose logging of the prep result list
        log.verbose('BatchFlow run prepResultList', JSON.stringify(prepResultList));

        const resultPromises = [];
        for (const prepResult of prepResultList) {
            const result = await this.orchestrate(sharedState, prepResult, this.flow_params.nodeParams);
            resultPromises.push(result);
        }
        const resultList = await Promise.all(resultPromises);
        
        // Add verbose logging of the result list
        log.verbose('BatchFlow run resultList', JSON.stringify(resultList));

        const action = await this.post(prepResultList, resultList, sharedState);
        // Return the action from post, the prepResult list, and the result list
        return { action, prepResult: prepResultList, execResult: resultList };
    }

    async post(prepResultList: any[], resultList: any[], sharedState: any, node_params?: any): Promise<string> {
        log.debug(`Processed ${resultList.length} items from ${prepResultList.length} prep results`);
        
        // Add verbose logging of the input parameters
        log.verbose('BatchFlow post input', JSON.stringify({
          prepResultListLength: prepResultList.length,
          resultListLength: resultList.length,
          node_params
        }));
        
        // Add verbose logging of the result
        log.verbose('BatchFlow post result', JSON.stringify({ action: DEFAULT_ACTION }));
        
        return DEFAULT_ACTION;
    }
}
