import type {
  DocFilePort, DocMessagePort, DocLinkPreviewPort, DocWeatherPort,
} from '@ccc/blockcraft/framework/ports';

// 无 Angular、Yjs 或服务基类的独立宿主实现；浏览器类型库仍是文件/取消操作的契约前提。
declare const file: File;
declare const files: FileList;
const attachment = {name: file.name, type: file.type, size: file.size, url: 'https://host/file'};
const filePort: DocFilePort = {
  uploadImg: async (_file, onProgress) => { onProgress?.(100); return attachment.url; },
  uploadVideo: async () => attachment,
  uploadAttachment: async () => attachment,
  previewAttachment: () => {},
  downloadAttachment: async () => {},
  previewImg: () => {},
  createObjectURL: () => '__blockcraft_local__:blob:example',
  getFileByObjectURL: () => file,
  getFilePreviewURLByObjectURL: () => 'blob:example',
  removeObjectURL: () => {},
  isLocalObjectURL: () => true,
  isOverMaxSize: () => false,
  inputFiles: async () => files,
};
const messages: DocMessagePort = {success() {}, error() {}, info() {}, warn() {}};
const links: DocLinkPreviewPort = {query: async (_url, _signal) => ({title: null})};
const weather: DocWeatherPort = {query: async (query, _signal) => ({
  tone: 'sunny', temp: 26, condition: query?.date ?? 'today', location: '杭州', high: 30, low: 20,
})};
weather.query();
weather.query({date: '2026-09-20'}, new AbortController().signal);
filePort.inputFiles();
filePort.inputFiles('image/*', true);
// @ts-expect-error 文件宿主必须提供下载能力，不能因基类有默认实现而变为可选。
const missingDownload: DocFilePort = {...filePort, downloadAttachment: undefined};
// @ts-expect-error 上传图片继续返回 URL，不返回附件对象。
const invalidUpload: DocFilePort = {...filePort, uploadImg: async () => attachment};
// @ts-expect-error 天气类型集合不能扩展。
const invalidWeather: DocWeatherPort = {query: async () => ({tone: 'unknown', temp: 0, condition: '', location: '', high: 0, low: 0})};
// @ts-expect-error 链接预览保留字段类型。
const invalidPreview: DocLinkPreviewPort = {query: async () => ({title: 1})};
