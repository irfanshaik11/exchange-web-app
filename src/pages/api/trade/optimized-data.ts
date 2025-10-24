import type { NextApiRequest, NextApiResponse } from 'next';
import { createTradeDataHandler } from '../../../utils/apiCache';

/**
 * Optimized trade data API route with enhanced caching
 * Provides cached trade data for the trade page with intelligent invalidation
 */
export default createTradeDataHandler();
