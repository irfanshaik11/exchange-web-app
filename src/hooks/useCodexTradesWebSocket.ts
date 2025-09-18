import { useEffect, useRef, useState } from "react";

interface CodexTradeEvent {
  eventDisplayType: "Buy" | "Sell" | "Add";
  maker: string;
  timestamp: number;
  token0SwapValueUsd: string;
  token1SwapValueUsd: string;
  transactionHash: string;
  data: {
    amount0: string;
    amount1: string;
  };
}

interface CodexSubscriptionResponse {
  data: {
    onTokenEventsCreated: {
      events: CodexTradeEvent[];
    };
  };
}

interface CodexQueryResponse {
  data: {
    getTokenEvents: {
      items: CodexTradeEvent[];
    };
  };
}

export default function useCodexTradesWebSocket(tokenAddress: string | undefined) {
  const [trades, setTrades] = useState<CodexTradeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  // Function to fetch initial trade data using GraphQL query
  const fetchInitialTrades = async (address: string) => {
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
              getTokenEvents(
                query: {
                  address: "${address}"
                  networkId: 1399811149
                  eventType: Swap
                }
                limit: 50
              ) {
                items {
                  eventDisplayType
                  maker
                  timestamp
                  token0SwapValueUsd
                  token1SwapValueUsd
                  transactionHash
                  data {
                    ... on SwapEventData {
                      amount0
                      amount1
                    }
                  }
                }
              }
            }
          `
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: CodexQueryResponse = await response.json();
      
      if (result.data?.getTokenEvents?.items) {
        setTrades(result.data.getTokenEvents.items);
        console.log(`Fetched ${result.data.getTokenEvents.items.length} initial trades`);
      }
    } catch (err) {
      console.error('Failed to fetch initial trades:', err);
      setError('Failed to fetch initial trade data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!tokenAddress) {
      setTrades([]);
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    // First fetch initial data using query
    fetchInitialTrades(tokenAddress);

    const connectWebSocket = () => {
      try {
        // Codex GraphQL WebSocket endpoint
        const wsUrl = "wss://graph.codex.io/graphql";
        const ws = new WebSocket(wsUrl, "graphql-transport-ws");
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
          reconnectAttemptRef.current = 0;

          // Send connection init message with API key if available
          const initMessage: any = {
            type: "connection_init",
          };
          
          // Add API key to payload if available (from environment or passed as prop)
          const apiKey = process.env.NEXT_PUBLIC_CODEX_API_KEY;
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
              // Connection established, now subscribe to trade events
              const subscription = {
                id: "trades_1",
                type: "subscribe",
                payload: {
                  query: `
                    subscription onTokenEventsCreated($input: OnTokenEventsCreatedInput!) {
                      onTokenEventsCreated(input: $input) {
                        events {
                          eventDisplayType
                          maker
                          timestamp
                          token0SwapValueUsd
                          token1SwapValueUsd
                          transactionHash
                          data {
                            ... on SwapEventData {
                              amount0
                              amount1
                            }
                          }
                        }
                      }
                    }
                  `,
                  variables: {
                    input: {
                      tokenAddress: tokenAddress,
                      networkId: 1399811149 // Solana mainnet
                    }
                  },
                  extensions: {},
                  operationName: "onTokenEventsCreated"
                }
              };
              
              ws.send(JSON.stringify(subscription));
            } else if (message.type === "data" || message.type === "next") {
              // Handle trade data - both 'data' and 'next' message types contain the actual data
              const response: CodexSubscriptionResponse = message.payload;
              if (response?.data?.onTokenEventsCreated?.events) {
                const newTrades = response.data.onTokenEventsCreated.events;
                
                // Add new trades to the beginning of the list (most recent first)
                setTrades(prevTrades => {
                  const combined = [...newTrades, ...prevTrades];
                  // Remove duplicates based on transaction hash
                  const unique = combined.filter((trade, index, self) => 
                    index === self.findIndex(t => t.transactionHash === trade.transactionHash)
                  );
                  // Keep only the last 100 trades to prevent memory issues
                  return unique.slice(0, 100);
                });
              }
            } else if (message.type === "complete") {
              console.log("Subscription completed");
            } else if (message.type === "error") {
              console.error("Subscription error:", message.payload);
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

  return { trades, isConnected, error, isLoading };
}
