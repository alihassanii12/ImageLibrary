import express from "express";
import googleAuth from "../controller/googleAuth.js";

const googleRouter = express.Router();

googleRouter.post("/login", googleAuth);

export default googleRouter;
