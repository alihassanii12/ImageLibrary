import express from "express";
import sendOtp from "../controller/sendOTP.js";
import verifyOtp from "../controller/verifyOTP.js";
import resetPassword from "../controller/resetPassword.js";

const forgotRouter = express.Router();

forgotRouter.post("/send-otp", sendOtp);
forgotRouter.post("/verify-otp", verifyOtp);
forgotRouter.post("/reset-password", resetPassword);

export default forgotRouter;
