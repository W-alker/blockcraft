import {ASTWalkerContext} from "./context";
import {BlockCraftError, ErrorCode} from "../../global";

type Keyof<T> = T extends unknown ? keyof T : never;

type WalkerFn<ONode extends object, TNode extends object> = (
  o: NodeProps<ONode>,
  context: ASTWalkerContext<TNode>
) => Promise<void> | void;

export type NodeProps<Node extends object> = {
  node: Node;
  next?: Node | null;
  parent: NodeProps<Node> | null;
  prop: Keyof<Node> | null;
  index: number | null;
};

// Ported from https://github.com/Rich-Harris/estree-walker MIT License
export class ASTWalker<ONode extends object, TNode extends object | never> {
  private _enter: WalkerFn<ONode, TNode> | undefined;

  private _isONode!: (node: unknown) => node is ONode;

  private _leave: WalkerFn<ONode, TNode> | undefined;

  private _visit = async (o: NodeProps<ONode>) => {
    if (!o.node) return;
    this.context._skipChildrenNum = 0;
    this.context._skip = false;

    if (this._enter) {
      await this._enter(o, this.context);
    }

    if (this.context._skip) {
      return;
    }

    for (const key in o.node) {
      const value = o.node[key];

      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (
            let i = this.context._skipChildrenNum;
            i < value.length;
            i += 1
          ) {
            const item = value[i];
            if (
              item !== null &&
              typeof item === 'object' &&
              this._isONode(item)
            ) {
              const nextItem = value[i + 1] ?? null;
              await this._visit({
                node: item,
                next: nextItem,
                parent: o,
                prop: key as unknown as Keyof<ONode>,
                index: i,
              });
            }
          }
        } else if (
          this.context._skipChildrenNum === 0 &&
          this._isONode(value)
        ) {
          await this._visit({
            node: value,
            next: null,
            parent: o,
            prop: key as unknown as Keyof<ONode>,
            index: null,
          });
        }
      }
    }

    if (this._leave) {
      await this._leave(o, this.context);
    }
  };

  private context: ASTWalkerContext<TNode>;

  setEnter = (fn: WalkerFn<ONode, TNode>) => {
    this._enter = fn;
  };

  setLeave = (fn: WalkerFn<ONode, TNode>) => {
    this._leave = fn;
  };

  setONodeTypeGuard = (fn: (node: unknown) => node is ONode) => {
    this._isONode = fn;
  };

  walk = async (oNode: ONode, tNode: TNode) => {
    this.context.openNode(tNode);
    await this._visit({ node: oNode, parent: null, prop: null, index: null });
    if (this.context.stack.length !== 1) {
      throw new BlockCraftError(ErrorCode.DefaultRuntimeError, 'There are unclosed nodes');
    }
    return this.context.currentNode();
  };

  walkONode = async (oNode: ONode) => {
    await this._visit({ node: oNode, parent: null, prop: null, index: null });
  };

  constructor() {
    this.context = new ASTWalkerContext<TNode>();
  }
}
