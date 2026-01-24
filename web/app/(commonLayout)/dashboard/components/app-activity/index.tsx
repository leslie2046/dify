'use client'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

export type AppActivityProps = {
    period: {
        start: string
        end: string
    }
}

const AppActivity: FC<AppActivityProps> = ({ period }) => {
    const { t } = useTranslation()

    // TODO: 实现真实的应用活跃度数据
    // 暂时显示占位符
    return (
        <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
                🔥 {t('dashboard.appActivity.title')}
            </h2>
            <div className="rounded-xl bg-components-panel-bg p-8 text-center shadow-xs">
                <div className="text-4xl">📱</div>
                <p className="mt-4 text-sm text-text-tertiary">
                    {t('dashboard.appActivity.noData')}
                </p>
            </div>
        </div>
    )
}

export default AppActivity
