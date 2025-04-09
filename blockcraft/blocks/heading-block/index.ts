import {EditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/schema/block-schema";
import {HeadingOneBlockComponent} from "./heading-one.block";
import {HeadingTwoBlockComponent} from "./heading-two.block";
import {HeadingThreeBlockComponent} from "./heading-three.block";
import {HeadingFourBlockComponent} from "./heading-four.block";

export interface HeadingOneBlockModel extends EditableBlockNative {
  flavour: 'heading-one'
}

export interface HeadingTwoBlockModel extends EditableBlockNative {
  flavour: 'heading-two'
}

export interface HeadingThreeBlockModel extends EditableBlockNative {
  flavour: 'heading-three'
}

export interface HeadingFourBlockModel extends EditableBlockNative {
  flavour: 'heading-four'
}

export const HeadingOneBlockSchema: IBlockSchemaOptions<HeadingOneBlockModel> = {
  flavour: 'heading-one',
  nodeType: BlockNodeType.editable,
  component: HeadingOneBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<HeadingOneBlockModel>('heading-one'),
  metadata: {
    version: 1,
    label: "一级标题",
    icon: "bc_icon bc_biaoti_1"
  }
}

export const HeadingTwoBlockSchema: IBlockSchemaOptions<HeadingTwoBlockModel> = {
  flavour: 'heading-two',
  nodeType: BlockNodeType.editable,
  component: HeadingTwoBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<HeadingTwoBlockModel>('heading-two'),
  metadata: {
    version: 1,
    label: "二级标题",
    icon: "bc_icon bc_biaoti_2"
  }
}

export const HeadingThreeBlockSchema: IBlockSchemaOptions<HeadingThreeBlockModel> = {
  flavour: 'heading-three',
  nodeType: BlockNodeType.editable,
  component: HeadingThreeBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<HeadingThreeBlockModel>('heading-three'),
  metadata: {
    version: 1,
    label: "三级标题",
    icon: "bc_icon bc_biaoti_3"
  }
}

export const HeadingFourBlockSchema: IBlockSchemaOptions<HeadingFourBlockModel> = {
  flavour: 'heading-four',
  nodeType: BlockNodeType.editable,
  component: HeadingFourBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<HeadingFourBlockModel>('heading-four'),
  metadata: {
    version: 1,
    label: "四级标题",
    icon: "bc_icon bc_biaoti_4"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'heading-one': HeadingOneBlockComponent
      'heading-two': HeadingTwoBlockComponent
      'heading-three': HeadingThreeBlockComponent
      'heading-four': HeadingFourBlockComponent
    }

    interface IBlockCreateParameters {
      'heading-one': EditableBlockCreateSnapshotParams
      'heading-two': EditableBlockCreateSnapshotParams
      'heading-three': EditableBlockCreateSnapshotParams
      'heading-four': EditableBlockCreateSnapshotParams
    }
  }
}
