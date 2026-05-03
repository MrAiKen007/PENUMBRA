import { Sidebar } from './Sidebar'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  useWebSocket()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-[#F8F8F8]">
      {/* Desktop Sidebar - Fixed */}
      <div className="hidden lg:block fixed left-0 top-0 h-screen z-30">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
      </div>

      <main className="flex-1 overflow-auto min-w-0 py-4 pr-4 lg:ml-[17rem]">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center gap-4 p-4 mb-4 bg-white rounded-xl shadow-sm border border-[#E8E8E8] mx-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <h1 className="font-bold text-lg text-[#0A0A0A]">PENUMBRA</h1>
        </div>

        <div className="container mx-auto p-4 lg:p-6 max-w-7xl bg-white min-h-[calc(100vh-2rem)] rounded-2xl shadow-sm border border-[#E8E8E8]">
          {children}
        </div>
      </main>
    </div>
  )
}
