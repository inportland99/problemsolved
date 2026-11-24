"""Build a pinned SCOWL-35 US word asset; reads archive members, never extracts code."""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = "https://downloads.sourceforge.net/project/wordlist/SCOWL/2020.12.07/scowl-2020.12.07.tar.gz"
SHA256 = "5587667caa20c4891390c2d42dbb4d5c4c3f41bee77af1457ece3ba23fb859cc"
PREFIX = "scowl-2020.12.07/"


def main():
    if len(sys.argv) > 1:
        data = Path(sys.argv[1]).read_bytes()
    else:
        with urllib.request.urlopen(URL, timeout=60) as response:
            data = response.read()
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError("SCOWL archive checksum mismatch")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        def read(name):
            return archive.extractfile(PREFIX + name).read().decode("iso-8859-1")
        words = set()
        for dialect in ("english", "american"):
            for size in (10, 20, 35):
                name = f"final/{dialect}-words.{size}"
                if PREFIX + name in archive.getnames():
                    words.update(w for w in read(name).splitlines() if re.fullmatch("[a-z]{3,17}", w))
        # SCOWL's taboo supplement is not an exhaustive family-safety filter.
        for name in archive.getnames():
            if re.fullmatch(re.escape(PREFIX) + r"misc/(offensive|profane)\.\d+", name):
                words.difference_update(archive.extractfile(name).read().decode("iso-8859-1").split())
        output = ROOT / "src/assets/data/boggle"
        output.mkdir(parents=True, exist_ok=True)
        (output / "scowl-35.json").write_text(json.dumps({
            "source": URL, "sha256": SHA256, "version": "2020.12.07",
            "size": 35, "dialect": "American English", "words": sorted(words),
        }, separators=(",", ":")) + "\n")
        (output / "SCOWL-LICENSE.txt").write_text(read("Copyright"))
        print(f"Built {len(words)} SCOWL-35 words and upstream license.")


if __name__ == "__main__":
    main()
