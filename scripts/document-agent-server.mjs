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
              kind: {type: 'string', enum: ['insert-blocks']},
              parentId: {type: 'string'},
              index: {type: 'integer', minimum: 0},
              snapshots: {type: 'array', items: {type: 'string'}},
            },
            required: ['kind', 'parentId', 'index', 'snapshots'],
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
            },
            required: ['kind', 'parentId', 'index', 'flavour', 'params'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: {type: 'string', enum: ['replace-block']},
              blockId: {type: 'string'},
              flavour: {type: 'string'},
              params: {type: 'string'},
            },
            required: ['kind', 'blockId', 'flavour', 'params'],
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
  return {
    ...result,
    operations: result.operations.map(operation => {
      if (!operation || typeof operation !== 'object') return operation
      if (operation.kind === 'update-block-props') {
        return {...operation, props: parseJsonField(operation.props, 'props')}
      }
      if (operation.kind === 'insert-blocks') {
        return {...operation, snapshots: operation.snapshots.map(snapshot => parseJsonField(snapshot, 'snapshot'))}
      }
      if (operation.kind === 'apply-text-delta') {
        return {...operation, delta: parseJsonField(operation.delta, 'delta')}
      }
      if (operation.kind === 'create-blocks') {
        return {...operation, params: parseJsonField(operation.params, 'params')}
      }
      if (operation.kind === 'replace-block') {
        return {...operation, params: parseJsonField(operation.params, 'params')}
      }
      return operation
    }),
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

function createAgentPayload(request) {
  return {
    task: request.task,
    instruction: request.instruction,
    context: request.context,
    attachments: (request.attachments ?? []).map(({dataUrl: _dataUrl, ...attachment}) => attachment),
    editorAgentContract: [
      'Validated operations include replace-text, update-block-props, insert-blocks, create-blocks, replace-block, apply-text-delta, delete-blocks, and move-blocks.',
      'An empty paragraph or list item is still a valid structural target. Use delete-blocks with its actual parentId, index, and count.',
      'Never claim that an empty block cannot be safely changed merely because it has no text.',
      'For Mermaid preview-only mode use update-block-props on the existing mermaid block with props {"mode":"graph"}; never manipulate DOM or data-mode.',
    ],
  }
}

function getSystemPrompt(request) {
  if (allowPromptOverride && typeof request.systemPrompt === 'string' && request.systemPrompt.trim()) {
    return request.systemPrompt
  }
  return createDocumentAgentSystemPrompt(request.task)
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
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim() ||
          Buffer.concat(stdout).toString('utf8').trim()
        reject(new Error(detail || `本地 Codex 退出异常（${code ?? 'unknown'}）`))
        return
      }
      resolve({stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8')})
    })

    child.stdin.end(input)
  })
}

async function runLocalCodex(request) {
  const workingDir = await mkdtemp(join(tmpdir(), 'blockcraft-agent-'))
  const schemaPath = join(workingDir, 'result.schema.json')
  const outputPath = join(workingDir, 'result.json')
  await writeFile(schemaPath, JSON.stringify(resultSchema), 'utf8')

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

  const prompt = [
    getSystemPrompt(request),
    'Return only a JSON object matching the supplied output schema. Do not edit files or run commands.',
    'The transport schema encodes props, snapshots, delta, and params as JSON strings. Emit valid JSON strings for those nested values; the host decodes them before validation.',
    JSON.stringify({
      ...createAgentPayload(request),
      imageNote: request.attachments?.length
        ? 'An image attachment exists, but this local Codex CLI smoke path should rely on the structured document context rather than claiming to see the image.'
        : undefined,
    }),
  ].join('\n\n')

  try {
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
      return normalizeAgentResult(JSON.parse(outputText))
    } catch {
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

async function runAgent(request) {
  if (provider === 'codex-cli') {
    return runLocalCodex(request)
  }

  if (provider !== 'openai') {
    throw new Error(`不支持的 Agent provider：${provider}`)
  }

  if (!apiKey) {
    throw new Error('未配置 OPENAI_API_KEY。请先启动本地 Agent 服务并设置 API Key。')
  }

  const instructions = [
    getSystemPrompt(request),
    'The transport schema encodes props, snapshots, delta, and params as JSON strings. Emit valid JSON strings for those nested values; the host decodes them before validation.',
  ].join('\\n\\n')
  const attachments = request.attachments ?? []
  const input = [{
    role: 'user',
    content: [
      {type: 'input_text', text: JSON.stringify(createAgentPayload(request))},
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
          name: 'document_agent_result',
          strict: true,
          schema: resultSchema,
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
    return normalizeAgentResult(JSON.parse(outputText))
  } catch {
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
    const result = await runAgent(body)
    sendJson(response, 200, {result})
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
