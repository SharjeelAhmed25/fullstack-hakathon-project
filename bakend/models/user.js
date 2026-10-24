import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["ADMIN", "HR", "EMPLOYEE"], default: "EMPLOYEE" },
  employeeCode: { type: String, trim: true, default: undefined, unique: true, sparse: true },
  department: { type: String, trim: true, default: "" },
  designation: { type: String, trim: true, default: "" },
  basicSalary: { type: Number, min: 0, default: 0 },
  phone: { type: String, trim: true, default: "" },
  address: { type: String, trim: true, default: "" },
  joinedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  passwordChangeRequired: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
