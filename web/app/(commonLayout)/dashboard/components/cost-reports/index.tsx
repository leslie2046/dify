'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppFullList, useAppTokenCosts } from '@/service/use-apps'
import Loading from '@/app/components/base/loading'

export type CostReportsProps = {
    period: {
        start: string
        end: string
    }
}

const CostReports: FC<CostReportsProps> = ({ period }) => {
    const { t } = useTranslation('dashboard')

    const { data: appsData, isLoading: appsLoading } = useAppFullList()
    const apps = useMemo(() => (appsData?.data || []).slice(0, 10), [appsData])

    const firstAppId = apps[0]?.id
    const { data: costsData, isLoading: costsLoading } = useAppTokenCosts(
        firstAppId || '',
        { start: period.start, end: period.end },
    )

    const costSummary = useMemo(() => {
        if (!costsData?.data || costsData.data.length === 0)
            return null

        const totalCost = costsData.data.reduce(
            (sum, item) => sum + parseFloat(item.total_price || '0'),
            0,
        )
        const totalTokens = costsData.data.reduce(
            (sum, item) => sum + (item.token_count || 0),
            0,
        )

        return {
            totalCost,
            totalTokens,
            appName: apps[0]?.name || '',
        }
    }, [costsData, apps])

    const isLoading = appsLoading || costsLoading

    if (isLoading)
        return <Loading />

    if (!costSummary || costSummary.totalCost === 0) {
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
                        ${costSummary.totalCost.toFixed(4)}
                    </div>
                </div>
                <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                    <div className="text-xs text-text-tertiary">
                        {t('costReports.totalTokens')}
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-text-primary">
                        {(costSummary.totalTokens / 1000000).toFixed(2)}M
                    </div>
                </div>
                <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                    <div className="text-xs text-text-tertiary">
                        {t('costReports.topApp')}
                    </div>
                    <div className="mt-1 truncate text-lg font-semibold text-text-primary">
                        {costSummary.appName}
                    </div>
                </div>
            </div>

            <div className="rounded-xl bg-components-panel-bg p-4 shadow-xs">
                <h3 className="mb-4 text-sm font-medium text-text-secondary">
                    {t('costReports.ranking')}
                </h3>
                <div className="space-y-3">
                    <div className="flex items-center">
                        <div className="mr-3 w-6 text-center text-sm font-medium text-text-tertiary">
                            #1
                        </div>
                        <div className="flex-1">
                            <div className="mb-1 flex items-center justify-between">
                                <span className="truncate text-sm font-medium text-text-primary">
                                    {costSummary.appName}
                                </span>
                                <span className="ml-2 text-sm font-semibold text-orange-500">
                                    ${costSummary.totalCost.toFixed(4)}
                                </span>
                            </div>
                            <div className="flex items-center">
                                <div className="flex-1">
                                    <div className="h-2 overflow-hidden rounded-full bg-background-section">
                                        <div
                                            className="h-full rounded-full bg-orange-400"
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                </div>
                                <span className="ml-2 text-xs text-text-tertiary">
                                    100%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CostReports
