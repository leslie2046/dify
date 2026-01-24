'use client'
import { useMemo } from 'react'
import { useAppFullList, useAppDailyMessages, useAppDailyConversations, useAppDailyEndUsers, useAppTokenCosts } from '@/service/use-apps'

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

// Hook to aggregate workspace-level statistics
export function useWorkspaceStats(period: PeriodQuery) {
    // 1. Get all apps
    const { data: appsData, isLoading: appsLoading } = useAppFullList()

    const apps = useMemo(() => appsData?.data || [], [appsData])

    // 2. Get statistics for each app (limited to first 20 for performance)
    const appIds = useMemo(() => apps.slice(0, 20).map(app => app.id), [apps])

    // Aggregate all app statistics
    const stats: WorkspaceStats = useMemo(() => {
        if (apps.length === 0) {
            return {
                totalApps: 0,
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
            }
        }

        // For now, return basic stats
        // Real aggregation would require parallel queries for each app
        // which is complex with React Query
        return {
            totalApps: apps.length,
            totalMessages: 0, // TODO: Aggregate from all apps
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
        }
    }, [apps])

    return {
        data: stats,
        isLoading: appsLoading,
    }
}

// Hook to get aggregated messages for workspace
export function useWorkspaceMessages(appIds: string[], period: PeriodQuery) {
    // This would need to be implemented with multiple queries
    // For now, return empty data
    return {
        data: [],
        isLoading: false,
    }
}
