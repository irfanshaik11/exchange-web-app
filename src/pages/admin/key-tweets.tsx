/**
 * Admin: Arena Key Tweets CRUD
 *
 * Lets admins publish curated tweets that users can engage with for credits.
 * Each tweet is scoped to one season. Cap is ~10 active tweets/season.
 *
 * Route: /admin/key-tweets
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import AdminLayout from '~/components/admin/AdminLayout';
import { FiPlus, FiExternalLink, FiToggleLeft, FiToggleRight } from 'react-icons/fi';

interface Season {
  id: number;
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

interface KeyTweet {
  id: number;
  seasonId: number;
  tweetId: string;
  tweetUrl: string;
  creditsPerClaim: number;
  isActive: boolean;
  activatedAt: string;
}

async function adminFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || body?.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export default function AdminKeyTweetsPage() {
  const router = useRouter();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [tweets, setTweets] = useState<KeyTweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [form, setForm] = useState({ seasonId: 0, tweetId: '', tweetUrl: '', creditsPerClaim: 500 });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([
        adminFetch<{ seasons: Season[] }>('/api/arena/seasons'),
        adminFetch<{ tweets: KeyTweet[] }>('/api/admin/key-tweets'),
      ]);
      setSeasons(s.seasons);
      setTweets(t.tweets);
      // Default form seasonId to the active season
      const active = s.seasons.find((x) => x.isActive);
      if (active) setForm((f) => (f.seasonId === 0 ? { ...f, seasonId: active.id } : f));
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adminFetch('/api/admin/key-tweets', {
        method: 'POST',
        body: JSON.stringify({
          seasonId: form.seasonId,
          tweetId: form.tweetId.trim(),
          tweetUrl: form.tweetUrl.trim(),
          creditsPerClaim: Number(form.creditsPerClaim),
        }),
      });
      setForm({ seasonId: form.seasonId, tweetId: '', tweetUrl: '', creditsPerClaim: 500 });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (t: KeyTweet) => {
    try {
      await adminFetch(`/api/admin/key-tweets/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Update failed');
    }
  };

  const handleUpdateCredits = async (t: KeyTweet, newValue: number) => {
    try {
      await adminFetch(`/api/admin/key-tweets/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ creditsPerClaim: newValue }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Update failed');
    }
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Arena Key Tweets</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Curated tweets users can engage with for credits. Each user can claim
            each tweet once. Keep it to ~10 active per season.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Create form */}
        <form
          onSubmit={handleCreate}
          className="mb-8 rounded-lg border border-neutral-800 bg-neutral-950 p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <FiPlus size={16} className="text-yellow-400" />
            <span className="text-sm font-semibold text-white">Add Key Tweet</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="flex flex-col text-xs text-neutral-400">
              Season
              <select
                value={form.seasonId}
                onChange={(e) => setForm({ ...form, seasonId: Number(e.target.value) })}
                className="mt-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
              >
                <option value={0} disabled>Select…</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isActive ? '(active)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-neutral-400">
              Tweet ID
              <input
                value={form.tweetId}
                onChange={(e) => setForm({ ...form, tweetId: e.target.value })}
                required
                maxLength={40}
                placeholder="1234567890"
                className="mt-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-xs text-neutral-400 sm:col-span-2">
              Tweet URL
              <input
                value={form.tweetUrl}
                onChange={(e) => setForm({ ...form, tweetUrl: e.target.value })}
                required
                type="url"
                placeholder="https://x.com/interstatefdn/status/..."
                className="mt-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-xs text-neutral-400">
              Credits per claim
              <input
                value={form.creditsPerClaim}
                onChange={(e) => setForm({ ...form, creditsPerClaim: Number(e.target.value) })}
                type="number"
                min={1}
                max={10000}
                className="mt-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={submitting || !form.seasonId || !form.tweetId || !form.tweetUrl}
              className="rounded-md bg-yellow-500 px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-yellow-400 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Key Tweet'}
            </button>
          </div>
        </form>

        {/* Table */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="border-b border-neutral-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">All Key Tweets</h2>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-neutral-500">Loading…</div>
          ) : tweets.length === 0 ? (
            <div className="p-6 text-sm text-neutral-500">No tweets yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Season</th>
                  <th className="px-4 py-2">Tweet ID</th>
                  <th className="px-4 py-2">URL</th>
                  <th className="px-4 py-2">Credits</th>
                  <th className="px-4 py-2">Active</th>
                  <th className="px-4 py-2">Activated</th>
                </tr>
              </thead>
              <tbody>
                {tweets.map((t) => {
                  const s = seasons.find((x) => x.id === t.seasonId);
                  return (
                    <tr key={t.id} className="border-b border-neutral-900 last:border-b-0">
                      <td className="px-4 py-2 text-neutral-300">{s?.name ?? t.seasonId}</td>
                      <td className="px-4 py-2 font-mono text-xs text-neutral-400">{t.tweetId}</td>
                      <td className="px-4 py-2">
                        <a
                          href={t.tweetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300"
                        >
                          <FiExternalLink size={12} /> Open
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={t.creditsPerClaim}
                          min={1}
                          max={10000}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v !== t.creditsPerClaim) handleUpdateCredits(t, v);
                          }}
                          className="w-20 rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-xs text-white"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => handleToggle(t)} className="text-neutral-400 hover:text-yellow-300">
                          {t.isActive ? <FiToggleRight size={20} /> : <FiToggleLeft size={20} />}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-500">
                        {new Date(t.activatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
