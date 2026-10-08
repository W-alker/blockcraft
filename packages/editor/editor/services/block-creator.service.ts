import {Injectable, Injector} from "@angular/core";
import {BlockCreatorService} from "../../framework";
import {IBlockSchemaOptions} from "../../framework/block-std/schema/block-schema";
import {DOC_FILE_SERVICE_TOKEN} from "../../framework";
import {Overlay} from "@angular/cdk/overlay";
import {EmbedFrameCreator} from "./embed-frame-creator";
import {MediaCreatorComponent, MediaCreatorResult} from "../../components/media-creator";
import {ComponentPortal} from "@angular/cdk/portal";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {CsModalService} from '@cses/ui';
import {take, takeUntil} from 'rxjs';

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
        if (!file) return null
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
        if (imageResult == null) return null
        params.push(imageResult)
        break
      case 'juejin-embed':
      case 'figma-embed':
      case 'embed':
        const urlRes = await this.onShowFrameInputPad(schema)
        if (urlRes == null) return null
        params.push(urlRes)
        break
      case 'bookmark':
        const bookmarkUrl = await this.onShowFrameInputPad(schema)
        if (bookmarkUrl == null) return null
        params.push(bookmarkUrl)
        break
      case 'video':
        const videoResult = await this.onShowMediaCreator(schema, 'video')
        if (videoResult == null) return null
        params.push(videoResult)
        break
      case 'audio':
        const audioResult = await this.onShowMediaCreator(schema, 'audio')
        if (audioResult == null) return null
        params.push(audioResult)
        break
    }

    return params
  }

  private onShowFrameInputPad(schema: IBlockSchemaOptions) {
    const ref = this.injector.get(CsModalService).open<{schema: IBlockSchemaOptions}, string, EmbedFrameCreator>({
      content: EmbedFrameCreator,
      data: {schema}, title: schema.metadata.label,
      width: 'min(360px, calc(100vw - 48px))', centered: true, footer: null,
    })
    return new Promise<string | null>(resolve => {
      ref.afterClose.pipe(take(1)).subscribe(url => resolve(typeof url === 'string' ? url : null))
      ref.componentInstance!.onSubmit.pipe(take(1), takeUntil(ref.afterClose)).subscribe(url => ref.close(url))
      ref.componentInstance!.onCancel.pipe(take(1), takeUntil(ref.afterClose)).subscribe(() => ref.close())
    })
  }

  private onShowMediaCreator(schema: IBlockSchemaOptions, mediaType: 'image' | 'video' | 'audio'): Promise<any | null> {
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
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (value: any | null) => {
        if (settled) return
        settled = true
        ovr.dispose()
        resolve(value)
      }
      ovr.backdropClick()
        .pipe(takeUntilDestroyed(cpr.instance.destroyer))
        .subscribe(() => finish(null))
      cpr.instance.onSubmit.pipe(takeUntilDestroyed(cpr.instance.destroyer)).subscribe((result: MediaCreatorResult) => {
        if (mediaType === 'image') {
          switch (result.type) {
            case 'link':
              finish(result.url)
              return
            case 'local':
              if (result.file) {
                if (this.fileService.isOverMaxSize(result.file.size)) {
                  ovr.dispose()
                  reject(new Error('图片过大'))
                  return
                }
                finish({
                  src: this.fileService.createObjectURL(result.file),
                })
                return
              }
              finish(null)
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

        finish(params)
      })

      cpr.instance.onCancel.pipe(takeUntilDestroyed(cpr.instance.destroyer)).subscribe(() => {
        finish(null)
      })
    })
  }

}
