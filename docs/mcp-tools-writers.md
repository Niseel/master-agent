# MCP tools

> Sinh bởi `pnpm list-tools` lúc 2026-11-26T08:55:42.628Z (runtime=copilot). Chỉ thông tin cấu trúc.
> Server của agent ghi (không có header chỉ-đọc). Đối chiếu tên với `writeTools`/`readTools` của writer trong `packages/core/src/agents.ts`.

## workiq (agent: comms-writer) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `workiq-retrieve` | read | Search the user's M365 work data (mail, files, meetings, Teams messages, people) and connected enterprise sources; retur |
| `workiq-fetch_blob` | read | Download a binary file (document, PDF, image, photo) from a WorkIQ content path, up to 4 MB; returns the bytes base64-en |
| `workiq-accept_eula` | read | Accept the End User License Agreement (EULA) to enable full access to WorkIQ tools. The EULA URL should be https://githu |
| `workiq-ask` | read | Ask a question to Microsoft 365 Copilot for information about emails, meetings, files, and other M365 data. Returns the  |
| `workiq-list_agents` | read | List available Microsoft 365 Copilot agents. Returns agent IDs that can be passed to ask's agentId parameter. |
| `workiq-delete_entity` | write | HTTP DELETE a WorkIQ entity by path; returns the status code. If a real ID is supplied, don't fetch the item just to ver |
| `workiq-do_action` | read | Run a WorkIQ action, including write operations exposed by connected enterprise systems: for those, use search_paths to  |
| `workiq-create_entity` | write | Create a WorkIQ entity by POSTing JSON to a parent collection path; returns the created entity. Call it directly for sta |
| `workiq-get_schema` | read | Get the request/response schema for a WorkIQ path and operation, including operations exposed by connected enterprise sy |
| `workiq-search_paths` | read | Search for available WorkIQ entity paths and operations with a natural-language query; results are in structuredContent. |
| `workiq-call_function` | read | Call a read-only WorkIQ function, including read operations exposed by connected enterprise systems: for those, use sear |
| `workiq-fetch` | read | Fetch one or more WorkIQ entities by path; returns a JSON array with a result per path. Batch independent reads into one |
| `workiq-update_entity` | write | Update a WorkIQ entity by writing JSON to its path; returns the updated entity. Call it directly for standard fields (e. |

## ado (agent: board-writer) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `ado-wiki` | read | Read operations on Azure DevOps wikis. Use 'action' to choose the operation: 'get_page' (retrieve a single page with met |
| `ado-search_code` | read | Search Azure DevOps Repositories for a given search text |
| `ado-pipelines_artifact` | read | List or download pipeline artifacts for a particular build. 'list' enumerates artifacts for a build; 'download' returns  |
| `ado-advsec_alerts` | read | Read operations on Advanced Security alerts. Use 'action' to choose: 'list' (retrieve alerts for a repository with filte |
| `ado-testplan_test_case_write` | write | Write operations on Azure DevOps test cases. Use 'action' to choose: 'create' (create a new test case work item), 'updat |
| `ado-repo_branch` | read | Read operations on Git branches. Use 'action' to choose: 'get' (get a single branch by name), 'list' (list branches in a |
| `ado-testplan_show_test_results_from_build_id` | read | Gets test result details for a given project and build ID. Can filter by test outcome (e.g. Failed, Passed, Aborted). Li |
| `ado-repo_search_commits` | read | Search for commits in a repository with comprehensive filtering capabilities. Supports searching by description/comment  |
| `ado-wit_work_item_attachment_upload` | write | Upload file content to the Azure DevOps Work Item Tracking attachment store. This does not attach the file to a work ite |
| `ado-wit_work_item_comment_write` | write | Write operations on work item comments. Use 'action' to choose: 'add' (add a new comment), 'update' (update an existing  |
| `ado-core_list_project_teams` | read | Retrieve a list of teams for the specified Azure DevOps project. |
| `ado-testplan_test_plan_write` | write | Write operations on Azure DevOps test plans. Use 'action' to choose: 'create' (create a new test plan in a project). |
| `ado-repo_repository` | read | Read operations on Azure DevOps Git repositories. Use 'action' to choose: 'get' (get a repository by project and name/ID |
| `ado-work_iteration_write` | write | Write operations on Azure Boards iterations. Use 'action' to choose: 'create' (create new iterations in a project; requi |
| `ado-work_capacity_write` | write | Write operations on Azure Boards team capacity. Use 'action' to choose: 'update' (update a team member's activities and  |
| `ado-wiki_upsert_page` | read | Create or update a wiki page with content. |
| `ado-wit_work_item_link_write` | write | Write operations on work item links. Use 'action' to choose: 'link' (add a work item or hyperlink relation), 'unlink' (r |
| `ado-wit_backlog_write` | write | Write operations on Azure DevOps backlogs. Use 'action' to choose: 'reorder' (move one or more work items to the top, bo |
| `ado-repo_pull_request_thread` | read | Read operations on pull request comment threads. Use 'action' to choose: 'list' [requires repositoryId, pullRequestId] — |
| `ado-pipelines_build_log` | read | Build log access. 'list' enumerates available logs for a build (returns log IDs, sizes, and types); 'get_content' fetche |
| `ado-wit_work_item_attachment_link` | read | Link an attachment previously uploaded by wit_work_item_attachment_upload to a work item. Adds an AttachedFile relation  |
| `ado-pipelines_write` | write | Destructive pipeline operations. Use 'action' to choose: 'run_pipeline' (queue a new run), 'create_pipeline' (define a n |
| `ado-pipelines_run` | write | Read operations on pipeline runs (Pipelines REST surface, distinct from classic builds). 'get' retrieves a single run; ' |
| `ado-wit_query` | read | Read operations on Azure DevOps work item queries. Use 'action' to choose: 'get' (a query by ID or path), 'get_results'  |
| `ado-testplan_test_suite_write` | write | Write operations on Azure DevOps test suites. Use 'action' to choose: 'create' (create a new test suite under a parent s |
| `ado-repo_file` | read | Read operations against repository tree contents. Use 'action' to choose: 'get_content' (read the text content of a file |
| `ado-search_wiki` | read | Search Azure DevOps Wiki for a given search text. Each result includes both the raw git filesystem 'path' and a 'pagePat |
| `ado-work` | read | Read operations on Azure Boards iterations, team settings, and capacity. Use 'action' to choose: 'list_iterations' (proj |
| `ado-wit_backlog` | read | Read operations on Azure DevOps backlogs. Use 'action' to choose: 'list' (backlog levels for a team), 'list_work_items'  |
| `ado-repo_pull_request` | read | Read operations on Azure DevOps pull requests. Use 'action' to choose: 'get' [requires repositoryId, pullRequestId, proj |
| `ado-pipelines_build` | read | Read operations on Azure Pipelines builds. Use 'action' to choose: 'list' (search builds with filters or fetch by IDs; r |
| `ado-core_list_projects` | read | Retrieve a list of projects in your Azure DevOps organization. |
| `ado-repo_create_branch` | write | Create a new branch in the repository. |
| `ado-wit_work_item_attachment` | read | Download a work item attachment by its ID. Returns the attachment content as an embedded resource with the appropriate M |
| `ado-testplan_test_run` | write | Read operations on Azure DevOps test runs. Use 'action' to choose: 'get_results' (get test results for a specific test r |
| `ado-wit_work_item` | read | Read operations on Azure DevOps work items. Use 'action' to choose: 'get' (single work item by organization-unique ID; p |
| `ado-search_workitem` | read | Get Azure DevOps Work Item search results for a given search text |
| `ado-repo_pull_request_thread_write` | write | Write operations on pull request comment threads. Use 'action' to choose: 'create' [requires repositoryId, pullRequestId |
| `ado-wit_work_item_write` | write | Write operations on Azure DevOps work items. Use 'action' to choose: 'create' (create a new work item), 'update' (update |
| `ado-pipelines_definition` | read | Read operations on pipeline (build) definitions. 'list' returns a trimmed page of definitions ({ items, continuationToke |
| `ado-testplan_test_run_write` | write | Write operations on Azure DevOps test runs and test points. Use 'action' to choose: 'create_run' (create a new test run  |
| `ado-repo_pull_request_write` | write | Write operations on Azure DevOps pull requests. Use 'action' to choose: 'create' [requires repositoryId, sourceRefName,  |
| `ado-testplan` | read | Read operations on Azure DevOps test plans, suites, and cases. Use 'action' to choose: 'list_plans' (paginated list of t |

## github (agent: code-writer) — status: connected

| Runtime name | Loại (đoán) | Mô tả |
|---|---|---|
| `github-add_comment_to_pending_review` | write | Add review comment to the requester's latest pending pull request review. A pending review needs to already exist to cal |
| `github-add_issue_comment` | write | Add a comment and/or reaction to a specific issue or issue comment in a GitHub repository. Use this tool with pull reque |
| `github-add_reply_to_pull_request_comment` | write | Add a reply and/or reaction to an existing pull request comment. This can create a new comment linked as a reply to the  |
| `github-assign_copilot_to_issue` | write | Assign Copilot to a specific issue in a GitHub repository. |
| `github-create_branch` | write | Create a new branch in a GitHub repository |
| `github-create_or_update_file` | write | Create or update a single file in a GitHub repository.  |
| `github-create_pull_request` | write | Create a new pull request in a GitHub repository. |
| `github-create_pull_request_with_copilot` | write | Delegate a task to GitHub Copilot coding agent to perform in the background. The agent will create a pull request with t |
| `github-create_repository` | write | Create a new GitHub repository in your account or specified organization |
| `github-delete_file` | write | Delete a file from a GitHub repository |
| `github-fork_repository` | write | Fork a GitHub repository to your account or specified organization |
| `github-get_commit` | read | Get details for a commit from a GitHub repository |
| `github-get_copilot_job_status` | read | Get the status of a GitHub Copilot coding agent job. Use this to check if a previously submitted task has completed and  |
| `github-get_file_contents` | read | Get the contents of a file or directory from a GitHub repository |
| `github-get_label` | read | Get a specific label from a repository. |
| `github-get_latest_release` | read | Get the latest release in a GitHub repository |
| `github-get_me` | read | Get details of the authenticated GitHub user. Use this when a request is about the user's own profile for GitHub. Or whe |
| `github-get_release_by_tag` | read | Get a specific release by its tag name in a GitHub repository |
| `github-get_tag` | read | Get details about a specific git tag in a GitHub repository |
| `github-get_team_members` | read | Get member usernames of a specific team in an organization. Limited to organizations accessible with current credentials |
| `github-get_teams` | read | Get details of the teams the user is a member of. Limited to organizations accessible with current credentials |
| `github-issue_read` | read | Get information about a specific issue in a GitHub repository. |
| `github-issue_write` | write | Create a new or update an existing issue in a GitHub repository. |
| `github-list_branches` | read | List branches in a GitHub repository |
| `github-list_commits` | read | Get list of commits of a branch in a GitHub repository. Returns at least 30 results per page by default, but can return  |
| `github-list_issue_fields` | read | List issue fields for a repository or organization. Returns field definitions including name, type (text, number, date,  |
| `github-list_issue_types` | read | List supported issue types for a repository or its owner organization. When repo is omitted, returns org-level issue typ |
| `github-list_issues` | read | List issues in a GitHub repository. For pagination, use the 'endCursor' from the previous response's 'pageInfo' in the ' |
| `github-list_pull_requests` | read | List pull requests in a GitHub repository. If the user specifies an author, then DO NOT use this tool and use the search |
| `github-list_releases` | read | List releases in a GitHub repository |
| `github-list_repository_collaborators` | read | List collaborators of a GitHub repository. Results are paginated; the response includes `nextPage`, `prevPage`, `firstPa |
| `github-list_tags` | read | List git tags in a GitHub repository |
| `github-merge_pull_request` | write | Merge a pull request in a GitHub repository. |
| `github-pull_request_read` | read | Get information on a specific pull request in GitHub repository. |
| `github-pull_request_review_write` | write | Create and/or submit, delete review of a pull request. |
| `github-push_files` | write | Push multiple files to a GitHub repository in a single commit |
| `github-request_copilot_review` | read | Request a GitHub Copilot code review for a pull request. Use this for automated feedback on pull requests, usually befor |
| `github-run_secret_scanning` | write | Scan files, content, or recent changes for secrets such as API keys, passwords, tokens, and credentials. |
| `github-search_code` | read | Fast and precise code search across ALL GitHub repositories using GitHub's native search engine. Best for finding exact  |
| `github-search_commits` | read | Search for commits across GitHub repositories using GitHub's commit search syntax. Useful for finding specific changes,  |
| `github-search_issues` | read | Search issues using natural-language semantic matching. Best for conceptual or paraphrased queries (e.g. "login fails af |
| `github-search_pull_requests` | read | Search for pull requests in GitHub repositories using issues search syntax already scoped to is:pr |
| `github-search_repositories` | read | Find GitHub repositories by name, description, readme, topics, or other metadata. Perfect for discovering projects, find |
| `github-search_users` | read | Find GitHub users by username, real name, or other profile information. Useful for locating developers, contributors, or |
| `github-sub_issue_write` | write | Add a sub-issue to a parent issue in a GitHub repository. |
| `github-ui_get` | read | Fetch UI data for MCP Apps (labels, assignees, milestones, issue types, branches, issue fields, reviewers). |
| `github-update_issue_comment` | write | Update the body of an existing issue or pull request conversation comment. This tool cannot update pull request review c |
| `github-update_pull_request` | write | Update an existing pull request in a GitHub repository. |
| `github-update_pull_request_branch` | write | Update the branch of a pull request with the latest changes from the base branch. |
