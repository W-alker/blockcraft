import {Injectable, Injector} from "@angular/core";
import {BlockCreatorService} from "../../framework";
import {IBlockSchemaOptions} from "../../framework/block-std/schema/block-schema";
import {DOC_FILE_SERVICE_TOKEN} from "../../framework";
import {Overlay} from "@angular/cdk/overlay";
import {EmbedFrameCreator} from "./embed-frame-creator";
import {MediaCreatorComponent, MediaCreatorResult} from "../../components/media-creator";
import {ComponentPortal} from "@angular/cdk/portal";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

@Injectable()
export class MyBlockCreatorService extends BlockCreatorService {

  fileService = this.injector.get(DOC_FILE_SERVICE_TOKEN)

  constructor(private injector: Injector) {
    super()
  }

  async getParamsByScheme<T extends IBlockSchemaOptions>(schema: T): Promise<BlockCraft.BlockCreateParameters<T['flavour']> | null> {
    const params: any = []
    switch (schema.flavour) {
      case 'attachment':
        const fileList = await this.fileService.inputFiles()
        const file = fileList[0]
        if (this.fileService.isOverMaxSize(file.size)) {
          throw new Error('文件过大')
        }
        params.push({
          name: file.name,
          size: file.size,
          type: file.type,
          url: this.fileService.createObjectURL(file),
        })
        break
      case 'image':
        const imageResult = await this.onShowMediaCreator(schema, 'image')
        params.push(imageResult)
        break
      case 'juejin-embed':
      case 'figma-embed':
        const urlRes = await this.onShowFrameInputPad(schema)
        params.push(urlRes)
        break
      case 'bookmark':
        const bookmarkUrl = await this.onShowFrameInputPad(schema)
        params.push(bookmarkUrl)
        break
      case 'video':
        const videoResult = await this.onShowMediaCreator(schema, 'video')
        params.push(videoResult)
        break
      case 'audio':
        const audioResult = await this.onShowMediaCreator(schema, 'audio')
        params.push(audioResult)
        break
    }

    return params
  }

  private onShowFrameInputPad(schema: IBlockSchemaOptions) {
    const overlay = this.injector.get(Overlay)
    const ovr = overlay.create({
      positionStrategy: overlay.position().global().centerHorizontally().centerVertically(),
      scrollStrategy: overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop'
    })
    const cpr = ovr.attach(new ComponentPortal(EmbedFrameCreator))
    cpr.setInput('schema', schema)
    ovr.backdropClick().pipe(takeUntilDestroyed(cpr.instance.destroyer)).subscribe(() => ovr.dispose())

    return new Promise((resolve, reject) => {
      cpr.instance.onSubmit.pipe(takeUntilDestroyed(cpr.instance.destroyer)).subscribe((url: string) => {
        ovr.dispose()
        resolve(url)
      })

      cpr.instance.onCancel.pipe(takeUntilDestroyed(cpr.instance.destroyer)).subscribe(() => {
        ovr.dispose()
        reject()
      })
    })
  }

  private onShowMediaCreator(schema: IBlockSchemaOptions, mediaType: 'image' | 'video' | 'audio'): Promise<any> {
    const overlay = this.injector.get(Overlay)
    const ovr = overlay.create({
      positionStrategy: overlay.position().global().centerHorizontally().centerVertically(),
      scrollStrategy: overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop'
    })
    const cpr = ovr.attach(new ComponentPortal(MediaCreatorComponent))
    cpr.setInput('schema', schema)
    cpr.setInput('mediaType', mediaType)
    ovr.backdropClick().pipe(takeUntilDestroyed(cpr.instance.destroyer)).subscribe(() => ovr.dispose())

    return new Promise((resolve, reject) => {
      cpr.instance.onSubmit.pipe(takeUntilDestroyed(cpr.instance.destroyer)).subscribe((result: MediaCreatorResult) => {
        ovr.dispose()
        if (mediaType === 'image') {
          switch (result.type) {
            case 'link':
              resolve(result.url)
              return
            case 'local':
              if (result.file) {
                if (this.fileService.isOverMaxSize(result.file.size)) {
                  reject(new Error('图片过大'))
                  return
                }
                resolve(this.fileService.createObjectURL(result.file))
                return
              }
              reject()
              return
          }
        }

        const params: any = {
          sourceType: result.type
        }

        switch (result.type) {
          case 'link':
            params.url = result.url
            break
          case 'local':
            if (result.file) {
              params.url = this.fileService.createObjectURL(result.file)
              params.name = result.file.name
              params.size = result.file.size
              params.type = result.file.type
            }
            break
        }

        resolve(params)
      })

      cpr.instance.onCancel.pipe(takeUntilDestroyed(cpr.instance.destroyer)).subscribe(() => {
        ovr.dispose()
        reject()
      })
    })
  }

}
