import { Router } from "express";
import { RunsRepository } from "../services/db.js";

export function createRunsRouter(repo: RunsRepository) {
  const router = Router();

  router.get("/", (req, res) => {
    const runs = repo.list(100);
    return res.json(runs);
  });

  router.get("/:id", (req, res) => {
    const run = repo.get(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, message: "Run not found" });
    }
    return res.json(run);
  });

  return router;
}
