"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const BAR_COUNT = 128

/**
 * Decodes an audio source URL into a simplified amplitude array (0–1)
 * with `BAR_COUNT` samples, suitable for a static waveform timeline.
 */
export function useWaveformData(src: string) {
  const [bars, setBars] = useState<number[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const ctx = new AudioContext()

    ;(async () => {
      try {
        const res = await fetch(src)
        const buf = await res.arrayBuffer()
        const audio = await ctx.decodeAudioData(buf)
        if (cancelled) return

        const raw = audio.getChannelData(0)
        const step = Math.floor(raw.length / BAR_COUNT)
        const samples: number[] = []

        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0
          const offset = i * step
          for (let j = 0; j < step; j++) {
            sum += Math.abs(raw[offset + j])
          }
          samples.push(sum / step)
        }

        // Normalize to 0–1
        const max = Math.max(...samples, 0.001)
        setBars(samples.map((s) => s / max))
      } catch {
        setBars(null)
      } finally {
        ctx.close().catch(() => {})
      }
    })()

    return () => {
      cancelled = true
      ctx.close().catch(() => {})
    }
  }, [src])

  return bars
}

/**
 * Connects an HTMLAudioElement to an AnalyserNode and runs a
 * requestAnimationFrame loop, returning live frequency + time-domain data.
 *
 * The AudioContext and MediaElementSource are created once per element
 * and reused across play/pause cycles.
 */
export function useAnalyser(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  active: boolean
) {
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const rafRef = useRef<number>(0)

  const [frequencyData, setFrequencyData] = useState<Uint8Array>(
    () => new Uint8Array(64)
  )
  const [timeDomainData, setTimeDomainData] = useState<Uint8Array>(
    () => new Uint8Array(128)
  )

  useEffect(() => {
    const audioEl = audioRef.current
    if (!active || !audioEl) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    // Set up AudioContext + AnalyserNode once per audio element
    if (!ctxRef.current || !analyserRef.current) {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8

      const source = ctx.createMediaElementSource(audioEl)
      source.connect(analyser)
      analyser.connect(ctx.destination)

      ctxRef.current = ctx
      analyserRef.current = analyser
      sourceRef.current = source
    }

    const analyser = analyserRef.current

    // Resume context if suspended (autoplay policy)
    ctxRef.current?.resume().catch(() => {})

    const freq = new Uint8Array(analyser.frequencyBinCount)
    const time = new Uint8Array(analyser.fftSize)

    const tick = () => {
      analyser.getByteFrequencyData(freq)
      analyser.getByteTimeDomainData(time)
      setFrequencyData(new Uint8Array(freq))
      setTimeDomainData(new Uint8Array(time))
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [active, audioRef])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { frequencyData, timeDomainData }
}
