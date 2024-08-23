export type RootNodeType = 'root'

/**
 * block: 普通的块级节点，一般这代表它有children\
 * void: 无children的block节点，且不可编辑，类似html的 <img/> 闭合标签类型 \
 * editable: 可编辑的文本块节点，和void一样，是最底层的block节点\
 */
export type BlockNodeType = 'block' | 'void' | 'editable'

/**
 *  @desc 最小的原子节点\
 * inline: 嵌入的inline组件nodeType，携带文本，可编辑\
 * inlineVoid: 嵌入的inline组件nodeType，但是不可编辑和选中，可能不携带文本\
 * text: 普通文本节点
 */
export type InlineNodeType = 'inline' | 'inlineVoid' | 'text'

export type NodeType = RootNodeType | BlockNodeType | InlineNodeType
