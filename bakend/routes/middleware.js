import jwt from "jsonwebtoken";
import User from "../models/user.js";

const JWT_SECRET = process.env.JWT_SECRET;

export async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Please sign in to continue." });
  }
  try {
    const payload = jwt.verify(authorization.slice(7), JWT_SECRET);
    const user = await User.findOne({ _id: payload.userId, isActive: { $ne: false } });
    if (!user) return res.status(401).json({ message: "This account is unavailable." });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    }
    return next(error);
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }
    return next();
  };
}

export async function audit(actor, action, entity, entityId, details = {}) {
  const AuditLog = (await import("../models/auditLog.js")).default;
  await AuditLog.create({ actor: actor._id, actorName: actor.name, action, entity, entityId: String(entityId), details });
}
