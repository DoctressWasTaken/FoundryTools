import os
import json

import pandas as pd
import numpy as np
import requests
import io
from dotenv import load_dotenv

load_dotenv()
load_dotenv('secrets.env')

# === CONFIG ===
SHEET_ID = os.environ.get('SHEET_ID')
SHEET_GID = os.environ.get('SHEET_GID')
if not SHEET_ID or not SHEET_GID:
    raise Exception("SHEET_ID and SHEET_GID must be set")

# === DOWNLOAD INTO DATAFRAME ===
url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}"
df = pd.read_csv(url, header=None)

# === PARSE CATEGORY HEADERS ===
category_row = df.iloc[1]  # second row
subcategory_row = df.iloc[2]  # third row

# === PROPAGATE CATEGORIES ===
current_cat = ""
categories = []
for i in range(len(category_row)):
    if pd.notna(category_row[i]):
        current_cat = category_row[i]
    subcat = subcategory_row[i]
    categories.append((current_cat.strip(), str(subcat).strip()))

# === PROCESS SONGS ===
songs = []
for idx in range(3, len(df)):
    row = df.iloc[idx]
    if pd.isna(row[3]):
        continue  # skip empty song name rows

    occurrences = int(row[0]) if pd.notna(row[0]) else None
    if occurrences == 0:
        continue
    favorite = str(row[1]).strip().lower() == "x"
    track_number = int(row[2]) if pd.notna(row[2]) else None
    name = str(row[3]).strip()

    cat_ratings = []
    for col in range(4, len(row)):
        cell = row[col]
        is_fav = False
        if str(cell).strip().lower() == 'x':
            is_fav = True
        elif pd.isna(cell):
            continue
        cat, sub = categories[col]
        if sub == 'nan':
            sub = None
        try:
            rating = int(cell)
        except ValueError:
            rating = 0
        cat_ratings.append({
            "cat": cat,
            "sub": sub,
            "rating": rating,
            "favorite": is_fav
        })
    songs.append({
        "name": name,
        "track_number": track_number,
        "favorite": favorite,
        "categories": cat_ratings
    })

# === EXPORT TO GIST ===
GIST_SONG_MAPPING = os.environ.get("GIST_SONG_MAPPING")
GIST_GH_TOKEN = os.environ.get("GIST_GH_TOKEN")
if not GIST_SONG_MAPPING or not GIST_GH_TOKEN:
    raise Exception("GIST_SONG_MAPPING and GIST_GH_TOKEN must be set")

filename = "song-mapping.json"

new_content = json.dumps(songs, indent=2)

response = requests.patch(
    f"https://api.github.com/gists/{GIST_SONG_MAPPING}",
    headers={
        "Authorization": f"token {GIST_GH_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    },
    json={
        "files": {
            filename: {"content": new_content}
        }
    }
)

response.raise_for_status()
print("Gist updated.")
