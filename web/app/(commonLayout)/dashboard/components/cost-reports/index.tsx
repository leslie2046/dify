'use client'
import type { FC } from 'react'
import { ONE_DAY_MS } from '@/app/components/app/log/filter'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStats } from '../workspace-summary/use-workspace-stats'
import Loading from '@/app/components/base/loading'

export type CostReportsProps = {
    period: {
        start: string
        end: string
    }
}

const CostReports: FC<CostReportsProps> = ({ period }) => {
    const { t } = useTranslation('dashboard')

    // Use the central stats hook which already aggregates costs correctly for all app types
    const { data: stats, isLoading } = useWorkspaceStats(period)

    if (isLoading)
        return <Loading />

    if (!stats || stats.totalCost === 0) {
        return (
            <div className="mb-6">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">
                    💰 {t('costReports.title')}
                </h2>
                <div className="rounded-xl bg-components-panel-bg p-8 text-center shadow-xs">
                    <div className="text-4xl">📊</div>
                    <p className="mt-4 text-sm text-text-tertiary">
                        {t('costReports.noData')}
                    </p>
                </div>
            </div>
        )
    }

    // Sort apps by cost desc
    const topCostApps = (stats.appStats || [])
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5)
        .filter(app => app.cost > 0)

    const topApp = topCostApps[0]

    return (
        <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
                💰 {t('costReports.title')}
            </h2>

            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                    <div className="text-xs text-text-tertiary">
                        {t('costReports.totalCost')}
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-text-primary">
                        ${stats.totalCost.toFixed(4)}
                    </div>
                </div>
                <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                    <div className="text-xs text-text-tertiary">
                        {t('costReports.totalTokens')}
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-text-primary">
                        {(stats.totalTokens / 1000000).toFixed(2)}M
                    </div>
                </div>
                <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                    <div className="text-xs text-text-tertiary">
                        {t('costReports.topApp')}
                    </div>
                    <div className="mt-1 truncate text-lg font-semibold text-text-primary">
                        {topApp ? topApp.name : '-'}
                    </div>
                </div>
            </div>

            <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                <h3 className="mb-4 text-sm font-medium text-text-secondary">
                    {t('costReports.ranking')}
                </h3>
                <div className="space-y-4">
                    {topCostApps.map((app, index) => {
                        const percentage = (app.cost / stats.totalCost) * 100
                        return (
                            <div key={app.id} className="flex items-center">
                                <div className="mr-3 w-6 text-center text-sm font-medium text-text-tertiary">
                                    #{index + 1}
                                </div>
                                <div className="flex-1">
                                    <div className="mb-1 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-medium text-text-primary" title={app.name}>
                                                {app.name}
                                            </span>
                                        </div>
                                        <span className="ml-2 text-sm font-semibold text-orange-500">
                                            ${app.cost.toFixed(4)}
                                        </span>
                                    </div>
                                    <div className="flex items-center">
                                        <div className="flex-1">
                                            <div className="h-2 overflow-hidden rounded-full bg-background-section">
                                                <div
                                                    className="h-full rounded-full bg-orange-400 transition-all duration-500"
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                        <span className="ml-2 w-10 text-right text-xs text-text-tertiary">
                                            {percentage.toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default CostReports
