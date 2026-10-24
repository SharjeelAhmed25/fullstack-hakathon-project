import mongoose from "mongoose";

const aiLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, enum: ["CHAT", "SUMMARY", "SMART_LEAVE"], required: true },
  outcome: { type: String, enum: ["SUCCESS", "FALLBACK", "ERROR"], required: true },
  inputLength: { type: Number, min: 0, default: 0 },
  provider: { type: String, default: "local" }
}, { timestamps: true });
aiLogSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("AiLog", aiLogSchema);
