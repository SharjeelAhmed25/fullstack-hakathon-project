import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, maxlength: 150 },
  body: { type: String, required: true, maxlength: 500 },
  type: { type: String, enum: ["ANNOUNCEMENT", "LEAVE", "ATTENDANCE", "PAYROLL", "SYSTEM"], default: "SYSTEM" },
  link: { type: String, default: "" },
  readAt: { type: Date, default: null }
}, { timestamps: true });
notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
