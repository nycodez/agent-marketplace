import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createId, getStore, nowIso, type SessionRecord, type StoredUser } from "../services/store.js";

export const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, passwordHash: string) => {
  const [salt, originalHash] = passwordHash.split(":");
  const candidateHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(candidateHash, "hex"));
};

export const createSession = ({
  user,
  organizationId,
  workspaceId,
}: {
  user: StoredUser;
  organizationId: string;
  workspaceId: string;
}) => {
  const session: SessionRecord = {
    token: createId("session"),
    userId: user.id,
    organizationId,
    workspaceId,
    createdAt: nowIso(),
  };
  getStore().sessions.push(session);
  return session;
};

export const getSessionFromRequest = (request: FastifyRequest) => {
  const header = request.headers.authorization;
  const token =
    header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : request.headers["x-session-token"];

  if (!token || Array.isArray(token)) {
    return null;
  }

  return getStore().sessions.find((session) => session.token === token) ?? null;
};

export const requireSession = async (request: FastifyRequest, reply: FastifyReply) => {
  const session = getSessionFromRequest(request);

  if (!session) {
    await reply.code(401).send({
      success: false,
      errors: [
        {
          rule: "auth",
          field: "authorization",
          message: "A valid session token is required.",
        },
      ],
    });
    return null;
  }

  const store = getStore();
  const user = store.users.find((candidate) => candidate.id === session.userId) ?? null;
  const organization = store.organizations.find((candidate) => candidate.id === session.organizationId) ?? null;
  const workspace = store.workspaces.find((candidate) => candidate.id === session.workspaceId) ?? null;

  if (!user || !organization || !workspace) {
    await reply.code(401).send({
      success: false,
      errors: [
        {
          rule: "auth",
          field: "authorization",
          message: "The session context is no longer valid.",
        },
      ],
    });
    return null;
  }

  return {
    session,
    user,
    organization,
    workspace,
  };
};

