import {EditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {
  BlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/schema/block-schema";
import {BulletBlockComponent} from "./bullet.block";

export interface BulletBlockModel extends EditableBlockNative {
  flavour: 'bullet'
}

export const BulletBlockSchema: BlockSchemaOptions<BulletBlockModel> = {
  flavour: 'bullet',
  nodeType: BlockNodeType.editable,
  component: BulletBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<BulletBlockModel>('bullet'),
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
