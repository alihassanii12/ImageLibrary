import { sendSupportMail } from "../config/supportMail.js"; // named export

const createSupportTicket = async (req, res) => {
  try {
    const { name, email, message, user_id } = req.body;
    const pool = req.app.locals.pgPool;

    // Validate
    if (!name || !email || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Save ticket to DB
    const result = await pool.query(
      `INSERT INTO support_tickets (user_id, name, email, message, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, user_id, name, email, message, created_at`,
      [user_id || null, name, email, message]
    );

    // ✅ Send confirmation email
    await sendSupportMail(email, name, message);

    res.json({ message: "Support ticket submitted ✅ and email sent ✅", ticket: result.rows[0] });
  } catch (err) {
    console.error("Support Ticket Error:", err);
    res.status(500).json({ message: "Failed to submit support ticket or send email" });
  }
};

const getSupportTickets = async (req, res) => {
  try {
    const pool = req.app.locals.pgPool;

    const result = await pool.query(
      "SELECT id, user_id, name, email, message, created_at FROM support_tickets ORDER BY created_at DESC"
    );

    res.json({ tickets: result.rows });
  } catch (err) {
    console.error("Fetch Tickets Error:", err);
    res.status(500).json({ message: "Failed to fetch tickets" });
  }
};

export { createSupportTicket, getSupportTickets };