# DbD Video Recommender

A locally-hosted web app for generating Dead by Daylight YouTube video ideas using Gemini.

## Setup

1. **Unzip** this folder anywhere on your PC.
2. **Open `index.html`** directly in your browser (Chrome or Edge recommended).
   - No server needed. Just double-click the file or drag it into a browser tab.
3. **Set your API Key** — click **⚙ API Key** in the top right and paste your Gemini key.
   - Key is saved in `localStorage` and persists between sessions.

## Usage

### Survivor Tab
- Describe the kind of survivor content you want and click **Generate Video Ideas**.
- Works well with prompts like:
  - "aggressive looping meta builds"
  - "beginner guide for new players"
  - "no-perk challenge fun run"

### Killer Tab
- Select a killer from the dropdown (full current roster loaded on page).
- The killer's power is shown below the dropdown for context.
- Fill in the **build request** text box, e.g.:
  - "oppressive gen-regression snowball build"
  - "meme build for YouTube entertainment"
- Or toggle **Surprise Me** to let Gemini creatively pick a fun build.
- Click **Generate Build Ideas** for 3 full builds with perks, add-ons, and video pitches.

## Notes

- Uses **Gemini 2.0 Flash Lite** (`gemini-2.0-flash-lite`).
- Killer list is compiled from the full 2025 roster. If a new killer gets added to the game and isn't in the dropdown, the existing list in `killers.js` can be manually extended.
- No data is sent anywhere except directly to the Gemini API.
