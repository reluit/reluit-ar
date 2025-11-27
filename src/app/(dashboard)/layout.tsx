import { Sidebar } from '@/components/dashboard/sidebar'
import { Toaster } from 'sonner'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64 transition-all duration-300 peer-[[data-collapsed=true]]:pl-[68px]">
        {children}
      </main>
      <Toaster position="top-right" />
    </div>
  )
}

