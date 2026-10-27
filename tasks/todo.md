# Bug fixing / harness 任务状态

计划：[plan.md](plan.md)。基线：[baseline-2026-10-27.md](baseline-2026-10-27.md)。

## 当前批次：计划与测试基线

- [x] 保存修复范围、任务依赖、验收标准和验证命令。
- [x] B0 记录环境、锁文件、已有工作区状态，安装锁定依赖并执行验证矩阵（包含 FAIL/BLOCKED，未声称全绿；部分初次日志丢失及恢复来源已披露）。
- [x] 检查点 A：完成失败分类和修复顺序；明确真实服务测试前提。

## 基线发现的优先修复（实现及本地验证）

- [x] B0-R0 两套 Playwright 输出和 HTML 报告各自隔离；真实 runner 清理回归及 CI 入口契约测试通过；日志/工具缓存位于忽略的 quickstart/logs，手动启动使用明确工具路径和数据库核对。
- [x] B0-R1 删除 Windows 特殊的 skipped 响应，统一 disabled 契约；三平台回归及完整 381 项测试通过。
- [x] B0-R2 确认 CRLF/shebang 加载差异，以 gitattributes 固定该脚本 LF；5 项测试及实际构建清单检查通过；门禁识别 scripts 的 Vitest 测试并有正负自测。
- [x] B0-R3 等待真实动态 import 完成，保留 Markdown 断言；新增内容更新/GFM 测试与真实浏览器回归通过。
- [x] B0-R4 默认 worker 数上限设为 2、下限 1；默认完整 coverage 146 文件、719 项通过，保留原始超时与门槛。

本批次证据见 [fixes-2026-10-27.md](fixes-2026-10-27.md)。修复分支推送和远端 CI 验收单独记录；不将本地 Windows standalone 打包阻塞计为通过。

- [x] 修复提交 `5e610d2` 已推送；[PR #31](https://github.com/TXT0Law/OrbiCheck/pull/31) 的 [CI Pipeline](https://github.com/TXT0Law/OrbiCheck/actions/runs/40470415172) 全部 11 个 jobs（含 quality-gate）通过。后续验收文档提交继续验证最终 HEAD。

## 扫描可靠性

- [ ] B1 独立测试资源、真实 worker 与受控外部服务夹具。
- [ ] B2 修复重扫提交/投递顺序与投递失败行为。
- [ ] B3 同一 attempt 执行互斥、取消/迟到写入、失联恢复。
- [ ] 检查点 B：真实扫描链路及现有 linked 回归通过。

## 通知可靠性

- [ ] B4 消除多渠道共享 AsyncSession 并发操作。
- [ ] B5 持久化投递意图与崩溃恢复。
- [ ] B6 重试领取互斥、失联接管和坏消息隔离。
- [ ] 检查点 C：多渠道与重试的真实事务回归通过。

## 结果可信度与边界

- [ ] B7 未检测/失败/跳过结果不生成确定性整改建议。
- [ ] B8 扫描 SSE 联合 schema、终态和迟到事件保护。
- [ ] B9 监控 SSE 真实入口使用解析后的事件。
- [ ] B10 告警 SSE 真实入口运行时校验。
- [ ] 检查点 D：异常结果不进入用户结论或前端状态。

## 必要 harness 加固

- [ ] H1 依赖方向检查支持实际导入解析与负例。
- [ ] H2 API/SSE 边界检查与真实消费入口一致。
- [ ] H3 测试门禁覆盖删除/新增/重命名及 skip/only 等变更。
- [ ] H4 CI 覆盖率证据、真实异步验证和必要场景接线。
- [ ] H5 追加规则更正并执行最终完整验收。

未经验证的项保持未勾选；BLOCKED 不能当作 PASS。当前不包含新功能任务。
