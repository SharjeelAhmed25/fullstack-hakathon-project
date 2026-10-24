import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z][A-Z0-9_]{1,29}$/ },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  days: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"], default: "PENDING" },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewComment: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.model("LeaveRequest", leaveRequestSchema);
