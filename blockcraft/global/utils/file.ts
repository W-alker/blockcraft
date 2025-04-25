// export async function getFileExtensionType(file: File): FileExtensionType {
//   const ext = await getFileMimeType(file);
//   return FileExtensions[ext as FileExtensionType] || FileExtensions.OTHER;
// }

// export async function getFileMimeType(file: File) {
//   if (file.type) {
//     return file.type;
//   }
//
//   // If the file type is not available, try to get it from the buffer.
//   const buffer = await file.arrayBuffer();
//   const FileType = await import('file-type');
//   const fileType = await FileType.fileTypeFromBuffer(buffer);
//   return (fileType ? fileType.mime : '') as MimeType
// }

export enum FileExtensions {
  TXT = 'txt',
  HTML = 'html',
  CSS = 'css',
  JS = 'js',
  JSON = 'json',
  PNG = 'png',
  JPG = 'jpg',
  JPEG = 'jpeg',
  GIF = 'gif',
  SVG = 'svg',
  PDF = 'pdf',
  DOC = 'doc',
  DOCX = 'docx',
  XLS = 'xls',
  XLSX = 'xlsx',
  PPT = 'ppt',
  PPTX = 'pptx',
  MP3 = 'mp3',
  WAV = 'wav',
  MP4 = 'mp4',
  AVI = 'avi',
  ZIP = 'zip',
  TAR = 'tar',
  GZ = 'gz',
  CSV = 'csv',
  OTHER = 'other'
}

export enum MimeTypes {
  'text/plain' = 'txt',
  'text/html' = 'html',
  'text/css' = 'css',
  'text/javascript' = 'css',
  'application/javascript' = 'js',
  'application/json' = 'json',
  'image/png' = 'png',
  'image/jpeg' = 'jpeg',
  'image/gif' = 'gif',
  'image/svg+xml' = 'svg',
  'application/pdf' = 'pdf',
  'application/msword' = 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' = 'docx',
  'application/vnd.ms-excel' = 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = 'xlsx',
  'application/vnd.ms-powerpoint' = 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation' = 'pptx',
  'audio/mpeg' = 'mp3',
  'audio/wav' = 'wav',
  'video/mp4' = 'mp4',
  'video/x-msvideo' = 'avi',
  'application/zip' = 'zip',
  'application/x-tar' = 'tar',
  'application/gzip' = 'gz',
  'text/csv' = 'csv',
}

export type MimeType = keyof typeof MimeTypes;
export type FileExtensionType = `${FileExtensions}`;

export const MIME_TYPES_MAP = Object.entries(MimeTypes)

export function getFileExtensionType(mime: MimeType): FileExtensionType | undefined {
  return MimeTypes[mime]
}

export function getMimeType(type: FileExtensionType): MimeType | undefined {
  return MIME_TYPES_MAP.find(([ext, mime]) => ext === type)?.[1] as unknown as MimeType
}

export const downloadFile = async (url: string, filename: string) => {
  const response = await fetch(url);

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.click();
  link.remove();

  // Clean up the blob URL
  window.URL.revokeObjectURL(blobUrl);
};
