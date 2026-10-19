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
import {BLOCKCRAFT_BUILTIN_AGENT_EXTENSION} from '../core/builtin-block-capabilities'
import {DocumentAgentExtensionRegistry} from '../core/host-extension'
import {captureDocumentAgentManifestOptions} from './document-agent-capability-scope'
import {createDocumentAgentContextOutlinePage} from './document-agent-context-projection'

export class DocumentAgentToolExecutor {
  private activeContext: DocumentAgentContext | null

  constructor(
    private readonly doc: BlockCraftDoc,
    initialContext: DocumentAgentContext | null = null,
    private readonly extensions = new DocumentAgentExtensionRegistry([
      BLOCKCRAFT_BUILTIN_AGENT_EXTENSION,
    ]),
  ) {
    this.activeContext = initialContext
  }

  execute(
    call: DocumentAgentToolCall,
    options: {allowWrite?: boolean} = {},
  ): DocumentAgentToolHostResult {
    try {
      if (call.name === 'blockcraft.get_document_context') {
        const context = this.captureContext('document')
        const page = readDocumentContextPageArguments(call.arguments)
        return {
          ok: true,
          tool: call.name,
          data: context && page
            ? createDocumentAgentContextOutlinePage(context, {
              ...page,
              maxChars: 10_000,
              previewCharsPerBlock: 320,
              includeCapabilities: false,
            })
            : context,
        }
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
            capabilities: captureBlockCraftAgentSchemaCapabilities(this.doc, this.extensions),
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

      if (call.name === 'blockcraft.get_capability_directory') {
        return {
          ok: true,
          tool: call.name,
          data: this.extensions.getCapabilityDirectory(this.manifestOptions()),
        }
      }

      if (call.name === 'blockcraft.get_capability') {
        const capabilityId = readStringArgument(call.arguments, 'capabilityId')
        if (!capabilityId) {
          return {ok: false, tool: call.name, error: '工具参数缺少 capabilityId。'}
        }
        const capability = this.extensions.getCapability(capabilityId, this.manifestOptions())
        if (!capability) {
          return {ok: false, tool: call.name, error: `Capability ${capabilityId} 不存在或当前宿主未启用。`}
        }
        return {ok: true, tool: call.name, data: capability}
      }

      if (call.name === 'blockcraft.delegate') {
        return {
          ok: false,
          tool: call.name,
          error: 'blockcraft.delegate 只能由 BlockCraftEditorAgent 的 Master 循环执行。',
        }
      }

      if (call.name === 'blockcraft.search_document') {
        return {ok: true, tool: call.name, data: this.search(call.arguments)}
      }

      const payload = asToolOperationPayload(call.arguments)
      if (!payload) {
        return {ok: false, tool: call.name, error: '工具参数缺少 operations 数组。'}
      }

      const context = this.activeContext ?? this.captureContext('document')
      if (!context) {
        return {ok: false, tool: call.name, error: '文档尚未初始化，无法执行 Agent 操作。'}
      }

      const result: DocumentAgentResult = {
        summary: payload.summary ?? 'Agent 修改建议',
        operations: payload.operations,
      }
      const applier = new DocumentAgentOperationApplier(this.doc, this.extensions)
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
      this.activeContext = captureBlockCraftAgentContext(this.doc, {
        scope: 'document',
        extensions: this.extensions,
      })
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

  private captureContext(scope: DocumentAgentContext['scope'] = 'document'): DocumentAgentContext | null {
    this.activeContext = captureBlockCraftAgentContext(this.doc, {
      scope,
      extensions: this.extensions,
    })
    return this.activeContext
  }

  private manifestOptions() {
    return captureDocumentAgentManifestOptions(this.doc)
  }

  private search(argumentsValue: unknown): {query: string; matches: unknown[]} {
    const args = argumentsValue && typeof argumentsValue === 'object'
      ? argumentsValue as Record<string, unknown>
      : {}
    const query = typeof args['query'] === 'string' ? args['query'].trim() : ''
    if (!query) return {query: '', matches: []}

    const maxResults = typeof args['maxResults'] === 'number'
      ? Math.min(50, Math.max(1, Math.floor(args['maxResults'])))
      : 20
    const needle = query.toLocaleLowerCase()
    const matches = []
    const visited = new Set<string>()
    const pending = [this.doc.rootId]
    while (pending.length && matches.length < maxResults) {
      const blockId = pending.pop()!
      if (visited.has(blockId) || !this.doc.model.exists(blockId)) continue
      visited.add(blockId)
      const text = blockText(this.doc.model.getTextDeltas(blockId))
      const index = text.toLocaleLowerCase().indexOf(needle)
      if (index >= 0) {
        matches.push({
          blockId,
          flavour: this.doc.model.getFlavour(blockId) ?? 'unknown',
          index,
          excerpt: text.slice(Math.max(0, index - 80), index + query.length + 120),
        })
      }
      const childIds = this.doc.model.getChildrenIds(blockId)
      for (let childIndex = childIds.length - 1; childIndex >= 0; childIndex--) {
        pending.push(childIds[childIndex])
      }
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
      nodeType: String(this.doc.model.getNodeType(blockId) ?? 'unknown'),
      parentId: this.doc.model.getParentId(blockId),
      index: this.doc.model.indexInParent(blockId),
      childIds: this.doc.model.getChildrenIds(blockId),
      props: this.doc.model.getProps(blockId) ?? {},
      text: this.doc.model.getTextDeltas(blockId) === undefined
        ? undefined
        : {
            plain: blockText(this.doc.model.getTextDeltas(blockId)),
            delta: this.doc.model.getTextDeltas(blockId) ?? [],
          },
      readonly: this.doc.isBlockReadonly(blockId),
      snapshot: this.doc.model.toSnapshot(blockId),
    }
  }
}

function readDocumentContextPageArguments(
  argumentsValue: unknown,
): {offset: number; maxBlocks: number} | null {
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    return null
  }
  const args = argumentsValue as Record<string, unknown>
  if (args['offset'] === undefined && args['maxBlocks'] === undefined) return null

  const offset = args['offset'] ?? 0
  const maxBlocks = args['maxBlocks'] ?? 40
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw new Error('offset 必须是非负整数。')
  }
  if (typeof maxBlocks !== 'number' || !Number.isInteger(maxBlocks) ||
      maxBlocks < 1 || maxBlocks > 50) {
    throw new Error('maxBlocks 必须是 1..50 的整数。')
  }
  return {offset, maxBlocks}
}

function readStringArgument(argumentsValue: unknown, key: string): string {
  if (!argumentsValue || typeof argumentsValue !== 'object') return ''
  const value = (argumentsValue as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
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
