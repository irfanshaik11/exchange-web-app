import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import PulseTable from '../components/PulseTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';

export default function PulsePage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/getAllTokens')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch tokens');
        return res.json();
      })
      .then((data: { result: Token[] }) => {
        setTokens(data.result || []);
      })
      .catch(() => setError('Failed to load tokens.'))
      .finally(() => setLoading(false));
  }, []);

  // Segregate tokens
  const newPairs = tokens.filter(t => {
    const prog = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : t.bonding_curve_progress;
    return prog < 0.1;
  });
  const finalStretch = tokens.filter(t => {
    const prog = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : t.bonding_curve_progress;
    return prog > 0.8 && prog < 1;
  });
  const migrated = tokens.filter(t => {
    const prog = typeof t.bonding_curve_progress === 'string' ? parseFloat(t.bonding_curve_progress) : t.bonding_curve_progress;
    return prog >= 1;
  });

  return (
    <>
      <Head>
        <title>Pulse | Interstate Memeboard</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <Header />
        <div className="p-8">
          <h1 className="text-2xl font-bold mb-6">Pulse</h1>
          {loading ? (
            <div className="text-center text-neutral-400 py-10">Loading tokens...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-10">{error}</div>
          ) : (
            <div className="flex flex-row gap-6 max-w-full overflow-x-auto">
              <PulseTable title="New Pairs" tokens={newPairs} />
              <PulseTable title="Final Stretch" tokens={finalStretch} />
              <PulseTable title="Migrated" tokens={migrated} />
            </div>
          )}
        </div>
      </div>
    </>
  );
} 