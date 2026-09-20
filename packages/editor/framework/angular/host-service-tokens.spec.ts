import {Injector} from '@angular/core';
import type {DocFilePort, DocMessagePort, DocLinkPreviewPort, DocWeatherPort} from '@ccc/blockcraft/framework/ports';
import * as publicApi from '@ccc/blockcraft';
import {DOC_FILE_SERVICE_TOKEN as LEGACY_FILE, DocFileService} from '../services/file.service';
import {DOC_MESSAGE_SERVICE_TOKEN as LEGACY_MESSAGE, DocMessageService} from '../services/message.service';
import {DOC_LINK_PREVIEWER_SERVICE_TOKEN as LEGACY_LINK, DocLinkPreviewerService as LegacyLinkPreviewer} from '../services/link-previewer.service';
import {DOC_WEATHER_SERVICE_TOKEN as LEGACY_WEATHER, DocWeatherService as LegacyWeather} from '../services/weather.service';
import {DocLinkPreviewerService} from '../../editor/services/doc-link-previewer.service';
import {DocWeatherService} from '../../editor/services/doc-weather.service';
import {MyDocFileService} from '../../editor/services/doc-file-service';
import {
  DOC_FILE_SERVICE_TOKEN, DOC_MESSAGE_SERVICE_TOKEN,
  DOC_LINK_PREVIEWER_SERVICE_TOKEN, DOC_WEATHER_SERVICE_TOKEN,
} from './host-service-tokens';

type Assert<T extends true> = T;
type Equivalent<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
type FileCompatibility = Assert<Equivalent<DocFilePort, DocFileService>>;
type MessageCompatibility = Assert<Equivalent<DocMessagePort, DocMessageService>>;
type WeatherCompatibility = Assert<Equivalent<DocWeatherPort, DocWeatherService>>;
// 链接默认类有 private/protected 成员，端口只覆盖公开契约；Token 继续保留原类类型。
type LinkCompatibility = Assert<Equivalent<DocLinkPreviewPort, Pick<DocLinkPreviewerService, 'query'>>>;

// @ts-expect-error 基类仍要求宿主实现原有抽象成员，不能因引入 Port 而取消约束。
class IncompleteFileService extends DocFileService {}

describe('host service boundary compatibility', () => {
  it('keeps the same tokens through legacy paths and the public root', () => {
    expect(DOC_FILE_SERVICE_TOKEN).toBe(LEGACY_FILE);
    expect(DOC_MESSAGE_SERVICE_TOKEN).toBe(LEGACY_MESSAGE);
    expect(DOC_LINK_PREVIEWER_SERVICE_TOKEN).toBe(LEGACY_LINK);
    expect(DOC_WEATHER_SERVICE_TOKEN).toBe(LEGACY_WEATHER);
    expect(publicApi.DOC_FILE_SERVICE_TOKEN).toBe(LEGACY_FILE);
    expect(publicApi.DOC_MESSAGE_SERVICE_TOKEN).toBe(LEGACY_MESSAGE);
    expect(publicApi.DOC_LINK_PREVIEWER_SERVICE_TOKEN).toBe(LEGACY_LINK);
    expect(publicApi.DOC_WEATHER_SERVICE_TOKEN).toBe(LEGACY_WEATHER);
    expect(String(DOC_FILE_SERVICE_TOKEN)).toBe('InjectionToken IFileUploader');
    expect(String(DOC_MESSAGE_SERVICE_TOKEN)).toBe('InjectionToken IMessageService');
  });

  it('resolves existing providers with unchanged result types and class identity', () => {
    const message: DocMessagePort = {success() {}, error() {}, info() {}, warn() {}};
    const injector = Injector.create({providers: [
      {provide: LEGACY_FILE, useClass: MyDocFileService},
      {provide: LEGACY_MESSAGE, useValue: message},
      {provide: LEGACY_LINK, useClass: LegacyLinkPreviewer},
      {provide: LEGACY_WEATHER, useClass: LegacyWeather},
    ]});
    const file: DocFileService = injector.get(DOC_FILE_SERVICE_TOKEN);
    const link: DocLinkPreviewerService = injector.get(DOC_LINK_PREVIEWER_SERVICE_TOKEN);
    const weather: DocWeatherService = injector.get(DOC_WEATHER_SERVICE_TOKEN);
    expect(file).toBe(injector.get(LEGACY_FILE));
    expect(file).toBeInstanceOf(DocFileService);
    expect(injector.get(DOC_MESSAGE_SERVICE_TOKEN)).toBe(message);
    expect(LegacyLinkPreviewer).toBe(DocLinkPreviewerService);
    expect(LegacyWeather).toBe(DocWeatherService);
    expect(link).toBeInstanceOf(DocLinkPreviewerService);
    expect(weather).toBeInstanceOf(DocWeatherService);
    injector.destroy();
  });
});
