# MiniMax H3 Reference Loader

ComfyUI custom node that loads the references of the native **MiniMax H3 Reference to Video** node, picked in thumbnail galleries.

- **Images** (up to 9), **Video** and **Video/Audio** (up to 3 videos, shared), **Audio** (up to 3).
- Click order sets the number: the first image clicked is `ref_image_1`, i.e. `<Picture 1>` in the prompt.
- Each selected video has a speaker switch: `ref_video_audio_N` is the soundtrack extracted from `ref_video_N` (empty when muted). Picks made from the **Video/Audio** button keep their sound by default.
- One output appears per selected file (at least one per type); wire the outputs in order (MiniMax numbers its inputs from 0: `ref_image_1` goes to `ref_image_0`, and so on). Double-click an output name to rename it.
- The eye button next to each row shows the selection in order: arrows move a reference, the trash on a thumbnail marks it, and **Delete** removes the marked ones (the following references move up, the last empty output is removed).
- The trash button next to the eye deletes **all** the references of its row, after a confirmation. On the **Video/Audio** row it mutes all the videos instead (they stay selected).
- Videos are read at 24 fps, cut to 15 s and reduced to 768×1344 pixels at most; audio is cut to 15 s.

## Install

Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI. No extra dependency (uses PyAV, Pillow and torch shipped with ComfyUI). The **Browse** button opens the Windows folder dialog; on other systems type or paste the folder path.

## Tests

```
python -m unittest discover -s tests -v
```

## License

Code and documentation: MIT, © 2026 marche-obscure. Images in `assets/` (if any) are all rights reserved, see [LICENSE](LICENSE).
