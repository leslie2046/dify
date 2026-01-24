'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { fetchAppList } from '@/service/apps'
import type { App } from '@/types/app'

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

// 简化版本：使用React Query或简单的state管理
// 暂时返回模拟数据，后续可以优化为真实数据聚合
export function useWorkspaceStats(period: PeriodQuery) {
    // TODO: 在后续版本中实现真实的API聚合
    // 当前返回模拟数据以确保构建通过

    const stats: WorkspaceStats = useMemo(() => ({
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
    }), [period])

    return {
        data: stats,
        isLoading: false,
    }
}
