import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errMsg } from '../api.js'

const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js'
const MODELS_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.body.appendChild(s)
  })
}

export default function CameraCheckIn() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('Starting camera…')
  const [faceCount, setFaceCount] = useState(null)
  const [faceReady, setFaceReady] = useState(false)
  const [modelError, setModelError] = useState('')
  const [loc, setLoc] = useState(null)
  const [result, setResult] = useState('')

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        if (cancelled) return
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setStatus('Camera ready. Loading face detection…')
      } catch {
        setStatus('Camera access was denied or unavailable. Use normal web check-in instead.')
        return
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => setLoc(null)
        )
      }
      try {
        await loadScript(FACE_API_CDN)
        const faceapi = window.faceapi
        if (!faceapi) throw new Error('face-api did not load')
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL)
        if (cancelled) return
        setFaceReady(true)
        setStatus('Face detection ready. Point the camera at one face.')
        const detect = async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return
          try {
            const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
            setFaceCount(detections.length)
          } catch { /* keep last count */ }
        }
        const id = setInterval(detect, 1500)
        return () => clearInterval(id)
      } catch {
        if (!cancelled) {
          setModelError('Face-detection models could not be loaded from the CDN, so no face count is available. This page will not guess a face count — please use normal web check-in instead.')
          setStatus('Face detection unavailable.')
        }
      }
    }
    start()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const submit = async () => {
    if (faceCount === null) { setResult('No face count is available yet. Wait for detection, or use normal web check-in.'); return }
    if (!loc) { setResult('Location is not available yet. Allow location access, or use normal web check-in.'); return }
    try {
      const { data } = await api.post('/attendance/camera-check-in', { faceCount, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy })
      setResult(data.message || 'Camera check-in accepted.')
    } catch (e) { setResult(errMsg(e, 'Camera check-in was rejected by the server.')) }
  }

  return (
    <div>
      <h1>Camera check-in</h1>
      <div className="card">
        <p>{status}</p>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', maxWidth: 640, borderRadius: 12, background: '#000' }} />
        <p>Faces detected: {faceCount === null ? '—' : faceCount} {faceReady ? '' : '(detection not ready)'}</p>
        <p>Location: {loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (±${Math.round(loc.accuracy)}m)` : 'Waiting for location…'}</p>
        {modelError && <div className="error">{modelError}<br /><Link to="/attendance">Go to normal web check-in →</Link></div>}
        {result && <p>{result}</p>}
        <div className="row">
          <button className="btn primary" onClick={submit} disabled={!faceReady || faceCount === null || !loc}>Submit camera check-in</button>
          <Link className="btn" to="/attendance">Normal web check-in</Link>
        </div>
        <p className="muted">If the face model fails to load, no face count is faked — use the normal check-in link above.</p>
      </div>
    </div>
  )
}
