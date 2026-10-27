"""Run deterministic UI assertions through Google's ARTEMIS device controller.

Run from an installed google/artemis checkout's Python environment:
  python /path/to/BailaCue/scripts/artemis-smoke.py
This uses ARTEMIS observation/actions directly, not an autonomous Gemini agent.
Only an isolated synthetic test device should be attached.
"""
import asyncio
import base64
import json
import os
import subprocess
import hashlib
import sqlite3
import re
from pathlib import Path
from artemis.mcp.adb_server import _get_controller
from artemis.clients.screen_client_factory import hierarchy_backend_summary

OUT = Path(os.environ.get("BAILACUE_ARTEMIS_OUT", "/workspace/BailaCue/artifacts/artemis"))
OUT.mkdir(parents=True, exist_ok=True)
report = {"framework": "google/artemis", "mode": "controller-driven assertions; no autonomous model invocation", "checks": [], "status": "running"}
apk_files = list(Path("artifacts").glob("*.apk"))
if len(apk_files) == 1:
    report["apk_file"] = apk_files[0].name
    report["apk_sha256"] = hashlib.sha256(apk_files[0].read_bytes()).hexdigest()

async def main():
    controller = _get_controller(device_serial=os.environ.get("ARTEMIS_DEVICE_ID", "emulator-5554"))
    async def observe(name):
        screen = await asyncio.wait_for(controller.get_screen_data(), timeout=45)
        report["observation_backend"] = hierarchy_backend_summary(controller.ctx.ui_adb_client)
        (OUT / f"{name}.png").write_bytes(base64.b64decode(screen.base64))
        (OUT / f"{name}.json").write_text(json.dumps(screen.elements, indent=2))
        return screen.elements
    def label(element):
        return " ".join(str(element.get(k, "")) for k in ["text", "content-desc", "contentDescription", "label"])
    async def tap(text, exact=False):
        elements = await observe("before-tap")
        # DocumentsUI exposes a separate accessible "Preview the file ..."
        # button. Selecting it opens a player instead of returning the file.
        def matches_text(element):
            if exact:
                return "EditText" not in element.get("class", "") and any(str(element.get(k, "")).strip().lower() == text.lower() for k in ["text", "content-desc", "contentDescription", "label"])
            return text.lower() in label(element).lower()
        matches = [e for e in elements if matches_text(e)
                   and not label(e).strip().lower().startswith("preview the file")]
        for element in sorted(matches, key=lambda e: (not (e.get("focusable") in (True,"true") or e.get("clickable") in (True,"true")),len(label(e)))):
            bounds = re.fullmatch(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", str(element.get("bounds", "")))
            if not bounds:
                continue
            x1,y1,x2,y2 = map(int,bounds.groups())
            if x2>x1 and y2>y1 and y1>=0 and y2<=controller.ctx.device.device_height:
                result = await asyncio.wait_for(controller.tap_at((x1+x2)//2,(y1+y2)//2),timeout=30)
                if getattr(result,"error",None):
                    raise AssertionError(result.error)
                await asyncio.sleep(0.8)
                return
        raise AssertionError(f"ARTEMIS could not locate {text!r}")
    await controller.driver.execute_shell("logcat -c")
    async def launch():
        # ARTEMIS's monkey wrapper can return success while a launcher dialog
        # consumes its event. Use its shell driver to start the exact activity.
        result = await controller.driver.execute_shell("am start -W -n app.bailacue.mobile/.MainActivity", timeout_seconds=45)
        (OUT / "activity-start.txt").write_text(result)
        if "Error:" in result or "Exception" in result:
            raise AssertionError(f"Native activity launch failed: {result}")
    await launch()
    for attempt in range(12):
        elements = await observe("launch")
        # A fresh emulator can show a launcher ANR over the newly opened app.
        # Dismiss only that unrelated system dialog; never hide a BailaCue ANR.
        if any("Pixel Launcher isn't responding" in label(e) for e in elements):
            await tap("Close app")
            await asyncio.sleep(3)
            await launch()
            continue
        if any("BailaCue isn't responding" in label(e) for e in elements):
            raise AssertionError("BailaCue native application is not responding")
        if any("BailaCue keeps stopping" in label(e) or "BailaCue has stopped" in label(e) for e in elements):
            raise AssertionError("BailaCue crashed during native startup; see device-logcat.txt")
        if any("Find your rhythm" in label(e) for e in elements):
            break
        await asyncio.sleep(3)
    else:
        raise AssertionError("BailaCue home did not become visible")
    report["checks"].append({"check":"Native APK launch and branded home", "result":"passed"})
    await tap("Settings")
    await asyncio.sleep(2)
    elements = await observe("settings")
    if not any("Make it your own" in label(e) for e in elements):
        raise AssertionError("Settings page did not open")
    report["checks"].append({"check":"Native tab navigation to Settings", "result":"passed"})
    await tap("Library")
    await asyncio.sleep(2)
    elements = await observe("library")
    if not any("Your dance library" in label(e) for e in elements):
        raise AssertionError("Library page did not open")
    report["checks"].append({"check":"Native tab navigation to Library", "result":"passed"})
    if os.environ.get("BAILACUE_ARTEMIS_VIDEO") == "1":
        fixture = Path(os.environ["BAILACUE_ARTEMIS_FIXTURE"])
        # Navigate through the outer page margin so the native preview seek bar
        # cannot consume a scroll gesture. Resize/trim gestures below still target controls.
        async def locate(text, scrolls=0, attempts=12, exact=False):
            for attempt in range(attempts):
                elements = await observe("video-step")
                if any(text.lower() in label(e).lower() for e in elements):
                    try:
                        await tap(text, exact=exact)
                        return
                    except AssertionError:
                        pass
                if attempt < scrolls:
                    screen = await controller.get_screen_data()
                    await controller.swipe_coords(screen.width-24,int(screen.height*.78),screen.width-24,int(screen.height*.28),400)
                await asyncio.sleep(1)
            raise AssertionError(f"Native journey could not locate {text}")
        async def field(text,value):
            await locate(text,scrolls=6)
            # Use ARTEMIS's focused-input accessibility API, avoiding the
            # driver's unsupported --meta keyboard-clear sequence on API35.
            client = controller.ctx.ui_adb_client
            if not await asyncio.to_thread(client.clear_text):
                raise AssertionError(f"ARTEMIS could not clear {text}")
            await asyncio.to_thread(client.send_text, value)
            # The helper can insert text without opening the IME. Back in that
            # state pops the app route instead of dismissing a keyboard.
            await asyncio.sleep(0.5)
            ime = subprocess.run(["adb", "-s", os.environ.get("ARTEMIS_DEVICE_ID", "emulator-5554"), "shell", "dumpsys", "input_method"], check=True, capture_output=True, text=True, timeout=20).stdout
            if re.search(r"(?:mInputShown|mIsInputViewShown|isInputViewShown)=true", ime):
                await controller.go_back()
            # The IME can cover the focused field; inspect after it closes.
            for attempt in range(5):
                elements = await observe("field-value")
                fields = [e for e in elements if "EditText" in e.get("class", "") and text.lower() in label(e).lower()]
                if fields:
                    if not any(e.get("text") == value for e in fields):
                        raise AssertionError(f"Native text entry did not replace {text} with {value}")
                    return
                screen = await controller.get_screen_data()
                await controller.swipe_coords(screen.width-24,int(screen.height*.78),screen.width-24,int(screen.height*.48),350)
            raise AssertionError(f"Could not verify the entered value for {text}")
        await locate("Add video")
        await locate("Choose a video")
        # Wait for the external picker rather than inspecting the previous app
        # screen while its activity transition is still running.
        for _ in range(15):
            elements = await observe("file-picker")
            if any("BailaCue-ARTEMIS" in label(e) for e in elements):
                break
            await asyncio.sleep(1)
        else:
            await locate("Show roots",attempts=3)
            await locate("Videos",attempts=3)
            elements = await observe("video-folders")
            if not any("BailaCue-ARTEMIS" in label(e) for e in elements):
                await locate("Download",attempts=5)
        await locate("BailaCue-ARTEMIS",attempts=8)
        await locate("Play preview",scrolls=5)
        elements = await observe("import-preview-playing")
        if not any("Pause preview" in label(e) for e in elements): raise AssertionError("Import preview did not play")
        await locate("Pause preview",scrolls=2)
        report["checks"].append({"check":"Native import preview plays before classification and destination selection", "result":"passed"})
        await field("Video title","ARTEMIS practice")
        await locate("Choose labels",scrolls=3)
        await field("Search labels","ARTEMIS Artist")
        await locate("Create “ARTEMIS Artist”",scrolls=3)
        elements = await observe("label-created")
        if not any("Remove label ARTEMIS Artist" in label(e) for e in elements):
            raise AssertionError("Created artist label was not selected")
        await locate("Done choosing labels",scrolls=2)
        # Keep this earlier practice import below the later explicitly rated Daily Picks.
        await locate("1 ★",scrolls=3)
        await locate("Add to my library",scrolls=10)
        for _ in range(20):
            elements = await observe("imported-video")
            if any("Video position" in label(e) for e in elements): break
            await asyncio.sleep(1)
        else: raise AssertionError("Imported native video did not open")
        # Exercise the actual native resize grip and shared-line trim handles.
        async def control(text, name):
            elements = await observe(name)
            matches = [e for e in elements if text.lower() in label(e).lower() and e.get("parsed_bounds")]
            for element in matches:
                b = element["parsed_bounds"]
                if b["bottom"] > b["top"] >= 0 and b["bottom"] <= controller.ctx.device.device_height:
                    return element, b
            raise AssertionError(f"Native control {text} is not visible")
        grip, b = await control("Resize video area", "player-original-size")
        original_height = re.search(r"(\d+) pixels tall", label(grip))
        if not original_height: raise AssertionError("Video grip did not expose its height")
        original_height = int(original_height.group(1))
        x,y = (b["left"]+b["right"])//2,(b["top"]+b["bottom"])//2
        await controller.swipe_coords(x,y,x,y+60,600)
        await asyncio.sleep(1)
        grip, b = await control("Resize video area", "player-resized")
        height = re.search(r"(\d+) pixels tall", label(grip))
        if not height or int(height.group(1)) <= original_height: raise AssertionError("Dragging the native video grip did not increase its height")
        report["checks"].append({"check":"Native player drag resizing and accessible height", "result":"passed", "dragged_height":int(height.group(1))})
        x,y=(b["left"]+b["right"])//2,(b["top"]+b["bottom"])//2
        await controller.swipe_coords(x,y,x,y-60,600)
        async def top():
            for _ in range(5):
                screen=await controller.get_screen_data()
                await controller.swipe_coords(screen.width-24,int(screen.height*.28),screen.width-24,int(screen.height*.75),200)
        await locate("Play",scrolls=3,exact=True)
        await asyncio.sleep(1)
        await locate("Pause",scrolls=2,exact=True)
        await top()
        grip, b=await control("Resize video area","mirror-normal")
        from PIL import Image, ImageChops, ImageStat
        normal=Image.open(OUT/"mirror-normal.png").convert("RGB")
        density=float(subprocess.run(["adb","-s",os.environ.get("ARTEMIS_DEVICE_ID","emulator-5554"),"shell","wm","density"],check=True,capture_output=True,text=True).stdout.strip().split()[-1])/160
        h=round(original_height*density)
        box=(12,max(0,b["top"]-h)+12,normal.width-12,b["top"]-12)
        normal=normal.crop(box)
        await locate("Mirror",scrolls=3,exact=True)
        await top();await observe("mirror-reversed")
        mirrored=Image.open(OUT/"mirror-reversed.png").convert("RGB").crop(box)
        reverse=mirrored.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        error=lambda a,b:sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3
        same_error=error(normal,mirrored);mirror_error=error(normal,reverse)
        if same_error<15 or mirror_error>same_error*.5: raise AssertionError(f"Mirror did not reverse native video pixels: normal={same_error:.2f}, reversed={mirror_error:.2f}")
        await locate("Mirror",scrolls=3,exact=True)
        await top();await observe("mirror-restored")
        restored=Image.open(OUT/"mirror-restored.png").convert("RGB").crop(box)
        if error(normal,restored)>10: raise AssertionError("Mirror did not restore the original native frame")
        report["checks"].append({"check":"Native TextureView Mirror reverses asymmetric rendered pixels and restores original", "result":"passed", "unmirrored_error":same_error,"mirrored_error":mirror_error})
        await locate("Trim on timeline",scrolls=3)
        for edge, movement in (("start",90),("end",-90)):
            handle, b = await control(f"Trim {edge}", f"trim-{edge}-before")
            x,y = (b["left"]+b["right"])//2,(b["top"]+b["bottom"])//2
            await controller.swipe_coords(x,y,x+movement,y,600)
            await asyncio.sleep(1)
            handle, _ = await control(f"Trim {edge}", f"trim-{edge}-after")
            value = re.search(r"(\d+\.\d+) seconds", label(handle))
            if not value: raise AssertionError(f"Trim {edge} does not expose its selected time")
            seconds = float(value.group(1))
            if edge == "start" and seconds <= 0.25: raise AssertionError("Native start trim handle did not move")
            if edge == "end" and seconds >= 5.9: raise AssertionError("Native end trim handle did not move")
        report["checks"].append({"check":"Native start and end trim handles dragged on playback timeline", "result":"passed"})
        await locate("Done trimming",scrolls=2)
        await locate("Extra options",scrolls=7)
        # Playback details precede the expanded editing tools.
        report["checks"].append({"check":"Native document import and video detail", "result":"passed"})
        def adb(*args):
            return subprocess.run(["adb","-s",os.environ.get("ARTEMIS_DEVICE_ID","emulator-5554"),*args],check=True,capture_output=True,text=True,timeout=30).stdout.strip()
        original = adb("shell","ls","/data/user/0/app.bailacue.mobile/files/bailacue-library/*.mp4").splitlines()[0]
        adb("pull",original,str(OUT/"original-before.mp4"))
        before = hashlib.sha256((OUT/"original-before.mp4").read_bytes()).hexdigest()
        if before != hashlib.sha256(fixture.read_bytes()).hexdigest(): raise AssertionError("Imported copy differs from fixture")
        await field("Start (m:ss or seconds)","1")
        await field("End (m:ss or seconds)","4")
        await field("Section name","ARTEMIS loop")
        await locate("Save practice section",scrolls=3)
        await locate("Loop section",scrolls=3)
        elements = await observe("loop-enabled")
        if not any("Loop on" in label(e) for e in elements): raise AssertionError("Loop did not enable")
        report["checks"].append({"check":"Native named section and loop control", "result":"passed"})
        # Card interactions can leave the export action clipped at the bottom.
        # Bring it clear of Android's gesture edge before tapping; a clipped
        # bottom-edge hit can launch Recents instead of completing this journey.
        screen = await controller.get_screen_data()
        await controller.swipe_coords(screen.width-24,int(screen.height*.78),screen.width-24,int(screen.height*.48),350)
        await asyncio.sleep(0.8)
        await locate("Export new trimmed video",scrolls=3)
        for _ in range(90):
            elements = await observe("export")
            if any("NEW CLIP READY" in label(e) for e in elements): break
            await asyncio.sleep(1)
        else: raise AssertionError("Native export did not complete")
        clip = adb("shell","ls","/data/user/0/app.bailacue.mobile/files/bailacue-exports/*.mp4").splitlines()[0]
        if original == clip: raise AssertionError("Export overwrote original path")
        adb("pull",clip,str(OUT/"exported-clip.mp4"))
        adb("pull",original,str(OUT/"original-after.mp4"))
        after = hashlib.sha256((OUT/"original-after.mp4").read_bytes()).hexdigest()
        if after != before: raise AssertionError("Original changed during export")
        duration = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",str(OUT/"exported-clip.mp4")],check=True,capture_output=True,text=True).stdout.strip())
        if abs(duration-3)>0.25: raise AssertionError(f"Unexpected trim duration {duration}")
        report["checks"].append({"check":"Native Media3 new-file export, original checksum preserved", "result":"passed", "duration":duration, "original_sha256":before})
        await observe("new-clip-ready")
        await locate("Save new clip to Photos",scrolls=3)
        saved = False
        for _ in range(25):
            elements = await observe("photos-save")
            if any("Your new clip was saved to Photos" in label(e) for e in elements):
                saved = True
                break
            for choice in ("Allow all", "Allow"):
                candidates = [e for e in elements if label(e).strip().lower() == choice.lower()]
                if candidates:
                    await tap(choice)
                    break
            await asyncio.sleep(1)
        if not saved: raise AssertionError("Native Photos save was not confirmed")
        report["checks"].append({"check":"Explicit native Save new clip to Photos", "result":"passed"})
        # The confirmation is a native Alert, which must close before the
        # remaining label controls below the player become accessible.
        await locate("OK",attempts=3)
        # Return above editing tools to the primary details card.
        for _ in range(8):
            screen=await controller.get_screen_data()
            await controller.swipe_coords(screen.width-24,int(screen.height*.30),screen.width-24,int(screen.height*.80),250)
        await locate("Remove label ARTEMIS Artist",scrolls=6)
        await observe("label-removed")
        # Removing a chip can adjust the nested scroll offset. Start from a known
        # position because Details now precedes all expanded editing tools.
        await top()
        await locate("Choose labels",scrolls=6)
        await field("Search labels","artemis artist")
        elements = await observe("label-existing")
        if any("Create “artemis artist”" in label(e) for e in elements):
            raise AssertionError("Existing artist label incorrectly offered as new")
        await locate("Select ARTEMIS Artist",scrolls=3)
        await locate("Done choosing labels",scrolls=2)
        await locate("Save details",scrolls=3)
        report["checks"].append({"check":"Native artist label creation, saved reuse and case-insensitive selection", "result":"passed"})
        # New daily-mix acceptance uses real imports and star controls, with no
        # injected library state or live cloud credentials.
        await controller.go_back()
        await asyncio.sleep(1)
        for title, style, stars in (("ARTEMIS Salsa pick","Salsa",5),("ARTEMIS Bachata pick","Bachata",4)):
            await locate("Add video",attempts=5)
            await locate("Choose a video",scrolls=12)
            for _ in range(15):
                elements = await observe("daily-file-picker")
                if any("BailaCue-ARTEMIS" in label(e) for e in elements): break
                await asyncio.sleep(1)
            await locate("BailaCue-ARTEMIS",attempts=8)
            await field("Video title",title)
            await locate(style,scrolls=5,exact=True)
            await locate(f"{stars} ★",scrolls=5,exact=True)
            await locate("Add to my library",scrolls=12)
            for _ in range(20):
                elements = await observe("daily-imported")
                if any("Video position" in label(e) for e in elements): break
                await asyncio.sleep(1)
            else: raise AssertionError("Rated native video did not open")
            await controller.go_back()
            await asyncio.sleep(1)
        await locate("Today",attempts=5)
        await locate("Update today’s picks",scrolls=6)
        async def see(text, name):
            for _ in range(12):
                elements = await observe(name)
                for element in elements:
                    b = element.get("parsed_bounds", {})
                    if text in label(element) and b.get("bottom", 0) > b.get("top", 0) >= 0 and b["bottom"] <= controller.ctx.device.device_height:
                        return
                screen = await controller.get_screen_data()
                await controller.swipe_coords(screen.width-24,int(screen.height*.78),screen.width-24,int(screen.height*.28),400)
                await asyncio.sleep(0.8)
            raise AssertionError(f"Native Daily Picks did not show {text}")
        await see("Play ARTEMIS Bachata pick","daily-bachata")
        await see("Play ARTEMIS Salsa pick","daily-salsa")
        report["checks"].append({"check":"Native rated imports produce one Bachata and one Salsa Daily Pick", "result":"passed"})

        await locate("Practice",attempts=5,exact=True)
        await locate("Start practice",scrolls=12,exact=True)
        await asyncio.sleep(3)
        # The setup was below the fold; bring timer and playback into view.
        await top()
        await locate("Pause practice",scrolls=2,exact=True)
        elements=await observe("practice-paused")
        def active_seconds(elements):
            for e in elements:
                match=re.search(r"(\d+) active seconds",label(e))
                if match:return int(match.group(1))
            raise AssertionError("Practice active-time counter is missing")
        first=active_seconds(elements)
        if first<1: raise AssertionError("Native Practice did not accrue playing time")
        await asyncio.sleep(2)
        if active_seconds(await observe("practice-pause-retained"))!=first: raise AssertionError("Paused Practice counted time")
        await locate("Resume practice",exact=True)
        await asyncio.sleep(1)
        await controller.driver.execute_shell("input keyevent 3")
        await asyncio.sleep(2)
        await launch();await asyncio.sleep(1)
        elements=await observe("practice-background-resume")
        if not any("Resume practice" in label(e) for e in elements): raise AssertionError("Returning from background unexpectedly resumed Practice")
        await locate("Finish & save",exact=True)
        report["checks"].append({"check":"Native continuous Practice counts playback, excludes pause and returns from background paused", "result":"passed", "active_seconds_before_pause":first})

        # New local-first acceptance: remove a reusable label everywhere through
        # the app, restart, and inspect the actual native SQLite persistence.
        await locate("Settings", attempts=5, exact=True)
        await top()
        await locate("Manage labels", scrolls=18, exact=True)
        await locate("Remove label ARTEMIS Artist", scrolls=8, exact=True)
        await locate("Confirm removal", scrolls=3, exact=True)
        elements = await observe("global-label-removed")
        if not any("Labels saved" in label(e) for e in elements):
            raise AssertionError("Global label removal was not saved")
        await controller.driver.execute_shell("am force-stop app.bailacue.mobile")
        database_dir = "/data/user/0/app.bailacue.mobile/files/SQLite/"
        for suffix in ("", "-wal", "-shm"):
            path = database_dir + "bailacue-library.db" + suffix
            subprocess.run(["adb", "-s", os.environ.get("ARTEMIS_DEVICE_ID", "emulator-5554"), "pull", path, str(OUT / ("native-library.db" + suffix))], capture_output=True, check=not suffix)
        with sqlite3.connect(OUT / "native-library.db") as database:
            rows = database.execute("SELECT body FROM library_records WHERE kind='videos'").fetchall()
            saved_videos = [json.loads(row[0]) for row in rows]
            if len(saved_videos) < 3:
                raise AssertionError("Native SQLite did not retain the imported videos")
            if any("artemis artist" in [s.lower() for s in video["labels"]] for video in saved_videos):
                raise AssertionError("Global label removal was not persisted in SQLite")
            if not any(video["segments"] for video in saved_videos):
                raise AssertionError("Native SQLite lost the saved practice section")
            if database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise AssertionError("Native SQLite integrity check failed")
        report["checks"].append({"check":"Native SQLite persists imports, sections and global label removal with database integrity", "result":"passed", "saved_videos":len(saved_videos)})
        await launch()
        await asyncio.sleep(2)
        await observe("sqlite-restart")

        # Supplemental public-network attempt: never count a blocked provider as a pass.
        # Once import succeeds, player/layout assertions below are normal release gates.
        if os.environ.get("BAILACUE_ARTEMIS_YOUTUBE_LIVE") == "1":
            imported = False
            try:
                await locate("Add video", exact=True)
                await top()
                await locate("Add from YouTube", scrolls=8, exact=True)
                await locate("Preview beginner Bachata playlist", scrolls=8, exact=True)
                await locate("Add selected videos", scrolls=12, exact=True)
                for _ in range(20):
                    elements=await observe("youtube-live-discovery")
                    if any("Added " in label(e) and "videos to your Library" in label(e) for e in elements):
                        imported=True
                        break
                    buttons=[e for e in elements if any(str(e.get(k," ")).strip()=="Add selected videos" for k in ["text","content-desc","label"]) and str(e.get("enabled","")).lower()=="true" and (str(e.get("clickable","")).lower()=="true" or str(e.get("focusable","")).lower()=="true")]
                    if buttons:
                        await tap("Add selected videos",exact=True)
                        await top()
                        await locate("Open Library",scrolls=8,exact=True)
                        imported=True
                        break
                    await asyncio.sleep(2)
                if not imported:
                    raise AssertionError("The public player did not expose addable playlist contents within the bounded live attempt")
                elements=await observe("youtube-live-library")
                if any("Open Library" in label(e) for e in elements):
                    await locate("Open Library",scrolls=8,exact=True)
                report["live_youtube"]={"status":"imported", "playlist":"PL2E0b6twkkHkMemtovF3zHgo95pURUUmy", "configuration":"official cued player, no API key, no account or mocked responses"}
            except Exception as live_error:
                imported = False
                report["live_youtube"]={"status":"blocked-or-unverified", "error":str(live_error), "configuration":"public playlist without an API key; no mocked responses"}
                await observe("youtube-live-blocked")
            if imported:
                await locate("Play ",scrolls=10)
                await locate("Full screen",scrolls=4,exact=True)
                elements=await observe("youtube-live-fullscreen")
                if not any("Exit full screen" in label(e) for e in elements):raise AssertionError("YouTube full-screen exit is not visible")
                await controller.driver.execute_shell("input keyevent 4")
                elements=await observe("youtube-live-returned")
                if not any("Full screen" in label(e) for e in elements):raise AssertionError("Android Back did not return to the same YouTube detail page")
                report["checks"].append({"check":"Live public YouTube playlist import reaches Library and full screen returns to the video", "result":"passed"})

    report["status"] = "passed"

try:
    asyncio.run(main())
except Exception as error:
    report["status"] = "blocked-or-failed"
    report["error"] = str(error)
finally:
    try:
        diagnostic = subprocess.run(["adb", "-s", os.environ.get("ARTEMIS_DEVICE_ID", "emulator-5554"), "logcat", "-d", "-b", "main", "-b", "system", "-b", "crash"], capture_output=True, text=True, timeout=20)
        (OUT / "device-logcat.txt").write_text(diagnostic.stdout)
    except Exception:
        pass
    (OUT / "report.json").write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
if report["status"] != "passed":
    raise SystemExit(1)
