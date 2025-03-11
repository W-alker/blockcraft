import {EditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {
  BlockSchemaOptions,
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

export const HeadingOneBlockSchema: BlockSchemaOptions<HeadingOneBlockModel> = {
  flavour: 'heading-one',
  nodeType: BlockNodeType.editable,
  component: HeadingOneBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn('heading-one'),
  metadata: {
    version: 1,
    label: "一级标题"
  }
}

export const HeadingTwoBlockSchema: BlockSchemaOptions<HeadingTwoBlockModel> = {
  flavour: 'heading-two',
  nodeType: BlockNodeType.editable,
  component: HeadingTwoBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn('heading-two'),
  metadata: {
    version: 1,
    label: "二级标题"
  }
}


export const HeadingThreeBlockSchema: BlockSchemaOptions<HeadingThreeBlockModel> = {
  flavour: 'heading-three',
  nodeType: BlockNodeType.editable,
  component: HeadingThreeBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn('heading-three'),
  metadata: {
    version: 1,
    label: "三级标题"
  }
}


export const HeadingFourBlockSchema: BlockSchemaOptions<HeadingFourBlockModel> = {
  flavour: 'heading-four',
  nodeType: BlockNodeType.editable,
  component: HeadingFourBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn('heading-four'),
  metadata: {
    version: 1,
    label: "四"
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
