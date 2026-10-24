import mongoose from "mongoose";

const payrollItemSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  department: { type: String, default: "" },
  basic: { type: Number, required: true },
  gross: { type: Number, required: true },
  absentDays: { type: Number, default: 0 },
  halfDays: { type: Number, default: 0 },
  unpaidDays: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  net: { type: Number, required: true }
});

const payrollRunSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true },
  status: { type: String, enum: ["DRAFT", "FINALIZED"], default: "DRAFT" },
  items: { type: [payrollItemSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  finalizedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model("PayrollRun", payrollRunSchema);
