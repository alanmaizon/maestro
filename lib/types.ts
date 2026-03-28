export type TimingSource = "real" | "synthetic" | "none"

/** Parsed lyric item — either a section header or a singable line. */
export type ParsedLyricItem =
  | {
      id: string
      type: "section"
      text: string
      normalizedText: string
      originalIndex: number
    }
  | {
      id: string
      type: "line"
      text: string
      normalizedText: string
      originalIndex: number
      start?: number
      end?: number
      confidence?: number
      timingSource: TimingSource
    }

export type LyricMode = "timed" | "untimed"

export interface LyricModeInfo {
  mode: LyricMode
  reason: string
  syncableCount: number
  totalLines: number
  warnings: string[]
}

export interface ActiveLineResult {
  activeLineId: string | null
  reason: string
  previousLineId: string | null
  nextLineId: string | null
}

/** A single aligned line from the alignment service. */
export interface SyncedLine {
  id: string
  text: string
  start: number
  end: number
  confidence: number
}

/** Lyric sync result — returned by the API alongside the song. */
export interface LyricSync {
  mode: "synced" | "unsynced"
  reason: string
  lines: SyncedLine[]
  warnings: string[]
}

export interface GeneratedResult {
  title: string
  promptUsed: string
  lyricsOrStructure: string
  lyricSync?: LyricSync
  audioBase64: string
  audioMimeType: string
}

export interface GenerateRequest {
  prompt: string
  mood: string | null
  length: string | null
  vocals: boolean
}
