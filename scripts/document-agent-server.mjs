#!/usr/bin/env node

import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import http from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {
  createDocumentAgentSystemPrompt,
  DOCUMENT_AGENT_PROMPT_VERSION,
} from './document-agent-prompt.mjs'

const port = Number(process.env['DOCUMENT_AGENT_PORT'] ?? 8787)
const model = process.env['OPENAI_CODEX_MODEL'] ?? 'gpt-5-codex'
const apiKey = process.env['OPENAI_API_KEY']
const provider = process.env['DOCUMENT_AGENT_PROVIDER'] ?? (apiKey ? 'openai' : 'codex-cli')
const codexCliModel = process.env['CODEX_CLI_MODEL']
const allowPromptOverride = process.env['DOCUMENT_AGENT_ALLOW_PROMPT_OVERRIDE'] === 'true'
const maxBodyBytes = 2 * 1024 * 1024
const sessionTtlMs = 2 * 60 * 60 * 1000
const maxSessionCount = 100
const maxSessionTurns = 6
const maxSessionMemoryChars = 8_000
const maxToolHistoryItems = 24
const maxToolHistoryChars = 64_000
const sessions = new Map()

const resultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: {type: 'string'},
    draft: {type: ['string', 'null']},
    operations: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: {type: 'string', enum: ['replace-text']},
              blockId: {type: 'string'},
              from: {type: 'integer', minimum: 0},
              to: {type: 'integer', minimum: 0},
              replacement: {type: 'string'},
            },
            required: ['kind', 'blockId', 'from', 'to', 'replacement'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: {type: 'string', enum: ['update-block-props']},
              blockId: {type: 'string'},
              props: {type: 'string'},
            },
            required: ['kind', 'blockId', 'props'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: {type: 'string', enum: ['create-blocks']},
              parentId: {type: 'string'},
              index: {type: 'integer', minimum: 0},
              flavour: {type: 'string'},
              params: {type: 'string'},
              clientRef: {type: ['string', 'null'], pattern: '^[A-Za-z][A-Za-z0-9._-]{0,63}$'},
            },
            required: ['kind', 'parentId', 'index', 'flavour', 'params', 'clientRef'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: {type: 'string', enum: ['replace-block']},
              blockId: {type: 'string'},
              flavour: {type: 'string'},
              params: {type: 'string'},
              clientRef: {type: ['string', 'null'], pattern: '^[A-Za-z][A-Za-z0-9._-]{0,63}$'},
            },
            required: ['kind', 'blockId', 'flavour', 'params', 'clientRef'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: {type: 'string', enum: ['apply-text-delta']},
              blockId: {type: 'string'},
              delta: {type: 'string'},
            },
            required: ['kind', 'blockId', 'delta'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: {type: 'string', enum: ['delete-blocks']},
              parentId: {type: 'string'},
              index: {type: 'integer', minimum: 0},
              count: {type: 'integer', minimum: 1},
            },
            required: ['kind', 'parentId', 'index', 'count'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: {type: 'string', enum: ['move-blocks']},
              parentId: {type: 'string'},
              index: {type: 'integer', minimum: 0},
              count: {type: 'integer', minimum: 1},
              targetId: {type: 'string'},
              targetIndex: {type: 'integer', minimum: 0},
            },
            required: ['kind', 'parentId', 'index', 'count', 'targetId', 'targetIndex'],
          },
        ],
      },
    },
  },
  required: ['summary', 'draft', 'operations'],
}

const turnSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: {type: 'string', enum: ['result', 'tool-calls']},
    result: {anyOf: [resultSchema, {type: 'null'}]},
    calls: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: {type: 'string', minLength: 1, maxLength: 128},
          name: {type: 'string', minLength: 1, maxLength: 256},
          arguments: {type: 'string', maxLength: 50_000},
        },
        required: ['id', 'name', 'arguments'],
      },
    },
  },
  required: ['kind', 'result', 'calls'],
}

const specialistNames = [
  'document-analysis',
  'content-writing',
  'structure-planning',
  'visual-reconstruction',
  'host-workflow',
  'quality-review',
]

const subAgentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    specialist: {type: 'string', enum: specialistNames},
    summary: {type: 'string'},
    findings: {type: 'array', maxItems: 20, items: {type: 'string'}},
    recommendations: {type: 'array', maxItems: 20, items: {type: 'string'}},
    draft: {type: ['string', 'null']},
    operations: resultSchema.properties.operations,
  },
  required: ['specialist', 'summary', 'findings', 'recommendations', 'draft', 'operations'],
}

assertStrictOutputSchema(resultSchema, 'resultSchema')
assertStrictOutputSchema(turnSchema, 'turnSchema')
assertStrictOutputSchema(subAgentSchema, 'subAgentSchema')

function assertStrictOutputSchema(schema, path, visited = new Set()) {
  if (!schema || typeof schema !== 'object' || visited.has(schema)) return
  visited.add(schema)
  if (schema.type === 'object' && schema.additionalProperties === false) {
    const propertyNames = Object.keys(schema.properties ?? {})
    const required = new Set(schema.required ?? [])
    const missing = propertyNames.filter(name => !required.has(name))
    if (missing.length) {
      throw new Error(`${path} strict output schema is missing required keys: ${missing.join(', ')}`)
    }
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties') {
      for (const [name, propertySchema] of Object.entries(value ?? {})) {
        assertStrictOutputSchema(propertySchema, `${path}.properties.${name}`, visited)
      }
      continue
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        assertStrictOutputSchema(item, `${path}.${key}[${index}]`, visited))
    } else {
      assertStrictOutputSchema(value, `${path}.${key}`, visited)
    }
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  response.end(JSON.stringify(payload))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', chunk => {
      size += chunk.length
      if (size > maxBodyBytes) {
        reject(new Error('请求上下文过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('请求不是有效 JSON'))
      }
    })
    request.on('error', reject)
  })
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  for (const item of payload?.output ?? []) {
    if (item?.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text
      }
    }
  }
  return null
}

function normalizeAgentResult(result) {
  if (!result || !Array.isArray(result.operations)) return result
  const normalized = {
    ...result,
    operations: result.operations.map(operation => {
      if (!operation || typeof operation !== 'object') return operation
      if (operation.kind === 'update-block-props') {
        return {...operation, props: parseJsonField(operation.props, 'props')}
      }
      if (operation.kind === 'apply-text-delta') {
        return {...operation, delta: parseJsonField(operation.delta, 'delta')}
      }
      if (operation.kind === 'create-blocks') {
        const normalized = {...operation, params: parseJsonField(operation.params, 'params')}
        if (normalized.clientRef === null) delete normalized.clientRef
        return normalized
      }
      if (operation.kind === 'replace-block') {
        const normalized = {...operation, params: parseJsonField(operation.params, 'params')}
        if (normalized.clientRef === null) delete normalized.clientRef
        return normalized
      }
      return operation
    }),
  }
  if (normalized.draft === null) delete normalized.draft
  return normalized
}

function normalizeAgentTurn(turn) {
  if (turn?.kind === 'result' && turn.result && turn.calls?.length === 0) {
    return {kind: 'result', result: normalizeAgentResult(turn.result)}
  }
  if (turn?.kind === 'tool-calls' && turn.result === null && Array.isArray(turn.calls) && turn.calls.length) {
    return {
      kind: 'tool-calls',
      calls: turn.calls.map(call => ({
        ...call,
        arguments: parseJsonField(call.arguments, `tool ${call.name || 'unknown'} arguments`),
      })),
    }
  }
  throw new Error('Agent 返回的 Master 回合类型无效')
}

function normalizeSubAgentResult(result, delegation) {
  if (!result || result.specialist !== delegation.specialist) {
    throw new Error('Agent 返回的 specialist 与委派请求不一致')
  }
  const normalized = normalizeAgentResult(result)
  return {
    ...normalized,
    specialist: result.specialist,
    findings: result.findings,
    recommendations: result.recommendations,
  }
}

function parseJsonField(value, fieldName) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error('Agent 返回的 ' + fieldName + ' 不是有效 JSON')
  }
}

function truncateText(value, maxChars) {
  if (typeof value !== 'string') return ''
  return value.length <= maxChars ? value : value.slice(0, maxChars) + '…'
}

function normalizeSessionId(value) {
  if (typeof value !== 'string') return null
  const sessionId = value.trim()
  if (!sessionId || sessionId.length > 128) return null
  return sessionId
}

function pruneSessions(now = Date.now()) {
  for (const [sessionId, session] of sessions) {
    if (now - session.lastUsedAt > sessionTtlMs) sessions.delete(sessionId)
  }

  while (sessions.size > maxSessionCount) {
    let oldestId = null
    let oldestTime = Infinity
    for (const [sessionId, session] of sessions) {
      if (session.lastUsedAt < oldestTime) {
        oldestId = sessionId
        oldestTime = session.lastUsedAt
      }
    }
    if (!oldestId) break
    sessions.delete(oldestId)
  }
}

function getSession(sessionId) {
  const normalizedId = normalizeSessionId(sessionId)
  if (!normalizedId) return null

  const now = Date.now()
  pruneSessions(now)
  let session = sessions.get(normalizedId)
  if (!session) {
    session = {lastUsedAt: now, turns: []}
    sessions.set(normalizedId, session)
  } else {
    session.lastUsedAt = now
  }
  pruneSessions(now)
  return session
}

function compactOperation(operation) {
  if (!operation || typeof operation !== 'object') return {kind: 'unknown'}

  const compact = {kind: operation.kind}
  for (const field of ['blockId', 'parentId', 'index', 'count', 'flavour', 'targetId', 'targetIndex', 'from', 'to']) {
    if (operation[field] !== undefined) compact[field] = operation[field]
  }
  if (operation.kind === 'replace-text') {
    compact.replacementLength = typeof operation.replacement === 'string'
      ? operation.replacement.length
      : 0
  }
  if (operation.kind === 'update-block-props') {
    compact.propKeys = operation.props && typeof operation.props === 'object'
      ? Object.keys(operation.props).slice(0, 20)
      : []
  }
  if (operation.kind === 'apply-text-delta') compact.deltaCount = operation.delta?.length ?? 0
  if (operation.kind === 'create-blocks' || operation.kind === 'replace-block') {
    compact.paramsCount = operation.params?.length ?? 0
  }
  return compact
}

function getSessionMemory(session) {
  if (!session?.turns.length) return null

  const turns = session.turns.slice(-maxSessionTurns)
  while (turns.length > 1 && JSON.stringify(turns).length > maxSessionMemoryChars) {
    turns.shift()
  }
  return {
    turnCount: session.turns.length,
    previousTurns: turns,
  }
}

function rememberSessionTurn(session, request, result) {
  if (!session || !result || typeof result !== 'object') return
  session.turns = [
    ...session.turns,
    {
      instruction: truncateText(request.instruction, 1_800),
      assistantSummary: truncateText(result.summary, 1_800),
      draft: truncateText(result.draft, 1_200) || undefined,
      operations: Array.isArray(result.operations)
        ? result.operations.slice(0, 8).map(compactOperation)
        : [],
    },
  ].slice(-maxSessionTurns)
  session.lastUsedAt = Date.now()
}

function createAgentPayload(request, session, orchestration) {
  const sessionMemory = getSessionMemory(session)
  return {
    task: request.task,
    instruction: request.instruction,
    context: request.context,
    runtime: request.runtime,
    ...(sessionMemory ? {
      sessionMemory: {
        note: 'Bounded reference-only memory from earlier turns. The current context and instruction are authoritative; do not assume old operations were applied.',
        ...sessionMemory,
      },
    } : {}),
    attachments: (request.attachments ?? []).map(({dataUrl: _dataUrl, ...attachment}) => attachment),
    ...(orchestration ? {
      orchestration: {
        version: orchestration.orchestrationVersion,
        step: orchestration.step,
        toolHistory: orchestration.toolHistory,
      },
    } : {}),
    editorAgentContract: [
      'Validated operations include replace-text, update-block-props, create-blocks, replace-block, apply-text-delta, delete-blocks, and move-blocks. Raw Snapshot insertion is not an Agent operation.',
      'Operation coordinates are sequential. create-blocks/replace-block may bind clientRef. Use $ref:<clientRef> only as create-blocks.parentId for nested content or move-blocks.targetId for existing content; do not replace, delete, or move a newly created block.',
      'Editable text.delta is authoritative. An Inline Embed object insert consumes one offset and must contain exactly one non-empty key with a primitive value. Generate it only when blockcraft.get_capability exposes the installed same-key inline-embed capability with an insert schema.',
      'For frozen date/time requests use the installed blockcraft.inline-embed.date capability with a date value such as 2026-08-28T12:00 and an allowed format; never use mention. If date insertion is unavailable, insert plain text and add a following space before existing text.',
      'Retain attributes are only for canonical text formatting. Change Embed semantics by delete:1 plus a schema-valid replacement insert; understanding-only prevents generation but does not make ordinary range deletion illegal.',
      'An empty paragraph or list item is still a valid structural target. Use delete-blocks with its actual parentId, index, and count.',
      'Never claim that an empty block cannot be safely changed merely because it has no text.',
      'For Mermaid preview-only mode use update-block-props on the existing mermaid block with props {"mode":"graph"}; never manipulate DOM or data-mode.',
    ],
  }
}

function parseOrchestration(body) {
  if (body?.orchestrationVersion === undefined) return null
  if (body.orchestrationVersion !== 1) {
    throw new Error(`不支持的 Master Agent 协议版本：${body.orchestrationVersion}`)
  }
  if (!body.request || typeof body.request !== 'object' || Array.isArray(body.request)) {
    throw new Error('Master Agent 请求缺少 request。')
  }
  if (!Number.isInteger(body.step) || body.step < 0 || body.step > 11) {
    throw new Error('Master Agent step 无效。')
  }
  if (!Array.isArray(body.toolHistory) || body.toolHistory.length > maxToolHistoryItems) {
    throw new Error('Master Agent 工具历史无效或过长。')
  }
  if (JSON.stringify(body.toolHistory).length > maxToolHistoryChars) {
    throw new Error('Master Agent 工具历史过大。')
  }
  return {
    orchestrationVersion: 1,
    step: body.step,
    toolHistory: body.toolHistory,
  }
}

function parseDelegation(body) {
  if (body?.delegationVersion === undefined) return null
  if (body.delegationVersion !== 1) {
    throw new Error(`不支持的 specialist 委派协议版本：${body.delegationVersion}`)
  }
  if (!body.request || typeof body.request !== 'object' || Array.isArray(body.request)) {
    throw new Error('Specialist 委派请求缺少 request。')
  }
  if (!specialistNames.includes(body.specialist)) {
    throw new Error(`不支持的 specialist：${body.specialist}`)
  }
  if (typeof body.objective !== 'string' || !body.objective.trim() || body.objective.length > 2_000) {
    throw new Error('Specialist 委派 objective 无效或过长。')
  }
  if (body.input !== undefined && JSON.stringify(body.input).length > 16_000) {
    throw new Error('Specialist 委派 input 过大。')
  }
  return {
    delegationVersion: 1,
    specialist: body.specialist,
    objective: body.objective.trim(),
    input: body.input,
  }
}

function getSystemPrompt(request) {
  if (allowPromptOverride && typeof request.systemPrompt === 'string' && request.systemPrompt.trim()) {
    return request.systemPrompt
  }
  return createDocumentAgentSystemPrompt(request.task)
}

function getProviderInstructions(request, orchestration) {
  const instructions = [getSystemPrompt(request)]
  if (orchestration) {
    instructions.push(
      'You are the Master Agent in a bounded tool loop. Return one JSON turn envelope matching the supplied schema.',
      'For a final answer return {"kind":"result","result":{...},"calls":[]}. For tool use return {"kind":"tool-calls","result":null,"calls":[...]}.',
      'Return kind "tool-calls" only when a registered BlockCraft or host tool is needed. Each arguments field must be a valid JSON string such as "{}". Use prior orchestration.toolHistory results instead of repeating an answered call.',
      'Built-in callable tools are blockcraft.get_editor_state, blockcraft.get_block, blockcraft.get_document_context, blockcraft.get_schema_capabilities, blockcraft.get_capability_directory, blockcraft.get_capability, blockcraft.delegate, blockcraft.search_document, blockcraft.preview_changes, and blockcraft.apply_changes.',
      'Use blockcraft.delegate selectively for a genuinely useful independent specialist pass. Available specialists are document-analysis, content-writing, structure-planning, visual-reconstruction, host-workflow, and quality-review. Avoid delegation for trivial requests and do not repeat a completed delegation.',
      'Custom tool names are discoverable through runtime.capabilityDirectory and blockcraft.get_capability. Never call an undeclared tool.',
      'Document writes and external writes cannot execute in this loop: their tool result will request user confirmation. Return kind "result" with the proposed structured operations or a concise explanation once enough evidence is available.',
    )
  }
  instructions.push(
    'The transport schema encodes operation props, snapshots, delta, params, and tool arguments as JSON strings. Emit valid JSON strings for those nested values; the host decodes them before validation.',
  )
  return instructions.join('\n\n')
}

const specialistInstructions = {
  'document-analysis': 'Answer document questions, summarize evidence, extract facts, requirements, decisions, risks and unresolved items. Preserve source meaning.',
  'content-writing': 'Draft or revise clear document prose that satisfies the objective, current document voice and supplied constraints.',
  'structure-planning': 'Map content into legal BlockCraft schemas, hierarchy and schema-native candidate operations. Prefer create-blocks and stable IDs.',
  'visual-reconstruction': 'Inspect attached images and infer visual hierarchy, text, geometry and styling. Map them to available BlockCraft blocks such as paragraphs, tables, columns, text boxes, shapes and word art without inventing unavailable APIs.',
  'host-workflow': 'Interpret runtime host context and declared custom capabilities. Propose safe host-aware reads, document changes and confirmation-gated business actions.',
  'quality-review': 'Critically review the supplied draft or operation plan against the user instruction, live context, schema constraints, safety and visual fidelity. Identify concrete corrections.',
}

function getSubAgentInstructions(request, delegation) {
  return [
    getSystemPrompt(request),
    `You are the read-only ${delegation.specialist} specialist.`,
    specialistInstructions[delegation.specialist],
    'Work independently on the delegated objective. Do not call tools, execute writes, claim changes were applied, or broaden the objective.',
    'Return only the specialist JSON result matching the supplied schema. Candidate operations are advisory and will be checked again by the Master and host.',
    'The transport schema encodes operation props, snapshots, delta, and params as JSON strings. Emit valid JSON strings for those nested values.',
  ].join('\n\n')
}

function createSubAgentPayload(request, session, delegation) {
  return {
    ...createAgentPayload(request, session, null),
    delegation: {
      specialist: delegation.specialist,
      objective: delegation.objective,
      input: delegation.input,
    },
  }
}

async function writeLocalImageAttachments(workingDir, attachments = []) {
  const paths = []
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  for (const [index, attachment] of attachments.slice(0, 4).entries()) {
    const extension = extensions[attachment?.mimeType]
    const match = typeof attachment?.dataUrl === 'string'
      ? attachment.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\r\n]+)$/i)
      : null
    if (!extension || !match || match[1].toLowerCase() !== attachment.mimeType) {
      throw new Error(`图片附件 ${index + 1} 的格式无效。`)
    }
    const data = Buffer.from(match[2], 'base64')
    if (!data.length) throw new Error(`图片附件 ${index + 1} 为空。`)
    const path = join(workingDir, `attachment-${index + 1}.${extension}`)
    await writeFile(path, data)
    paths.push(path)
  }
  return paths
}

function runProcess(command, args, input, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['pipe', 'pipe', 'pipe']})
    const stdout = []
    const stderr = []
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('本地 Codex 请求超时'))
    }, timeoutMs)

    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.on('error', error => {
      clearTimeout(timeout)
      reject(new Error(`无法启动本地 Codex：${error.message}`))
    })
    child.on('close', code => {
      clearTimeout(timeout)
      const stdoutText = Buffer.concat(stdout).toString('utf8')
      const stderrText = Buffer.concat(stderr).toString('utf8')
      if (code !== 0) {
        reject(new Error(extractCodexProcessError(stderrText, stdoutText, code)))
        return
      }
      resolve({stdout: stdoutText, stderr: stderrText})
    })

    child.stdin.end(input)
  })
}

function extractCodexProcessError(stderr, stdout, exitCode) {
  const combined = stripAnsi(`${stderr}\n${stdout}`).trim()
  const lastErrorIndex = combined.lastIndexOf('ERROR:')
  const diagnostic = lastErrorIndex >= 0 ? combined.slice(lastErrorIndex) : combined
  const encodedMessages = [...diagnostic.matchAll(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/g)]
  if (encodedMessages.length) {
    const encoded = encodedMessages.at(-1)?.[1] ?? ''
    try {
      return `本地 Codex 请求失败：${JSON.parse(`"${encoded}"`)}`
    } catch {
      return `本地 Codex 请求失败：${encoded}`
    }
  }

  const errorLines = diagnostic
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(?:error|fatal)(?::|\b)/i.test(line))
  if (errorLines.length) {
    return `本地 Codex 请求失败：${errorLines.at(-1)}`
  }
  return `本地 Codex 退出异常（${exitCode ?? 'unknown'}）。请查看本地 Agent 服务日志。`
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}

async function runLocalCodex(request, session, orchestration, delegation) {
  const workingDir = await mkdtemp(join(tmpdir(), 'blockcraft-agent-'))
  try {
    const schemaPath = join(workingDir, 'result.schema.json')
    const outputPath = join(workingDir, 'result.json')
    const outputSchema = delegation ? subAgentSchema : orchestration ? turnSchema : resultSchema
    await writeFile(schemaPath, JSON.stringify(outputSchema), 'utf8')
    const imagePaths = await writeLocalImageAttachments(workingDir, request.attachments)

    const args = [
      'exec',
      '--ephemeral',
      '--sandbox', 'read-only',
      '--skip-git-repo-check',
      '--cd', workingDir,
      '--output-schema', schemaPath,
      '--output-last-message', outputPath,
      '--color', 'never',
      '-',
    ]
    if (codexCliModel) args.splice(1, 0, '--model', codexCliModel)
    if (imagePaths.length) args.splice(args.length - 1, 0, '--image', ...imagePaths)

    const prompt = [
      delegation
        ? getSubAgentInstructions(request, delegation)
        : getProviderInstructions(request, orchestration),
      'Return only a JSON object matching the supplied output schema. Do not edit files or run commands.',
      JSON.stringify({
        ...(delegation
          ? createSubAgentPayload(request, session, delegation)
          : createAgentPayload(request, session, orchestration)),
        imageNote: request.attachments?.length
          ? `${imagePaths.length} image attachment(s) are available to inspect.`
          : undefined,
      }),
    ].join('\n\n')

    await runProcess(process.env['CODEX_CLI_COMMAND'] ?? 'codex', args, prompt)
    let outputText
    try {
      outputText = await readFile(outputPath, 'utf8')
    } catch (error) {
      throw new Error(
        '本地 Codex 未生成结构化结果文件：' +
        (error instanceof Error ? error.message : 'unknown error'),
      )
    }
    try {
      const parsed = JSON.parse(outputText)
      return delegation
        ? normalizeSubAgentResult(parsed, delegation)
        : orchestration
          ? normalizeAgentTurn(parsed)
          : normalizeAgentResult(parsed)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Agent 返回')) throw error
      const preview = outputText.trim().slice(0, 800)
      throw new Error(
        '本地 Codex 返回结果不是有效 JSON' +
        (preview ? '：' + preview : '（结果为空）'),
      )
    }
  } finally {
    await rm(workingDir, {recursive: true, force: true})
  }
}

async function runAgent(request, session, orchestration, delegation) {
  if (provider === 'codex-cli') {
    return runLocalCodex(request, session, orchestration, delegation)
  }

  if (provider !== 'openai') {
    throw new Error(`不支持的 Agent provider：${provider}`)
  }

  if (!apiKey) {
    throw new Error('未配置 OPENAI_API_KEY。请先启动本地 Agent 服务并设置 API Key。')
  }

  const instructions = delegation
    ? getSubAgentInstructions(request, delegation)
    : getProviderInstructions(request, orchestration)
  const attachments = request.attachments ?? []
  const input = [{
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: JSON.stringify(delegation
          ? createSubAgentPayload(request, session, delegation)
          : createAgentPayload(request, session, orchestration)),
      },
      ...attachments.map(attachment => ({
        type: 'input_image',
        image_url: attachment.dataUrl,
        detail: 'auto',
      })),
    ],
  }]

  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: delegation
            ? 'document_agent_specialist_result'
            : orchestration
              ? 'document_agent_turn'
              : 'document_agent_result',
          strict: true,
          schema: delegation ? subAgentSchema : orchestration ? turnSchema : resultSchema,
        },
      },
    }),
  })

  const payload = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    const message = payload?.error?.message ?? `OpenAI 请求失败（HTTP ${upstream.status}）`
    throw new Error(message)
  }

  const outputText = extractOutputText(payload)
  if (!outputText) throw new Error('Codex 没有返回可解析的结构化结果')

  try {
    const parsed = JSON.parse(outputText)
    return delegation
      ? normalizeSubAgentResult(parsed, delegation)
      : orchestration
        ? normalizeAgentTurn(parsed)
        : normalizeAgentResult(parsed)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Agent 返回')) throw error
    throw new Error('Codex 返回结果不是有效 JSON')
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    })
    response.end()
    return
  }

  if (request.method !== 'POST' || request.url !== '/api/document-agent') {
    sendJson(response, 404, {error: 'Not found'})
    return
  }

  try {
    const body = await readJson(request)
    const delegation = parseDelegation(body)
    const orchestration = delegation ? null : parseOrchestration(body)
    const agentRequest = delegation || orchestration ? body.request : body
    const session = getSession(agentRequest.sessionId)
    const output = await runAgent(agentRequest, session, orchestration, delegation)
    if (delegation) {
      sendJson(response, 200, {subAgent: output})
      return
    }
    if (orchestration) {
      if (output.kind === 'result') {
        rememberSessionTurn(session, agentRequest, output.result)
      }
      sendJson(response, 200, {turn: output})
      return
    }
    rememberSessionTurn(session, agentRequest, output)
    sendJson(response, 200, {result: output})
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知 Agent 错误'
    sendJson(response, 500, {error: message})
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[document-agent] listening on http://127.0.0.1:${port}`)
  console.log(`[document-agent] provider: ${provider}`)
  console.log(`[document-agent] model: ${provider === 'codex-cli' ? (codexCliModel ?? 'Codex CLI default') : model}`)
  console.log(`[document-agent] prompt: ${DOCUMENT_AGENT_PROMPT_VERSION}${allowPromptOverride ? ' (override enabled)' : ''}`)
})
