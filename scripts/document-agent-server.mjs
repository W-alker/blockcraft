#!/usr/bin/env node

import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import http from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {
  createDocumentAgentMarkdownSystemPrompt,
  createDocumentAgentSystemPrompt,
  DOCUMENT_AGENT_PROMPT_VERSION,
} from './document-agent-prompt.mjs'
import {
  getSessionMemory,
  rememberMarkdownSessionTurn,
  rememberSessionTurn,
} from './document-agent-session-memory.mjs'
import {
  normalizeAgentResult,
  normalizeAgentTurn,
  normalizeSubAgentResult,
} from './document-agent-response.mjs'
import {
  createOpenAiTools,
  createProviderCapabilities,
} from './document-agent-provider-capabilities.mjs'

const port = Number(process.env['DOCUMENT_AGENT_PORT'] ?? 8787)
const model = process.env['OPENAI_CODEX_MODEL'] ?? 'gpt-5.6-luna'
const apiKey = process.env['OPENAI_API_KEY']
const provider = process.env['DOCUMENT_AGENT_PROVIDER'] ?? (apiKey ? 'openai' : 'codex-cli')
const codexCliModel = process.env['CODEX_CLI_MODEL']
const allowPromptOverride = process.env['DOCUMENT_AGENT_ALLOW_PROMPT_OVERRIDE'] === 'true'
const webSearchEnabled = process.env['DOCUMENT_AGENT_WEB_SEARCH'] !== 'false'
const maxBodyBytes = 2 * 1024 * 1024
const sessionTtlMs = 2 * 60 * 60 * 1000
const maxSessionCount = 100
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
    review: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            verdict: {type: 'string', enum: ['pass', 'revise']},
            issues: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  severity: {type: 'string', enum: ['error', 'warning']},
                  code: {
                    type: 'string',
                    pattern: '^[a-z][a-z0-9-]{0,63}$',
                  },
                  message: {type: 'string'},
                  operationIndexes: {
                    type: 'array',
                    maxItems: 100,
                    items: {type: 'integer', minimum: 0},
                  },
                  recommendation: {type: ['string', 'null']},
                },
                required: [
                  'severity',
                  'code',
                  'message',
                  'operationIndexes',
                  'recommendation',
                ],
              },
            },
          },
          required: ['verdict', 'issues'],
        },
        {type: 'null'},
      ],
    },
  },
  required: [
    'specialist',
    'summary',
    'findings',
    'recommendations',
    'draft',
    'operations',
    'review',
  ],
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

function startSse(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  })
  response.flushHeaders?.()
}

function sendSse(response, payload) {
  if (response.destroyed || response.writableEnded) return
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
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

function createAgentPayload(request, session, orchestration, options = {}) {
  const sessionMemory = getSessionMemory(session)
  return {
    task: request.task,
    instruction: request.instruction,
    context: request.context,
    runtime: request.runtime,
    providerCapabilities: createProviderCapabilities({
      webSearchEnabled,
      allowTools: options.allowProviderTools !== false,
    }),
    ...(sessionMemory ? {
      sessionMemory: {
        note: 'Bounded conversation memory from earlier turns. Resolve references against the latest compatible turn, then verify delivery state from current context; do not assume old operations were applied.',
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
      'Image attachments are reference material for questions, extraction, summarization and fact checking. Do not reconstruct their visual layout, geometry or styling as a BlockCraft document.',
    ],
  }
}

function createMarkdownPayload(request, session) {
  const sessionMemory = getSessionMemory(session)
  return {
    mode: 'markdown-chat',
    instruction: request.instruction,
    context: request.context,
    runtime: request.runtime,
    providerCapabilities: createProviderCapabilities({webSearchEnabled}),
    ...(sessionMemory ? {
      sessionMemory: {
        note: 'Bounded conversation memory. Resolve references against the latest compatible turn; current context and instruction remain authoritative.',
        ...sessionMemory,
      },
    } : {}),
    attachments: (request.attachments ?? [])
      .map(({dataUrl: _dataUrl, ...attachment}) => attachment),
  }
}

function validateMarkdownRequest(request) {
  if (request?.markdownStreamVersion !== 1) {
    throw new Error('不支持的 Markdown 对话流协议。')
  }
  if (typeof request.instruction !== 'string' || !request.instruction.trim()) {
    throw new Error('Markdown 对话缺少 instruction。')
  }
  if (request.instruction.length > 20_000) {
    throw new Error('Markdown 对话 instruction 过长。')
  }
  if (!request.context || typeof request.context !== 'object') {
    throw new Error('Markdown 对话缺少文档上下文。')
  }
  const manifest = request.runtime?.markdown
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.syntaxes)) {
    throw new Error('当前宿主未提供 Markdown Adapter 能力清单。')
  }
  if (JSON.stringify(manifest).length > 96_000) {
    throw new Error('Markdown Adapter 能力清单过大。')
  }
}

function getMarkdownInstructions(request) {
  if (allowPromptOverride && typeof request.systemPrompt === 'string' && request.systemPrompt.trim()) {
    return request.systemPrompt
  }
  return createDocumentAgentMarkdownSystemPrompt()
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
      'Use blockcraft.delegate selectively for a genuinely useful independent specialist pass. Available specialists are document-analysis, content-writing, structure-planning, host-workflow, and quality-review. Avoid delegation for trivial requests and do not repeat a completed delegation.',
      'When orchestration.toolHistory contains an automatic quality-review with verdict revise, treat every error issue as mandatory correction feedback. Return a corrected final result; do not repeat the rejected candidate or delegate the same review again.',
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
  'host-workflow': 'Interpret runtime host context and declared custom capabilities. Propose safe host-aware reads, document changes and confirmation-gated business actions.',
  'quality-review': 'Critically review the supplied candidate against the user instruction, current evidence, schema constraints and safety. Attached images may support source-content accuracy, but visual layout reconstruction is outside scope and there is no rendered candidate preview. Set review.verdict to pass only when no mandatory correction remains. Otherwise set revise and include at least one error issue with a stable kebab-case code, concrete message, affected candidate operation indexes (or [] for result-wide issues), and an actionable recommendation.',
}

function getSubAgentInstructions(request, delegation) {
  return [
    getSystemPrompt(request),
    `You are the read-only ${delegation.specialist} specialist.`,
    specialistInstructions[delegation.specialist],
    'Work independently on the delegated objective. Do not call tools, execute writes, claim changes were applied, or broaden the objective.',
    'Return only the specialist JSON result matching the supplied schema. Candidate operations are advisory and will be checked again by the Master and host.',
    delegation.specialist === 'quality-review'
      ? 'review must be a non-null structured verdict. Do not silently rewrite the candidate; explain every mandatory correction in review.issues.'
      : 'review must be null because this specialist does not own the quality gate.',
    'The transport schema encodes operation props, snapshots, delta, and params as JSON strings. Emit valid JSON strings for those nested values.',
  ].join('\n\n')
}

function createSubAgentPayload(request, session, delegation) {
  return {
    ...createAgentPayload(request, session, null, {allowProviderTools: false}),
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

async function consumeOpenAiSse(body, onEvent) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const {done, value} = await reader.read()
      buffer += decoder.decode(value, {stream: !done})
      let match = /\r?\n\r?\n/.exec(buffer)
      while (match) {
        const frame = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        const data = frame
          .split(/\r?\n/)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
        if (data && data !== '[DONE]') onEvent(JSON.parse(data))
        match = /\r?\n\r?\n/.exec(buffer)
      }
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
}

async function runOpenAiMarkdown(request, session, onDelta, signal) {
  if (!apiKey) {
    throw new Error('未配置 OPENAI_API_KEY。请先启动本地 Agent 服务并设置 API Key。')
  }
  const attachments = request.attachments ?? []
  const input = [{
    role: 'user',
    content: [
      {type: 'input_text', text: JSON.stringify(createMarkdownPayload(request, session))},
      ...attachments.map(attachment => ({
        type: 'input_image',
        image_url: attachment.dataUrl,
        detail: 'auto',
      })),
    ],
  }]
  const tools = createOpenAiTools({webSearchEnabled})
  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: getMarkdownInstructions(request),
      input,
      store: false,
      stream: true,
      ...(tools.length ? {tools} : {}),
    }),
    signal,
  })
  if (!upstream.ok) {
    const payload = await upstream.json().catch(() => null)
    throw new Error(payload?.error?.message ?? `OpenAI 请求失败（HTTP ${upstream.status}）`)
  }
  if (!upstream.body) throw new Error('OpenAI 未返回 Markdown 流。')

  let markdown = ''
  let chunks = 0
  await consumeOpenAiSse(upstream.body, event => {
    if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      markdown += event.delta
      chunks += 1
      onDelta(event.delta)
      return
    }
    if (event?.type === 'response.failed') {
      throw new Error(event.response?.error?.message ?? 'OpenAI Markdown 响应失败。')
    }
  })
  if (!markdown) throw new Error('OpenAI 没有返回 Markdown 内容。')
  return {markdown, streamed: chunks > 0}
}

function runCodexJsonLines(command, args, input, onEvent, signal, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['pipe', 'pipe', 'pipe']})
    let stdoutBuffer = ''
    const stderr = []
    let settled = false
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => {
      child.kill('SIGTERM')
      finish(() => reject(new Error('Markdown 对话已取消。')))
    }
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      finish(() => reject(new Error('本地 Codex 请求超时')))
    }, timeoutMs)
    signal?.addEventListener('abort', abort, {once: true})
    if (signal?.aborted) {
      abort()
      return
    }

    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk.toString('utf8')
      let newline = stdoutBuffer.indexOf('\n')
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim()
        stdoutBuffer = stdoutBuffer.slice(newline + 1)
        if (line) {
          try {
            onEvent(JSON.parse(line))
          } catch (error) {
            child.kill('SIGTERM')
            finish(() => reject(new Error(
              `本地 Codex JSONL 无效：${error instanceof Error ? error.message : 'unknown error'}`,
            )))
            return
          }
        }
        newline = stdoutBuffer.indexOf('\n')
      }
    })
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.on('error', error => finish(() => reject(
      new Error(`无法启动本地 Codex：${error.message}`),
    )))
    child.on('close', code => {
      if (settled) return
      if (stdoutBuffer.trim()) {
        try {
          onEvent(JSON.parse(stdoutBuffer.trim()))
        } catch (error) {
          finish(() => reject(new Error(
            `本地 Codex JSONL 无效：${error instanceof Error ? error.message : 'unknown error'}`,
          )))
          return
        }
      }
      if (code !== 0) {
        const diagnostic = Buffer.concat(stderr).toString('utf8')
        finish(() => reject(new Error(extractCodexProcessError(diagnostic, '', code))))
        return
      }
      finish(resolve)
    })
    child.stdin.end(input)
  })
}

async function runLocalCodexMarkdown(request, session, onDelta, signal) {
  const workingDir = await mkdtemp(join(tmpdir(), 'blockcraft-agent-markdown-'))
  try {
    const imagePaths = await writeLocalImageAttachments(workingDir, request.attachments)
    const args = [
      'exec',
      '--json',
      '--ephemeral',
      '--sandbox', 'read-only',
      '--skip-git-repo-check',
      '--cd', workingDir,
      '--color', 'never',
      '-',
    ]
    if (codexCliModel) args.splice(1, 0, '--model', codexCliModel)
    if (imagePaths.length) args.splice(args.length - 1, 0, '--image', ...imagePaths)
    const prompt = [
      getMarkdownInstructions(request),
      'Return Markdown only. Do not edit files, run commands, or wrap the answer in a code fence.',
      JSON.stringify({
        ...createMarkdownPayload(request, session),
        imageNote: request.attachments?.length
          ? `${imagePaths.length} image attachment(s) are available to inspect.`
          : undefined,
      }),
    ].join('\n\n')

    const messages = []
    let markdown = ''
    await runCodexJsonLines(
      process.env['CODEX_CLI_COMMAND'] ?? 'codex',
      args,
      prompt,
      event => {
        const item = event?.type === 'item.completed' ? event.item : null
        if (item?.type !== 'agent_message' || typeof item.text !== 'string' || !item.text) return
        messages.push(item.text)
        // Hold the first completed message until process completion. A CLI
        // that exposes only its final answer must produce one done event, not
        // a synthetic typing delta. Once a second message exists, both are
        // genuinely incremental and can be forwarded.
        if (messages.length === 2) {
          markdown = messages[0]
          onDelta(markdown)
        }
        if (messages.length >= 2) {
          const delta = `${markdown ? '\n\n' : ''}${item.text}`
          markdown += delta
          onDelta(delta)
        }
      },
      signal,
    )
    if (messages.length === 1) markdown = messages[0]
    if (!markdown) throw new Error('本地 Codex 没有返回 Markdown 内容。')
    return {markdown, streamed: messages.length > 1}
  } finally {
    await rm(workingDir, {recursive: true, force: true})
  }
}

async function runMarkdown(request, session, onDelta, signal) {
  if (provider === 'codex-cli') {
    return runLocalCodexMarkdown(request, session, onDelta, signal)
  }
  if (provider === 'openai') {
    return runOpenAiMarkdown(request, session, onDelta, signal)
  }
  throw new Error(`不支持的 Agent provider：${provider}`)
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
  const tools = createOpenAiTools({
    webSearchEnabled,
    allowTools: !delegation,
  })

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
      ...(tools.length ? {tools} : {}),
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

  const isMarkdownStream = request.method === 'POST'
    && request.url === '/api/document-agent/markdown'
  if (request.method !== 'POST' || (
    request.url !== '/api/document-agent' && !isMarkdownStream
  )) {
    sendJson(response, 404, {error: 'Not found'})
    return
  }

  try {
    const body = await readJson(request)
    if (isMarkdownStream) {
      validateMarkdownRequest(body)
      const session = getSession(body.sessionId)
      const abortController = new AbortController()
      response.on('close', () => {
        if (!response.writableEnded) abortController.abort()
      })
      startSse(response)
      try {
        const result = await runMarkdown(
          body,
          session,
          delta => sendSse(response, {type: 'delta', delta}),
          abortController.signal,
        )
        rememberMarkdownSessionTurn(session, body, result.markdown)
        sendSse(response, {type: 'done', ...result})
      } catch (error) {
        sendSse(response, {
          type: 'error',
          error: error instanceof Error ? error.message : '未知 Markdown Agent 错误',
        })
      } finally {
        if (!response.writableEnded) response.end()
      }
      return
    }
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
  console.log(`[document-agent] web search: ${webSearchEnabled ? 'enabled' : 'disabled'}`)
  console.log(`[document-agent] prompt: ${DOCUMENT_AGENT_PROMPT_VERSION}${allowPromptOverride ? ' (override enabled)' : ''}`)
})
