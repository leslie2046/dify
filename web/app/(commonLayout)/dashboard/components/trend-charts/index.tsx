'use client'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import MessagesTrendChart from './messages-trend'
import ConversationsTrendChart from './conversations-trend'
import UsersTrendChart from './users-trend'
import TokensTrendChart from './tokens-trend'

export type TrendChartsProps = {
    period: {
        start: string
        end: string
    }
}

const TrendCharts: FC<TrendChartsProps> = ({ period }) => {
    const { t } = useTranslation('dashboard')

    return (
        <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
                {t('charts.title')}
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <MessagesTrendChart period={period} />
                <ConversationsTrendChart period={period} />
                <UsersTrendChart period={period} />
                <TokensTrendChart period={period} />
            </div>
        </div>
    )
}

export default TrendCharts
