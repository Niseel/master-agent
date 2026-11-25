# MCP tools

> Sinh bởi `pnpm list-tools` lúc 2026-11-23T06:53:29.437Z (runtime=copilot). Chỉ thông tin cấu trúc.
> Cột **Loại** là đoán theo tên, đã sửa tay ngày 2026-11-23 (ô có dấu `*`); mục azure thêm tay ngày 2026-11-25.
> Allowlist thật nằm ở `readTools` trong
> `packages/core/src/agents.ts`; không phải tool `read` nào cũng được đưa vào. Chạy lại `pnpm list-tools` sẽ ghi đè bảng
> này, nên phải sửa tay lại.

## workiq (agent: comms-reader) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `workiq-retrieve` | read | Search the user's M365 work data (mail, files, meetings, Teams messages, people) and connected enterprise sources; retur |
| `workiq-fetch_blob` | read | Download a binary file (document, PDF, image, photo) from a WorkIQ content path, up to 4 MB; returns the bytes base64-en |
| `workiq-accept_eula` | write* (đổi trạng thái, user tự chấp nhận) | Accept the End User License Agreement (EULA) to enable full access to WorkIQ tools. The EULA URL should be https://githu |
| `workiq-ask` | read | Ask a question to Microsoft 365 Copilot for information about emails, meetings, files, and other M365 data. Returns the  |
| `workiq-list_agents` | read | List available Microsoft 365 Copilot agents. Returns agent IDs that can be passed to ask's agentId parameter. |
| `workiq-delete_entity` | write | HTTP DELETE a WorkIQ entity by path; returns the status code. If a real ID is supplied, don't fetch the item just to ver |
| `workiq-do_action` | write* | Run a WorkIQ action, including write operations exposed by connected enterprise systems: for those, use search_paths to  |
| `workiq-create_entity` | write | Create a WorkIQ entity by POSTing JSON to a parent collection path; returns the created entity. Call it directly for sta |
| `workiq-get_schema` | read | Get the request/response schema for a WorkIQ path and operation, including operations exposed by connected enterprise sy |
| `workiq-search_paths` | read | Search for available WorkIQ entity paths and operations with a natural-language query; results are in structuredContent. |
| `workiq-call_function` | read | Call a read-only WorkIQ function, including read operations exposed by connected enterprise systems: for those, use sear |
| `workiq-fetch` | read | Fetch one or more WorkIQ entities by path; returns a JSON array with a result per path. Batch independent reads into one |
| `workiq-update_entity` | write | Update a WorkIQ entity by writing JSON to its path; returns the updated entity. Call it directly for standard fields (e. |

## ado (agent: board-reader) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `ado-repo_repository` | read | Read operations on Azure DevOps Git repositories. Use 'action' to choose: 'get' (get a repository by project and name/ID |
| `ado-repo_pull_request_thread` | read | Read operations on pull request comment threads. Use 'action' to choose: 'list' [requires repositoryId, pullRequestId] — |
| `ado-repo_pull_request` | read | Read operations on Azure DevOps pull requests. Use 'action' to choose: 'get' [requires repositoryId, pullRequestId, proj |
| `ado-core_list_projects` | read | Retrieve a list of projects in your Azure DevOps organization. |
| `ado-advsec_alerts` | read | Read operations on Advanced Security alerts. Use 'action' to choose: 'list' (retrieve alerts for a repository with filte |
| `ado-repo_file` | read | Read operations against repository tree contents. Use 'action' to choose: 'get_content' (read the text content of a file |
| `ado-core_list_project_teams` | read | Retrieve a list of teams for the specified Azure DevOps project. |
| `ado-pipelines_definition` | read | Read operations on pipeline (build) definitions. 'list' returns a trimmed page of definitions ({ items, continuationToke |
| `ado-pipelines_run` | read* | Read operations on pipeline runs (Pipelines REST surface, distinct from classic builds). 'get' retrieves a single run; ' |
| `ado-search_wiki` | read | Search Azure DevOps Wiki for a given search text. Each result includes both the raw git filesystem 'path' and a 'pagePat |
| `ado-work` | read | Read operations on Azure Boards iterations, team settings, and capacity. Use 'action' to choose: 'list_iterations' (proj |
| `ado-pipelines_build` | read | Read operations on Azure Pipelines builds. Use 'action' to choose: 'list' (search builds with filters or fetch by IDs; r |
| `ado-wit_backlog` | read | Read operations on Azure DevOps backlogs. Use 'action' to choose: 'list' (backlog levels for a team), 'list_work_items'  |
| `ado-search_workitem` | read | Get Azure DevOps Work Item search results for a given search text |
| `ado-pipelines_build_log` | read | Build log access. 'list' enumerates available logs for a build (returns log IDs, sizes, and types); 'get_content' fetche |
| `ado-repo_branch` | read | Read operations on Git branches. Use 'action' to choose: 'get' (get a single branch by name), 'list' (list branches in a |
| `ado-testplan` | read | Read operations on Azure DevOps test plans, suites, and cases. Use 'action' to choose: 'list_plans' (paginated list of t |
| `ado-wiki` | read | Read operations on Azure DevOps wikis. Use 'action' to choose the operation: 'get_page' (retrieve a single page with met |
| `ado-wit_work_item_attachment` | read | Download a work item attachment by its ID. Returns the attachment content as an embedded resource with the appropriate M |
| `ado-testplan_show_test_results_from_build_id` | read | Gets test result details for a given project and build ID. Can filter by test outcome (e.g. Failed, Passed, Aborted). Li |
| `ado-wit_query` | read | Read operations on Azure DevOps work item queries. Use 'action' to choose: 'get' (a query by ID or path), 'get_results'  |
| `ado-wit_work_item` | read | Read operations on Azure DevOps work items. Use 'action' to choose: 'get' (single work item by organization-unique ID; p |
| `ado-repo_search_commits` | read | Search for commits in a repository with comprehensive filtering capabilities. Supports searching by description/comment  |
| `ado-testplan_test_run` | read* | Read operations on Azure DevOps test runs. Use 'action' to choose: 'get_results' (get test results for a specific test r |
| `ado-search_code` | read | Search Azure DevOps Repositories for a given search text |
| `ado-pipelines_artifact` | read | List or download pipeline artifacts for a particular build. 'list' enumerates artifacts for a build; 'download' returns  |

## github (agent: code-reader) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `github-actions_get` | read | Get details about specific GitHub Actions resources. |
| `github-actions_list` | read | Tools for listing GitHub Actions resources. |
| `github-get_commit` | read | Get details for a commit from a GitHub repository |
| `github-get_copilot_job_status` | read | Get the status of a GitHub Copilot coding agent job. Use this to check if a previously submitted task has completed and  |
| `github-get_file_contents` | read | Get the contents of a file or directory from a GitHub repository |
| `github-get_job_logs` | read | Get logs for GitHub Actions workflow jobs. |
| `github-get_label` | read | Get a specific label from a repository. |
| `github-get_latest_release` | read | Get the latest release in a GitHub repository |
| `github-get_me` | read | Get details of the authenticated GitHub user. Use this when a request is about the user's own profile for GitHub. Or whe |
| `github-get_release_by_tag` | read | Get a specific release by its tag name in a GitHub repository |
| `github-get_tag` | read | Get details about a specific git tag in a GitHub repository |
| `github-get_team_members` | read | Get member usernames of a specific team in an organization. Limited to organizations accessible with current credentials |
| `github-get_teams` | read | Get details of the teams the user is a member of. Limited to organizations accessible with current credentials |
| `github-issue_read` | read | Get information about a specific issue in a GitHub repository. |
| `github-list_branches` | read | List branches in a GitHub repository |
| `github-list_commits` | read | Get list of commits of a branch in a GitHub repository. Returns at least 30 results per page by default, but can return  |
| `github-list_issue_fields` | read | List issue fields for a repository or organization. Returns field definitions including name, type (text, number, date,  |
| `github-list_issue_types` | read | List supported issue types for a repository or its owner organization. When repo is omitted, returns org-level issue typ |
| `github-list_issues` | read | List issues in a GitHub repository. For pagination, use the 'endCursor' from the previous response's 'pageInfo' in the ' |
| `github-list_pull_requests` | read | List pull requests in a GitHub repository. If the user specifies an author, then DO NOT use this tool and use the search |
| `github-list_releases` | read | List releases in a GitHub repository |
| `github-list_repository_collaborators` | read | List collaborators of a GitHub repository. Results are paginated; the response includes `nextPage`, `prevPage`, `firstPa |
| `github-list_tags` | read | List git tags in a GitHub repository |
| `github-pull_request_read` | read | Get information on a specific pull request in GitHub repository. |
| `github-run_secret_scanning` | loại* (gửi nội dung đi quét, không cần cho brief) | Scan files, content, or recent changes for secrets such as API keys, passwords, tokens, and credentials. |
| `github-search_code` | read | Fast and precise code search across ALL GitHub repositories using GitHub's native search engine. Best for finding exact  |
| `github-search_commits` | read | Search for commits across GitHub repositories using GitHub's commit search syntax. Useful for finding specific changes,  |
| `github-search_issues` | read | Search issues using natural-language semantic matching. Best for conceptual or paraphrased queries (e.g. "login fails af |
| `github-search_pull_requests` | read | Search for pull requests in GitHub repositories using issues search syntax already scoped to is:pr |
| `github-search_repositories` | read | Find GitHub repositories by name, description, readme, topics, or other metadata. Perfect for discovering projects, find |
| `github-search_users` | read | Find GitHub users by username, real name, or other profile information. Useful for locating developers, contributors, or |
| `github-ui_get` | read | Fetch UI data for MCP Apps (labels, assignees, milestones, issue types, branches, issue fields, reviewers). |

## azure (agent: cloud-reader) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `azure-monitor` | read* | Tool gộp namespace monitor; server chạy `--read-only` (xem dưới). Không có `readOnlyHint`. |
| `azure-group_list` | read | List all resource groups in a subscription. |
| `azure-group_resource_list` | read | List all resources in a resource group. |
| `azure-subscription_list` | read | List all Azure subscriptions for the current account. |

`azure-monitor` nhận `{ intent: string (bắt buộc), command?: string, parameters?: object, learn?: boolean }`.
Gọi `learn: true` để lấy danh sách lệnh con, rồi gọi lại với `command` + `parameters`. Allowlist chỉ chặn được
ở mức tool, nên lệnh con chỉ-đọc dựa vào cờ `--read-only` của server. Lệnh con thấy được khi chạy `--read-only`
(2026-11-25, 22 lệnh; tham số bắt buộc trong ngoặc):

- `monitor_workspace_list`, `monitor_workspace_log_query` (workspace, query, table),
  `monitor_workspace_log_search` (resource-group, workspace, table, query, timespan),
  `monitor_resource_log_query` (query, table, resource-id)
- `monitor_table_list` (workspace, table-type, resource-group), `monitor_table_type_list` (workspace, resource-group)
- `monitor_activitylog_list` (resource-name)
- `monitor_metrics_query` (metric-names, metric-namespace, resource),
  `monitor_metrics_batchquery` (resources, metric-names, metric-namespace), `monitor_metrics_definitions` (resource)
- `monitor_healthmodels_list`, `monitor_healthmodels_get` / `monitor_healthmodels_inspect` (health-model, resource-group)
- `monitor_webtests_get`, `monitor_ingestion_validate` (resource-group, data-collection-rule, log-data; chỉ kiểm tra,
  không gửi dữ liệu), `monitor_instrumentation_get-learning-resource`
- `monitor_traces_account_list`, `monitor_traces_field_list`, `monitor_traces_query_run`,
  `monitor_traces_query_resume`, `monitor_traces_query_analyze-top-attributes`,
  `monitor_traces_query_analyze-critical-path`

Không có lệnh liệt kê alert của Azure Monitor (alert đang bật) trong namespace này.
