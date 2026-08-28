import { InjectionToken, Injectable } from '@angular/core'
import {
  DocWeatherService,
  type DocWeatherData,
  type DocWeatherQuery,
} from '@ccc/blockcraft'
import { Observable, of } from 'rxjs'

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

/** 模板实例化所需的宿主数据；天气走独立 DocWeatherService 边界。 */
export interface TemplateData {
  user: { current(): Observable<User> }
}

export const TEMPLATE_DATA = new InjectionToken<TemplateData>('TEMPLATE_DATA')

/**
 * 当前位置天气（mock）。真实移植：按当前登录用户 IP 定位 + 天气接口取，模板设计期不设置城市。
 * 「创建时固定 vs 打开时实时」由数据层决定——建议留到真实移植再定（mock 数据不变，无影响）。
 */
export const CURRENT_WEATHER: DocWeatherData = { tone: 'sunny', temp: 28, condition: '晴', location: '北京', high: 30, low: 18 }

/** Playground 的宿主天气适配器；真实业务宿主会替换为自己的定位与天气服务。 */
@Injectable()
export class MockDocWeatherService extends DocWeatherService {
  override query = async (
    _query?: DocWeatherQuery,
    signal?: AbortSignal,
  ): Promise<DocWeatherData> => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return CURRENT_WEATHER
  }
}

/** MVP1 假数据：of(...) 即“冷流推一次”。移植时换 RealTemplateData（读 ctx.userInfo/docDetail/queryUsers/天气接口）。 */
@Injectable()
export class MockTemplateData implements TemplateData {
  // 头像：给了 MOCK_USER_ID 就走 face.jinqidongli.com/{id}/{id}.jpg；没给就是官方默认头像 default.jpg
  user = { current: () => of({ name: USER_NAME, avatarUrl: avatarUrl(MOCK_USER_ID) }) }
}

/** 当前用户姓名 + 部门/公司（dl-user-profile 的 desc 行）。 */
const USER_NAME = '张三'
/**
 * 真实头像 id：走 face.jinqidongli.com/{id}/{id}.jpg（加载失败回退 default.jpg）
 */
const MOCK_USER_ID = '6721f460fc88925dc9ae6097'
