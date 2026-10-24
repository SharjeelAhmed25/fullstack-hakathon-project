import mongoose from "mongoose";

const attendanceCorrectionSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  attendance: { type: mongoose.Schema.Types.ObjectId, ref: "Attendance", required: true },
  requestedCheckIn: { type: Date, default: null },
  requestedCheckOut: { type: Date, default: null },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"], default: "PENDING" },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewComment: { type: String, default: "" }
}, { timestamps: true });
attendanceCorrectionSchema.index({ employee: 1, attendance: 1, status: 1 });

export default mongoose.model("AttendanceCorrection", attendanceCorrectionSchema);
