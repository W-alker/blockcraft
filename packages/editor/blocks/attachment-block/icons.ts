import {mimeExtMap} from "../../global/utils/file";

export const ATTACHMENT_ICONS: Record<string, string> = {
  txt: "bc_file-txt",
  img: "bc_file-img",
  video: "bc_file-video",
  audio: "bc_file-mp3",
  xls: "bc_file-xlsx",
  doc: "bc_file-doc",
  pdf: "bc_file-pdf",
  ppt: "bc_file-ppt",
  zip: "bc_file-zip",
  other: "bc_file-unknown"
}

export const getAttachmentIcon = (fileType: string): string => {
  if (fileType.startsWith('image')) return ATTACHMENT_ICONS['img']
  if (fileType.startsWith('video')) return ATTACHMENT_ICONS['video']
  if (fileType.startsWith('audio')) return ATTACHMENT_ICONS['audio']
  if (fileType.startsWith('text')) return ATTACHMENT_ICONS['txt']
  const ext = mimeExtMap.get(fileType)
  if (!ext) return ATTACHMENT_ICONS['other']
  switch (ext) {
    case 'xls':
    case 'xlsx':
      return ATTACHMENT_ICONS['xls']
    case 'doc':
    case 'docx':
      return ATTACHMENT_ICONS['doc']
    case 'pdf':
      return ATTACHMENT_ICONS['pdf']
    case 'ppt':
    case 'pptx':
      return ATTACHMENT_ICONS['ppt']
    case 'epub':
    case 'gzip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'bz2':
    case 'java-archive':
    case 'zip':
    case 'tar.gz':
    case 'tar.bz2':
    case 'tar.xz':
      return ATTACHMENT_ICONS['zip']
    default:
      return ATTACHMENT_ICONS['other']
  }
}

// Rendering only: keep the legacy persisted `icon` values and snapshot shape intact.
const FILE_ICON_EXTENSIONS = new Map(Object.entries({
  txt: 'txt', md: 'md', csv: 'csv', html: 'html', htm: 'html', json: 'txt', xml: 'txt', log: 'txt',
  doc: 'docx', docx: 'docx', odt: 'docx', rtf: 'docx',
  xls: 'excel', xlsx: 'excel', ods: 'excel',
  ppt: 'ppt', pptx: 'ppt', odp: 'ppt', pdf: 'pdf',
  zip: 'zip', rar: 'zip', '7z': 'zip', tar: 'zip', gz: 'zip', bz: 'zip', bz2: 'zip', xz: 'zip', jar: 'zip',
  png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', webp: 'img', svg: 'img', bmp: 'img', avif: 'img',
  mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', avi: 'video', mkv: 'video',
}))

/** Internal view adapter shared by the live block and snapshot renderer. */
export function getAttachmentFileIcon(type = '', name = ''): string {
  const mime = type.split(';')[0].trim().toLowerCase()
  if (mime.startsWith('image/')) return 'file-img'
  if (mime.startsWith('video/')) return 'file-video'
  if (mime.startsWith('audio/')) return 'file-audio'
  if (mime.startsWith('text/') && !['text/csv', 'text/html', 'text/markdown'].includes(mime)) return 'file-txt'
  const extension = mime === 'text/markdown' ? 'md' : mimeExtMap.get(mime)
  const kind = (extension && FILE_ICON_EXTENSIONS.get(extension)) ||
    FILE_ICON_EXTENSIONS.get(name.includes('.') ? name.split('.').pop()!.toLowerCase() : '') || 'unknown'
  return `file-${kind}`
}
