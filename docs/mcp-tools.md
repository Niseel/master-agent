# MCP tools

> Sinh bởi `pnpm list-tools` lúc 2026-11-23T03:09:26.263Z (runtime=byok). Chỉ thông tin cấu trúc.
> Cột **Loại** là đoán theo tên — hãy sửa tay `read`/`write` rồi chép tên `read` vào `readTools` trong `packages/core/src/agents.ts`.

## workiq (agent: comms-reader) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `workiq-mail_list_unread` | read | List unread Outlook mail |
| `workiq-teams_list_unread` | read | List unread Teams messages |
| `workiq-mail_send` | write | Send an email |

## github (agent: code-reader) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `github-actions_get` | read | Get details about specific GitHub Actions resources. |
| `github-actions_list` | read | Tools for listing GitHub Actions resources. |
| `github-get_commit` | read | Get details for a commit from a GitHub repository |
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
| `github-run_secret_scanning` | write | Scan files, content, or recent changes for secrets such as API keys, passwords, tokens, and credentials. |
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
| `azure-monitor_alerts_list` | read | List active Azure Monitor alerts |
| `azure-monitor_logs_query` | read | Run a KQL query on Log Analytics |
| `azure-monitor_alert_dismiss` | write | Dismiss an alert |
