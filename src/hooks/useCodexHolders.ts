import { useState, useEffect, useRef } from 'react';

interface CodexHolder {
  address: string;
  tokenAmountBought30d: string;
  tokenAmountSold30d: string;
  amountBoughtUsd30d: string;
  amountSoldUsd30d: string;
  realizedProfitUsd30d: string;
  realizedProfitPercentage30d: number;
  tokenBalance: string;
  tokenAcquisitionCostUsd: string;
  buys30d: number;
  sells30d: number;
  firstTransactionAt: number;
  lastTransactionAt: number;
}

interface CodexHoldersResponse {
  data: {
    filterTokenWallets: {
      results: CodexHolder[];
    };
  };
}

interface HolderBalanceUpdate {
  address: string;
  balance: string;
}

interface HoldersUpdatedResponse {
  data: {
    onHoldersUpdated: {
      balances: HolderBalanceUpdate[];
    };
  };
}

interface TokenEventsResponse {
  data: {
    onTokenEventsCreated: {
      events: Array<{
        eventDisplayType: string;
        maker: string;
        taker: string;
        amount: string;
        price: string;
        timestamp: string;
        token0SwapValueUsd: string;
      }>;
    };
  };
}

export default function useCodexHolders(tokenAddress: string | undefined) {
  const [holders, setHolders] = useState<CodexHolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Function to fetch initial holders data
  const fetchHolders = async (address: string) => {
    try {
      setIsLoading(true);
      const apiKey = process.env.NEXT_PUBLIC_CODEX_API_KEY;
      
      const response = await fetch('https://graph.codex.io/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey || '',
        },
        body: JSON.stringify({
          query: `
            query {
              filterTokenWallets(input: {
                tokenId: "${address}:1399811149"
                limit: 50
              }) {
                results {
                  address
                  tokenAmountBought30d
                  tokenAmountSold30d
                  amountBoughtUsd30d
                  amountSoldUsd30d
                  realizedProfitUsd30d
                  realizedProfitPercentage30d
                  tokenBalance
                  tokenAcquisitionCostUsd
                  buys30d
                  sells30d
                  firstTransactionAt
                  lastTransactionAt
                }
              }
            }
          `
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: CodexHoldersResponse = await response.json();
      
      if (result.data?.filterTokenWallets?.results) {
        setHolders(result.data.filterTokenWallets.results);
        console.log(`Fetched ${result.data.filterTokenWallets.results.length} holders`);
      }
    } catch (err) {
      console.error('Failed to fetch holders:', err);
      setError('Failed to fetch holders data');
    } finally {
      setIsLoading(false);
    }
  };

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!tokenAddress) {
      setHolders([]);
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    // First fetch initial data
    fetchHolders(tokenAddress);

    const connectWebSocket = () => {
      try {
        const wsUrl = "wss://graph.codex.io/graphql";
        const ws = new WebSocket(wsUrl, "graphql-transport-ws");
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
          reconnectAttemptRef.current = 0;

          const apiKey = process.env.NEXT_PUBLIC_CODEX_API_KEY;
          const initMessage: any = {
            type: "connection_init",
          };
          
          if (apiKey) {
            initMessage.payload = {
              Authorization: apiKey,
              headers: {
                Authorization: apiKey,
              },
            };
          } else {
            initMessage.payload = {};
          }
          
          ws.send(JSON.stringify(initMessage));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === "connection_ack") {
              // Subscribe to holders balance updates
              const balanceSubscription = {
                id: "holders_1",
                type: "subscribe",
                payload: {
                  query: `
                    subscription {
                      onHoldersUpdated(tokenId: "${tokenAddress}:1399811149") {
                        balances {
                          address
                          balance
                        }
                      }
                    }
                  `,
                  extensions: {},
                  operationName: "onHoldersUpdated"
                }
              };
              
              // Subscribe to trade events for real-time bought/sold updates
              const tradeSubscription = {
                id: "holders_2",
                type: "subscribe",
                payload: {
                  query: `
                    subscription {
                      onTokenEventsCreated(input: {
                        tokenAddress: "${tokenAddress}"
                        networkId: 1399811149
                      }) {
                        events {
                          eventDisplayType
                          maker
                          token0SwapValueUsd
                          token1SwapValueUsd
                        }
                      }
                    }
                  `,
                  extensions: {},
                  operationName: "onTokenEventsCreated"
                }
              };
              
              ws.send(JSON.stringify(balanceSubscription));
              ws.send(JSON.stringify(tradeSubscription));
            } else if (message.type === "data" || message.type === "next") {
              // Handle holders balance updates
              const holdersResponse: HoldersUpdatedResponse = message.payload;
              if (holdersResponse?.data?.onHoldersUpdated?.balances) {
                const balanceUpdates = holdersResponse.data.onHoldersUpdated.balances;
                
                // Update holders with new balance data
                setHolders(prevHolders => {
                  return prevHolders.map(holder => {
                    const update = balanceUpdates.find(update => update.address === holder.address);
                    if (update) {
                      return {
                        ...holder,
                        tokenBalance: update.balance
                      };
                    }
                    return holder;
                  });
                });
                
                console.log(`Updated ${balanceUpdates.length} holder balances`);
              }
              
              // Handle trade events for real-time bought/sold updates
              const eventsResponse: TokenEventsResponse = message.payload;
              if (eventsResponse?.data?.onTokenEventsCreated?.events) {
                const tradeEvents = eventsResponse.data.onTokenEventsCreated.events;
                
                // Update holders with new trade data
                setHolders(prevHolders => {
                  return prevHolders.map(holder => {
                    const holderTrades = tradeEvents.filter(event => event.maker === holder.address);
                    
                    if (holderTrades.length > 0) {
                      // Calculate new totals (simplified - in reality you'd need more complex logic)
                      let newBoughtUsd = parseFloat(holder.amountBoughtUsd30d);
                      let newSoldUsd = parseFloat(holder.amountSoldUsd30d);
                      let newBoughtTokens = parseFloat(holder.tokenAmountBought30d);
                      let newSoldTokens = parseFloat(holder.tokenAmountSold30d);
                      let newBuys = holder.buys30d;
                      let newSells = holder.sells30d;
                      
                      holderTrades.forEach(trade => {
                        const tradeValue = parseFloat(trade.token0SwapValueUsd);
                        if (trade.eventDisplayType === 'Buy') {
                          newBoughtUsd += tradeValue;
                          newBoughtTokens += tradeValue; // Simplified
                          newBuys += 1;
                        } else if (trade.eventDisplayType === 'Sell') {
                          newSoldUsd += tradeValue;
                          newSoldTokens += tradeValue; // Simplified
                          newSells += 1;
                        }
                      });
                      
                      return {
                        ...holder,
                        amountBoughtUsd30d: newBoughtUsd.toString(),
                        amountSoldUsd30d: newSoldUsd.toString(),
                        tokenAmountBought30d: newBoughtTokens.toString(),
                        tokenAmountSold30d: newSoldTokens.toString(),
                        buys30d: newBuys,
                        sells30d: newSells,
                        lastTransactionAt: Math.floor(Date.now() / 1000)
                      };
                    }
                    return holder;
                  });
                });
                
                console.log(`Updated holders with ${tradeEvents.length} new trade events`);
              }
            } else if (message.type === "complete") {
              console.log("Holders subscription completed");
            } else if (message.type === "error") {
              console.error("Holders subscription error:", message.payload);
            }
          } catch (err) {
            console.warn('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          if (wsRef.current) {
            handleReconnect();
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setError("WebSocket connection error");
        };
      } catch (error) {
        console.error('Failed to establish WebSocket connection:', error);
        setError("Failed to establish WebSocket connection");
      }
    };

    const handleReconnect = () => {
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        setError("Maximum reconnection attempts reached. Please refresh the page.");
        return;
      }
      reconnectAttemptRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 16000);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.close();
      }
    };
  }, [tokenAddress]);

  return { holders, isLoading, error, isConnected };
}
