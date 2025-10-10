import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils} from "../../utils";
import {BlockNodeType, generateId, IBlockSnapshot} from "../../../framework";
import {ParagraphBlockSchema, TableCellBlockModel, TableCellBlockSchema} from "../../../blocks";
import {BlockCraftError, ErrorCode, splitDeltaByLineBreak} from "../../../global";

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

      let maxTdLen = 0
      for (let rowIdx = 0; rowIdx < currentNode.children.length; rowIdx++) {
        const row = currentNode.children[rowIdx] as IBlockSnapshot
        // if (!row.children.length) {
        //   throw new BlockCraftError(ErrorCode.DefaultRuntimeError, `No td block parsed in table row`)
        // }
        if (row.flavour !== 'table-row') {
          throw new BlockCraftError(ErrorCode.DefaultRuntimeError, `Unexpected block type: ${row.flavour} in table`)
        }

        maxTdLen = Math.max(maxTdLen, row.children.length)

        // 出栈时遍历单元格，补全colspan和rowspan大于1时缺少的隐藏单元格
        // for (let colIdx = 0; colIdx < row.children.length; colIdx++) {
        //   const cell = row.children[colIdx] as IBlockSnapshot<TableCellBlockModel['props']>
        //   if (cell.flavour !== 'table-cell') {
        //     throw new BlockCraftError(ErrorCode.DefaultRuntimeError, `Unexpected block type in table-row`)
        //   }
        //
        //   if (!cell.children.length) {
        //     // @ts-ignore
        //     cell.children.push(ParagraphBlockSchema.createSnapshot())
        //   }
        //
        //   if (cell.props.colspan && cell.props.colspan > 1) {
        //     // 添加隐藏单元格
        //     for (let k = 1; k < cell.props.colspan; k++) {
        //       row.children.splice(colIdx + k, 0, createHiddenCell(cell.id))
        //     }
        //   }
        //
        //   if (cell.props.rowspan && cell.props.rowspan > 1) {
        //     // 添加隐藏单元格
        //     for (let k = 1; k < cell.props.rowspan; k++) {
        //       const row = currentNode.children[k + rowIdx] as IBlockSnapshot
        //       row.children.splice(colIdx, 0, ...new Array(cell.props.colspan || 1).fill(0).map(() => createHiddenCell(cell.id)))
        //     }
        //   }
        // }
      }

      // 再遍历一遍，补齐可能残缺的td
      for (let rowIdx = 0; rowIdx < currentNode.children.length; rowIdx++) {
        const row = currentNode.children[rowIdx] as IBlockSnapshot

        if (row.children.length < maxTdLen) {
          // @ts-ignore
          row.children.push(...new Array(maxTdLen - row.children.length).fill(0).map(() => TableCellBlockSchema.createSnapshot()))
        }
      }

      //补齐colWidths
      if (currentNode?.flavour === 'table' && !currentNode.props['colWidths']) {
        const firstTr = currentNode.children[0] as IBlockSnapshot
        currentNode.props['colWidths'] = new Array(firstTr.children.length).fill(120)
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
            tagName: 'table',
            properties: {},
            children: [
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
      // const colspan = Number(o.node.properties["colSpan"])
      // const rowspan = Number(o.node.properties["rowSpan"])

      // const delta = deltaConverter.astToDelta(o.node)
      // const deltas = splitDeltaByLineBreak(delta)
      // const paragraphs = deltas.map(d => ParagraphBlockSchema.createSnapshot(d))

      walkerContext.openNode({
        id: generateId(),
        nodeType: BlockNodeType.block,
        flavour: 'table-cell',
        props: {},
        meta: {},
        children: [],
      }, 'children')

      if (!o.node.children.length) return

      const firChild = o.node.children[0]
      if (firChild?.type === 'text' || (HastUtils.isElement(firChild) && HastUtils.isTagInline(firChild.tagName)) ) {
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
      if(!currentNode?.children.length) {
        walkerContext.openNode(ParagraphBlockSchema.createSnapshot()).closeNode()
      }
      walkerContext.closeNode();
    }
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;

      walkerContext.openNode(
        {
          type: 'element',
          tagName: 'td',
          properties: {},
          children: [],
        },
        'children'
      )
    },
    leave: async (o, context) => {
      if (o.node.flavour !== 'table-cell') return
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
};
