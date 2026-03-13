// Page disabled — to re-enable, remove the getServerSideProps at the bottom of this file
import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';

interface ServiceConfig {
  name: string;
  url: string;
  description?: string;
}

interface ServiceStatus {
  name: string;
  url: string;
  status: 'operational' | 'degraded' | 'down' | 'checking';
  responseTime?: number;
  lastChecked?: Date;
  uptimeHistory: ('up' | 'down' | 'degraded' | 'unknown')[];
  uptimePercent: number;
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'Token Service (Solana)',
    url: 'https://token.narrative.trade/healthz',
    description: 'Solana token data and price feeds',
  },
  {
    name: 'Wallet Service',
    url: 'https://wallet.narrative.trade/health',
    description: 'Wallet management and transactions',
  },
  {
    name: 'Indexing Service',
    url: 'https://indexing.narrative.trade/health',
    description: 'Blockchain indexing and data aggregation',
  },
  {
    name: 'Monad Indexer',
    url: 'https://monad-indexer.narrative.trade/health',
    description: 'Monad blockchain token indexing',
  },
  {
    name: 'Monad Token Service',
    url: 'https://monad-token-service.narrative.trade/healthz',
    description: 'Monad token data and API',
  },
];

const HISTORY_LENGTH = 90; // 90 bars for history display

export default function StatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({
      name: s.name,
      url: s.url,
      status: 'checking',
      uptimeHistory: Array(HISTORY_LENGTH).fill('unknown'),
      uptimePercent: 100,
    }))
  );
  const [allOperational, setAllOperational] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const checkHealth = useCallback(async (service: ServiceConfig): Promise<Partial<ServiceStatus>> => {
    const startTime = Date.now();
    try {
      const response = await fetch(`/api/health-check?url=${encodeURIComponent(service.url)}`);
      const data = await response.json();
      const responseTime = Date.now() - startTime;

      return {
        status: data.status === 'healthy' ? 'operational' : 'down',
        responseTime,
        lastChecked: new Date(),
      };
    } catch {
      return {
        status: 'down',
        responseTime: Date.now() - startTime,
        lastChecked: new Date(),
      };
    }
  }, []);

  const checkAllServices = useCallback(async () => {
    const results = await Promise.all(
      SERVICES.map(async (service, index) => {
        const result = await checkHealth(service);
        return { index, result };
      })
    );

    setServices((prev) => {
      const updated = [...prev];
      results.forEach(({ index, result }) => {
        const currentStatus = result.status === 'operational' ? 'up' : 'down';
        const newHistory = [...updated[index].uptimeHistory.slice(1), currentStatus];
        const upCount = newHistory.filter((s) => s === 'up').length;
        const knownCount = newHistory.filter((s) => s !== 'unknown').length;

        updated[index] = {
          ...updated[index],
          ...result,
          uptimeHistory: newHistory,
          uptimePercent: knownCount > 0 ? (upCount / knownCount) * 100 : 100,
        } as ServiceStatus;
      });
      return updated;
    });

    setLastUpdated(new Date());
  }, [checkHealth]);

  useEffect(() => {
    checkAllServices();
    const interval = setInterval(checkAllServices, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [checkAllServices]);

  useEffect(() => {
    const hasIssues = services.some((s) => s.status !== 'operational' && s.status !== 'checking');
    setAllOperational(!hasIssues);
  }, [services]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'up':
      case 'operational':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'down':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getBarColor = (status: string) => {
    switch (status) {
      case 'up':
        return '#6B9E3C';
      case 'degraded':
        return '#E8A838';
      case 'down':
        return '#DC4C4C';
      default:
        return '#D1D5DB';
    }
  };

  return (
    <>
      <Head>
        <title>System Status | Interstate</title>
        <meta name="description" content="Current system status for Interstate Trade services" />
      </Head>

      <div className="min-h-screen bg-[#F5F5F5]">
        {/* Header Banner */}
        <div
          className={`py-6 px-8 ${
            allOperational ? 'bg-[#6B9E3C]' : 'bg-red-500'
          }`}
        >
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-white">
              {allOperational ? 'All Systems Operational' : 'System Issues Detected'}
            </h1>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Uptime Header */}
          <div className="text-right text-sm text-gray-500 mb-4">
            Uptime over the past {HISTORY_LENGTH} checks.{' '}
            {lastUpdated && (
              <span className="text-gray-400">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Service Status Cards */}
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {services.map((service, idx) => (
              <div key={idx} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{service.name}</h3>
                    <p className="text-sm text-gray-500">
                      {SERVICES[idx].description}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      service.status === 'operational'
                        ? 'text-green-600'
                        : service.status === 'checking'
                        ? 'text-gray-400'
                        : 'text-red-600'
                    }`}
                  >
                    {service.status === 'checking'
                      ? 'Checking...'
                      : service.status === 'operational'
                      ? 'Operational'
                      : 'Down'}
                  </span>
                </div>

                {/* Uptime Bars */}
                <div className="flex gap-[2px] h-8 mb-2">
                  {service.uptimeHistory.map((status, barIdx) => (
                    <div
                      key={barIdx}
                      className="flex-1 rounded-sm transition-colors duration-300"
                      style={{ backgroundColor: getBarColor(status) }}
                      title={`Check ${barIdx + 1}: ${status}`}
                    />
                  ))}
                </div>

                {/* Uptime Stats */}
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{HISTORY_LENGTH} checks ago</span>
                  <span>{service.uptimePercent.toFixed(2)} % uptime</span>
                  <span>Now</span>
                </div>

                {/* Response Time */}
                {service.responseTime && (
                  <div className="mt-2 text-xs text-gray-400">
                    Response time: {service.responseTime}ms
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Refresh Button */}
          <div className="mt-6 text-center">
            <button
              onClick={checkAllServices}
              className="px-4 py-2 bg-[#6B9E3C] text-white rounded-lg hover:bg-[#5A8B32] transition-colors text-sm font-medium"
            >
              Refresh Status
            </button>
          </div>

          {/* Legend */}
          <div className="mt-8 flex justify-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#6B9E3C]"></div>
              <span>Operational</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#E8A838]"></div>
              <span>Degraded</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#DC4C4C]"></div>
              <span>Down</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#D1D5DB]"></div>
              <span>Unknown</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 text-center text-sm text-gray-500">
            <p>
              Status page for{' '}
              <a
                href="https://interstate.so/"
                className="text-[#6B9E3C] hover:underline"
              >
                Interstate
              </a>
            </p>
            <p className="mt-1">
              Checks performed every 30 seconds
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// Disable this page — returns 404 to any visitor
export const getServerSideProps = () => ({ notFound: true as const });
