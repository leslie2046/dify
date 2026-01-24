'use client'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { RiArrowUpLine } from '@remixicon/react'
import { useAppFullList, useAppDailyMessages } from '@/service/use-apps'
import Loading from '@/app/components/base/loading'

export type AppActivityProps = {
    period: {
        start: string
        end: string
    }
}

type AppWithActivity = {
    appId: string
    appName: string
    appMode: string
    enabled: boolean
    totalMessages: number
}

const AppActivity: FC<AppActivityProps> = ({ period }) => {
    const { t } = useTranslation()
    const router = useRouter()

    const { data: appsData, isLoading } = useAppFullList()

    const apps = useMemo(() => {
        if (!appsData?.data)
            return []

        // Show first 10 apps with basic info
        return appsData.data.slice(0, 10).map(app => ({
            appId: app.id,
            appName: app.name,
            appMode: app.mode,
            enabled: app.enable_site || app.enable_api,
            totalMessages: 0, // TODO: Fetch real data for each app
        }))
    }, [appsData])

    const handleAppClick = (appId: string) => {
        router.push(`/app/${appId}/overview`)
    }

    if (isLoading)
        return <Loading />

    if (apps.length === 0) {
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

    return (
        <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">
                    🔥 {t('dashboard.appActivity.title')}
                </h2>
            </div>

            <div className="overflow-x-auto rounded-xl bg-components-panel-bg shadow-xs">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-divider-subtle">
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.appName')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.type')}
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.status')}
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-text-tertiary">
                                {t('dashboard.appActivity.action')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {apps.map(app => (
                            <tr
                                key={app.appId}
                                className="cursor-pointer border-b border-divider-subtle transition-colors hover:bg-state-base-hover"
                                onClick={() => handleAppClick(app.appId)}
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center">
                                        <span className="mr-2 text-lg">
                                            {app.appMode === 'chat' ? '💬' : app.appMode === 'workflow' ? '⚙️' : '📝'}
                                        </span>
                                        <span className="truncate text-sm font-medium text-text-primary">
                                            {app.appName}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-sm text-text-secondary">
                                        {app.appMode}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {app.enabled
                                        ? (
                                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                                                ✓ {t('dashboard.appActivity.enabled')}
                                            </span>
                                        )
                                        : (
                                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                                ○ {t('dashboard.appActivity.disabled')}
                                            </span>
                                        )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button className="text-sm text-blue-600 hover:text-blue-700">
                                        →
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default AppActivity
