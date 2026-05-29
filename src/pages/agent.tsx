import Head from 'next/head';
import Header from '../components/Header';

export default function AgentPage() {
  return (
    <>
      <Head>
        <title>Agent | Interstate</title>
      </Head>
      <div className="min-h-screen bg-[#1A1A1A] text-white">
        <div className="relative z-[10000]"><Header /></div>
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)] p-4">
          <div className="text-center">
            <div className="mb-6">
              <img
                src="/interstate/logo.png"
                alt="Interstate Logo"
                className="w-24 h-24 mx-auto mb-6 object-contain"
              />
            </div>
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-[#70E0B0] to-[#58B890] bg-clip-text text-transparent">
              Coming Soon
            </h1>
            <p className="text-gray-400 text-lg mb-4">
              Agent is currently being built.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              Check back soon for updates!
            </p>
            <a
              href="/pulse"
              className="inline-block px-6 py-3 rounded-lg bg-[#70E0B0] text-black font-medium hover:bg-[#58B890] transition-colors"
            >
              Back to Pulse
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
