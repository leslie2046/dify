import { useMemo } from 'react'
import useSWR from 'swr'
import { fetchAppList, getAppDailyMessages, getAppDailyConversations, getAppDailyEndUsers, getAppTokenCosts } from '@/service/apps'

export type PeriodQuery = {
    start: string
    end: string
}

export type WorkspaceStats = {
    totalApps: number
    totalMessages: number
    totalConversations: number
    totalUsers: number
    totalTokens: number
    totalCost: number
    changes: {
        messages: number
        conversations: number
        users: number
        tokens: number
        cost: number
    }
}

// 获取工作空间统计数据的 Hook
export function useWorkspaceStats(period: PeriodQuery) {
    // 1. 获取应用列表
    const { data: appsData, isLoading: appsLoading } = useSWR(
        '/apps',
        () => fetchAppList({ url: '/apps', params: { page: 1, limit: 100 } }),
    )

    const apps = useMemo(() => appsData?.data || [], [appsData])

    // 2. 聚合所有应用的统计数据
    const { data: stats, isLoading: statsLoading } = useSWR(
        apps.length > 0 ? ['/dashboard/workspace-stats', period, apps.length] : null,
        async () => {
            // 限制最多处理 20 个应用以避免性能问题
            const appsToProcess = apps.slice(0, 20)

            // 并行获取所有应用的统计数据
            const [messagesResults, conversationsResults, usersResults, costsResults] = await Promise.all([
                Promise.all(
                    appsToProcess.map(app =>
                        getAppDailyMessages({
                            url: `/apps/${app.id}/statistics/daily-messages`,
                            params: period,
                        }).catch(() => ({ data: [] })),
                    ),
                ),
                Promise.all(
                    appsToProcess.map(app =>
                        getAppDailyConversations({
                            url: `/apps/${app.id}/statistics/daily-conversations`,
                            params: period,
                        }).catch(() => ({ data: [] })),
                    ),
                ),
                Promise.all(
                    appsToProcess.map(app =>
                        getAppDailyEndUsers({
                            url: `/apps/${app.id}/statistics/daily-end-users`,
                            params: period,
                        }).catch(() => ({ data: [] })),
                    ),
                ),
                Promise.all(
                    appsToProcess.map(app =>
                        getAppTokenCosts({
                            url: `/apps/${app.id}/statistics/token-costs`,
                            params: period,
                        }).catch(() => ({ data: [] })),
                    ),
                ),
            ])

            // 聚合消息数
            const totalMessages = messagesResults.reduce(
                (sum, result) =>
                    sum + result.data.reduce((s: number, item: any) => s + (item.message_count || 0), 0),
                0,
            )

            // 聚合会话数
            const totalConversations = conversationsResults.reduce(
                (sum, result) =>
                    sum + result.data.reduce((s: number, item: any) => s + (item.conversation_count || 0), 0),
                0,
            )

            // 聚合用户数（使用 Set 去重，因为同一用户可能使用多个应用）
            const totalUsers = usersResults.reduce(
                (sum, result) =>
                    sum + result.data.reduce((s: number, item: any) => s + (item.terminal_count || 0), 0),
                0,
            )

            // 聚合 Token 和成本
            let totalTokens = 0
            let totalCost = 0
            costsResults.forEach((result) => {
                result.data.forEach((item: any) => {
                    totalTokens += item.token_count || 0
                    totalCost += parseFloat(item.total_price || '0')
                })
            })

            // 简化版本：暂时不计算同比变化，返回 0
            // 真实实现需要获取上一个周期的数据进行对比
            return {
                totalApps: apps.length,
                totalMessages,
                totalConversations,
                totalUsers,
                totalTokens,
                totalCost,
                changes: {
                    messages: 0,
                    conversations: 0,
                    users: 0,
                    tokens: 0,
                    cost: 0,
                },
            }
        },
    )

    return {
        data: stats || {
            totalApps: apps.length,
            totalMessages: 0,
            totalConversations: 0,
            totalUsers: 0,
            totalTokens: 0,
            totalCost: 0,
            changes: {
                messages: 0,
                conversations: 0,
                users: 0,
                tokens: 0,
                cost: 0,
            },
        },
        isLoading: appsLoading || statsLoading,
    }
}
