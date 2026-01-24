import type { FC } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { useAppFullList } from '@/service/use-apps'
import { useWorkspaceStats } from '../workspace-summary/use-workspace-stats'
import Loading from '@/app/components/base/loading'
import AppIcon from '@/app/components/base/app-icon'
import { cn } from '@/utils/classnames' // You might need to import cn utility

export type AppActivityProps = {
    period: {
        start: string
        end: string
    }
}

type SortType = 'messages' | 'users' | 'cost'

const AppActivity: FC<AppActivityProps> = ({ period }) => {
    const { t } = useTranslation('dashboard')
    const router = useRouter()
    const [sortType, setSortType] = useState<SortType>('messages')

    const { data: appsData, isLoading: appsLoading } = useAppFullList()
    const { data: stats, isLoading: statsLoading } = useWorkspaceStats(period)

    const apps = useMemo(() => {
        if (!appsData?.data) return []

        const statsMap = new Map(stats?.appStats?.map(s => [s.id, s]) || [])

        const mergedApps = appsData.data.map(app => {
            const stat = statsMap.get(app.id) || { messages: 0, conversations: 0, users: 0, cost: 0 }
            return {
                appId: app.id,
                app,
                appName: app.name,
                appMode: app.mode,
                messages: stat.messages,
                users: stat.users,
                cost: stat.cost,
            }
        })

        return mergedApps.sort((a, b) => b[sortType] - a[sortType]).slice(0, 50)
    }, [appsData, stats, sortType])

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

    const SortHeader = ({ type, label }: { type: SortType, label: string }) => (
        <th
            className={cn(
                "px-4 py-3 text-left text-xs font-medium cursor-pointer transition-colors select-none",
                sortType === type ? "text-primary-600 bg-primary-25" : "text-text-tertiary hover:text-text-secondary"
            )}
            onClick={() => setSortType(type)}
        >
            <div className="flex items-center gap-1">
                {label}
                {sortType === type && <span>↓</span>}
            </div>
        </th>
    )

    return (
        <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">
                    🔥 {t('appActivity.title')}
                </h2>
            </div>

            <div className="overflow-x-auto rounded-xl bg-components-panel-bg shadow-xs">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-divider-subtle">
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('appActivity.appName')}
                            </th>
                            <SortHeader type="messages" label={t('stats.totalMessages')} />
                            <SortHeader type="users" label={t('stats.totalUsers')} />
                            <SortHeader type="cost" label={t('stats.totalCost')} />
                        </tr>
                    </thead>
                    <tbody>
                        {apps.map((item, index) => (
                            <tr
                                key={item.appId}
                                className="cursor-pointer border-b border-divider-subtle transition-colors hover:bg-state-base-hover last:border-0"
                                onClick={() => handleAppClick(item.appId)}
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="w-4 text-xs text-text-tertiary font-mono">{index + 1}</span>
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
                                                {item.appMode === 'workflow' ? 'Workflow' : 'Start from Blank'}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-text-secondary font-mono">
                                    {item.messages.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-text-secondary font-mono">
                                    {item.users.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-text-secondary font-mono">
                                    ${item.cost.toFixed(4)}
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
