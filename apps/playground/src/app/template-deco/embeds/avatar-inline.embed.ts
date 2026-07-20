import { defineEmbed } from '../core/define-embed'
import { User, DEFAULT_AVATAR } from '../data/template-data'

/**
 * 行内人员（随文 embed）：编辑态显占位（默认头像 + 姓名）；渲染态订阅 data.user.current()
 * 显真实 头像 + 姓名 + 部门/公司。DOM 精确复刻 cses dl-user-profile（.tpl-person/.tpl-avatar/.tpl-person__info）。
 * 由「块」改为「embed」——人员是随正文流动的行内元素，不再独占一行。
 */
export const AvatarInlineEmbed = defineEmbed<User>({
  name: 'template-avatar-inline',
  label: '人员',
  svgIcon: 'bc_bianjiwendangzhongdianjijiahao_xietong_renyuan',   // cses 协同_人员 彩色图标
  fetch: (data) => data.user.current(),
  renderDom: (el, user) => paintPerson(el, user.avatarUrl, user.name, false, user.deptName, user.orgName),
  editDom: (el) => paintPerson(el, DEFAULT_AVATAR, '姓名', true),
})

/** 画一份 dl-user-profile 结构：头像 + (.name + 可选 .desc 部门/公司)。 */
function paintPerson(el: HTMLElement, avatar: string, name: string, isEdit: boolean, dept?: string, org?: string): void {
  el.classList.add('tpl-person')
  if (isEdit) el.classList.add('tpl-edit')
  el.replaceChildren()

  const img = document.createElement('img')
  img.className = 'tpl-avatar'
  img.src = avatar
  img.alt = ''
  if (!isEdit) img.onerror = () => { img.onerror = null; img.src = DEFAULT_AVATAR }   // 真实头像 404 → 官方默认头像（同 cses）

  const info = document.createElement('span')
  info.className = 'tpl-person__info'
  const nameEl = document.createElement('span')
  nameEl.className = 'tpl-person__name'
  nameEl.textContent = name
  info.appendChild(nameEl)
  if (dept) {
    const desc = document.createElement('span')
    desc.className = 'tpl-person__desc'
    desc.textContent = org ? `${dept}/${org}` : dept
    info.appendChild(desc)
  }
  el.append(img, info)
}
