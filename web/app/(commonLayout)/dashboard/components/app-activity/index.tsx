'use client'
import type { FC } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { RiArrowUpLine, RiArrowDownLine } from '@remixicon/react'
import { fetchAppList, getAppDailyMessages, getAppDailyEndUsers, getAppTokenCosts } from '@/service/apps'
import Loading from '@/app/components/base/loading'

export type AppActivityProps = {
    period: {
        start: string
        end: string
    }
}

type AppActivity = {
    appId: string
    appName: string
    appMode: string
    enabled: boolean
    totalMessages: number
    totalUsers: number
    totalCost: number
    trend: 'up' | 'down' | 'neutral'
}

const AppActivity: FC<AppActivityProps> = ({ period }) => {
    const { t } = useTranslation()
    const router = useRouter()
    const [sortBy, setSortBy] = useState<'messages' | 'users' | 'cost'>('messages')

    const { data: appsData } = useSWR(
        '/apps',
        () => fetchAppList({ url: '/apps', params: { page: 1, limit: 100 } }),
    )

    const apps = useMemo(() => appsData?.data || [], [appsData])

    const { data: activityData, isLoading } = useSWR(
        apps.length > 0 ? ['/dashboard/app-activity', period, apps.length] : null,
        async () => {
            const appsToProcess = apps.slice(0, 20)

            const [messagesResults, usersResults, costsResults] = await Promise.all([
                Promise.all(
                    appsToProcess.map(app =>
                        getAppDailyMessages({
                            url: `/apps/${app.id}/statistics/daily-messages`,
                            params: period,
                        })
                            .then(result => ({ appId: app.id, data: result.data }))
                            .catch(() => ({ appId: app.id, data: [] })),
                    ),
                ),
                Promise.all(
                    appsToProcess.map(app =>
                        getAppDailyEndUsers({
                            url: `/apps/${app.id}/statistics/daily-end-users`,
                            params: period,
                        })
                            .then(result => ({ appId: app.id, data: result.data }))
                            .catch(() => ({ appId: app.id, data: [] })),
                    ),
                ),
                Promise.all(
                    appsToProcess.map(app =>
                        getAppTokenCosts({
                            url: `/apps/${app.id}/statistics/token-costs`,
                            params: period,
                        })
                            .then(result => ({ appId: app.id, data: result.data }))
                            .catch(() => ({ appId: app.id, data: [] })),
                    ),
                ),
            ])

            const activities: AppActivity[] = appsToProcess.map((app) => {
                const messages = messagesResults.find(r => r.appId === app.id)
                const users = usersResults.find(r => r.appId === app.id)
                const costs = costsResults.find(r => r.appId === app.id)

                const totalMessages = messages?.data.reduce(
                    (sum: number, item: any) => sum + (item.message_count || 0),
                    0,
                ) || 0

                const totalUsers = users?.data.reduce(
                    (sum: number, item: any) => sum + (item.terminal_count || 0),
                    0,
                ) || 0

                const totalCost = costs?.data.reduce(
                    (sum: number, item: any) => sum + parseFloat(item.total_price || '0'),
                    0,
                ) || 0

                const trend = totalMessages > 0 ? 'up' : 'neutral'

                return {
                    appId: app.id,
                    appName: app.name,
                    appMode: app.mode,
                    enabled: app.enable_site || app.enable_api,
                    totalMessages,
                    totalUsers,
                    totalCost,
                    trend,
                }
            })

            return activities
        },
    )

    const sortedApps = useMemo(() => {
        if (!activityData)
            return []

        const sorted = [...activityData]
        switch (sortBy) {
            case 'messages':
                return sorted.sort((a, b) => b.totalMessages - a.totalMessages)
            case 'users':
                return sorted.sort((a, b) => b.totalUsers - a.totalUsers)
            case 'cost':
                return sorted.sort((a, b) => b.totalCost - a.totalCost)
            default:
                return sorted
        }
    }, [activityData, sortBy])

    const handleAppClick = (appId: string) => {
        router.push(`/app/${appId}/overview`)
    }

    if (isLoading)
        return <Loading />

    if (!sortedApps || sortedApps.length === 0) {
        return (
            <div className="mb-6">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">
                    🔥 {t('dashboard.appActivity.title')}
                </h2>
                <div className="rounded-xl bg-components-panel-bg p-8 text-center shadow-xs">
                    <div className="text-4xl">📱</div>
                    <p className="mt-4 text-sm text-text-tertiary">
                        {t('dashboard.appActivity.noData')}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">
                    🔥 {t('dashboard.appActivity.title')}
                </h2>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-text-tertiary">{t('dashboard.appActivity.sortBy')}:</span>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="rounded-lg border border-components-input-bg-normal bg-components-input-bg-normal px-2 py-1 text-sm text-text-primary"
                    >
                        <option value="messages">{t('dashboard.stats.totalMessages')}</option>
                        <option value="users">{t('dashboard.stats.totalUsers')}</option>
                        <option value="cost">{t('dashboard.stats.totalCost')}</option>
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl bg-components-panel-bg shadow-xs">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-divider-subtle">
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.appName')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.type')}
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.status')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-text-tertiary">
                                {t('dashboard.stats.totalMessages')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-text-tertiary">
                                {t('dashboard.stats.totalUsers')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-text-tertiary">
                                {t('dashboard.stats.totalCost')}
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.trend')}
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.action')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedApps.map(app => (
                            <tr
                                key={app.appId}
                                className="cursor-pointer border-b border-divider-subtle transition-colors hover:bg-state-base-hover"
                                onClick={() => handleAppClick(app.appId)}
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center">
                                        <span className="mr-2 text-lg">
                                            {app.appMode === 'chat' ? '💬' : app.appMode === 'workflow' ? '⚙️' : '📝'}
                                        </span>
                                        <span className="truncate text-sm font-medium text-text-primary">
                                            {app.appName}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-sm text-text-secondary">
                                        {app.appMode}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {app.enabled
                                        ? (
                                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                                                ✓ {t('dashboard.appActivity.enabled')}
                                            </span>
                                        )
                                        : (
                                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                                ○ {t('dashboard.appActivity.disabled')}
                                            </span>
                                        )}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">
                                    {app.totalMessages.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">
                                    {app.totalUsers.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-medium text-orange-500">
                                    ${app.totalCost.toFixed(4)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {app.trend === 'up' && (
                                        <RiArrowUpLine className="mx-auto h-4 w-4 text-green-600" />
                                    )}
                                    {app.trend === 'down' && (
                                        <RiArrowDownLine className="mx-auto h-4 w-4 text-red-600" />
                                    )}
                                    {app.trend === 'neutral' && (
                                        <span className="text-xs text-text-quaternary">-</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button className="text-sm text-blue-600 hover:text-blue-700">
                                        →
                                    </button>
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
