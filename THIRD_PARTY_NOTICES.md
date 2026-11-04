# 第三方内容与许可

词汇日报源码采用 GPL-3.0-only。第三方组件保留原作者版权和许可；本文件不改变其许可。

| 组件 | 用途 | 许可 / 来源 |
| --- | --- | --- |
| React / React DOM | 界面 | MIT；https://github.com/facebook/react |
| Electron / Chromium | Windows运行环境 | MIT及Chromium组件许可；随Windows程序提供 LICENSE 与 LICENSES.chromium.html |
| Capacitor及App / Filesystem / Share插件 | 安卓容器、文件与系统分享 | MIT；https://github.com/ionic-team/capacitor |
| Dexie | 本地数据库封装 | Apache-2.0；https://github.com/dexie/Dexie.js |
| ts-fsrs | FSRS-6调度 | MIT；https://github.com/open-spaced-repetition/ts-fsrs |
| Zod | 备份数据校验 | MIT；https://github.com/colinhacks/zod |
| Newsreader / Noto Serif SC | 离线字体 | SIL Open Font License 1.1；字体许可见public/licenses |
| Piper | 制作离线语音 | GPL-3.0；https://github.com/OHF-Voice/piper1-gpl |
| en_US-ljspeech-medium | 美音合成模型 | 模型说明见随附model card；https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium |
| LJSpeech数据 | 语音模型训练来源 | Public domain；https://keithito.com/LJ-Speech-Dataset/ |
| Wiktionary | 构词校对参考链接 | 项目未批量复制其释义；https://en.wiktionary.org/ |
| ECDICT | 仅用于候选范围的拼写和分级标签 | MIT；固定提交、原始SHA-256与采用字段见content/scope/source.json，原许可见content/scope/ECDICT-LICENSE；https://github.com/skywind3000/ECDICT |

词卡中文释义、搭配、英汉例句和构词提示均为本项目试编内容，不包含从商业词典抓取的正文。音频为本地生成。模型、Piper引擎与语音工具链不随运行时打包；已附生成脚本和来源记录。

构建依赖按各自原始许可使用，完整版本锁定于package-lock.json。运行时依赖的许可证、版权声明与清单位于public/licenses/dependencies，构建后也随应用提供。
