// utils/sendSupportMail.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,          // tumhara Gmail
    pass: process.env.EMAIL_PASSWORD, // Gmail App Password
  },
});

// ✅ Support Ticket Confirmation Email
export const sendSupportMail = async (email, name, message) => {
  try {
    await transporter.sendMail({
      from: `"Your App Name" <${process.env.EMAIL}>`,
      to: email,
      subject: "Support Request Received",
      html: `
        <div style="font-family: sans-serif;">
          <p>Hi ${name},</p>
          <p>We received your support request:</p>
          <blockquote>${message}</blockquote>
          <p>We will get back to you soon!</p>
        </div>
      `,
    });

    console.log(`✅ Support email sent to ${email}`);
  } catch (err) {
    console.error("❌ Support Email send error:", err);
    throw new Error("Support Email sending failed");
  }
};

export default sendSupportMail;