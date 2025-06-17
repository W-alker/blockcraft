const ALIGN_MENUS = [
    {
        id: 'align-left',
        name: "align",
        title: "左对齐",
        value: "left",
        icon: "bf_icon bf_zuoduiqi"
    },
    {
        id: 'align-center',
        name: "align",
        title: "居中对齐",
        value: "center",
        icon: "bf_icon bf_juzhongduiqi"
    },
    {
        id: 'align-right',
        name: "align",
        title: "右对齐",
        value: "right",
        icon: "bf_icon bf_youduiqi",
        divide: true
    },
];
export const SET_ROW_HEADER = {
    id: 'setHeadRow',
    name: "setHeadRow",
    title: "设置为标题行",
    value: "row",
    icon: "bf_icon bf_biaotihang",
    divide: true
};
export const SET_COL_HEADER = {
    id: 'setHeadCol',
    name: "setHeadCol",
    title: "设置为标题列",
    value: "col",
    icon: "bf_icon bf_biaotilie",
    divide: true
};
export const TableRolControlMenu = [
    ...ALIGN_MENUS,
    {
        id: 'insert-top',
        name: "insert",
        title: "向上插入一行",
        value: "top",
        icon: "bf_icon bf_shangjiantou-jia"
    },
    {
        id: 'insert-bottom',
        name: "insert",
        title: "向下插入一行",
        value: "bottom",
        icon: "bf_icon bf_xiajiantou-jia",
        divide: true
    },
    {
        id: 'delete',
        name: 'delete',
        title: '删除当前行',
        value: 'delete',
        icon: 'bf_icon bf_shanchu-2'
    }
];
export const TableColControlMenu = [
    ...ALIGN_MENUS,
    {
        id: 'insert-left',
        name: "insert",
        title: "向左插入一列",
        value: "left",
        icon: "bf_icon bf_zuojiantou-jia"
    },
    {
        id: 'insert-right',
        name: "insert",
        title: "向右插入一列",
        value: "right",
        icon: "bf_icon bf_youjiantou-jia",
        divide: true
    },
    // {
    //   name: "复制当前列",
    //   value: "copy",
    //   icon: "editor-xuqiuwendang_fuzhi"
    // },
    // {
    //   name: "清除内容",
    //   value: "clear",
    //   icon: "editor-delete_02"
    // },
    {
        id: 'delete',
        name: 'delete',
        title: '删除当前列',
        value: 'delete',
        icon: 'bf_icon bf_shanchu-2'
    }
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2Jsb2Nrcy90YWJsZS9jb25zdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxNQUFNLFdBQVcsR0FBbUI7SUFDbEM7UUFDRSxFQUFFLEVBQUUsWUFBWTtRQUNoQixJQUFJLEVBQUUsT0FBTztRQUNiLEtBQUssRUFBRSxLQUFLO1FBQ1osS0FBSyxFQUFFLE1BQU07UUFDYixJQUFJLEVBQUUscUJBQXFCO0tBQzVCO0lBQ0Q7UUFDRSxFQUFFLEVBQUUsY0FBYztRQUNsQixJQUFJLEVBQUUsT0FBTztRQUNiLEtBQUssRUFBRSxNQUFNO1FBQ2IsS0FBSyxFQUFFLFFBQVE7UUFDZixJQUFJLEVBQUUseUJBQXlCO0tBQ2hDO0lBQ0Q7UUFDRSxFQUFFLEVBQUUsYUFBYTtRQUNqQixJQUFJLEVBQUUsT0FBTztRQUNiLEtBQUssRUFBRSxLQUFLO1FBQ1osS0FBSyxFQUFFLE9BQU87UUFDZCxJQUFJLEVBQUUscUJBQXFCO1FBQzNCLE1BQU0sRUFBRSxJQUFJO0tBQ2I7Q0FDRixDQUFBO0FBRUQsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFpQjtJQUMxQyxFQUFFLEVBQUUsWUFBWTtJQUNoQixJQUFJLEVBQUUsWUFBWTtJQUNsQixLQUFLLEVBQUUsUUFBUTtJQUNmLEtBQUssRUFBRSxLQUFLO0lBQ1osSUFBSSxFQUFFLHVCQUF1QjtJQUM3QixNQUFNLEVBQUUsSUFBSTtDQUNiLENBQUE7QUFFRCxNQUFNLENBQUMsTUFBTSxjQUFjLEdBQWlCO0lBQzFDLEVBQUUsRUFBRSxZQUFZO0lBQ2hCLElBQUksRUFBRSxZQUFZO0lBQ2xCLEtBQUssRUFBRSxRQUFRO0lBQ2YsS0FBSyxFQUFFLEtBQUs7SUFDWixJQUFJLEVBQUUsc0JBQXNCO0lBQzVCLE1BQU0sRUFBRSxJQUFJO0NBQ2IsQ0FBQTtBQUdELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFtQjtJQUNqRCxHQUFHLFdBQVc7SUFDZDtRQUNFLEVBQUUsRUFBRSxZQUFZO1FBQ2hCLElBQUksRUFBRSxRQUFRO1FBQ2QsS0FBSyxFQUFFLFFBQVE7UUFDZixLQUFLLEVBQUUsS0FBSztRQUNaLElBQUksRUFBRSw2QkFBNkI7S0FDcEM7SUFDRDtRQUNFLEVBQUUsRUFBRSxlQUFlO1FBQ25CLElBQUksRUFBRSxRQUFRO1FBQ2QsS0FBSyxFQUFFLFFBQVE7UUFDZixLQUFLLEVBQUUsUUFBUTtRQUNmLElBQUksRUFBRSwyQkFBMkI7UUFDakMsTUFBTSxFQUFFLElBQUk7S0FDYjtJQUNEO1FBQ0UsRUFBRSxFQUFFLFFBQVE7UUFDWixJQUFJLEVBQUUsUUFBUTtRQUNkLEtBQUssRUFBRSxPQUFPO1FBQ2QsS0FBSyxFQUFFLFFBQVE7UUFDZixJQUFJLEVBQUUsc0JBQXNCO0tBQzdCO0NBQ0YsQ0FBQTtBQUVELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFtQjtJQUNqRCxHQUFHLFdBQVc7SUFDZDtRQUNFLEVBQUUsRUFBRSxhQUFhO1FBQ2pCLElBQUksRUFBRSxRQUFRO1FBQ2QsS0FBSyxFQUFFLFFBQVE7UUFDZixLQUFLLEVBQUUsTUFBTTtRQUNiLElBQUksRUFBRSwyQkFBMkI7S0FDbEM7SUFDRDtRQUNFLEVBQUUsRUFBRSxjQUFjO1FBQ2xCLElBQUksRUFBRSxRQUFRO1FBQ2QsS0FBSyxFQUFFLFFBQVE7UUFDZixLQUFLLEVBQUUsT0FBTztRQUNkLElBQUksRUFBRSwyQkFBMkI7UUFDakMsTUFBTSxFQUFFLElBQUk7S0FDYjtJQUNELElBQUk7SUFDSixtQkFBbUI7SUFDbkIsbUJBQW1CO0lBQ25CLHNDQUFzQztJQUN0QyxLQUFLO0lBQ0wsSUFBSTtJQUNKLGtCQUFrQjtJQUNsQixvQkFBb0I7SUFDcEIsNkJBQTZCO0lBQzdCLEtBQUs7SUFDTDtRQUNFLEVBQUUsRUFBRSxRQUFRO1FBQ1osSUFBSSxFQUFFLFFBQVE7UUFDZCxLQUFLLEVBQUUsT0FBTztRQUNkLEtBQUssRUFBRSxRQUFRO1FBQ2YsSUFBSSxFQUFFLHNCQUFzQjtLQUM3QjtDQUNGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0lUb29sYmFySXRlbX0gZnJvbSBcIi4uLy4uL2NvbXBvbmVudHNcIjtcblxuY29uc3QgQUxJR05fTUVOVVM6IElUb29sYmFySXRlbVtdID0gW1xuICB7XG4gICAgaWQ6ICdhbGlnbi1sZWZ0JyxcbiAgICBuYW1lOiBcImFsaWduXCIsXG4gICAgdGl0bGU6IFwi5bem5a+56b2QXCIsXG4gICAgdmFsdWU6IFwibGVmdFwiLFxuICAgIGljb246IFwiYmZfaWNvbiBiZl96dW9kdWlxaVwiXG4gIH0sXG4gIHtcbiAgICBpZDogJ2FsaWduLWNlbnRlcicsXG4gICAgbmFtZTogXCJhbGlnblwiLFxuICAgIHRpdGxlOiBcIuWxheS4reWvuem9kFwiLFxuICAgIHZhbHVlOiBcImNlbnRlclwiLFxuICAgIGljb246IFwiYmZfaWNvbiBiZl9qdXpob25nZHVpcWlcIlxuICB9LFxuICB7XG4gICAgaWQ6ICdhbGlnbi1yaWdodCcsXG4gICAgbmFtZTogXCJhbGlnblwiLFxuICAgIHRpdGxlOiBcIuWPs+Wvuem9kFwiLFxuICAgIHZhbHVlOiBcInJpZ2h0XCIsXG4gICAgaWNvbjogXCJiZl9pY29uIGJmX3lvdWR1aXFpXCIsXG4gICAgZGl2aWRlOiB0cnVlXG4gIH0sXG5dXG5cbmV4cG9ydCBjb25zdCBTRVRfUk9XX0hFQURFUjogSVRvb2xiYXJJdGVtID0ge1xuICBpZDogJ3NldEhlYWRSb3cnLFxuICBuYW1lOiBcInNldEhlYWRSb3dcIixcbiAgdGl0bGU6IFwi6K6+572u5Li65qCH6aKY6KGMXCIsXG4gIHZhbHVlOiBcInJvd1wiLFxuICBpY29uOiBcImJmX2ljb24gYmZfYmlhb3RpaGFuZ1wiLFxuICBkaXZpZGU6IHRydWVcbn1cblxuZXhwb3J0IGNvbnN0IFNFVF9DT0xfSEVBREVSOiBJVG9vbGJhckl0ZW0gPSB7XG4gIGlkOiAnc2V0SGVhZENvbCcsXG4gIG5hbWU6IFwic2V0SGVhZENvbFwiLFxuICB0aXRsZTogXCLorr7nva7kuLrmoIfpopjliJdcIixcbiAgdmFsdWU6IFwiY29sXCIsXG4gIGljb246IFwiYmZfaWNvbiBiZl9iaWFvdGlsaWVcIixcbiAgZGl2aWRlOiB0cnVlXG59XG5cblxuZXhwb3J0IGNvbnN0IFRhYmxlUm9sQ29udHJvbE1lbnU6IElUb29sYmFySXRlbVtdID0gW1xuICAuLi5BTElHTl9NRU5VUyxcbiAge1xuICAgIGlkOiAnaW5zZXJ0LXRvcCcsXG4gICAgbmFtZTogXCJpbnNlcnRcIixcbiAgICB0aXRsZTogXCLlkJHkuIrmj5LlhaXkuIDooYxcIixcbiAgICB2YWx1ZTogXCJ0b3BcIixcbiAgICBpY29uOiBcImJmX2ljb24gYmZfc2hhbmdqaWFudG91LWppYVwiXG4gIH0sXG4gIHtcbiAgICBpZDogJ2luc2VydC1ib3R0b20nLFxuICAgIG5hbWU6IFwiaW5zZXJ0XCIsXG4gICAgdGl0bGU6IFwi5ZCR5LiL5o+S5YWl5LiA6KGMXCIsXG4gICAgdmFsdWU6IFwiYm90dG9tXCIsXG4gICAgaWNvbjogXCJiZl9pY29uIGJmX3hpYWppYW50b3UtamlhXCIsXG4gICAgZGl2aWRlOiB0cnVlXG4gIH0sXG4gIHtcbiAgICBpZDogJ2RlbGV0ZScsXG4gICAgbmFtZTogJ2RlbGV0ZScsXG4gICAgdGl0bGU6ICfliKDpmaTlvZPliY3ooYwnLFxuICAgIHZhbHVlOiAnZGVsZXRlJyxcbiAgICBpY29uOiAnYmZfaWNvbiBiZl9zaGFuY2h1LTInXG4gIH1cbl1cblxuZXhwb3J0IGNvbnN0IFRhYmxlQ29sQ29udHJvbE1lbnU6IElUb29sYmFySXRlbVtdID0gW1xuICAuLi5BTElHTl9NRU5VUyxcbiAge1xuICAgIGlkOiAnaW5zZXJ0LWxlZnQnLFxuICAgIG5hbWU6IFwiaW5zZXJ0XCIsXG4gICAgdGl0bGU6IFwi5ZCR5bem5o+S5YWl5LiA5YiXXCIsXG4gICAgdmFsdWU6IFwibGVmdFwiLFxuICAgIGljb246IFwiYmZfaWNvbiBiZl96dW9qaWFudG91LWppYVwiXG4gIH0sXG4gIHtcbiAgICBpZDogJ2luc2VydC1yaWdodCcsXG4gICAgbmFtZTogXCJpbnNlcnRcIixcbiAgICB0aXRsZTogXCLlkJHlj7Pmj5LlhaXkuIDliJdcIixcbiAgICB2YWx1ZTogXCJyaWdodFwiLFxuICAgIGljb246IFwiYmZfaWNvbiBiZl95b3VqaWFudG91LWppYVwiLFxuICAgIGRpdmlkZTogdHJ1ZVxuICB9LFxuICAvLyB7XG4gIC8vICAgbmFtZTogXCLlpI3liLblvZPliY3liJdcIixcbiAgLy8gICB2YWx1ZTogXCJjb3B5XCIsXG4gIC8vICAgaWNvbjogXCJlZGl0b3IteHVxaXV3ZW5kYW5nX2Z1emhpXCJcbiAgLy8gfSxcbiAgLy8ge1xuICAvLyAgIG5hbWU6IFwi5riF6Zmk5YaF5a65XCIsXG4gIC8vICAgdmFsdWU6IFwiY2xlYXJcIixcbiAgLy8gICBpY29uOiBcImVkaXRvci1kZWxldGVfMDJcIlxuICAvLyB9LFxuICB7XG4gICAgaWQ6ICdkZWxldGUnLFxuICAgIG5hbWU6ICdkZWxldGUnLFxuICAgIHRpdGxlOiAn5Yig6Zmk5b2T5YmN5YiXJyxcbiAgICB2YWx1ZTogJ2RlbGV0ZScsXG4gICAgaWNvbjogJ2JmX2ljb24gYmZfc2hhbmNodS0yJ1xuICB9XG5dXG4iXX0=