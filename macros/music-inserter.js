// === CONFIG (assumed set externally) ===
const gist_url = "https://gist.githubusercontent.com/DoctressWasTaken/7595154c578821f3234ac9b4464f7c1c/raw/song-mapping.json";
let playlistFolderName = "TTA / Regal Goblins";
const ttaFolder = "assets/Audio/tracks";

const normalize = (str) => str.toLowerCase().replace(/[\s_]+/g, "");

const loadJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch JSON: ${res.status}`);
    return res.json();
};

const walkFolder = async (folderPath) => {
    const {files, dirs} = await FilePicker.browse("data", folderPath);
    let results = [...files.map(f => ({path: f, name: f.split("/").pop()}))];
    for (const sub of dirs) {
        results.push(...await walkFolder(sub));
    }
    return results;
};

const matchFiles = (entry, files) => {
    const trackStr = String(entry.track_number).padStart(3, "0");
    const normName = normalize(entry.name);
    return files.filter(f => {
        const name = f.name.toLowerCase();
        return name.startsWith(trackStr) && normalize(name).includes(normName);
    });
};

const ensurePlaylist = async (folderId, name) => {
    const existing = game.playlists.contents.find(p => p.name === name && p.folder?.id === folderId);
    return existing || Playlist.create({name, folder: folderId, sortMode: "m"});
};

const buildTreeHtml = (mainName, categorySet) => {
    const lines = [`<ul><li><strong>${mainName}</strong><ul>`];

    for (const [cat, catData] of Object.entries(categorySet)) {
        if (!catData.files.length) {
            lines.push(`<li>${cat}`); // Include the number of entries only if entries exist
        } else {
            lines.push(`<li>${cat} (${catData.files.length})`);
        }
        const subcats = catData.subcategories;

        if (subcats && Object.keys(subcats).length > 0) {
            lines.push(`<ul>`);
            for (const [sub, subData] of Object.entries(subcats)) {
                lines.push(`<li>${sub} (${subData.files.length})</li>`);
            }
            lines.push(`</ul>`);
        }

        lines.push(`</li>`);
    }

    lines.push(`</ul></li></ul>`);
    return lines.join("\n");
};

function extractCleanName(path) {
    const rawName = path.split("/").pop();         // Get file name
    const noExt = rawName.replace(/\.[^/.]+$/, ""); // Strip extension
    const clean = noExt.replace(/_/g, " ");         // Replace underscores
    return clean.trim();
}


(async () => {
    const result = await new Promise((resolve) => {
        new Dialog({
            title: "Playlist Folder Name",
            content: `
      <p>What do you want to call your playlist folder?</p>
      <input id="note-input" value="${playlistFolderName}" type="text" style="width:100%; margin-bottom: 8px;">
    `,
            buttons: {
                ok: {
                    label: "OK",
                    callback: (html) => {
                        const value = html.find("#note-input").val();
                        console.log("User entered:", value);
                        resolve(value);
                    }
                },
                cancel: {
                    label: "Cancel"
                }
            },
            default: "ok"
        }).render(true);
    });
    if (result !== null) {
        playlistFolderName = result;
        console.log("Generating playlist.")
        // === Load JSON from gist ===
        const mapping = await loadJson(gist_url);

        // === Recursively find all files ===
        const files = await walkFolder(ttaFolder);

        // === Extract category/subcategory combinations ===
        const categorySet = {};
        for (const item of mapping) {
            for (const cat_data of item.categories) {
                if (!Object.keys(categorySet).includes(cat_data.cat)) {
                    categorySet[cat_data.cat] = {
                        items: [],
                        files: [],
                        subcategories: {},
                        folder: null
                    }
                }
                if (cat_data.sub) {
                    if (!Object.keys(categorySet[cat_data.cat].subcategories).includes(cat_data.sub)) {
                        categorySet[cat_data.cat].subcategories[cat_data.sub] = {
                            items: [],
                            files: [],
                            folder: null
                        }
                    }
                    categorySet[cat_data.cat].subcategories[cat_data.sub].items.push(item);
                } else {
                    categorySet[cat_data.cat].items.push(item);
                }
            }
        }
        // Define internal structure
        for (const [category, meta] of Object.entries(categorySet)) {

            // Find corresponding files
            let matchingFiles = [];
            meta.items.forEach(item => matchingFiles.push(...matchFiles(item, files)));
            categorySet[category].files = matchingFiles;

            for (const [subcategory, sub_meta] of Object.entries(meta.subcategories)) {
                // Find corresponding files
                let matchingFiles = [];
                sub_meta.items.forEach(item => matchingFiles.push(...matchFiles(item, files)));
                categorySet[category].subcategories[subcategory].files = matchingFiles;

            }
        }
        console.log(categorySet);

        const confirm = await new Promise((resolve) => {
            new Dialog({
                title: "Success",
                content: `
      <p>Creating the following tree structure:</p>
      ${buildTreeHtml(playlistFolderName, categorySet)}
    `,
                buttons: {
                    ok: {
                        label: "OK",
                        callback: (html) => {
                            resolve('ok');
                        }
                    },
                    cancel: {
                        label: "Cancel"
                    }
                },
                default: "ok"
            }).render(true);
        });

        if (confirm !== null) {
            // === Create Main Playlist Folder ===
            let mainFolder = game.folders.find(f => f.name === playlistFolderName && f.type === "Playlist");
            if (!mainFolder) mainFolder = await Folder.create({name: playlistFolderName, type: "Playlist"});
            console.log(mainFolder);
            console.log(mainFolder.id);
            for (let [category, meta] of Object.entries(categorySet)) {
                // Creates the category folder
                let categoryFolder = game.folders.find(f => f.name === category && f.type === "Playlist" && f.parent === mainFolder.id);
                if (!categoryFolder) categoryFolder = await Folder.create({
                    name: category,
                    type: "Playlist",
                    parent: mainFolder
                });
                categorySet[category].folder = categoryFolder;
                for (const [subcategory, sub_meta] of Object.entries(meta.subcategories)) {
                    let subcategoryFolder = game.folders.find(f => f.name === category && f.type === "Playlist" && f.parent === categoryFolder.id);
                    if (!subcategoryFolder) subcategoryFolder = await Folder.create({
                        name: subcategory,
                        type: "Playlist",
                        parent: categoryFolder.id
                    });
                    categorySet[category][subcategory].folder = subcategoryFolder;
                }
            }
            return
            // === Add playlists to folder ===
            for (let [name, files] of Object.entries(playlistEntries)) {
                if (files.length == 0) {
                    console.log(`Found no files for ${name}. Skipping creation.`);
                } else {
                    const playlist = await ensurePlaylist(mainFolder.id, name);
                    await playlist.createEmbeddedDocuments("PlaylistSound",
                        files.map(file => ({...file, volume: 0.8, repeat: false}))
                    );
                }
            }
        }
        ui.notifications.info("Playlists populated successfully.");
    }
})();