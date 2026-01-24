'use client'
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useAppFullList, useAppDailyMessages, useAppDailyConversations, useAppDailyEndUsers, useAppTokenCosts } from '@/service/use-apps'
import { get } from '@/service/base'
import type { AppDailyMessagesResponse, AppDailyConversationsResponse, AppDailyEndUsersResponse, AppTokenCostsResponse } from '@/models/app'

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
    chartData: {
        messages: { date: string; value: number }[]
        conversations: { date: string; value: number }[]
        users: { date: string; value: number }[]
        tokens: { date: string; value: number }[]
    }
}

import type { App } from '@/types/app'

// Helper to fetch stats for a single app
const fetchAppStats = async (app: App, period: PeriodQuery) => {
    const isWorkflow = app.mode === 'workflow'
    // Workflow uses different endpoints
    const basePath = isWorkflow ? `/apps/${app.id}/workflow/statistics` : `/apps/${app.id}/statistics`

    try {
        if (isWorkflow) {
            const [conversations, users, costs] = await Promise.all([
                get<any>(`${basePath}/daily-conversations`, { params: period }), // Returns { runs }
                get<any>(`${basePath}/daily-terminals`, { params: period }), // Returns { terminal_count }
                get<AppTokenCostsResponse>(`${basePath}/token-costs`, { params: period }),
            ])
            return { app, isWorkflow, messages: null, conversations, users, costs }
        } else {
            const [messages, conversations, users, costs] = await Promise.all([
                get<AppDailyMessagesResponse>(`${basePath}/daily-messages`, { params: period }),
                get<AppDailyConversationsResponse>(`${basePath}/daily-conversations`, { params: period }),
                get<AppDailyEndUsersResponse>(`${basePath}/daily-end-users`, { params: period }),
                get<AppTokenCostsResponse>(`${basePath}/token-costs`, { params: period }),
            ])
            return { app, isWorkflow, messages, conversations, users, costs }
        }
    } catch (e) {
        console.error(`Failed to fetch stats for app ${app.id}`, e)
        return null
    }
}

export function useWorkspaceStats(period: PeriodQuery) {
    // 1. Get all apps
    const { data: appsData, isLoading: appsLoading } = useAppFullList()

    const apps = useMemo(() => appsData?.data || [], [appsData])

    // 2. Select ALL apps to aggregate
    const targetApps = useMemo(() => apps, [apps])

    // 3. Parallel fetch data
    const results = useQueries({
        queries: targetApps.map(app => ({
            queryKey: ['dashboard', 'app-stats', app.id, period],
            queryFn: () => fetchAppStats(app, period),
            staleTime: 60000,
        })),
    })

    // 4. Aggregate data
    const stats: WorkspaceStats = useMemo(() => {
        const defaultStats: WorkspaceStats = {
            totalApps: apps.length,
            totalMessages: 0,
            totalConversations: 0,
            totalUsers: 0,
            totalTokens: 0,
            totalCost: 0,
            changes: { messages: 0, conversations: 0, users: 0, tokens: 0, cost: 0 },
            chartData: {
                messages: [],
                conversations: [],
                users: [],
                tokens: [],
            },
        }

        if (results.some(r => r.isLoading)) return defaultStats

        // Maps to aggregate daily data
        const dailyMap = {
            messages: new Map<string, number>(),
            conversations: new Map<string, number>(),
            users: new Map<string, number>(),
            tokens: new Map<string, number>(),
        }

        results.forEach((result) => {
            if (!result.data) return

            const { isWorkflow, messages, conversations, users, costs } = result.data

            // Aggregate Messages & Conversations
            if (isWorkflow) {
                // For workflows, 'conversations' endpoint returns 'runs'
                conversations.data.forEach((item: any) => {
                    const count = item.runs || 0
                    // Treat runs as both messages and conversations for simplicity in dashboard
                    defaultStats.totalMessages += count
                    defaultStats.totalConversations += count

                    const currentMsg = dailyMap.messages.get(item.date) || 0
                    dailyMap.messages.set(item.date, currentMsg + count)

                    const currentConv = dailyMap.conversations.get(item.date) || 0
                    dailyMap.conversations.set(item.date, currentConv + count)
                })
            } else {
                // Chat Apps
                if (messages) {
                    messages.data.forEach((item: any) => {
                        const count = item.message_count || 0
                        defaultStats.totalMessages += count
                        const current = dailyMap.messages.get(item.date) || 0
                        dailyMap.messages.set(item.date, current + count)
                    })
                }
                if (conversations) {
                    conversations.data.forEach((item: any) => {
                        const count = item.conversation_count || 0
                        defaultStats.totalConversations += count
                        const current = dailyMap.conversations.get(item.date) || 0
                        dailyMap.conversations.set(item.date, current + count)
                    })
                }
            }

            // Aggregate Users (terminal_count vs user_count)
            // API usually returns 'terminal_count' for both now, but check types
            users.data.forEach((item: any) => {
                // Try both possible keys
                const count = item.terminal_count || item.user_count || 0
                defaultStats.totalUsers += count
                const current = dailyMap.users.get(item.date) || 0
                dailyMap.users.set(item.date, current + count)
            })

            // Aggregate Costs
            costs.data.forEach((item: any) => {
                defaultStats.totalCost += parseFloat(item.total_price || '0')
                defaultStats.totalTokens += item.token_count || 0
                const current = dailyMap.tokens.get(item.date) || 0
                dailyMap.tokens.set(item.date, current + (item.token_count || 0))
            })
        })

        // Sort timelines
        const sortTimeline = (map: Map<string, number>) =>
            Array.from(map.entries())
                .map(([date, value]) => ({ date, value }))
                .sort((a, b) => a.date.localeCompare(b.date))

        defaultStats.chartData = {
            messages: sortTimeline(dailyMap.messages),
            conversations: sortTimeline(dailyMap.conversations),
            users: sortTimeline(dailyMap.users),
            tokens: sortTimeline(dailyMap.tokens),
        }

        return defaultStats
    }, [apps.length, results])

    const isLoading = appsLoading || results.some(r => r.isLoading)

    return {
        data: stats,
        isLoading,
    }
}
