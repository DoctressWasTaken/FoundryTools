import os

import pandas as pd
import requests
import io

# === CONFIG ===
SHEET_ID = os.environ.get('SHEET_ID')
TAB_NAME = os.environ.get('TAB_NAME')
if not SHEET_ID or not TAB_NAME:
    raise Exception("SHEET_ID and TAB_NAME must be set")


# === DOWNLOAD CSV ===
url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={TAB_NAME}"
response = requests.get(url)
response.raise_for_status()
csv_data = response.content.decode("utf-8")

# === LOAD INTO DATAFRAME ===
df = pd.read_csv(io.StringIO(csv_data), header=None)

# === PARSE CATEGORY HEADERS ===
category_row = df.iloc[1]  # second row
subcategory_row = df.iloc[2]  # third row

# propagate main categories to the right
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
        cell = str(row[col]).strip()
        if cell:
            try:
                val = int(cell)
            except ValueError:
                continue
            cat, sub = categories[col]
            cat_ratings.append({
                "cat": cat,
                "sub": sub,
                "rating": val
            })

    songs.append({
        "name": name,
        "track_number": track_number,
        "favorite": favorite,
        "categories": cat_ratings
    })

# === RESULT ===
print(songs)
