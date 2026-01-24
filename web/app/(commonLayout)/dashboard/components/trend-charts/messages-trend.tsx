'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import dayjs from 'dayjs'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { fetchAppList, getAppDailyMessages } from '@/service/apps'
import Loading from '@/app/components/base/loading'

type TrendChartProps = {
    period: {
        start: string
        end: string
    }
}

const COLOR_CONFIG = {
    lineColor: 'rgba(6, 148, 162, 1)',
    bgColorStart: 'rgba(6, 148, 162, 0.2)',
    bgColorEnd: 'rgba(67, 174, 185, 0.08)',
    label: '#9CA3AF',
    splitLine: '#F3F4F6',
}

const MessagesTrendChart: FC<TrendChartProps> = ({ period }) => {
    const { t } = useTranslation()

    const { data: appsData } = useSWR(
        '/apps',
        () => fetchAppList({ url: '/apps', params: { page: 1, limit: 100 } }),
    )

    const apps = useMemo(() => appsData?.data || [], [appsData])

    const { data: aggregatedData, isLoading } = useSWR(
        apps.length > 0 ? ['/dashboard/messages-trend', period] : null,
        async () => {
            const promises = apps.slice(0, 20).map(app =>
                getAppDailyMessages({
                    url: `/apps/${app.id}/statistics/daily-messages`,
                    params: period,
                }).catch(() => ({ data: [] })),
            )

            const results = await Promise.all(promises)

            const dateMap = new Map<string, number>()

            results.forEach((result) => {
                result.data.forEach((item: any) => {
                    const date = item.date
                    const count = item.message_count || 0
                    dateMap.set(date, (dateMap.get(date) || 0) + count)
                })
            })

            const aggregated = Array.from(dateMap.entries())
                .map(([date, count]) => ({ date, message_count: count }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

            return aggregated
        },
    )

    const chartData = useMemo(() => {
        if (!aggregatedData || aggregatedData.length === 0) {
            const days = 7
            return Array.from({ length: days }, (_, i) => ({
                date: dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD'),
                message_count: 0,
            }))
        }
        return aggregatedData
    }, [aggregatedData])

    const total = useMemo(() => {
        return chartData.reduce((sum, item) => sum + (item.message_count || 0), 0)
    }, [chartData])

    const options: EChartsOption = useMemo(() => ({
        grid: { top: 40, right: 20, bottom: 30, left: 50 },
        tooltip: {
            trigger: 'axis',
            borderWidth: 0,
        },
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
        series: [
            {
                name: t('dashboard.stats.totalMessages'),
                type: 'line',
                data: chartData.map(item => item.message_count),
                smooth: true,
                lineStyle: { color: COLOR_CONFIG.lineColor, width: 2 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                            { offset: 0, color: COLOR_CONFIG.bgColorStart },
                            { offset: 1, color: COLOR_CONFIG.bgColorEnd },
                        ],
                    },
                },
                itemStyle: { color: COLOR_CONFIG.lineColor },
            },
        ],
    }), [chartData, t])

    if (isLoading)
        return <Loading />

    return (
        <div className="flex flex-col rounded-xl bg-components-panel-bg p-4 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-text-secondary">
                    📈 {t('dashboard.charts.messagesTrend')}
                </h3>
                <div className="text-xs text-text-tertiary">
                    {t('dashboard.charts.total')}: {total.toLocaleString()}
                </div>
            </div>
            <ReactECharts option={options} style={{ height: 200 }} />
        </div>
    )
}

export default MessagesTrendChart
