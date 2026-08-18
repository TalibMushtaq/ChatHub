import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import {
  roomIdParamSchema,
  categoryIdParamSchema,
  createCategorySchema,
  updateCategorySchema,
  reorderSchema,
} from "@repo/validators";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from "../../services/room/categories";

const router = Router();

// POST /rooms/:roomId/categories
router.post(
  "/rooms/:roomId/categories",
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId = roomIdParamSchema.parse(req.params).roomId;
    const input = createCategorySchema.parse(req.body);
    const category = await createCategory(req.user!.id, roomId, input);
    res.status(201).json({ ok: true, category });
  }),
);

// PATCH /rooms/:roomId/categories/:categoryId
router.patch(
  "/rooms/:roomId/categories/:categoryId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, categoryId } = {
      ...roomIdParamSchema.parse(req.params),
      ...categoryIdParamSchema.parse(req.params),
    };
    const input = updateCategorySchema.parse(req.body);
    const category = await updateCategory(
      req.user!.id,
      roomId,
      categoryId,
      input,
    );
    res.json({ ok: true, category });
  }),
);

// DELETE /rooms/:roomId/categories/:categoryId
// Moves contained channels to "Uncategorized" rather than deleting them.
router.delete(
  "/rooms/:roomId/categories/:categoryId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, categoryId } = {
      ...roomIdParamSchema.parse(req.params),
      ...categoryIdParamSchema.parse(req.params),
    };
    await deleteCategory(req.user!.id, roomId, categoryId);
    res.json({ ok: true });
  }),
);

// PATCH /rooms/:roomId/categories/reorder
router.patch(
  "/rooms/:roomId/categories/reorder",
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId = roomIdParamSchema.parse(req.params).roomId;
    const { orderedIds } = reorderSchema.parse(req.body);
    await reorderCategories(req.user!.id, roomId, orderedIds);
    res.json({ ok: true });
  }),
);

export default router;
