# MiniMax H3 Reference Loader

ComfyUI custom node that loads the references of the native **MiniMax H3 Reference to Video** node, picked in thumbnail galleries.

- A switch at the top chooses the mode: **Ref2VA** (references for MiniMax H3 Reference to Video, the rows below) or **F2VA / FL2VA** (a **First frame** and an optional **Last frame**, images only, on the outputs `first_frame` and `last_frame` for MiniMax H3 Image to Video; without a last frame MiniMax does F2VA). Each mode keeps its own selection and outputs; switching back reconnects the wires of that mode when their target is still there and free.
- **Images** (up to 9), **Video** (up to 3), **Video/Audio** (up to 3 video soundtracks), **Audio** (up to 3).
- Click order sets the number: the first image clicked is `ref_image_1`, i.e. `<Picture 1>` in the prompt.
- **Video** gives the video frames on `ref_video_N`. **Video/Audio** picks videos too, but only their **soundtrack** is extracted: it is an **audio track** on `ref_video_audio_N`, counted with the audio tracks. The two lists are independent (pick the same video in both to get its frames and its sound).
- Note: MiniMax uses the audio track wired to `ref_video_audio_N` together with the reference video wired to `ref_video_N`. When both have a file, their output dots share a colour (pair 1 orange, 2 pink, 3 green).
- One output appears per selected file (at least one per type); wire the outputs in order (MiniMax numbers its inputs from 0: `ref_image_1` goes to `ref_image_0`, and so on). Double-click an output name to rename it.
- The eye button next to each row shows the selection in order (clicking an image, a video or an audio file also opens it in a preview window of the same size on the right): arrows move a reference, the trash on a thumbnail marks it, and **Delete** removes the marked ones (the following references move up, the last empty output is removed).
- **Trim** videos, video soundtracks and audio in that preview window: set the start and end (fields or current playback position), check with *Play trim*, or *Reset*. The file is never changed; only that part goes to the output (frames and sound). Trimmed files show a ✂ badge; the trim is saved in the `.txt` file as `video 1 : rush\plan.mp4 | 2.5-8`.
- The trash button next to the eye deletes **all** the references of its row, after a confirmation.
- The gear button sets a **root folder** for your rushes. In a gallery, **Root folder** is prefilled with it and its content is shown. **Subfolder** is a drop-down list of all the subfolders of the root folder, with the number of files of that type after each name; **(root folder)**, the default, shows the root folder itself. The magnifier of **Root folder** shows the root folder content and finds its subfolders again for the list; the magnifier of **Subfolder** shows the content of the chosen subfolder. A folder with one kind of files shows a single grid; a mixed folder shows a section per kind (Images, Video or Video/Audio, Audio). Only the files of the button that opened the gallery can be selected; the others are shown for information. Clicking an image or a video also shows it in a preview window on the right (image, or video with its player). Both magnifiers are greyed out without a root folder; Browse and Reload stay available. Reload goes back to the root folder when the gallery shows another folder (picked with Browse or typed). The chosen subfolder is remembered per type.
- The download button saves the configuration of the mode shown in its own `.txt` file (one file per mode, never mixed): `REF2VA_minimax_config_yyyyMMdd-HHmmss.txt` (root folder + the four lists) or `FL2VA_minimax_config_yyyyMMdd-HHmmss.txt` (root folder + the two frames); the date and time in the name keep a new save from overwriting an older one. The button is greyed out while the mode shown has no reference (the root folder alone does not count). The first line is a header giving the file type, then one line per output:

  ```
  # MiniMax H3 Reference Loader - REF2VA configuration
  mode : Ref2VA
  root : F:\Rushs\Project
  image 1 : images\a.png
  video 1 : videos\shot.mp4
  video_audio 1 : videos\shot.mp4
  audio 1 : NaN
  ```

  ```
  # MiniMax H3 Reference Loader - FL2VA configuration
  mode : FL2VA
  root : F:\Rushs\Project
  first_frame : images\start.png
  last_frame : NaN
  ```

  Paths under the root folder are written relative to it; an empty group is written with its first number and `NaN`.
- The upload button loads a file of the mode shown and sets its outputs; a file saved in the other mode (read from its header, or its mode line for older files) is refused with a warning (switch mode first) and nothing is changed. It keeps its standard color while the mode shown has no reference and turns orange as soon as it has one (the root folder alone does not count), and then asks for a confirmation. The other mode and the mode switch are never changed; the root folder is taken from the file. Files missing on disk are still loaded and reported on the node.
- Videos are read at 24 fps, cut to 15 s and reduced to 768×1344 pixels at most; audio is cut to 15 s.

## Install

Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI. No extra dependency (uses PyAV, Pillow and torch shipped with ComfyUI). The **Browse** button opens the Windows folder dialog; on other systems type or paste the folder path.

## Tests

```
python -m unittest discover -s tests -v
node --test tests/test_config_format.mjs
```

## License

Code and documentation: MIT, © 2026 marche-obscure. Images in `assets/` (if any) are all rights reserved, see [LICENSE](LICENSE).
