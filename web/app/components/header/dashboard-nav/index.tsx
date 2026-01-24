'use client'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'

type DashboardNavProps = {
    className?: string
}

const DashboardNav = ({ className }: DashboardNavProps) => {
    const { t } = useTranslation()
    const selectedSegment = useSelectedLayoutSegment()
    const activated = selectedSegment === 'dashboard'

    return (
        <Link
            href="/dashboard"
            className={classNames(
                className,
                activated
                    ? 'bg-components-main-nav-nav-button-bg-active text-components-main-nav-nav-button-text-active'
                    : 'text-components-main-nav-nav-button-text hover:bg-components-main-nav-nav-button-bg-hover hover:text-components-main-nav-nav-button-text-hover',
            )}
        >
            {t('common.menus.dashboard')}
        </Link>
    )
}

export default DashboardNav
