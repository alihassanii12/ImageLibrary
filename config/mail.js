import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// ✅ Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,          // tumhara Gmail
    pass: process.env.EMAIL_PASSWORD, // Gmail App Password
  },
});

// ✅ Send OTP function
export const sendMail = async (email, otp) => {
  try {
    await transporter.sendMail({
      from: `"Your App Name" <${process.env.EMAIL}>`,
      to: email,
      subject: "Password Reset OTP",
      html: `
        <div style="font-family: sans-serif; text-align: center;">
          <h2>Password Reset Request</h2>
          <p>Your OTP for password reset is:</p>
          <h1 style="letter-spacing: 5px;">${otp}</h1>
          <p>This OTP will expire in 5 minutes.</p>
        </div>
      `,
    });

    console.log(`✅ OTP sent to ${email}: ${otp}`);
  } catch (err) {
    console.error("❌ Email send error:", err);
    throw new Error("Email sending failed");
  }
};

export default sendMail;
