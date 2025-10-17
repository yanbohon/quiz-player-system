import { CustomOceanQuestion, StandardQuestion } from "./types";

export interface StandardQuestionWithSolution extends StandardQuestion {
  correctAnswer: string | string[];
}

export const MOCK_PUSH_QUESTIONS: StandardQuestionWithSolution[] = [
  {
    id: "push-1",
    title: "主持人通过 MQTT 推送题目时，你应保持怎样的设备状态？",
    type: "single",
    options: [
      { value: "A", label: "页面常驻答题页并保持网络畅通" },
      { value: "B", label: "随时切换到其他应用" },
      { value: "C", label: "关闭屏幕节省电量" },
      { value: "D", label: "刷新页面等待" },
    ],
    correctAnswer: "A",
  },
  {
    id: "push-2",
    title: "MQTT 实时赛制中答案提交成功的标志是什么？",
    type: "single",
    options: [
      { value: "A", label: "按钮变灰且提示成功" },
      { value: "B", label: "等待主持人口头确认" },
      { value: "C", label: "浏览器刷新后仍保留答案" },
      { value: "D", label: "队友提醒" },
    ],
    correctAnswer: "A",
  },
  {
    id: "push-matching-1",
    title: "请将以下毒品与对应特征连线。",
    type: "matching",
    options: [
      { value: "A", label: "源自罂粟，成瘾强" },
      { value: "B", label: "白色晶体，致幻觉" },
      { value: "C", label: "源自大麻，忆衰退" },
      { value: "D", label: "镇痛药物，管制品" },
      { value: "E", label: "娱乐场所，易兴奋" },
      { value: "F", label: "源古柯叶，兴中枢" },
    ],
    matching: {
      prompt: "将毒品与相应特征正确连线。",
      left: [
        { id: "1", label: "海洛因" },
        { id: "2", label: "冰毒" },
        { id: "3", label: "大麻" },
        { id: "4", label: "吗啡" },
        { id: "5", label: "摇头丸" },
        { id: "6", label: "可卡因" },
      ],
      right: [
        { id: "A", label: "源自罂粟，成瘾强" },
        { id: "B", label: "白色晶体，致幻觉" },
        { id: "C", label: "源自大麻，忆衰退" },
        { id: "D", label: "镇痛药物，管制品" },
        { id: "E", label: "娱乐场所，易兴奋" },
        { id: "F", label: "源古柯叶，兴中枢" },
      ],
    },
    correctAnswer: ["1:A", "2:B", "3:C", "4:D", "5:E", "6:F"],
  },
];

export const MOCK_SPEED_RUN_QUESTIONS: StandardQuestionWithSolution[] = [
  {
    id: "speed-1",
    title: "本地赛制开始前应完成哪些准备？",
    type: "multiple",
    options: [
      { value: "A", label: "确认题包加载完成" },
      { value: "B", label: "自定义答题顺序" },
      { value: "C", label: "检查系统时间同步" },
      { value: "D", label: "提前提交空白答案" },
    ],
    correctAnswer: ["A", "C"],
  },
  {
    id: "speed-2",
    title: "争分夺秒赛制中，系统会在什么时候提交答案？",
    type: "single",
    options: [
      { value: "A", label: "全部题目作答完成后统一提交" },
      { value: "B", label: "每题作答后立即提交，并记录用时" },
      { value: "C", label: "点击提交按钮后" },
      { value: "D", label: "主持人宣布计分时" },
    ],
    correctAnswer: "B",
  },
  {
    id: "speed-3",
    title: "若倒计时归零但仍有题未完成，系统将如何处理？",
    type: "boolean",
    options: [
      { value: "A", label: "自动交卷并跳转结果页" },
      { value: "B", label: "继续作答直至完成" },
    ],
    correctAnswer: "A",
  },
];

export const MOCK_OCEAN_QUESTIONS: CustomOceanQuestion[] = [
  {
    questionKey: "ocean-001",
    stem: "以下哪几个行为属于抢题成功后的标准操作？",
    categories: ["抢题流程"],
    correctBuckets: [],
    correctAnswerIds: ["act-confirm", "act-prepare"],
    optionPool: [
      { id: "act-confirm", label: "确认题号并准备作答" },
      { id: "act-wait", label: "等待其他队伍提交" },
      { id: "act-prepare", label: "检查设备音量和麦克风" },
      { id: "act-pass", label: "直接放弃本题" },
    ],
    extra: {
      difficulty: "B",
      source: "抢题演示包",
    },
  },
  {
    questionKey: "ocean-002",
    stem: "抢题接口返回无题时，选手端应如何处理？",
    categories: ["抢题流程"],
    correctBuckets: [],
    correctAnswerIds: ["act-finish"],
    optionPool: [
      { id: "act-retry", label: "立即重新请求下一题" },
      { id: "act-finish", label: "结束答题并等待结果" },
      { id: "act-error", label: "报错并退出系统" },
    ],
    extra: {
      difficulty: "A",
    },
  },
];
