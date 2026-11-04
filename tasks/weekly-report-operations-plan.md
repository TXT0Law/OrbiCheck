# 週報排程與投遞維運計畫

維運人員要能查出本週該產生的週報有沒有開始、哪些目的地已接受投遞，以及接手的人可以安全地做什麼。每一票都使用同一個 `runId` 串起資料庫狀態、報告與演練記錄。SMTP 的最終接受回覆或 Slack 的成功回應可證明服務端已接受，使用者閱讀與最終到信另需其他證據。

## 從哪裡接手

本計畫以 `c4c8bc8` 為研究基線。每次開工先核對最新 `origin/main`。`codex/scheduled-fresh-reports` 在 `31c9bfb` 有候選修正，包括發送前重讀設定、對回執要求明確成功、限制工作重入。該分支也包含掃描與風險分析的變更。依當票驗收逐項比較或移植，保留主線已合併的契約與測試。現有 [可靠性總計畫](plan.md) 和 [工作清單](todo.md) 的 B1、B5、B6、H4 涵蓋共用夾具、通知恢復及 CI。先查看兩處及開放 PR，若同一改動已有 owner 或已合併，就沿用其成果。

可複用的產品入口是 Reports → Schedules、`POST /report-schedules/{id}/run-now` 與 `GET /report-schedules/{id}/runs`。既有前端 client 能讀取歷史，排程表只呈現最近一輪的摘要。`run-now` 建立新的 run，不能用來重試某個舊 run。[API](../backend/app/api/v1/endpoints/report_schedules.py) · [前端 client](../lib/api/report-schedules.ts) · [排程列表](../components/report/report-schedule-list.tsx)

## 本批 W0　同一週報在派工失敗後可以接手

**Owner** Backend 與 Infra。這是本次 `codex/weekly-report-recovery` 的交付與驗收範圍。接手者從 PR、checks 和最新 `main` 判定實際進度。

- [ ] 到期週報及手動 `run-now` 建立持久化待處理工作。若資料庫已提交、broker 未收到訊息，broker 恢復後能派送原本的 `runId`。同一排程週期只有一個 run。手動請求驗證回傳的 runId 和後續查詢指向同一筆。
- [ ] 兩個 worker 收到同一項工作只有一個能開始執行。已進入外送或已完成的 run 再收到訊息，不會重做外部投遞。外部可能已接受但無法取得確認時，保留可核查狀態。
- [ ] Linux CI 跑隔離 PostgreSQL、Redis、Celery 與受控 SMTP 的故障演練，記錄 run、report、SMTP 計數及重啟後狀態。以 `make test-weekly-report-recovery` 執行。重現需要後端開發依賴、PostgreSQL server tools、`redis-server`、可綁定 loopback 的非 root 帳戶。測試會建立自己的暫存服務。CI 及合併證據齊全後才勾選。[演練入口](../scripts/ci/test-weekly-report-recovery.py)

**部署及回退順序。** 先暫停舊版 Beat／手動派工入口，讓舊版週報 worker 完成在途任務並離隊，核查尚在生成或外送的 run，再套用向後相容的資料庫 migration。舊版 worker 收到同 ID 訊息仍可能從頭生成。啟動新版 worker，確認只有新版 consumer 可取得工作後，才開啟新版補派、恢復 producers 並觀察第一輪 run。若需回退，先暫停 scheduler、手動派工及 consumers，對照資料庫與接收端記錄逐筆核查 queue 裡的訊息及在途外送，再恢復相容版本。保持 run、report、回執及 migration 資料供判讀。[本批基線 worker](https://github.com/TXT0Law/OrbiCheck/blob/c4c8bc8ed7e9e0885c82c61bf0f7e0286b42ed70/backend/app/tasks/report_schedule_tasks.py#L38-L61)

## 後續工作順序

**P0 優先讓接手者查清狀態。** W0 合併後先做 W1。W2 可用 W1 在舊資料上定義的狀態先行上線。W3 及 W4 處理跨渠道投遞，於資料和操作介面能區分「未送出」與「可能已送出」後，才開放局部重試。

| 工作 | 相依、Owner | 可驗收的結果 | 驗證組合 |
| --- | --- | --- | --- |
| W1　定義每輪執行的維運摘要 | W0，Backend | 在既有 `/runs` 提供具型別的報告產物狀態、渠道結果、需人工核對的原因和可用 ID。用成功、純儲存、部分成功、舊空摘要及輸出後失聯五組樣本核對。舊資料缺回執顯示「無法確認」，未知欄位及其他 owner 的資料不洩漏。 | B、C |
| W2　從排程表追到指定 run | W1，Frontend A/B | 「執行歷史」讀取既有 client，顯示每輪時間、產物、渠道結果及下一步。Run now 以回傳 `runId` 定位。用有多輪歷史與 pending 的資料驗最新一筆可達，空集合與服務錯誤分開，繁中和窄螢幕均可讀。若既有上限或排序遮住剛入列的一筆，補受限的 owner 查詢或穩定排序。 | F、C |
| W3　按目的地持久化投遞嘗試 | W1，Backend | 寫入意圖再出網，對同一 run、渠道及目的地做原子領取，外送時釋放資料庫鎖。以兩位 Email 收件人加 Slack 驗證阻斷後仍辨識已接受、可證實未開始及結果未知。舊 run 不回填虛構回執。必要 schema 採向後相容 migration。 | B、D、M |
| W4　只重試能證實尚未送出的目的地 | W2、W3，Backend 及 Frontend A/B | 明列原 run、選定目的地與可重試原因。重複點擊和兩個 worker 競爭均只領取一次。已接受的目的地保持完成，未知目的地進人工核對。送前再次查排程是否已暫停、目的地是否仍有效，記錄操作人、原因及結果。 | B、F、C、D |
| W5　納入週報維運輪值與部署驗收 | W2、W3，Infra 與維運 owner | 依週期統計應執行數、準時產生比例、已設定目的地確認比例、未知及積壓的最長時間。記錄缺樣本與停用排程的分母規則。於隔離部署演練 broker 中斷、worker 重啟及 SMTP 接受後失聯，值班人員僅憑 run ID 及手冊完成判讀。 | D、C |
| W6　恢復已停滯的報告生成 | W1、W3，Backend。有積壓證據時提前評估 | 針對停留於 `generating` 的 run 確認舊 worker 已失去執行權，並用 attempt 識別阻止遲到寫入。於產物建立前後分別殺掉 worker，驗同一 run 僅有一份有效報告，且不會重新發送可能已投遞的目的地。 | B、D，涉及資料變更時加 M |

**決定是否擴大開發。** W2 上線後抽查實際週報，記錄從發現問題到定位 run 的時間、人工核查次數、漏掉週期和可信的重複投遞證據。先取得一個完整排程週期的基線，由維運 owner 確定可接受的準時窗口、告警門檻與觀測期。若未知或部分成功的個案需要逐目的地處理，優先 W3/W4。若問題集中於佇列等待，先把 W5 的排程／佇列觀測拆成獨立票。既有 [服務目標](../docs/operations.md) 可作對照，其告警投遞指標與週報應分開計算。

### 如何判斷能否重試

| 已知事實 | 自動處理與人工動作 |
| --- | --- |
| DB 已提交、run 還是 pending，尚無 worker 取得執行權 | W0 以原 ID 補派，worker 原子領取。記錄同週 run、報告與實際發送次數。 |
| 產物已生成，某些渠道有明確接受回執 | 保留產物連結和逐目的地回執。W4 只允許處理其餘有證據證明尚未送出的項目。純儲存排程顯示「已儲存」。 |
| 外部可能已接受，worker 中斷、網路逾時或回執未入庫 | 標記需核查並保留嘗試時間及匿名化識別。營運方查郵件／Webhook 接收端記錄後登記結果，保留判斷依據。`failed` 或時間經過本身不足以授權再送。 |
| 非法設定、停用渠道、已撤回收件人 | 保留失敗原因。修正設定後重新驗證允許的目的地與處理意圖。任何重新送出均須遵守上一項未知結果的限制。 |

## 驗證組合

- **B 後端。** 先以 `cd backend && uv run pytest tests/unit/test_report_schedule_service.py tests/integration/test_report_schedules_api.py` 選出當票重現案例，再跑 `make lint-backend`、`make test-backend-unit`、`make test-backend-integration`。
- **F 前端。** 先以 `pnpm exec vitest run tests/lib/api/report-schedules.test.ts tests/pages/reports-pages.test.tsx` 加上當票元件測試驗證畫面，再跑 `make lint-frontend`、`make test-frontend`、`pnpm build`、`make check-bundle`。改動跨前後端流程時，在隔離測試資源執行 `pnpm test:linked`。
- **C 契約與規則。** 路由、schema 或服務變更新增／更新 API 文件與行為測試，執行 `make docs-generate`、審閱 diff、`make check-docs`、`make check-harness`。對舊格式、壞格式和不同 owner 各留回歸。
- **D 真實派工與外送。** 執行 `make test-weekly-report-recovery`，再為當票增加對應情境。保存階段記錄、執行命令及退出碼。僅連隔離的資料庫、broker 與測試接收端。涉及 Slack 時用可控接收端捕捉接受次數和逾時。
- **M 遷移。** 在一次性 PostgreSQL 檢查 Alembic 單一 head 並執行 `uv run alembic upgrade head`，與 CI 的 `migrations` 工作一致。針對新增的 migration，在測試資料上另做回退和再升級演練、驗證相容讀寫。其他必要門檻依 [Definition of Done](../docs/harness/done-definition.md) 與 [CI 工作流程](../.github/workflows/ci.yml)。

## GPT-6.1 Sol 每票執行方式

1. 讀根目錄與涉及目錄的 `AGENTS.md`、本清單、舊計畫未完成項及相關 PR。`git fetch origin` 後記錄 `origin/main` SHA。在乾淨 worktree 從它建立 `codex/weekly-report-<ticket>`。一次選一張相依已在遠端 main 驗證的票。若別人已有該 PR，先檢視並協調。
2. 寫下這張票的使用者入口、責任人、狀態或資料契約、可重試的證據、錯誤路徑及驗收。沿用已存在的 route、client 和 worker。多個 owner 先約定契約與檔案分界。
3. 在原入口寫出能失敗的重現測試，記錄原始失敗。做最小修正，重跑同一案例及適用的 B/F/C/D/M，再跑該子系統的完整門檻。測試資源不足時記為 `BLOCKED`。在隔離環境補驗，保留實際輸出。
4. 交給獨立子代理審查完整 diff 與驗收證據。特別追問提交後中斷、重送、資料回溯、權限隔離、部分成功。針對有效意見修正並加回歸，再由獨立審查者覆核新 diff。把已解決和待解決項分開列出。
5. 推送功能分支，開 PR 到 `main`。PR 寫清 scope、base/head SHA、測試、失敗注入與相容性。部分工作只在開 PR 後啟動。監看 push 與 PR 兩組適用的 checks、尚未處理的審查意見與 repo 規定的核准。`gh pr checks <PR> --watch` 可追蹤結果，新提交需重新核對 SHA 和 checks。
6. CI 失敗先讀原始日誌。修正該票造成的錯誤、重跑本地檢查、複審、推送並等新 head 全綠。基礎設施暫態錯誤可保留原記錄後重試。持續的外部阻塞、缺權限或需要業務決定時，記錄 run URL、原因、owner 及恢復條件，停在該票。禁止跳測、降低門檻、強推及用管理員權限繞過分支保護。
7. 所有適用 checks 在最終 head 通過、必要審查已完成，才依 repo 一般合併方式合併。遇到 base 更新，先整合最新 main 並重新驗證。合併後 fetch、核對 PR 為 `MERGED`、合併 SHA 已在 `origin/main`、對應 main CI 通過。若 main CI 失敗，先修復或按正常流程回退該變更。正式部署沿用專案獨立的發版與核准流程。
8. 在 PR 或任務交接記錄填上「工作 ID、base/head/merge SHA、PR URL、審查者與結果、本地命令／退出碼、CI 連結、main 驗證、未解項、下一張可開票」。這些資料可從遠端重查後，才關閉該票並選下一票。
