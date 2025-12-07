# TTRPG Session Manager

A modern web application for managing tabletop RPG campaign sessions. Built with Next.js, it allows GMs to organize their campaign materials including plans, images, audio, NPCs, monsters, and more.

## Features

- 📁 **Folder-based organization**: Select your campaign folder and the app manages all your files
- 📝 **Markdown rendering**: Beautiful rendering of your plan documents with full markdown support
- 🎵 **Smart audio management**: Background music with seamless looping and event-specific playlists
- 🖼️ **Image viewer**: Full-screen image display to show your players without spoilers
- 🔍 **Full-text search**: Quickly find content across all your documents
- 💾 **Configuration export/import**: Save your session setup and reload it anytime
- 🌐 **Fully static**: No backend required, can be deployed anywhere

## Requirements

- **Browser**: Chrome or Edge (requires File System Access API)
- **Bun**: Package manager (or npm/yarn)

## Installation

1. Clone the repository or download the source code

2. Install dependencies:
```bash
bun install
```

3. Run the development server:
```bash
bun dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Setup Mode

1. **Select Campaign Folder**: Click "Select Folder" and choose your campaign materials folder
2. **Add Parts**: Create parts for each section of your session (e.g., Part 1: Opening, Part 2: Investigation)
3. **Configure Each Part**:
   - Select a plan markdown file
   - Add images you want to show players
   - Add support documents (NPCs, monsters, maps, FAQs)
   - Add background music tracks
   - Create event playlists (e.g., combat music, tense scenes)
4. **Export Configuration**: Save your session setup as a JSON file
5. **Start Session**: Launch the play mode

### Play Mode

1. **Re-select Folder**: Due to browser security, you'll need to select your campaign folder again
2. **Load Configuration**: Import your previously saved configuration file
3. **Navigate**:
   - Use the top-left dropdown to switch between parts
   - Use tabs to switch between plan, images, and documents
   - Use the audio controls (top-right) to manage music
4. **Search**: Press Cmd/Ctrl+K or click Search to find content
5. **Split View**: When viewing support docs, click "Split with Plan" to view two documents at once

### Folder Structure

#### Auto-Detection Structure (Recommended)

For the best experience with the **Auto-Detect** feature, organize your session folder like this:

```
session-folder/
├── characters/
│   ├── PCs/                    ← Optional: Player Characters
│   │   ├── Aragorn.md
│   │   └── Legolas.md
│   ├── act1/
│   │   ├── npc_captain.md
│   │   └── npc_merchant.md
│   └── act2/
│       └── npc_villain.md
├── images/
│   ├── act1/
│   │   ├── tavern.png
│   │   └── map_overview.jpg
│   └── act2/
│       └── dungeon_entrance.webp
├── maps/
│   ├── act1/
│   │   └── town_map.md
│   └── act2/
│       └── dungeon_map.md
├── music/
│   ├── act1/
│   │   ├── ambient_town.mp3      ← BGM tracks (loose files)
│   │   ├── combat_theme.wav
│   │   └── Combat/               ← Event playlist (subfolder)
│   │       ├── battle_1.mp3
│   │       └── battle_2.mp3
│   └── act2/
│       └── dungeon_ambience.ogg
├── plan/
│   ├── act1/
│   │   └── main_plan.md
│   └── act2/
│       └── main_plan.md
└── threats/
    ├── act1/
    │   └── goblin_raiders.md
    └── act2/
        └── dragon_boss.md
```

**How Auto-Detect Works:**
- Each `act[N]/` folder becomes a separate Part in your session
- The first plan file (alphabetically) becomes the main plan for that part
- Characters, threats, maps, and additional plan files become support documents
- Images are assigned to their respective parts
- **BGM Music**: Files directly in `music/act[N]/` become background music tracks
- **Event Playlists**: Subfolders in `music/act[N]/PlaylistName/` become event playlists (folder name = playlist name)
- **Player Characters**: Files in `characters/PCs/` are used to populate the PC list for initiative tracking (filename = PC name)

Click the **?** icon next to the Configuration section in the app to see this structure and supported formats.

#### Flexible Structure (Manual Setup)

If you prefer a different organization, you can manually configure each part:

```
my-campaign/
├── plan/
│   ├── part1_opening.md
│   └── part2_investigation.md
├── npcs/
│   └── captain_steel.md
├── images/
│   └── scene.png
└── music/
    └── ambient.mp3
```

### Supported File Formats

| Type | Extensions |
|------|------------|
| **Images** | jpg, jpeg, png, gif, webp, svg, bmp, ico, tiff, tif |
| **Audio** | mp3, wav, ogg, flac, m4a, aac, wma, aiff, opus |
| **Documents** | md, markdown |

## Browser Compatibility

This application requires the File System Access API, which is currently only supported in:
- Chrome 86+
- Edge 86+
- Opera 72+

Safari and Firefox do not yet support this API.

## Keyboard Shortcuts

- `Cmd/Ctrl + K`: Open search dialog
- `Escape`: Close image viewer or dialogs

## Tips

1. **Keep files organized**: Use descriptive filenames for easy identification
2. **Use markdown formatting**: Headers, lists, bold, italic, tables all work
3. **Prepare playlists carefully**: Event playlists will loop until you stop them
4. **Export often**: Save your configuration after making changes
5. **Test before session**: Load your configuration before game day to ensure everything works

## Contributing

This is a personal project, but suggestions and improvements are welcome!

## Acknowledgments

Built for running amazing tabletop RPG sessions!
