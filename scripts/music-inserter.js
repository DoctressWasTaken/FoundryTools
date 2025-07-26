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
        const data = await loadJson(gist_url);

        // === Extract category/subcategory combinations ===
        const categorySet = new Set();
        for (const entry of data) {
            for (const cat of entry.categories) {
                const key = cat.sub ? `${cat.cat} - ${cat.sub}` : cat.cat;
                categorySet.add(key);
            }
        }
        const categoryList = Array.from(categorySet);

        // === Create Playlist Dataset ===
        // To assign found music to, so only those categories are created.
        const playlistEntries = categorySet.reduce((acc, curr) => (acc[curr] = [], acc), {});
        console.log(playlistEntries);

        // === Create Playlist Folder ===
        let folder = game.folders.find(f => f.name === playlistFolderName && f.type === "Playlist");
        if (!folder) folder = await Folder.create({name: playlistFolderName, type: "Playlist"});

        // === Recursively find all files ===
        const files = await walkFolder(ttaFolder);

        // === Match entries to files and assign to playlists ===
        for (const entry of data) {
            const matches = matchFiles(entry, files);
            if (!matches.length) continue;

            for (const cat of entry.categories) {
                const plName = cat.sub ? `${cat.cat} - ${cat.sub}` : cat.cat;

                for (const file of matches) {
                    playlistEntries[plName].push({
                        name: extractCleanName(file.path),
                        path: file.path
                    })
                }
            }
        }

        const confirm = await new Promise((resolve) => {
            new Dialog({
                title: "Success",
                content: `
      <p>Found ${Object.keys(playlistEntries).length} categories and ${Object.values(playlistEntries).map(files => files.length).reduce((acc, curr) => acc + curr, 0)} files (including repeating entries). 
      Do you want to add them?</p>
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

            // === Add playlists to folder ===
            for (let [name, files] of Object.entries(playlistEntries)) {
                if (files.length == 0) {
                    console.log(`Found no files for ${name}. Skipping creation.`);
                } else {
                    const playlist = await ensurePlaylist(folder.id, name);
                    await playlist.createEmbeddedDocuments("PlaylistSound",
                        files.map(file => ({...file, volume: 0.8, repeat: false}))
                    );
                }
            }
        }
        ui.notifications.info("Playlists populated successfully.");
    }
})();