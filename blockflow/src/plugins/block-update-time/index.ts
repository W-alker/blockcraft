import {BaseBlock, BlockModel, Controller, IBaseMetadata, IPlugin} from "../../core";

export class BlockUpdateTimePlugin implements IPlugin {
  name: string = 'block-update-time';
  version = 1.0;

  init(controller: Controller) {

    const setModifyRecord = (model: BlockModel, time: number = Date.now(), ) => {
      const m: IBaseMetadata['lastModified'] = {
        time,
        ...controller.config.localUser
      }
      model.setMeta('lastModified', m)
    }

    controller.blockUpdate$.subscribe( u => {
      if(u.event.transaction.origin === controller.historyManager) return;
      if (u.event.transaction.local) {
        setModifyRecord(u.block.model)
      }
    })

    const pid = this.model.getParentId()
    if(!pid) return
    const parentModel = this.controller.getBlockModel(pid)
    if(!parentModel) return
    // @ts-ignore
    parentModel.update$.next({type: 'children', event: t.event})
  }


  destroy() {

  }
}
