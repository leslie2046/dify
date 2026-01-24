'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useAppFullList, useAppDailyConversations } from '@/service/use-apps'
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

const ConversationsTrendChart: FC<TrendChartProps> = ({ period }) => {
    const { t } = useTranslation('dashboard')

    const { data: appsData } = useAppFullList()
    const apps = useMemo(() => (appsData?.data || []).slice(0, 10), [appsData])

    const firstAppId = apps[0]?.id
    const { data: conversationsData, isLoading } = useAppDailyConversations(
        firstAppId || '',
        { start: period.start, end: period.end },
    )

    const chartData = useMemo(() => {
        if (conversationsData?.data && conversationsData.data.length > 0) {
            return conversationsData.data.map(item => ({
                date: item.date,
                conversation_count: item.conversation_count || 0,
            }))
        }

        const days = 7
        return Array.from({ length: days }, (_, i) => ({
            date: dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD'),
            conversation_count: 0,
        }))
    }, [conversationsData])

    const total = useMemo(() => {
        return chartData.reduce((sum, item) => sum + (item.conversation_count || 0), 0)
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
                name: t('stats.totalConversations'),
                type: 'line',
                data: chartData.map(item => item.conversation_count),
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
                    💭 {t('charts.conversationsTrend')}
                </h3>
                <div className="text-xs text-text-tertiary">
                    {apps.length > 0 && `${apps[0].name} - `}
                    {t('charts.total')}: {total.toLocaleString()}
                </div>
            </div>
            <ReactECharts option={options} style={{ height: 200 }} />
        </div>
    )
}

export default ConversationsTrendChart
