import bcrypt from "bcrypt";

const resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body;
    const pool = req.app.locals.pgPool;

    const userResult = await pool.query(
      "SELECT is_otp_verified FROM users WHERE email=$1",
      [email]
    );

    if (!userResult.rows.length) return res.status(404).json({ message: "User not found" });
    if (!userResult.rows[0].is_otp_verified) return res.status(400).json({ message: "OTP verification required" });

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE users SET password=$1, is_otp_verified=false WHERE email=$2`,
      [hashed, email]
    );

    res.json({ message: "Password reset successful ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Password reset failed" });
  }
};

export default resetPassword;
