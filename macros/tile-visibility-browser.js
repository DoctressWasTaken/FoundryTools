// --- CONFIG ---
const IMG = 80;                 // px preview height
const FLAG_SCOPE = "world";       // where you store custom name/tags if not using Tagger

// --- guards ---
if (!canvas?.scene) return ui.notifications.warn("No active scene.");
const tiles = canvas.tiles.placeables;
if (!tiles.length) return ui.notifications.info("This scene has no tiles.");

// --- helpers (V13 safe) ---
const usingTagger = game.modules.get("tagger")?.active;
const getTags = t => usingTagger ? Tagger.getTags(t) : (t.document.getFlag(FLAG_SCOPE, "tags") ?? []);
const getName = t => t.document.getFlag(FLAG_SCOPE, "name")
  ?? (t.document.texture?.src ?? "").split("/").pop()?.replace(/\.[^/.]+$/, "") ?? "(unnamed)";
const tileById = id => canvas.tiles.placeables.find(t => t.id === id);

function makePreview(src, mutedClass, name) {
  const lower = src.toLowerCase();
  if (lower.endsWith(".webm") || lower.endsWith(".mp4")) {
    return `<video class="${mutedClass} preview" src="${src}"  autoplay loop muted playsinline title="${name}"></video>`;
  }
  return `<img class="${mutedClass} preview" src="${src}" alt="${name}">`;
}


// build rows (no <form>, no <style> here; both are sanitized out)
const rowsHtml = tiles.map(t => {
  const src = t.document.texture?.src ?? "";
  const name = foundry.utils.escapeHTML(getName(t));
  const tags = getTags(t).map(foundry.utils.escapeHTML);
  const checked = !t.document.hidden ? "checked" : "";
  const muted = t.document.hidden ? "muted" : "";
  const alpha = typeof t.document.alpha === "number" ? t.document.alpha : 1;
  const alphaPct = Math.round(alpha * 100);
  const preview = makePreview(src, muted, name);
  return `
    <div class="tile-row" data-id="${t.id}">
      <div class="left">
        ${preview}
      </div>
      <div class="details">
        <div class="name" title="${name}">${name}</div>
        <div class="tags">${tags.map(tag => `<span class="chip">${tag}</span>`).join(" ")}</div>
      </div>
      <div class="controls">
        <label class="vis">
          <span>Visible</span>
          <input class="vis-toggle" type="checkbox" ${checked} name="vis-${t.id}">
        </label>
        <div class="opacity">
          <label>Opacity</label>
          <input class="alpha-slider" type="range" min="0" max="100" value="${alphaPct}" name="alpha-${t.id}">
          <span class="alpha-val">${alphaPct}%</span>
        </div>
      </div>
      <button type="button" class="btn select">></button>
    </div>`;
}).join("");


const css = `
#tile-list-root {
	max-height: 70vh;
	overflow: auto;

	.tile-row {
		display: grid;
		grid-template-columns: 1fr 1fr 230px 30px;
		grid-template-rows: auto auto;
		gap: 8px 12px;
		padding: 8px;
		border-bottom: 1px solid var(--color-border-light-2);
		align-items: center;

		.left {
        grid-row: 1 / span 2;
			.preview {
				max-height: ${IMG * 2 + 8}px;
                max-width: ${IMG * 2 + 8}px;
				/* double height for two rows + gap */
				width: auto;
                height: auto;
				border-radius: 6px;
				object-fit: cover;
			}
            .muted {
    			opacity: .45;
				filter: grayscale(.15);
            }
		}

		.details {
			.name {
				grid-col-start: 1;
				font-weight: 600;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.tags {
				grid-col-start: 2;
				display: flex;
				flex-wrap: wrap;
				gap: 6px;
				.chip {
					font-size: 11px;
					padding: 2px 6px;
					border: 1px solid var(--color-border-light-2);
					border-radius: 999px;
					background: rgba(0, 0, 0, .05);
				}
			}
		}
        .controls {
          .vis,
          .opacity {
    		display: flex;
    		align-items: center;
    		gap: 6px;
            &.label {
              min-width: 60px;
              /* keeps label aligned */
              text-align: left;
            }

            .alpha-slider {
              width: 120px;
        	}
          }
        }
        button.btn {
          grid-column-start: 4;
          grid-row: 1 / span 2;
          height: 90%;
          margin-top: 5%;
          padding: 2px 8px;
          border: 1px solid var(--color-border-light-2);
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }
      }
	}
    

`;

const content = `
<div id="tile-list-root">
  ${rowsHtml}
</div>
`;

await foundry.applications.api.DialogV2.wait({
  window: { title: `Scene Tiles (${tiles.length})`, resizable: true, width: 660 },
  content,
  buttons: [{label: "Close"}], // no buttons
  render: (event, dialog) => {
        const styleId = "tile-list-inline-style";
    if (!dialog.element.querySelector(`#${styleId}`)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      dialog.element.appendChild(style);
    }
    const root = dialog.element.querySelector("#tile-list-root");
    if (!root) return;
    root.addEventListener("change", async (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains("vis-toggle")) return;
      const row = input.closest(".tile-row");
      const id = row?.dataset.id;
      const tile = id && canvas.tiles.placeables.find(t => t.id === id);
      if (!tile) return;

      const hidden = !input.checked;
      try {
        await tile.document.update({ hidden });
        row.querySelector("img")?.classList.toggle("muted", hidden);
      } catch (err) {
        console.error(err);
        ui.notifications.error("Failed to update tile visibility.");
        input.checked = !hidden; // revert on failure
      }
    });

        // Opacity slider (use 'input' for live feedback)
    root.addEventListener("input", async (ev) => {
      const slider = ev.target;
      if (!(slider instanceof HTMLInputElement) || !slider.classList.contains("alpha-slider")) return;

      const row = slider.closest(".tile-row");
      const tile = row && tileById(row.dataset.id);
      if (!tile) return;

      const pct = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
      const alpha = Math.max(0, Math.min(1, pct / 100));

      // update label and local preview immediately
      row.querySelector(".alpha-val").textContent = `${pct}%`;
      try {
        await tile.document.update({ alpha }); // TileDocument.alpha persists opacity
      } catch (err) {
        ui.notifications.error("Failed to update tile opacity (permissions?).");
      }
    });

    // Select the tile
    root.addEventListener("click", (ev) => {
  const btn = ev.target;
  if (!(btn instanceof HTMLButtonElement) || !btn.classList.contains("select")) return;

  ev.preventDefault();
  const row = btn.closest(".tile-row");
  const id = row?.dataset.id;
  const tile = id && canvas.tiles.placeables.find(t => t.id === id);
  if (!tile) return;

  // Make sure Tiles layer is active, then select the tile
  canvas.tiles.activate();
  tile.control({ releaseOthers: true });

  // Optional: quick pan to center the selected tile
  const c = tile.center ?? { x: tile.document.x + tile.document.width / 2, y: tile.document.y + tile.document.height / 2 };
  canvas.animatePan({ x: c.x, y: c.y, duration: 250 });
});
  }
});