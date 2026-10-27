# Bug fixing 与必要 harness 加固计划

日期：2026-10-27。起点：`19412c5c93ed6804409f9aa807cdc756567d41d5`。

## 目标与范围

恢复扫描结果的可信度、异步任务的一致性和通知投递的可靠性，并将对应回归接入现有验证流程。当前首先执行 B0 测试基线；基线中的代码失败与环境阻塞必须先分类，再进入修复。

本计划不包含新扫描模块、定时完整扫描、整改管理、多租户、SLO 产品界面或其他新功能。不升级锁定依赖，不修改真实 `.env`，不操作生产数据库。用户后续已授权本批次修复完成后推送并通过 CI；只推送 `codex/fix-baseline-harness` 修复分支，不直接推送或合并 main。

任务状态见 [todo.md](todo.md)。基线证据见 [baseline-2026-10-27.md](baseline-2026-10-27.md)。最终证据目录为被忽略的 `quickstart/logs/baseline-2026-10-27-19412c5/`，与测试输出清理目录分离；第一次采集曾使用 `test-results/`，部分日志被旧配置清理，已在基线报告中记录缺口、恢复来源及重新采集结果。不将原始环境日志加入版本控制。

## 实施约束

- 当前规划和基线由主代理顺序执行。后续依次承担相应目录 owner 的任务，不允许两个执行者同时写同一文件。
- 每项修复先补最小失败回归，再实施修复；不能通过删除、跳过测试、降低覆盖率或放宽 schema 来获得通过。
- 保持现有快速 linked 测试；真实 worker 测试作为补充，外部 HTTP/通知使用受控测试服务。
- 先复现事务竞态，再确定执行租约、attempt 标识或持久化投递方案；不得仅凭静态推断宣称线上故障已修复。
- `flush` 不视为提交；运行状态不视为执行权；外部副作用不视为数据库事务的一部分。
- 明确投递语义：支持崩溃恢复、领取互斥和可审计重试；外部渠道不支持幂等键时，不承诺跨系统 exactly-once。
- 对 SSE 保留合法的进度、失败、取消和单独 `{done:true}` 终态；使用解析后的数据，非法结构不得更新状态。
- 对未知、失败、跳过、未选择模块保留检测状态，不以默认零值/false 生成确定性发现。
- 业务修复前按工作区隔离流程处理分支；本轮基线不修改业务源码。
- harness 文档保留原文并追加更正/规则；本次用户已授权本计划范围内的必要 harness 加固和修复分支推送、CI 验证。生产配置、真实数据删除与合并仍不在范围内。

## B0：建立测试基线

**Owner：** Infra。**依赖：** 无。**范围：** `tasks/` 计划和证据，忽略的依赖/测试输出。

**步骤：**
1. 记录提交、工作区已有改动、OS、Node/pnpm/Python/uv 版本、锁文件哈希以及 PostgreSQL/Redis/Docker/浏览器可用性。
2. 按锁文件安装现有前端、Backend、Scan Service 依赖；优先使用与 CI 一致的 Node 20、pnpm 9、Python 3.11。版本或平台不一致必须记录。
3. 执行各子系统 lint、完整测试及覆盖率门禁；执行构建、bundle、harness、docs 检查；满足前提时运行 linked E2E、迁移与容器验证。

**验收：**
- 每个验证项记录准确命令、工作目录、退出码、结果和日志；结果仅使用 PASS、FAIL、BLOCKED、NOT_RUN。
- 环境/权限/依赖缺失与测试断言失败分开；无输出、未运行和 BLOCKED 均不视为通过。
- 原有未跟踪崩溃日志、锁文件、真实配置不被覆盖；基线不包含业务修复。

**验证：** `make lint`、`make test`、`make test-cov`、`pnpm build`、`make check-bundle`、`make check-harness`、`make check-docs`、`pnpm test:linked`；缺少 make 时逐一执行 Makefile 对应命令并记录等价关系。迁移及容器验证只能针对确认隔离的测试资源。

### 检查点 A：基线评审

B0 证据完整后，先处理阻碍测试的环境问题及原有失败。给出可运行的修复顺序；受环境阻塞的真实事务测试不得用 mock 通过结果替代。后续工作以小批次检查点推进。

### B0-R0：测试输出清理与证据隔离

**Owner：** Infra。**依赖：** B0。**预计：** 2–4 文件（`playwright.backend-down.config.ts`、测试输出目录契约测试、必要的基线启动辅助文件）。

**验收：** 每套 Playwright 配置显式使用独立的叶子输出目录，不能清理整个 `test-results` 或其他配置输出；日志、工具链、依赖缓存均位于所有 runner 清理目录之外；临时环境准备失败时不能继续调用默认包管理器或默认数据库。

**验证：** 在隔离 fixture 中创建 sibling sentinel，初始化测试输出后 sentinel 保留；检查现有两套配置及未来新配置，正常执行 linked/backend-down。基线已通过 `--output=test-results/backend-down-baseline` 临时规避旧配置，永久修复尚未实施。

### B0-R1：Windows traceroute 禁用响应契约

**Owner：** Scan。**依赖：** B0。**预计：** 2 文件（`backend/scan/trace-route.js`、对应测试）。

**验收：** Windows 与其他平台的禁用模块均明确表达 disabled；模块仍不注册、不执行外部 traceroute；正/负平台分支有回归。不得删除或跳过当前失败断言。

**验证：** `npm test -- --runTestsByPath __tests__/trace-route.test.js`、Scan lint 与完整 coverage suite。基线已确认 Windows 单文件和完整集合均失败。

### B0-R2：bundle 检查器在测试加载器中的导入

**Owner：** Infra。**依赖：** B0。**预计：** 2–3 文件（检查器、`tests/scripts/bundle-budget.test.ts`、必要的 loader 测试）。

**验收：** 同一检查器可由 Node CLI 和 Vitest 正常导入，三个原有断言确实执行；保留 CLI 主入口和现有预算；覆盖 Windows 路径/换行引起的加载差异。

**验证：** `node --check scripts/ci/check-bundle-budget.mjs`、该测试文件、实际 build manifest 上的 bundle CLI。基线中 Node syntax check 通过，Vitest 导入失败；尚不能断定是脚本本身的语法错误。

### B0-R3：报告详情动态预览回归

**Owner：** Frontend A/B（按实际归因交接）。**依赖：** B0。**预计：** 2–4 文件（详情页面/预览组件/页面测试，依根因选择）。

**验收：** 明确是产品动态加载还是测试 fixture 的问题；保留真实 Markdown 渲染断言及 loading/error 状态；低并发与单文件运行均稳定，不通过加长超时掩盖问题。

**验证：** `tests/pages/reports-pages.test.tsx` 的原始失败案例、相关组件测试及真实报告预览联调。基线低并发复跑仍停在 loading。

### B0-R4：前端测试并发敏感性

**Owner：** Infra/Frontend A。**依赖：** B0-R2/R3。**预计：** 2–4 文件。

**验收：** 核实冷启动、并发资源预算与测试共享状态；保留原始超时/断言/完整集合，明确本地和 CI 的 worker 策略；不能把隔离复跑通过误报为全套 coverage 通过。

**验证：** API 边界和 URL group 失败文件单独通过后，以受控并发运行完整 coverage 集合；记录实际执行数量与所有覆盖率门槛。基线默认集合有 4 个 API 超时，低并发定向复跑通过，原因尚需进一步确认。

检查点 A 后先收敛 B0-R0–R4，再实施原计划的事务/通知修复。Windows standalone 打包所需符号链接权限属于环境阻塞；本计划不会为了通过检查关闭 standalone 输出、类型检查或修改系统安全设置，需在有相应权限的环境或 Linux CI 完成构建验收。

## B1：真实异步链路测试夹具

**Owner：** Infra/Backend（顺序交接）。**依赖：** B0。**预计：** 每片 3–5 文件；若需要跨目录，先定义测试启动契约再分片。

**文件：** `scripts/dev/` 新增隔离测试启动器、`backend/tests/` 新增真实服务 fixture、相应启动器自测。

**验收：**
- 使用独立测试库、Redis key 前缀和真实 Celery worker，启动器拒绝非测试数据库与复用用户服务状态；启动前必需环境缺失时直接失败，不能回退到清空固定名称数据库。
- 外部 HTTP/通知使用本地受控 fixture；启动失败/超时返回非零并保留诊断。
- 可以在提交前后、发送前后设置同步屏障，确定性控制竞态，避免依赖 sleep 碰运气。

**验证：** fixture/启动器自测、真实服务健康检查及一条扫描完成 smoke；本项不要求故意触发的业务缺陷已经修复。

## B2：重扫提交与投递顺序

**Owner：** Backend。**依赖：** B1。**预计：** 3–5 文件。

**文件：** `backend/app/services/scan_service.py`、`backend/app/api/v1/endpoints/scans.py`、对应 rescan 单测和真实事务回归。

**验收：**
- 从 completed/failed/cancelled 重扫时，worker 不会读取旧终态后提前退出，任务可到达正确终态。
- 数据库提交失败不投递；broker 投递失败不遗留无法解释的 running 状态，明确补偿/恢复行为。
- 创建与重扫采用一致的提交/投递契约，不用先标记 running 伪装 worker 已领取。

**验证：** rescan 单测、API 集成测试、真实 PostgreSQL/worker 屏障回归、Backend lint 与完整测试。

## B3：扫描执行权与终态保护

**Owner：** Backend。**依赖：** B2。**预计：** 3–5 文件；若需要持久化 attempt/租约，先拆分迁移及模型片，再实施执行逻辑。

**文件：** `backend/app/tasks/scan_tasks.py`、相应 service/task 测试；模型/迁移仅在复现证明必要后加入独立子任务。

**验收：**
- 同一扫描 attempt 的两个任务不能同时执行模块；重投递与合法恢复能够区分。
- 取消后迟到结果不能覆盖 cancelled；上一次 attempt 的结果不能写入新 attempt。
- worker 失联后可按明确租约/超时策略恢复或进入失败终态，不无限保持 running。

**验证：** 双 worker 竞争、重复消息、取消交错、worker 中止/重启回归；Backend 全套验证。迁移变更另外验证单 head 和隔离库 upgrade。

### 检查点 B：扫描可靠性

B2/B3 的失败回归在修复前失败、修复后通过；创建→执行→取消/重扫→终态与现有前端 linked 行为一致。

## B4：通知渠道数据库会话并发

**Owner：** Backend。**依赖：** B1。**预计：** 3–5 文件。

**文件：** `backend/app/services/notification_channels/registry.py`、`dispatch_log.py`、对应渠道与真实事务测试。

**验收：**
- 同时启用至少两个渠道时，没有同一 AsyncSession 的并发数据库操作。
- 单渠道异常不会中断其他渠道或污染已完成记录。
- 保留每个渠道的独立结果和尝试记录，现有通知配置兼容。

**验证：** 多渠道受控发送、真实数据库 flush/commit 回归、通知单测和 Backend 完整测试。

## B5：通知崩溃恢复

**Owner：** Backend。**依赖：** B4。**预计：** 3–5 文件；如需要表结构调整，迁移先作为独立子片。

**文件：** `dispatch_log.py`、通知调用者、通知模型（必要时）、崩溃恢复测试。

**验收：**
- 发送前已持久化可恢复的投递意图；不会在回滚的业务事务中发送新通知。
- pending/发送中的失联记录可在超时后接管，最大尝试次数和最终失败可审计。
- 明确发送成功但确认前崩溃的重复窗口，支持的渠道复用稳定幂等键。

**验证：** 在发送前、发送后确认前中止 worker，并验证恢复；单元、真实事务、Backend 全套。

## B6：通知重试领取互斥

**Owner：** Backend。**依赖：** B5。**预计：** 3–5 文件。

**文件：** `dispatch_log.py`、`backend/app/tasks/notification_tasks.py`、重试领取/失联恢复测试。

**验收：**
- 两个重试执行者不会同时领取并发送同一条有效租约内的投递。
- 失联租约可以接管，dead/succeeded 不被自动重发，退避和最大次数仍有效。
- 一条无效 payload 不造成整批永久饥饿；失败记录及原因为可诊断状态。

**验证：** 双执行者并发、租约到期、坏消息与好消息混合批次测试，Backend 全套。

### 检查点 C：通知可靠性

多渠道、自动重试、失联恢复全部通过真实数据库回归；不将“请求发出”描述为“对方已送达”。

## B7：缺少证据时的错误整改建议

**Owner：** Backend。**依赖：** B0。**预计：** 3–5 文件。

**文件：** `backend/app/services/transformers.py`、`recommendations.py`、`backend/tests/unit/test_recommendations.py`、转换和报告一致性测试。

**验收：**
- 空结果、仅选择 DNS、模块失败/超时/跳过均不凭默认值生成证书即将过期、缺少安全头或 DNSSEC 关闭结论。
- 实际确认存在的问题继续生成建议，正常结果不误报；数据缺失不被当成检测通过。
- 网页详情和离线报告使用一致的证据语义；必要的响应形状兼容性有测试保护。

**验证：** 上述矩阵的最小失败回归、transformer/recommendation/report 单测、Backend 完整测试；契约变化追加 docs 与前端验证。

## B8：扫描 SSE 结构验证

**Owner：** Frontend A。**依赖：** B0。**预计：** 4–5 文件。

**文件：** `shared/schemas/scan.ts`、`lib/hooks/use-scan-progress.ts`、对应 hook/schema/进度状态测试。

**验收：**
- 使用合法事件联合 schema；字段类型/范围错误、合法 JSON 的错误结构不得写状态或触发完成。
- 保留进度、错误、取消和 bare done；重复终态最多触发一次完成，切换 scanId 后忽略旧连接事件。
- 明确断线重连或轮询降级策略，避免前端 store 与最终查询状态冲突。

**验证：** hook/schema 测试、Frontend lint/完整测试/build/bundle；shared 变更需 Backend 契约回归；扫描 linked 场景。

## B9：监控 SSE 入口贯通

**Owner：** Frontend A。**依赖：** B8 的事件解析约定。**预计：** 3–5 文件。

**文件：** `lib/hooks/use-monitor-sse.ts`、`lib/api/monitors.ts`、`shared/schemas/monitor.ts`（必要时）、相关测试。

**验收：**
- 两个真实监控 hook 复用经验证的事件解析，不再用断言替代校验。
- 非法 id/type/事件结构不触发错误的 query invalidation，heartbeat 保持兼容。
- 暂停、切换监控和卸载时连接释放行为正确。

**验证：** 监控 SSE 解析/订阅测试、Frontend 全套与监控 linked 场景。

## B10：告警 SSE 入口验证

**Owner：** Frontend B（shared 变更先交接 Frontend A）。**依赖：** B8。**预计：** 3–4 文件。

**文件：** `components/alerts/alert-sse-provider.tsx`、对应 shared 事件 schema、provider/schema 测试。

**验收：**
- 所有实际消费事件先校验，非法结构不影响告警计数和缓存。
- heartbeat、正常告警和重复事件保持预期行为，卸载释放连接。
- 解析错误可诊断，不记录敏感 payload。

**验证：** provider/schema 回归、Frontend lint/完整测试/build 与告警关联的联调。

### 检查点 D：结果与前端边界

B7–B10 的异常样例不能进入用户结论或前端状态；保留现有事件和报告兼容行为。

## H1：依赖方向检查盲区

**Owner：** Infra。**依赖：** B0。**预计：** 3–5 文件。

**文件：** `scripts/ci/harness_checks.py`、`test-harness-checks.py`、必要的 TS 导入解析辅助文件及依赖方向 wrapper。

**验收：**
- 解析相对路径、项目 alias、静态 export-from、动态 import 和 Python 相对导入；消除注释中的假导入。
- 同层/合法低层导入通过，真实反向依赖被定位到文件行号；不以无限扩大的豁免表隐藏现有问题。
- 现有六个 fixture 和本轮发现的对应负例均纳入自测。

**验证：** checker 正/负例自测、依赖检查和 harness；辅助 TS 解析优先使用项目已有开发依赖。

## H2：边界检查与实际消费路径一致

**Owner：** Infra。**依赖：** B8–B10。**预计：** 3–5 文件。

**文件：** `harness_checks.py`、checker 自测、必要的显式边界契约清单。

**验收：**
- 文件中无关 parse 或注释不能为另一个未验证 API 函数放行；SSE 实际入口列入检查。
- `-> dict` 或泛型 unknown 不被宣传为完整响应验证；JSON/binary/SSE 分别规定正确的边界责任。
- 静态规则不能可靠推断的委托路径，使用明确的边界登记与运行时异常结构测试，而不承诺任意程序数据流证明。

**验证：** parser 仅存在于注释/无关函数、错误结构 SSE、未解析 API 返回的负例；现有合法包装器正例；harness。

## H3：测试要求门禁

**Owner：** Infra。**依赖：** B0。**预计：** 2–3 文件。

**文件：** `scripts/ci/require-tests.sh`、`test-require-tests.sh`、必要的检查辅助文件。

**验收：**
- 覆盖删除/重命名、工作区新文件以及未跟踪 Backend 文件，不能因空 diff 被误判为 lint-only。
- 新增 skip/only/xfail 或删除测试触发明确审查；合法移动与等价测试重构有正例，不能简单按字符串误报。
- 保留 subsystem 与 shared 双边测试要求；语义覆盖依靠任务回归映射和评审，不虚称文件变化即证明覆盖。

**验证：** 临时隔离仓库的 gate 正/负例与现有 self-test；harness。

## H4：CI 证据与必要门禁接线

**Owner：** Infra。**依赖：** B1、H1–H3，业务修复达到相应检查点后接入。**预计：** 3–5 文件。

**文件：** `vitest.config.ts`、`.github/workflows/ci.yml`、Scan coverage 配置（需要时）、覆盖率/门禁契约自测。

**验收：**
- JSON coverage summary 确实生成且 artifact 提取路径正确；无基线比较时不声称 improved/regressed。
- 保留覆盖率下限和原有 quality-gate，真实异步 smoke 与 backend-down 场景有明确接线及失败诊断。
- 迁移若有变化，验证从上一版含数据的测试库升级，不仅验证空库；不使用真实用户库。

**验证：** CI 配置/产物契约测试、各 coverage 命令、linked 与真实异步测试；完整 CI 成功需实际 CI 证据，本地不能代替。

## H5：规则更正与验收收口

**Owner：** Infra；harness 文档 append-only。**依赖：** 所有已实施项。**预计：** 每片 2–5 文件。

**文件：** `docs/harness/` 中追加更正与任务生命周期/证据语义说明、`scripts/ci/` 必要自测、`tasks/` 状态。

**验收：**
- 文档路径与实际源码一致，合法依赖方向、owner、命令及例外解释一致；不扩大本轮权限。
- 每项已完成修复有可重现的失败/通过证据，所有既有门禁通过且无新增警告。
- 仍阻塞的验证项、风险、环境前提明确列出，不将 BLOCKED 标为完成。

**验证：** `make lint`、`make test`、`make test-cov`、`pnpm build`、`make check-bundle`、`make check-harness`、`make check-docs`、`pnpm test:linked`，以及本轮新增真实异步回归；容器/迁移变更增加相应验证。

## 建议顺序与退出标准

顺序：B0 → 检查点 A → B1 → B2/B3 → 检查点 B → B4/B5/B6 → 检查点 C → B7/B8/B9/B10 → 检查点 D → H1/H2/H3/H4/H5。H1/H3 的快速负例可在对应业务修复之间穿插，实际修改仍顺序进行。

B0 完成代表基线证据完整，不代表全绿。稳定性迭代完成需要：四类目标问题均有回归和修复、必要门禁有效执行、无未解释的测试失败、无新增 lint/type 警告、已变更集成链路验证通过。未实施项继续保持未完成，不以计划文件存在替代交付。
