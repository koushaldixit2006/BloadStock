import React, { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FilePlus,
  GitCompare,
  Home,
  MoreHorizontal,
  Package,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Truck,
} from 'lucide-react';
import { formatSimDateTime } from '../engine/clock';
import { useSimStore } from '../store/useSimStore';
import { cn } from '../utils/cn';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/useToast';

export function AppShell() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const {
    simTime,
    units,
    requests,
    reservations,
    advanceClock,
    resetDemoData,
    searchQuery,
    setSearchQuery,
    isBackendConnected,
    isSyncing,
    currentUser,
    syncFromBackend,
    loginAs,
  } = useSimStore();

  useEffect(() => {
    syncFromBackend();
  }, [syncFromBackend]);

  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Metrics for badges
  const openRequestsCount = requests.filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL').length;
  const activeReservationsCount = reservations.filter(
    (r) => r.status === 'RESERVED' || r.status === 'IN_TRANSIT'
  ).length;

  const navItems = [
    { to: '/', label: 'Overview', icon: <Home className="w-5 h-5" /> },
    { to: '/inventory', label: 'Inventory', icon: <Package className="w-5 h-5" />, count: units.length },
    { to: '/requests/new', label: 'New Request', icon: <FilePlus className="w-5 h-5" /> },
    {
      to: '/recommendations',
      label: 'Recommendations',
      icon: <Sparkles className="w-5 h-5" />,
      count: openRequestsCount,
      highlight: true,
    },
    { to: '/compare', label: 'Compare Plans', icon: <GitCompare className="w-5 h-5" /> },
    { to: '/simulator', label: 'Scenario Simulator', icon: <Sliders className="w-5 h-5" /> },
    {
      to: '/reservations',
      label: 'Reservations',
      icon: <Truck className="w-5 h-5" />,
      count: activeReservationsCount,
    },
  ];

  const handleAdvance = async (hours: number) => {
    await advanceClock(hours);
    addToast({
      type: 'info',
      title: `Simulation Clock Advanced +${hours}h`,
      message: `Current simulation time is now ${formatSimDateTime(simTime)}. In-transit and shelf-life statuses updated.`,
    });
  };

  const handleConfirmReset = async () => {
    await resetDemoData();
    setIsResetModalOpen(false);
    addToast({
      type: 'success',
      title: 'Demo Data Reset',
      message: 'All inventory units, requests, and network routes restored to initial state.',
    });
    navigate('/');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && location.pathname !== '/inventory') {
      navigate('/inventory');
    }
  };

  return (
    <div className="min-h-screen bg-ink-50/50 flex flex-col text-ink-900 font-sans">
      {/* Persistent Top Clinical Disclaimer Banner */}
      <aside aria-label="Clinical Disclaimer" className="bg-crimson-600 text-white px-4 py-1.5 text-xs font-medium text-center flex items-center justify-center gap-2 shadow-sm z-40 select-none">
        <AlertCircle className="w-4 h-4 shrink-0 text-white/90" />
        <span>
          <strong>PLANNING SUPPORT ONLY</strong> &bull; NOT A CLINICAL DECISION. ALL DATA IS SYNTHETIC.
        </span>
      </aside>

      {/* Main Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-ink-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-soft">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 select-none focus-visible:outline-none">
            <div className="w-9 h-9 rounded-xl bg-crimson-600 flex items-center justify-center shadow-sm">
              <span className="font-heading font-black text-white text-lg tracking-tighter">B+</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-base font-extrabold font-heading text-ink-950 tracking-tight block leading-none">
                BloodStock
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-crimson-700 font-semibold">
                Clinical-Ops Logistics
              </span>
            </div>
          </Link>

          {/* Synthetic Data Chip */}
          <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200 select-none">
            SYNTHETIC DATA
          </span>

          {/* Backend Connection Status Badge */}
          <button
            type="button"
            onClick={() => syncFromBackend()}
            disabled={isSyncing}
            className={cn(
              "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-colors select-none",
              isBackendConnected
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
            )}
            title="Click to re-sync with Backend API on port 3001"
          >
            <span className={cn("w-2 h-2 rounded-full", isBackendConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
            <span>{isSyncing ? "Syncing..." : isBackendConnected ? "API Online (:3001)" : "Offline Simulator"}</span>
            <RotateCcw className={cn("w-3 h-3 ml-0.5 text-ink-400", isSyncing && "animate-spin")} />
          </button>

          {/* Role Switcher */}
          <div className="hidden xl:flex items-center gap-1 bg-ink-50 p-0.5 rounded-lg border border-ink-200 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => loginAs('COORDINATOR')}
              className={cn(
                "px-2 py-0.5 rounded transition-colors",
                currentUser?.role === 'COORDINATOR' ? "bg-white font-bold text-crimson-700 shadow-xs" : "text-ink-600 hover:text-ink-900"
              )}
            >
              Coordinator (H3)
            </button>
            <button
              type="button"
              onClick={() => loginAs('ADMIN')}
              className={cn(
                "px-2 py-0.5 rounded transition-colors",
                currentUser?.role === 'ADMIN' ? "bg-white font-bold text-crimson-700 shadow-xs" : "text-ink-600 hover:text-ink-900"
              )}
            >
              Admin
            </button>
          </div>
        </div>

        {/* Global Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md mx-2 sm:mx-6">
          <div className="relative">
            <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search units (e.g. U-10001), groups, requests..."
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-ink-50/80 hover:bg-ink-100/50 focus:bg-white border border-ink-200 focus:border-crimson-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-crimson-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 text-xs p-1"
                aria-label="Clear search"
              >
                &times;
              </button>
            )}
          </div>
        </form>

        {/* Right Section: Clock Controls & Reset */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Clock Widget */}
          <div className="flex items-center bg-ink-50 border border-ink-200 rounded-lg p-1 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 text-ink-700 font-mono font-semibold">
              <Clock className="w-3.5 h-3.5 text-crimson-600 shrink-0" />
              <span className="hidden lg:inline">{formatSimDateTime(simTime)}</span>
              <span className="lg:hidden">{new Date(simTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC</span>
            </div>

            {/* Advance time buttons */}
            <div className="flex items-center gap-1 border-l border-ink-200 pl-1">
              <button
                type="button"
                onClick={() => handleAdvance(1)}
                className="px-1.5 py-1 text-[11px] font-mono font-bold hover:bg-white active:bg-ink-200 text-ink-700 rounded transition-colors"
                title="Advance simulation by 1 hour"
              >
                +1h
              </button>
              <button
                type="button"
                onClick={() => handleAdvance(6)}
                className="px-1.5 py-1 text-[11px] font-mono font-bold hover:bg-white active:bg-ink-200 text-ink-700 rounded transition-colors"
                title="Advance simulation by 6 hours"
              >
                +6h
              </button>
              <button
                type="button"
                onClick={() => handleAdvance(24)}
                className="px-1.5 py-1 text-[11px] font-mono font-bold hover:bg-white active:bg-ink-200 text-ink-700 rounded transition-colors hidden sm:inline-block"
                title="Advance simulation by 24 hours"
              >
                +24h
              </button>
            </div>
          </div>

          {/* Reset Demo Data Button */}
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="p-2 text-ink-500 hover:text-crimson-700 hover:bg-crimson-50 rounded-lg transition-colors border border-transparent hover:border-crimson-200 min-h-[38px] min-w-[38px] flex items-center justify-center"
            title="Reset simulation data to default seed"
            aria-label="Reset simulation data"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Workspace Area: Sidebar + Page Outlet */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Collapsible Left Sidebar */}
        <aside
          className={cn(
            'hidden md:flex flex-col bg-white border-r border-ink-200 transition-all duration-300 relative select-none',
            isSidebarCollapsed ? 'w-16' : 'w-64'
          )}
        >
          {/* Navigation Links */}
          <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors group relative min-h-[44px]',
                    isActive
                      ? 'bg-crimson-50 text-crimson-800 font-semibold shadow-xs'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'shrink-0 transition-colors',
                        isActive ? 'text-crimson-600' : 'text-ink-400 group-hover:text-ink-700'
                      )}
                    >
                      {item.icon}
                    </span>
                    {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                    {!isSidebarCollapsed && typeof item.count === 'number' && item.count > 0 && (
                      <span
                        className={cn(
                          'ml-auto text-xs px-2 py-0.5 rounded-full font-mono font-semibold',
                          isActive ? 'bg-crimson-100 text-crimson-900' : 'bg-ink-100 text-ink-600'
                        )}
                      >
                        {item.count}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Bottom Sidebar Collapse Toggle */}
          <div className="p-3 border-t border-ink-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-ink-500 hover:text-ink-800 hover:bg-ink-50 rounded-lg transition-colors min-h-[44px]"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" />
                  <span>Collapse Menu</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-8 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* Responsive Mobile Bottom Tab Bar (5 primary tabs + More sheet) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-ink-200 shadow-elevated flex items-center justify-around px-1 py-1 select-none">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium min-h-[48px] min-w-[56px] transition-colors',
              isActive ? 'text-crimson-600 font-bold' : 'text-ink-500 hover:text-ink-800'
            )
          }
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/inventory"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium min-h-[48px] min-w-[56px] transition-colors',
              isActive ? 'text-crimson-600 font-bold' : 'text-ink-500 hover:text-ink-800'
            )
          }
        >
          <Package className="w-5 h-5 mb-0.5" />
          <span>Stock</span>
        </NavLink>

        <NavLink
          to="/requests/new"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium min-h-[48px] min-w-[56px] transition-colors',
              isActive ? 'text-crimson-600 font-bold' : 'text-ink-500 hover:text-ink-800'
            )
          }
        >
          <FilePlus className="w-5 h-5 mb-0.5" />
          <span>New Req</span>
        </NavLink>

        <NavLink
          to="/recommendations"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium min-h-[48px] min-w-[56px] transition-colors relative',
              isActive ? 'text-crimson-600 font-bold' : 'text-ink-500 hover:text-ink-800'
            )
          }
        >
          <Sparkles className="w-5 h-5 mb-0.5" />
          <span>Plans</span>
          {openRequestsCount > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-crimson-600 ring-2 ring-white" />
          )}
        </NavLink>

        <button
          type="button"
          onClick={() => setIsMobileMoreOpen(true)}
          className="flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium text-ink-500 hover:text-ink-800 min-h-[48px] min-w-[56px]"
          aria-label="More navigation options"
        >
          <MoreHorizontal className="w-5 h-5 mb-0.5" />
          <span>More</span>
        </button>
      </div>

      {/* Mobile "More" Drawer */}
      <Drawer
        isOpen={isMobileMoreOpen}
        onClose={() => setIsMobileMoreOpen(false)}
        title="Navigation & Controls"
        subtitle="Access simulation utilities and detailed planning views"
      >
        <div className="space-y-2">
          <Link
            to="/compare"
            onClick={() => setIsMobileMoreOpen(false)}
            className="flex items-center gap-3 p-3 rounded-xl border border-ink-150 hover:bg-ink-50 min-h-[48px]"
          >
            <GitCompare className="w-5 h-5 text-crimson-600" />
            <div>
              <span className="text-sm font-semibold text-ink-900 block">Compare Plans</span>
              <span className="text-xs text-ink-500">Baseline vs Min-Cost Flow solver comparison</span>
            </div>
          </Link>

          <Link
            to="/simulator"
            onClick={() => setIsMobileMoreOpen(false)}
            className="flex items-center gap-3 p-3 rounded-xl border border-ink-150 hover:bg-ink-50 min-h-[48px]"
          >
            <Sliders className="w-5 h-5 text-purple-600" />
            <div>
              <span className="text-sm font-semibold text-ink-900 block">Scenario Simulator</span>
              <span className="text-xs text-ink-500">Inject transport failures, demand surges, stock</span>
            </div>
          </Link>

          <Link
            to="/reservations"
            onClick={() => setIsMobileMoreOpen(false)}
            className="flex items-center gap-3 p-3 rounded-xl border border-ink-150 hover:bg-ink-50 min-h-[48px]"
          >
            <Truck className="w-5 h-5 text-blue-600" />
            <div>
              <span className="text-sm font-semibold text-ink-900 block">Reservations & Audits</span>
              <span className="text-xs text-ink-500">Track active allocations, dispatches and logs</span>
            </div>
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-ink-100">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-400 mb-3">Simulation Clock</h4>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="outline" onClick={() => handleAdvance(1)}>
              +1 Hour
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleAdvance(6)}>
              +6 Hours
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleAdvance(24)}>
              +24 Hours
            </Button>
          </div>
        </div>
      </Drawer>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset Demo Simulation?"
        subtitle="Restore deterministic seed state"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsResetModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmReset} leftIcon={<RotateCcw className="w-4 h-4" />}>
              Confirm Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 leading-relaxed">
          This will wipe active reservations, reload 122 fresh units with standard shelf-life countdowns,
          clear scenario disruptions, and reset the simulation clock to <strong>Oct 15, 08:00 UTC</strong>.
        </p>
      </Modal>
    </div>
  );
}
