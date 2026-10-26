# 模板动态物料生命周期

## 现行约束

模板编辑态与普通文档态共享同一组 canonical Block flavour：

- `weather`
- `date-card`
- `person-card`
- `logo`（Playground 自有静态装饰）

新建、渲染、HTML/Markdown Adapter 和 Schema 注册都不得再使用
`template-weather`、`template-logo` 或人员 Inline Embed。

## 状态边界

模板作者配置的是“建档意向”，放在 Block `meta` 的 `draft:*` 键中；真实文档只保存已经解析后的 `props`：

| 模板快照 | 建档后的文档快照 |
|---|---|
| `weather.meta['draft:date']='createdTime'` | `weather.props.date='YYYY-MM-DD'` |
| `date-card.meta['draft:date']='createdTime'` | `date-card.props.date='YYYY-MM-DD'` |
| `person-card.meta['draft:source']='creator'` | `person-card.props.source='creator'` + `props.person` 定格 JSON |

模板编辑 surface 直接渲染 canonical 组件。`ObjectBlockComponent` 会把
`draft:*` 投影为展示 props，但动态天气在 draft projection 下不请求服务，也不把真实数据写回模板。

基于模板创建文档时，宿主先做旧快照归一化，再调用纯 snapshot
materializer 删除 `draft:*` 并写入真实 `props`，最后统一经 DocCRUD 插入文档。
天气块随后通过宿主提供的 `DOC_WEATHER_SERVICE_TOKEN` 请求天气；固定日期成功后把结果定格到 `props.frozen`，`date='live'` 则保持实时语义。

## 兼容边界

旧 flavour 只允许出现在读取迁移中：

- `template-weather` → `weather`，旧 `field` 删除并补 `meta['draft:date']='createdTime'`
- `template-logo` → `logo`
- `template-layout` → bundled `placement-layout`

迁移必须幂等。旧 converter、旧天气组件和旧人员 Embed 不再注册；因此不会继续产生旧格式。历史数据的批量迁移由独立脚本执行，不把兼容写回现行领域模型。
