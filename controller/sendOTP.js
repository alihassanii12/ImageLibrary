import sendMail from "../config/mail.js";

const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const pool = req.app.locals.pgPool;

    // 1️⃣ Check if user exists
    const userResult = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2️⃣ Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // 3️⃣ Store OTP in DB (forget password columns)
    await pool.query(
      `UPDATE users 
       SET forget_otp=$1, forget_otp_expiry=NOW() + INTERVAL '10 minutes' 
       WHERE email=$2`,
      [otp, email]
    );

    // 4️⃣ Send OTP via email
    await sendMail(
      email,
      `Your OTP is ${otp}. It is valid for 10 minutes.`
    );

    // 5️⃣ Respond success
    res.json({ message: "OTP sent to your email ✅" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
};

export default sendOtp;
