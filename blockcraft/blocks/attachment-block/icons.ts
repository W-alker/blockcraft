import {FileExtensionType} from "../../global";

export const ATTACHMENT_ICONS: Record<FileExtensionType, string> = {
  txt: "bc_file-txt",
  html: "bc_file-txt",
  css: "bc_file-txt",
  js: "bc_file-txt",
  json: "bc_file-txt",
  png: "bc_file-img",
  jpg: "bc_file-img",
  jpeg: "bc_file-img",
  gif: "bc_file-img",
  svg: "bc_file-img",
  pdf: "bc_file-pdf",
  doc: "bc_file-doc",
  docx: "bc_file-doc",
  xls: "c_file-xlsx",
  xlsx: "c_file-xlsx",
  ppt: "bc_file-ppt",
  pptx: "bc_file-ppt",
  mp3: "bc_file-mp3",
  wav: "bc_file-mp3",
  mp4: "bc_file-mp3",
  avi: "bc_file-video",
  zip: "bc_file-zip",
  tar: "c_file-zip",
  gz: "c_file-zip",
  csv: "c_file-zip",
  other: "bc_file-unknown"
}

export const getAttachmentIcon = (fileExtension: FileExtensionType): string => {
  return ATTACHMENT_ICONS[fileExtension] || ATTACHMENT_ICONS["other"];
}
