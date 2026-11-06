import type { DocFileService } from '@ccc/blockcraft'

/**
 * 选一张本地图片并读成 data: URL（base64）。
 *
 * 为什么不用 `fileService.createObjectURL()`：MyDocFileService 返回的是带前缀的
 * `__blockcraft_local__:blob:...` key（给 ImageBlock 的上传流水线用），直接丢进
 * `<img [src]>` 浏览器无法加载 → 选完图看不到。框架 ImageBlock 靠 2s 模拟上传 +
 * `_previewUri` 兜这层；装饰块没有上传后端，data URL 最省事：立即可显，且随
 * snapshot 复制到「预览态」doc 后依然有效（纯字符串、不依赖 blob 生命周期）。
 *
 * @returns data URL；用户取消或文件超限时返回 null。
 */
export async function pickImageAsDataURL(fileService: DocFileService): Promise<string | null> {
  const files = await fileService.inputFiles('image/*')
  if (!files || files.length === 0) return null
  const file = files[0]
  if (fileService.isOverMaxSize(file.size)) return null
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
