'use client'
import type { FC } from 'react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import WorkspaceSummary from './components/workspace-summary'
import TrendCharts from './components/trend-charts'
import CostReports from './components/cost-reports'
import AppActivity from './components/app-activity'
import { cn } from '@/utils/classnames'

const DashboardPage: FC = () => {
    const { t } = useTranslation('dashboard')

    const [timePeriod, setTimePeriod] = useState<'today' | '7days' | '30days'>('7days')

    const period = useMemo(() => {
        const today = dayjs()
        const queryDateFormat = 'YYYY-MM-DD HH:mm'

        // Start of day to End of day logic
        // For 'today', it is strictly today.
        // For '7days', it is "Last 7 days" (excluding today? or including? usually including or T-6 to T)
        // Let's use T-N days to T logic.

        switch (timePeriod) {
            case 'today':
                return {
                    start: today.startOf('day').format(queryDateFormat),
                    end: today.endOf('day').format(queryDateFormat),
                }
            case '7days':
                return {
                    start: today.subtract(6, 'day').startOf('day').format(queryDateFormat),
                    end: today.endOf('day').format(queryDateFormat),
                }
            case '30days':
                return {
                    start: today.subtract(29, 'day').startOf('day').format(queryDateFormat),
                    end: today.endOf('day').format(queryDateFormat),
                }
            default:
                return {
                    start: today.subtract(6, 'day').startOf('day').format(queryDateFormat),
                    end: today.endOf('day').format(queryDateFormat),
                }
        }
    }, [timePeriod])

    const periods = [
        { value: 'today', label: t('timeRange.today') || 'Today' },
        { value: '7days', label: t('timeRange.7days') || 'Last 7 Days' },
        { value: '30days', label: t('timeRange.30days') || 'Last 30 Days' },
    ] as const

    return (
        <div className="flex h-full flex-col overflow-y-auto p-6">
            <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-xl font-semibold text-text-primary">
                        {t('title')}
                    </h1>
                    <p className="mt-1 text-sm text-text-tertiary">
                        {t('description')}
                    </p>
                </div>

                <div className="flex rounded-lg bg-gray-100 p-1">
                    {periods.map(p => (
                        <button
                            key={p.value}
                            onClick={() => setTimePeriod(p.value)}
                            className={cn(
                                'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                                timePeriod === p.value
                                    ? 'bg-white text-primary-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex-1 pb-6">
                <WorkspaceSummary period={period} />
                <TrendCharts period={period} />
                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <CostReports period={period} />
                    <AppActivity period={period} />
                </div>
            </div>
        </div>
    )
}

export default DashboardPage
