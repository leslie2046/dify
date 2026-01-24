'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useWorkspaceStats } from '../workspace-summary/use-workspace-stats'
import Loading from '@/app/components/base/loading'

type TrendChartProps = {
    period: {
        start: string
        end: string
    }
}

const COLOR_CONFIG = {
    lineColor: 'rgba(255, 138, 76, 1)', // Orange for Users
    bgColorStart: 'rgba(255, 138, 76, 0.2)',
    bgColorEnd: 'rgba(255, 138, 76, 0.05)',
    label: '#9CA3AF',
    splitLine: '#F3F4F6',
}

const UsersTrendChart: FC<TrendChartProps> = ({ period }) => {
    const { t } = useTranslation('dashboard')
    const { data: stats, isLoading } = useWorkspaceStats(period)

    const chartData = useMemo(() => {
        if (stats.chartData.users.length > 0) {
            return stats.chartData.users
        }
        // Empty state
        const days = dayjs(period.end).diff(dayjs(period.start), 'day') + 1
        return Array.from({ length: days }, (_, i) => ({
            date: dayjs(period.end).subtract(days - 1 - i, 'day').format('YYYY-MM-DD'),
            value: 0,
        }))
    }, [stats, period])

    const options: EChartsOption = useMemo(() => ({
        grid: { top: 40, right: 20, bottom: 30, left: 50 },
        tooltip: { trigger: 'axis', borderWidth: 0 },
        xAxis: {
            type: 'category',
            data: chartData.map(item => dayjs(item.date).format('MM/DD')),
            axisLabel: { color: COLOR_CONFIG.label, fontSize: 11 },
            axisLine: { show: false },
            axisTick: { show: false },
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: COLOR_CONFIG.label, fontSize: 11 },
            splitLine: { lineStyle: { color: COLOR_CONFIG.splitLine } },
        },
        series: [{
            name: t('stats.totalUsers'),
            type: 'line',
            data: chartData.map(item => item.value),
            smooth: true,
            lineStyle: { color: COLOR_CONFIG.lineColor, width: 2 },
            areaStyle: {
                color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: COLOR_CONFIG.bgColorStart },
                        { offset: 1, color: COLOR_CONFIG.bgColorEnd },
                    ],
                },
            },
            itemStyle: { color: COLOR_CONFIG.lineColor },
        }],
    }), [chartData, t])

    if (isLoading) return <Loading />

    return (
        <div className="flex flex-col rounded-xl bg-components-panel-bg p-4 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-text-secondary">
                    👥 {t('charts.usersTrend')}
                </h3>
                <div className="text-xs text-text-tertiary">
                    {t('charts.total')}: {stats.totalUsers.toLocaleString()}
                </div>
            </div>
            <ReactECharts option={options} style={{ height: 200 }} />
        </div>
    )
}

export default UsersTrendChart
