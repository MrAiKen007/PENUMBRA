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
    <div className="flex min-h-screen bg-[#F8F8F8] relative overflow-hidden">
      {/* Neon blur background orbs */}
      <div className="bg-blur-orb bg-blur-orb-pink w-[500px] h-[500px] -top-[200px] -right-[100px]" />
      <div className="bg-blur-orb bg-blur-orb-orange w-[400px] h-[400px] top-[40%] -left-[150px]" />
      <div className="bg-blur-orb bg-blur-orb-pink w-[300px] h-[300px] bottom-[10%] right-[20%] opacity-10" />

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
          <div className="flex items-center">
            <img src="/Penumbra.svg" alt="Penumbra" className="h-9 w-auto flex-shrink-0" />
            <span className="font-bold text-base text-[#FF5533] -ml-2">PENUMBRA</span>
          </div>
        </div>

        <div className="container mx-auto p-4 lg:p-6 max-w-7xl bg-white min-h-[calc(100vh-2rem)] rounded-2xl shadow-sm border border-[#E8E8E8]">
          {children}
        </div>
      </main>
    </div>
  )
}
