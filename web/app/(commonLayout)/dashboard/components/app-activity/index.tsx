'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { useAppFullList } from '@/service/use-apps'
import { useWorkspaceStats } from '../workspace-summary/use-workspace-stats'
import Loading from '@/app/components/base/loading'
import AppIcon from '@/app/components/base/app-icon'

export type AppActivityProps = {
    period: {
        start: string
        end: string
    }
}

const AppActivity: FC<AppActivityProps> = ({ period }) => {
    const { t } = useTranslation('dashboard')
    const router = useRouter()

    const { data: appsData, isLoading: appsLoading } = useAppFullList()
    const { data: stats, isLoading: statsLoading } = useWorkspaceStats(period)

    const apps = useMemo(() => {
        if (!appsData?.data) return []

        // Create a map of stats by appId for O(1) lookup
        const statsMap = new Map(stats?.appStats?.map(s => [s.id, s]) || [])

        // Merge app data with stats
        const mergedApps = appsData.data.map(app => {
            const stat = statsMap.get(app.id) || { messages: 0, conversations: 0, users: 0, cost: 0 }
            return {
                appId: app.id,
                app, // Keep original app object for Icon
                appName: app.name,
                appMode: app.mode,
                enabled: app.enable_site || app.enable_api,
                // Stats
                messages: stat.messages,
                users: stat.users,
                cost: stat.cost,
            }
        })

        // Sort by Messages count descending
        return mergedApps.sort((a, b) => b.messages - a.messages).slice(0, 10)
    }, [appsData, stats])

    const handleAppClick = (appId: string) => {
        router.push(`/app/${appId}/overview`)
    }

    const isLoading = appsLoading || statsLoading

    if (isLoading) return <Loading />

    if (apps.length === 0) {
        return (
            <div className="mb-6">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">
                    🔥 {t('appActivity.title')}
                </h2>
                <div className="rounded-xl bg-components-panel-bg p-8 text-center shadow-xs">
                    <p className="text-sm text-text-tertiary">
                        {t('appActivity.noData')}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">
                    🔥 {t('appActivity.title')}
                </h2>
                <span className="text-xs text-text-tertiary">
                    {t('appActivity.sortBy')} {t('stats.totalMessages')}
                </span>
            </div>

            <div className="overflow-x-auto rounded-xl bg-components-panel-bg shadow-xs">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-divider-subtle">
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('appActivity.appName')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('stats.totalMessages')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('stats.totalUsers')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('stats.totalCost')}
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-text-tertiary">
                                {t('appActivity.status')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {apps.map(item => (
                            <tr
                                key={item.appId}
                                className="cursor-pointer border-b border-divider-subtle transition-colors hover:bg-state-base-hover"
                                onClick={() => handleAppClick(item.appId)}
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <AppIcon
                                            size="tiny"
                                            icon={item.app.icon}
                                            background={item.app.icon_background}
                                        />
                                        <div className="flex flex-col">
                                            <span className="truncate text-sm font-medium text-text-primary">
                                                {item.appName}
                                            </span>
                                            <span className="text-xs text-text-tertiary capitalize">
                                                {item.appMode === 'workflow' ? 'Workflow' : 'Chat Bot'}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-text-secondary">
                                    {item.messages.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-text-secondary">
                                    {item.users.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-text-secondary">
                                    ${item.cost.toFixed(4)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {item.enabled
                                        ? (
                                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                                                {t('appActivity.enabled')}
                                            </span>
                                        )
                                        : (
                                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                                {t('appActivity.disabled')}
                                            </span>
                                        )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default AppActivity
