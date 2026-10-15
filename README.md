# MiniMax H3 Reference Loader

ComfyUI custom node that loads the references of the native **MiniMax H3 Reference to Video** node, picked in thumbnail galleries.

- A switch at the top chooses the mode: **Ref2VA** (references for MiniMax H3 Reference to Video, the rows below) or **F2VA / FL2VA** (a **First frame** and an optional **Last frame**, images only, on the outputs `first_frame` and `last_frame` for MiniMax H3 Image to Video; without a last frame MiniMax does F2VA). Each mode keeps its own selection and outputs; switching back reconnects the wires of that mode when their target is still there and free.
- **Images** (up to 9), **Video** (up to 3), **Video/Audio** (up to 3 video soundtracks), **Audio** (up to 3).
- Click order sets the number: the first image clicked is `ref_image_1`, i.e. `<Picture 1>` in the prompt.
- **Video** gives the video frames on `ref_video_N`. **Video/Audio** picks videos too, but only their **soundtrack** is extracted: it is an **audio track** on `ref_video_audio_N`, counted with the audio tracks. The two lists are independent (pick the same video in both to get its frames and its sound).
- Note: MiniMax uses the audio track wired to `ref_video_audio_N` together with the reference video wired to `ref_video_N`. When both have a file, their output dots share a colour (pair 1 orange, 2 pink, 3 green).
- One output appears per selected file (at least one per type); wire the outputs in order (MiniMax numbers its inputs from 0: `ref_image_1` goes to `ref_image_0`, and so on). Double-click an output name to rename it.
- The eye button next to each row shows the selection in order: arrows move a reference, the trash on a thumbnail marks it, and **Delete** removes the marked ones (the following references move up, the last empty output is removed).
- The trash button next to the eye deletes **all** the references of its row, after a confirmation.
- The gear button sets a **root folder** for your rushes. In a gallery, **Root folder** is prefilled with it and its content is shown. **Subfolder** is a drop-down list of all the subfolders of the root folder, with the number of files of that type after each name; **(root folder)**, the default, shows the root folder itself. The magnifier of **Root folder** shows the root folder content and finds its subfolders again for the list; the magnifier of **Subfolder** shows the content of the chosen subfolder. A folder with one kind of files shows a single grid; a mixed folder shows a section per kind (Images, Video or Video/Audio, Audio). Only the files of the button that opened the gallery can be selected; the others are shown for information. Both magnifiers are greyed out without a root folder; Browse and Reload stay available. The chosen subfolder is remembered per type.
- The download button saves the whole configuration (root folder, images, videos, video soundtracks, audio) in a `.txt` file, one line per output:

  ```
  mode : Ref2VA
  root : F:\Rushs\Project
  image 1 : images\a.png
  video 1 : videos\shot.mp4
  video_audio 1 : videos\shot.mp4
  audio 1 : NaN
  first_frame : NaN
  last_frame : NaN
  ```

  Paths under the root folder are written relative to it; an empty group is written with its first number and `NaN`.
- The upload button loads such a file and sets the outputs from it. It keeps its standard color while no reference is selected and turns orange as soon as one is (the root folder alone does not count); loading then asks for a confirmation, since it overwrites the current configuration. Files missing on disk are still loaded and reported on the node.
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
