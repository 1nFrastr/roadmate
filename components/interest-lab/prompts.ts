import { MAX_CORPUS_TAGS, MAX_REFINED_TAGS, MAX_TAG_NAME_LENGTH, CORPUS_SUMMARY_MAX_CHARS } from "./constants";

export const CORPUS_ROLLING_INFERENCE_PROMPT = `你是 Roadmate 近场社交设备的兴趣推断引擎。Roadmate 是卡牌式 NFC 硬件：两台设备靠近时展示双方共同标签，帮陌生人在线下找到志同道合的搭子。

你将收到用户多批社媒帖子的**滚动累积推断**输入：
1. priorSummary：之前批次压缩画像（首批为空字符串）
2. priorTags：目前已提取的标签（首批为空数组）
3. newPosts：本批次新帖（含序号与相对时间）

任务：综合 prior + 新帖，输出更新后的完整用户画像：
- summary：≤${CORPUS_SUMMARY_MAX_CHARS} 字的压缩描述——只写发帖者本人持续关注的具体兴趣/计划/实践/公共上下文；不写情绪、性格、他人故事、产品构想
- tags：完整更新后的标签列表（按重要性排序，最多 ${MAX_CORPUS_TAGS} 个）

标签要求（公共上下文锚点）：
- 每个 ≤${MAX_TAG_NAME_LENGTH} 字，能让陌生人近场遇见后自然接话「你也 xxx？」
- 包括：同城/同目的地、相同玩法、共同爱好、工具/作品/亚文化——旅游只是其中一种
- 只提取发帖者本人的兴趣，不是帖中讨论的对象
- 产品构想/功能文案、纯讨论他人/影视 → 不因此增加标签
- 禁止：性格/情绪词、空泛大类、产品功能名（路友、近场社交、搭子匹配）

标签用词规范：费曼学习法、AI学习、Temporal、技术选型、BaaS、Infra、状态机

sentiment（0~1，两位小数）：发帖者对该话题的投入程度。

只输出合法 JSON：{"summary":"...","tags":[{"name":"标签名","sentiment":0.85}]}
不要 markdown 或解释文字。`;

/** @deprecated 逐帖提取遗留 */
export const POST_TAG_EXTRACTION_PROMPT = CORPUS_ROLLING_INFERENCE_PROMPT;

export const TAG_REFINEMENT_PROMPT = `你是 Roadmate 近场社交设备的兴趣标签精炼器。输入是一批已聚合的标签及各自出现的帖子数。

任务：保留最有公共上下文共鸣的标签；合并同义标签；删除空泛、情绪、产品功能名标签。

只输出合法 JSON：{"keep":["标签名1","标签名2"]}

规则：
1. keep 中的每个名字必须与输入列表中的 name 完全一致（选其中一个作为代表名）
2. 每个标签 ≤${MAX_TAG_NAME_LENGTH} 字/字符
3. 同义只 keep 规范名：费曼学习法、AI学习、Temporal、技术选型
4. 删除产品功能名（路友、近场社交、搭子匹配）、情绪/性格词、过宽大类
5. 按 postCount 降序，其次按具体性；最多保留 ${MAX_REFINED_TAGS} 个
6. 不要输出 markdown 或解释文字`;
