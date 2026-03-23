"use client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_WEB_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4001";

const SESSION_TOKEN_KEY = "agent-marketplace-token";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  errors?: Array<{
    message?: string;
  }>;
};

export const getSessionToken = () => localStorage.getItem(SESSION_TOKEN_KEY);

export const apiFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const token = getSessionToken();
  if (!token) {
    throw new Error("You are not logged in.");
  }

  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);

  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.errors?.[0]?.message ?? "Request failed.");
  }

  return payload.data;
};
