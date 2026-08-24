import {
  BlockNodeType,
  IBlockSchemaOptions,
  IBlockSnapshot,
  generateId,
} from '../../framework'
import {
  DateCardModel,
  DateCardRenderComponent,
} from './date-card/date-card-render.component'
import {DATE_CARD_STYLES} from './date-card/date-card.styles'
import {
  PersonCardModel,
  PersonCardRenderComponent,
} from './person-card/person-card-render.component'
import {PERSON_CARD_STYLES} from './person-card/person-card.styles'
import {
  WeatherModel,
  WeatherBlockComponent,
} from './weather/weather-render.component'

function snapshot(
  flavour: 'weather' | 'date-card' | 'person-card',
  props: Record<string, unknown>,
): IBlockSnapshot {
  return {
    id: generateId(),
    flavour,
    nodeType: BlockNodeType.void,
    meta: {},
    props,
    children: [],
  } as IBlockSnapshot
}

const metadata = (label: string, icon: string) => ({
  version: 1,
  label,
  icon,
  hideInInsertMenu: true,
  placement: {modes: ['relative', 'absolute'] as const},
})

export const WeatherBlockSchema: IBlockSchemaOptions<WeatherModel> = {
  flavour: 'weather',
  nodeType: BlockNodeType.void,
  component: WeatherBlockComponent,
  createSnapshot: () => snapshot('weather', {
    width: 160,
    height: 42,
  }),
  metadata: metadata('天气', 'bc_icon bc_taiyang'),
}

export const DateCardBlockSchema: IBlockSchemaOptions<DateCardModel> = {
  flavour: 'date-card',
  nodeType: BlockNodeType.void,
  component: DateCardRenderComponent,
  createSnapshot: () => snapshot('date-card', {
    ...DATE_CARD_STYLES.defaultSize,
  }),
  metadata: metadata('日期卡片', 'bc_icon bc_rili'),
}

export const PersonCardBlockSchema: IBlockSchemaOptions<PersonCardModel> = {
  flavour: 'person-card',
  nodeType: BlockNodeType.void,
  component: PersonCardRenderComponent,
  createSnapshot: () => snapshot('person-card', {
    ...PERSON_CARD_STYLES.defaultSize,
  }),
  metadata: metadata('人员卡片', 'bc_icon bc_renwukapian'),
}
