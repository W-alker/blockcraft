import { InjectionToken, Injectable } from '@angular/core'
import { Observable, of } from 'rxjs'

/** 天气视觉基调：驱动 weather-mark 画哪种图标（镜像 cses workbench-weather 的 tone）。 */
export type WeatherTone = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'stormy' | 'foggy'
/** 天气数据契约（对齐 cses WorkbenchWeatherDay 的可视字段，去掉实时 API 相关）。 */
export interface Weather { tone: WeatherTone; temp: number; condition: string; location: string; high: number; low: number }
// 镜像 cses dl-user-profile 的 IDlUser：姓名 + 头像 + 部门/公司（desc 行）
export interface User { name: string; avatarUrl: string; deptName?: string; orgName?: string }

/**
 * 头像：完全照搬 cses 的 AvatarPipe（@ccc/cses-common/src/pipes/avatar.pipe.ts）——
 * 有 userId → face.jinqidongli.com/{id}/{id}.jpg；没有 → 官方默认头像 default.jpg（curl 验证 200 可达）。
 * 不再本地生成头像/设颜色。
 */
export const DEFAULT_AVATAR = 'http://face.jinqidongli.com/default.jpg'
export const avatarUrl = (userId: string): string =>
  userId ? `http://face.jinqidongli.com/${userId}/${userId}.jpg` : DEFAULT_AVATAR

/** 格式化为「YYYY年MM月DD日」。用真实日期，避免写死年份（明年自动正确）。 */
const pad2 = (n: number): string => String(n).padStart(2, '0')
export const formatYMD = (d: Date): string => `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日`

/** 数据契约：按域分格、方法返回 Observable。实现可换（Mock→Real），组件不改。 */
export interface TemplateData {
  weather: { get(): Observable<Weather> }     // 当前登录用户所在地（真实实现按 IP 定位），模板不传城市
  user: { current(): Observable<User> }
  doc: { date(field: string): Observable<string> }
  // task / meeting … 后续 MVP 加域
}

export const TEMPLATE_DATA = new InjectionToken<TemplateData>('TEMPLATE_DATA')

/**
 * 当前位置天气（mock）。真实移植：按当前登录用户 IP 定位 + 天气接口取，模板设计期不设置城市。
 * 「创建时固定 vs 打开时实时」由数据层决定——建议留到真实移植再定（mock 数据不变，无影响）。
 */
const CURRENT_WEATHER: Weather = { tone: 'sunny', temp: 28, condition: '晴', location: '北京', high: 30, low: 18 }

/** MVP1 假数据：of(...) 即“冷流推一次”。移植时换 RealTemplateData（读 ctx.userInfo/docDetail/queryUsers/天气接口）。 */
@Injectable()
export class MockTemplateData implements TemplateData {
  weather = { get: () => of(CURRENT_WEATHER) }
  // 头像：给了 MOCK_USER_ID 就走 face.jinqidongli.com/{id}/{id}.jpg；没给就是官方默认头像 default.jpg
  user = { current: () => of({ name: USER_NAME, avatarUrl: avatarUrl(MOCK_USER_ID) }) }
  // 真实日期（非写死）：修改时间=今天，创建时间=示意为 3 天前，切换字段有可见差异。移植后改读 docDetail。
  doc = {
    date: (field: string) => {
      const now = new Date()
      const d = field === 'updatedAt' ? now : new Date(now.getTime() - 3 * 86400000)
      return of(formatYMD(d))
    },
  }
}

/** 当前用户姓名 + 部门/公司（dl-user-profile 的 desc 行）。 */
const USER_NAME = '张三'
/**
 * 真实头像 id：走 face.jinqidongli.com/{id}/{id}.jpg（加载失败回退 default.jpg）
 */
const MOCK_USER_ID = '6721f460fc88925dc9ae6097'
