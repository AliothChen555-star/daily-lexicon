# 词汇日报 · The Daily Lexicon

免费、开源、离线使用的英语词卡程序，支持 Windows 与安卓。界面采用报头、分栏、细版线与衬线字，像每天翻开一份词汇小报。

[项目源码](https://github.com/AliothChen555-star/daily-lexicon) · [程序许可](LICENSE) · [内容许可](content/LICENSE.md) · [验证记录](docs/验证记录.md)

[![源码与词包检查](https://github.com/AliothChen555-star/daily-lexicon/actions/workflows/ci.yml/badge.svg)](https://github.com/AliothChen555-star/daily-lexicon/actions/workflows/ci.yml)

![词汇日报电脑版界面](docs/previews/desktop.png)

仓库提供完整应用源码、120词试用包与360段离线音频。预编译安装包目前为初版本地交付，仓库暂未提供安装包下载；可按照下方步骤自行构建。

## 初版可以做什么

- 默认每天按课程读30词，可设为5至100词；未完成的词次日优先，不一次性堆积欠账。
- 第一轮按语义、第二轮按词根与词族、之后全量乱序；每轮覆盖本词包全部120词。完成前两轮后，次日进入下一阶段；乱序可反复开新轮。
- 先回想，再翻卡；按“忘记了 / 吃力想起 / 记得 / 很熟悉”自评，由 FSRS-6 安排后续复习。课程与复习分别计数。
- 单词、美式音标、离线美音、中文释义、常用搭配、两条双语例句、例句朗读、构词线索及部分重点词形。
- 搜索、主题与级别筛选、收藏、个人笔记、真实进度、撤销评分。
- 本机保存，导出与导入 JSON 备份，在电脑与手机之间手动交换学习档案。

## 安装与使用

### Windows

解压 `词汇日报-0.1.0-Windows-x64.zip`，打开文件夹里的 `词汇日报.exe`。请保留同一文件夹下的全部文件。无需安装 Node、Python 或开发工具。

适用于 Windows 10 / 11 的64位电脑。程序使用当前 Windows 用户的应用数据目录保存档案；移动应用文件夹不会移动档案。卸载或换电脑前，请在“学习档案”导出备份。

### 安卓

把 `词汇日报-0.1.0-Android.apk` 传到手机后安装，再从桌面打开。需要 Android 8.0 或更高版本，以及支持现代网页功能的 Android System WebView / Chrome。

这是供体验的开发签名安装包，未上架应用商店。已完成编译和签名校验，目前尚未在实体安卓设备验证；系统文件选择、分享备份和系统边距仍需要真机体验反馈。

### 每天的流程

1. 打开“今日版”，进入今日课程。
2. 回想单词含义，点击“翻看释义”。
3. 阅读搭配和例句，点击喇叭可以朗读。
4. 按记忆情况自评。电脑支持空格翻卡、数字1至4评分。
5. 有到期词时，回到“今日版”进入复习。自由读十词也保存评分、安排复习，但不计入课程配额。

初次在第二台设备使用时，先导入第一台设备导出的备份。此后交替使用并交换最新备份。相同档案按事件标识合并，重复导入不重复记账；不同档案导入前保留恢复副本。初版不支持自动同步，也不建议两台设备各自更改课程后再合并。

## 内容范围与限制

当前是 **120词试用包**，含4个语义主题、11组古典词根，以及现代词族与独立词条，共46组构词线索。它用于验证学习流程和界面，**尚不是完整的基础＋四级＋六级词库**。

释义、搭配与双语例句为本项目原创试编内容；基础、四级、六级标签仅供学习参考，尚未对照正式词表逐条审核。音频为本地合成，不是人工录音。音标、重音、构词关系及内容仍需完整人工校审；学习统计表示“读过”，不宣称已掌握。

日期按北京时间划分。暂无提醒、账号、后台服务、局域网同步、测验或语法教学。程序、字体、卡片和360段音频都随安装包提供，学习不需要网络，也不调用付费接口。

## 开源与内容来源

- 程序源码：GPL-3.0-only，见 `LICENSE`。
- 原创词卡、例句与应用图标：CC BY-SA 4.0，见 `content/LICENSE.md`。
- Piper：GPL-3.0；采用 `en_US-ljspeech-medium` 美音模型生成音频，模型说明声明训练数据 LJSpeech 为公共领域。模型与音频来源记录位于 `content/audio-provenance.json`、`public/audio/manifest.json` 和 `public/licenses/piper-ljspeech-model-card.txt`。
- Newsreader 与 Noto Serif SC 字体：OFL-1.1，完整字体许可随包提供。
- React、Capacitor、Electron、Dexie、ts-fsrs 等保留各自许可，见 `THIRD_PARTY_NOTICES.md` 与 `public/licenses/dependencies`。Electron 的 Chromium 许可随 Windows 程序提供。

源码与锁定依赖一并交付，可自行修改和重新构建。制作与运行不要求购买服务；后续如果发布应用商店，商店账号和签名属于独立发布环节。

## 开发与构建

初版使用 React + TypeScript；Windows 使用 Electron，安卓使用 Capacitor；学习档案通过 Dexie 原子写入 IndexedDB。此技术路线替代任务书中建议的 Flutter，保留稳定词条标识、三阶段顺序、事件记录及内容版本规则。

### 环境

- Node.js 24 LTS、npm，Python 3.12用于内容整理；普通应用构建不必安装语音工具。
- Windows 打包需要 Windows；安卓构建需要 JDK 21、Android SDK Platform 36、Build Tools 35 / 36，并接受 Android SDK 许可。
- 已提交 `package-lock.json`；请用 `npm ci` 恢复对应版本。

```powershell
git clone https://github.com/AliothChen555-star/daily-lexicon.git
cd daily-lexicon
```

```powershell
npm ci
npm run dev
# 浏览器打开 http://127.0.0.1:4173
npm test
npm run test:ui
node scripts/collect-licenses.mjs
npm run build
npm run desktop
npm run package:windows
```

安卓：

```powershell
npm run build
npm run android:sync
# 设置 JAVA_HOME、ANDROID_HOME；在 android/local.properties 配置 sdk.dir
cd android
.\gradlew.bat assembleDebug
```

也可以运行 `scripts/build-android.ps1 -ToolchainRoot <工具目录>`，工具目录中的 `paths.json` 格式为 `{"java":"JDK路径","android":"SDK路径"}`。构建 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。`prepare-toolchain.py --directory <工具目录>` 可下载 Windows 开发工具；`install-android-tools.ps1` 是本次环境的辅助脚本，其他环境建议通过 Android Studio 的 SDK Manager 安装。

图标由本地 SVG 生成，运行 `node scripts/create-icons.mjs` 可重新生成。Playwright 界面测试使用已安装的 Chrome。Windows 测试使用独立临时档案，不改动日常使用数据。

### 修改词卡与音频

`content/editorial/*.tsv` 每行9列，以 `|` 分隔；搭配与例句用 `英文::中文`，多个搭配以英文分号分隔。运行 `python scripts/build-content.py` 生成词包，校验唯一标识、主题数量与分组归属。

音频已经放入源码，无需重新合成。需要更新时：

```powershell
python -m venv .toolchain/speech
.toolchain/speech/Scripts/python -m pip install -r requirements-audio.txt
python scripts/download-voice.py --directory .toolchain/voice
.toolchain/speech/Scripts/python scripts/generate-audio.py --voice-directory .toolchain/voice
```

音频生成工具会保留已有文件。修改例句后，请删除对应旧 WAV 再生成。模型会从公开源下载；音频生成有随机成分，逐字节结果不保证一致。`public/audio/manifest.json` 保存实际文本、音素、时长与哈希。

## 工程目录

| 路径 | 用途 |
| --- | --- |
| `src/engine.ts` | 课程、FSRS、事件、撤销、备份校验与重放 |
| `src/storage.ts` | 本地原子保存、导入前恢复副本 |
| `src/App.tsx` | 应用状态、播放、导航与操作协调 |
| `src/pages.tsx` / `src/styles.css` | 报纸版界面与响应式布局 |
| `src/data/content.json` | 可校验的结构化试用词包 |
| `content/editorial` | 可编辑的原创词卡资料 |
| `public/audio` | 360段离线 WAV 与音频清单 |
| `electron` / `android` | Windows 与安卓工程 |
| `tests` | 课程、备份、界面及桌面检查 |

## 后续开发顺序

1. 依据任务书完成合法可再分发的正式基础、四级、六级词表，建立版本、出处与覆盖报告。
2. 对音标、音频、例句及词根建立人工校审工作台，再扩大到全量词包。
3. 扩展语义层级、词义与多标签关联；词根轮继续覆盖无法拆分的独立词。
4. 增加 SQLite 存储适配与经过冲突测试的局域网同步，保留已有备份兼容。
5. 真机检查安卓系统分享、无障碍、边距和长时间学习，准备正式签名与发行。
