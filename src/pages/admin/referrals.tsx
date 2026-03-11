/**
 * Admin Referrals Page
 * Advanced filtering for referral codes with volume and user count metrics
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
  HiUserGroup,
  HiCurrencyDollar,
  HiTrendingUp,
  HiChevronDown,
  HiChevronUp,
  HiStar,
} from 'react-icons/hi';
import AdminLayout from '~/components/admin/AdminLayout';

interface ReferralRecord {
  id: number;
  code: string;
  ownerName: string;
  ownerEmail: string;
  ownerPublicKey: string;
  referralCount: number;
  totalVolume: number;
  totalTrades: number;
  createdAt: string;
}

interface ReferralsResponse {
  referrals: ReferralRecord[];
  total: number;
  filtered: number;
  totals: {
    totalReferrals: number;
    totalVolume: number;
    totalTrades: number;
  };
}

interface RewardEarner {
  id: number;
  name: string;
  email: string;
  referralCode: string;
  honorsLevel: number;
  pendingSol: number;
  claimedSol: number;
  totalEarned: number;
  referralVolume: number;
  directReferrals: number;
}

function formatVolume(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export default function AdminReferralsPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Data
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [filtered, setFiltered] = useState(0);
  const [totals, setTotals] = useState({ totalReferrals: 0, totalVolume: 0, totalTrades: 0 });

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [minReferrals, setMinReferrals] = useState('');
  const [maxReferrals, setMaxReferrals] = useState('');
  const [minVolume, setMinVolume] = useState('');
  const [maxVolume, setMaxVolume] = useState('');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<'referralCount' | 'totalVolume' | 'createdAt' | 'code'>('referralCount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Reward earnings state
  const [activeTab, setActiveTab] = useState<'codes' | 'earnings'>('codes');
  const [earners, setEarners] = useState<RewardEarner[]>([]);
  const [earnersTotal, setEarnersTotal] = useState(0);
  const [earnersFiltered, setEarnersFiltered] = useState(0);
  const [earnersPage, setEarnersPage] = useState(0);
  const [earnersSearch, setEarnersSearch] = useState('');
  const [earnersSortBy, setEarnersSortBy] = useState<'totalEarned' | 'pendingSol' | 'claimedSol'>('totalEarned');
  const [earnersSortOrder, setEarnersSortOrder] = useState<'asc' | 'desc'>('desc');
  const [earnersLoading, setEarnersLoading] = useState(false);

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

  // Fetch referrals
  const fetchReferrals = useCallback(async () => {
    if (!isAuthorized) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (search) params.set('search', search);
      if (minReferrals) params.set('minReferrals', minReferrals);
      if (maxReferrals) params.set('maxReferrals', maxReferrals);
      if (minVolume) params.set('minVolume', minVolume);
      if (maxVolume) params.set('maxVolume', maxVolume);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const response = await fetch(`/api/admin/stats/referrals?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data: ReferralsResponse = await response.json();
      setReferrals(data.referrals);
      setTotal(data.total);
      setFiltered(data.filtered);
      setTotals(data.totals);
    } catch (err) {
      console.error('Failed to fetch referrals:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthorized, startDate, endDate, search, minReferrals, maxReferrals, minVolume, maxVolume, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  // Fetch reward earnings
  const fetchEarners = useCallback(async () => {
    if (!isAuthorized || activeTab !== 'earnings') return;

    setEarnersLoading(true);
    try {
      const params = new URLSearchParams();
      if (earnersSearch) params.set('search', earnersSearch);
      params.set('limit', String(limit));
      params.set('offset', String(earnersPage * limit));
      params.set('sortBy', earnersSortBy);
      params.set('sortOrder', earnersSortOrder);

      const response = await fetch(`/api/admin/stats/rewards?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setEarners(data.users || []);
      setEarnersTotal(data.total || 0);
      setEarnersFiltered(data.filtered || 0);
    } catch (err) {
      console.error('Failed to fetch earners:', err);
    } finally {
      setEarnersLoading(false);
    }
  }, [isAuthorized, activeTab, earnersSearch, earnersPage, earnersSortBy, earnersSortOrder]);

  useEffect(() => {
    fetchEarners();
  }, [fetchEarners]);

  // Reset earners page when filters change
  useEffect(() => {
    setEarnersPage(0);
  }, [earnersSearch, earnersSortBy, earnersSortOrder]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [startDate, endDate, search, minReferrals, maxReferrals, minVolume, maxVolume, sortBy, sortOrder]);

  // Clear filters
  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSearch('');
    setMinReferrals('');
    setMaxReferrals('');
    setMinVolume('');
    setMaxVolume('');
    setPage(0);
  };

  // Toggle sort
  const toggleSort = (column: 'referralCount' | 'totalVolume' | 'createdAt' | 'code') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Export to CSV
  const exportCSV = () => {
    const headers = ['Code', 'Owner Name', 'Owner Email', 'Owner Wallet', 'Referrals', 'Volume', 'Trades', 'Created'];
    const rows = referrals.map((r) => [
      r.code,
      r.ownerName,
      r.ownerEmail,
      r.ownerPublicKey,
      r.referralCount,
      r.totalVolume.toFixed(2),
      r.totalTrades,
      new Date(r.createdAt).toLocaleString(),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referrals-${startDate || 'all'}-to-${endDate || 'now'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = startDate || endDate || search || minReferrals || maxReferrals || minVolume || maxVolume;
  const hasAdvancedFilters = minReferrals || maxReferrals || minVolume || maxVolume;
  const totalPages = Math.ceil(filtered / limit);

  // Toggle earner sort
  const toggleEarnerSort = (column: 'totalEarned' | 'pendingSol' | 'claimedSol') => {
    if (earnersSortBy === column) {
      setEarnersSortOrder(earnersSortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setEarnersSortBy(column);
      setEarnersSortOrder('desc');
    }
  };

  const earnersTotalPages = Math.ceil(earnersFiltered / limit);

  // Honors level labels
  const honorsLabels: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
  const honorsColors: Record<number, string> = {
    1: 'text-neutral-400 bg-neutral-700/50',
    2: 'text-blue-400 bg-blue-500/20',
    3: 'text-purple-400 bg-purple-500/20',
    4: 'text-yellow-400 bg-yellow-500/20',
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: 'referralCount' | 'totalVolume' | 'createdAt' | 'code' }) => {
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

  // Earner sort icon
  const EarnerSortIcon = ({ column }: { column: 'totalEarned' | 'pendingSol' | 'claimedSol' }) => {
    if (earnersSortBy !== column) return null;
    return earnersSortOrder === 'desc' ? (
      <HiSortDescending className="w-4 h-4 text-emerald-400" />
    ) : (
      <HiSortAscending className="w-4 h-4 text-emerald-400" />
    );
  };

  return (
    <AdminLayout title="Referrals">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Referrals</h2>
          <p className="text-neutral-500 text-sm mt-1">
            {activeTab === 'codes'
              ? `${filtered.toLocaleString()} of ${total.toLocaleString()} referral codes`
              : `${earnersFiltered.toLocaleString()} of ${earnersTotal.toLocaleString()} earners`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'codes' && (
            <button
              onClick={exportCSV}
              disabled={referrals.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiDownload className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-neutral-900/50 border border-neutral-800/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('codes')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'codes'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <HiUserGroup className="w-4 h-4" />
            Referral Codes
          </span>
        </button>
        <button
          onClick={() => setActiveTab('earnings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'earnings'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <HiStar className="w-4 h-4" />
            Reward Earnings
          </span>
        </button>
      </div>

      {activeTab === 'codes' && (<>
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-neutral-900/50 border border-purple-500/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <HiUserGroup className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-neutral-500">Total Referred</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-white">{totals.totalReferrals.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-neutral-900/50 border border-emerald-500/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <HiCurrencyDollar className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-neutral-500">Total Volume</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-white">{formatVolume(totals.totalVolume)}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-neutral-900/50 border border-blue-500/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <HiTrendingUp className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-neutral-500">Total Trades</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-white">{totals.totalTrades.toLocaleString()}</p>
        </div>
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
                placeholder="Search by code, name, or email..."
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

          {/* Advanced Filters Toggle */}
          <div className="flex items-end">
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                hasAdvancedFilters
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <HiFilter className="w-4 h-4" />
              Advanced
              {showAdvancedFilters ? (
                <HiChevronUp className="w-4 h-4" />
              ) : (
                <HiChevronDown className="w-4 h-4" />
              )}
            </button>
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

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="mt-4 pt-4 border-t border-neutral-800/50">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Min Referrals */}
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Min Referrals</label>
                <input
                  type="number"
                  value={minReferrals}
                  onChange={(e) => setMinReferrals(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              {/* Max Referrals */}
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Max Referrals</label>
                <input
                  type="number"
                  value={maxReferrals}
                  onChange={(e) => setMaxReferrals(e.target.value)}
                  placeholder="No limit"
                  min="0"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              {/* Min Volume */}
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Min Volume ($)</label>
                <input
                  type="number"
                  value={minVolume}
                  onChange={(e) => setMinVolume(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              {/* Max Volume */}
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Max Volume ($)</label>
                <input
                  type="number"
                  value={maxVolume}
                  onChange={(e) => setMaxVolume(e.target.value)}
                  placeholder="No limit"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>
          </div>
        )}

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
                  onClick={() => toggleSort('code')}
                >
                  <span className="flex items-center gap-1">
                    Code
                    <SortIcon column="code" />
                  </span>
                </th>
                <th className="text-left p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                  Owner
                </th>
                <th
                  className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('referralCount')}
                >
                  <span className="flex items-center justify-end gap-1">
                    Referrals
                    <SortIcon column="referralCount" />
                  </span>
                </th>
                <th
                  className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('totalVolume')}
                >
                  <span className="flex items-center justify-end gap-1">
                    Volume
                    <SortIcon column="totalVolume" />
                  </span>
                </th>
                <th className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">
                  Trades
                </th>
                <th
                  className="text-left p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors hidden lg:table-cell"
                  onClick={() => toggleSort('createdAt')}
                >
                  <span className="flex items-center gap-1">
                    Created
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
              ) : referrals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    No referral codes found
                  </td>
                </tr>
              ) : (
                referrals.map((referral) => (
                  <tr key={referral.id} className="hover:bg-neutral-800/30 transition-colors">
                    {/* Code */}
                    <td className="p-4">
                      <code className="text-sm font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded">
                        {referral.code}
                      </code>
                    </td>

                    {/* Owner */}
                    <td className="p-4 hidden md:table-cell">
                      <div>
                        <p className="font-medium text-white text-sm">{referral.ownerName}</p>
                        <p className="text-xs text-neutral-500">{referral.ownerEmail}</p>
                      </div>
                    </td>

                    {/* Referrals */}
                    <td className="p-4 text-right">
                      <span className={`text-sm font-medium ${referral.referralCount > 0 ? 'text-purple-400' : 'text-neutral-500'}`}>
                        {referral.referralCount}
                      </span>
                    </td>

                    {/* Volume */}
                    <td className="p-4 text-right">
                      <span className={`text-sm font-medium ${referral.totalVolume > 0 ? 'text-emerald-400' : 'text-neutral-500'}`}>
                        {formatVolume(referral.totalVolume)}
                      </span>
                    </td>

                    {/* Trades */}
                    <td className="p-4 text-right hidden sm:table-cell">
                      <span className="text-sm text-neutral-400">{referral.totalTrades}</span>
                    </td>

                    {/* Created */}
                    <td className="p-4 hidden lg:table-cell">
                      <div className="text-sm">
                        <p className="text-white">
                          {new Date(referral.createdAt).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {new Date(referral.createdAt).toLocaleTimeString()}
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
      </>)}

      {/* ==================== Reward Earnings Tab ==================== */}
      {activeTab === 'earnings' && (
        <>
          {/* Search */}
          <div className="rounded-2xl bg-neutral-900/50 border border-neutral-800/50 p-4 mb-6">
            <div className="relative">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                value={earnersSearch}
                onChange={(e) => setEarnersSearch(e.target.value)}
                placeholder="Search by name, email, or referral code..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Earnings Table */}
          <div className="rounded-2xl bg-neutral-900/50 border border-neutral-800/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-800/50 bg-neutral-900/50">
                    <th className="text-left p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-left p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                      Code
                    </th>
                    <th className="text-center p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">
                      Honors
                    </th>
                    <th
                      className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleEarnerSort('pendingSol')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Pending
                        <EarnerSortIcon column="pendingSol" />
                      </span>
                    </th>
                    <th
                      className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleEarnerSort('claimedSol')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Claimed
                        <EarnerSortIcon column="claimedSol" />
                      </span>
                    </th>
                    <th
                      className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleEarnerSort('totalEarned')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Total Earned
                        <EarnerSortIcon column="totalEarned" />
                      </span>
                    </th>
                    <th className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">
                      Ref Volume
                    </th>
                    <th className="text-right p-4 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">
                      Referrals
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/30">
                  {earnersLoading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-neutral-500">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent mx-auto mb-2" />
                        Loading...
                      </td>
                    </tr>
                  ) : earners.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-neutral-500">
                        No reward earners found
                      </td>
                    </tr>
                  ) : (
                    earners.map((earner) => (
                      <tr key={earner.id} className="hover:bg-neutral-800/30 transition-colors">
                        <td className="p-4">
                          <div>
                            <p className="text-sm font-medium text-white truncate">
                              {earner.name || 'Unknown'}
                            </p>
                            <p className="text-xs text-neutral-500 truncate">
                              {earner.email}
                            </p>
                          </div>
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          {earner.referralCode ? (
                            <code className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                              {earner.referralCode}
                            </code>
                          ) : (
                            <span className="text-xs text-neutral-600">-</span>
                          )}
                        </td>
                        <td className="p-4 text-center hidden sm:table-cell">
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              honorsColors[earner.honorsLevel] || honorsColors[1]
                            }`}
                          >
                            {honorsLabels[earner.honorsLevel] || earner.honorsLevel}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-medium text-amber-400 tabular-nums">
                            {earner.pendingSol.toFixed(6)}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-medium text-emerald-400 tabular-nums">
                            {earner.claimedSol.toFixed(6)}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-bold text-white tabular-nums">
                            {earner.totalEarned.toFixed(6)}
                          </span>
                          <span className="text-xs text-neutral-500 ml-1">SOL</span>
                        </td>
                        <td className="p-4 text-right hidden lg:table-cell">
                          <span className="text-sm text-neutral-400">
                            {formatVolume(earner.referralVolume)}
                          </span>
                        </td>
                        <td className="p-4 text-right hidden lg:table-cell">
                          <span className="text-sm text-neutral-400">
                            {earner.directReferrals}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {earnersTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-neutral-800/50">
                <p className="text-sm text-neutral-500">
                  Page {earnersPage + 1} of {earnersTotalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEarnersPage((p) => Math.max(0, p - 1))}
                    disabled={earnersPage === 0}
                    className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <HiChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setEarnersPage((p) => Math.min(earnersTotalPages - 1, p + 1))
                    }
                    disabled={earnersPage >= earnersTotalPages - 1}
                    className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <HiChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
