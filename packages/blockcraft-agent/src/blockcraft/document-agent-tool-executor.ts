import type {BlockCraftDoc} from '@ccc/blockcraft'
import {
  captureBlockCraftAgentContext,
  captureBlockCraftAgentSchemaCapabilities,
} from './blockcraft-context-adapter'
import {
  DocumentAgentApplyError,
  DocumentAgentOperationApplier,
} from './document-agent-operation-applier'
import type {
  DocumentAgentContext,
  DocumentAgentResult,
} from '../core/agent.types'
import {
  asToolOperationPayload,
  type DocumentAgentToolCall,
  type DocumentAgentToolHostResult,
} from '../core/agent-tools'

export class DocumentAgentToolExecutor {
  private activeContext: DocumentAgentContext | null

  constructor(
    private readonly doc: BlockCraftDoc,
    initialContext: DocumentAgentContext | null = null,
  ) {
    this.activeContext = initialContext
  }

  execute(
    call: DocumentAgentToolCall,
    options: {allowWrite?: boolean} = {},
  ): DocumentAgentToolHostResult {
    try {
      if (call.name === 'blockcraft.get_document_context') {
        const context = this.captureContext()
        return {ok: true, tool: call.name, data: context}
      }

      if (call.name === 'blockcraft.get_editor_state') {
        if (!this.doc.isInitialized || !this.doc.model.exists(this.doc.rootId)) {
          return {ok: true, tool: call.name, data: null}
        }
        const selection = this.doc.selection.value
        return {
          ok: true,
          tool: call.name,
          data: {
            rootId: this.doc.rootId,
            isReadonly: this.doc.isReadonly,
            selection: selection?.toSelectionJSON() ?? null,
            selectedText: selection ? this.doc.selection.getSelectedText() : '',
            structureRevision: this.doc.model.structureRevision,
            capabilities: captureBlockCraftAgentSchemaCapabilities(this.doc),
          },
        }
      }

      if (call.name === 'blockcraft.get_block') {
        return {ok: true, tool: call.name, data: this.getBlock(call.arguments)}
      }

      if (call.name === 'blockcraft.get_schema_capabilities') {
        const context = this.captureContext()
        return {
          ok: true,
          tool: call.name,
          data: context?.capabilities ?? [],
        }
      }

      if (call.name === 'blockcraft.search_document') {
        return {ok: true, tool: call.name, data: this.search(call.arguments)}
      }

      const payload = asToolOperationPayload(call.arguments)
      if (!payload) {
        return {ok: false, tool: call.name, error: '工具参数缺少 operations 数组。'}
      }

      const context = this.activeContext ?? this.captureContext()
      if (!context) {
        return {ok: false, tool: call.name, error: '文档尚未初始化，无法执行 Agent 操作。'}
      }

      const result: DocumentAgentResult = {
        summary: payload.summary ?? 'Agent 修改建议',
        operations: payload.operations,
      }
      const applier = new DocumentAgentOperationApplier(this.doc)
      applier.validate(context, result)

      if (call.name === 'blockcraft.preview_changes') {
        return {
          ok: true,
          tool: call.name,
          data: {
            requiresConfirmation: true,
            summary: result.summary,
            operations: result.operations,
          },
        }
      }

      if (!options.allowWrite) {
        return {
          ok: true,
          tool: call.name,
          data: {
            requiresConfirmation: true,
            summary: result.summary,
            operations: result.operations,
          },
        }
      }

      const applied = applier.apply(context, result)
      this.activeContext = captureBlockCraftAgentContext(this.doc)
      return {ok: true, tool: call.name, data: applied}
    } catch (error) {
      return {
        ok: false,
        tool: call.name,
        error: error instanceof DocumentAgentApplyError || error instanceof Error
          ? error.message
          : 'Agent 工具执行失败。',
      }
    }
  }

  private captureContext(): DocumentAgentContext | null {
    this.activeContext = captureBlockCraftAgentContext(this.doc)
    return this.activeContext
  }

  private search(argumentsValue: unknown): {query: string; matches: unknown[]} {
    const args = argumentsValue && typeof argumentsValue === 'object'
      ? argumentsValue as Record<string, unknown>
      : {}
    const query = typeof args['query'] === 'string' ? args['query'].trim() : ''
    if (!query) return {query: '', matches: []}

    const context = this.activeContext ?? this.captureContext()
    if (!context) return {query, matches: []}

    const maxResults = typeof args['maxResults'] === 'number'
      ? Math.min(50, Math.max(1, Math.floor(args['maxResults'])))
      : 20
    const needle = query.toLocaleLowerCase()
    const matches = []
    for (const block of context.blocks) {
      const text = blockText(block.textDeltas)
      const index = text.toLocaleLowerCase().indexOf(needle)
      if (index < 0) continue
      matches.push({
        blockId: block.blockId,
        flavour: block.flavour,
        index,
        excerpt: text.slice(Math.max(0, index - 80), index + query.length + 120),
      })
      if (matches.length >= maxResults) break
    }
    return {query, matches}
  }

  private getBlock(argumentsValue: unknown): unknown {
    const args = argumentsValue && typeof argumentsValue === 'object'
      ? argumentsValue as Record<string, unknown>
      : {}
    const blockId = typeof args['blockId'] === 'string' ? args['blockId'] : ''
    if (!blockId) return {error: '缺少 blockId。'}
    if (!this.doc.model.exists(blockId)) return {error: 'Block ' + blockId + ' 不存在。'}

    return {
      blockId,
      flavour: this.doc.model.getFlavour(blockId) ?? 'unknown',
      parentId: this.doc.model.getParentId(blockId),
      index: this.doc.model.indexInParent(blockId),
      childIds: this.doc.model.getChildrenIds(blockId),
      props: this.doc.model.getProps(blockId) ?? {},
      textDeltas: this.doc.model.getTextDeltas(blockId),
      snapshot: this.doc.model.toSnapshot(blockId),
    }
  }
}

function blockText(deltas: readonly unknown[] | undefined): string {
  return (deltas ?? [])
    .map(delta => {
      if (!delta || typeof delta !== 'object') return ''
      const insert = (delta as {insert?: unknown}).insert
      return typeof insert === 'string' ? insert : ''
    })
    .join('')
}
