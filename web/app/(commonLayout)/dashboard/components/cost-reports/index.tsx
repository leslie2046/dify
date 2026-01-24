'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { fetchAppList, getAppTokenCosts } from '@/service/apps'
import Loading from '@/app/components/base/loading'

export type CostReportsProps = {
    period: {
        start: string
        end: string
    }
}

type AppCost = {
    appId: string
    appName: string
    totalCost: number
    totalTokens: number
    percentage: number
}

const CostReports: FC<CostReportsProps> = ({ period }) => {
    const { t } = useTranslation()

    const { data: appsData } = useSWR(
        '/apps',
        () => fetchAppList({ url: '/apps', params: { page: 1, limit: 100 } }),
    )

    const apps = useMemo(() => appsData?.data || [], [appsData])

    const { data: costData, isLoading } = useSWR(
        apps.length > 0 ? ['/dashboard/cost-reports', period, apps.length] : null,
        async () => {
            const appsToProcess = apps.slice(0, 20)

            const costsResults = await Promise.all(
                appsToProcess.map(app =>
                    getAppTokenCosts({
                        url: `/apps/${app.id}/statistics/token-costs`,
                        params: period,
                    })
                        .then(result => ({
                            appId: app.id,
                            appName: app.name,
                            data: result.data,
                        }))
                        .catch(() => ({
                            appId: app.id,
                            appName: app.name,
                            data: [],
                        })),
                ),
            )

            const appCosts: AppCost[] = costsResults
                .map((result) => {
                    const totalCost = result.data.reduce(
                        (sum: number, item: any) => sum + parseFloat(item.total_price || '0'),
                        0,
                    )
                    const totalTokens = result.data.reduce(
                        (sum: number, item: any) => sum + (item.token_count || 0),
                        0,
                    )

                    return {
                        appId: result.appId,
                        appName: result.appName,
                        totalCost,
                        totalTokens,
                        percentage: 0,
                    }
                })
                .filter(app => app.totalCost > 0)
                .sort((a, b) => b.totalCost - a.totalCost)

            const totalCost = appCosts.reduce((sum, app) => sum + app.totalCost, 0)
            appCosts.forEach((app) => {
                app.percentage = totalCost > 0 ? (app.totalCost / totalCost) * 100 : 0
            })

            return {
                apps: appCosts.slice(0, 10),
                totalCost,
                totalTokens: appCosts.reduce((sum, app) => sum + app.totalTokens, 0),
            }
        },
    )

    if (isLoading)
        return <Loading />

    if (!costData || costData.apps.length === 0) {
        return (
            <div className="mb-6">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">
                    💰 {t('dashboard.costReports.title')}
                </h2>
                <div className="rounded-xl bg-components-panel-bg p-8 text-center shadow-xs">
                    <div className="text-4xl">📊</div>
                    <p className="mt-4 text-sm text-text-tertiary">
                        {t('dashboard.costReports.noData')}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
                💰 {t('dashboard.costReports.title')}
            </h2>

            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                    <div className="text-xs text-text-tertiary">
                        {t('dashboard.costReports.totalCost')}
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-text-primary">
                        ${costData.totalCost.toFixed(4)}
                    </div>
                </div>
                <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                    <div className="text-xs text-text-tertiary">
                        {t('dashboard.costReports.totalTokens')}
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-text-primary">
                        {(costData.totalTokens / 1000000).toFixed(2)}M
                    </div>
                </div>
                <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                    <div className="text-xs text-text-tertiary">
                        {t('dashboard.costReports.topApp')}
                    </div>
                    <div className="mt-1 truncate text-lg font-semibold text-text-primary">
                        {costData.apps[0]?.appName || '-'}
                    </div>
                </div>
            </div>

            <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                <h3 className="mb-4 text-sm font-medium text-text-secondary">
                    {t('dashboard.costReports.ranking')}
                </h3>
                <div className="space-y-3">
                    {costData.apps.map((app, index) => (
                        <div key={app.appId} className="flex items-center">
                            <div className="mr-3 w-6 text-center text-sm font-medium text-text-tertiary">
                                #{index + 1}
                            </div>
                            <div className="flex-1">
                                <div className="mb-1 flex items-center justify-between">
                                    <span className="truncate text-sm font-medium text-text-primary">
                                        {app.appName}
                                    </span>
                                    <span className="ml-2 text-sm font-semibold text-orange-500">
                                        ${app.totalCost.toFixed(4)}
                                    </span>
                                </div>
                                <div className="flex items-center">
                                    <div className="flex-1">
                                        <div className="h-2 overflow-hidden rounded-full bg-background-section">
                                            <div
                                                className="h-full rounded-full bg-orange-400"
                                                style={{ width: `${app.percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className="ml-2 text-xs text-text-tertiary">
                                        {app.percentage.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default CostReports
