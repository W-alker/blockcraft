import {FileExtensionType} from "../../global";

export const ATTACHMENT_ICONS: Record<FileExtensionType, string> = {
  txt: "bc_shouye_wendang",
  html: "bc_shouye_wendang",
  css: "bc_shouye_wendang",
  js: "bc_shouye_wendang",
  json: "bc_shouye_wendang",
  png: "bc_shouye_wendang",
  jpg: "bc_shouye_wendang",
  jpeg: "bc_shouye_wendang",
  gif: "bc_shouye_wendang",
  svg: "bc_shouye_wendang",
  pdf: "bc_shouye_wendang",
  doc: "bc_shouye_wendang",
  docx: "bc_shouye_wendang",
  xls: "bc_shouye_wendang",
  xlsx: "bc_shouye_wendang",
  ppt: "bc_shouye_wendang",
  pptx: "bc_shouye_wendang",
  mp3: "bc_shouye_wendang",
  wav: "bc_shouye_wendang",
  mp4: "bc_shouye_wendang",
  avi: "bc_shouye_wendang",
  zip: "bc_shouye_wendang",
  tar: "bc_shouye_wendang",
  gz: "bc_shouye_wendang",
  csv: "bc_shouye_wendang",
  other: "bc_shouye_wendang"
}

export const getAttachmentIcon = (fileExtension: FileExtensionType): string => {
  return ATTACHMENT_ICONS[fileExtension] || ATTACHMENT_ICONS["other"];
}
