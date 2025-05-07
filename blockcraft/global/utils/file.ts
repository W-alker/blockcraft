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

export const downloadFile = async (url: string, filename = '未命名') => {
  const response = await fetch(url);

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = getSafeFileName(filename)
  link.click();
  link.remove();

  // Clean up the blob URL
  window.URL.revokeObjectURL(blobUrl);
};

function getSafeFileName(string: string) {
  const replacement = ' ';
  const filenameReservedRegex = /[<>:"/\\|?*\u0000-\u001F]/g;
  const windowsReservedNameRegex = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
  const reControlChars = /[\u0000-\u001F\u0080-\u009F]/g;
  const reTrailingPeriods = /\.+$/;
  const allowedLength = 50;

  function trimRepeated(string: string, target: string) {
    const escapeStringRegexp = target
      .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
      .replace(/-/g, '\\x2d');
    const regex = new RegExp(`(?:${escapeStringRegexp}){2,}`, 'g');
    return string.replace(regex, target);
  }

  string = string
    .normalize('NFD')
    .replace(filenameReservedRegex, replacement)
    .replace(reControlChars, replacement)
    .replace(reTrailingPeriods, '');

  string = trimRepeated(string, replacement);
  string = windowsReservedNameRegex.test(string)
    ? string + replacement
    : string;
  const extIndex = string.lastIndexOf('.');
  const filename = string.slice(0, extIndex).trim();
  const extension = string.slice(extIndex);
  string =
    filename.slice(0, Math.max(1, allowedLength - extension.length)) +
    extension;
  return string;
}

// https://www.rfc-editor.org/rfc/rfc9110#name-field-names
export const getFilenameFromContentDisposition = (header_value: string) => {
  header_value = header_value.trim();
  const quote_indices = [];
  const quote_map = Object.create(null);
  for (let i = 0; i < header_value.length; i++) {
    if (header_value[i] === '"' && header_value[i - 1] !== '\\') {
      quote_indices.push(i);
    }
  }
  let target_index = header_value.indexOf('filename=');
  for (let i = 0; i < quote_indices.length; i += 2) {
    const start = quote_indices[i];
    const end = quote_indices[i + 1];
    quote_map[start] = end;
    if (start < target_index && target_index < end) {
      target_index = header_value.indexOf('filename=', end);
    }
  }
  if (target_index === -1) {
    return undefined;
  }
  if (quote_map[target_index + 9] === undefined) {
    const end_space = header_value.indexOf(' ', target_index);
    return header_value.slice(
      target_index + 9,
      end_space === -1 ? header_value.length : end_space
    );
  }
  return header_value.slice(target_index + 10, quote_map[target_index + 9]);
};

