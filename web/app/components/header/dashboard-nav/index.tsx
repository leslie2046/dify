'use client'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { RiDashboard3Line, RiDashboard3Fill } from '@remixicon/react'
import { cn } from '@/utils/classnames'

type DashboardNavProps = {
    className?: string
}

const DashboardNav = ({ className }: DashboardNavProps) => {
    const { t } = useTranslation('common')
    const selectedSegment = useSelectedLayoutSegment()
    const activated = selectedSegment === 'dashboard'

    const Icon = activated ? RiDashboard3Fill : RiDashboard3Line

    return (
        <Link
            href="/dashboard"
            className={cn(
                'group flex items-center gap-2',
                className,
                activated
                    ? 'bg-components-main-nav-nav-button-bg-active text-components-main-nav-nav-button-text-active'
                    : 'text-components-main-nav-nav-button-text hover:bg-components-main-nav-nav-button-bg-hover hover:text-components-main-nav-nav-button-text-hover',
            )}
        >
            <Icon className="h-4 w-4 shrink-0" />
            <div className="truncate">{t('menus.dashboard')}</div>
        </Link>
    )
}

export default DashboardNav
