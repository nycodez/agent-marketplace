"use client";

export const SESSION_TOKEN_KEY = "agent-marketplace-token";
export const SESSION_CONTEXT_KEY = "agent-marketplace-session";

export const getSessionToken = () => localStorage.getItem(SESSION_TOKEN_KEY);

export const clearSession = () => {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_CONTEXT_KEY);
};
