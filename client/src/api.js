import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hcm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('hcm_token')
      localStorage.removeItem('hcm_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const errMsg = (e, fallback = 'Something went wrong') =>
  e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
