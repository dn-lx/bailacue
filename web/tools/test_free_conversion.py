"""Tests for the free, original-preserving BailaCue quality manifest."""
import unittest
from convert_library_multi import (
    QUALITY, PRESET, ROOT, DERIVED,
    manifest_payload, supported_qualities, filename_for,
)

class FreeVideoTests(unittest.TestCase):
    def test_landscape_1080p_source_offers_three_renditions(self):
        self.assertEqual(supported_qualities((1920,1080)), ["360p","720p","1080p"])

    def test_small_source_not_upscaled(self):
        self.assertEqual(supported_qualities((640,360)), ["360p"])
        self.assertEqual(supported_qualities((1280,720)), ["360p","720p"])

    def test_portrait_source_preserves_quality_ladder(self):
        self.assertEqual(supported_qualities((1080,1920)), ["360p","720p","1080p"])

    def test_requested_subset_is_preserved(self):
        self.assertEqual(supported_qualities((1920,1080), ("720p",)), ["720p"])

    def test_manifest_has_original_identity_and_multiple_drive_id_mappings(self):
        copied = {
            "originalDrive123": {
                "360p": ("Salsa", {"id":"optimizedLow123", "name":"0003-360p.mp4", "size":"123456"}),
                "720p": ("Salsa", {"id":"optimizedHigh123", "name":"0003-720p.mp4", "size":"654321"}),
            }
        }
        manifest = manifest_payload(copied)
        self.assertEqual(manifest["version"], 2)
        self.assertEqual(manifest["rootFolderId"], ROOT)
        self.assertEqual(manifest["preset"], PRESET)
        entry, = manifest["entries"]
        self.assertEqual(entry["sourceId"],"drive:originalDrive123")
        self.assertEqual(entry["dance"],"Salsa")
        self.assertEqual([x["quality"] for x in entry["renditions"]],["360p","720p"])
        self.assertTrue(all(x["folderId"] == DERIVED["Salsa"] for x in entry["renditions"]))

    def test_local_studio_accepts_multiple_videos_and_links(self):
        from local_upload_server import PAGE
        self.assertIn('id="files" multiple', PAGE)
        self.assertIn('id="share-link"', PAGE)
        self.assertIn("photos.app.goo.gl", PAGE)
        self.assertIn("share.icloud.com", PAGE)
        for quality in ("360p", "720p", "1080p"):
            self.assertIn(f'value="{quality}" checked', PAGE)

    def test_quality_copy_names_keep_original_id_and_quality(self):
        video = {"id": "abcdefghij123456", "name":"0004.mov"}
        self.assertEqual(filename_for(video,"360p"), "0004-abcdefghij-360p.mp4")

if __name__ == "__main__":
    unittest.main()
