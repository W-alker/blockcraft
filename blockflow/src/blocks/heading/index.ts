import {HeadingOneBlock} from "./heading-one.block";
import {HeadingTwoBlock} from "./heading-two.block";
import {HeadingThreeBlock} from "./heading-three.block";
import {HeadingFourBlock} from "./heading-four.block";
import {BlockSchema} from "../../core";

export const HeadingOneSchema: BlockSchema = {
  flavour: 'heading-one',
  nodeType: 'editable',
  render: HeadingOneBlock,
  icon: 'bf_icon bf_biaoti_1',
  label: '一级标题',
}

export const HeadingTwoSchema: BlockSchema = {
  flavour: 'heading-two',
  nodeType: 'editable',
  render: HeadingTwoBlock,
  icon: 'bf_icon bf_biaoti_2',
  label: '二级标题',
}

export const HeadingThreeSchema: BlockSchema = {
  flavour: 'heading-three',
  nodeType: 'editable',
  render: HeadingThreeBlock,
  icon: 'bf_icon bf_biaoti_3',
  label: '三级标题',
}

export const HeadingFourSchema: BlockSchema = {
  flavour: 'heading-four',
  nodeType: 'editable',
  render: HeadingFourBlock,
  icon: 'bf_icon bf_biaoti_4',
  label: '四级标题',
}
