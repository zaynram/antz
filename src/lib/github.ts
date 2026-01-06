/**
 * GitHub API integration for issue management
 */

import { githubConfig } from "./config"

const GITHUB_API_BASE = "https://api.github.com"

export interface GitHubIssue {
    number: number
    title: string
    body: string | null
    state: "open" | "closed"
    created_at: string
    updated_at: string
    user: {
        login: string
        avatar_url: string
    }
    labels: Array<{
        name: string
        color: string
    }>
    comments: number
    html_url: string
    pull_request?: {
        url: string
    }
}

export interface GitHubComment {
    id: number
    body: string
    user: {
        login: string
        avatar_url: string
    }
    created_at: string
    updated_at: string
}

interface CreateIssueParams {
    title: string
    body: string
    labels?: string[]
}

interface UpdateIssueParams {
    title?: string
    body?: string
    state?: "open" | "closed"
    labels?: string[]
}

/**
 * Get headers for GitHub API requests
 */
function getHeaders(): HeadersInit {
    const headers: HeadersInit = {
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }

    if (githubConfig.token) {
        headers.Authorization = `Bearer ${githubConfig.token}`
    }

    return headers
}

/**
 * List issues in the repository
 */
export async function listIssues(
    state: "open" | "closed" | "all" = "all",
    page = 1,
    perPage = 30
): Promise<{ issues: GitHubIssue[]; hasMore: boolean }> {
    const { owner, repo } = githubConfig

    const params = new URLSearchParams({
        state,
        page: page.toString(),
        per_page: perPage.toString(),
        sort: "updated",
        direction: "desc",
    })

    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?${params}`

    const response = await fetch(url, {
        headers: getHeaders(),
    })

    if (response.ok === false) {
        throw new Error(`Failed to fetch issues: ${response.statusText}`)
    }

    const issues = (await response.json()) as GitHubIssue[]

    // Filter out pull requests (they appear in /issues endpoint but have pull_request property)
    const filteredIssues = issues.filter(issue => !issue.pull_request)

    // Check if there are more pages
    const linkHeader = response.headers.get("Link")
    const hasMore = linkHeader ? linkHeader.includes('rel="next"') : false

    return { issues: filteredIssues, hasMore }
}

/**
 * Get a single issue by number
 */
export async function getIssue(issueNumber: number): Promise<GitHubIssue> {
    const { owner, repo } = githubConfig

    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}`

    const response = await fetch(url, {
        headers: getHeaders(),
    })

    if (response.ok === false) {
        throw new Error(`Failed to fetch issue: ${response.statusText}`)
    }

    return (await response.json()) as GitHubIssue
}

/**
 * Create a new issue
 */
export async function createIssue(params: CreateIssueParams): Promise<GitHubIssue> {
    const { owner, repo } = githubConfig

    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`

    const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(params),
    })

    if (response.ok === false) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
            `Failed to create issue: ${response.statusText}${
                errorData.message ? ` - ${errorData.message}` : ""
            }`
        )
    }

    return (await response.json()) as GitHubIssue
}

/**
 * Update an existing issue
 */
export async function updateIssue(
    issueNumber: number,
    params: UpdateIssueParams
): Promise<GitHubIssue> {
    const { owner, repo } = githubConfig

    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}`

    const response = await fetch(url, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(params),
    })

    if (response.ok === false) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
            `Failed to update issue: ${response.statusText}${
                errorData.message ? ` - ${errorData.message}` : ""
            }`
        )
    }

    return (await response.json()) as GitHubIssue
}

/**
 * List comments on an issue
 */
export async function listComments(issueNumber: number): Promise<GitHubComment[]> {
    const { owner, repo } = githubConfig

    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}/comments`

    const response = await fetch(url, {
        headers: getHeaders(),
    })

    if (response.ok === false) {
        throw new Error(`Failed to fetch comments: ${response.statusText}`)
    }

    return (await response.json()) as GitHubComment[]
}

/**
 * Add a comment to an issue
 */
export async function createComment(issueNumber: number, body: string): Promise<GitHubComment> {
    const { owner, repo } = githubConfig

    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}/comments`

    const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ body }),
    })

    if (response.ok === false) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
            `Failed to create comment: ${response.statusText}${
                errorData.message ? ` - ${errorData.message}` : ""
            }`
        )
    }

    return (await response.json()) as GitHubComment
}

/**
 * Check if GitHub token is configured
 */
export function hasGitHubToken(): boolean {
    return !!githubConfig.token && githubConfig.token.length > 0
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString)
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return "Invalid date"
    }
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`

    return date.toLocaleDateString()
}
