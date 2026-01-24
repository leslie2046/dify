import type { FC } from 'react'
import MessagesTrendChart from './messages-trend'
import ConversationsTrendChart from './conversations-trend'

export type TrendChartsProps = {
    period: {
        start: string
        end: string
    }
}

const TrendCharts: FC<TrendChartsProps> = ({ period }) => {
    return (
        <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
                趋势分析
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <MessagesTrendChart period={period} />
                <ConversationsTrendChart period={period} />
            </div>
        </div>
    )
}

export default TrendCharts
