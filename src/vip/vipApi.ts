export type VipSummary = {
  cardType: "day" | "month" | "year" | "permanent" | null;
  expiresAt: string | null;
  active: boolean;
};

export type VipRedeemResponse = {
  vip: VipSummary;
  redeemedCode: {
    id: string;
    cardType: "day" | "month" | "year" | "permanent";
    status: string;
    redeemedAt: string | null;
  };
};

export class VipApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "VipApiError";
    this.status = status;
    this.code = code;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

async function request<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init.headers
    }
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new VipApiError(body?.error?.message ?? body?.message ?? "VIP 服务暂时不可用。", response.status, body?.error?.code ?? body?.code);
  }

  return (body?.data ?? body) as T;
}

export const vipApi = {
  getMyVip(accessToken: string) {
    return request<VipSummary>("/vip/me", { method: "GET" }, accessToken);
  },
  redeem(accessToken: string, code: string) {
    return request<VipRedeemResponse>(
      "/vip/activation-codes/redeem",
      {
        method: "POST",
        body: JSON.stringify({ code })
      },
      accessToken
    );
  }
};

