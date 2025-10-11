# Starfinder 2e Session Manager

A modern web application for managing Starfinder 2e campaign sessions. Built with Next.js, it allows GMs to organize their campaign materials including plans, images, audio, NPCs, monsters, and more.

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

### Folder Structure Example

Your campaign folder is recommended to be organized like this (albeit it is not necesary):

```
my-campaign/
├── plan/
│   ├── part1_opening.md
│   ├── part2_investigation.md
│   └── part3_finale.md
├── npcs/
│   ├── captain_steel.md
│   ├── dr_nova.md
│   └── mysterious_stranger.md
├── monsters/
│   ├── space_kraken.md
│   └── security_drones.md
├── images/
│   ├── part1/
│   │   ├── space_station.png
│   │   └── cantina.png
│   └── part2/
│       └── investigation_scene.png
└── music/
    ├── bgm/
    │   ├── ambient_1.mp3
    │   └── ambient_2.mp3
    └── combat/
        ├── battle_1.mp3
        └── battle_2.mp3
```

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

Built for running amazing Starfinder 2e sessions! (Or any other TTRPG game!)
