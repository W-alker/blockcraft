import { PlacementBox, resolvePlacementBox, pxToPlacementPct } from '../../core/placement'

/**
 * 指针自由拖动一个元素封装成「输出一个落点坐标
 * 框架缩放手柄的选择器——**唯一定义处**。两套拖拽拦截都要放行它（按到手柄=缩放不是移动）：
 * 物料编辑基类的 host 监听（PlaceableEditBase）与容器捕获拾取（underlay-pick）。
 * 框架若改手柄标签名，只改这里。
 */
export const RESIZER_SELECTOR = 'block-resizer'

/** 抬起后才存在的一整套状态（定位系 + 还原快照 + 最新位置）；`lift` 为 null = 还在流里（点击/待定）。 */
type Lift = {
  prevStyle: { position: string; margin: string; left: string; top: string; transform: string }
  baseTransform: string
  frame: { box: PlacementBox; left0: number; top0: number } | null   // 定位父解析不到 = 半抬起（能还原、不能提交）
  last: { left: number; top: number }
}

/**
 * 装饰的「自由拖拽定位」共享逻辑（所有可自由摆放的物料共用一份，不各抄——同 storeResizedWidth）。
 *
 * 边界：本函数只做「指针 → 算坐标 → 回调 commit」，**不碰 Yjs**；调用方传 commit（如 commitAbsolute）。
 * 坐标系不在这定义：定位父盒解析 / px→% 换算统一来自 core/placement.ts（排版域唯一真源）——
 * 拖拽（这里）、面板就地浮起（measurePlacementXY）用的是同一套原点和公式，不会再各算各的产生偏移。
 *
 * 交互模型：物料默认留在文档流里。**只点不拖 → 什么都不做**（不脱流、不提交）；
 * **真正拖动（越过 3px 阈值）那一刻才"抬起"成 absolute**——点击不脱流、不因换基准跳动。
 * 拖动期用 **transform 位移直写**做实时预览（left/top 每帧改会反复触发布局，编辑页 DOM 一大
 * 快拖就跟不上指针；translate 走合成器。临时值，不写 Yjs），松手把位移落回 left/top、撤下预览
 * transform，再回调 commit 一次（进 Yjs + 一步撤销）。
 * ⚠️ 不要给预览再包 rAF"合帧"：Chrome 本就按帧对齐派发 pointermove（输入阶段、先于所有 rAF 回调），
 * 直写即是一帧一次；包 rAF 反而把写入挪到 rAF 阶段——选中框跟随循环的 rAF 上一帧就注册、排在前面，
 * 每帧读到的是上一帧位置，框慢物料半拍（实测被用户抓到"拖拽有延迟"）。
 * y 用 px：编辑器当前自适应高度，`top:%` 会漂；将来分页固定高再换 %。
 * 落点**不做范围限制**：悬浮的语义就是脱离文档流自由摆放，「关在定位父盒里」是流内块的思维
 * ——负坐标 / 超出页面都是合法落点（横向拖出内容列会被 .editor-scroll 的 overflow-x:hidden 裁掉，
 * 视觉上消失但数据还在；commit 是一步 Yjs 事务，Ctrl+Z 可整体撤回）。
 *
 * 生命周期：document 上的 move/up/cancel 三个监听在结束时一并移除。
 * `pointercancel`（触摸滚动接管 / 右键菜单 / 多指等系统打断）**不提交**，并还原抬起前的内联样式
 * ——否则监听残留，下次移动鼠标会用陈旧起点"魂拖"元素。
 *
 * 相位收敛：抬起时才诞生的一批值（定位盒 box、原点 left0/top0、还原快照 prevStyle、既有 baseTransform、
 * 最新位置 last）统一收进一个可空的 `Lift` 对象，不再散成 8 个 let——`lift != null` 即「已抬起」的唯一真源，
 * `lift.frame` 区分「完整抬起 / 半抬起」，非法中间态（有 left0 却没 box）在类型上就表达不出来。
 */
export function startFreeDrag(
  ev: PointerEvent,//起始按下 获取坐标
  hostEl: HTMLElement,//拖拽的物料
  commit: (xPct: number, yPx: number) => void,//松手才触发的回调
): void {
  if (!hostEl.closest('.editor-container')) return       // 兜底：不在编辑器列里就不接管（放行原生行为）
  ev.preventDefault()                                    // 挡原生图片拖拽 / 选字（点/拖都挡）
  const startX = ev.clientX
  const startY = ev.clientY
  let lift: Lift | null = null                           // 唯一相位真源：null=待定(点击/未越阈值)，非 null=已抬起

  // 第一次真正拖动才脱流：转 absolute + 清 margin（absolute 下 top/left 定位 margin 边，块的 margin 会顶右下）。
  // 返回整套抬起态；定位父解析不到 → frame:null 的「半抬起」（已改 DOM，能 cancel 还原、但不预览/不提交）。
  const doLift = (): Lift => {
    const prevStyle = { position: hostEl.style.position, margin: hostEl.style.margin, left: hostEl.style.left, top: hostEl.style.top, transform: hostEl.style.transform }
    const baseTransform = hostEl.style.transform         // 抬起时已有的内联 transform（悬浮态 rotate 绑定值）：预览位移叠在它外层，旋转姿态不变
    const before = hostEl.getBoundingClientRect()        // 脱流前的视口位置：抬起后据此原地定住，不跳
    hostEl.style.position = 'absolute'
    hostEl.style.margin = '0'
    const box = resolvePlacementBox(hostEl)              // absolute 后 offsetParent = 真实定位父
    if (!box) return { prevStyle, baseTransform, frame: null, last: { left: 0, top: 0 } }
    // 用视觉中心反推未旋转盒的左上：rect 是轴对齐外接框，已旋转的悬浮物料直接取 rect.left/top
    // 会带上（外接框-真实盒）的差值，拖拽起手就跳一格；中心是旋转不变量，减去布局半宽高即真实盒左上
    // （未旋转时两式等价，行为不变）
    const left0 = before.left + before.width / 2 - box.originX - hostEl.offsetWidth / 2
    const top0 = before.top + before.height / 2 - box.originY - hostEl.offsetHeight / 2
    hostEl.style.left = `${left0}px`
    hostEl.style.top = `${top0}px`
    return { prevStyle, baseTransform, frame: { box, left0, top0 }, last: { left: left0, top: top0 } }
  }

  const move = (e: PointerEvent): void => {
    if (!lift && Math.abs(e.clientX - startX) <= 3 && Math.abs(e.clientY - startY) <= 3) return   // 3阈值内 = 还算点击，不脱流
    const cur = lift ?? (lift = doLift())               // 首次越过 3px → 抬起脱流
    if (!cur.frame) return                              // 半抬起（定位父解析失败）：不预览
    const dx = e.clientX - startX                       // 无 clamp：悬浮自由落点（见文件头「不做范围限制」）
    const dy = e.clientY - startY
    cur.last = { left: cur.frame.left0 + dx, top: cur.frame.top0 + dy }
    // 实时预览：输入阶段直写 transform（临时值，不写 Yjs）。translate 在既有 rotate 外层——先转再平移，姿态不变。
    // 改 left/top 每帧触发布局重排(layout),编辑器 DOM 一大就跟不上指针;translate 走合成器(compositor),不重排,
    hostEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)${cur.baseTransform ? ` ${cur.baseTransform}` : ''}`
  }
  const cleanup = (): void => {
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', up)
    document.removeEventListener('pointercancel', cancel)
  }
  //落库
  const up = (): void => {
    cleanup()
    if (!lift || !lift.frame) return                    // 只点没拖 / 半抬起 → 不提交,元素留在流里,无跳
    hostEl.style.left = `${lift.last.left}px`            // 位移从 transform 落回 left/top 再撤预览：同一任务内完成，无中间帧
    hostEl.style.top = `${lift.last.top}px`
    hostEl.style.transform = lift.baseTransform
    commit(pxToPlacementPct(lift.last.left, lift.frame.box.width), Math.round(lift.last.top))
  }
  const cancel = (): void => {
    cleanup()
    if (!lift) return                                   // 从没抬起 → 没动过 DOM，无需还原
    const { prevStyle } = lift                          // 被系统打断：不提交，还原抬起前样式（回到原位/原绑定值）
    hostEl.style.position = prevStyle.position
    hostEl.style.margin = prevStyle.margin
    hostEl.style.left = prevStyle.left
    hostEl.style.top = prevStyle.top
    hostEl.style.transform = prevStyle.transform
  }
  document.addEventListener('pointermove', move)
  document.addEventListener('pointerup', up)
  document.addEventListener('pointercancel', cancel)
}
