/**
 * Angular iframe 模板必须静态声明 sandbox；纯 DOM 渲染路径复用同一组兼容权限。
 * 不从 package public barrel 导出。
 */
export const IFRAME_SANDBOX_FLAGS =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-storage-access-by-user-activation'
