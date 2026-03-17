import {DeltaInsert, DocFileService, IBlockSnapshot, IInlineNodeAttrs} from "../../framework";
import {ASTWalker, NodeProps} from "../base/ast-walker";
import {ASTWalkerContext} from "../base/context";

export type AdapterContext<
  ONode extends object,
  TNode extends object = never,
  TConverter extends DeltaASTConverter = DeltaASTConverter,
> = {
  walker: ASTWalker<ONode, TNode>;
  walkerContext: ASTWalkerContext<TNode>;
  fileManager: DocFileService
  // configs: Map<string, string>;
  // job: Job;
  deltaConverter: TConverter;
  // textBuffer: TextBuffer;
  // assets?: AssetsManager;
  pageMap?: Map<string, string>;
  updateAssetIds?: (assetsId: string) => void;
};

export abstract class DeltaASTConverter<
  TextAttributes extends IInlineNodeAttrs = IInlineNodeAttrs,
  AST = unknown,
> {
  /**
   * Convert AST format to delta format
   */
  abstract astToDelta(
    ast: AST,
    options?: unknown
  ): DeltaInsert[];

  /**
   * Convert delta format to AST format
   */
  abstract deltaToAST(
    deltas: DeltaInsert[],
    options?: unknown
  ): AST[];
}

/**
 * Defines the interface for adapting between different blocks and target formats.
 * Used to convert blocks between a source format (TNode) and BlockSnapshot format.
 *
 * @template TNode - The source/target node type to convert from/to
 * @template TConverter - The converter used for handling delta format conversions
 */
export type BlockAdapterMatcher<
  TNode extends object = never,
  TConverter extends DeltaASTConverter = DeltaASTConverter,
> = {
  /**
   * Function to check if a target node matches this adapter
   * @param o - The target node properties to check
   * @returns true if this adapter can handle the node
   */
  toMatch: (o: NodeProps<TNode>) => boolean;

  /**
   * Function to check if a BlockSnapshot matches this adapter
   * @param o - The BlockSnapshot properties to check
   * @returns true if this adapter can handle the snapshot
   */
  fromMatch: (o: NodeProps<IBlockSnapshot>) => boolean;

  /**
   * Handlers for converting from target format to BlockSnapshot
   */
  toBlockSnapshot: {
    /**
     * Called when entering a target walker node during traversal
     * @param o - The target node properties
     * @param context - The adapter context
     */
    enter?: (
      o: NodeProps<TNode>,
      context: AdapterContext<TNode, IBlockSnapshot, TConverter>
    ) => void | Promise<void>;

    /**
     * Called when leaving a target walker node during traversal
     * @param o - The target node properties
     * @param context - The adapter context
     */
    leave?: (
      o: NodeProps<TNode>,
      context: AdapterContext<TNode, IBlockSnapshot, TConverter>
    ) => void | Promise<void>;
  };

  /**
   * Handlers for converting from BlockSnapshot to target format
   */
  fromBlockSnapshot: {
    /**
     * Called when entering a BlockSnapshot walker node during traversal
     * @param o - The BlockSnapshot properties
     * @param context - The adapter context
     */
    enter?: (
      o: NodeProps<IBlockSnapshot>,
      context: AdapterContext<IBlockSnapshot, TNode, TConverter>
    ) => void | Promise<void>;

    /**
     * Called when leaving a BlockSnapshot walker node during traversal
     * @param o - The BlockSnapshot properties
     * @param context - The adapter context
     */
    leave?: (
      o: NodeProps<IBlockSnapshot>,
      context: AdapterContext<IBlockSnapshot, TNode, TConverter>
    ) => void | Promise<void>;
  };
};

export type DeltaASTConverterOptions = {
  trim?: boolean;
  pre?: boolean;
  pageMap?: Map<string, string>;
  removeLastBr?: boolean;
};

export type ASTToDeltaMatcher<AST> = {
  name: string;
  match: (ast: AST) => boolean;
  toDelta: (
    ast: AST,
    context: {
      configs: Map<string, string>;
      options: DeltaASTConverterOptions;
      toDelta: (
        ast: AST,
        options?: DeltaASTConverterOptions
      ) => DeltaInsert[];
    }
  ) => DeltaInsert[];
};

export type InlineDeltaMatcher<TNode extends object = never> = {
  name: keyof IInlineNodeAttrs | string;
  match: (delta: DeltaInsert) => boolean;
  toAST: (
    delta: DeltaInsert,
    context: {
      configs: Map<string, string>;
      current: TNode;
    }
  ) => TNode;
};
