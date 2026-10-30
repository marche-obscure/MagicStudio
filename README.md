# MagicStudio (ex MiniMax H3 Reference Loader)

[![version](https://img.shields.io/badge/dynamic/toml?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmarche-obscure%2FMiniMax-H3-Ref-Loader%2Fmain%2Fpyproject.toml&query=%24.project.version&label=version&color=097267)](pyproject.toml)
[![Nodes 2.0](https://img.shields.io/badge/Nodes%202.0-compatible-43a047)](#compatibility)
[![license](https://img.shields.io/badge/license-MIT-007ec6)](LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows%20%28tested%29-5c6b8a)](#compatibility)

**ComfyUI custom nodes (category MagicStudio) for the native MiniMax H3 models and for LTX 2.3 / 2.5:** pick your references in thumbnail galleries, keep every project, run and rush organised, then gather the final rushes and load them back where they are.

https://github.com/user-attachments/assets/d474d73d-f563-4665-97e9-bbfcc9241294

<p align="center">
  <img src="assets/screenshot.webp" alt="MagicStudio RefLoader node with its project overview and preview windows" width="960">
</p>

## Highlights

| Feature | What it does |
|---|---|
| 🖼️ **Thumbnail galleries** | Images, videos, video soundtracks and audio, with a large preview |
| 🔢 **Click order = number** | The first image clicked is `ref_image_0`, i.e. `<Picture 1>` in the prompt; a warning lists the references that change number |
| 🧩 **Models and variants** | **MiniMax H3** (**Ref2VA**, **F2VA / FL2VA**) and **LTX** (**LTX 2.3**, **LTX 2.5**): each variant keeps its selection and its limits |
| 📦 **Container** | The RefLoader sends one **package**; a **MagicStudio Container** gives the outputs of the variant and keeps the wires of each variant |
| ⏱️ **Guide moments (LTX)** | Seconds, **First** / **Last**, and the frame number computed for you |
| 🎚️ **Limits** | A **Limits** button per variant: files per row, duration, size, frames per second |
| ✂️ **Trim** | Videos and audio are trimmed at the output; your files are never changed |
| 📁 **Projects** | Fixed folders per project, Save / Load with SHA256 checks and archives |
| 🎬 **Run record** | Each run keeps its prompt, CFG, steps, seed, models, LoRA and workflow |
| 🗂️ **Rush sorting** | Reject / Validate / Footage, coloured dots, filter and date order |
| 🎞️ **Final Cut** | Copies of the Picture Lock rushes, kept in sync and linked in the input folder, ready to drag |
| 📥 **MedLoad** | Drop a file from Final Cut: image, video or audio, loaded where it is (no copy) |
| 🌍 **Help & compatibility** | Built-in help in English and French; classic nodes and Nodes 2.0 |

## Quick start

1. Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI.
2. Add **MagicStudio RefLoader**, choose the model (**MiniMax H3** or **LTX**) and its variant (**Ref2VA**, **F2VA / FL2VA**, **LTX 2.3**, **LTX 2.5**), click a row (Images, Video…) and pick files in the gallery.
3. Add **MagicStudio Container** and wire the `package` output of the RefLoader to its `package` input. Wire the outputs of the Container in order to the video model (**MiniMax H3 Reference to Video**: same numbers as its inputs, `ref_image_0` → `ref_image_0`, and so on).
4. Optional: add **MagicStudio Project**, wire the `project` output of the RefLoader to its `project` input, then click **+** to create a project. Wire your final prompt to `text_prompt` to record every run.
5. Optional: add **MagicStudio Final Cut** and wire the `final_cut` output of the Project node to it. Open its window and drag a file onto **MagicStudio MedLoad** to use it in a workflow.

## Models and variants

The **Model** list at the top left of the **MagicStudio RefLoader** chooses the video model; the pills next to it choose its **variant** (hidden when the model has only one).

| Variant | Rows | Duration | Size | Settings outputs |
|---|---|---|---|---|
| MiniMax H3 · **Ref2VA** | Images (9), Video (3), Video/Audio (3), Audio (3) | 15 s | 768×1344 at most | none |
| MiniMax H3 · **F2VA / FL2VA** | First frame, Last frame | 15 s | 768×1344 at most | none |
| LTX · **LTX 2.3** | Guide images (1-9), Guide video (0-1), Soundtrack (0-1), Voice (0-1) | 20 s | 768×1344 at most, sides multiples of 32 | `fps`, `width`, `height`, `length` |
| LTX · **LTX 2.5** | the same rows as LTX 2.3 | 20 s | same | same |

- **Each variant keeps its own selection and its own limits.** Changing the model shows the last variant used with it. LTX 2.3 and LTX 2.5 have the same rows and wiring, with separate selections.
- **Limits** (button next to the list): one field per row (number of files), **Max duration (s)** (**Duration (s)** with LTX: it sets the length of the video), **Max size** (width × height), **Frames per second**. **Reset** puts back the values of the variant, **Cancel** closes, **OK** saves. A counter shows `n / max` and turns orange when there are more files than the maximum; the files over the limit are not sent.
- **Settings (LTX):** `fps`; `width` and `height` = **Max size** brought down to multiples of 32; `length` = frames for **Duration (s)**, brought down to 1, 9, 17… (8×k+1): 4 s gives 97.
- **Guide moments (LTX):** open the eye window of **Guide images** or **Guide video**. Under each guide, type **Moment (s)**, or click **First** (0) or **Last** (the last frame, whatever the length). The label `frame n` is the frame number sent to the output: `frame = round(seconds × fps)`. The guide video frame is brought down to 1, 9, 17, 25… (8×k+1) or 0. A moment above the duration is refused (`Max N s`). Two guides on the same frame are shown in orange.
- **LTX outputs (on the Container):** `guide_image_N` (IMAGE) + `guide_frame_N` (INT); `guide_video` (IMAGE) + `guide_video_frame` (INT); `soundtrack` (AUDIO); `voice` (AUDIO, about 5 s); `fps`, `width`, `height`, `length` (INT).

| LTX output | Wire it to |
|---|---|
| Guide images | `LTXVAddGuide`, one per image: `guide_image_N` → `image`, `guide_frame_N` → `frame_idx` |
| Guide video | IC-LoRA loaded with `LoraLoaderModelOnly` → `GetICLoRAParameters` → input `iclora_parameters` of `LTXVAddGuide`; `guide_video` → `image`, `guide_video_frame` → `frame_idx`. Other option: the nodes `LTXICLoRALoaderModelOnly` + `LTXAddVideoICLoRAGuide` of the ComfyUI-LTXVideo pack (to install) |
| Soundtrack | `LTXVAudioVAEEncode` |
| Voice | `LTXVReferenceAudio` + an ID-LoRA |
| `width`, `height`, `length` | the inputs of the same name of `EmptyLTXVLatentVideo` or `LTXVImgToVideo` |
| `fps` | `frame_rate` of `LTXVConditioning` is a decimal number: type the same value there |

> **Old workflows:** a RefLoader saved before the variants (one output per file) gets a **MagicStudio Container** next to it when the workflow opens, wired the same way (message *A MagicStudio Container was added and rewired*). If an old workflow still shows the old node title, right-click the node → **Title** to rename it.

## MagicStudio RefLoader

<p align="center">
  <img src="assets/ref-node.webp" alt="The RefLoader node in Ref2VA and F2VA / FL2VA modes" width="640">
</p>

- **One row per kind** of reference, from the variant shown (see Models and variants above).
- **A row button opens the gallery** of your root folder and its subfolders; with a project wired, the project folder shows below the line.
- **The eye button shows the selection** in order: reorder, delete, inspect, preview and trim.
- **Two outputs that never change:** `project` (root folder, for MagicStudio Project) and `package` (the files of the variant, already loaded, for MagicStudio Container).
- **Save / load** the selection of each variant as a `.json` file; the root folder (gear) points to your rushes.
- Windows open next to the node and can be moved by their title bar.

<p align="center">
  <img src="assets/ref-gallery-images.webp" alt="Image gallery with the project folder below the line"><br>
  <sub>Gallery: pick images; the project folder shows below the line</sub>
</p>

<p align="center">
  <img src="assets/ref-gallery-videos.webp" alt="Video gallery with a large preview"><br>
  <sub>Videos with their duration and a large preview</sub>
</p>

<p align="center">
  <img src="assets/ref-selection-images.webp" alt="Selection window of the images"><br>
  <sub>Eye button: reorder, inspect and preview the selection</sub>
</p>

<p align="center">
  <img src="assets/ref-selection-video.webp" alt="Selection window of a video with the trim bar"><br>
  <sub>Trim a video or an audio file without changing it</sub>
</p>

<details>
<summary><b>Full details of the RefLoader</b></summary>

- The **Model** list and the variant pills choose the variant (see Models and variants above); the **Limits** button sets its maximums.
- MiniMax H3: **Ref2VA** (references for MiniMax H3 Reference to Video, the rows below) or **F2VA / FL2VA** (a **First frame** and an optional **Last frame**, images only, on the outputs `first_frame` and `last_frame` for MiniMax H3 Image to Video; without a last frame MiniMax does F2VA). Each variant keeps its own selection; the Container wires the outputs of a variant again when you come back to it, if their target is still there and free.
- **Images** (up to 9), **Video** (up to 3), **Video/Audio** (up to 3 video soundtracks), **Audio** (up to 3).
- Click order sets the number: the first image clicked is `ref_image_0`, i.e. `<Picture 1>` in the prompt (MiniMax outputs start at 0, like the inputs of MiniMax; LTX outputs start at 1).
- **Video** gives the video frames on `ref_video_N`. **Video/Audio** picks videos too, but only their **soundtrack** is extracted: it is an **audio track** on `ref_video_audio_N`, counted with the audio tracks. The two lists are independent (pick the same video in both to get its frames and its sound). The **Audio** gallery also accepts videos: only their soundtrack goes out on `ref_audio_N`, as an independent audio track (not tied to `ref_video_N`), shown with a *🔊 sound only* badge and trimmable like any audio file; a video without soundtrack is refused.
- Note: MiniMax uses the audio track wired to `ref_video_audio_N` together with the reference video wired to `ref_video_N`. When both have a file, their output dots share a colour (first pair orange, second pink, third green).
- On the Container, one output appears per selected file (at least one per row); wire the outputs in order (same numbers as the inputs of MiniMax: `ref_image_0` goes to `ref_image_0`, and so on). Double-click an output name to rename it. An output that disappears because the selection got smaller remembers its links and gets them back when it reappears, as long as the input downstream is still free (in memory only, not saved in the workflow).
- The eye button next to each row shows the selection in order (clicking an image, a video or an audio file also opens it in a preview window of the same size on the right): arrows move a reference, the trash on a thumbnail marks it, and **Delete** removes the marked ones (the following references move up, the last empty output is removed).
- The **overview** button (four squares, at the bottom) shows the whole selection of the variant shown in one window, a section per row, with the number, output and ✂ badge of each file. Clicking a thumbnail opens it in the preview window on the right (image, video or audio with its player). The trim is shown and can be played (*Play trim*) but not changed there; reorder, delete and trim with the eye button of each row. Greyed out while the variant shown has no reference.
- **Trim** videos, video soundtracks and audio in that preview window: set the start and end (fields or current playback position), check with *Play trim*, or *Reset*. The file is never changed; only that part goes to the output (frames and sound). Trimmed files show a ✂ badge; the trim is saved in the configuration file as `"trim": [2.5, 8]`.
- The trash button next to the eye deletes **all** the references of its row, after a confirmation.
- **Order of the references (Ref2VA):** `<Picture N>`, `<Video N>` and `<Audio N>` in the prompt follow the numbers of the files (video soundtracks first, then the audio files). When a file you keep gets another number (closing the gallery or the selection window, Load, the trash), the window **Order of the references changed** lists the old and new numbers, the files removed and the files replaced at their place (old → new file) so you can update your prompt; adding at the end or removing the last file shows nothing.
- **Project filter:** when the RefLoader is wired to a Project node and the gallery shows its projects folder, a **Project** list appears between Root folder and Subfolder: **All** lists the subfolders of every project, a project lists only its own (Subfolder goes back to the root folder when its choice is not in that project). It opens on the project picked in the Project node. There, Subfolder lists only the media folders of the rows of the variant (`08.Images` to `14.Video-Audio` in Ref2VA; only `08.Images` in F2VA / FL2VA; 08, 10 and 12 with LTX); their Archives open with **View archives**.
- **Renamed or moved folder:** when the root folder changes, every reference not found at its path is looked for under the new root folder (same last folders and name) and relinked; the node shows how many. If files are still missing, the Update bell of the Project node and the gallery of a project copy and archive nothing and offer to remove the missing references, so a renamed folder can no longer send the files of the project to Archives.
- The gear button sets a **root folder** for your rushes. In a gallery, **Root folder** is prefilled with it and its content is shown. **Subfolder** is a drop-down list of all the subfolders of the root folder, with the number of files of that type after each name; **(root folder)**, the default, shows the root folder itself. The magnifier of **Root folder** shows the root folder content and finds its subfolders again for the list; the magnifier of **Subfolder** shows the content of the chosen subfolder. A folder with one kind of files shows a single grid; a mixed folder shows a section per kind (Images, Video or Video/Audio, Audio). Only the files of the button that opened the gallery can be selected; the others are shown for information. Clicking an image or a video also shows it in a preview window on the right (image, or video with its player). Both magnifiers are greyed out without a root folder; Browse and Reload stay available. Reload goes back to the root folder when the gallery shows another folder (picked with Browse or typed). The chosen subfolder is remembered per type.
- The download button saves the configuration of the variant shown in its own `.json` file (one variant per file, never mixed): `REF2VA_minimax_config_yyyyMMdd-HHmmss.json`, `FL2VA_minimax_config_…json`, `LTX23_magicstudio_config_…json` or `LTX25_magicstudio_config_…json`; the date and time in the name keep a new save from overwriting an older one. The button is greyed out while the variant shown has no reference (the root folder alone does not count). The file gives its type (`format`, `version`, `variant`), then the files of each row (`seconds` = moment, `trim` = trim):

  ```json
  {
    "format": "MiniMax H3 Reference Loader",
    "version": 3,
    "variant": "ltx.2_5",
    "root": "F:\\Rushs\\Project",
    "rows": {
      "guide_images": [{ "path": "images\\a.png", "seconds": 0 }],
      "soundtrack": [{ "path": "audio\\s.wav", "trim": [0, 4] }]
    }
  }
  ```

  Files of version 1 and 2 are still read: a MiniMax file goes to Ref2VA or F2VA / FL2VA, an LTX 2.x file to LTX 2.3. Paths under the root folder are written relative to it.
- The upload button loads a `.json` file of the variant shown (older `.txt` saves are no longer read); a file of another variant is refused (**Wrong configuration file**; switch first) and nothing is changed. It keeps its standard color while the variant shown has no reference and turns orange as soon as it has one, and then asks for a confirmation. The other variants never change; the root folder is taken from the file. Files missing on disk are still loaded and reported on the node.
- **Windows** (galleries, selection, help, dialogs, and the windows of the Project node) open next to the node and can be moved by dragging their title bar; they stay on the screen, a preview next to a window follows it, and they open next to the node again the next time.
- The **?** button opens the help: a menu of sections on the left (Quick start, Models, LTX 2.3 / 2.5, MiniMax H3 variants, Picking files, Gallery with a project, Replace a file of the project, Closing the gallery of a project, Selection, Trim, Overview, Save and load, Outputs, Limits), one section at a time on the right, a search field that filters the sections and highlights the words, and Previous / Next links (or the ← → keys). It reopens on the last section viewed. The help is in English or French: the globe button in its header opens the language list; by default it follows the ComfyUI language (then the browser's), and the choice is remembered. The search ignores accents and case.
- MiniMax H3: videos are read at 24 fps, cut to 15 s and reduced to 768×1344 pixels at most; audio is cut to 15 s. LTX 2.3 / 2.5: 24 fps, 20 s, 768×1344 at most with sides that are multiples of 32. The **Limits** button changes these values.

</details>

## MagicStudio Container node

- **Input `package`** (required): the `package` output of a MagicStudio RefLoader. Get / Set and Reroute nodes in between are followed. Without it, the node has no output and says *Wire the package output of a MagicStudio RefLoader*.
- **Outputs:** one per file of the variant shown in the RefLoader, with its name and type (IMAGE, AUDIO, INT): `ref_image_N`, `ref_video_N`, `ref_video_audio_N`, `ref_audio_N` (Ref2VA); `first_frame`, `last_frame` (F2VA / FL2VA); `guide_image_N`, `guide_frame_N`, `guide_video`, `guide_video_frame`, `soundtrack`, `voice`, `fps`, `width`, `height`, `length` (LTX). Ref2VA: a video and its soundtrack of the same number share a dot colour.
- **Variants:** changing the variant in the RefLoader changes the outputs; the wires of each variant are kept and come back with it when the input is still free.
- **No second load:** the files are loaded once by the RefLoader; several Containers on the same RefLoader share them.
- Double-click an output name (or right-click the node) to rename it. Built-in help (**?**) in English and French.

## MagicStudio Project node

<p align="center">
  <img src="assets/project-node.webp" alt="The Project node with one row per project folder" width="420">
</p>

- **The `project` input is required:** wire the last output of the RefLoader; projects are created in its root folder.
- **One row per folder** of the project (`00.Workflows` … `60.Rush Images`), with its status and a window behind each button.
- **Save / Load** copy the references into the project, save the workflow and its configuration, and check every file (SHA256) when loading.
- **Every run is recorded** in `04.Prompt` (prompt, settings, models, LoRA, workflow); videos are copied to `40.Rush Videos`.
- **Sort the rushes** with Reject / Validate / Footage, coloured dots, a filter by colour and the date order; **Purge** cleans unfinished runs.
- **Extract Frame** (button in the `40.Rush Videos` window, under the thumbnail of the Picture Lock video and at the top of the window) saves PNG frames of that video in `40.Rush Videos/Picture Lock/Extract Frame`. See the details below.
- **Copy** brings the media folders (08 to 14, Archives included) of another project and fills the RefLoader from its configuration; **Reset** empties the whole project (files to the Recycle Bin, after typing its name) and the RefLoader.

<p align="center">
  <img src="assets/project-runs.webp" alt="LoRA sets and runs windows of the Project node"><br>
  <sub>Runs: configuration, models, LoRA, prompt and output of each run</sub>
</p>

<p align="center">
  <img src="assets/project-models.webp" alt="Model sets of the Project node"><br>
  <sub>02.Models: the model sets used by the runs and their prompts</sub>
</p>

<p align="center">
  <img src="assets/project-rushes.webp" alt="Rush videos window with the filter by colour"><br>
  <sub>40.Rush Videos: Reject, Validate or Footage, grouped by colour</sub>
</p>

<p align="center">
  <img src="assets/project-folder.webp" alt="Images folder of the project with its Archives"><br>
  <sub>08.Images: files in the order of the RefLoader, then Archives</sub>
</p>

<details>
<summary><b>Full details of the Project node</b></summary>

- The RefLoader has a **project** output, always its last output (in both modes): it gives its root folder (gear button). Wire it to the **project** input of the Project node: this input is **required** (without it the node is greyed and ComfyUI refuses the run).
- Click **+**: a window shows where the project goes and asks for the name. With a root folder in the RefLoader, the project goes there. With an empty root folder, you choose the projects folder (type it or Browse), with the fallback folder `ComfyUI/input/Projets` filled in; the folder chosen is then kept as the root folder of the RefLoader. The window warns when the folder does not exist yet (it is then created). **Create** makes the project folder with `00.Workflows`, `02.Models`, `04.Prompt`, `06.LoRA`, `08.Images`, `10.Son`, `12.Video`, `14.Video-Audio`, `40.Rush Videos` and `60.Rush Images`, plus `99.Project-Config` (configuration of the project, with its `Archives` folder; no row in the node).
- The top line reads **Project name:** with the drop-down list, a pencil button (rename the project folder, or move the whole project to another folder: the window shows the current and the new name or folder, and asks for a confirmation) and **+**.
- **Save** (wired RefLoader) shows what it will do, asks for a confirmation, then copies the files of the variant shown in the RefLoader into the project (Images, First and Last frame, Guide images in `08.Images`; Video, Guide video in `12.Video`; Video/Audio in `14.Video-Audio`; Audio, Soundtrack, Voice in `10.Son`; a file already there is not copied again, another file with the same name becomes `name (2)`), makes the RefLoader use the copies, saves the workflow, then writes `99.Project-Config/config_projets_<project>.json`: project name, `version` 3 and the variant shown, creation and modification dates, project folder, then every folder from `00.Workflows` to `60.Rush Images`, even empty (`Valide`, number of files, then each file with `Dossier`, `nom`, the `SHA256` for 00, 04, 08, 10, 12 and 14, `Nodes` and `Links` for the workflows). A media file is written once with its `Utilisations` in **every variant** (variant, row, number, moment, trim); elsewhere `Indice` is its rank by name. A file of 08, 10, 12 or 14 that no variant uses stops the save and is listed. Older configurations are read and written again in this format at the next Save. The previous configuration goes to `99.Project-Config/Archives` as `yyyyMMdd-HHmmss_config_projets_<project>.json` (never overwritten, no limit). The workflow of the project is `00.Workflows/workflows_<project>.json`; older names (`<project>.json`, `Project-Config.json`) are renamed by themselves, and renaming the project renames both files. In the configuration, `02.Models` and `06.LoRA` give the current index of their registry (`Valide` false and 0 without registry). Right after creating a project, a first save is offered. The references in the project follow a rename or a move.
- **Run record:** wire the final prompt text to the optional `text_prompt` input of the Project node. Each Run then writes `04.Prompt/yyyyMMdd_HHmmss_run.json` (date, project, mode, prompt, and the CFG, Steps and Seed read in the run itself: KSampler first, then CFGGuider, RandomNoise…; a linked value is followed through Get / Set, Reroute, value nodes, switches and Pixaroma Sliders, and a value computed during the run gives `null` with `cfg_from` / `steps_from` / `seed_from` naming its node); only the new files of a run count (a file already recorded by a previous run and older than the run, sent back by the cache of ComfyUI, is ignored; a file written during the run counts even if it takes the name of an old one), and a run without any new file or stopped without any file is not recorded; at the end of the run, its generated videos are copied to `40.Rush Videos` from the real path given by the save node (its own folder for Pixaroma Save Video or Video Helper Suite, otherwise the output folder) under the name of the JSON (`_02`… for the next ones); a video larger than 960x544 is reduced to fit in it (same proportions, H.264 .mp4, same frame rate, sound kept), a smaller one is copied as it is, and a video saved in `40.Rush Videos` itself is left alone; images are not copied (they stay in the folder of the save node); the JSON lists them all (`size` / `copy_size` for videos) with `status` done or error and `duration`, the total time of the run in seconds (from the start to the end of its execution in ComfyUI, model loading included), shown as **Duration** in the Configuration frame of the 04, 40 and 60 windows (older runs have none). The ComfyUI page must stay open until the run ends for the copy. The optional `models_link` input takes the `model_link` output of **MultiFiles Select** (directly or through Set / Get or Reroute nodes): its fields give the models of the run (a Switch MultiIN-OUT in between is followed to the input of its active group) (`{position, name}`, position = number of the field; not wired: read in the graph, position 0; LoRA always read in the graph), and an empty save folder of MultiFiles Select gets `<project>/02.Models` (it follows the project; a folder chosen by hand is never replaced). Load and Save are locked while a run of the node is in progress. Each output gets `kind` (video / image). Registries: at the end of a recorded run, `02.Models/yyyyMMdd_HHmmss_models.json` (entries `IndiceMODELS`: diffusion_model, text_encoder, vae) and `06.LoRA/yyyyMMdd_HHmmss_LoRA.json` (entries `IndiceLoRA`: `ListeName` LoRA01, LoRA02… with their strengths) get the set used by the run: an existing set keeps its index (`datemodifi` updated), a new or changed one gets the last index + 1 (`DernierIndice…`); `IndiceEnCours…` is the set of the last run; the run JSON keeps only `models: [{indiceMODELS}]` and `loras: [{indiceLoRA}]`. The JSON also gets `models` (diffusion_model, text_encoder, vae, loras with their strengths), read in the run: only the nodes upstream of the samplers and VAE decoders, following the chosen branch of a switch, with only the active LoRA of LoraManager / Power Lora Loader; a file name given by a link is followed up to the file name (for example a file-select node whose output N gives its field N); the run windows show them in two folding blocks, Models and LoRA (one open at a time, folded when another run is shown). The rows of 04.Prompt, 40.Rush Videos and 60.Rush Images show `Last run: dd/MM/yyyy hh:mm:ss | Runs: n`; clicking 04.Prompt opens the runs (filter All / Video / Image, list, Configuration with the folder of the original, Prompt, thumbnail), clicking 40 or 60 shows the videos (copies) or images (originals) named in the run JSONs, with the Configuration and Prompt of the picked one (a copy icon at the top left of the Prompt frame copies the text to the clipboard); a thumbnail opens in a Preview window. `40.Rush Videos` and `60.Rush Images` each have four folders, `Picture Lock`, `Rough Cut`, `Footage` and `No Good` (the old `Rejected` and `Validated` are renamed `No Good` and `Rough Cut` when the window opens, the run JSONs follow). The copies of the runs go to `Footage`, and files of older runs left in the root of 40 / 60 are put there when the window opens. Under the image (windows 04, 40 and 60), **Picture Lock** / **Rough Cut** / **Footage** / **No Good** move the file into that folder; the button of its current folder is greyed. The dot shows where it is: gold = Picture Lock, light green = Rough Cut, orange = Footage, red = No Good, grey = the original is outside the project. Every Picture Lock (40, 60 and 70), in every project, holds one file (the final rush): when it is taken, a confirmation proposes a Swap (the old file goes to the folder of the new one, Rough Cut when the new one comes from outside); to keep several versions, use a MultiProject. An existing project with several files in a Picture Lock is left as it is: nothing is moved, an orange **Picture Lock: keep one file** warns you and **Extract Frame** is greyed. From outside, the four buttons bring it back after a confirmation: copy into the folder, SHA256 check, then the original is deleted (a video replaces its reduced copy, only one version kept); on an error the original is untouched, with Retry / Abandon (abandoned after 3 failed attempts).
- In the 40 / 60 windows the thumbnails are grouped by dot (gold, green, orange, red, grey), then by date inside each group (Date ↓ / ↑); a file that is sorted stays selected.
- **Extract Frame:** the button shows when the Picture Lock holds one video, under its thumbnail (when a Run made it) or at the top of the `40.Rush Videos` window (even for a video placed by hand). It opens a side window with the video, `Frame n / total` (counted from 0) and the buttons ◀ ▶ (one frame back / forward). **Select:** `First`, `Last`, `FL-Frame` (both) or `Frame-N` (the frame shown; the number can be typed), then **Extract**; the extracted images show as thumbnails at the bottom. Close, Esc or a click outside closes the window. Full-size PNG, taken from the original video, named `FIRST_FRAME_<project>.png`, `LAST_FRAME_<project>.png` or `FRAME_0048_<project>.png` (4 digits; `<project>` is the project, or the sub-project in a MultiProject). If the name exists, a question `Replace <name>?` (Replace / Cancel) appears. When the Picture Lock video changes (checked at each reload of the Runs and after each sort): removed with no replacement, the folder is emptied (message `Extract Frame emptied: the Picture Lock video was removed`); replaced and the folder empty, nothing happens; replaced with FIRST / LAST images, a question `The Picture Lock video changed. Replace FIRST_FRAME / LAST_FRAME with frames of the new video?` (Replace / Keep, Esc = Keep); replaced with FRAME_ images, they are removed. Every removal goes to the Recycle Bin. While that question waits, a new extraction is refused. In the RefLoader gallery with a project, Extract Frame also shows for the image rows; a picked image is copied into `08.Images` at Save.
- **90.Pick Up:** suggested folder to save the runs, with `Image`, `Son` and `Video`, created in every project (no row in the node). The three icons at the bottom of the Project node copy their path: paste it into the save node of the workflow. In the RefLoader gallery with a project, each subfolder shows in **Subfolder** for the rows of its type; a picked file is copied into 08 to 14 at Save. A run saved directly into `08.Images`, `10.Son`, `12.Video` or `14.Video-Audio` is moved at its end to `40.Rush Videos` / `60.Rush Images` (`Footage`, full quality), and the bell of those folders never archives a file of a run; runs whose original was archived before this change get it back when the runs are read.
- **Filter:** (top of the 40 / 60 windows): green, orange, red and grey dots; click them to show only the thumbnails with those dots (several at once, none = all, back to all at each opening; the tooltip gives the number of files).
- **Date ↓ / Date ↑** (top of every folder window): newest or oldest first, one setting for all the windows, kept by the browser. 02.Models / 06.LoRA: sets by the date of their last run, then prompts; 04 / 40 / 60: runs; 08 to 14: the files used by the RefLoader stay first in its order, the others and Archives by modification date.
- **Copy** (blue, bottom of the node): pick another project of the folder in a drop-down list; the window shows, for 08.Images, 10.Son, 12.Video and 14.Video-Audio, the files, the Archives, what will be copied and what is already there. The files (and their `Archives`) are copied into the same folders of the open project: a file whose SHA256 is already in the folder is skipped, a taken name gets `_02`, `_03`…; the other project is never changed. When it has a saved configuration, every variant of the RefLoader is filled from it (same order, moments and trims, pointing to the copies).
- **Reset** (red, bottom of the node) shows what will go, folder by folder (files and size), and is enabled only once the project name is typed. Every file of the project, in all its folders and subfolders (`99.Project-Config`, `98.Error`, Archives… included), goes to the Recycle Bin (deleted permanently where there is none); the folders stay, empty. The selection of the RefLoader is emptied in every variant; its root folder does not change and files outside the project are never touched.
- **Purge** (dark red, bottom of the node) counts first, then asks for a confirmation: the runs still marked `running` while no run is in progress are deleted (JSON in `04.Prompt` and its workflow in `00.Workflows/Run`; kept while ComfyUI is running something), the runs in `error` go to `98.Error` (workflow in `98.Error/Workflows`, `_02`… if the name is taken; their files stay in place). `98.Error` is created at the first purge, in the project folder, with no row in the node. When there are runs `done` without any image or video output, the warning shows an unchecked box to delete them too (JSON and workflow; a run naming a file that is gone is kept).
- **Workflow of each run:** when Run is clicked, the workflow goes into `00.Workflows/Run` under the name of the run JSON, which names it in its `workflow` field (never listed with the workflows of the project; removed with a run that is not kept). In the runs window, **Retrieve the workflow** under the thumbnail opens it in a new tab; for an older run, it is read from its output files (PNG, Video Helper Suite video) when they keep it.
- **02.Models / 06.LoRA:** the rows show `Sets: n | Last run: …`. A click opens one card per set of the registry (files, number of runs, last run) and, on the right, the prompts of the selected set (identical texts grouped); below the sets, the LoRA (from 02) or the models (from 06) of the selected prompt; the blue eye opens the runs of that prompt.
- **Load** first compares every file with the configuration (SHA256), without changing anything; a missing or different file is looked for in the `Archives` of its folder (same SHA256, same name first). The window *Load the project* shows each folder with ✓ / ✗, `→ found in Archives` with an eye that opens the file in a *Preview* window next to it (image, video, sound; ✕, Escape or a click outside closes only the preview), a check box (checked) for 00.Workflows, 08.Images, 10.Son, 12.Video and 14.Video-Audio, the warning about the prompt in progress for 04.Prompt, and 02.Models, 06.LoRA, 40.Rush Videos and 60.Rush Images as information only. **Load** puts back the files found in Archives (a file already there under that name goes to Archives first) and fills every variant of the RefLoader for the checked folders (the variant shown does not change). A workflow with the same structure (nodes and links, by output and input name) replaces the current one; with another structure the current workflow is never replaced and the saved one opens in a new tab `name-copie` (the window lists the nodes and links in more or missing); with 00.Workflows unchecked, the media go to the RefLoader of the current tab.
- The workflow is saved in `00.Workflows` (right when a project is created, then with the save button or the bell of that row). The bell is grey (never saved), orange (changes to save, also right after the first save) or green (saved, no change since; it turns orange on the next change of nodes, links or values, not when nodes are only moved). Clicking it lists the changes, asks whether to archive the previous workflow (moved to `00.Workflows/Archives` as `yyyyMMdd-HHmmss_name.json`, date of its last save; archives left in `00.Workflows` by older versions move there on their own, and the archives button lists that folder) and proposes the project name, which can be changed; the button reads Save (green) with Archive it and Overwrite (orange) with Overwrite, and the window stays open after saving until Close is clicked. With the project output wired to a Project node with a project picked, the gallery of the RefLoader shows the selected folder above and, below a line, the matching folder of the project (Images: 08.Images, Video: 12.Video, Video/Audio: 14.Video-Audio, Audio: 10.Son) with its selection number always shown and the files ordered by that number; the check box under a selected project file (unchecked at first) marks it to replace: the next file picked above goes to a pool of pending replacements (the replaced file is locked and shows n → A); its number shows under a green ✓ that validates it, a red ✕ cancels one, Validate changes applies them all (each replaced file goes to Archives first, then each new file enters the project folder with its number: copied from the selected folder, moved when it comes from Archives, `_02`, `_03`… added if the name is taken, the same name kept when it replaces a file with that name); a coloured bar under the name marks duplicates (same SHA256) among the pending replacements and the project folder, one colour per group and Cancel changes puts everything back, both confirmed (a full selection shows a message saying so). Clear is greyed out with a project (the order of its files cannot be emptied at once), and the window is taller. When the Archives folder has files, a View archives button turns green and shows them above instead of the selected folder; clicking it again goes back. On closing, files added to an existing selection ask Add, Replace or Cancel (Cancel cancels all the changes made in the window, except replacements already validated, and closes it), and every file of that project folder no list uses anymore is moved (after a confirmation) to its Archives subfolder; nothing is deleted. Then every file of the list goes to that project folder (copied from elsewhere, moved from Archives, `_02` if the name is taken; trims follow). Only one checked file can wait for its replacement (the other boxes are greyed out); closing with it asks Cancel or Continue (it stays as it was, the pending replacements are applied). 08.Images, 10.Son, 12.Video and 14.Video-Audio follow the lists of the RefLoader: a reference added or removed there shows a warning sign left of the folder and turns its bell orange; the bell also turns orange when the folder keeps files that no list of the RefLoader uses anymore; clicking the bell lists the changes and Update copies the new files (the RefLoader then uses the copies) and moves every unused file of the folder (removed references included) to its `Archives` subfolder, so it no longer shows in the gallery of the project; nothing is deleted. The row of those four folders shows `Use: n/x | Orphelins: m | In Archives: y` (n files of the folder used by the RefLoader out of x, the most it accepts for the folder; the maximum follows the variant shown in the RefLoader and its **Limits**. Ref2VA: 08.Images 9, 10.Son / 12.Video / 14.Video-Audio 3. F2VA / FL2VA: 08.Images 2. LTX 2.3 / 2.5: 08.Images = guide images, 10.Son = soundtrack + voice, 12.Video = guide video. A folder without a row in the variant shows `Not used`. **Save** copies only the files of the variant shown; a file used by any variant is never archived; m orphan files, without number and not archived yet, shown only while there are some; y files in `Archives`). Clicking the button of one of those four folders opens a view-only window (Close, Escape or a click outside closes it): its files in the order of the RefLoader with their number (a row of one file shows its initial: F / L for First / Last frame, S / V for Soundtrack / Voice; files without number last), then a frame with the files of its `Archives` folder; both rows scroll sideways, and a click on a thumbnail opens it large in a Preview window. The `Archives` folder of those four folders is also read for duplicates (same SHA256, even when the folder itself is empty): a duplicates button then appears right of the bell. It opens a *Duplicates* window with one thumbnail per group (number of copies, check box); clicking a thumbnail shows all its copies below with their total size and the size freed. Files moved to the `Archives` folder of those four folders are named `yyyyMMdd_HHmmss_name.ext` (date of the archiving, `(2)`-like numbers removed, the next second when the name is taken; files already there are not renamed), and take their name back without the date when they leave Archives. One copy always stays in Archives (a dated name without `(x)`, then a name without `(2)` or `_02`, otherwise the oldest); after the deletion it is named `yyyyMMdd_HHmmss_name.ext` (its date kept, or the date of the file instead of the `(x)`). *Delete (x) file(s)* needs at least one box checked and asks Cancel, Move to Recycle Bin (Windows only) or Delete permanently; groups left without duplicates leave the window. This is not a workflow change: no configuration is written and the workflow bell ignores the content of those lists. A warning sign left of the 00.Workflows button shows that the workflow has changed (nodes, links, values) and is not saved yet; it goes away once saved. The row shows `Last save: dd/MM/yyyy at hh:mm:ss`; the button right of the bell opens an archived workflow in a new tab. At most 5 archives per project: with 5, the archives get a check box; Delete removes the checked ones and proposes the save, Cancel closes the window. In the bell window, Save with Archive it opens that list first; Overwrite saves directly.
- Under the list, one row per folder of the project, with its own icon and colour (bells on 00.Workflows and on 08.Images to 14.Video-Audio; the other rows keep their place, so all the folder buttons have the same width and line up); greyed until a project is picked, the tooltip gives the folder path.
- Or pick an existing project in the drop-down list; a missing subfolder is created again. Change the root folder of the RefLoader and the list follows.

</details>

### Built-in help

<p align="center">
  <img src="assets/ref-help.webp" alt="Help of the RefLoader" width="49%">
  <img src="assets/project-help.webp" alt="Help of the Project node" width="49%"><br>
  <sub>RefLoader help (English or French, with search) · Project node help</sub>
</p>

## MagicStudio Final Cut node

- **Wire the `final_cut` output** of the Project node to the `final_cut` input of this node.
- **It copies the final rushes:** the `Picture Lock` folders of `60.Rush Images`, `40.Rush Videos` and `70.Rush Audio` go to `Final-Cut_<Name>\Images`, `Video` and `Audio`. The originals are never touched.
- **Simple project or MultiProject:** the copies of a Simple project stay in its folder; a MultiProject gathers the copies of all its projects in its own folder.
- **Name of a copy:** `_NN_<file>`, where NN is the number of the project (00 for a Simple project; 01, 02… for the projects of a MultiProject, given once and never reused). The copy takes the date of the copy, so new copies come first in MiniMax H3 Director.
- **Linked in the input folder** of ComfyUI as `Final-Cut_<Name>`, so other nodes can pick the copies there.
- **Sync:** the first sync runs when the node is wired. After that, the orange **Sync · n** button shows that a Picture Lock changed (its tooltip lists the changes); grey **Up to date** means nothing to do. A copy whose original was replaced or removed goes to the Recycle Bin, only after a click on Sync. A progress bar shows the work.
- **Images / Video / Audio buttons:** each opens the copies of that type in a window that does not block the canvas: files grouped by project (newest first), **List | Thumbnails** (remembered), and on the right the clicked file with its player, **File**, **Path** and **Source**.
- **Frames of a video (Video window):** a strip with a scissors icon and tiles **First**, **Last** and **N** (**◀ ▶** to go through the `FRAME_` images) appears for every video whose project has images in `Picture Lock/Extract Frame`; drag a tile onto MiniMax H3 Director or MagicStudio MedLoad (MedLoad needs the project inside the ComfyUI input folder), click it to see the image on the right. No Sync needed.
- **Drag a thumbnail** onto MiniMax H3 Director, or onto **MagicStudio MedLoad**.
- The node does nothing during a Run: everything happens in its interface.
- The **?** button opens its help (Quick start, The window, The copies, Sync, Into H3 Director), in English or French.

## MagicStudio MedLoad node

- **Drop a file from the Final Cut window** onto the node (on its preview area or anywhere on the node): its full path goes into the `file` field, and the node shows the picture, a video player or an audio player. You can also type or paste the path in `file`.
- **Outputs:**

  | File | `video` | `video_frames` | `audio_video` | `image` | `audio` |
  |---|---|---|---|---|---|
  | Video | the video (`VIDEO`, same type as the native **Load Video**) | all its frames (`IMAGE`, original size) | its soundtrack (`AUDIO`), if it has one | empty | empty |
  | Image | empty | empty | empty | the image (`IMAGE`) | empty |
  | Audio | empty | empty | empty | empty | the whole file (`AUDIO`, not cut) |

  An empty output is ignored by the optional inputs of the native nodes. `video_frames` holds every frame in memory: for a long or large video, prefer `video`.
- **`name`** (last output, `STRING`): the name of the loaded file, with its extension (for example `LAST_FRAME_Clip.png`), for an image, a video or an audio file.
- **No copy:** the file is read where it is. It is loaded again only when the path changes or when the file is modified.
- **Safety:** only files inside the input folder of ComfyUI (or its subfolders) are accepted; any other path is refused before the run, with a message on the node.
- A file dragged from the Windows Explorer gives no path to the browser: drag it from Final Cut, or type its path.
- The **?** button opens its help (Quick start, Outputs, Accepted files), in English or French.

## MagicStudio SelectMod node

- Picks up to 7 model files (diffusion model, text encoder, VAE, LoRA...) **in the models folders only**: `models` of ComfyUI and **Models (Linker)** (the `models` folder of `extra_model_paths.yaml`). Any other path is refused, by the window and at run time.
- The folder button opens a **MagicStudio window** next to the node: the folder tree on the left (with the number of model files), the files on the right (name, size, date, sorted by a click on a column title), a search, and the full path of the file under the mouse. One click fills the active field; the window stays open (change the field on the node, click the next file) and only its orange **Close** button closes it. The node itself only keeps the shortcut menu, the origin folder with the folder button, and the fields.
- Same fields and outputs as MultiFiles Select: 5 fields (`unused 1` to `unused 5`), `model_link` (save folder), `Option 1` / `Option 2`, Absolute / Relative paths (Relative starts after the type folder, e.g. `MINIMAXH3\model.safetensors` for a file of `diffusion_models`), Type of each field, overwrite confirmation, export / import (it also reads the files exported by MultiFiles Select).
- Wire `model_link` to the `models_link` input of **MagicStudio Project**: each run records the models of the fields, exactly as with MultiFiles Select.
- The **?** button opens its help (Quick start, Fields, The folder window, Absolute / Relative, Export / Import, Link to the Project node, Good to know), in English or French.

## MagicStudio SaveVoice node

- **What it does:** saves a voice reference into `<project>\90.Pick Up\Son` of the project picked in the **MagicStudio Project** node. The folder is created if it is missing.
- **Wiring:** wire an `audio` (AUDIO) and the `final_cut` output of the Project node to the `project` input. Without a project, the run is refused with "Wire the final_cut output of a MagicStudio Project node".
- **Settings:**
  - `prefix`: text at the start of the file name (can be empty).
  - `format`: `wav` (default, best for a voice reference), `flac`, `mp3` or `opus`.
  - `quality`: for `mp3`, `V0` (default), `128k` or `320k`; for `opus`, `64k`, `96k`, `128k` (default), `192k` or `320k`. For `wav` and `flac` the list is grey (nothing to choose).
- **File name:** `<prefix>_yyyyMMdd_HHmmss.<format>`, or `voice_yyyyMMdd_HHmmss.<format>` when the prefix is empty. Forbidden characters are removed from the prefix. If the name is taken, one second is added: a file is never overwritten.
- **Path row:** shows the folder `<project>\90.Pick Up\Son` (read only) with a **Copy** button. It follows the project of the Project node.
- **Player:** plays the last saved file.
- **Outputs:** `audio` (the same sound) and `path` (the full path of the saved file).
- **Not attached to a Run:** the file does not appear in the rushes. To use it, open the RefLoader gallery and pick it in **Pick Up / Son**.
- The **?** button opens its help (Quick start, Inputs, Settings, Outputs), in English or French.

## Post-processing

- A file saved **after a MagicStudio MedLoad** that loads a file of a run is added to **that run** (the original run) as **Post 1**, not recorded as a new run. Retouch Post 1 again and you get **Post 2** of the same run.
- It works when you run the whole workflow or only the retouch branch, with or without the Project node.
- In **40.Rush Videos / 60.Rush Images**, a post-processing shows next to its original (videos get a small copy, like the other runs). Labels show only when a file was post-processed: the original has a green frame and an **Original** label; a post-processing shows **Post n** followed by the file it comes from (**Original** or **Post m**). In **04.Prompt, 02.Models, 06.LoRA**, ‹ › go from the original to its post-processings; the configuration says in one sentence which file it comes from, and **Retrieve the workflow** opens its own workflow.
- A file loaded from outside any run is not attached, and no run is made for it.

## Compatibility

Works with the classic node design and with **Modern Node Design (Nodes 2.0)**: in both, output names can be renamed by double-click (or the right-click menu) and paired outputs share their colour.

Tested on Windows only. On Linux and macOS the Browse button is not available (type the folder path instead); everything else should work but is untested.

## Install

Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI. No extra dependency (uses PyAV, Pillow and torch shipped with ComfyUI). The **Browse** button opens the Windows folder dialog; on other systems type or paste the folder path.

<details>
<summary><b>Tests</b></summary>

```
python -m unittest discover -s tests -v
node --test tests/*.mjs
```

</details>

## Credits

- Thanks to **pixaroma** for [ComfyUI-Pixaroma](https://github.com/pixaroma/ComfyUI-Pixaroma): the interface of this node (buttons on the left, thumbnail gallery) is inspired by its *Load Images Folder* node, and the Windows folder dialog script is adapted from it (MIT License, see [LICENSE](LICENSE)).
- Built for the native **MiniMax H3** nodes of ComfyUI.

## License

Code and documentation: MIT, © 2026 marche-obscure. Images in `assets/` are © 2026 marche-obscure, all rights reserved (the media shown in them are blurred on purpose). Third-party code: see the end of [LICENSE](LICENSE).
