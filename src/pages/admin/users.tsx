/**
 * Admin Users Page
 * Full user data with volume, trades, referrals, and date filtering
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  HiSearch,
  HiCalendar,
  HiChevronLeft,
  HiChevronRight,
  HiDownload,
  HiFilter,
  HiX,
  HiExternalLink,
  HiSortDescending,
  HiSortAscending,
} from 'react-icons/hi';
import AdminLayout from '~/components/admin/AdminLayout';

interface UserRecord {
  id: number;
  email: string;
  name: string;
  publicKey: string;
  referralCode: string | null;
  referredByCode: string | null;
  createdAt: string;
  totalVolume: number;
  tradeCount: number;
  referralCount: number;
}

interface UsersResponse {
  users: UserRecord[];
  total: number;
  filtered: number;
}

function formatVolume(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Data
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [filtered, setFiltered] = useState(0);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'email'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const limit = 25;

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/session', { credentials: 'include' });
        const data = await response.json();
        if (!data.authenticated) {
          router.replace('/admin/login');
          return;
        }
        setIsAuthorized(true);
      } catch {
        router.replace('/admin/login');
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    if (!isAuthorized) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (search) params.set('search', search);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const response = await fetch(`/api/admin/stats/users?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data: UsersResponse = await response.json();
      setUsers(data.users);
      setTotal(data.total);
      setFiltered(data.filtered);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthorized, startDate, endDate, search, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [startDate, endDate, search, sortBy, sortOrder]);

  // Clear filters
  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSearch('');
    setPage(0);
  };

  // Toggle sort
  const toggleSort = (column: 'createdAt' | 'name' | 'email') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Export to CSV
  const exportCSV = () => {
    const headers = ['ID', 'Name', 'Email', 'Public Key', 'Referral Code', 'Referred By', 'Volume', 'Trades', 'Referrals', 'Joined'];
    const rows = users.map((u) => [
      u.id,
      u.name,
      u.email,
      u.publicKey,
      u.referralCode || '',
      u.referredByCode || '',
      u.totalVolume.toFixed(2),
      u.tradeCount,
      u.referralCount,
      new Date(u.createdAt).toLocaleString(),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${startDate || 'all'}-to-${endDate || 'now'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = startDate || endDate || search;
  const totalPages = Math.ceil(filtered / limit);

  // Sort icon component
  const SortIcon = ({ column }: { column: 'createdAt' | 'name' | 'email' }) => {
    if (sortBy !== column) return null;
    return sortOrder === 'desc' ? (
      <HiSortDescending className="w-4 h-4 text-emerald-400" />
    ) : (
      <HiSortAscending className="w-4 h-4 text-emerald-400" />
    );
  };

  if (isCheckingAuth || !isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <AdminLayout title="Users">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Users</h2>
          <p className="text-neutral-500 text-sm mt-1">
            {filtered.toLocaleString()} of {total.toLocaleString()} users
          </p>
        </div>

        <button
          onClick={exportCSV}
          disabled={users.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HiDownload className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-neutral-900/50 border border-neutral-800/50 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <label className="block text-xs text-neutral-500 mb-1">Search</label>
            <div className="relative">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or wallet..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="flex gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">From</label>
              <div className="relative">
                <HiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-10 pr-3 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">To</label>
              <div className="relative">
                <HiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-10 pr-3 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors text-sm"
              >
                <HiX className="w-4 h-4" />
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Active filters indicator */}
        {hasFilters && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-800/50">
            <HiFilter className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-neutral-400">
              Showing {filtered.toLocaleString()} filtered results
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-neutral-900/50 border border-neutral-800/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800/50 bg-neutral-900/50">
                <th
                  className="text-left p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('name')}
                >
                  <span className="flex items-center gap-1">
                    User
                    <SortIcon column="name" />
                  </span>
                </th>
                <th className="text-left p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                  Wallet
                </th>
                <th className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Volume
                </th>
                <th className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">
                  Trades
                </th>
                <th className="text-left p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">
                  Referral
                </th>
                <th
                  className="text-left p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('createdAt')}
                >
                  <span className="flex items-center gap-1">
                    Joined
                    <SortIcon column="createdAt" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/30">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent mx-auto mb-2" />
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-800/30 transition-colors">
                    {/* User */}
                    <td className="p-4">
                      <div>
                        <p className="font-medium text-white text-sm">{user.name}</p>
                        <p className="text-xs text-neutral-500">{user.email}</p>
                      </div>
                    </td>

                    {/* Wallet */}
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <code className="text-xs text-neutral-400 font-mono">
                          {user.publicKey.slice(0, 4)}...{user.publicKey.slice(-4)}
                        </code>
                        <a
                          href={`https://solscan.io/account/${user.publicKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-500 hover:text-emerald-400 transition-colors"
                        >
                          <HiExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>

                    {/* Volume */}
                    <td className="p-4 text-right">
                      <span className={`text-sm font-medium ${user.totalVolume > 0 ? 'text-emerald-400' : 'text-neutral-500'}`}>
                        {formatVolume(user.totalVolume)}
                      </span>
                    </td>

                    {/* Trades */}
                    <td className="p-4 text-right hidden sm:table-cell">
                      <span className="text-sm text-neutral-400">{user.tradeCount}</span>
                    </td>

                    {/* Referral */}
                    <td className="p-4 hidden lg:table-cell">
                      <div className="flex items-center gap-2 text-xs">
                        {user.referralCode && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                            {user.referralCode}
                            {user.referralCount > 0 && (
                              <span className="ml-1 text-emerald-300">({user.referralCount})</span>
                            )}
                          </span>
                        )}
                        {user.referredByCode && (
                          <span className="text-neutral-500">
                            via {user.referredByCode}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Joined */}
                    <td className="p-4">
                      <div className="text-sm">
                        <p className="text-white">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {new Date(user.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-neutral-800/50">
            <p className="text-sm text-neutral-500">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <HiChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <HiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
