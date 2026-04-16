import {BlockNodeType, IBlockSnapshot} from "../../../framework/block-std/types/block.type";

export interface SnapshotViewerFixture {
  minimalParagraphDoc: IBlockSnapshot
  headingParagraph: IBlockSnapshot
  bullet: IBlockSnapshot
  ordered: IBlockSnapshot
  todo: IBlockSnapshot
  blockquote: IBlockSnapshot
  caption: IBlockSnapshot
  callout: IBlockSnapshot
  divider: IBlockSnapshot
  columns: IBlockSnapshot
  frame: IBlockSnapshot
  table: IBlockSnapshot
  code: IBlockSnapshot
  image: IBlockSnapshot
  video: IBlockSnapshot
  audio: IBlockSnapshot
  attachment: IBlockSnapshot
  bookmark: IBlockSnapshot
  formula: IBlockSnapshot
  mermaid: IBlockSnapshot
  figmaEmbed: IBlockSnapshot
  juejinEmbed: IBlockSnapshot
}

export function createAllBlocksFixture(): SnapshotViewerFixture {
  const paragraph: IBlockSnapshot = {
    id: "paragraph-1",
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {},
    children: [
      {
        insert: "hello snapshot viewer"
      }
    ]
  }

  const headingParagraph: IBlockSnapshot = {
    id: "paragraph-heading-1",
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
      heading: 2,
    },
    children: [{insert: "Heading paragraph"}],
  }

  const bullet: IBlockSnapshot = {
    id: "bullet-1",
    flavour: "bullet",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 1,
    },
    children: [{insert: "Bullet item"}],
  }

  const ordered: IBlockSnapshot = {
    id: "ordered-1",
    flavour: "ordered",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
      order: 2,
    },
    children: [{insert: "Ordered item"}],
  }

  const todo: IBlockSnapshot = {
    id: "todo-1",
    flavour: "todo",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
      checked: 1,
      created: 0,
    },
    children: [{insert: "Done item"}],
  }

  const blockquote: IBlockSnapshot = {
    id: "blockquote-1",
    flavour: "blockquote",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
    },
    children: [{insert: "Quoted text"}],
  }

  const caption: IBlockSnapshot = {
    id: "caption-1",
    flavour: "caption",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
      textAlign: "center",
    },
    children: [{insert: "Caption text"}],
  }

  const callout: IBlockSnapshot = {
    id: "callout-1",
    flavour: "callout",
    nodeType: BlockNodeType.block,
    meta: {},
    props: {
      backColor: "#FFE6CD",
      color: "#333",
      borderColor: "transparent",
      prefix: "📢",
    },
    children: [
      {
        id: "callout-paragraph-1",
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        meta: {},
        props: {
          depth: 0,
        },
        children: [{insert: "Inside callout"}],
      },
    ],
  }

  const divider: IBlockSnapshot = {
    id: "divider-1",
    flavour: "divider",
    nodeType: BlockNodeType.void,
    meta: {},
    props: {
      style: "dashed",
      size: "small",
    },
    children: [],
  }

  const columns: IBlockSnapshot = {
    id: "columns-1",
    flavour: "columns",
    nodeType: BlockNodeType.block,
    meta: {},
    props: {
      columnCount: 2,
      columnWidths: [40, 60],
    },
    children: [
      {
        id: "column-1",
        flavour: "column",
        nodeType: BlockNodeType.block,
        meta: {},
        props: {},
        children: [
          {
            id: "column-paragraph-1",
            flavour: "paragraph",
            nodeType: BlockNodeType.editable,
            meta: {},
            props: {
              depth: 0,
            },
            children: [{insert: "Column one"}],
          },
        ],
      },
      {
        id: "column-2",
        flavour: "column",
        nodeType: BlockNodeType.block,
        meta: {},
        props: {},
        children: [
          {
            id: "column-paragraph-2",
            flavour: "paragraph",
            nodeType: BlockNodeType.editable,
            meta: {},
            props: {
              depth: 0,
            },
            children: [{insert: "Column two"}],
          },
        ],
      },
    ],
  }

  const frame: IBlockSnapshot = {
    id: "frame-1",
    flavour: "frame" as any,
    nodeType: BlockNodeType.block,
    meta: {},
    props: {
      deep: 2,
    },
    children: [
      {
        id: "frame-paragraph-1",
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        meta: {},
        props: {
          depth: 0,
        },
        children: [{insert: "Indented frame content"}],
      },
    ],
  }

  const table: IBlockSnapshot = {
    id: "table-1",
    flavour: "table",
    nodeType: BlockNodeType.block,
    meta: {},
    props: {
      colWidths: [120, 180],
    },
    children: [
      {
        id: "table-row-1",
        flavour: "table-row",
        nodeType: BlockNodeType.block,
        meta: {},
        props: {
          height: 60,
        },
        children: [
          {
            id: "table-cell-1",
            flavour: "table-cell",
            nodeType: BlockNodeType.block,
            meta: {},
            props: {
              verticalAlign: "top",
            },
            children: [
              {
                id: "table-cell-paragraph-1",
                flavour: "paragraph",
                nodeType: BlockNodeType.editable,
                meta: {},
                props: {
                  depth: 0,
                },
                children: [{insert: "Cell one"}],
              },
            ],
          },
          {
            id: "table-cell-2",
            flavour: "table-cell",
            nodeType: BlockNodeType.block,
            meta: {},
            props: {
              verticalAlign: "middle",
              textAlign: "center",
            },
            children: [
              {
                id: "table-cell-paragraph-2",
                flavour: "paragraph",
                nodeType: BlockNodeType.editable,
                meta: {},
                props: {
                  depth: 0,
                },
                children: [{insert: "Cell two"}],
              },
            ],
          },
        ],
      },
    ],
  }

  const code: IBlockSnapshot = {
    id: "code-1",
    flavour: "code",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
      lang: "TypeScript",
      blockName: "Example",
    },
    children: [{insert: "const x = 1;"}],
  }

  const image: IBlockSnapshot = {
    id: "image-1",
    flavour: "image",
    nodeType: BlockNodeType.block,
    meta: {},
    props: {
      src: "https://cdn.example.com/image.png",
      width: 240,
      align: "center",
    },
    children: [caption],
  }

  const video: IBlockSnapshot = {
    id: "video-1",
    flavour: "video",
    nodeType: BlockNodeType.void,
    meta: {},
    props: {
      url: "https://cdn.example.com/demo.mp4",
      sourceType: "link",
      width: 320,
      type: "video/mp4",
    },
    children: [],
  }

  const audio: IBlockSnapshot = {
    id: "audio-1",
    flavour: "audio",
    nodeType: BlockNodeType.void,
    meta: {},
    props: {
      url: "https://cdn.example.com/demo.ogg",
      name: "Theme song",
      sourceType: "link",
    },
    children: [],
  }

  const attachment: IBlockSnapshot = {
    id: "attachment-1",
    flavour: "attachment",
    nodeType: BlockNodeType.void,
    meta: {},
    props: {
      name: "Guide.pdf",
      url: "https://cdn.example.com/guide.pdf",
      type: "application/pdf",
      size: 1024 * 1024,
      icon: "bc_icon bc_wenjian-color",
    },
    children: [],
  }

  const bookmark: IBlockSnapshot = {
    id: "bookmark-1",
    flavour: "bookmark",
    nodeType: BlockNodeType.void,
    meta: {},
    props: {
      url: "https://example.com/article",
    },
    children: [],
  }

  const formula: IBlockSnapshot = {
    id: "formula-1",
    flavour: "formula",
    nodeType: BlockNodeType.void,
    meta: {},
    props: {
      latex: "E = mc^2",
    },
    children: [],
  }

  const mermaid: IBlockSnapshot = {
    id: "mermaid-1",
    flavour: "mermaid",
    nodeType: BlockNodeType.block,
    meta: {},
    props: {
      mode: "graph",
    },
    children: [
      {
        id: "mermaid-text-1",
        flavour: "mermaid-textarea",
        nodeType: BlockNodeType.editable,
        meta: {},
        props: {
          depth: 0,
        },
        children: [{insert: "graph TD;A-->B;"}],
      },
    ],
  }

  const figmaEmbed: IBlockSnapshot = {
    id: "figma-embed-1",
    flavour: "figma-embed",
    nodeType: BlockNodeType.void,
    meta: {},
    props: {
      url: "https://www.figma.com/file/123/demo",
      width: 480,
      height: 320,
    },
    children: [],
  }

  const juejinEmbed: IBlockSnapshot = {
    id: "juejin-embed-1",
    flavour: "juejin-embed",
    nodeType: BlockNodeType.void,
    meta: {},
    props: {
      url: "https://juejin.cn/post/123",
      height: 320,
    },
    children: [],
  }

  const root: IBlockSnapshot = {
    id: "root-1",
    flavour: "root",
    nodeType: BlockNodeType.root,
    meta: {},
    props: {},
    children: [paragraph]
  }

  return {
    minimalParagraphDoc: root,
    headingParagraph,
    bullet,
    ordered,
    todo,
    blockquote,
    caption,
    callout,
    divider,
    columns,
    frame,
    table,
    code,
    image,
    video,
    audio,
    attachment,
    bookmark,
    formula,
    mermaid,
    figmaEmbed,
    juejinEmbed,
  }
}
