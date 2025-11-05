import { env } from "../env";

export interface BuildTradeRequest {
  poolType?: string;
  baseMint: string;
  quoteMint: string;
  amount: number;
  slippage?: number;
  priorityFee?: number;
  bribe?: number;
  mevMode?: "off" | "reduced" | "on";
}

export interface BuildTradeResponse {
  unsignedTx: string;
  recentBlockhash: string;
  signer: string;
  feeSummary: {
    treasuryFeeLamports: number;
    tipLamports: number;
  };
  quote?: any;
  meta: {
    poolType: string;
    inputMint: string;
    outputMint: string;
  };
}

export async function buildUnsignedTrade(
  payload: BuildTradeRequest,
  token: string
): Promise<BuildTradeResponse> {
  const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/build`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data?.message || "Failed to build trade transaction");
    (error as any).code = data?.error;
    (error as any).details = data;
    throw error;
  }

  return response.json();
}
