#!/usr/bin/env node

import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import http from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'

const port = Number(process.env['DOCUMENT_AGENT_PORT'] ?? 8787)
const model = process.env['OPENAI_CODEX_MODEL'] ?? 'gpt-5-codex'
const apiKey = process.env['OPENAI_API_KEY']
const provider = process.env['DOCUMENT_AGENT_PROVIDER'] ?? (apiKey ? 'openai' : 'codex-cli')
const codexCliModel = process.env['CODEX_CLI_MODEL']
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
              props: {
                type: 'object',
                additionalProperties: {
                  type: ['string', 'number', 'boolean', 'null'],
                },
              },
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
              snapshots: {type: 'array', items: {type: 'object'}},
            },
            required: ['kind', 'parentId', 'index', 'snapshots'],
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
        const detail = Buffer.concat(stderr).toString('utf8').trim()
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
    request.systemPrompt ?? 'You are a BlockCraft document writing assistant. Return JSON only.',
    'Return only a JSON object matching the supplied output schema. Do not edit files or run commands.',
    JSON.stringify({
      task: request.task,
      instruction: request.instruction,
      context: request.context,
      playgroundConstraint: 'This smoke test allows replace-text, update-block-props, and insert-blocks operations.',
    }),
  ].join('\n\n')

  try {
    await runProcess(process.env['CODEX_CLI_COMMAND'] ?? 'codex', args, prompt)
    const outputText = await readFile(outputPath, 'utf8')
    try {
      return JSON.parse(outputText)
    } catch {
      throw new Error('本地 Codex 返回结果不是有效 JSON')
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

  const instructions = typeof request.systemPrompt === 'string'
    ? request.systemPrompt
    : 'You are a BlockCraft document writing assistant. Return JSON only.'
  const input = JSON.stringify({
    task: request.task,
    instruction: request.instruction,
    context: request.context,
    playgroundConstraint: 'This smoke test allows replace-text, update-block-props, and insert-blocks operations.',
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
    return JSON.parse(outputText)
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
})
