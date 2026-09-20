import {InjectionToken} from '@angular/core';
import type {DocFileService} from '../host/file.service';
import type {DocMessageService} from '../host/message.service';
import type {DocLinkPreviewerService} from '../../editor/services/doc-link-previewer.service';
import type {DocWeatherService} from '../../editor/services/doc-weather.service';
import type {DocAdapterService} from '../host/adapter.service';
import type {BlockCreatorService} from '../host/block-creator.service';

// 保留原 Token 描述、泛型与唯一实例，兼容既有 provider 和 injector.get 的类型。
export const DOC_FILE_SERVICE_TOKEN = new InjectionToken<DocFileService>('IFileUploader');
export const DOC_MESSAGE_SERVICE_TOKEN = new InjectionToken<DocMessageService>('IMessageService');
export const DOC_LINK_PREVIEWER_SERVICE_TOKEN = new InjectionToken<DocLinkPreviewerService>('DOC_LINK_PREVIEWER_SERVICE_TOKEN');
export const DOC_WEATHER_SERVICE_TOKEN = new InjectionToken<DocWeatherService>('DOC_WEATHER_SERVICE_TOKEN');
export const DOC_ADAPTER_SERVICE_TOKEN = new InjectionToken<DocAdapterService>('DOC_ADAPTER_SERVICE_TOKEN');
export const BLOCK_CREATOR_SERVICE_TOKEN = new InjectionToken<BlockCreatorService>('block-creator');
