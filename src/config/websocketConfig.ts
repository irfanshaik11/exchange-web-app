/**
 * WebSocket Configuration 
 * 
 * This file allows to easily switch between mock and real WebSocket implementations
 * Just have to change the USE_MOCK_WEBSOCKET flag to switch between them.
 */

// Set to true to use mock data, false to use real WebSocket
export const USE_MOCK_WEBSOCKET = true;

// Set to true to use mock chart data (fallback when WebSocket is disabled)
export const USE_MOCK_CHART_DATA = true;

// websocket endpoint
export const WEBSOCKET_ENDPOINT = 'ws://localhost:8080/v1/ws/token-stats';

// Mock configuration
export const MOCK_CONFIG = {
  // Simulate connection delay (ms)
  connectionDelay: { min: 1000, max: 3000 },
  
  // Simulate update interval (ms)
  updateInterval: { min: 2000, max: 5000 },
  
  // Simulate connection issues (probability 0-1)
  connectionIssueProbability: 0.1,
  
  // Connection issue check interval (ms)
  connectionIssueCheckInterval: 30000,
};

// Export the appropriate hook based on configuration
export { useTokenStatsWebSocket } from '../hooks/useTokenStatsWebSocket';
export { useTokenStatsWebSocketMock } from '../hooks/useTokenStatsWebSocketMock';

// Main hook that switches between mock and real
export const useTokenStatsWebSocketMain = USE_MOCK_WEBSOCKET 
  ? require('../hooks/useTokenStatsWebSocketMock').useTokenStatsWebSocketMock
  : require('../hooks/useTokenStatsWebSocket').useTokenStatsWebSocket;
