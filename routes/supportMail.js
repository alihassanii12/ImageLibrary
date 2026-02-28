// routes/supportRoutes.js
import express from "express";
import { createSupportTicket, getSupportTickets } from "../controller/support.js";

const router = express.Router();

// POST /support - create new ticket
router.post("/", createSupportTicket);

// GET /support - fetch all tickets
router.get("/", getSupportTickets);

export default router;