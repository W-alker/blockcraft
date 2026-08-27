import {SHAPE_KINDS} from '@ccc/blockcraft'
import type {
  DocumentAgentBlockCapability,
  DocumentAgentHostExtension,
} from './host-extension'

const textOrDelta = {
  anyOf: [
    {type: 'string'},
    {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          insert: {
            anyOf: [
              {type: 'string'},
              {
                type: 'object',
                properties: {break: {const: '\n'}},
                required: ['break'],
                additionalProperties: false,
              },
            ],
          },
          attributes: {type: 'object'},
        },
        required: ['insert'],
        additionalProperties: false,
      },
    },
  ],
} as const

const nullableString = {type: ['string', 'null']} as const
const nullableNumber = {type: ['number', 'null']} as const
const editableProperties = {
  depth: {type: ['integer', 'null'], minimum: 0},
  textAlign: {enum: ['left', 'center', 'right', 'justify', null]},
  backColor: nullableString,
  borderColor: nullableString,
  pfs: {type: ['number', 'null'], minimum: 0.25, maximum: 8},
  lh: {type: ['number', 'null'], minimum: 0.5, maximum: 6},
  psb: {type: ['number', 'null'], minimum: 0, maximum: 720},
  psa: {type: ['number', 'null'], minimum: 0, maximum: 720},
} as const

const editableCreateParameters = {
  type: 'array',
  minItems: 0,
  maxItems: 2,
  prefixItems: [
    textOrDelta,
    {
      type: 'object',
      properties: {
        depth: {type: 'integer', minimum: 0},
        textAlign: {enum: ['left', 'center', 'right', 'justify']},
        heading: {enum: [1, 2, 3]},
        ms: {type: 'string'},
      },
      additionalProperties: false,
    },
  ],
  items: false,
} as const

function writableProps(
  properties: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  }
}

function editableCapability(
  flavour: string,
  title: string,
  description: string,
  semanticRoles: readonly string[],
  extraWritable: Readonly<Record<string, unknown>> = {},
): DocumentAgentBlockCapability {
  return {
    id: `blockcraft.block.${flavour}`,
    kind: 'block',
    flavour,
    schemaVersion: 1,
    title,
    description,
    domains: ['document'],
    semanticRoles,
    createParameters: editableCreateParameters,
    writableProps: writableProps({...editableProperties, ...extraWritable}),
    examples: [{flavour, params: ['示例文本']}],
  }
}

const objectGeometryProperties = {
  width: {type: ['number', 'null'], minimum: 1, maximum: 20_000},
  height: {type: ['number', 'null'], minimum: 1, maximum: 20_000},
  rotation: {type: ['number', 'null'], minimum: -3600, maximum: 3600},
  lockRatio: {type: ['boolean', 'null']},
  position: {
    anyOf: [
      {type: 'null'},
      {
        type: 'object',
        properties: {x: {type: 'number'}, y: {type: 'number'}},
        required: ['x', 'y'],
        additionalProperties: false,
      },
    ],
  },
  placementLayer: {enum: ['under', null]},
} as const

const urlString = {type: 'string', minLength: 1, maxLength: 8_192} as const

export const BLOCKCRAFT_BUILTIN_AGENT_EXTENSION: DocumentAgentHostExtension = {
  id: 'blockcraft.builtin',
  version: '2',
  description: 'BlockCraft 内置 Block 的语义、创建参数和可写属性契约',
  capabilities: [
    {
      id: 'blockcraft.block.root', kind: 'block', flavour: 'root', schemaVersion: 1,
      title: '文档', description: '文档根容器；不能由 Agent 创建或替换。', domains: ['document'],
      semanticRoles: ['document-root'],
      writableProps: writableProps({
        background: nullableString,
        color: nullableString,
        ff: nullableString,
        fs: {type: ['number', 'null'], minimum: 1, maximum: 512},
        lh: {type: ['number', 'null'], minimum: 0.5, maximum: 6},
      }),
      atomicProps: ['background'],
    },
    editableCapability('paragraph', '段落', '普通正文；heading 是段落属性，不是独立 flavour。', ['paragraph', 'heading'], {
      heading: {enum: [1, 2, 3, null]},
    }),
    editableCapability('ordered', '有序列表', '带编号的列表项。', ['list-item', 'ordered-list'], {
      start: {type: ['integer', 'null'], minimum: 1},
      ms: {type: ['string', 'null']},
    }),
    editableCapability('bullet', '无序列表', '带项目符号的列表项。', ['list-item', 'bullet-list']),
    editableCapability('todo', '待办事项', '可勾选的任务项。', ['task', 'checklist-item'], {
      checked: {enum: [0, 1, null]},
    }),
    editableCapability('blockquote', '引用', '引用或强调文本。', ['quote']),
    editableCapability('caption', '题注', '媒体或表格的简短题注。', ['caption']),
    editableCapability('code', '代码', '保留代码文本和语言标识。', ['code'], {
      lang: {type: ['string', 'null'], maxLength: 80},
    }),
    {
      id: 'blockcraft.block.callout', kind: 'block', flavour: 'callout', schemaVersion: 1,
      title: '高亮块', description: '包含正文子块的强调容器。', domains: ['document'],
      semanticRoles: ['callout', 'container'],
      createParameters: {type: 'array', maxItems: 0},
      writableProps: writableProps({backColor: nullableString, borderColor: nullableString}),
      examples: [{flavour: 'callout', params: []}],
    },
    {
      id: 'blockcraft.block.divider', kind: 'block', flavour: 'divider', schemaVersion: 1,
      title: '分割线', description: '分隔两个内容区域。', domains: ['document'],
      semanticRoles: ['separator'], createParameters: {type: 'array', maxItems: 0},
      writableProps: writableProps({}), examples: [{flavour: 'divider', params: []}],
    },
    {
      id: 'blockcraft.block.page-divider', kind: 'block', flavour: 'page-divider', schemaVersion: 1,
      title: '分页符', description: '在分页布局中强制从下一页开始。', domains: ['document'],
      semanticRoles: ['page-break'], createParameters: {type: 'array', maxItems: 0},
      writableProps: writableProps({}), examples: [{flavour: 'page-divider', params: []}],
    },
    {
      id: 'blockcraft.block.image', kind: 'block', flavour: 'image', schemaVersion: 1,
      title: '图片', description: '通过 URL 或宿主资源地址插入图片。', domains: ['document', 'media'],
      semanticRoles: ['image', 'media'],
      createParameters: {
        type: 'array', minItems: 1, maxItems: 4,
        prefixItems: [
          {anyOf: [urlString, {type: 'object', properties: {src: urlString, wr: {type: 'number', minimum: 0.1}, ar: {type: 'number', minimum: 0.01}}, required: ['src'], additionalProperties: false}]},
          {type: 'number', minimum: 1}, {type: 'number', minimum: 1}, textOrDelta,
        ],
      },
      writableProps: writableProps({
        src: {...urlString, type: ['string', 'null']},
        wr: nullableNumber, ar: nullableNumber, align: {enum: ['center', 'right', null]},
        ...objectGeometryProperties,
      }),
      atomicProps: ['position'], examples: [{flavour: 'image', params: ['https://example.com/image.png']}],
    },
    {
      id: 'blockcraft.block.table', kind: 'block', flavour: 'table', schemaVersion: 1,
      title: '表格', description: '按行列数创建结构完整的表格。', domains: ['document', 'data'],
      semanticRoles: ['table', 'structured-data'],
      createParameters: {type: 'array', maxItems: 2, prefixItems: [{type: 'integer', minimum: 1, maximum: 100}, {type: 'integer', minimum: 1, maximum: 50}]},
      writableProps: writableProps({colWidths: {type: 'array', items: {type: 'number', minimum: 1}}}),
      atomicProps: ['colWidths'], examples: [{flavour: 'table', params: [3, 3]}],
    },
    {
      id: 'blockcraft.block.bookmark', kind: 'block', flavour: 'bookmark', schemaVersion: 1,
      title: '书签', description: '以链接卡片形式展示 URL。', domains: ['document', 'web'],
      semanticRoles: ['bookmark', 'link-card'],
      createParameters: {type: 'array', minItems: 1, maxItems: 1, prefixItems: [urlString]},
      writableProps: writableProps({url: urlString}),
      examples: [{flavour: 'bookmark', params: ['https://example.com']}],
    },
    ...['figma-embed', 'juejin-embed'].map((flavour): DocumentAgentBlockCapability => ({
      id: `blockcraft.block.${flavour}`,
      kind: 'block',
      flavour,
      schemaVersion: 1,
      title: flavour === 'figma-embed' ? 'Figma 嵌入' : '掘金嵌入',
      description: '以已注册的第三方嵌入块展示 URL。',
      domains: ['document', 'web'],
      semanticRoles: ['embed', 'link'],
      createParameters: {type: 'array', minItems: 1, maxItems: 1, prefixItems: [urlString]},
      writableProps: writableProps({url: urlString}),
      examples: [{flavour, params: ['https://example.com']}],
    })),
    {
      id: 'blockcraft.block.attachment', kind: 'block', flavour: 'attachment', schemaVersion: 1,
      title: '附件', description: '展示宿主已经提供 URL 的可下载文件。', domains: ['document', 'media'],
      semanticRoles: ['attachment', 'file'],
      createParameters: {
        type: 'array', minItems: 1, maxItems: 1,
        prefixItems: [{
          type: 'object',
          properties: {
            name: {type: 'string', maxLength: 1_024},
            url: urlString,
            type: {type: 'string', maxLength: 255},
            size: {type: 'number', minimum: 0},
          },
          required: ['url', 'type', 'size'],
          additionalProperties: false,
        }],
      },
      writableProps: writableProps({
        name: {type: 'string', maxLength: 1_024}, url: urlString,
        type: {type: 'string', maxLength: 255}, size: {type: 'number', minimum: 0},
      }),
      examples: [{flavour: 'attachment', params: [{name: '说明.pdf', url: 'https://example.com/a.pdf', type: 'application/pdf', size: 1024}]}],
    },
    {
      id: 'blockcraft.block.video', kind: 'block', flavour: 'video', schemaVersion: 1,
      title: '视频', description: '通过 URL 创建视频媒体块。',
      domains: ['document', 'media'],
      semanticRoles: ['video', 'media'],
      createParameters: {
        type: 'array', minItems: 1, maxItems: 1,
        prefixItems: [{
          type: 'object',
          properties: {
            url: {type: 'string', maxLength: 8_192},
            name: {type: 'string', maxLength: 1_024},
            type: {type: 'string', maxLength: 255},
            size: {type: 'number', minimum: 0},
            sourceType: {enum: ['link', 'local', 'embed']},
            width: {type: 'number', minimum: 1},
            wr: {type: 'number', minimum: 0.1},
            ar: {type: 'number', minimum: 0.01},
            poster: {type: 'string', maxLength: 8_192},
          },
          required: ['sourceType'],
          additionalProperties: false,
        }],
      },
      writableProps: writableProps({
        url: {type: 'string', maxLength: 8_192},
        sourceType: {enum: ['link', 'local', 'embed']},
        type: {type: 'string', maxLength: 255},
        width: {type: ['number', 'null'], minimum: 1},
        wr: {type: ['number', 'null'], minimum: 0.1},
        ar: {type: ['number', 'null'], minimum: 0.01},
        poster: {type: ['string', 'null'], maxLength: 8_192},
      }),
      examples: [{flavour: 'video', params: [{url: 'https://example.com/video.mp4', sourceType: 'link'}]}],
    },
    {
      id: 'blockcraft.block.audio', kind: 'block', flavour: 'audio', schemaVersion: 1,
      title: '音频', description: '通过 URL 创建音频媒体块。',
      domains: ['document', 'media'], semanticRoles: ['audio', 'media'],
      createParameters: {
        type: 'array', minItems: 1, maxItems: 1,
        prefixItems: [{
          type: 'object',
          properties: {
            url: {type: 'string', maxLength: 8_192},
            name: {type: 'string', maxLength: 1_024},
            type: {type: 'string', maxLength: 255},
            size: {type: 'number', minimum: 0},
            sourceType: {enum: ['link', 'local', 'embed']},
          },
          required: ['sourceType'],
          additionalProperties: false,
        }],
      },
      writableProps: writableProps({
        url: {type: 'string', maxLength: 8_192},
        name: {type: 'string', maxLength: 1_024},
        sourceType: {enum: ['link', 'local', 'embed']},
      }),
      examples: [{flavour: 'audio', params: [{url: 'https://example.com/audio.mp3', sourceType: 'link'}]}],
    },
    {
      id: 'blockcraft.block.formula', kind: 'block', flavour: 'formula', schemaVersion: 1,
      title: '公式', description: '用 LaTeX 表达式创建数学公式。', domains: ['document'],
      semanticRoles: ['formula', 'math'],
      createParameters: {type: 'array', maxItems: 1, prefixItems: [{type: 'string', maxLength: 20_000}]},
      writableProps: writableProps({latex: {type: 'string', maxLength: 20_000}}),
      examples: [{flavour: 'formula', params: ['x^2 + y^2']}],
    },
    {
      id: 'blockcraft.block.mermaid', kind: 'block', flavour: 'mermaid', schemaVersion: 1,
      title: 'Mermaid 图表', description: '由 Mermaid DSL 创建的图表容器。', domains: ['document', 'diagram'],
      semanticRoles: ['diagram'],
      createParameters: {type: 'array', minItems: 2, maxItems: 2, prefixItems: [{enum: ['text', 'graph', 'default']}, {type: 'string', maxLength: 100_000}]},
      writableProps: writableProps({mode: {enum: ['text', 'graph', 'default']}}),
      examples: [{flavour: 'mermaid', params: ['graph', 'flowchart LR\nA-->B']}],
    },
    {
      id: 'blockcraft.block.columns', kind: 'block', flavour: 'columns', schemaVersion: 1,
      title: '分栏', description: '创建二至六栏的布局容器。', domains: ['document', 'layout'],
      semanticRoles: ['columns', 'layout'],
      createParameters: {type: 'array', maxItems: 1, prefixItems: [{type: 'integer', minimum: 2, maximum: 6}]},
      writableProps: writableProps({}), examples: [{flavour: 'columns', params: [2]}],
    },
    {
      id: 'blockcraft.block.shape', kind: 'block', flavour: 'shape', schemaVersion: 1,
      title: '形状', description: '可放置、缩放和旋转的目录形状。', domains: ['document', 'diagram'],
      semanticRoles: ['shape', 'diagram-object'],
      createParameters: {type: 'array', maxItems: 2, prefixItems: [{enum: SHAPE_KINDS}, textOrDelta]},
      writableProps: writableProps({...objectGeometryProperties, adjustments: {type: ['object', 'null'], additionalProperties: {type: 'number'}}}),
      atomicProps: ['position', 'adjustments', 'customGeometry', 'fill', 'outline', 'effects', 'textFrame', 'textStyle'],
      examples: [{flavour: 'shape', params: ['rectangle', '说明']}],
    },
    {
      id: 'blockcraft.block.text-box', kind: 'block', flavour: 'text-box', schemaVersion: 1,
      title: '文本框', description: '固定几何、可放置的富文本容器。', domains: ['document', 'layout'],
      semanticRoles: ['text-box', 'layout-object'],
      createParameters: {type: 'array', maxItems: 2, prefixItems: [textOrDelta, {type: 'object', properties: objectGeometryProperties, additionalProperties: false}]},
      writableProps: writableProps(objectGeometryProperties),
      atomicProps: ['position', 'fill', 'outline', 'effects', 'textFrame', 'textStyle'],
      examples: [{flavour: 'text-box', params: ['说明文字', {width: 240, height: 120}]}],
    },
    {
      id: 'blockcraft.block.word-art', kind: 'block', flavour: 'word-art', schemaVersion: 1,
      title: '艺术字', description: '统一样式、可放置的艺术文字。', domains: ['document', 'layout'],
      semanticRoles: ['word-art', 'decorative-text'],
      createParameters: {type: 'array', maxItems: 2, prefixItems: [textOrDelta, {type: 'object', properties: {...objectGeometryProperties, depth: {type: 'integer', minimum: 0}}, additionalProperties: false}]},
      writableProps: writableProps({...objectGeometryProperties, depth: {type: ['integer', 'null'], minimum: 0}}),
      atomicProps: ['position', 'textFrame', 'textStyle'],
      examples: [{flavour: 'word-art', params: ['新品发布', {width: 320, height: 96}]}],
    },
    {
      id: 'blockcraft.block.render-unit', kind: 'block', flavour: 'render-unit', schemaVersion: 1,
      title: '内容区域', description: '可限制允许子块并配置表面的内容容器。', domains: ['document', 'layout'],
      semanticRoles: ['content-region', 'container'],
      createParameters: {
        type: 'array', maxItems: 2,
        prefixItems: [{
          type: 'object',
          properties: {
            plh: {type: 'string', maxLength: 1_024},
            plhMode: {enum: ['focused', 'always']},
            incl: {type: 'array', maxItems: 100, items: {type: 'string', minLength: 1, maxLength: 100}},
            excl: {type: 'array', maxItems: 100, items: {type: 'string', minLength: 1, maxLength: 100}},
          },
          additionalProperties: false,
        }, {type: 'object'}],
      },
      writableProps: writableProps({backColor: nullableString, borderColor: nullableString, p: {type: ['array', 'null'], minItems: 1, maxItems: 4, items: {type: 'number', minimum: 0}}, bgi: nullableString, bgs: nullableString, bgx: nullableNumber, bgy: nullableNumber, bgo: nullableNumber}),
      atomicProps: ['p'], examples: [{flavour: 'render-unit', params: [{}, {p: [16, 24]}]}],
    },
    ...['weather', 'date-card', 'person-card'].map((flavour): DocumentAgentBlockCapability => ({
      id: `blockcraft.block.${flavour}`,
      kind: 'block',
      flavour,
      schemaVersion: 1,
      title: flavour === 'weather' ? '天气' : flavour === 'date-card' ? '日期卡片' : '人员卡片',
      description: '宿主数据物料；创建后由宿主物化业务 props。',
      domains: ['document', 'dynamic-material'],
      semanticRoles: [flavour, 'dynamic-material'],
      createParameters: {type: 'array', maxItems: 0},
      writableProps: writableProps(objectGeometryProperties),
      atomicProps: ['position'],
      examples: [{flavour, params: []}],
    })),
  ],
}
