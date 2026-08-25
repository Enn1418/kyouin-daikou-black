import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSpeechInputOptions {
  /** 確定した発話が届くたびに呼ばれる。呼び出し側で入力欄に足し込む。 */
  onFinalResult: (text: string) => void
  lang?: string
}

interface UseSpeechInput {
  /** ブラウザが音声認識に対応しているか。非対応ならボタン自体を出さない。 */
  isSupported: boolean
  isListening: boolean
  /** 認識中のテキスト（未確定）。ボタンの下などに薄く表示する用。 */
  interimText: string
  toggle: () => void
}

/**
 * ブラウザ標準の Web Speech API を薄くラップする。
 *
 * サーバや追加の API キーを介さず、ブラウザのマイクと音声認識エンジンを直接使う
 * （Chrome/Edge のみ対応。Windows + Chrome/Edge が前提の本アプリと合う）。
 * 音声はブラウザの実装を通じてネット経由で認識されるため、機密情報の読み上げは想定しない。
 */
export function useSpeechInput({ onFinalResult, lang = 'ja-JP' }: UseSpeechInputOptions): UseSpeechInput {
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // onFinalResult をクロージャに閉じ込めず、常に最新を呼べるようにする
  const onFinalResultRef = useRef(onFinalResult)
  onFinalResultRef.current = onFinalResult

  const SpeechRecognitionCtor =
    typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined
  const isSupported = !!SpeechRecognitionCtor

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  // アンマウント時に認識を止める（画面を離れてもマイクが動き続けないように）
  useEffect(() => stop, [stop])

  const toggle = useCallback(() => {
    if (isListening) {
      stop()
      return
    }
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalText = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      if (finalText) onFinalResultRef.current(finalText)
      setInterimText(interim)
    }
    recognition.onerror = () => {
      setIsListening(false)
      setInterimText('')
      recognitionRef.current = null
    }
    recognition.onend = () => {
      setIsListening(false)
      setInterimText('')
      recognitionRef.current = null
    }

    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }, [isListening, lang, stop, SpeechRecognitionCtor])

  return { isSupported, isListening, interimText, toggle }
}
