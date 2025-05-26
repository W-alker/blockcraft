export const mimeExtMap = new Map([
  ['application/epub+zip', 'epub'],
  ['application/gzip', 'gz'],
  ['application/java-archive', 'jar'],
  ['application/json', 'json'],
  ['application/ld+json', 'jsonld'],
  ['application/msword', 'doc'],
  ['application/octet-stream', 'bin'],
  ['application/ogg', 'ogx'],
  ['application/pdf', 'pdf'],
  ['application/rtf', 'rtf'],
  ['application/vnd.amazon.ebook', 'azw'],
  ['application/vnd.apple.installer+xml', 'mpkg'],
  ['application/vnd.mozilla.xul+xml', 'xul'],
  ['application/vnd.ms-excel', 'xls'],
  ['application/vnd.ms-fontobject', 'eot'],
  ['application/vnd.ms-powerpoint', 'ppt'],
  ['application/vnd.oasis.opendocument.presentation', 'odp'],
  ['application/vnd.oasis.opendocument.spreadsheet', 'ods'],
  ['application/vnd.oasis.opendocument.text', 'odt'],
  [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'pptx',
  ],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx',
  ],
  ['application/vnd.rar', 'rar'],
  ['application/vnd.visio', 'vsd'],
  ['application/x-7z-compressed', '7z'],
  ['application/x-abiword', 'abw'],
  ['application/x-bzip', 'bz'],
  ['application/x-bzip2', 'bz2'],
  ['application/x-cdf', 'cda'],
  ['application/x-csh', 'csh'],
  ['application/x-freearc', 'arc'],
  ['application/x-httpd-php', 'php'],
  ['application/x-sh', 'sh'],
  ['application/x-tar', 'tar'],
  ['application/xhtml+xml', 'xhtml'],
  ['application/xml', 'xml'],
  ['application/zip', 'zip'],
  ['application/zstd', 'zst'],
  ['audio/3gpp', '3gp'],
  ['audio/3gpp2', '3g2'],
  ['audio/aac', 'aac'],
  ['audio/midi', 'mid'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'oga'],
  ['audio/opus', 'opus'],
  ['audio/wav', 'wav'],
  ['audio/webm', 'weba'],
  ['audio/x-midi', 'midi'],
  ['font/otf', 'otf'],
  ['font/ttf', 'ttf'],
  ['font/woff', 'woff'],
  ['font/woff2', 'woff2'],
  ['image/apng', 'apng'],
  ['image/avif', 'avif'],
  ['image/bmp', 'bmp'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/svg+xml', 'svg'],
  ['image/tiff', 'tiff'],
  ['image/vnd.microsoft.icon', 'ico'],
  ['image/webp', 'webp'],
  ['text/calendar', 'ics'],
  ['text/css', 'css'],
  ['text/csv', 'csv'],
  ['text/html', 'html'],
  ['text/javascript', 'js'],
  ['text/plain', 'txt'],
  ['text/xml', 'xml'],
  ['video/3gpp', '3gp'],
  ['video/3gpp2', '3g2'],
  ['video/mp2t', 'ts'],
  ['video/mp4', 'mp4'],
  ['video/mpeg', 'mpeg'],
  ['video/ogg', 'ogv'],
  ['video/webm', 'webm'],
  ['video/x-msvideo', 'avi'],
]);

export const extMimeMap = new Map(
  Array.from(mimeExtMap.entries()).map(([mime, ext]) => [ext, mime])
);

export const downloadFile = async (url: string | Blob, filename = '未命名') => {

  let blobUrl
  // 如果已经是blob
  if (url instanceof Blob) {
    blobUrl = window.URL.createObjectURL(url)
  } else {
    const response = await fetch(url);
    const blob = await response.blob();
    blobUrl = window.URL.createObjectURL(blob)
  }

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

