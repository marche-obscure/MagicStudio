"""
Tests du module run_record (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import json
import os
import shutil
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import projects  # noqa: E402
import project_config  # noqa: E402
import run_record as rr  # noqa: E402


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def files_in(folder):
    """Fichiers d'un dossier (sans les sous-dossiers de tri), tries."""
    return sorted(n for n in os.listdir(folder) if os.path.isfile(os.path.join(folder, n)))


def make_video(path, width, height, frames=6, audio=True):
    """Petite video H.264 (+ son AAC) pour les tests de reduction."""
    import av
    import numpy as np
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with av.open(path, "w") as out:
        v = out.add_stream("libx264", rate=24)
        v.width, v.height, v.pix_fmt = width, height, "yuv420p"
        a = out.add_stream("aac", rate=44100) if audio else None
        for i in range(frames):
            img = np.full((height, width, 3), (i * 40) % 255, dtype=np.uint8)
            for p in v.encode(av.VideoFrame.from_ndarray(img, format="rgb24")):
                out.mux(p)
        for p in v.encode(None):
            out.mux(p)
        if a is not None:
            for i in range(5):
                f = av.AudioFrame.from_ndarray(np.zeros((1, 1024), dtype=np.float32), format="fltp", layout="mono")
                f.sample_rate, f.pts = 44100, i * 1024
                for p in a.encode(f):
                    out.mux(p)
            for p in a.encode(None):
                out.mux(p)


def P0(name):
    """Modele lu dans le graphe (sans models_link) : position 0."""
    return {"position": 0, "name": name}


def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# Run d'exemple : KSampler avec un seed venant d'un noeud Primitive.
PROMPT = {
    "3": {"class_type": "KSampler", "inputs": {"seed": ["5", 0], "steps": 30, "cfg": 7.5, "model": ["4", 0]}},
    "5": {"class_type": "PrimitiveInt", "inputs": {"value": 44}},
    "1": {"class_type": "MiniMaxH3RefLoader", "inputs": {"state": json.dumps({"mode": "fl2va"})}},
}


class RunParamsTest(unittest.TestCase):
    def test_ksampler_and_primitive_link(self):
        self.assertEqual(rr.run_params(PROMPT), {"cfg": 7.5, "steps": 30, "seed": 44})
        self.assertEqual(rr.run_mode(PROMPT), "FL2VA")

    def test_custom_sampler_nodes(self):
        prompt = {
            "10": {"class_type": "RandomNoise", "inputs": {"noise_seed": 123}},
            "11": {"class_type": "CFGGuider", "inputs": {"cfg": 4, "model": ["2", 0]}},
            "12": {"class_type": "BasicScheduler", "inputs": {"steps": 20, "scheduler": "simple"}},
        }
        self.assertEqual(rr.run_params(prompt), {"cfg": 4, "steps": 20, "seed": 123})

    def test_switch_and_json_sliders(self):
        # Workflow reel : KSampler <- Switch (booleen) <- Pixaroma Sliders (etat JSON, une valeur par sortie).
        sliders = lambda steps, cfg: json.dumps({"version": 1, "sliders": [{"type": "int", "value": steps},
                                                                           {"type": "float", "value": cfg}]})
        prompt = {
            "225": {"class_type": "KSampler", "inputs": {"seed": ["244", 0], "steps": ["274", 0], "cfg": ["275", 0]}},
            "244": {"class_type": "PixaromaSeed", "inputs": {"SeedState": json.dumps({"runSeed": 77}), "seed": 77}},
            "270": {"class_type": "PrimitiveBoolean", "inputs": {"value": False}},
            "274": {"class_type": "ComfySwitchNode", "inputs": {"switch": ["270", 0], "on_false": ["332", 0], "on_true": ["335", 0]}},
            "275": {"class_type": "ComfySwitchNode", "inputs": {"switch": ["270", 0], "on_false": ["332", 1], "on_true": ["335", 1]}},
            "332": {"class_type": "PixaromaSliders", "inputs": {"SlidersState": sliders(25, 1.5)}},
            "335": {"class_type": "PixaromaSliders", "inputs": {"SlidersState": sliders(8, 1)}},
        }
        self.assertEqual(rr.run_params(prompt), {"cfg": 1.5, "steps": 25, "seed": 77})
        prompt["270"]["inputs"]["value"] = True
        self.assertEqual(rr.run_params(prompt), {"cfg": 1, "steps": 8, "seed": 77})

    def test_pass_through_and_computed_node(self):
        prompt = {
            "1": {"class_type": "KSampler", "inputs": {"seed": 5, "steps": ["2", 0], "cfg": ["4", 0]}},
            "2": {"class_type": "Reroute-like", "inputs": {"input": ["3", 0]}},
            "3": {"class_type": "PrimitiveInt", "inputs": {"value": 12}},
            "4": {"class_type": "MathExpression", "_meta": {"title": "Math CFG"},
                  "inputs": {"expression": "a*2", "a": ["5", 0], "b": ["6", 0]}},
            "5": {"class_type": "PrimitiveFloat", "inputs": {"value": 2.0}},
            "6": {"class_type": "PrimitiveFloat", "inputs": {"value": 3.0}},
            "9": {"class_type": "OtherNode", "inputs": {"seed": 999}},   # pas un sampler : apres le KSampler
        }
        self.assertEqual(rr.run_params(prompt), {"cfg": None, "steps": 12, "seed": 5, "cfg_from": "Math CFG"})

    def test_models_and_loras_of_the_run(self):
        # Workflow reel (Projet lapin) : UNET -> LoRA turbo (branche du switch) -> LoraManager -> KSampler.
        prompt = {
            "194": {"class_type": "UNETLoader", "inputs": {"unet_name": "h3\\unet.safetensors", "weight_dtype": "default"}},
            "195": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen.safetensors", "type": "minimax"}},
            "196": {"class_type": "VAELoader", "inputs": {"vae_name": "video_vae.safetensors"}},
            "213": {"class_type": "VAELoader", "inputs": {"vae_name": "audio_vae.safetensors"}},
            "269": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["194", 0], "lora_name": "turbo.safetensors",
                                                                   "strength_model": 1}},
            "270": {"class_type": "PrimitiveBoolean", "inputs": {"value": True}},
            "271": {"class_type": "ComfySwitchNode", "inputs": {"switch": ["270", 0], "on_true": ["269", 0], "on_false": ["194", 0]}},
            "289": {"class_type": "Lora Loader (LoraManager)", "inputs": {"model": ["271", 0], "text": "<lora:b:0.7>", "loras": {
                "__value__": [{"name": "bounce", "strength": 0.7, "clipStrength": 0.7, "active": True},
                              {"name": "off", "strength": 1, "active": False}]}}},
            "300": {"class_type": "Power Lora Loader (rgthree)", "inputs": {"model": ["289", 0],
                    "lora_1": {"on": True, "lora": "p1.safetensors", "strength": 0.5},
                    "lora_2": {"on": False, "lora": "p2.safetensors", "strength": 1}}},
            "225": {"class_type": "KSampler", "inputs": {"model": ["300", 0], "positive": ["10", 0], "seed": 1, "steps": 8, "cfg": 1}},
            "10": {"class_type": "TextEncode", "inputs": {"clip": ["195", 0], "text": "x"}},
            "20": {"class_type": "VAEDecode", "inputs": {"samples": ["225", 0], "vae": ["196", 0]}},
            "21": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["225", 1], "vae": ["213", 0]}},
            "99": {"class_type": "LoraLoader", "inputs": {"model": ["194", 0], "lora_name": "unused.safetensors"}},  # hors chemin
        }
        m = rr.run_models(prompt)
        self.assertEqual(m["diffusion_model"], [P0("h3\\unet.safetensors")])
        self.assertEqual(m["text_encoder"], [P0("qwen.safetensors")])
        self.assertEqual(m["vae"], [P0("video_vae.safetensors"), P0("audio_vae.safetensors")])
        self.assertEqual(m["loras"], [
            {"name": "turbo.safetensors", "strength_model": 1, "strength_clip": None},
            {"name": "bounce", "strength_model": 0.7, "strength_clip": 0.7},
            {"name": "p1.safetensors", "strength_model": 0.5, "strength_clip": None}])
        # Switch sur l'autre branche : plus de LoRA turbo.
        prompt["270"]["inputs"]["value"] = False
        self.assertEqual([x["name"] for x in rr.run_models(prompt)["loras"]], ["bounce", "p1.safetensors"])
        self.assertEqual(rr.run_models(None), {"diffusion_model": [], "text_encoder": [], "vae": [], "loras": []})
        self.assertNotIn("audio_vae", rr.run_models(prompt))   # cle absente sans VAE audio LTX

    def test_run_models_ltx_loaders(self):
        # Chargeurs LTX 2.x : ckpt_name n'est pas toujours un modele de diffusion.
        prompt = {
            "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "ltx-2.3-distilled-1.1-fp8.safetensors"}},
            "2": {"class_type": "LTXAVTextEncoderLoader", "inputs": {
                "text_encoder": "gemma_3_12B_fp8.safetensors", "ckpt_name": "ltx-2.3-distilled-1.1-fp8.safetensors",
                "device": "default"}},
            "3": {"class_type": "LTXVAudioVAELoader", "inputs": {"ckpt_name": "ltx-2.3-audio-vae.safetensors"}},
            "4": {"class_type": "TextEncode", "inputs": {"clip": ["2", 0], "text": "x"}},
            "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["4", 0], "seed": 1,
                                                       "steps": 8, "cfg": 1}},
            "6": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["5", 0], "vae": ["3", 0]}},
        }
        m = rr.run_models(prompt)
        self.assertEqual(m["text_encoder"], [P0("gemma_3_12B_fp8.safetensors"),
                                             P0("ltx-2.3-distilled-1.1-fp8.safetensors")])
        self.assertEqual(m["audio_vae"], [P0("ltx-2.3-audio-vae.safetensors")])
        self.assertEqual(m["diffusion_model"], [P0("ltx-2.3-distilled-1.1-fp8.safetensors")])
        self.assertNotIn(P0("ltx-2.3-audio-vae.safetensors"), m["diffusion_model"])

    def test_file_names_given_by_links(self):
        # Workflow reel : noms donnes par "MODELS/CLIP/VAE/LoRA : File Select" (MultiFileSelect, sortie N -> field_N).
        select = {"class_type": "MultiFileSelect", "inputs": {
            "origin_dir": "G:\\models\\loras", "selected_dir": "minimaxh3/reducesteps", "output_mode": "Relatif",
            "model_type_1": "diffusion_models", "field_1": "H3\\unet.safetensors",
            "model_type_2": "text_encoders", "field_2": "qwen.safetensors",
            "model_type_3": "vae", "field_3": "video_vae.safetensors",
            "model_type_4": "vae", "field_4": "audio_vae.safetensors",
            "model_type_5": "loras", "field_5": "turbo.safetensors",
            "model_type_12": "loras", "field_12": "twelve.safetensors"}}
        prompt = {
            "240": select,
            "194": {"class_type": "UNETLoader", "inputs": {"unet_name": ["240", 0], "weight_dtype": "default"}},
            "195": {"class_type": "CLIPLoader", "inputs": {"clip_name": ["240", 1], "type": "minimax"}},
            "196": {"class_type": "VAELoader", "inputs": {"vae_name": ["240", 2]}},
            "213": {"class_type": "VAELoader", "inputs": {"vae_name": ["240", 3]}},
            "250": {"class_type": "Reroute-like", "inputs": {"any": ["240", 4]}},
            "269": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["194", 0], "lora_name": ["250", 0],
                                                                   "strength_model": 1}},
            "225": {"class_type": "KSampler", "inputs": {"model": ["269", 0], "positive": ["10", 0], "seed": 1, "steps": 8, "cfg": 1}},
            "10": {"class_type": "TextEncode", "inputs": {"clip": ["195", 0], "text": "x"}},
            "226": {"class_type": "VAEDecode", "inputs": {"samples": ["225", 0], "vae": ["196", 0]}},
            "227": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["225", 0], "vae": ["213", 0]}},
        }
        m = rr.run_models(prompt)
        self.assertEqual(m["diffusion_model"], [P0("H3\\unet.safetensors")])
        self.assertEqual(m["text_encoder"], [P0("qwen.safetensors")])
        self.assertEqual(m["vae"], [P0("video_vae.safetensors"), P0("audio_vae.safetensors")])
        self.assertEqual(m["loras"], [{"name": "turbo.safetensors", "strength_model": 1, "strength_clip": None}])
        # MultiFiles Select : sortie 6 = model_link (dossier), Option 1 / 2 = field_6 / field_7.
        select["inputs"]["field_6"] = "six.safetensors"
        self.assertIsNone(rr.resolve_file(prompt, ["240", 5]))
        self.assertEqual(rr.resolve_file(prompt, ["240", 6]), "six.safetensors")
        # Autre noeud a champs numerotes : sortie N -> champ *_N.
        prompt["241"] = {"class_type": "OtherSelect", "inputs": dict(select["inputs"])}
        self.assertEqual(rr.resolve_file(prompt, ["241", 11]), "twelve.safetensors")
        # Switch vers un nom de fichier : branche choisie.
        prompt["30"] = {"class_type": "PrimitiveBoolean", "inputs": {"value": False}}
        prompt["31"] = {"class_type": "Switch", "inputs": {"switch": ["30", 0], "on_true": ["240", 0], "on_false": ["240", 1]}}
        self.assertEqual(rr.resolve_file(prompt, ["31", 0]), "qwen.safetensors")
        self.assertIsNone(rr.resolve_file(prompt, ["999", 0]))

    def test_models_from_multi_file_select_linked_to_the_project(self):
        prompt = {
            "240": {"class_type": "MultiFileSelect", "inputs": {
                "model_type_1": "diffusion_models", "field_1": "H3\\unet.safetensors",
                "model_type_2": "text_encoders", "field_2": "qwen.safetensors",
                "model_type_3": "vae", "field_3": "video_vae.safetensors",
                "model_type_4": "vae", "field_4": "audio_vae.safetensors",
                "model_type_5": "loras", "field_5": "turbo.safetensors",
                "model_type_6": "", "field_6": "", "save_folder": "P/02.Models"}},
            "194": {"class_type": "UNETLoader", "inputs": {"unet_name": "other.safetensors"}},
            "225": {"class_type": "KSampler", "inputs": {"model": ["194", 0], "steps": 8, "cfg": 1}},
            "1": {"class_type": "MiniMaxH3Project", "inputs": {"state": "{}", "models_link": ["240", 5]}},
        }
        m = rr.run_models(prompt)
        self.assertEqual(m["diffusion_model"], [{"position": 1, "name": "H3\\unet.safetensors"}])
        self.assertEqual(m["text_encoder"], [{"position": 2, "name": "qwen.safetensors"}])
        self.assertEqual(m["vae"], [{"position": 3, "name": "video_vae.safetensors"},
                                    {"position": 4, "name": "audio_vae.safetensors"}])
        self.assertEqual(m["loras"], [])        # les LoRA restent lus dans le graphe
        # Non relie : le graphe, position 0.
        del prompt["1"]["inputs"]["models_link"]
        self.assertEqual(rr.run_models(prompt)["diffusion_model"], [P0("other.safetensors")])

    def test_run_models_from_selectmod(self):
        """MagicStudio SelectMod (29/10/2026) : lu comme MultiFiles Select."""
        def prompt_with(cls):
            return {
                "240": {"class_type": cls, "inputs": {
                    "model_type_1": "diffusion_models", "field_1": "H3/unet.safetensors",
                    "model_type_2": "text_encoders", "field_2": "qwen.safetensors",
                    "model_type_3": "vae", "field_3": "video_vae.safetensors", "save_folder": "P/02.Models"}},
                "194": {"class_type": "UNETLoader", "inputs": {"unet_name": "other.safetensors"}},
                "225": {"class_type": "KSampler", "inputs": {"model": ["194", 0], "steps": 8, "cfg": 1}},
                "1": {"class_type": "MiniMaxH3Project", "inputs": {"state": "{}", "models_link": ["240", 5]}},
            }
        self.assertEqual(rr.run_models(prompt_with("MagicStudioSelectMod")), rr.run_models(prompt_with("MultiFileSelect")))
        self.assertEqual(rr.run_models(prompt_with("MagicStudioSelectMod"))["diffusion_model"],
                         [{"position": 1, "name": "H3/unet.safetensors"}])

    def test_resolve_file_from_selectmod(self):
        prompt = {"240": {"class_type": "MagicStudioSelectMod", "inputs": {"field_3": " vae.safetensors "}}}
        self.assertEqual(rr.resolve_file(prompt, ["240", 2]), "vae.safetensors")

    def test_models_link_through_switch_multi_in_out(self):
        """Switch MultiIN-OUT entre MultiFiles Select et models_link : groupe actif seulement."""
        fs = lambda unet: {"class_type": "MultiFileSelect", "inputs": {
            "model_type_1": "diffusion_models", "field_1": unet, "save_folder": ""}}
        prompt = {
            "491": fs("F\\unet.safetensors"),
            "240": fs("N\\unet.safetensors"),
            "492": {"class_type": "UNETLoader", "inputs": {"unet_name": "F-graph.safetensors"}},
            "194": {"class_type": "UNETLoader", "inputs": {"unet_name": "N-graph.safetensors"}},
            "527": {"class_type": "SwitchMultiInOut", "inputs": {
                "group": "A", "pairs": 2, "show_c": False,
                "a1": ["491", 5], "a2": ["492", 0], "b1": ["240", 5], "b2": ["194", 0]}},
            "225": {"class_type": "KSampler", "inputs": {"model": ["527", 1], "steps": 8, "cfg": 1}},
            "1": {"class_type": "MiniMaxH3Project", "inputs": {"state": "{}", "models_link": ["527", 0]}},
        }
        self.assertEqual(rr.linked_file_select(prompt), prompt["491"])
        self.assertEqual(rr.run_models(prompt)["diffusion_model"], [{"position": 1, "name": "F\\unet.safetensors"}])
        prompt["527"]["inputs"]["group"] = "B"
        self.assertEqual(rr.linked_file_select(prompt), prompt["240"])
        # select relie (valeur "a" lue dans le graphe) : prend le dessus sur la pilule.
        prompt["9"] = {"class_type": "PrimitiveString", "inputs": {"value": "a"}}
        prompt["527"]["inputs"]["select"] = ["9", 0]
        self.assertEqual(rr.linked_file_select(prompt), prompt["491"])
        # Sans models_link : seul le groupe actif est lu dans le graphe.
        del prompt["1"]["inputs"]["models_link"]
        self.assertEqual(rr.run_models(prompt)["diffusion_model"], [P0("F-graph.safetensors")])

    def test_nothing_found(self):
        self.assertEqual(rr.run_params({"1": {"class_type": "X", "inputs": {"text": "a"}}}),
                         {"cfg": None, "steps": None, "seed": None})
        self.assertEqual(rr.run_params(None), {"cfg": None, "steps": None, "seed": None})
        self.assertIsNone(rr.run_mode({}))


class RunFileTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")
        self.out = os.path.join(self.root, "output")
        self.when = time.mktime((2026, 10, 17, 15, 30, 0, 0, 0, -1))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_start_writes_json(self):
        path = rr.start_run(self.p, "a red car", PROMPT, self.when)
        self.assertEqual(path, os.path.join(self.p, "04.Prompt", "20261017_153000_run.json"))
        data = read_json(path)
        self.assertEqual(data, {"date": "2026-10-17 15:30:00", "project": "Clip", "mode": "FL2VA",
                                "prompt": "a red car", "cfg": 7.5, "steps": 30, "seed": 44,
                                "models": {"diffusion_model": [], "text_encoder": [], "vae": [], "loras": []},
                                "status": "running", "outputs": []})
        # Meme seconde : la suivante.
        self.assertTrue(rr.start_run(self.p, "b", PROMPT, self.when).endswith("20261017_153001_run.json"))

    def test_start_writes_workflow(self):
        wf = {"nodes": [{"id": 1, "type": "KSampler"}], "links": [], "extra": {"t": "\u00e9"}}
        path = rr.start_run(self.p, "p", PROMPT, self.when, workflow=wf)
        saved = os.path.join(self.p, "00.Workflows", "Run", "20261017_153000_run.json")
        self.assertEqual(read_json(saved), wf)
        self.assertEqual(read_json(path)["workflow"], "00.Workflows/Run/20261017_153000_run.json")
        self.assertEqual(rr.list_runs(self.p)[0]["workflow"], saved)
        # Workflow orphelin deja present : le Run prend la seconde suivante (paires gardees).
        os.remove(path)
        self.assertTrue(rr.start_run(self.p, "q", PROMPT, self.when, workflow=wf).endswith("20261017_153001_run.json"))
        # Pas de workflow : pas de champ, list_runs -> None.
        other = rr.start_run(self.p, "r", PROMPT, self.when + 10)
        self.assertNotIn("workflow", read_json(other))
        self.assertIsNone([r for r in rr.list_runs(self.p) if r["file"] == os.path.basename(other)][0]["workflow"])
        # Les workflows des Runs ne sont pas des workflows du projet.
        self.assertEqual(projects.list_workflows(self.p), {"workflows": [], "archives": []})

    def test_read_run_workflow(self):
        wf = {"nodes": [{"id": 3}], "links": []}
        path = rr.start_run(self.p, "p", PROMPT, self.when, workflow=wf)
        self.assertEqual(rr.read_run_workflow(self.p, os.path.basename(path))["workflow"], wf)
        # Ancien Run sans workflow : celui du PNG rendu (texte "workflow").
        from PIL import Image, PngImagePlugin
        png = os.path.join(self.out, "a.png")
        os.makedirs(self.out, exist_ok=True)
        info = PngImagePlugin.PngInfo()
        info.add_text("workflow", json.dumps({"nodes": [{"id": 9}]}))
        Image.new("RGB", (4, 4)).save(png, pnginfo=info)
        old = rr.start_run(self.p, "p", PROMPT, self.when + 5)
        rr.finish_run(old, [{"filename": "a.png", "type": "output"}], "done", self.out)
        got = rr.read_run_workflow(self.p, os.path.basename(old))
        self.assertEqual((got["workflow"], got["source"]), ({"nodes": [{"id": 9}]}, png))
        # Rien nulle part.
        bare = os.path.join(self.out, "b.png")
        Image.new("RGB", (4, 4)).save(bare)
        none = rr.start_run(self.p, "p", PROMPT, self.when + 9)
        rr.finish_run(none, [{"filename": "b.png", "type": "output"}], "done", self.out)
        with self.assertRaises(FileNotFoundError):
            rr.read_run_workflow(self.p, os.path.basename(none))
        with self.assertRaises(ValueError):
            rr.read_run_workflow(self.p, "../x.json")

    def test_run_duration(self):
        from PIL import Image
        os.makedirs(self.out, exist_ok=True)
        Image.new("RGB", (4, 4)).save(os.path.join(self.out, "d.png"))
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(path, [{"filename": "d.png", "type": "output"}], "done", self.out, duration=187.44)
        self.assertEqual(data["duration"], 187.4)
        run = [r for r in rr.list_runs(self.p) if r["file"] == os.path.basename(path)][0]
        self.assertEqual(run["duration"], 187.4)
        # Sans duree de ComfyUI : depuis la date du JSON ; illisible : None.
        self.assertEqual(rr.run_duration(None, {"date": "2026-10-17 15:30:00"},
                                         rr._run_start({"date": "2026-10-17 15:30:00"}) + 65), 65.0)
        self.assertEqual(rr.run_duration("x", {"date": "2026-10-17 15:30:00"},
                                         rr._run_start({"date": "2026-10-17 15:30:00"}) + 3), 3.0)
        self.assertIsNone(rr.run_duration(-5, {}))
        self.assertEqual(rr.run_duration(0, {}), 0.0)

    def test_skipped_run_removes_its_workflow(self):
        path = rr.start_run(self.p, "p", PROMPT, self.when, workflow={"nodes": []})
        self.assertEqual(rr.finish_run(path, [], "interrupted", self.out)["skipped"], True)
        self.assertFalse(os.path.exists(os.path.join(self.p, "00.Workflows", "Run", "20261017_153000_run.json")))

    def test_fit_size(self):
        self.assertEqual(rr.fit_size(1216, 672), (960, 530))
        self.assertEqual(rr.fit_size(672, 1216), (300, 544))
        self.assertEqual(rr.fit_size(1920, 1080), (960, 540))
        self.assertIsNone(rr.fit_size(960, 544))
        self.assertIsNone(rr.fit_size(640, 480))
        self.assertEqual(rr.fit_size(1000, 544), (960, 522))

    def test_big_video_is_reduced_small_one_copied(self):
        import av
        big = os.path.join(self.out, "big_00001.mp4")
        small = os.path.join(self.out, "small_00001.mp4")
        make_video(big, 1216, 672)
        make_video(small, 320, 176, audio=False)
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(path, [{"filename": "big_00001.mp4", "type": "output"},
                                    {"filename": "small_00001.mp4", "type": "output"}], "done", self.out)
        self.assertEqual(data["outputs"], [
            {"source": big, "kind": "video", "copy": "40.Rush Videos/Footage/20261017_153000_run.mp4", "size": "1216x672", "copy_size": "960x530"},
            {"source": small, "kind": "video", "copy": "40.Rush Videos/Footage/20261017_153000_run_02.mp4", "size": "320x176"},
        ])
        done = os.path.join(self.p, "40.Rush Videos", "Footage", "20261017_153000_run.mp4")
        with av.open(done) as c:
            self.assertEqual((c.streams.video[0].codec_context.width, c.streams.video[0].codec_context.height), (960, 530))
            self.assertEqual(c.streams.video[0].frames, 6)
            self.assertEqual([s.codec_context.name for s in c.streams.audio], ["aac"])
        self.assertEqual(rr.video_size(big), (1216, 672))     # original intact
        self.assertEqual(sorted(os.listdir(os.path.join(self.p, "40.Rush Videos", "Footage"))),
                         ["20261017_153000_run.mp4", "20261017_153000_run_02.mp4"])

    def test_video_saved_in_rush_folder_is_left_alone(self):
        own = os.path.join(self.p, "40.Rush Videos", "clip_00001.mp4")
        make_video(own, 1216, 672, frames=2, audio=False)
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(path, [{"filename": "clip_00001.mp4", "fullpath": own}], "done", self.out)
        self.assertEqual(data["outputs"], [{"source": own, "kind": "video", "copy": "40.Rush Videos/clip_00001.mp4",
                                            "size": "1216x672", "in_place": True}])
        self.assertEqual(files_in(os.path.join(self.p, "40.Rush Videos")), ["clip_00001.mp4"])
        self.assertEqual(rr.video_size(own), (1216, 672))

    def test_failed_reduction_falls_back_to_copy(self):
        src = os.path.join(self.out, "big.mp4")
        make_video(src, 1216, 672, frames=2, audio=False)
        old = rr.resize_video
        rr.resize_video = lambda *a: (_ for _ in ()).throw(RuntimeError("no encoder"))
        try:
            data = rr.finish_run(rr.start_run(self.p, "p", PROMPT, self.when),
                                 [{"filename": "big.mp4", "type": "output"}], "done", self.out)
        finally:
            rr.resize_video = old
        self.assertEqual(data["outputs"][0]["copy"], "40.Rush Videos/Footage/20261017_153000_run.mp4")
        self.assertEqual(data["outputs"][0]["resize_error"], "no encoder")

    def test_finish_copies_outputs_to_rushes(self):
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        write(os.path.join(self.out, "ComfyUI_00001_.png"), b"i1")
        write(os.path.join(self.out, "sub", "ComfyUI_00002_.png"), b"i2")
        write(os.path.join(self.out, "video", "clip_00001.mp4"), b"v")
        write(os.path.join(self.out, "sound.flac"), b"s")
        files = [
            {"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"},
            {"filename": "ComfyUI_00002_.png", "subfolder": "sub", "type": "output"},
            {"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"},       # deja vu
            {"filename": "preview.png", "subfolder": "", "type": "temp"},               # apercu : ignore
            {"filename": "clip_00001.mp4", "subfolder": "video", "type": "output"},
            {"filename": "sound.flac", "subfolder": "", "type": "output"},              # ni image ni video
            {"filename": "../../escape.png", "subfolder": "", "type": "output"},         # hors de output
        ]
        data = rr.finish_run(path, files, "done", self.out)
        self.assertEqual(data["status"], "done")
        # Images citees sans copie (choix utilisateur) ; video illisible : copiee telle quelle.
        self.assertEqual([o["copy"] for o in data["outputs"]], [None, None, "40.Rush Videos/Footage/20261017_153000_run.mp4", None])
        self.assertEqual(data["outputs"][1]["source"], os.path.join(self.out, "sub", "ComfyUI_00002_.png"))
        self.assertEqual(files_in(os.path.join(self.p, "60.Rush Images")), [])
        self.assertEqual(read_json(path)["outputs"], data["outputs"])
        # Deja termine : rien n'est refait.
        again = rr.finish_run(path, [], "error", self.out)
        self.assertEqual(again["status"], "done")

    def test_real_paths_of_save_nodes(self):
        # Pixaroma Save Video (dossier choisi hors de output), Video Helper Suite (fullpath).
        rush = os.path.join(self.root, "elsewhere", "rush")
        write(os.path.join(rush, "Video_Shiz_001.mp4"), b"v")
        write(os.path.join(self.root, "vhs", "AnimateDiff_00001.mp4"), b"w")
        write(os.path.join(self.root, "vhs", "notes.txt"), b"t")
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(path, [
            {"filename": "Video_Shiz_001.mp4", "subfolder": "", "type": "output", "fullpath": "", "folder": rush},
            {"filename": "AnimateDiff_00001.mp4", "type": "output",
             "fullpath": os.path.join(self.root, "vhs", "AnimateDiff_00001.mp4")},
            {"filename": "notes.txt", "type": "output", "fullpath": os.path.join(self.root, "vhs", "notes.txt")},
            {"filename": "preview.mp4", "type": "temp", "fullpath": os.path.join(self.root, "vhs", "AnimateDiff_00001.mp4")},
            {"filename": "missing.mp4", "type": "output", "folder": rush},
        ], "done", self.out)
        self.assertEqual([o["source"] for o in data["outputs"]],
                         [os.path.join(rush, "Video_Shiz_001.mp4"), os.path.join(self.root, "vhs", "AnimateDiff_00001.mp4")])
        self.assertEqual([o["copy"] for o in data["outputs"]],
                         ["40.Rush Videos/Footage/20261017_153000_run.mp4", "40.Rush Videos/Footage/20261017_153000_run_02.mp4"])

    def test_reused_name_written_during_run_is_new(self):
        # Compteur de SaveImage reparti a 00001 (anciens fichiers effaces) : meme nom, fichier neuf.
        src = os.path.join(self.out, "ComfyUI_00001_.png")
        write(src, b"i1")
        os.utime(src, (self.when - 60, self.when - 60))
        files = [{"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"}]
        rr.finish_run(rr.start_run(self.p, "p", PROMPT, self.when - 60), files, "done", self.out)
        write(src, b"i2")
        os.utime(src, (self.when + 5, self.when + 5))
        res = rr.finish_run(rr.start_run(self.p, "p", PROMPT, self.when), files, "done", self.out)
        self.assertEqual(res["status"], "done")
        self.assertEqual(res["outputs"][0]["source"], src)

    def test_unchanged_run_is_not_recorded(self):
        write(os.path.join(self.out, "ComfyUI_00001_.png"), b"i1")
        # Fichier ecrit avant les Runs (le second le recoit du cache).
        os.utime(os.path.join(self.out, "ComfyUI_00001_.png"), (self.when - 60, self.when - 60))
        files = [{"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"}]
        first = rr.start_run(self.p, "p", PROMPT, self.when)
        rr.finish_run(first, files, "done", self.out)
        # Meme fichier renvoye par le cache de ComfyUI : JSON retire, rien de copie.
        second = rr.start_run(self.p, "p", PROMPT, self.when)
        res = rr.finish_run(second, files, "done", self.out)
        self.assertEqual(res, {"skipped": True, "same_as": "20261017_153000_run.json", "status": "done"})
        self.assertFalse(os.path.exists(second))
        self.assertEqual(files_in(os.path.join(self.p, "60.Rush Images")), [])
        # Nouveau fichier : enregistre.
        write(os.path.join(self.out, "ComfyUI_00002_.png"), b"i2")
        third = rr.start_run(self.p, "p", PROMPT, self.when)
        res = rr.finish_run(third, files + [{"filename": "ComfyUI_00002_.png", "subfolder": "", "type": "output"}],
                            "done", self.out)
        self.assertEqual(res["status"], "done")
        self.assertTrue(os.path.isfile(third))
        # Seul le fichier nouveau est garde (l'ancien, renvoye par le cache, est ignore).
        self.assertEqual([os.path.basename(o["source"]) for o in res["outputs"]], ["ComfyUI_00002_.png"])
        self.assertIsNone(res["outputs"][0]["copy"])

    def test_kind_and_list_runs(self):
        src_img = os.path.join(self.out, "ComfyUI_00001_.png")
        src_vid = os.path.join(self.root, "elsewhere", "v.mp4")
        write(src_img, b"i")
        write(src_vid, b"v")
        path = rr.start_run(self.p, "a bunny", PROMPT, self.when)
        data = rr.finish_run(path, [{"filename": "ComfyUI_00001_.png", "type": "output"},
                                    {"filename": "v.mp4", "fullpath": src_vid}], "done", self.out)
        self.assertEqual([o["kind"] for o in data["outputs"]], ["image", "video"])
        # Ancien JSON sans kind (deduit de l'extension), plus ancien ; fichier qui n'est pas un Run : ignore.
        old = os.path.join(self.p, "04.Prompt", "20261017_120000_run.json")
        with open(old, "w", encoding="utf-8") as f:
            json.dump({"date": "2026-10-17 12:00:00", "prompt": "old", "cfg": None, "cfg_from": "Math",
                       "status": "done", "outputs": [{"source": "Z:/gone.webm", "copy": "40.Rush Videos/x.webm"}]}, f)
        write(os.path.join(self.p, "04.Prompt", "notes.json"), b"{}")
        runs = rr.list_runs(self.p)
        self.assertEqual([r["file"] for r in runs], ["20261017_153000_run.json", "20261017_120000_run.json"])
        self.assertEqual(runs[0]["prompt"], "a bunny")
        img, vid = runs[0]["outputs"]
        self.assertEqual((img["kind"], img["source_exists"], img["copy"], img["folder"]), ("image", True, "", self.out))
        self.assertEqual(vid["kind"], "video")
        self.assertEqual(vid["copy"], os.path.join(self.p, "40.Rush Videos", "Footage", "20261017_153000_run.mp4"))
        self.assertTrue(vid["copy_exists"])
        self.assertEqual(runs[1]["cfg_from"], "Math")
        self.assertEqual(runs[1]["outputs"][0]["kind"], "video")
        self.assertFalse(runs[1]["outputs"][0]["source_exists"])
        self.assertFalse(runs[1]["outputs"][0]["copy_exists"])
        with self.assertRaises(FileNotFoundError):
            rr.list_runs(os.path.join(self.root, "nope"))

    def _run_with(self, outputs):
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.update({"status": "done", "outputs": outputs})
        rr._write(path, data)
        return os.path.basename(path)

    def test_sort_image_from_outside(self):
        src = os.path.join(self.out, "ComfyUI_00001_.png")
        write(src, b"img")
        rej = os.path.join(self.p, "60.Rush Images", "No Good")
        write(os.path.join(rej, "20261017_153000_run.png"), b"other")  # nom pris
        name = self._run_with([{"source": src, "kind": "image", "copy": None}])
        out = rr.list_runs(self.p)[0]["outputs"][0]
        self.assertEqual((out["in_project"], out["place"]), (False, None))
        res = rr.sort_output(self.p, name, 0, "rejected")
        dst = os.path.join(rej, "20261017_153000_run_02.png")
        self.assertEqual(res, {"source": dst, "copy": "60.Rush Images/No Good/20261017_153000_run_02.png",
                               "moved_from": src, "place": "rejected"})
        self.assertFalse(os.path.exists(src))
        with open(dst, "rb") as f:
            self.assertEqual(f.read(), b"img")
        out = rr.list_runs(self.p)[0]["outputs"][0]
        self.assertEqual((out["in_project"], out["place"], out["source"]), (True, "rejected", dst))
        with self.assertRaises(ValueError):          # deja dans Rejected
            rr.sort_output(self.p, name, 0, "rejected")
        # Puis d'un sous-dossier a l'autre : simple renommage, nom garde.
        rr.sort_output(self.p, name, 0, "validated")
        val = os.path.join(self.p, "60.Rush Images", "Rough Cut", "20261017_153000_run_02.png")
        self.assertTrue(os.path.isfile(val))
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][0]
        self.assertEqual((o["source"], o["copy"]), (val, "60.Rush Images/Rough Cut/20261017_153000_run_02.png"))
        with self.assertRaises(ValueError):
            rr.sort_output(self.p, name, 0, "nowhere")

    def test_sort_video_from_outside_replaces_reduced_copy(self):
        src = os.path.join(self.root, "rush", "Video_001.webm")
        write(src, b"full")
        copy = os.path.join(self.p, "40.Rush Videos", "Footage", "20261017_153000_run.mp4")
        write(copy, b"small")
        name = self._run_with([{"source": src, "kind": "video", "copy": "40.Rush Videos/Footage/20261017_153000_run.mp4",
                                "size": "1216x672", "copy_size": "960x530"}])
        out = rr.list_runs(self.p)[0]["outputs"][0]
        self.assertEqual((out["in_project"], out["place"]), (False, "footage"))
        rr.sort_output(self.p, name, 0, "validated")
        self.assertEqual(files_in(os.path.join(self.p, "40.Rush Videos", "Footage")), [])
        self.assertEqual(files_in(os.path.join(self.p, "40.Rush Videos", "Rough Cut")), ["20261017_153000_run.webm"])
        self.assertFalse(os.path.exists(src))
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][0]
        self.assertEqual(o["copy"], "40.Rush Videos/Rough Cut/20261017_153000_run.webm")
        self.assertEqual(o["moved_from"], src)
        self.assertNotIn("copy_size", o)
        self.assertEqual(o["size"], "1216x672")
        # Original rapatrie dans le dossier ou est deja sa copie : la copie est remplacee.
        src2 = os.path.join(self.root, "rush", "Video_002.webm")
        write(src2, b"full2")
        copy2 = os.path.join(self.p, "40.Rush Videos", "Footage", "x.webm")
        write(copy2, b"small2")
        name2 = os.path.basename(rr.start_run(self.p, "p", PROMPT, self.when + 60))
        data = read_json(os.path.join(self.p, "04.Prompt", name2))
        data.update({"status": "done", "outputs": [{"source": src2, "kind": "video", "copy": "40.Rush Videos/Footage/x.webm"}]})
        rr._write(os.path.join(self.p, "04.Prompt", name2), data)
        rr.sort_output(self.p, name2, 0, "footage")
        with open(copy2, "rb") as f:
            self.assertEqual(f.read(), b"full2")

    def test_sort_copy_when_original_is_gone(self):
        copy = os.path.join(self.p, "40.Rush Videos", "Footage", "20261017_153000_run.mp4")
        write(copy, b"small")
        name = self._run_with([{"source": "Z:/gone.mp4", "kind": "video", "copy": "40.Rush Videos/Footage/20261017_153000_run.mp4"}])
        rr.sort_output(self.p, name, 0, "rejected")
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][0]
        self.assertEqual((o["source"], o["copy"]), ("Z:/gone.mp4", "40.Rush Videos/No Good/20261017_153000_run.mp4"))
        self.assertTrue(os.path.isfile(os.path.join(self.p, "40.Rush Videos", "No Good", "20261017_153000_run.mp4")))

    def test_root_files_go_to_footage(self):
        # Anciens Runs : copie video et image rapatriee a la racine de 40 / 60 ; fichier non cite : laisse.
        vid = os.path.join(self.p, "40.Rush Videos", "20261017_153000_run.mp4")
        img = os.path.join(self.p, "60.Rush Images", "20261017_153000_run.png")
        write(vid, b"v")
        write(img, b"i")
        write(os.path.join(self.p, "60.Rush Images", "mine.png"), b"m")
        name = self._run_with([
            {"source": "Z:/gone.mp4", "kind": "video", "copy": "40.Rush Videos/20261017_153000_run.mp4"},
            {"source": img, "kind": "image", "copy": "60.Rush Images/20261017_153000_run.png", "in_place": True},
        ])
        vid_out, img_out = rr.list_runs(self.p)[0]["outputs"]
        self.assertEqual(vid_out["copy"], os.path.join(self.p, "40.Rush Videos", "Footage", "20261017_153000_run.mp4"))
        self.assertEqual((vid_out["place"], vid_out["in_project"]), ("footage", False))
        fimg = os.path.join(self.p, "60.Rush Images", "Footage", "20261017_153000_run.png")
        self.assertEqual((img_out["source"], img_out["place"], img_out["in_project"]), (fimg, "footage", True))
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][1]
        self.assertEqual((o["source"], o["copy"]), (fimg, "60.Rush Images/Footage/20261017_153000_run.png"))
        self.assertEqual(files_in(os.path.join(self.p, "60.Rush Images")), ["mine.png"])
        self.assertEqual(rr.tidy_rush(self.p), 0)

    def _status_run(self, when, status):
        path = rr.start_run(self.p, "p", PROMPT, when, workflow={"nodes": []})
        data = read_json(path)
        data["status"] = status
        rr._write(path, data)
        return os.path.basename(path)

    def test_purge_runs(self):
        running = self._status_run(self.when, "running")
        error = self._status_run(self.when + 60, "error")
        done = self._status_run(self.when + 120, "done")
        vid = os.path.join(self.p, "40.Rush Videos", "Footage", error.replace(".json", ".mp4"))
        write(vid, b"v")
        prompt = os.path.join(self.p, "04.Prompt")
        wf = os.path.join(self.p, "00.Workflows", "Run")
        err = os.path.join(self.p, "98.Error")
        write(os.path.join(err, error), b"older")  # nom pris
        # Compte seulement : rien n'est touche.
        plan = rr.purge_runs(self.p, dry_run=True)
        self.assertEqual(plan, {"deleted": [running], "moved": [error], "kept": [], "empty": [done]})
        self.assertEqual(files_in(prompt), sorted([running, error, done]))
        # ComfyUI occupe : le Run "running" est garde.
        self.assertEqual(rr.purge_runs(self.p, busy=True, dry_run=True)["kept"], [running])
        out = rr.purge_runs(self.p)
        self.assertEqual(out, {"deleted": [running], "moved": [error], "kept": [], "empty": [done]})
        self.assertEqual(files_in(prompt), [done])
        self.assertEqual(files_in(wf), [done])
        self.assertEqual(files_in(err), sorted([error, error.replace(".json", "_02.json")]))
        self.assertEqual(files_in(os.path.join(err, "Workflows")), [error])
        self.assertEqual(read_json(os.path.join(err, error.replace(".json", "_02.json")))["status"], "error")
        self.assertTrue(os.path.isfile(vid))  # fichiers produits laisses en place
        self.assertEqual([r["file"] for r in rr.list_runs(self.p)], [done])
        self.assertEqual(rr.purge_runs(self.p), {"deleted": [], "moved": [], "kept": [], "empty": [done]})

    def test_purge_empty_done(self):
        empty = self._status_run(self.when, "done")
        gone = self._status_run(self.when + 60, "done")
        path = os.path.join(self.p, "04.Prompt", gone)
        data = read_json(path)
        data["outputs"] = [{"source": "Z:/gone.png", "kind": "image", "copy": None}]  # fichier disparu : garde
        rr._write(path, data)
        prompt = os.path.join(self.p, "04.Prompt")
        wf = os.path.join(self.p, "00.Workflows", "Run")
        # Sans la case : listes, rien n'est supprime.
        self.assertEqual(rr.purge_runs(self.p)["empty"], [empty])
        self.assertEqual(files_in(prompt), sorted([empty, gone]))
        self.assertEqual(rr.purge_runs(self.p, dry_run=True, empty_done=True)["empty"], [empty])
        self.assertEqual(files_in(prompt), sorted([empty, gone]))
        # Avec la case : JSON et workflow supprimes ; la sortie citee disparue reste.
        self.assertEqual(rr.purge_runs(self.p, empty_done=True)["empty"], [empty])
        self.assertEqual(files_in(prompt), [gone])
        self.assertEqual(files_in(wf), [gone])

    def test_purge_busy_keeps_running(self):
        running = self._status_run(self.when, "running")
        self.assertEqual(rr.purge_runs(self.p, busy=True), {"deleted": [], "moved": [], "kept": [running], "empty": []})
        self.assertEqual(files_in(os.path.join(self.p, "04.Prompt")), [running])
        self.assertFalse(os.path.exists(os.path.join(self.p, "98.Error")))

    def test_sort_failure_keeps_original(self):
        src = os.path.join(self.out, "a.png")
        write(src, b"img")
        name = self._run_with([{"source": src, "kind": "image", "copy": None}])
        old = rr.file_sha256
        calls = []
        rr.file_sha256 = lambda p: calls.append(p) or ("x" if p.endswith(".part") else "y")
        try:
            with self.assertRaises(IOError):
                rr.sort_output(self.p, name, 0, "footage")
        finally:
            rr.file_sha256 = old
        self.assertTrue(os.path.isfile(src))
        self.assertEqual(files_in(os.path.join(self.p, "60.Rush Images", "Footage")), [])
        with self.assertRaises(ValueError):
            rr.sort_output(self.p, name, 5, "footage")
        os.remove(src)
        with self.assertRaises(FileNotFoundError):
            rr.sort_output(self.p, name, 0, "footage")

    def test_sort_inside_project_is_verified(self):
        # D'un sous-dossier a l'autre : copie + SHA256 + suppression ; echec = original garde.
        foot = os.path.join(self.p, "60.Rush Images", "Footage", "a.png")
        write(foot, b"img")
        name = self._run_with([{"source": foot, "kind": "image", "copy": "60.Rush Images/Footage/a.png", "in_place": True}])
        old = rr.file_sha256
        rr.file_sha256 = lambda p: "x" if p.endswith(".part") else "y"
        try:
            with self.assertRaises(IOError):
                rr.sort_output(self.p, name, 0, "validated")
        finally:
            rr.file_sha256 = old
        self.assertTrue(os.path.isfile(foot))
        self.assertEqual(files_in(os.path.join(self.p, "60.Rush Images", "Rough Cut")), [])
        rr.sort_output(self.p, name, 0, "validated")
        self.assertFalse(os.path.exists(foot))
        self.assertEqual(files_in(os.path.join(self.p, "60.Rush Images", "Rough Cut")), ["a.png"])

    def test_old_sort_folders_are_migrated(self):
        # Rejected / Validated (avant le 22/10/2026) -> No Good / Rough Cut, JSON suivis.
        vids = os.path.join(self.p, "40.Rush Videos")
        shutil.rmtree(os.path.join(vids, "No Good"))
        old_rej = os.path.join(vids, "Rejected", "a.mp4")
        old_val = os.path.join(self.p, "60.Rush Images", "Validated", "b.png")
        clash = os.path.join(self.p, "60.Rush Images", "Rough Cut", "b.png")
        write(old_rej, b"a")
        write(old_val, b"b")
        write(clash, b"other")                       # nouveau dossier deja la, nom pris
        name = self._run_with([
            {"source": old_rej, "kind": "video", "copy": "40.Rush Videos/Rejected/a.mp4", "in_place": True},
            {"source": old_val, "kind": "image", "copy": None},
        ])
        a, b = rr.list_runs(self.p)[0]["outputs"]
        new_rej = os.path.join(vids, "No Good", "a.mp4")
        new_val = os.path.join(self.p, "60.Rush Images", "Rough Cut", "b_02.png")
        self.assertEqual((a["source"], a["place"]), (new_rej, "rejected"))
        self.assertEqual((b["source"], b["place"]), (new_val, "validated"))
        self.assertFalse(os.path.exists(os.path.join(vids, "Rejected")))
        self.assertFalse(os.path.exists(os.path.join(self.p, "60.Rush Images", "Validated")))
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"]
        self.assertEqual(o[0]["copy"], "40.Rush Videos/No Good/a.mp4")
        # Migration interrompue (dossier renomme, JSON pas encore) : le chemin est retrouve.
        o[0]["source"] = old_rej
        rr._write(os.path.join(self.p, "04.Prompt", name), read_json(os.path.join(self.p, "04.Prompt", name)) | {"outputs": o})
        self.assertEqual(rr.list_runs(self.p)[0]["outputs"][0]["source"], new_rej)

    def _lock_runs(self, kind_dir, files):
        """Un Run par fichier deja range : [(nom du JSON, chemin)]."""
        out = []
        for i, (sub, n) in enumerate(files):
            path = os.path.join(self.p, kind_dir, sub, n)
            write(path, n.encode())
            name = self._run_with([{"source": path, "kind": "image", "copy": None}])
            out.append((name, path))
            self.when += 1
        return out

    def _lock_runs_kind(self, kind_dir, kind, files):
        """Comme _lock_runs, pour une video ou une image : [(nom du JSON, chemin)]."""
        out = []
        for sub, n in files:
            path = os.path.join(self.p, kind_dir, sub, n)
            write(path, n.encode())
            name = self._run_with([{"source": path, "kind": kind, "copy": None}])
            out.append((name, path))
            self.when += 1
        return out

    def test_single_lock_everywhere(self):
        # Un seul fichier dans Picture Lock, projet simple compris (Extract Frame, 26/10/2026).
        self.assertTrue(rr.single_lock(self.p))
        for rush, kind, ext in (("60.Rush Images", "image", "png"), ("40.Rush Videos", "video", "mp4")):
            lock = os.path.join(self.p, rush, "Picture Lock")
            a, b = "a." + ext, "b." + ext
            (ra, _), (rb, pb) = self._lock_runs_kind(rush, kind, [("Footage", a), ("No Good", b)])
            rr.sort_output(self.p, ra, 0, "picture_lock")
            with self.assertRaises(ValueError):          # occupe : refus sans swap
                rr.sort_output(self.p, rb, 0, "picture_lock")
            self.assertTrue(os.path.isfile(pb))
            res = rr.sort_output(self.p, rb, 0, "picture_lock", swap=True)
            self.assertEqual(res["swapped"]["place"], "rejected")
            self.assertEqual(files_in(lock), [b])
            self.assertEqual(files_in(os.path.join(self.p, rush, "No Good")), [a])

    def test_lock_overfull(self):
        self.assertEqual(rr.lock_overfull(self.p), {})
        vlock = os.path.join(self.p, "40.Rush Videos", "Picture Lock")
        write(os.path.join(vlock, "a.mp4"))
        self.assertEqual(rr.lock_overfull(self.p), {})
        write(os.path.join(vlock, "b.mp4"))
        write(os.path.join(vlock, "c.mp4.part"))          # copie en cours : ignoree
        self.assertEqual(rr.lock_overfull(self.p), {"video": 2})
        write(os.path.join(self.p, "70.Rush Audio", "Picture Lock", "a.wav"))
        write(os.path.join(self.p, "70.Rush Audio", "Picture Lock", "b.wav"))
        write(os.path.join(self.p, "60.Rush Images", "Picture Lock", "a.png"))
        self.assertEqual(rr.lock_overfull(self.p), {"video": 2, "audio": 2})

    def test_extract_dir_not_counted(self):
        # Extract Frame (dans Picture Lock) n'est ni compte, ni orphelin, ni vu par le Final Cut.
        import final_cut
        before = (rr.sort_counts(self.p), rr.rush_orphans(self.p), rr.lock_overfull(self.p))
        plan_before = final_cut.plan(self.p)["count"]
        write(os.path.join(self.p, *projects.EXTRACT_DIR, "frame_001.png"))
        write(os.path.join(self.p, *projects.EXTRACT_DIR, "frame_002.png"))
        self.assertEqual((rr.sort_counts(self.p), rr.rush_orphans(self.p), rr.lock_overfull(self.p)), before)
        self.assertEqual(final_cut.plan(self.p)["count"], plan_before)
        self.assertEqual(rr.lock_files(self.p, "video"), [])

    def test_picture_lock_holds_one_file_in_a_multiproject(self):
        self.p = projects.create_project(self.root, "Shot", group="Film", new_group=True)
        self.assertTrue(rr.single_lock(self.p))
        lock = os.path.join(self.p, "60.Rush Images", "Picture Lock")
        (a, pa), (b, pb), (c, pc) = self._lock_runs("60.Rush Images",
                                                    [("Footage", "a.png"), ("No Good", "b.png"), ("Rough Cut", "c.png")])
        rr.sort_output(self.p, a, 0, "picture_lock")
        self.assertEqual(files_in(lock), ["a.png"])
        with self.assertRaises(ValueError):          # occupe : refus sans swap
            rr.sort_output(self.p, b, 0, "picture_lock")
        self.assertTrue(os.path.isfile(pb))
        # Swap : a part dans No Good (dossier de b), b entre ; les deux JSON suivent.
        res = rr.sort_output(self.p, b, 0, "picture_lock", swap=True)
        self.assertEqual(res["swapped"], {"file": os.path.join(self.p, "60.Rush Images", "No Good", "a.png"),
                                          "place": "rejected"})
        self.assertEqual(files_in(lock), ["b.png"])
        places = {r["file"]: r["outputs"][0]["place"] for r in rr.list_runs(self.p)}
        self.assertEqual((places[a], places[b], places[c]), ("rejected", "picture_lock", "validated"))
        # Fichier venu d'ailleurs : l'ancien part dans Rough Cut.
        src = os.path.join(self.out, "d.png")
        write(src, b"d")
        self.when += 1
        d = self._run_with([{"source": src, "kind": "image", "copy": None}])
        rr.sort_output(self.p, d, 0, "picture_lock", swap=True)
        self.assertEqual(files_in(lock), [os.path.basename(rr.list_runs(self.p)[0]["outputs"][0]["source"])])
        self.assertTrue(os.path.isfile(os.path.join(self.p, "60.Rush Images", "Rough Cut", "b.png")))
        # Deux fichiers deposes a la main : refus, rien ne bouge.
        write(os.path.join(lock, "extra.png"), b"e")
        with self.assertRaises(ValueError):
            rr.sort_output(self.p, c, 0, "picture_lock", swap=True)
        self.assertTrue(os.path.isfile(pc))
        # Les videos ont leur propre Picture Lock.
        self.assertEqual(rr.lock_files(self.p, "video"), [])

    def test_counts_and_orphans(self):
        # Copie deposee a la main dans Picture Lock, identique au fichier du Run (dans Footage).
        foot = os.path.join(self.p, "40.Rush Videos", "Footage", "v.mp4")
        lock = os.path.join(self.p, "40.Rush Videos", "Picture Lock", "v.mp4")
        lone = os.path.join(self.p, "40.Rush Videos", "No Good", "other.mp4")
        write(foot, b"video")
        write(lock, b"video")
        write(lone, b"vidoe")                        # meme taille, contenu different
        name = self._run_with([{"source": foot, "kind": "video", "copy": "40.Rush Videos/Footage/v.mp4", "in_place": True}])
        self.assertEqual(rr.sort_counts(self.p)["video"],
                         {"picture_lock": 1, "validated": 0, "footage": 1, "rejected": 1})
        orphans = {o["path"]: o for o in rr.rush_orphans(self.p)}
        self.assertEqual(set(orphans), {lock, lone})
        self.assertEqual(orphans[lock]["dup"], {"run": name, "index": 0, "path": foot, "place": "footage"})
        self.assertEqual((orphans[lock]["place"], orphans[lone]["dup"]), ("picture_lock", None))
        trashed = []
        trash = lambda ps: [trashed.extend(ps), os.remove(ps[0])]
        with self.assertRaises(ValueError):          # fichiers differents : refus
            rr.resolve_duplicate(self.p, name, 0, lone, "orphan", trash)
        # Garder celui de Picture Lock : le Run le suit, l'autre part dans la Corbeille.
        res = rr.resolve_duplicate(self.p, name, 0, lock, "orphan", trash)
        self.assertEqual((res, trashed), ({"kept": lock, "trashed": foot}, [foot]))
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][0]
        self.assertEqual((o["source"], o["copy"]), (lock, "40.Rush Videos/Picture Lock/v.mp4"))
        self.assertEqual(rr.list_runs(self.p)[0]["outputs"][0]["place"], "picture_lock")
        self.assertEqual([x["path"] for x in rr.rush_orphans(self.p)], [lone])
        # Garder celui du Run : le fichier depose part dans la Corbeille.
        write(foot, b"video")
        trashed.clear()
        self.assertEqual(rr.resolve_duplicate(self.p, name, 0, foot, "run", trash), {"kept": lock, "trashed": foot})
        self.assertFalse(os.path.exists(foot))

    def test_runs_of_a_renamed_project_are_relinked(self):
        # Dossier de projets renomme a la main : les JSON gardent l'ancien chemin.
        vids = os.path.join(self.p, "40.Rush Videos")
        old = os.path.join(self.root, "Porjet", "Clip", "40.Rush Videos")
        lock = os.path.join(vids, "Picture Lock", "a.mp4")
        good = os.path.join(vids, "No Good", "b.mp4")
        foot = os.path.join(vids, "Footage", "c.mp4")
        for f in (lock, good, foot):
            write(f, b"v")
        name = self._run_with([
            # copie deplacee par les boutons, source restee sur l'ancien chemin
            {"source": os.path.join(old, "Validated", "a.mp4"), "kind": "video",
             "copy": "40.Rush Videos/Picture Lock/a.mp4", "in_place": True},
            # meme fin de chemin, ancien nom de dossier Rejected
            {"source": os.path.join(old, "Rejected", "b.mp4"), "kind": "video", "copy": None},
            # fin de chemin introuvable, copie du projet (rapatriee)
            {"source": os.path.join(old, "Elsewhere", "c.mp4"), "kind": "video",
             "copy": "40.Rush Videos/Footage/c.mp4", "in_place": True},
            # original hors du projet disparu, sans copie : laisse tel quel
            {"source": os.path.join(self.root, "output", "gone.mp4"), "kind": "video", "copy": None},
        ])
        outs = rr.list_runs(self.p)[0]["outputs"]
        self.assertEqual([(o["source"], o["in_project"], o["place"]) for o in outs[:3]],
                         [(lock, True, "picture_lock"), (good, True, "rejected"), (foot, True, "footage")])
        self.assertEqual((outs[3]["in_project"], outs[3]["source_exists"]), (False, False))
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"]
        self.assertEqual([x["source"] for x in o[:3]], [lock, good, foot])

    def test_duplicate_kept_even_if_the_recycle_bin_refuses(self):
        foot = os.path.join(self.p, "40.Rush Videos", "Footage", "v.mp4")
        lock = os.path.join(self.p, "40.Rush Videos", "Picture Lock", "v.mp4")
        write(foot, b"video")
        write(lock, b"video")
        name = self._run_with([{"source": foot, "kind": "video", "copy": "40.Rush Videos/Footage/v.mp4", "in_place": True}])

        def busy(paths):
            raise OSError("Could not move the files to the Recycle Bin (code 32).")
        res = rr.resolve_duplicate(self.p, name, 0, lock, "orphan", busy)
        self.assertEqual(res, {"kept": lock, "trashed": None, "other": foot,
                               "trash_error": "Could not move the files to the Recycle Bin (code 32)."})
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][0]
        self.assertEqual((o["source"], o["copy"]), (lock, "40.Rush Videos/Picture Lock/v.mp4"))
        # L'autre exemplaire est maintenant un orphelin identique au fichier du Run : Retry.
        orph = rr.rush_orphans(self.p)
        self.assertEqual([(x["path"], x["dup"]["path"]) for x in orph], [(foot, lock)])
        trashed = []
        res = rr.resolve_duplicate(self.p, name, 0, foot, "run", lambda ps: [trashed.extend(ps), os.remove(ps[0])])
        self.assertEqual((res, trashed), ({"kept": lock, "trashed": foot}, [foot]))

    def test_delete_rush(self):
        rej = os.path.join(self.p, "40.Rush Videos", "No Good", "v.mp4")
        foot = os.path.join(self.p, "60.Rush Images", "Footage", "i.png")
        write(rej, b"v")
        write(foot, b"i")
        name = self._run_with([
            {"source": rej, "kind": "video", "copy": "40.Rush Videos/No Good/v.mp4", "in_place": True},
            {"source": foot, "kind": "image", "copy": "60.Rush Images/Footage/i.png", "in_place": True},
        ])
        with self.assertRaises(ValueError):          # hors de Rejected : refus
            rr.delete_rush(self.p, name, 1)
        self.assertTrue(os.path.isfile(foot))
        trashed = []
        res = rr.delete_rush(self.p, name, 0, trash_fn=lambda ps: [trashed.extend(ps), os.remove(ps[0])], now="20261020_101010")
        self.assertEqual(res["deleted"], {"date": "20261020_101010", "how": "trash", "from": rej})
        self.assertEqual(trashed, [rej])
        o = read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][0]
        self.assertEqual(o["deleted"]["how"], "trash")
        run = rr.list_runs(self.p)[0]
        self.assertEqual(run["status"], "done")
        out = run["outputs"][0]
        self.assertEqual(out["deleted"]["from"], rej)
        self.assertFalse(out["copy_exists"])
        # Deja supprime : FileNotFoundError ; la Purge garde le Run (pas vide).
        with self.assertRaises(FileNotFoundError):
            rr.delete_rush(self.p, name, 0)
        self.assertEqual(rr.purge_runs(self.p, dry_run=True)["empty"], [])
        # Restaure depuis la Corbeille : la marque est retiree a la lecture.
        write(rej, b"v")
        out = rr.list_runs(self.p)[0]["outputs"][0]
        self.assertNotIn("deleted", out)
        self.assertEqual(out["place"], "rejected")
        self.assertNotIn("deleted", read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][0])
        # Suppression definitive.
        rr.delete_rush(self.p, name, 0)
        self.assertFalse(os.path.exists(rej))
        self.assertEqual(read_json(os.path.join(self.p, "04.Prompt", name))["outputs"][0]["deleted"]["how"], "permanent")

    def test_registries_at_the_end_of_the_run(self):
        img = os.path.join(self.out, "a.png")
        models = {"diffusion_model": ["u.safetensors"], "text_encoder": ["t.safetensors"], "vae": ["v1", "v2"],
                  "loras": [{"name": "bounce", "strength_model": 0.7, "strength_clip": 0.7},
                            {"name": "turbo", "strength_model": 1, "strength_clip": None}]}

        def run(when_offset, m, content):
            path = rr.start_run(self.p, "p", PROMPT, self.when + when_offset)
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["models"] = m
            rr._write(path, data)
            write(img, content)
            os.utime(img, (self.when + when_offset + 1, self.when + when_offset + 1))
            return rr.finish_run(path, [{"filename": "a.png", "type": "output"}], "done", self.out,
                                 now="2026-10-17 15:%02d:00" % (30 + when_offset // 60))

        first = run(0, models, b"1")
        self.assertEqual((first["models"], first["loras"]), ([{"indiceMODELS": 1}], [{"indiceLoRA": 1}]))
        self.assertEqual(list(first)[list(first).index("models") + 1], "loras")
        reg_m = rr.read_registry(self.p, "models")
        self.assertRegex(os.path.basename(rr.registry_file(self.p, "models")), r"^20261017_153000_models\.json$")
        self.assertRegex(os.path.basename(rr.registry_file(self.p, "lora")), r"^20261017_153000_LoRA\.json$")
        self.assertEqual((reg_m["DernierIndiceMODELS"], reg_m["IndiceEnCoursMODELS"]), (1, 1))
        self.assertEqual(reg_m["MODELS"][0]["vae"], [P0("v1"), P0("v2")])
        reg_l = rr.read_registry(self.p, "lora")
        self.assertEqual(reg_l["LoRA"][0]["ListeName"], {
            "LoRA01": {"name": "bounce", "strength_model": 0.7, "strength_clip": 0.7},
            "LoRA02": {"name": "turbo", "strength_model": 1, "strength_clip": None}})
        # Meme ensemble (LoRA dans un autre ordre) : memes indices, datemodifi mise a jour.
        same = dict(models, loras=list(reversed(models["loras"])))
        second = run(120, same, b"2")
        self.assertEqual((second["models"], second["loras"]), ([{"indiceMODELS": 1}], [{"indiceLoRA": 1}]))
        reg_l = rr.read_registry(self.p, "lora")
        self.assertEqual((len(reg_l["LoRA"]), reg_l["LoRA"][0]["datemodifi"]), (1, "2026-10-17 15:32:00"))
        # Force modifiee : nouvelle entree LoRA ; modeles inchanges.
        changed = dict(models, loras=[{"name": "bounce", "strength_model": 0.8, "strength_clip": 0.8}])
        third = run(240, changed, b"3")
        self.assertEqual((third["models"], third["loras"]), ([{"indiceMODELS": 1}], [{"indiceLoRA": 2}]))
        reg_l = rr.read_registry(self.p, "lora")
        self.assertEqual((reg_l["DernierIndiceLoRA"], reg_l["IndiceEnCoursLoRA"]), (2, 2))
        # Sans LoRA : liste vide, indice en cours 0.
        fourth = run(360, dict(models, loras=[]), b"4")
        self.assertEqual(fourth["loras"], [])
        self.assertEqual(rr.current_index(self.p, "lora"), 0)
        # Fenetres : detail relu dans les registres.
        runs = {r["file"]: r for r in rr.list_runs(self.p)}
        detail = runs["20261017_153400_run.json"]["models"]
        self.assertEqual(detail["diffusion_model"], [P0("u.safetensors")])
        self.assertEqual(detail["loras"], [{"name": "bounce", "strength_model": 0.8, "strength_clip": 0.8}])
        # Fenetres 02 / 06 : numeros des ensembles de chaque Run, et ensembles des registres.
        self.assertEqual(runs["20261017_153400_run.json"]["sets"], {"models": [1], "lora": [2]})
        self.assertEqual(runs["20261017_153600_run.json"]["sets"], {"models": [1], "lora": []})
        sets = rr.registry_sets(self.p)
        self.assertEqual([s["index"] for s in sets["lora"]], [1, 2])
        self.assertEqual(sets["lora"][1]["loras"], [{"name": "bounce", "strength_model": 0.8, "strength_clip": 0.8}])
        self.assertEqual(sets["models"][0]["vae"], [P0("v1"), P0("v2")])
        # Ancien Run au bloc complet : ensemble identique du registre.
        regs = {k: rr.read_registry(self.p, k) for k in rr.REGISTRIES}
        self.assertEqual(rr.run_sets({"models": changed}, regs), {"models": [1], "lora": [2]})
        self.assertEqual(rr.run_sets({"models": dict(models, vae=["other"])}, regs), {"models": [], "lora": [1]})
        self.assertEqual(rr.registry_sets(os.path.join(self.root, "none")), {"models": [], "lora": []})

    def test_registry_audio_vae_group(self):
        # VAE audio LTX 2.x : garde dans l'ensemble ; un ensemble MiniMax n'a pas la cle.
        base = {"diffusion_model": ["u"], "text_encoder": [], "vae": []}
        i1 = rr.register_config(self.p, "models", base, None)
        i2 = rr.register_config(self.p, "models", dict(base, audio_vae=["a.safetensors"]), None)
        self.assertEqual((i1, i2), (1, 2))
        self.assertEqual(rr.register_config(self.p, "models", dict(base, audio_vae=[]), None), 1)
        entries = rr.read_registry(self.p, "models")["MODELS"]
        self.assertNotIn("audio_vae", entries[0])
        self.assertEqual(entries[1]["audio_vae"], [P0("a.safetensors")])
        sets = rr.registry_sets(self.p)["models"]
        self.assertNotIn("audio_vae", sets[0])
        self.assertEqual(sets[1]["audio_vae"], [P0("a.safetensors")])
        regs = {k: rr.read_registry(self.p, k) for k in rr.REGISTRIES}
        detail = rr.run_models_of(self.p, {"models": [{"indiceMODELS": 2}]}, regs)
        self.assertEqual(detail["audio_vae"], [P0("a.safetensors")])

    def test_error_status_and_bad_files(self):
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        # Arrete sans fichier : pas enregistre.
        self.assertEqual(rr.finish_run(path, [], "interrupted", self.out),
                         {"skipped": True, "same_as": None, "status": "error"})
        self.assertFalse(os.path.exists(path))
        with self.assertRaises(ValueError):
            rr.finish_run(os.path.join(self.p, "04.Prompt", "notes.json"), [], "done", self.out)
        with self.assertRaises(ValueError):
            rr.finish_run(os.path.join(self.p, "08.Images", "20261017_153000_run.json"), [], "done", self.out)
        with self.assertRaises(FileNotFoundError):
            rr.finish_run(os.path.join(self.p, "04.Prompt", "20261017_160000_run.json"), [], "done", self.out)
        with self.assertRaises(FileNotFoundError):
            rr.start_run(os.path.join(self.root, "nope"), "p")


class MediaReclaimTest(unittest.TestCase):
    """Run enregistre dans 08 a 14 (26/10/2026) : l'original va dans 40 / 60, jamais archive par la cloche."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")
        self.out = os.path.join(self.root, "output")
        # Run commence il y a 10 min (fenetre du Run : debut .. debut + duree).
        self.when = float(int(time.time()) - 600)
        self.base = time.strftime("%Y%m%d_%H%M%S_run", time.localtime(self.when))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def at(self, path, offset):
        """Date de modification = debut du Run + offset (s)."""
        os.utime(path, (self.when + offset, self.when + offset))

    def done_run(self, src, copy_rel, data=b"small", duration=200, move_error=None):
        """Run deja enregistre a l'ancienne : source dans 12.Video, copie reduite copy_rel."""
        run = rr.start_run(self.p, "p", PROMPT, self.when)
        d = read_json(run)
        o = {"source": src, "kind": "video", "copy": copy_rel, "copy_size": "960x540"}
        if move_error:
            o["move_error"] = move_error
        d.update({"status": "done", "duration": duration, "outputs": [o]})
        rr._write(run, d)
        write(os.path.join(self.p, *copy_rel.split("/")), data)
        return run

    def test_media_folder_of(self):
        v = os.path.join(self.p, "12.Video")
        self.assertEqual(rr.media_folder_of(self.p, os.path.join(v, "a.mp4")), "12.Video")
        self.assertEqual(rr.media_folder_of(self.p, os.path.join(v, "Archives", "a.mp4")), "12.Video")
        self.assertIsNone(rr.media_folder_of(self.p, os.path.join(self.p, "40.Rush Videos", "a.mp4")))
        self.assertIsNone(rr.media_folder_of(self.p, os.path.join(v, "Sub", "a.mp4")))
        self.assertIsNone(rr.media_folder_of(self.p, ""))
        self.assertEqual(rr.MEDIA_FOLDERS, tuple(project_config.MEDIA))

    def test_finish_run_moves_video_from_media(self):
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        make_video(src, 1280, 720)
        run = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(run, [{"filename": "Video_001.mp4", "fullpath": src}], "done", self.out)
        o = data["outputs"][0]
        dst = os.path.join(self.p, "40.Rush Videos", "Footage", self.base + ".mp4")
        self.assertFalse(os.path.exists(src))
        self.assertTrue(os.path.isfile(dst))
        self.assertEqual((o["source"], o["copy"], o["in_place"], o["moved_from"], o["from_media"]),
                         (dst, "40.Rush Videos/Footage/" + self.base + ".mp4", True, src, "12.Video"))
        self.assertNotIn("copy_size", o)
        self.assertEqual(rr.video_size(dst), (1280, 720))
        self.assertEqual(files_in(os.path.join(self.p, "40.Rush Videos", "Footage")), [self.base + ".mp4"])

    def test_finish_run_moves_image_from_media(self):
        from PIL import Image
        src = os.path.join(self.p, "08.Images", "Img_001.png")
        Image.new("RGB", (8, 8)).save(src)
        run = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(run, [{"filename": "Img_001.png", "fullpath": src}], "done", self.out)
        o = data["outputs"][0]
        dst = os.path.join(self.p, "60.Rush Images", "Footage", self.base + ".png")
        self.assertFalse(os.path.exists(src))
        self.assertTrue(os.path.isfile(dst))
        self.assertEqual((o["source"], o["copy"], o["from_media"], o["moved_from"]), (dst, None, "08.Images", src))

    def test_finish_run_media_move_fails_falls_back(self):
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        make_video(src, 1280, 720)
        run = rr.start_run(self.p, "p", PROMPT, self.when)
        saved = rr._move_verified

        def locked(a, b):
            raise OSError("locked")
        rr._move_verified = locked
        try:
            data = rr.finish_run(run, [{"filename": "Video_001.mp4", "fullpath": src}], "done", self.out)
        finally:
            rr._move_verified = saved
        o = data["outputs"][0]
        self.assertTrue(os.path.isfile(src))
        self.assertEqual((o["source"], o["copy"], o["move_error"]),
                         (src, "40.Rush Videos/Footage/" + self.base + ".mp4", "locked"))
        self.assertIn("copy_size", o)
        self.assertNotIn("from_media", o)
        # Nouvel essai a la lecture des Runs : l'original remplace la copie reduite.
        rr.tidy_rush(self.p)
        o = read_json(run)["outputs"][0]
        self.assertFalse(os.path.exists(src))
        self.assertEqual((o["in_place"], o["from_media"]), (True, "12.Video"))
        self.assertNotIn("move_error", o)
        self.assertNotIn("copy_size", o)
        self.assertEqual(rr.video_size(o["source"]), (1280, 720))

    def test_finish_run_other_project_media_untouched(self):
        other = projects.create_project(self.root, "Other")
        src = os.path.join(other, "12.Video", "Video_001.mp4")
        make_video(src, 64, 64)
        run = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(run, [{"filename": "Video_001.mp4", "fullpath": src}], "done", self.out)
        o = data["outputs"][0]
        self.assertTrue(os.path.isfile(src))
        self.assertEqual((o["source"], o["copy"]), (src, "40.Rush Videos/Footage/" + self.base + ".mp4"))
        self.assertNotIn("from_media", o)
        rr.tidy_rush(self.p)
        self.assertTrue(os.path.isfile(src))

    def test_tidy_rush_reclaims_archived_original(self):
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        write(src, b"original")
        self.at(src, 150)
        copy = "40.Rush Videos/No Good/" + self.base + ".mp4"
        run = self.done_run(src, copy)
        projects.archive_files(self.p, "12.Video", ["Video_001.mp4"], when=self.when + 400)
        arch = os.path.join(self.p, "12.Video", "Archives")
        archived = os.path.join(arch, files_in(arch)[0])
        rr.tidy_rush(self.p)
        ng = os.path.join(self.p, "40.Rush Videos", "No Good")
        self.assertEqual(files_in(ng), [self.base + ".mp4"])
        with open(os.path.join(ng, self.base + ".mp4"), "rb") as f:
            self.assertEqual(f.read(), b"original")
        self.assertEqual(files_in(arch), [])
        o = read_json(run)["outputs"][0]
        self.assertEqual((o["source"], o["copy"], o["in_place"], o["moved_from"], o["from_media"]),
                         (os.path.join(ng, self.base + ".mp4"), copy, True, archived, "12.Video"))
        self.assertNotIn("copy_size", o)
        listed = rr.list_runs(self.p)[0]["outputs"][0]
        self.assertEqual((listed["in_project"], listed["place"], listed["source_exists"]), (True, "rejected", True))

    def test_reclaim_replaces_copy_in_sort_folder(self):
        # Deplacement de fin de Run rate (move_error) : nouvel essai depuis la racine.
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        write(src, b"original")
        self.at(src, 150)
        self.done_run(src, "40.Rush Videos/Picture Lock/" + self.base + ".mp4", move_error="locked")
        rr.tidy_rush(self.p)
        lock = os.path.join(self.p, "40.Rush Videos", "Picture Lock")
        self.assertEqual(files_in(lock), [self.base + ".mp4"])
        with open(os.path.join(lock, self.base + ".mp4"), "rb") as f:
            self.assertEqual(f.read(), b"original")
        self.assertFalse(os.path.exists(src))

    def test_old_run_root_file_left_in_place(self):
        # Run d'avant ce changement (pas de move_error) : le fichier de 12.Video peut servir de
        # reference au RefLoader, il n'est pas deplace par une simple lecture des Runs.
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        write(src, b"original")
        self.at(src, 150)
        run = self.done_run(src, "40.Rush Videos/Footage/" + self.base + ".mp4")
        rr.tidy_rush(self.p)
        self.assertTrue(os.path.isfile(src))
        self.assertEqual(read_json(run)["outputs"][0]["source"], src)

    def test_root_file_of_another_run_not_taken(self):
        # Meme nom repris par un Run suivant (compteur reparti a 00001) : ecrit apres la fin du Run.
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        write(src, b"other run")
        self.at(src, 500)
        run = self.done_run(src, "40.Rush Videos/Footage/" + self.base + ".mp4", move_error="locked")
        rr.tidy_rush(self.p)
        self.assertTrue(os.path.isfile(src))
        with open(os.path.join(self.p, "40.Rush Videos", "Footage", self.base + ".mp4"), "rb") as f:
            self.assertEqual(f.read(), b"small")
        self.assertEqual(read_json(run)["outputs"][0]["source"], src)

    def test_reclaim_picks_archive_by_date(self):
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        arch = os.path.join(self.p, "12.Video", "Archives")
        names = {"before": "20200101_000000_Video_001.mp4", "inside": "20200101_000001_Video_001.mp4",
                 "after": "20200101_000002_Video_001.mp4"}
        for key, offset in (("before", -3600), ("inside", 150), ("after", 5000)):
            write(os.path.join(arch, names[key]), key.encode())
            self.at(os.path.join(arch, names[key]), offset)
        self.done_run(src, "40.Rush Videos/Footage/" + self.base + ".mp4")
        rr.tidy_rush(self.p)
        with open(os.path.join(self.p, "40.Rush Videos", "Footage", self.base + ".mp4"), "rb") as f:
            self.assertEqual(f.read(), b"inside")
        self.assertEqual(files_in(arch), [names["before"], names["after"]])

    def test_reclaim_ignores_archive_outside_run(self):
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        arch = os.path.join(self.p, "12.Video", "Archives")
        old = os.path.join(arch, "20200101_000000_Video_001.mp4")
        late = os.path.join(arch, "20200101_000001_Video_001.mp4")
        write(old, b"old")
        write(late, b"late")
        self.at(old, -3600)
        self.at(late, 5000)
        run = self.done_run(src, "40.Rush Videos/Footage/" + self.base + ".mp4")
        rr.tidy_rush(self.p)
        self.assertEqual(files_in(arch), sorted([os.path.basename(old), os.path.basename(late)]))
        self.assertEqual(read_json(run)["outputs"][0]["source"], src)

    def test_reclaim_without_duration_skips_archives(self):
        # Run sans duree (anciens JSON) : fenetre inconnue, rien n'est pris dans Archives.
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        cand = os.path.join(self.p, "12.Video", "Archives", "20200101_000000_Video_001.mp4")
        write(cand, b"x")
        self.at(cand, 150)
        self.done_run(src, "40.Rush Videos/Footage/" + self.base + ".mp4", duration=None)
        rr.tidy_rush(self.p)
        self.assertTrue(os.path.isfile(cand))

    def test_reclaim_copy_left_keeps_json_consistent(self):
        # La copie reduite ne peut pas etre retiree (ouverte ailleurs) : le JSON suit quand meme l'original.
        src = os.path.join(self.p, "12.Video", "Video_001.mp4")
        write(src, b"original")
        self.at(src, 150)
        copy = "40.Rush Videos/No Good/" + self.base + ".mp4"
        run = self.done_run(src, copy, move_error="locked")
        copy_abs = os.path.join(self.p, *copy.split("/"))
        real_remove = os.remove

        def busy(path):
            if os.path.normcase(os.path.abspath(path)) == os.path.normcase(copy_abs):
                raise PermissionError("in use")
            real_remove(path)
        rr.os.remove = busy
        try:
            rr.tidy_rush(self.p)
        finally:
            rr.os.remove = real_remove
        o = read_json(run)["outputs"][0]
        self.assertFalse(os.path.exists(src))
        self.assertTrue(os.path.isfile(o["source"]))
        with open(o["source"], "rb") as f:
            self.assertEqual(f.read(), b"original")
        self.assertEqual(o["copy"], rr._rel(self.p, o["source"]))
        self.assertTrue(o["in_place"])
        self.assertEqual(o["copy_left"], copy)
        self.assertNotIn("move_error", o)

    def test_move_verified_source_already_moved(self):
        # Autre lecture des Runs en meme temps : l'original a deja disparu, la copie verifiee reste.
        src = os.path.join(self.root, "a.mp4")
        dst = os.path.join(self.root, "b.mp4")
        write(src, b"data")
        real_remove = os.remove

        def gone(path):
            if path == src:
                real_remove(path)
                raise FileNotFoundError(path)
            real_remove(path)
        rr.os.remove = gone
        try:
            rr._move_verified(src, dst)
        finally:
            rr.os.remove = real_remove
        self.assertTrue(os.path.isfile(dst))

    def test_reclaim_holds_project_lock(self):
        # tidy_rush et finish_run deplacent des fichiers : une seule lecture des Runs a la fois par projet.
        lock = rr.project_lock(self.p)
        self.assertIs(lock, rr.project_lock(os.path.join(self.p, "")))
        self.assertIsNot(lock, rr.project_lock(self.root))
        seen = []
        saved = rr._tidy_rush

        def spy(project):
            seen.append(lock._is_owned())
            return saved(project)
        rr._tidy_rush = spy
        try:
            rr.tidy_rush(self.p)
        finally:
            rr._tidy_rush = saved
        self.assertEqual(seen, [True])

    def test_protected_files_cited_source(self):
        a = os.path.join(self.p, "12.Video", "a.mp4")
        b = os.path.join(self.p, "12.Video", "b.mp4")
        write(a)
        write(b)
        self.at(a, -3600)
        self.at(b, -3600)
        self.done_run(a, "40.Rush Videos/Footage/" + self.base + ".mp4")
        self.assertEqual(rr.protected_files(self.p, [b, a]), [a])

    def test_protected_files_running_run(self):
        now = time.time()
        rr.start_run(self.p, "p", PROMPT, now)
        c = os.path.join(self.p, "12.Video", "c.mp4")
        d = os.path.join(self.p, "12.Video", "d.mp4")
        write(c)
        write(d)
        os.utime(d, (now - 3600, now - 3600))
        self.assertEqual(rr.protected_files(self.p, [c, d]), [c])

class AttachPostTest(unittest.TestCase):
    """Post-traitements ajoutes au Run mere (29/10/2026)."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")
        self.a = os.path.join(self.p, "40.Rush Videos", "Footage", "20261029_100000_run.mp4")
        make_video(self.a, 64, 48)
        self.run = os.path.join(self.p, "04.Prompt", "20261029_100000_run.json")
        rr._write(self.run, {"date": "2026-10-29 10:00:00", "prompt": "p", "duration": 12.5, "status": "done",
                             "outputs": [{"source": self.a, "kind": "video", "copy": None, "in_place": True}]})
        self.out = os.path.join(self.root, "output")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def read(self):
        with open(self.run, encoding="utf-8") as f:
            return json.load(f)

    def video(self, name):
        path = os.path.join(self.out, name)
        make_video(path, 64, 48)
        return path

    def test_attach_post_video(self):
        b = self.video("b.mp4")
        o = rr.attach_post(self.run, 0, 0, b, {"nodes": []}, {"nodes": []})
        self.assertEqual((o["post_of"], o["post_level"]), (0, 1))
        self.assertEqual(o["copy"], "40.Rush Videos/Footage/20261029_100000_run_post01.mp4")
        self.assertTrue(os.path.isfile(os.path.join(self.p, *o["copy"].split("/"))))
        wf = rr.run_workflow_path(self.p, "20261029_100000_run_post01.json")
        self.assertTrue(os.path.isfile(wf))
        self.assertEqual(o["post_workflow"], "20261029_100000_run_post01.json")
        data = self.read()
        self.assertEqual((data["duration"], data["prompt"], data["status"]), (12.5, "p", "done"))
        self.assertEqual(len(data["outputs"]), 2)

    def test_attach_chain(self):
        b = rr.attach_post(self.run, 0, 0, self.video("b.mp4"), {}, None)
        c = rr.attach_post(self.run, 1, b["post_level"], self.video("c.mp4"), {}, None)
        self.assertEqual((c["post_of"], c["post_level"]), (1, 2))
        self.assertEqual(c["copy"], "40.Rush Videos/Footage/20261029_100000_run_post02.mp4")
        self.assertNotIn("post_workflow", c)

    def test_attach_twice_is_once(self):
        b = self.video("b.mp4")
        self.assertIsNotNone(rr.attach_post(self.run, 0, 0, b, {}, None))
        self.assertIsNone(rr.attach_post(self.run, 0, 0, b, {}, None))
        self.assertEqual(len(self.read()["outputs"]), 2)

    def test_attach_image_no_copy(self):
        img = os.path.join(self.out, "frame.png")
        write(img, b"png")
        o = rr.attach_post(self.run, 0, 0, img, {}, None, warning="other run")
        self.assertEqual((o["kind"], o["copy"], o["post_warning"]), ("image", None, "other run"))

    def test_read_post_workflow(self):
        rr.attach_post(self.run, 0, 0, self.video("b.mp4"), {}, {"post": True})
        got = rr.read_run_workflow(self.p, "20261029_100000_run.json", post="20261029_100000_run_post01.json")
        self.assertEqual(got["workflow"], {"post": True})
        with self.assertRaises(ValueError):
            rr.read_run_workflow(self.p, "20261029_100000_run.json", post="../../evil.json")
        with self.assertRaises(ValueError):
            rr.read_run_workflow(self.p, "20261029_100000_run.json", post="20261028_090000_run_post01.json")

    def test_list_runs_gives_post_fields(self):
        rr.attach_post(self.run, 0, 0, self.video("b.mp4"), {"cfg": None, "nodes": [{"title": "Light"}]}, {"n": 1})
        outs = rr.list_runs(self.p)[0]["outputs"]
        self.assertNotIn("post_level", outs[0])
        self.assertEqual((outs[1]["post_of"], outs[1]["post_level"]), (0, 1))
        self.assertEqual(outs[1]["post_params"]["nodes"][0]["title"], "Light")
        self.assertTrue(outs[1]["post_date"])
        self.assertEqual(os.path.normcase(outs[1]["post_workflow"]),
                         os.path.normcase(rr.run_workflow_path(self.p, "20261029_100000_run_post01.json")))

if __name__ == "__main__":
    unittest.main()
