const MODULE_ID = "folder-api";

/**
 * Public API:
 *   await game.modules.get("folder-parent-api").api.setParent(childId, parentId)
 *   // pass parentId = null to move the child to root
 */
Hooks.once("init", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { setParent };
});

/**
 * Set a folder's parent (v13: field is `folder`, not `parent`).
 * @param {string} childId
 * @param {string|null} parentId  null => root
 * @returns {Promise<Folder>}
 */
async function setParent(childId, parentId) {
  const child = _getFolder(childId, "child");
  const parent = parentId ? _getFolder(parentId, "parent") : null;

  // Type guard: folders must hold the same document type
  if (parent && parent.type !== child.type) {
    throw new Error(`Type mismatch: child=${child.type}, parent=${parent.type}`);
  }

  // No-op?
  if ((child.folder?.id ?? null) === (parent?.id ?? null)) return child;

  // Cycle guard: ensure parent isn't the child or its descendant
  if (parent && _isDescendant(parent, child)) {
    throw new Error("Invalid re-parenting: target parent is a descendant of the child (cycle).");
  }

  // v13: the parent field is "folder" (not "parent")
  return child.update({ folder: parent?.id ?? null });
}

/* ---------- helpers ---------- */

function _getFolder(id, label) {
  if (typeof id !== "string" || !id.trim()) throw new Error(`Missing ${label}Id`);
  const f = game.folders.get(id);
  if (!f) throw new Error(`Folder not found for ${label}Id=${id}`);
  return f;
}

function _isDescendant(candidate, ancestor) {
  // Walk up from candidate to root; if we hit ancestor, candidate is a descendant.
  let cur = candidate;
  while (cur?.folder) {
    if (cur.folder.id === ancestor.id) return true;
    cur = cur.folder;
  }
  return false;
}
