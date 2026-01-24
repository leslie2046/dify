'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
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

    // TODO: 实现真实的数据获取
    // 暂时使用模拟数据
    const chartData = useMemo(() => {
        const days = 7
        return Array.from({ length: days }, (_, i) => ({
            date: dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD'),
            message_count: 0,
        }))
    }, [])

    const total = 0

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
