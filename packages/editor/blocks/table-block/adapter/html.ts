import {BlockHtmlAdapterMatcher} from "../../../adapters/html-adapter/block-adapter";
import {HastUtils} from "../../../adapters/utils";
import {BlockNodeType, generateId, IBlockSnapshot} from "../../../framework";
import {TableCellBlockModel, TableCellBlockSchema} from "..";
import {ParagraphBlockSchema} from "../../paragraph-block";
import {BlockCraftError, ErrorCode, splitDeltaByLineBreak} from "../../../global";
import type {Element} from 'hast';

// Parse source hints once during import, without mounting DOM or measuring layout.
function columnWidth(node: Element, tableWidth?: number): number | undefined {
  let value = node.properties['width']
  let important = false
  for (const declaration of String(node.properties['style'] ?? '').split(';')) {
    const match = /^\s*width\s*:\s*(.*?)\s*(!important)?\s*$/i.exec(declaration)
    if (match && (!important || match[2])) {
      value = match[1]
      important = !!match[2]
    }
  }
  const match = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*(px|pt|pc|in|cm|mm|%)?\s*$/i.exec(String(value ?? ''))
  if (!match) return undefined
  const unit = (match[2] ?? 'px').toLowerCase()
  const factors: Record<string, number> = {px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4}
  const width = Number(match[1]) * (unit === '%' ? (tableWidth ?? NaN) / 100 : factors[unit])
  return Number.isFinite(width) && width > 0 ? width : undefined
}

function tableColumnWidths(table: Element, columnCount: number): number[] | undefined {
  const widths = Array<number>(columnCount).fill(120)
  const tableWidth = columnWidth(table)
  let index = 0
  let hasWidth = false
  const append = (node: Element, fallback?: number) => {
    const width = columnWidth(node, tableWidth) ?? fallback
    const span = Number(node.properties['span'] ?? 1)
    const count = Math.min(columnCount - index, Number.isSafeInteger(span) && span > 0 ? span : 1)
    for (let i = 0; i < count; i++, index++) {
      if (width !== undefined) {
        widths[index] = width
        hasWidth = true
      }
    }
  }
  for (const group of HastUtils.getElementChildren(table)) {
    if (group.tagName !== 'colgroup' || index >= columnCount) continue
    const columns = HastUtils.getElementChildren(group).filter(node => node.tagName === 'col')
    if (!columns.length) append(group)
    else {
      const fallback = columnWidth(group, tableWidth)
      for (const col of columns) {
        if (index >= columnCount) break
        append(col, fallback)
      }
    }
  }
  return hasWidth ? widths : undefined
}

const createCells = (count = 1, hidden = false) => {
  return Array(count).fill(null).map(() => {
    const cellSnapshot = TableCellBlockSchema.createSnapshot()
    hidden && (cellSnapshot.props.display = 'none')
    return cellSnapshot
  })
}

export const tableBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'table',
  fromMatch: o => o.node.flavour === 'table',
  toBlockSnapshot: {
    enter: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext} = context;
      walkerContext.openNode(
        {
          id: generateId(),
          nodeType: BlockNodeType.block,
          flavour: 'table',
          props: {},
          meta: {},
          children: [],
        },
        'children'
      )
    },
    leave: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext} = context;

      const currentNode = walkerContext.currentNode()!

      let maxColLen = 0
      for (let rowIdx = 0; rowIdx < currentNode.children.length; rowIdx++) {
        const row = currentNode.children[rowIdx] as IBlockSnapshot
        if (row.flavour !== 'table-row') {
          throw new BlockCraftError(ErrorCode.DefaultRuntimeError, `Unexpected block type: ${row.flavour} in table`)
        }

        // 出栈时遍历单元格，补全colspan和rowspan大于1时缺少的隐藏单元格
        for (let colIdx = 0; colIdx < row.children.length; colIdx++) {
          const cell = row.children[colIdx] as IBlockSnapshot<TableCellBlockModel['props']>

          if (cell.flavour !== 'table-cell') {
            throw new BlockCraftError(ErrorCode.DefaultRuntimeError, `Unexpected block type in table-row`)
          }

          if (!cell.children.length) {
            // @ts-ignore
            cell.children.push(ParagraphBlockSchema.createSnapshot())
          }

          if (cell.props.display === 'none') continue

          if (cell.props.rowspan && cell.props.rowspan > 1) {
            // 添加隐藏单元格
            for (let i = 1; i < cell.props.rowspan; i++) {
              // 如果行数不够
              if (rowIdx + i >= currentNode.children.length) {
                // @ts-ignore
                currentNode.children.push(...new Array(cell.props.rowspan - i).fill(0).map(() => TableRowBlockSchema.createSnapshot()))
              }

              const nextRow = currentNode.children[rowIdx + i] as IBlockSnapshot
              nextRow.children.splice(colIdx, 0, ...createCells(cell.props.colspan || 1, true))
            }
          }

          if (cell.props.colspan && cell.props.colspan > 1) {
            // 添加隐藏单元格
            row.children.splice(colIdx + 1, 0, ...createCells(cell.props.colspan - 1, true))
            colIdx += cell.props.colspan - 1
          }

        }

        // 计算最大列数和最小列数
        maxColLen = Math.max(maxColLen, row.children.length)

        // 补全
        if (row.children.length < maxColLen) {
          // @ts-ignore
          row.children.push(...createCells(maxColLen - row.children.length))
        }
      }

      const widths = tableColumnWidths(o.node, maxColLen)
      const mode = o.node.properties['dataBcTableColumnSizing']
      currentNode.props['colWidths'] = widths ?? Array(maxColLen).fill(120)
      if (mode === 'auto' || (mode !== 'fixed' && !widths)) currentNode.props['columnSizing'] = 'auto'

      walkerContext.closeNode();
    }
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;
      const auto = o.node.props['columnSizing'] === 'auto'
      const widths = o.node.props['colWidths']
      const colgroup: Element[] = !auto && Array.isArray(widths) ? [{
        type: 'element', tagName: 'colgroup', properties: {},
        children: widths.map(width => ({
          type: 'element', tagName: 'col', children: [],
          properties: {width: typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : 120},
        })),
      }] : []

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'table',
            properties: auto ? {
              dataBcTableColumnSizing: 'auto',
              style: 'table-layout:auto;width:100%',
            } : {dataBcTableColumnSizing: 'fixed'},
            children: [
              ...colgroup,
              {
                type: 'element',
                tagName: 'tbody',
                properties: {},
                children: [],
              }
            ],
          },
          'children'
        )
    },
    leave: async (o, context) => {
      if (o.node.flavour !== 'table') return
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
};

export const tableRowBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'tr',
  fromMatch: o => o.node.flavour === 'table-row',
  toBlockSnapshot: {
    enter: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext} = context;
      walkerContext.openNode(
        {
          id: generateId(),
          nodeType: BlockNodeType.block,
          flavour: 'table-row',
          props: {},
          meta: {},
          children: [],
        }
      )
    },
    leave: async (o, context) => {
      const {walkerContext} = context;
      if (!HastUtils.isElement(o.node) || walkerContext.currentNode()?.flavour !== 'table-row') {
        return;
      }
      walkerContext.closeNode();
    }
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'tr',
            properties: {},
            children: [],
          },
          'children'
        )
    },
    leave: async (o, context) => {
      if (o.node.flavour !== 'table-row') return
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
};

export const tableCellBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && (o.node.tagName === 'td' || o.node.tagName === 'th'),
  fromMatch: o => o.node.flavour === 'table-cell',
  toBlockSnapshot: {
    enter: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext, deltaConverter} = context;

      const cellObj = {
        id: generateId(),
        nodeType: BlockNodeType.block,
        flavour: 'table-cell',
        props: {},
        meta: {},
        children: [],
      } as IBlockSnapshot
      if (o.node.properties["colSpan"]) {
        const colspan = typeof o.node.properties["colSpan"] === 'number' ? o.node.properties["colSpan"] : Number(o.node.properties["colSpan"])
        if (colspan > 1) cellObj.props['colspan'] = colspan
      }
      if (o.node.properties["rowSpan"]) {
        const rowspan = typeof o.node.properties["rowSpan"] === 'number' ? o.node.properties["rowSpan"] : Number(o.node.properties["rowSpan"])
        if (rowspan > 1) cellObj.props['rowspan'] = rowspan
      }

      walkerContext.openNode(cellObj, 'children')

      if (!o.node.children.length) return

      if (HastUtils.hasTextContent(o.node)) {
        walkerContext.openNode(ParagraphBlockSchema.createSnapshot(deltaConverter.astToDelta(HastUtils.getInlineOnlyElementAST(o.node)))).closeNode()
        walkerContext.skipAllChildren()
        walkerContext.closeNode()
      }
    },
    leave: async (o, context) => {
      const {walkerContext} = context;
      const currentNode = walkerContext.currentNode()
      if (!HastUtils.isElement(o.node) || currentNode?.flavour !== 'table-cell') {
        return;
      }
      if (!currentNode?.children.length) {
        walkerContext.openNode(ParagraphBlockSchema.createSnapshot()).closeNode()
      }
      walkerContext.closeNode();
    }
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;

      if (o.node.props['display'] === 'none') {
        walkerContext.skipAllChildren()
        return
      }

      walkerContext.openNode(
        {
          type: 'element',
          tagName: 'td',
          properties: {
            colSpan: (o.node.props['colspan'] || 1) as any,
            rowSpan: (o.node.props['rowspan'] || 1) as any,
          },
          children: [],
        },
        'children'
      )
    },
    leave: async (o, context) => {
      if (o.node.flavour !== 'table-cell' || o.node.props['display'] === 'none') return
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
};
