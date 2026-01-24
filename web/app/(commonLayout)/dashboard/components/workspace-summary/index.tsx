import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import StatCard from './stat-card'
import { useWorkspaceStats } from './use-workspace-stats'
import Loading from '@/app/components/base/loading'

export type WorkspaceSummaryProps = {
    period: {
        start: string
        end: string
    }
}

const WorkspaceSummary: FC<WorkspaceSummaryProps> = ({ period }) => {
    const { t } = useTranslation()
    const { data: stats, isLoading } = useWorkspaceStats(period)

    if (isLoading)
        return <Loading />

    return (
        <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
                {t('dashboard.workspaceSummary')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard
                    icon="📱"
                    title={t('dashboard.stats.totalApps')}
                    value={stats.totalApps}
                />
                <StatCard
                    icon="💬"
                    title={t('dashboard.stats.totalMessages')}
                    value={stats.totalMessages}
                    change={{
                        value: stats.changes.messages,
                        isPositive: stats.changes.messages > 0,
                    }}
                />
                <StatCard
                    icon="💭"
                    title={t('dashboard.stats.totalConversations')}
                    value={stats.totalConversations}
                    change={{
                        value: stats.changes.conversations,
                        isPositive: stats.changes.conversations > 0,
                    }}
                />
                <StatCard
                    icon="👥"
                    title={t('dashboard.stats.totalUsers')}
                    value={stats.totalUsers}
                    change={{
                        value: stats.changes.users,
                        isPositive: stats.changes.users > 0,
                    }}
                />
                <StatCard
                    icon="🎯"
                    title={t('dashboard.stats.totalTokens')}
                    value={`${(stats.totalTokens / 1000000).toFixed(1)}M`}
                    change={{
                        value: stats.changes.tokens,
                        isPositive: stats.changes.tokens > 0,
                    }}
                />
                <StatCard
                    icon="💰"
                    title={t('dashboard.stats.totalCost')}
                    value={`$${stats.totalCost.toFixed(2)}`}
                    change={{
                        value: stats.changes.cost,
                        isPositive: stats.changes.cost > 0,
                    }}
                />
            </div>
        </div>
    )
}

export default WorkspaceSummary
