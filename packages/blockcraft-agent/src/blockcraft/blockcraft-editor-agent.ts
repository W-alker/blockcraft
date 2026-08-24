import type {BlockCraftDoc} from '@ccc/blockcraft'
import type {
  DocumentAgentContext,
  DocumentAgentRequest,
  DocumentAgentResult,
} from '../core/agent.types'
import type {
  DocumentAgentToolCall,
  DocumentAgentToolHostResult,
} from '../core/agent-tools'
import {DocumentAgentRunner} from '../core/document-agent-runner'
import {captureBlockCraftAgentContext} from './blockcraft-context-adapter'
import {DocumentAgentToolExecutor} from './document-agent-tool-executor'

/**
 * Host-facing facade for the BlockCraft Editor Agent.
 *
 * It keeps model inference, live editor reads and guarded editor tools in one
 * boundary. The model never receives the editor instance and cannot mutate
 * BlockCraft without going through the tool executor and host confirmation.
 */
export class BlockCraftEditorAgent {
  readonly tools: DocumentAgentToolExecutor

  constructor(
    private readonly doc: BlockCraftDoc,
    private readonly runner: DocumentAgentRunner,
  ) {
    this.tools = new DocumentAgentToolExecutor(doc)
  }

  getContext(scope?: DocumentAgentContext['scope']): DocumentAgentContext | null {
    return captureBlockCraftAgentContext(this.doc, scope ? {scope} : {})
  }

  async run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult> {
    const context = this.getContext(request.context.scope)
    if (!context) throw new Error('BlockCraft 文档尚未初始化。')
    return this.runner.run({...request, context}, options)
  }

  executeTool(
    call: DocumentAgentToolCall,
    options: {allowWrite?: boolean} = {},
    context?: DocumentAgentContext | null,
  ): DocumentAgentToolHostResult {
    if (!context) return this.tools.execute(call, options)
    return new DocumentAgentToolExecutor(this.doc, context).execute(call, options)
  }
}
