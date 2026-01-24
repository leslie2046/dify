'use client'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/classnames'

type DashboardNavProps = {
    className?: string
}

const DashboardNav = ({ className }: DashboardNavProps) => {
    const { t } = useTranslation('common')
    const selectedSegment = useSelectedLayoutSegment()
    const activated = selectedSegment === 'dashboard'

    return (
        <Link
            href="/dashboard"
            className={cn(
                className,
                activated
                    ? 'bg-components-main-nav-nav-button-bg-active text-components-main-nav-nav-button-text-active'
                    : 'text-components-main-nav-nav-button-text hover:bg-components-main-nav-nav-button-bg-hover hover:text-components-main-nav-nav-button-text-hover',
            )}
        >
            {t('menus.dashboard')}
        </Link>
    )
}

export default DashboardNav
