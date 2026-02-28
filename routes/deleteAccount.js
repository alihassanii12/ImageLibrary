import express from "express";
import isAuth from "../middleware/isAuth.js";
import { sendDeleteOtp, deleteAccount } from "../controller/deleteAccount.js";

const deleteAccountRouter = express.Router();

// Send OTP
deleteAccountRouter.post("/send-otp", isAuth, sendDeleteOtp);

// Verify OTP & delete account
deleteAccountRouter.post("/confirm", isAuth, deleteAccount);

export default deleteAccountRouter;
