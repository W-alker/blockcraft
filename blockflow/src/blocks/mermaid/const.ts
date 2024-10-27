export interface ITemplate {
  name: string
  template: string
}

export const TEMPLATE_LIST = [
  {
    name: '时序图',
    template: `@startuml\n用户 -> 认证中心: 登录操作\n认证中心 -> 缓存: 存放\n用户 <- 认证中心 : 认证成功返回token\n用户 -> 认证中心: 下次访问头部携带token认证\n认证中心 <- 缓存: 获取token\n其他服务 <- 认证中心: 存在且校验成功则跳转到用户请求的其他服务\n其他服务 -> 用户: 信息\n@enduml`
  },
  {
    name: '类图',
    template: `@startuml\nabstract        abstract\nabstract class  "abstract class"\nannotation      annotation\ncircle          circle\n()              circle_short_form\nclass           class\ndiamond         diamond\n<>              diamond_short_form\nentity          entity\nenum            enum\ninterface       interface\n@enduml`
  },
  {
    name: '思维导图',
    template: `@startmindmap\n** Ubuntu\n*** Linux Mint\n*** Kubuntu\n*** Lubuntu\n*** KDE Neon\n** LMDE\n** SolydXK\n** SteamOS\n** Raspbian with a very long name\n*** <s>Raspmbc</s> => OSMC\n*** <s>Raspyfi</s> => Volumio\n* Debian\n@endmindmap`,
  }
]
