"""Original-source CC0 recordings only. No reference-repository asset copying."""
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile
from io import BytesIO

root = Path(__file__).resolve().parent.parent / 'public' / 'audio'
root.mkdir(parents=True, exist_ok=True)
packs = [
    ('IMPACT', 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip', [
        'footstep_wood_000.ogg', 'footstep_wood_001.ogg', 'impactPunch_heavy_000.ogg', 'impactPunch_medium_000.ogg',
        'impactSoft_heavy_000.ogg', 'impactSoft_medium_000.ogg', 'impactMetal_light_000.ogg', 'impactMetal_medium_000.ogg',
        'impactBell_heavy_000.ogg', 'impactTin_medium_000.ogg', 'impactGeneric_light_000.ogg', 'impactWood_light_000.ogg',
    ]),
    ('DIGITAL', 'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip', [
        'laser5.ogg', 'laser9.ogg', 'phaserDown1.ogg', 'phaserUp1.ogg', 'phaseJump1.ogg', 'powerUp3.ogg', 'zap1.ogg', 'zap2.ogg', 'zapThreeToneDown.ogg',
    ]),
]
for label, url, filenames in packs:
    if all((root / f).exists() for f in filenames) and (root / f'KENNEY-{label}-LICENSE.txt').exists():
        print(label, 'already installed')
        continue
    with ZipFile(BytesIO(urlopen(url).read())) as archive:
        for filename in filenames:
            member = next(n for n in archive.namelist() if n.endswith('/' + filename))
            (root / filename).write_bytes(archive.read(member))
        license_path = next(n for n in archive.namelist() if n.lower().endswith('license.txt'))
        license_text = archive.read(license_path)
        if b'CC0' not in license_text and b'Creative Commons Zero' not in license_text:
            raise RuntimeError('Unexpected license; inspect upstream before using pack')
        (root / f'KENNEY-{label}-LICENSE.txt').write_bytes(license_text)
        print(label, len(filenames), 'unchanged OGG recordings, license verified')
