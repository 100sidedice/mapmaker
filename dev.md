### shortcuts [ctrl+f]
#### script.js - the main file
"Config declaration" - Goes to where config is located, aka all those random booleans/quick settings placed everywhere

#### App.js - The root.
#### Mouse.js - Core mouse input. Note, keyboard input is in the respective engine, not a seperate class (yet?)
#### Saver.js - Saves the program to localStorage.
#### TileEngine.js - tile-scope : The base program.
#### RegionEngine.js - region-scope : Creating large maps by optimizing physical regions
#### PixelEngine.js - pixel-scope : Adjusting the tile textures themselves


### notes
current note keys [concat child for full key]
- "regionX,regionY" - region note
    - ",localTileX,localTileY" - tile note
metadata: 
    - "#hex" (start): color of note