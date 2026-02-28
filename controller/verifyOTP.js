const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const pool = req.app.locals.pgPool;

        const otpNumber = parseInt(otp, 10);

        const user = await pool.query(
            `SELECT * FROM users 
             WHERE LOWER(email) = LOWER($1) 
             AND forget_otp = $2 
             AND forget_otp_expiry > NOW()`,
            [email, otpNumber]
        );

        if (!user.rows.length) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        await pool.query(
            `UPDATE users 
             SET is_otp_verified = true,
                 forget_otp = NULL,
                 forget_otp_expiry = NULL
             WHERE LOWER(email) = LOWER($1)`,
            [email]
        );

        res.json({ message: "OTP verified successfully" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "OTP verify failed" });
    }
};

export default verifyOtp;
