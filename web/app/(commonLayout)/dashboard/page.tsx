'use client'
import type { FC } from 'react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import WorkspaceSummary from './components/workspace-summary'
import TrendCharts from './components/trend-charts'
import CostReports from './components/cost-reports'
import AppActivity from './components/app-activity'

const DashboardPage: FC = () => {
    const { t } = useTranslation()

    const [timePeriod] = useState<'today' | '7days' | '30days'>('7days')

    const period = useMemo(() => {
        const today = dayjs()
        const queryDateFormat = 'YYYY-MM-DD HH:mm'

        switch (timePeriod) {
            case 'today':
                return {
                    start: today.startOf('day').format(queryDateFormat),
                    end: today.endOf('day').format(queryDateFormat),
                }
            case '7days':
                return {
                    start: today.subtract(7, 'day').startOf('day').format(queryDateFormat),
                    end: today.endOf('day').format(queryDateFormat),
                }
            case '30days':
                return {
                    start: today.subtract(30, 'day').startOf('day').format(queryDateFormat),
                    end: today.endOf('day').format(queryDateFormat),
                }
            default:
                return {
                    start: today.subtract(7, 'day').startOf('day').format(queryDateFormat),
                    end: today.endOf('day').format(queryDateFormat),
                }
        }
    }, [timePeriod])

    return (
        <div className="flex h-full flex-col overflow-y-auto p-6">
            <header className="mb-6">
                <h1 className="system-xl-semibold text-text-primary">
                    {t('dashboard.title')}
                </h1>
                <p className="system-sm-regular mt-1 text-text-tertiary">
                    {t('dashboard.description')}
                </p>
            </header>

            <div className="flex-1 pb-6">
                <WorkspaceSummary period={period} />
                <TrendCharts period={period} />
                <CostReports period={period} />
                <AppActivity period={period} />
            </div>
        </div>
    )
}

export default DashboardPage
