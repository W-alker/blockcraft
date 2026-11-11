# 链接转块扩展设计

## 领域与职责

- 宿主资源域：识别资源身份、授权读取、提供持久资源引用和目标块创建参数。无权在解析回调中改正文。
- 链接展示域：解析协议、目标菜单和请求生命周期，由 plugins/link-block-resolver.ts 与 link-view-utils.ts 拥有。
- 文档编辑域：继续通过现有 SchemaManager、相对范围、只读／父容器规则、DocCRUD 和 Undo 执行转换。
- 目标块域：目标块自己拥有加载、预览、编辑和访问权限；框架不认识 spreadsheet 等业务类型，也不新增预览引擎。

## 协议

LINK_BLOCK_RESOLVER 从 Doc 的 Injector 解析，resolve(normalizedUrl, {phase, signal}) 支持同步或 Promise。
block 返回 label、flavour、params；blocked 明确拒绝；unhandled 才能回退内置统一网页或旧平台块。
错误、无效结果、缺少 Schema 和 root 目标均不回退。菜单不授予权限，执行再次解析。
解析不创建资源，params 不承载临时授权凭据；业务授权与缓存隔离由宿主拥有。

## 状态与生命周期

菜单：idle → loading → ready / unavailable / failed；输入、销毁或新请求取消旧请求，晚到结果不得更新菜单。
执行：capture → resolving → revalidate → create snapshot → one transaction → select target。
行内源使用 OneShotRangeAnchor 跟随前置文本变化，校验范围文字与链接属性；卡片校验块身份及 URL。
解析期间不占用 Yjs 事务或 Undo capture，不扫描全文。提交前重验只读、锁、父容器及目标 Schema。
取消和失败不改正文；成功保留前后格式、使用一次独立撤销。自定义目标块的反向转换不在本轮范围。

## 验证

定向浏览器单元测试覆盖解析三态、错误／取消、文档隔离、原生菜单、附件及第三方 Schema、前后格式、
异步范围漂移、源变化、只读、父容器限制和撤销重做。现有三浏览器链接／卡片／网页互转继续回归。
自定义资源块是测试 fixture，不代表 CSES 电子表格／真实附件授权与后端集成验收；客户端待正式版本后接入。
