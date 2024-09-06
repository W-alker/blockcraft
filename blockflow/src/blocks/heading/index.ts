import {BlockSchema} from "@core";
import {HeadingOneBlock} from "./heading-one.block";
import {HeadingTwoBlock} from "./heading-two.block";
import {HeadingThreeBlock} from "./heading-three.block";
import {HeadingFourBlock} from "./heading-four.block";

export const HeadingOneSchema: BlockSchema = {
  flavour: 'heading-one',
  nodeType: 'editable',
  render: HeadingOneBlock,
  icon: 'editor editor-main_heading',
  label: '一级标题',
  description: `一级标题(⌘/Ctrl + 1)\nMarkdown: # (空格)`,

}

export const HeadingTwoSchema: BlockSchema = {
  flavour: 'heading-two',
  nodeType: 'editable',
  render: HeadingTwoBlock,
  icon: 'editor editor-subtitle_2',
  label: '二级标题',
  description: `二级标题(⌘/Ctrl + 2)\nMarkdown: ## (空格)`,
}

export const HeadingThreeSchema: BlockSchema = {
  flavour: 'heading-three',
  nodeType: 'editable',
  render: HeadingThreeBlock,
  icon: 'editor editor-subtitle_3',
  label: '三级标题',
  description: `三级标题(⌘/Ctrl + 3)\nMarkdown: ### (空格)`,
}

export const HeadingFourSchema: BlockSchema = {
  flavour: 'heading-four',
  nodeType: 'editable',
  render: HeadingFourBlock,
  icon: 'editor editor-subtitle_3',
  label: '四级标题',
  description: `四级标题(⌘/Ctrl + 4)\nMarkdown: #### (空格)`,
}
