"use client";

import React, { useState, useEffect } from "react";
import { getMyLimitOrders, updateLimitOrder } from "~/utils/api";
import { useUser } from "./UserContext";
import toast from "react-hot-toast";

const isDev = process.env.NODE_ENV !== 'production';

interface LimitOrder {
  id: string;
  tokenAddress: string;
  type: "Buy" | "Sell";
  direction: "Above" | "Below";
  targetMC: number | string;
  solAmount: number | string;
  tokenAmount: number | string;
  status: "Active" | "Cancelled" | "Completed" | "Failed";
  createdAt?: string;
  transactionHash?: string; // For completed orders
  poolType?: string | null;
  failureReason?: string | null;
  failureCode?: string | null;
}

function describeOrderType(order: LimitOrder): string {
  if (order.type === "Buy") {
    return order.direction === "Below" ? "Buy Limit (Below)" : "Buy Stop (Above)";
  }
  return order.direction === "Above" ? "Sell Limit (Above)" : "Sell Stop (Below)";
}

export default function LimitOrdersPanel() {
  const { user } = useUser();
  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchOrders = async () => {
    if (!user?.bearerToken) return;
    
    setLoading(true);
    try {
      const response = await getMyLimitOrders(user.bearerToken);
      setOrders(response.orders || []);
      isDev && console.log('Fetched limit orders:', response.orders);
    } catch (error: any) {
      console.error('Failed to fetch limit orders:', error);
      toast.error('Failed to load limit orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!user?.bearerToken) return;
    
    setCancelling(orderId);
    try {
      await updateLimitOrder({ orderId, status: "Cancelled" }, user.bearerToken);
      toast.success('Order cancelled successfully');
      
      // Update local state
      setOrders(prev => prev.map(order =>
        order.id === orderId ? { ...order, status: "Cancelled" as const, failureReason: undefined, failureCode: undefined } : order
      ));
      // Notify chart to remove the dotted line
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("limit-order-update"));
      }
    } catch (error: any) {
      console.error('Failed to cancel order:', error);
      toast.error(`Failed to cancel: ${error.message}`);
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => {
    fetchOrders();
    
    // Refresh every 5 seconds to quickly detect completed orders
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [user?.bearerToken]);

  // Detect when orders complete and show notification
  useEffect(() => {
    const completedOrderIds = new Set(
      orders.filter(o => o.status === 'Completed').map(o => o.id)
    );
    
    // Store in localStorage to detect newly completed orders
    const previousCompleted = localStorage.getItem('completedOrders');
    const previousSet = previousCompleted ? new Set(JSON.parse(previousCompleted)) : new Set();
    
    // Find newly completed orders
    const newlyCompleted = Array.from(completedOrderIds).filter(id => !previousSet.has(id));
    
    if (newlyCompleted.length > 0) {
      newlyCompleted.forEach(orderId => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          toast.success(
            `🎉 Limit order #${orderId} executed! ${order.type} ${order.type === 'Buy' ? order.solAmount + ' SOL' : order.tokenAmount + ' tokens'}`,
            { duration: 10000 }
          );
        }
      });
    }
    
    // Update localStorage
    localStorage.setItem('completedOrders', JSON.stringify(Array.from(completedOrderIds)));
  }, [orders]);

  useEffect(() => {
    const cancelledWithReason = orders.filter(
      o =>
        (o.status === 'Cancelled' || o.status === 'Failed') &&
        o.failureReason &&
        o.failureReason.trim().length > 0
    );

    const previousRaw = localStorage.getItem('limitOrderFailures');
    const previousMap: Record<string, string> = previousRaw ? JSON.parse(previousRaw) : {};

    const nextMap: Record<string, string> = {};

    cancelledWithReason.forEach(order => {
      nextMap[order.id] = order.failureReason!;
      if (previousMap[order.id] !== order.failureReason) {
        toast.error(`⚠️ Limit order #${order.id} failed: ${order.failureReason}`, {
          duration: 10000,
        });
      }
    });

    localStorage.setItem('limitOrderFailures', JSON.stringify(nextMap));
  }, [orders]);

  const activeOrders = orders.filter(o => o.status === 'Active');
  const completedOrders = orders.filter(o => o.status === 'Completed');
  const cancelledOrders = orders.filter(o => o.status === 'Cancelled' || o.status === 'Failed');

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Limit Orders</h2>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-white disabled:opacity-50"
        >
          {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-green-400 mb-3">
            🟢 Active Orders ({activeOrders.length})
          </h3>
          <div className="space-y-3">
            {activeOrders.map(order => (
              <div
                key={order.id}
                className="bg-neutral-900 border border-neutral-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        order.type === 'Buy' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {describeOrderType(order)}
                      </span>
                      <span className="text-xs text-neutral-400">
                        Order #{order.id}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      <div className="text-neutral-300">
                        <span className="text-neutral-500">Token:</span>{' '}
                        <span className="font-mono text-xs">
                          {order.tokenAddress.slice(0, 8)}...{order.tokenAddress.slice(-6)}
                        </span>
                      </div>
                      
                      <div className="text-neutral-300">
                        <span className="text-neutral-500">Amount:</span>{' '}
                        {order.type === 'Buy' 
                          ? `${order.solAmount} SOL` 
                          : `${order.tokenAmount}% of holdings`}
                      </div>
                      
                      <div className="text-neutral-300">
                        <span className="text-neutral-500">Trigger:</span>{' '}
                        When MC {order.direction === 'Above' ? '≥' : '≤'}{' '}
                        <span className="font-semibold text-white">
                          ${Number(order.targetMC).toLocaleString()}
                        </span>
                      </div>
                      
                      {order.createdAt && (
                        <div className="text-xs text-neutral-500">
                          Created: {new Date(order.createdAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleCancel(order.id)}
                    disabled={cancelling === order.id}
                    className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {cancelling === order.id ? '⏳ Cancelling...' : '❌ Cancel'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Orders */}
      {completedOrders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-green-400 mb-3">
            ✅ Completed Orders ({completedOrders.length})
          </h3>
          <div className="space-y-3">
            {completedOrders.map(order => (
              <div
                key={order.id}
                className="bg-green-500/10 border border-green-500/30 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        order.type === 'Buy' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {describeOrderType(order)}
                      </span>
                      <span className="text-xs text-green-400 font-semibold">
                        ✅ EXECUTED
                      </span>
                      <span className="text-xs text-neutral-500">
                        Order #{order.id}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      <div className="text-neutral-300">
                        <span className="text-neutral-500">Token:</span>{' '}
                        <span className="font-mono text-xs">
                          {order.tokenAddress.slice(0, 8)}...{order.tokenAddress.slice(-6)}
                        </span>
                      </div>
                      
                      <div className="text-neutral-300">
                        <span className="text-neutral-500">Amount:</span>{' '}
                        {order.type === 'Buy' 
                          ? `${order.solAmount} SOL` 
                          : `${order.tokenAmount}% of holdings`}
                      </div>
                      
                      <div className="text-neutral-300">
                        <span className="text-neutral-500">Triggered at:</span>{' '}
                        MC {order.direction === 'Above' ? '≥' : '≤'}{' '}
                        <span className="font-semibold text-white">
                          ${Number(order.targetMC).toLocaleString()}
                        </span>
                      </div>
                      
                      {order.createdAt && (
                        <div className="text-xs text-neutral-500">
                          Created: {new Date(order.createdAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <a
                    href={`https://solscan.io/account/${order.tokenAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm font-semibold transition-colors"
                  >
                    🔍 View Token
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelled/Failed Orders */}
      {cancelledOrders.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-500 mb-3">
            🚫 Cancelled/Failed Orders ({cancelledOrders.length})
          </h3>
          <div className="space-y-2">
            {cancelledOrders.map(order => (
              <div
                key={order.id}
                className="bg-neutral-900/30 border border-neutral-800 rounded-lg p-3 text-sm opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div className="text-neutral-400">
                    <span className={order.type === 'Buy' ? 'text-green-500' : 'text-red-500'}>
                      {describeOrderType(order)}
                    </span>
                    {' '}
                    {order.type === 'Buy' 
                      ? `${order.solAmount} SOL` 
                      : `${order.tokenAmount}%`}
                    {' '}
                    at MC {order.direction === 'Above' ? '≥' : '≤'} ${Number(order.targetMC).toLocaleString()}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {order.status === 'Failed' ? '⚠️ Failed' : '🚫 Cancelled'}
                  </span>
                </div>
                {order.failureReason && (
                  <div className="mt-2 text-xs text-red-400">
                    {order.failureReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {orders.length === 0 && !loading && (
        <div className="text-center py-12 text-neutral-500">
          <div className="text-4xl mb-2">📋</div>
          <p>No limit orders yet</p>
          <p className="text-sm mt-1">Create your first limit order to see it here</p>
        </div>
      )}
    </div>
  );
}

