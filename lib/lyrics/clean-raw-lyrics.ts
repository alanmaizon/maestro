/**
 * Cleans raw Lyria text output into singable lyric lines only.
 *
 * Removes: ALL timestamp formats, metadata/caption lines, arrangement/
 * production paragraphs, prompt echoes, markdown formatting, and junk.
 * Returns clean lines preserving original order.
 */

/* ── timestamp patterns ──────────────────────────────────────────── */

/**
 * Catch-all for ANY bracketed content that contains digits and
 * colons/dots/dashes — covers [0.0:2.6], [00:12], [1:23.45],
 * [0:00-0:15], [0.0 : 2.6], [start:end], etc.
 */
const BRACKET_NUMERIC_RE = /\[\s*[\d.:]+\s*(?:[-–]\s*[\d.:]+\s*)?\]/g

/**
 * Lyria structural markers: [[A0]], [[B1]], [[C2]], [[D4]], [[E6]], etc.
 * Single or double brackets with a letter + optional digit.
 */
const LYRIA_MARKER_RE = /\[{1,2}[A-Z]\d*\]{1,2}/gi

/**
 * Parenthesized numeric ranges: (0:00-0:15), (0.0:2.6), (12.5), etc.
 */
const PAREN_NUMERIC_RE = /\(\s*[\d.:]+\s*(?:[-–]\s*[\d.:]+\s*)?\)/g

/**
 * Leading bare timestamps at line start: 0:00, 1:23, 0.0:2.6,
 * 0:00-0:15, or just bare decimals like 12.5
 */
const LEADING_TS_RE = /^\s*\d[\d.:]*(?:\s*[-–]\s*\d[\d.:]*)?\s+/

/**
 * Trailing timestamps at line end: "lyrics here 0:00" or "lyrics [0:12]"
 */
const TRAILING_TS_RE = /\s+\d[\d.:]*(?:\s*[-–]\s*\d[\d.:]*)?$/

/** Strip markdown bold/italic wrappers: **text**, *text*, __text__, _text_ */
const MARKDOWN_RE = /(\*{1,2}|_{1,2})(.+?)\1/g

/** Strip markdown headers: # Title, ## Section */
const MD_HEADER_RE = /^#{1,6}\s+/

/* ── metadata patterns ───────────────────────────────────────────── */

const METADATA_KEYS = [
  "caption", "music", "mosic", "prompt", "style", "notes", "metadata",
  "description", "genre", "bpm", "key", "tempo", "structure", "duration",
  "duration_secs", "good_crop", "bad_crop",
  "produced by", "written by", "copyright", "artist", "title",
  "instrumentation", "arrangement", "production", "vocals?", "instruments?",
  "mood", "tags?", "type", "sound", "mix", "mastering", "overall",
  "summary", "context", "tone", "vibe", "feel", "energy", "theme",
  "lyrics?", "words", "song", "track", "audio", "recording", "sample",
  "beat", "melody", "harmony", "rhythm", "section",
].join("|")

/** Full-line metadata: "Caption: some text" or "**Music:** details" */
const METADATA_RE = new RegExp(
  String.raw`^\s*(?:${METADATA_KEYS})\s*[:=]`,
  "i"
)

/** Inline metadata trailing real content — no word boundary needed since
 *  Lyria can glue metadata right after punctuation: "along...mosic:" */
const INLINE_METADATA_RE = new RegExp(
  String.raw`(?:${METADATA_KEYS})\s*[:=]`,
  "i"
)

/* ── arrangement / prose patterns ────────────────────────────────── */

const ARRANGEMENT_STARTS = [
  /^the (song|track|piece|music|melody|rhythm|beat|vocal|harmony|sound|vibe|production|arrangement|intro|verse|chorus|bridge|outro|hook)/i,
  /^this (song|track|piece|is a|is an|captures|conveys|evokes|features|combines|blends)/i,
  /^(featuring|feat\.?\s|ft\.?\s)/i,
  /^(arrangement|production|instrumental|overall|note|mixed by|mastered by|performed by|composed by|lyrics by|songwriting)/i,
  /^(a (soulful|dreamy|upbeat|melancholic|energetic|gentle|haunting|powerful|catchy|heartfelt|smooth|funky|groovy|dark|bright|warm|cool|chill|laid[- ]?back|driving|anthemic|ethereal|atmospheric|ambient|acoustic|electric|folk|pop|rock|jazz|blues|r&b|hip[- ]?hop|country|latin|reggae|punk|metal|classical|electronic|dance|indie|alt|world|lo[- ]?fi|neo[- ]?soul|trap))/i,
  /^(an? (original|new|fresh|unique|creative|innovative|experimental|modern|contemporary|classic|vintage|retro|nostalgic|timeless|beautiful|stunning|gorgeous|amazing|incredible|fantastic|wonderful|lovely|perfect))/i,
  /^(with (a |its |the |lush |rich |deep |heavy |light |soft |hard |warm |cool |driving |pulsing |soaring |gentle |delicate ))/i,
  /^(it |she |he |they |we |you |there |here |imagine |picture |think of |envision )/i,
  /^(creates? |delivers? |combines? |blends? |layers? |builds? |opens? with |starts? with |ends? with |transitions? )/i,
]

/** Lines that are just punctuation, dashes, asterisks, or whitespace */
const JUNK_RE = /^[\s\-–—*_=.,:;!?#~`'"()\[\]{}|/\\]+$/

/** Stage/performance directions in parens or brackets */
const DIRECTION_RE =
  /^\s*[(\[](instrumental|solo|fade out|fade in|repeat|x\d|ad[- ]?lib|spoken|whispered|softly|loudly|with feeling|guitar solo|drum solo|piano solo|sax solo|synth|strings|brass|horns|break|drop|build|crescendo|decrescendo|rallentando|ritardando|a cappella|acapella|humming|la la la|na na na|ooh|ahh|yeah)[)\]]\s*$/i

/** Lines that are ONLY a number or timestamp with no other content */
const BARE_NUMBER_RE = /^\s*[\d.:–-]+\s*$/

/* ── exports ─────────────────────────────────────────────────────── */

/**
 * Strip markdown formatting so metadata detection works on plain text.
 */
function stripMarkdown(text: string): string {
  return text.replace(MARKDOWN_RE, "$2").replace(MD_HEADER_RE, "")
}

/**
 * Normalize a single line: strip ALL timestamps, markdown, collapse whitespace.
 */
export function normalizeLyricText(line: string): string {
  let text = line
    // Strip Lyria structural markers: [[A0]], [[B1]], etc.
    .replace(LYRIA_MARKER_RE, "")
    // Strip all bracketed numeric content
    .replace(BRACKET_NUMERIC_RE, "")
    // Strip parenthesized numeric content
    .replace(PAREN_NUMERIC_RE, "")
    // Strip leading bare timestamps
    .replace(LEADING_TS_RE, "")

  // Strip markdown bold/italic/headers
  text = stripMarkdown(text)

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim()

  // Strip trailing timestamps
  text = text.replace(TRAILING_TS_RE, "").trim()

  // Trim inline metadata appended after real lyric text
  // e.g. "All along...mosic:" → "All along..."
  const inlineMatch = text.match(INLINE_METADATA_RE)
  if (inlineMatch?.index !== undefined && inlineMatch.index > 0) {
    text = text.slice(0, inlineMatch.index).trim()
  }

  return text
}

export function isMetadataLine(text: string): boolean {
  return METADATA_RE.test(text)
}

export function isArrangementLine(text: string): boolean {
  return ARRANGEMENT_STARTS.some((re) => re.test(text))
}

export function isJunkLine(text: string): boolean {
  return JUNK_RE.test(text) || BARE_NUMBER_RE.test(text)
}

export function isDirectionLine(text: string): boolean {
  return DIRECTION_RE.test(text)
}

/**
 * Prose heuristic: long lines with many words and conjunctions
 * are descriptions, not lyrics.
 */
function isProseLine(text: string): boolean {
  if (text.length < 80) return false
  const wordCount = text.split(/\s+/).length
  if (wordCount < 12) return false
  const proseMarkers = text.match(
    /,|;|\band\b|\bwith\b|\bthe\b|\bthis\b|\bthat\b|\bwhich\b|\bwhile\b|\bthrough\b|\babout\b|\bbetween\b/gi
  )
  return (proseMarkers?.length ?? 0) >= 3
}

export function shouldFilterLyricLine(text: string): boolean {
  return (
    text.length === 0 ||
    isMetadataLine(text) ||
    isArrangementLine(text) ||
    isJunkLine(text) ||
    isDirectionLine(text) ||
    isProseLine(text)
  )
}

export function cleanRawLyrics(raw: string): string {
  const lines = raw.split("\n")
  const cleaned: string[] = []

  for (const line of lines) {
    const text = normalizeLyricText(line)
    if (shouldFilterLyricLine(text)) continue
    cleaned.push(text)
  }

  return cleaned.join("\n")
}
