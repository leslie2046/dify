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

// Helper to fetch stats for a single app
const fetchAppStats = async (appId: string, period: PeriodQuery) => {
    console.log(`[Dashboard Debug] Requesting stats for app ${appId} with period:`, period)
    const [messages, conversations, users, costs] = await Promise.all([
        get<AppDailyMessagesResponse>(`/apps/${appId}/statistics/daily-messages`, { params: period }),
        get<AppDailyConversationsResponse>(`/apps/${appId}/statistics/daily-conversations`, { params: period }),
        get<AppDailyEndUsersResponse>(`/apps/${appId}/statistics/daily-end-users`, { params: period }),
        get<AppTokenCostsResponse>(`/apps/${appId}/statistics/token-costs`, { params: period }),
    ])
    console.log(`[Dashboard Debug] Fetched stats for app ${appId}:`, { messages, conversations, users, costs })
    return { appId, messages, conversations, users, costs }
}

export function useWorkspaceStats(period: PeriodQuery) {
    // 1. Get all apps
    const { data: appsData, isLoading: appsLoading } = useAppFullList()

    const apps = useMemo(() => appsData?.data || [], [appsData])

    // 2. Select top 5 apps to aggregate (browser performance limit)
    // In a real production environment, this aggregation should happen on the backend
    const targetApps = useMemo(() => apps.slice(0, 5), [apps])

    // 3. Parallel fetch data for these apps using useQueries
    // We use useQueries to manually handle parallel execution better than hooks in loops
    const results = useQueries({
        queries: targetApps.map(app => ({
            queryKey: ['dashboard', 'app-stats', app.id, period],
            queryFn: () => fetchAppStats(app.id, period),
            staleTime: 60000, // Cache for 1 minute
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

        // Maps to aggregate daily data: date -> total value
        const dailyMap = {
            messages: new Map<string, number>(),
            conversations: new Map<string, number>(),
            users: new Map<string, number>(),
            tokens: new Map<string, number>(),
        }

        results.forEach((result) => {
            if (!result.data) return

            const { messages, conversations, users, costs } = result.data

            // Aggregate Totals
            messages.data.forEach((item) => {
                defaultStats.totalMessages += item.message_count
                const current = dailyMap.messages.get(item.date) || 0
                dailyMap.messages.set(item.date, current + item.message_count)
            })

            conversations.data.forEach((item) => {
                defaultStats.totalConversations += item.conversation_count
                const current = dailyMap.conversations.get(item.date) || 0
                dailyMap.conversations.set(item.date, current + item.conversation_count)
            })

            users.data.forEach((item) => {
                defaultStats.totalUsers += item.user_count
                const current = dailyMap.users.get(item.date) || 0
                dailyMap.users.set(item.date, current + item.user_count)
            })

            costs.data.forEach((item) => {
                defaultStats.totalCost += parseFloat(item.total_price || '0')
                defaultStats.totalTokens += item.token_count
                const current = dailyMap.tokens.get(item.date) || 0
                dailyMap.tokens.set(item.date, current + item.token_count)
            })
        })

        // Convert Maps to Arrays and Sort
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
