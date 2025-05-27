import {IBlockModel, IInlineAttrs} from "../../../blockflow/src/core";
import {
  AttachmentBlockSchema, BlockNodeType,
  BlockquoteBlockSchema,
  BookmarkBlockSchema,
  BulletBlockSchema,
  CalloutBlockSchema,
  CaptionBlockSchema,
  CodeBlockSchema,
  DeltaInsert,
  DividerBlockSchema,
  FigmaEmbedBlockSchema, generateId,
  IBlockSnapshot, IInlineNodeAttrs,
  ImageBlockSchema,
  JuejinEmbedBlockSchema,
  MermaidBlockSchema,
  MermaidTextareaBlockSchema,
  OrderedBlockSchema,
  ParagraphBlockSchema,
  RootBlockSchema,
  SchemaManager,
  TableBlockSchema,
  TableCellBlockSchema,
  TableRowBlockSchema,
  TodoBlockSchema
} from "../../../blockcraft";

const schemas = new SchemaManager([
  ParagraphBlockSchema,
  OrderedBlockSchema, BulletBlockSchema, TodoBlockSchema, CalloutBlockSchema, CodeBlockSchema,
  CalloutBlockSchema,
  DividerBlockSchema, ImageBlockSchema,
  TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema, AttachmentBlockSchema, BookmarkBlockSchema,
  FigmaEmbedBlockSchema, JuejinEmbedBlockSchema,
  CaptionBlockSchema, RootBlockSchema,
  MermaidTextareaBlockSchema, MermaidBlockSchema, BlockquoteBlockSchema
])

const HEADING_MAP = {
  'heading-one': 1,
  'heading-two': 2,
  'heading-three': 3,
  'heading-four': 4,
  'heading-five': 5,
}

const toNewEditable = (data: IBlockModel, flavour: BlockCraft.BlockFlavour) => {
  const res: IBlockSnapshot[] = []
  const children = data.children as DeltaInsert[]
  const pChildren: DeltaInsert[] = []

  const transformAttrs = (attrs: IInlineAttrs) => {
    const res: IInlineNodeAttrs = {}
    for (const key in attrs) {
      switch (key) {
        case 's:c':
          res['s:color'] = attrs[key]
          break
        case 's:bc':
          res['s:background'] = attrs[key]
          break
        case 's:fs':
        case 's:ff':
          break
        default:
          // @ts-ignore
          res[key] = attrs[key]
      }
    }
    return res
  }

  for (const delta of children) {
    if (typeof delta.insert === 'string') {
      const d: DeltaInsert = {
        insert: delta.insert
      }
      if(delta.attributes) {
        d.attributes = transformAttrs(delta.attributes as any)
      }
      pChildren.push(d)
      continue
    }

    try {
      if (delta.insert['image']) {
        const img = schemas.createSnapshot('image', [delta.insert['image'] as string])
        res.push(img)
        continue
      }
    } catch (e) {
      console.log(delta)
      console.warn(e)
    }


    if (delta.insert['link']) {
      pChildren.push({
        insert: delta.insert['link'] as string,
        attributes: {
          'a:link': delta.attributes?.['d:href'] as string,
          ...transformAttrs(delta.attributes as any)
        }
      })
      continue
    }

    if (delta.insert['mention']) {
      pChildren.push(delta)
      continue
    }

    pChildren.push(delta)
  }

  res.unshift(<any>{
    id: generateId(),
    flavour,
    nodeType: BlockNodeType.editable,
    props: {
      depth: data.props.indent,
    },
    meta: {},
    children: pChildren
  })
  return res
}

export class Transformer {
  transform(data: IBlockModel[]): IBlockSnapshot[] {
    const res: IBlockSnapshot[] = []
    data.forEach((item) => {
      switch (item.flavour) {
        case 'paragraph':
          res.push(...toNewEditable(item, "paragraph"))
          break;
        case 'heading-one':
        case 'heading-two':
        case 'heading-three':
        case 'heading-four':
          res.push(<any>{
            ...item,
            flavour: 'paragraph',
            props: {
              depth: item.props.indent,
              heading: HEADING_MAP[item.flavour]
            }
          })
          break;
        case 'bullet-list':
          res.push(...toNewEditable(item, "bullet"))
          break;
        case 'ordered-list':
          res.push(...toNewEditable(item, "ordered"))
          break;
        case 'todo-list':
          res.push(...toNewEditable(item, "todo"))
          break;
        case 'callout': {
          const deltas = item.children as DeltaInsert[]
          const p = schemas.createSnapshot('paragraph', [deltas])
          res.push(<any>{
            ...item,
            flavour: 'callout',
            nodeType: BlockNodeType.block,
            props: {
              color: item.props['c'],
              backColor: item.props['bc'],
              borderColor: item.props['ec'],
              prefix: item.props['emoji']
            },
            children: [p]
          })
        }
          break;
        case 'blockquote':
          res.push(...toNewEditable(item, "blockquote"))
          break;
        case 'divider':
          res.push(<any>{
            ...item,
            flavour: 'divider',
            props: {},
          })
          break;
        case 'code':
          res.push(<any>{
            ...item,
            flavour: 'code',
            props: {
              lang: 'PlainText',
            },
          })
          break;
        case 'mermaid': {
          const textArea = schemas.createSnapshot('mermaid-textarea', [item.children as DeltaInsert[]])
          res.push(<any>{
            ...item,
            flavour: 'mermaid',
            nodeType: BlockNodeType.block,
            props: {
              mode: item.props['view']
            },
            children: [textArea]
          })
        }
          break;
        case 'image': {
          res.push(<any>{
            ...item,
            flavour: 'image',
            props: {
              src: item.props['src'],
              width: item.props['width'],
              align: item.props['align'] === 'left' ? undefined : item.props
            }
          })
        }
          break;
        case 'link': {
          const p: IBlockSnapshot = {
            id: item.id,
            flavour: 'paragraph',
            nodeType: BlockNodeType.editable,
            props: {
              depth: 0,
            },
            meta: item.meta,
            children: [
              {
                insert: item.props['text'],
                attributes: {
                  'a:link': item.props['href'],
                }
              }
            ] as DeltaInsert[]
          }
          res.push(p)
        }
          break;
        case 'table': {
          res.push(this._transformTable(item))
        }
          break;
      }
    })
    return res
  }

  private _transformTable(data: IBlockModel): IBlockSnapshot {
    const table: IBlockSnapshot = {
      id: data.id,
      flavour: 'table',
      nodeType: BlockNodeType.block,
      props: {
        colWidths: data.props['colWidths'],
        colHead: data.props['colHead'],
        rowHead: data.props['rowHead'],
      },
      meta: data.meta,
      children: (data.children as IBlockModel[]).map((dataRow) => {
        return {
          id: dataRow.id,
          flavour: 'table-row',
          nodeType: BlockNodeType.block,
          props: {},
          meta: dataRow.meta,
          children: (dataRow.children as IBlockModel[]).map((dataCell) => {
            const p = toNewEditable(dataCell, 'paragraph')
            return {
              id: dataCell.id,
              flavour: 'table-cell',
              nodeType: BlockNodeType.block,
              props: {},
              meta: {},
              children: p
            } as IBlockSnapshot
          })
        } as IBlockSnapshot
      })
    }
    return table
  }

}
