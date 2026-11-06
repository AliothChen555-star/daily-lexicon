# 词库范围与试用词卡清点

内容版本：0.3.0。范围来源：[ECDICT](https://github.com/skywind3000/ECDICT)，固定提交 `39cfb9672c0906b63569e0453c2e6abfb9ab182a`。保留的字段仅为拼写和级别标签；未复制释义、例句、音标或音频。原始文件SHA-256：`d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc`。MIT许可见 `../scope/ECDICT-LICENSE`。

| 项目 | 数量 |
| --- | ---: |
| 基础、四级、六级候选拼写并集 | 7109 |
| 至少两个级别标签的候选词 | 4819 |
| 需另行裁定的短语或特殊拼写 | 7 |
| 本版可学习试用词卡 | 600 |
| 试用卡与候选名单相交 | 564 |
| 候选名单中尚未制作的词卡 | 6545 |
| 主题 / 场景 / 概念 | 20 / 56 / 124 |
| 构词归组覆盖 | 600 |
| 古典词根 / 现代词族 / 独立词组 | 12 / 114 / 48 |
| 本地音频 | 1800 |
| 结构、目标词与音频问题 | 0 |
| 完整人工审核通过的卡片 | 0 |

## 分层口径

保留各词所有标签。基础层取 `zk` 或 `gk`，其余有 `cet4` 标签的归四级候选，再将其余 `cet6` 词归六级候选。这是来源标签的合并规则，不能代替官方大纲核对。

拼写以小写作为去重键；I及专有名词等源大小写保存在`../scope/spelling-variants.json`，未制作词清单也保留源拼写。制作正式卡片时需要裁定显示形式，不把小写去重键直接当作正确显示拼写。

- 来源标签计数（可能重叠）：{'gk': 3674, 'zk': 1600, 'cet4': 3846, 'cet6': 5406}。
- 最低参考层级去重计数：{'基础': 3722, '六级': 1755, '四级': 1632}。
- 试用包编辑参考层级：{'基础': 352, '四级': 135, '六级': 113}。
- 试用包中未在本次候选并集出现的词：accountability, allocation, autonomy, biodiversity, causality, coordination, creativity, credible, diagnosis, distraction, diversity, ecological, empirically, equity, exclusion, flexibility, implementation, inclusion, inequality, integration, legislate, legislative, legitimacy, metabolism, methodology, participatory, reconsider, reconstruct, renewable, replicate, replication, sustainability, sustainable, transparency, trustworthy, verification。这些保留为公开标明的试用扩展词，后续决定是否进入正式必学集合。

## 尚待完成

[考试院大纲页面](https://cet.neea.edu.cn/html1/folder/16113/1588-1.htm)目前列出英语2016年修订版。本报告尚未逐条对照该大纲，因此没有给出官方覆盖率。

600张卡片为原创辅助编写草稿，不能自动标为人工审核通过。`card-audit.tsv`逐卡记录分组、标签与缺项；`missing-cards.tsv`列出全部待制作候选词。音标、词义、搭配、词根证据与每段音频仍需要完整校审。
