import unittest
from pathlib import Path

from convert_library_multi import (
    PRESET, QUALITY, supported_qualities, filename_for, manifest_payload,
)


class VideoQualityTests(unittest.TestCase):
    def test_no_upscaling_small_original(self):
        self.assertEqual(supported_qualities((640, 360)), ['360p'])
        self.assertEqual(supported_qualities((1280, 720)), ['360p', '720p'])

    def test_portrait_and_full_hd(self):
        self.assertEqual(supported_qualities((1920, 1080)), ['360p', '720p', '1080p'])
        self.assertEqual(supported_qualities((1080, 1920)), ['360p', '720p', '1080p'])

    def test_valid_output_filename_keeps_original_identity(self):
        name = filename_for({'id': 'publicDriveVideo123', 'name': 'Class: New Move.mov'}, '360p')
        self.assertEqual(name, 'Class_New_Move-publicDriv-360p.mp4')

    def test_manifest_has_three_independent_versions(self):
        source_id = 'originalVideo0123456'
        copies = {
            source_id: {
                q: ('Salsa', {'id': 'derivedVideoId' + q, 'name': q + '.mp4', 'size': '12345'})
                for q in QUALITY
            }
        }
        manifest = manifest_payload(copies)
        self.assertEqual(manifest['preset'], PRESET)
        self.assertEqual(manifest['version'], 2)
        self.assertEqual(manifest['entries'][0]['sourceId'], 'drive:' + source_id)
        self.assertEqual([v['quality'] for v in manifest['entries'][0]['renditions']], list(QUALITY))


if __name__ == '__main__':
    unittest.main()
