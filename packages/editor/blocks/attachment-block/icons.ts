import {mimeExtMap} from "../../global";

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
