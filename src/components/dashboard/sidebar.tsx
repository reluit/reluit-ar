'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FileText,
  Users,
  Plug,
  Megaphone,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { signOut } from '@/lib/actions/auth'

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard, description: 'Overdue summary' },
  { name: 'Overdue Invoices', href: '/dashboard/invoices', icon: FileText, description: 'Past-due invoices' },
  { name: 'Customers', href: '/dashboard/customers', icon: Users, description: 'With overdue balance' },
  { name: 'Campaigns', href: '/dashboard/campaigns', icon: Megaphone, description: 'Collection campaigns' },
  { name: 'Integrations', href: '/dashboard/integrations', icon: Plug, description: 'Connected platforms' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, description: 'Account settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r border-border bg-sidebar transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className={cn(
          'flex h-16 items-center border-b border-sidebar-border px-4',
          collapsed ? 'justify-center' : 'justify-between'
        )}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-destructive flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="font-semibold text-lg text-sidebar-foreground">Reluit</span>
                <span className="text-xs text-muted-foreground block -mt-0.5">Collections</span>
              </div>
            </Link>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-destructive flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                  collapsed && 'justify-center px-2'
                )}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className={cn(
                  'h-5 w-5 flex-shrink-0', 
                  isActive ? 'text-destructive' : 'text-muted-foreground'
                )} />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="font-medium block">{item.name}</span>
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Overdue Alert Banner */}
        {!collapsed && (
          <div className="mx-3 mb-4 rounded-lg bg-destructive/10 p-4 border border-destructive/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold text-sidebar-foreground">AI-Powered Collections</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Campaigns are automatically created and managed for you. No manual work required.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3">
          <div className={cn(
            'flex items-center',
            collapsed ? 'flex-col gap-2' : 'justify-between'
          )}>
            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className={cn(
                  'text-sidebar-foreground hover:text-sidebar-accent-foreground',
                  collapsed ? 'px-2' : 'gap-2'
                )}
              >
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Sign out</span>}
              </Button>
            </form>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
