"""
Maestro alignment service — line-level lyric sync via WhisperX.

Run:
    uvicorn main:app --host 0.0.0.0 --port 8090

Expects:
    POST /align-lyrics { audioPath, lyricsText }
Returns:
    { mode, reason, lines[], warnings[] }
"""

from __future__ import annotations

import os
import re
import logging
from pathlib import Path

import whisperx
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ── config ─────────────────────────────────────────────────────────

HF_TOKEN = os.environ.get("HF_TOKEN", "")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "base")
MIN_CONFIDENCE = 0.4
MIN_SYNCED_LINES = 2

log = logging.getLogger("alignment")

# ── models ─────────────────────────────────────────────────────────

app = FastAPI(title="Maestro Alignment Service")


class AlignRequest(BaseModel):
    audioPath: str
    lyricsText: str


class AlignedLine(BaseModel):
    id: str
    text: str
    start: float
    end: float
    confidence: float


class AlignResponse(BaseModel):
    mode: str  # "synced" | "unsynced"
    reason: str
    lines: list[AlignedLine]
    warnings: list[str]


# ── lyric preprocessing ───────────────────────────────────────────

SECTION_RE = re.compile(
    r"^\s*[\[\(]?\s*"
    r"(verse|chorus|bridge|outro|intro|pre[- ]?chorus|hook|refrain|"
    r"interlude|solo|instrumental|breakdown|post[- ]?chorus|tag|coda)"
    r"(?:\s*\d*)?\s*[\]\)]?\s*[:\-]?\s*$",
    re.IGNORECASE,
)

METADATA_KEYS = (
    r"caption|music|mosic|prompt|style|notes|metadata|description|genre|"
    r"bpm|key|tempo|structure|duration|duration_secs|good_crop|bad_crop|"
    r"produced by|written by|copyright|artist|title|instrumentation|"
    r"arrangement|production|vocals?|instruments?|mood|tags?|type|"
    r"sound|mix|mastering|overall|summary|context|tone|vibe|feel|"
    r"energy|theme|lyrics?|words|song|track|audio|recording|sample|"
    r"beat|melody|harmony|rhythm|section"
)

METADATA_RE = re.compile(
    rf"^\s*(?:{METADATA_KEYS})\s*[:=]",
    re.IGNORECASE,
)

INLINE_METADATA_RE = re.compile(
    rf"(?:{METADATA_KEYS})\s*[:=]",
    re.IGNORECASE,
)

ARRANGEMENT_RE = re.compile(
    r"^\s*(the (song|track|piece|music) "
    r"(features?|includes?|opens?|starts?|begins?|ends?|builds?|uses?|has)|"
    r"featuring |this (song|track) |arrangement:|production:|"
    r"instrumental:|overall,?\s|note:|intro:|outro:|bridge:|"
    r"verse \d|chorus \d)",
    re.IGNORECASE,
)

JUNK_RE = re.compile(r"^[\s\-–—*_=.,:;!?#~`'\"()\[\]{}|/\\]+$")

DIRECTION_RE = re.compile(
    r"^\s*\((instrumental|solo|fade out|fade in|repeat|x\d|ad[- ]?lib|"
    r"spoken|whispered|softly|loudly|with feeling)\)\s*$",
    re.IGNORECASE,
)

# Lyria structural markers: [[A0]], [[B1]], [[C2]], etc.
LYRIA_MARKER_RE = re.compile(r"\[{1,2}[A-Za-z]\d*\]{1,2}")

# Catch-all: any bracket/paren content with digits + colons/dots/dashes
BRACKET_NUMERIC_RE = re.compile(r"\[\s*[\d.:]+\s*(?:[-–]\s*[\d.:]+\s*)?\]")
PAREN_NUMERIC_RE = re.compile(r"\(\s*[\d.:]+\s*(?:[-–]\s*[\d.:]+\s*)?\)")
LEADING_TS_RE = re.compile(r"^\s*\d[\d.:]*(?:\s*[-–]\s*\d[\d.:]*)?\s+")
TRAILING_TS_RE = re.compile(r"\s+\d[\d.:]*(?:\s*[-–]\s*\d[\d.:]*)?$")
MARKDOWN_RE = re.compile(r"(\*{1,2}|_{1,2})(.+?)\1")
MD_HEADER_RE = re.compile(r"^#{1,6}\s+")


def normalize_lyric_text(raw_line: str) -> str:
    text = LYRIA_MARKER_RE.sub("", raw_line)
    text = BRACKET_NUMERIC_RE.sub("", text)
    text = PAREN_NUMERIC_RE.sub("", text)
    text = LEADING_TS_RE.sub("", text)
    # Strip markdown bold/italic/headers
    text = MARKDOWN_RE.sub(r"\2", text)
    text = MD_HEADER_RE.sub("", text)
    text = " ".join(text.split()).strip()
    # Strip trailing timestamps
    text = TRAILING_TS_RE.sub("", text).strip()

    inline_metadata_match = INLINE_METADATA_RE.search(text)
    if inline_metadata_match and inline_metadata_match.start() > 0:
        text = text[: inline_metadata_match.start()].strip()

    return text


BARE_NUMBER_RE = re.compile(r"^\s*[\d.:–-]+\s*$")


def is_prose_line(text: str) -> bool:
    """Long lines with many conjunctions are descriptions, not lyrics."""
    if len(text) < 80:
        return False
    words = text.split()
    if len(words) < 12:
        return False
    markers = re.findall(
        r",|;|\band\b|\bwith\b|\bthe\b|\bthis\b|\bthat\b|\bwhich\b|\bwhile\b|\bthrough\b|\babout\b",
        text,
        re.IGNORECASE,
    )
    return len(markers) >= 3


def should_filter_lyric_line(text: str) -> bool:
    return (
        not text
        or bool(METADATA_RE.match(text))
        or bool(ARRANGEMENT_RE.match(text))
        or bool(JUNK_RE.match(text))
        or bool(DIRECTION_RE.match(text))
        or bool(BARE_NUMBER_RE.match(text))
        or is_prose_line(text)
    )


def extract_singable_lines(raw: str) -> list[dict]:
    """
    Return only singable lyric lines with stable ids.
    Strips timestamps, metadata, arrangement prose, section headers, and blanks.
    """
    lines: list[dict] = []
    idx = 0
    for raw_line in raw.split("\n"):
        text = normalize_lyric_text(raw_line)
        if SECTION_RE.match(text):
            continue
        if should_filter_lyric_line(text):
            continue
        idx += 1
        lines.append({"id": f"ln-{idx}", "text": text})
    return lines


# ── alignment endpoint ─────────────────────────────────────────────


@app.post("/align-lyrics", response_model=AlignResponse)
def align_lyrics(req: AlignRequest) -> AlignResponse:
    warnings: list[str] = []

    # Validate audio file exists
    audio_path = Path(req.audioPath)
    if not audio_path.is_file():
        raise HTTPException(status_code=400, detail=f"Audio file not found: {req.audioPath}")

    # Extract singable lines
    singable = extract_singable_lines(req.lyricsText)
    if len(singable) < MIN_SYNCED_LINES:
        return AlignResponse(
            mode="unsynced",
            reason=f"only {len(singable)} singable lines (need {MIN_SYNCED_LINES}+)",
            lines=[],
            warnings=warnings,
        )

    try:
        # Step 1: Transcribe with WhisperX
        # whisperx.load_audio uses ffmpeg subprocess — works with all formats
        model = whisperx.load_model(
            WHISPER_MODEL_SIZE, DEVICE, compute_type=COMPUTE_TYPE
        )
        audio = whisperx.load_audio(str(audio_path))
        transcript = model.transcribe(audio, batch_size=16)

        # Step 2: Align transcript to audio
        align_model, align_meta = whisperx.load_align_model(
            language_code=transcript.get("language", "en"),
            device=DEVICE,
        )
        aligned = whisperx.align(
            transcript["segments"],
            align_model,
            align_meta,
            audio,
            DEVICE,
            return_char_alignments=False,
        )

        # Step 3: Flatten aligned words into full text with timestamps
        word_segments: list[dict] = []
        for seg in aligned.get("segments", []):
            for w in seg.get("words", []):
                if "start" in w and "end" in w:
                    word_segments.append(w)

        if not word_segments:
            return AlignResponse(
                mode="unsynced",
                reason="WhisperX produced no word-level alignments",
                lines=[],
                warnings=warnings,
            )

        # Step 4: Match lyric lines to aligned word ranges
        # Strategy: for each lyric line, find the best-matching contiguous
        # word span in the transcript by normalized text overlap.
        transcript_words = [w["word"].strip().lower() for w in word_segments]
        aligned_lines: list[AlignedLine] = []
        used_up_to = 0  # monotonic scan pointer

        for item in singable:
            lyric_words = item["text"].lower().split()
            if not lyric_words:
                continue

            best_start_idx = -1
            best_score = 0.0

            # Scan from used_up_to forward (monotonic assumption)
            search_start = max(0, used_up_to - 2)
            for si in range(search_start, len(transcript_words)):
                # Try matching lyric_words starting at position si
                matches = 0
                span_len = min(len(lyric_words), len(transcript_words) - si)
                for k in range(span_len):
                    tw = re.sub(r"[^\w]", "", transcript_words[si + k])
                    lw = re.sub(r"[^\w]", "", lyric_words[k] if k < len(lyric_words) else "")
                    if tw == lw:
                        matches += 1

                score = matches / max(len(lyric_words), 1)
                if score > best_score:
                    best_score = score
                    best_start_idx = si

                # Good enough match — stop searching
                if score >= 0.6:
                    break

            if best_start_idx < 0 or best_score < 0.3:
                warnings.append(f"no alignment match for: {item['text'][:40]}")
                continue

            span_end_idx = min(
                best_start_idx + len(lyric_words), len(word_segments)
            )
            start_time = word_segments[best_start_idx]["start"]
            end_time = word_segments[span_end_idx - 1]["end"]

            if end_time <= start_time:
                warnings.append(f"invalid timing for: {item['text'][:40]}")
                continue

            aligned_lines.append(
                AlignedLine(
                    id=item["id"],
                    text=item["text"],
                    start=round(start_time, 2),
                    end=round(end_time, 2),
                    confidence=round(best_score, 2),
                )
            )
            used_up_to = span_end_idx

        # Step 5: Validate
        high_conf = [l for l in aligned_lines if l.confidence >= MIN_CONFIDENCE]

        if len(high_conf) < MIN_SYNCED_LINES:
            return AlignResponse(
                mode="unsynced",
                reason=f"only {len(high_conf)} lines above confidence threshold",
                lines=aligned_lines,
                warnings=warnings,
            )

        # Check monotonicity
        out_of_order = 0
        for i in range(1, len(aligned_lines)):
            if aligned_lines[i].start < aligned_lines[i - 1].start:
                out_of_order += 1
        if out_of_order > len(aligned_lines) * 0.5:
            return AlignResponse(
                mode="unsynced",
                reason=f"timing mostly non-monotonic ({out_of_order}/{len(aligned_lines)})",
                lines=aligned_lines,
                warnings=warnings,
            )

        if out_of_order > 0:
            warnings.append(
                f"{out_of_order}/{len(aligned_lines)} lines out of chronological order"
            )

        return AlignResponse(
            mode="synced",
            reason=f"{len(aligned_lines)} lines aligned ({len(high_conf)} high confidence)",
            lines=aligned_lines,
            warnings=warnings,
        )

    except Exception as exc:
        log.exception("Alignment failed")
        return AlignResponse(
            mode="unsynced",
            reason=f"alignment error: {exc}",
            lines=[],
            warnings=warnings,
        )


@app.get("/health")
def health():
    return {"status": "ok"}
