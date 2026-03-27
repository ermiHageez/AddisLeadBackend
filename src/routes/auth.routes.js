import { Router } from "express";
import { register, login, refresh } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh", refresh);
router.get("/me", authenticate, (req, res) => {
  res.status(200).json({ message: "Access granted to protected route", user: req.user });
})

export default router;  
