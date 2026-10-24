import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, default: null },
  status: { type: String, enum: ["PRESENT", "LATE", "HALF_DAY", "MISSING_CHECKOUT"], required: true },
  hoursWorked: { type: Number, default: 0 }
}, { timestamps: true });
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);
