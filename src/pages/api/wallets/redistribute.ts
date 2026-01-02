import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    return res.status(500).json({ error: "Backend URL not configured" });
  }

  try {
    const paths = [
      `${backendUrl}/api/users/wallet/redistribute`,
      `${backendUrl}/api/wallets/redistribute`,
    ];

    let lastStatus = 500;
    let lastData: any = { error: "Unknown error" };

    for (const url of paths) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization || "",
          cookie: req.headers.cookie || "",
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json().catch(() => ({}));
      lastStatus = response.status;
      lastData = data;

      if (response.status !== 404) {
        return res.status(response.status).json(data);
      }
    }

    return res.status(lastStatus).json(lastData);
  } catch (error: any) {
    console.error("Wallet redistribute proxy failed:", error);
    return res.status(500).json({ error: "Proxy request failed", details: error?.message });
  }
}
