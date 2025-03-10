import {EditableBlockNative, generateId} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {
  BlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/schema/block-schema";
import {BulletBlockComponent} from "./bullet.block";

export interface BulletBlockModel extends EditableBlockNative {
  flavour: 'bullet',
  props: {
    depth: number
  }
}

export const BulletBlockSchema: BlockSchemaOptions<BulletBlockModel> = {
  flavour: 'bullet',
  nodeType: BlockNodeType.editable,
  component: BulletBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn('bullet'),
  metadata: {
    version: 1,
    label: "无序列表",
    isLeaf: true
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'bullet': BulletBlockComponent
    }

    interface IBlockCreateParameters {
      'bullet': EditableBlockCreateSnapshotParams
    }
  }
}
