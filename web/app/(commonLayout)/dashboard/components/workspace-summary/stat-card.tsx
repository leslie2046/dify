'use client'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { RiArrowUpLine, RiArrowDownLine } from '@remixicon/react'

export type StatCardProps = {
    icon: string
    title: string
    value: string | number
    change?: {
        value: number
        isPositive: boolean
    }
    suffix?: string
}

const StatCard: FC<StatCardProps> = ({
    icon,
    title,
    value,
    change,
    suffix,
}) => {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col rounded-xl bg-components-panel-bg p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
                <div className="text-2xl">{icon}</div>
                {change && (
                    <div className={`flex items-center text-sm font-medium ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {change.isPositive ? <RiArrowUpLine className="h-4 w-4" /> : <RiArrowDownLine className="h-4 w-4" />}
                        <span>{Math.abs(change.value)}%</span>
                    </div>
                )}
            </div>
            <div className="mb-1 text-xs text-text-tertiary">{title}</div>
            <div className="flex items-baseline">
                <div className="text-2xl font-semibold text-text-primary">
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
                {suffix && (
                    <span className="ml-1 text-sm text-text-tertiary">{suffix}</span>
                )}
            </div>
        </div>
    )
}

export default StatCard
