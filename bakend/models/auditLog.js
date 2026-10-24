import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actorName: { type: String, required: true },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: { type: String, default: "" },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export default mongoose.model("AuditLog", auditLogSchema);
